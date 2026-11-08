import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/playbook-ai/db";
import { DEFAULT_SECTIONS, LIMITS, type SopSection } from "@/lib/products/playbook-ai/constants";
import { currentCompanyId } from "@/lib/platform/tenancy/context";

/**
 * Reusable SOP templates. A template is only a section layout (+ guidance
 * text shown in the editor) — the document body itself is always the SOP's own
 * data, so editing a template never rewrites existing SOPs. System templates
 * ship for the sixteen department families in the SOP spec and are fully
 * editable by anyone with MANAGE_TEMPLATES.
 */

export interface TemplateSection {
  key: string;
  title: string;
  guidance: string;
}

export interface SopTemplate extends AuditFields {
  _id: string;
  name: string;
  description: string;
  /** Department codes this template is suggested for (empty = general purpose). */
  departmentCodes: string[];
  sections: TemplateSection[];
  isSystem: boolean;
  active: boolean;
}

type Extra = [key: string, title: string, guidance: string];

/** `extras` are inserted before "Validation"; `drop` removes default sections that do not fit. */
const FAMILIES: { name: string; codes: string[]; description: string; extras: Extra[]; drop?: string[] }[] = [
  { name: "HR Process", codes: ["HR"], description: "Onboarding, leave, exits and other people processes.", extras: [["employee_data_privacy", "Employee Data Privacy", "What personal data is handled and how it is protected."], ["forms_templates", "Forms & Templates", "Forms, letters and templates used."]] },
  { name: "Recruitment", codes: ["REC"], description: "Sourcing, screening, interviewing and offers.", extras: [["pipeline_stages", "Candidate Pipeline Stages", "Each stage, entry/exit criteria and owner."], ["evaluation_criteria", "Interview & Evaluation Criteria", "How candidates are assessed."]] },
  { name: "Finance", codes: ["FIN", "ACC"], description: "Payments, billing, reconciliation and reporting.", extras: [["authorization_limits", "Authorization Limits", "Who may authorise which amounts."], ["records_reconciliation", "Reconciliation & Records", "Records to keep and how they are reconciled."]] },
  { name: "Sales", codes: ["SAL", "BD"], description: "Lead handling, proposals and deal closure.", extras: [["qualification_criteria", "Lead Qualification Criteria", "What makes a lead worth pursuing."], ["crm_updates", "CRM Updates", "What must be logged and when."]] },
  { name: "Marketing", codes: ["MKT"], description: "Campaigns, content and brand.", extras: [["brand_guidelines", "Brand Guidelines", "Tone, visuals and mandatory brand rules."], ["channels_metrics", "Channels & Metrics", "Channels used and how success is measured."]] },
  { name: "Engineering", codes: ["ENG", "FE", "BE", "MOB", "PRD", "AI", "CLD"], description: "Development, code review and release procedures.", extras: [["environments", "Environments", "Dev / staging / production details."], ["code_standards", "Code & Review Standards", "Standards a change must meet."], ["rollback", "Rollback Plan", "How to undo the change safely."]] },
  { name: "QA", codes: ["QA"], description: "Test planning, execution and defect handling.", extras: [["test_scope", "Test Scope & Environments", "What is and is not tested, and where."], ["defect_handling", "Defect Severity & Reporting", "Severity scale and how defects are logged."]] },
  { name: "DevOps", codes: ["DEV", "IT"], description: "Deployments, infrastructure and incident response.", extras: [["infra_access", "Infrastructure Access", "Access needed and how it is granted."], ["monitoring", "Monitoring & Alerts", "Dashboards, alerts and on-call expectations."], ["rollback", "Rollback Plan", "How to undo the change safely."]] },
  { name: "Security", codes: ["SEC"], description: "Access control, incident handling and hardening.", extras: [["threats_risks", "Threat & Risk Considerations", "Threats this procedure defends against."], ["incident_reporting", "Incident Reporting", "How and to whom incidents are reported."]] },
  { name: "Project Management", codes: ["PM"], description: "Planning, delivery tracking and reporting.", extras: [["stakeholders", "Stakeholders", "Who is involved and their role."], ["milestones", "Milestones & Deliverables", "Key milestones and expected deliverables."], ["risk_register", "Risk Register", "Known risks and mitigations."]] },
  { name: "Procurement", codes: ["PRC"], description: "Vendor onboarding, purchasing and receiving.", extras: [["vendor_selection", "Vendor Selection Criteria", "How vendors are shortlisted."], ["po_handling", "Purchase Order Handling", "Raising, tracking and closing POs."]] },
  { name: "Customer Support", codes: ["CS"], description: "Ticket handling, escalation and communication.", extras: [["sla_targets", "SLA Targets", "Response and resolution targets."], ["comm_templates", "Communication Templates", "Standard replies and tone."]] },
  { name: "Operations", codes: ["OPS", "MGT"], description: "Recurring operational procedures.", extras: [["service_levels", "Service Levels", "Expected service levels."], ["continuity", "Business Continuity", "What to do when the normal flow is unavailable."]] },
  { name: "Administration", codes: ["ADM", "FAC"], description: "Office, facilities and records administration.", extras: [["facilities_vendors", "Facilities & Vendors", "Facilities involved and vendor contacts."], ["records", "Records Handling", "How records are stored and retained."]], drop: ["required_tools"] },
  { name: "Training", codes: ["TRN", "Cohort AI", "LMS"], description: "Training delivery and learner assessment.", extras: [["learning_objectives", "Learning Objectives", "What learners should be able to do afterwards."], ["assessment", "Assessment & Certification", "How learning is assessed and certified."]] },
  { name: "Compliance", codes: ["CMP", "LEG", "IA", "RSK"], description: "Regulatory, legal, audit and risk procedures.", extras: [["regulatory_refs", "Regulatory References", "Laws, standards and clauses this SOP satisfies."], ["evidence", "Evidence & Audit Trail", "Evidence to retain for audit."], ["reporting", "Reporting Obligations", "Reports due, to whom and when."]] },
];

function buildSections(extras: Extra[], drop: string[] = []): TemplateSection[] {
  const base = DEFAULT_SECTIONS.filter((s) => !drop.includes(s.key)).map(({ key, title, guidance }) => ({ key, title, guidance }));
  const extraSections = extras.map(([key, title, guidance]) => ({ key, title, guidance }));
  const at = base.findIndex((s) => s.key === "validation");
  return at === -1 ? [...base, ...extraSections] : [...base.slice(0, at), ...extraSections, ...base.slice(at)];
}

async function col() {
  const db = await getDb();
  return db.collection<SopTemplate>(COLLECTIONS.templates);
}

const seeding = new Map<string, Promise<void>>();

/** Inserts the system templates once (when the collection is empty). */
export async function seedSystemTemplates(): Promise<void> {
  const companyId = await currentCompanyId();
  const inFlight = seeding.get(companyId);
  if (inFlight) return inFlight;
  const run = (async () => {
    const c = await col();
    if ((await c.countDocuments({})) > 0) return;
    const docs: SopTemplate[] = [
      {
        _id: newId(),
        name: "General SOP",
        description: "The standard section set — a starting point for any department.",
        departmentCodes: [],
        sections: buildSections([]),
        isSystem: true,
        active: true,
        ...createStamp(null),
      },
      ...FAMILIES.map((f) => ({
        _id: newId(),
        name: f.name,
        description: f.description,
        departmentCodes: f.codes,
        sections: buildSections(f.extras, f.drop),
        isSystem: true,
        active: true,
        ...createStamp(null),
      })),
    ];
    await c.insertMany(docs);
  })().finally(() => {
    seeding.delete(companyId);
  });
  seeding.set(companyId, run);
  return run;
}

export async function listTemplates(opts: { includeInactive?: boolean } = {}): Promise<SopTemplate[]> {
  const c = await col();
  return c.find({ ...notDeleted, ...(opts.includeInactive ? {} : { active: true }) }).sort({ isSystem: -1, name: 1 }).toArray();
}

export async function getTemplate(id: string): Promise<SopTemplate | null> {
  return (await col()).findOne({ _id: id, ...notDeleted });
}

function slugKey(title: string, taken: Set<string>): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 36) || "section";
  let key = base;
  let i = 2;
  while (taken.has(key)) key = `${base}_${i++}`;
  taken.add(key);
  return key;
}

/** Validates + normalises the editable parts of a template. */
export function cleanTemplateInput(input: {
  name?: unknown;
  description?: unknown;
  departmentCodes?: unknown;
  sections?: unknown;
}): { ok: true; value: { name: string; description: string; departmentCodes: string[]; sections: TemplateSection[] } } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 100) : "";
  if (!name) return { ok: false, error: "Template name is required." };
  const description = typeof input.description === "string" ? input.description.trim().slice(0, 400) : "";
  const departmentCodes = Array.isArray(input.departmentCodes)
    ? Array.from(new Set(input.departmentCodes.filter((c): c is string => typeof c === "string" && /^[A-Z0-9]{1,8}$/.test(c))))
    : [];
  if (!Array.isArray(input.sections) || input.sections.length === 0) return { ok: false, error: "A template needs at least one section." };
  if (input.sections.length > LIMITS.sections) return { ok: false, error: `At most ${LIMITS.sections} sections.` };
  const taken = new Set<string>();
  const sections: TemplateSection[] = [];
  for (const s of input.sections) {
    const o = (s ?? {}) as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim().slice(0, 120) : "";
    if (!title) return { ok: false, error: "Every section needs a title." };
    const wanted = typeof o.key === "string" && /^[a-z0-9_]{1,40}$/.test(o.key) && !taken.has(o.key) ? o.key : null;
    if (wanted) taken.add(wanted);
    sections.push({
      key: wanted ?? slugKey(title, taken),
      title,
      guidance: typeof o.guidance === "string" ? o.guidance.trim().slice(0, 500) : "",
    });
  }
  return { ok: true, value: { name, description, departmentCodes, sections } };
}

export async function createTemplate(input: Parameters<typeof cleanTemplateInput>[0], actorId: string) {
  const parsed = cleanTemplateInput(input);
  if (!parsed.ok) return parsed;
  const doc: SopTemplate = { _id: newId(), ...parsed.value, isSystem: false, active: true, ...createStamp(actorId) };
  await (await col()).insertOne(doc);
  return { ok: true as const, doc };
}

export async function updateTemplate(id: string, input: Parameters<typeof cleanTemplateInput>[0] & { active?: boolean }, actorId: string) {
  const parsed = cleanTemplateInput(input);
  if (!parsed.ok) return parsed;
  const doc = await (await col()).findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...parsed.value, ...(input.active !== undefined ? { active: !!input.active } : {}), ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
  return doc ? { ok: true as const, doc } : { ok: false as const, error: "Template not found." };
}

export async function duplicateTemplate(id: string, actorId: string) {
  const src = await getTemplate(id);
  if (!src) return { ok: false as const, error: "Template not found." };
  const doc: SopTemplate = {
    _id: newId(),
    name: `${src.name} (copy)`.slice(0, 100),
    description: src.description,
    departmentCodes: src.departmentCodes,
    sections: src.sections,
    isSystem: false,
    active: true,
    ...createStamp(actorId),
  };
  await (await col()).insertOne(doc);
  return { ok: true as const, doc };
}

/** System templates can only be deactivated; custom ones can be deleted. */
export async function deleteTemplate(id: string, actorId: string): Promise<{ ok: boolean; error?: string }> {
  const c = await col();
  const t = await c.findOne({ _id: id, ...notDeleted });
  if (!t) return { ok: false, error: "Template not found." };
  if (t.isSystem) return { ok: false, error: "System templates can be deactivated but not deleted." };
  await c.updateOne({ _id: id }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: true };
}

/** A fresh, empty section list for a new SOP built from a template. */
export function sectionsFromTemplate(t: Pick<SopTemplate, "sections">): SopSection[] {
  return t.sections.map((s) => ({
    id: newId(),
    key: s.key,
    title: s.title,
    blocks: [{ id: newId(), type: "paragraph" as const, text: "" }],
  }));
}
