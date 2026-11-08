import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCompanyDetails, formatCompanyAddress } from "@/lib/products/talentos/company";
import { EMPLOYEES_COLLECTION, getEmployee, employeeFullName, type Employee } from "@/lib/products/talentos/employees";
import { DEPARTMENTS_COLLECTION, DESIGNATIONS_COLLECTION } from "@/lib/products/talentos/departments";
import { getClient } from "@/lib/products/sprintos/clients";
import { getProject } from "@/lib/products/sprintos/projects";
import { getVendor } from "@/lib/products/spendiq/vendors";
import { getApplication } from "@/lib/career-applications";
import { canManageEmployees } from "@/lib/hrms-roles";
import { canManageClients, canManageProjects } from "@/lib/pms-roles";
import { canManageProcurement } from "@/lib/prms-roles";
import { playbookCan } from "@/lib/playbook-roles";
import { canonicalJson } from "@/lib/products/playbook-ai/doc/canonical";
import { sha256Hex } from "@/lib/products/playbook-ai/doc/hash";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import type { VarLists, VarValues } from "@/lib/products/playbook-ai/doc/variables";
import type { DocLinks, InputValues, PbActor, VariableSnapshot } from "@/lib/products/playbook-ai/documents-types";
import { DOC_STATUS_META, type DocStatus } from "@/lib/products/playbook-ai/status";
import { dateValues, snapshotKeys, type CustomVariableDef } from "@/lib/products/playbook-ai/variables-registry";
import { listCustomVariables } from "@/lib/products/playbook-ai/variables-custom";

/**
 * Reads the real values behind the variable registry. Records are LINKED, not copied: a draft always shows live data, and issuing freezes
 * the used values into the version's `VariableSnapshot`. Every source is read only if the actor may read that product's records
 * (TalentOS, SprintOS, SpendIQ and recruitment permissions, Director overrides included); a source the actor cannot read is reported as
 * denied and contributes no values, so a document author cannot use Playbook to read what they could not open in the product itself.
 */

export interface DocContext {
  title: string;
  docNumber: string | null;
  /** The version number this resolution is for (the next version when issuing). */
  version: number | null;
  status: DocStatus;
  issuedAt: Date | null;
  authorId: string | null;
}

export interface LoadedValues {
  values: VarValues;
  sources: { kind: string; id: string; label: string }[];
  /** Namespaces the actor is not allowed to read. */
  denied: string[];
  custom: CustomVariableDef[];
}

const s = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
const oneLine = (...parts: (string | null | undefined)[]) => parts.map((p) => (p ?? "").trim()).filter(Boolean).join(", ");

function put(values: VarValues, ns: string, field: string, v: unknown): void {
  if (typeof v === "number" && Number.isFinite(v)) values[`${ns}.${field}`] = v;
  else if (typeof v === "boolean") values[`${ns}.${field}`] = String(v);
  else { const t = s(v); if (t !== undefined) values[`${ns}.${field}`] = t; }
}

/** Can the actor read this employee's record? HR (or an override), or the employee themself. */
function canReadEmployee(actor: PbActor, e: Employee): boolean {
  return canManageEmployees(actor) || (e.adminUserId !== null && e.adminUserId === actor.id);
}

async function nameOf(collection: string, id: string | null | undefined, field: string): Promise<string | undefined> {
  if (!id) return undefined;
  const db = await getDb();
  const d = await db.collection<Record<string, unknown>>(collection).findOne({ _id: id } as never);
  return d ? s(d[field]) : undefined;
}

async function employeeValues(actor: PbActor, e: Employee, ns: "employee" | "author"): Promise<VarValues> {
  const v: VarValues = {};
  if (ns === "employee") {
    put(v, ns, "name", employeeFullName(e));
    put(v, ns, "first_name", e.firstName);
    put(v, ns, "last_name", e.lastName);
    put(v, ns, "work_email", e.workEmail);
    put(v, ns, "personal_email", e.personal?.personalEmail);
    put(v, ns, "phone", e.personal?.phone);
    put(v, ns, "employment_type", e.professional?.employmentType);
    put(v, ns, "work_location", e.professional?.workLocation);
    put(v, ns, "joining_date", e.professional?.joiningDate);
    put(v, ns, "probation_end_date", e.professional?.probationEndDate);
    put(v, ns, "relieving_date", e.professional?.relievingDate);
    put(v, ns, "address", oneLine(e.personal?.addressLine, e.personal?.city, e.personal?.state, e.personal?.postalCode));
    const mgrId = e.professional?.reportingManagerId;
    if (mgrId) {
      const mgr = await getEmployee(mgrId);
      if (mgr) put(v, ns, "reporting_manager", employeeFullName(mgr));
    }
  }
  put(v, ns, "code", e.employeeCode);
  put(v, ns, "designation", await nameOf(DESIGNATIONS_COLLECTION, e.professional?.designationId, "title"));
  put(v, ns, "department", await nameOf(DEPARTMENTS_COLLECTION, e.professional?.departmentId, "name"));
  if (ns === "author") put(v, "author", "employee_code", e.employeeCode);
  return v;
}

async function authorValues(actor: PbActor): Promise<VarValues> {
  const v: VarValues = {};
  let name = actor.name, email = actor.email;
  if ((!name || !email) && ObjectId.isValid(actor.id)) {
    const db = await getDb();
    const u = await db.collection<{ _id: ObjectId; name?: string; email?: string }>("admin_users").findOne({ _id: new ObjectId(actor.id) });
    name = name || u?.name || null;
    email = email || u?.email || null;
  }
  put(v, "author", "name", name);
  put(v, "author", "email", email);
  const db = await getDb();
  const emp = await db.collection<Employee>(EMPLOYEES_COLLECTION).findOne({ adminUserId: actor.id, deletedAt: null } as never);
  if (emp) {
    const ev = await employeeValues(actor, emp, "author");
    put(v, "author", "designation", ev["author.designation"]);
    put(v, "author", "department", ev["author.department"]);
    put(v, "author", "employee_code", emp.employeeCode);
  }
  return v;
}

export type LinkKind = "employee" | "client" | "vendor" | "candidate" | "project";
const LINK_FIELDS: Record<keyof DocLinks, LinkKind> = { employeeId: "employee", clientId: "client", vendorId: "vendor", candidateId: "candidate", projectId: "project" };
const LINK_NAMES: Record<LinkKind, string> = { employee: "employee", client: "client", vendor: "vendor", candidate: "candidate", project: "project" };

/**
 * Checks, at the moment of linking, that the record exists and the person may read it. Issue later reads the link as trusted, so this is
 * where access to the record is enforced; relinking runs it again, unlinking needs nothing.
 */
export async function checkLink(actor: PbActor, kind: LinkKind, id: string): Promise<"ok" | "not_found" | "no_access"> {
  switch (kind) {
    case "employee": {
      const e = await getEmployee(id);
      return !e ? "not_found" : canReadEmployee(actor, e) ? "ok" : "no_access";
    }
    case "client": {
      const c = await getClient(id);
      return !c ? "not_found" : canManageClients(actor) ? "ok" : "no_access";
    }
    case "vendor": {
      const v = await getVendor(id);
      return !v ? "not_found" : canManageProcurement(actor) ? "ok" : "no_access";
    }
    case "candidate": {
      const a = await getApplication(id);
      return !a ? "not_found" : canManageEmployees(actor) ? "ok" : "no_access";
    }
    case "project": {
      const p = await getProject(id);
      return !p ? "not_found" : canManageProjects(actor) ? "ok" : "no_access";
    }
  }
}

/** Verifies the links that are new or changed compared with `before`. Returns the first problem as a sentence, or null. */
export async function checkLinkChanges(actor: PbActor, before: DocLinks, after: DocLinks): Promise<string | null> {
  for (const field of Object.keys(LINK_FIELDS) as (keyof DocLinks)[]) {
    const next = after[field];
    if (!next || next === before[field]) continue;
    const kind = LINK_FIELDS[field];
    const r = await checkLink(actor, kind, next);
    if (r === "not_found") return `That ${LINK_NAMES[kind]} does not exist.`;
    if (r === "no_access") return `You are not allowed to use ${LINK_NAMES[kind]} records in documents.`;
  }
  return null;
}

export interface LoadInput {
  doc: DocContext;
  links: DocLinks;
  inputs: InputValues;
  now?: Date;
  /** Skip permission checks (system use, e.g. the issue step re-reading what the author already previewed). Never set from a request. */
  trusted?: boolean;
}

/**
 * Collects every variable value for a document. `inputs` supply `input.*` and `party.*`; custom variables come from `pb_variables`;
 * `company.*`, `date.*` and `doc.*` need no link. The actor needs the Playbook EDIT, APPROVE or ISSUE capability to read source records.
 */
export async function loadVariableValues(actor: PbActor, input: LoadInput): Promise<LoadedValues> {
  const values: VarValues = {};
  const sources: LoadedValues["sources"] = [];
  const denied: string[] = [];
  const now = input.now ?? new Date();
  const mayRead = input.trusted || playbookCan(actor, "EDIT") || playbookCan(actor, "APPROVE") || playbookCan(actor, "ISSUE");
  const deny = (ns: string) => { if (!denied.includes(ns)) denied.push(ns); };

  // Free-form: the document's own form values.
  for (const [k, v] of Object.entries(input.inputs)) {
    if (/^(input|party)\.[a-z]/.test(k)) values[k] = v;
    else if (/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/.test(k)) values[k.includes(".") ? k : `input.${k}`] = v;
  }

  Object.assign(values, dateValues(now));

  // doc.*
  put(values, "doc", "title", input.doc.title);
  put(values, "doc", "number", input.doc.docNumber);
  if (input.doc.version !== null) values["doc.version"] = input.doc.version;
  put(values, "doc", "status", DOC_STATUS_META[input.doc.status].label);
  if (input.doc.issuedAt) put(values, "doc", "issue_date", dateValues(input.doc.issuedAt)["date.today"]);

  if (!mayRead) {
    for (const ns of ["company", "author", "employee", "client", "vendor", "candidate", "project"]) deny(ns);
  } else {
    // company.*
    const c = await getCompanyDetails();
    put(values, "company", "name", c.name);
    put(values, "company", "legal_name", c.legalName || c.name);
    put(values, "company", "address", formatCompanyAddress(c));
    put(values, "company", "address_line1", c.addressLine1);
    put(values, "company", "address_line2", c.addressLine2);
    put(values, "company", "city", c.city);
    put(values, "company", "state", c.state);
    put(values, "company", "postal_code", c.postalCode);
    put(values, "company", "country", c.country);
    put(values, "company", "email", c.email);
    put(values, "company", "phone", c.phone);
    put(values, "company", "website", c.website);
    put(values, "company", "pan", c.pan);
    put(values, "company", "gstin", c.gstin);
    put(values, "company", "cin", c.cin);
    put(values, "company", "tan", c.tan);
    put(values, "company", "pf_code", c.pfEstablishmentCode);
    put(values, "company", "esi_code", c.esiEstablishmentCode);
    put(values, "company", "pt_registration", c.ptRegistration);
    put(values, "company", "signatory_name", c.signatoryName);
    put(values, "company", "signatory_designation", c.signatoryDesignation);
    sources.push({ kind: "company", id: "org", label: c.legalName || c.name });

    Object.assign(values, await authorValues(actor));

    const { employeeId, clientId, vendorId, candidateId, projectId } = input.links;
    if (employeeId) {
      const e = await getEmployee(employeeId);
      if (e && (input.trusted || canReadEmployee(actor, e))) {
        Object.assign(values, await employeeValues(actor, e, "employee"));
        sources.push({ kind: "employee", id: e._id, label: employeeFullName(e) });
      } else deny("employee");
    }
    if (clientId) {
      const cl = await getClient(clientId);
      if (cl && (input.trusted || canManageClients(actor))) {
        put(values, "client", "code", cl.clientCode);
        put(values, "client", "name", cl.companyName);
        put(values, "client", "contact_name", cl.primaryContact?.name);
        put(values, "client", "contact_designation", cl.primaryContact?.designation);
        put(values, "client", "contact_email", cl.primaryContact?.email);
        put(values, "client", "contact_phone", cl.primaryContact?.phone);
        put(values, "client", "address", oneLine(cl.billing?.addressLine, cl.billing?.city, cl.billing?.state, cl.billing?.country));
        put(values, "client", "state", cl.billing?.state);
        put(values, "client", "gstin", cl.billing?.gstin);
        put(values, "client", "currency", cl.billing?.currency);
        put(values, "client", "payment_terms_days", cl.billing?.paymentTermsDays);
        sources.push({ kind: "client", id: cl._id, label: cl.companyName });
      } else deny("client");
    }
    if (vendorId) {
      const vn = await getVendor(vendorId);
      if (vn && (input.trusted || canManageProcurement(actor))) {
        put(values, "vendor", "code", vn.vendorCode);
        put(values, "vendor", "name", vn.companyName);
        put(values, "vendor", "contact_person", vn.contactPerson);
        put(values, "vendor", "email", vn.email);
        put(values, "vendor", "phone", vn.phone);
        put(values, "vendor", "address", oneLine(vn.addressLine, vn.city, vn.state, vn.pincode));
        put(values, "vendor", "state", vn.state);
        put(values, "vendor", "gstin", vn.gstin);
        put(values, "vendor", "pan", vn.pan);
        put(values, "vendor", "payment_terms", vn.paymentTerms);
        put(values, "vendor", "currency", vn.currency);
        sources.push({ kind: "vendor", id: vn._id, label: vn.companyName });
      } else deny("vendor");
    }
    if (candidateId) {
      const a = await getApplication(candidateId);
      if (a && (input.trusted || canManageEmployees(actor))) {
        put(values, "candidate", "name", a.name);
        put(values, "candidate", "email", a.email);
        put(values, "candidate", "phone", a.phone);
        put(values, "candidate", "position", a.positionTitle);
        put(values, "candidate", "applied_on", dateValues(new Date(a.createdAt))["date.today"]);
        sources.push({ kind: "candidate", id: String(a._id), label: a.name });
      } else deny("candidate");
    }
    if (projectId) {
      const p = await getProject(projectId);
      if (p && (input.trusted || canManageProjects(actor))) {
        put(values, "project", "code", p.projectCode);
        put(values, "project", "name", p.name);
        put(values, "project", "description", p.description);
        put(values, "project", "start_date", p.startDate);
        put(values, "project", "end_date", p.endDate);
        put(values, "project", "budget", p.estimatedBudget);
        put(values, "project", "currency", p.currency);
        if (p.projectManagerId) {
          const m = await getEmployee(p.projectManagerId);
          if (m) put(values, "project", "manager", employeeFullName(m));
        }
        const cl = p.clientId ? await getClient(p.clientId) : null;
        if (cl) put(values, "project", "client_name", cl.companyName);
        sources.push({ kind: "project", id: p._id, label: p.name });
      } else deny("project");
    }
  }

  // custom.* are company-level definitions every author may use.
  const custom = await listCustomVariables();
  for (const cv of custom) values[cv.key] = cv.value;

  return { values, sources, denied, custom };
}

/** Freezes the values a document uses into a snapshot. Only the used keys are stored (data minimisation). */
export function buildVariableSnapshot(doc: PBDoc, loaded: LoadedValues, lists: VarLists, now: Date = new Date()): VariableSnapshot {
  const values: VariableSnapshot["values"] = {};
  for (const key of snapshotKeys(doc)) {
    const v = loaded.values[key];
    if (v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "")) values[key] = v as string | number | boolean;
  }
  const snap = { takenAt: now.toISOString(), values, lists: structuredClone(lists), sources: loaded.sources };
  return { ...snap, sha256: sha256Hex(canonicalJson({ values, lists })) };
}
