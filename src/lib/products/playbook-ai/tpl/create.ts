import "server-only";
import { createDocument } from "@/lib/products/playbook-ai/documents";
import type { DocLinks, InputValues, PbActor, PbDocumentRecord, PbResult } from "@/lib/products/playbook-ai/documents-types";
import { buildTemplateDoc } from "@/lib/products/playbook-ai/catalogue/validate";
import type { PickerNamespace, TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { PICKER_NAMESPACES } from "@/lib/products/playbook-ai/catalogue/types";
import { checkLink, loadVariableValues } from "@/lib/products/playbook-ai/variables-adapters";
import { playbookCan } from "@/lib/playbook-roles";
import { applyBindings, pendingAiSections, validateInputValues, type RawInputs } from "@/lib/products/playbook-ai/tpl/inputs";
import { resolveTemplate } from "@/lib/products/playbook-ai/tpl/store";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";

/**
 * Creating a document from a template. Server-only.
 *
 *  1. Pick the template: the company's published version for the type (or a named company template), otherwise the platform starter.
 *  2. Check the inputs the user typed against the template's form (typed fields, required, ranges, visibility rules).
 *  3. Link the picked records (employee, client, vendor, candidate, project) with the same access check as the editor.
 *  4. Auto-fill empty inputs from their bindings (company profile, linked record, dates).
 *  5. Build the PBDoc skeleton from the template's sections and store the document with the template version it used.
 *
 * Sections the AI writes (`ai` and `hybrid`) are left as their skeleton and reported in `pendingAi`. The AI generation step (A11) plugs in
 * through `generate`: it is called once per pending section with the document and the facts, and returns the section's new blocks; until
 * then the section keeps its placeholders, so nothing is invented.
 */

const LINK_FIELD: Record<Exclude<PickerNamespace, "party">, keyof DocLinks> = {
  employee: "employeeId", candidate: "candidateId", client: "clientId", vendor: "vendorId", project: "projectId",
};

/** The AI hook (A11). Receives the section and everything it may use; returns replacement blocks, or null to leave the skeleton. */
export type SectionGenerator = (ctx: { doc: PBDoc; def: TemplateDef; sectionKey: string; inputs: InputValues; values: Record<string, string | number | boolean | null | undefined> }) => Promise<unknown[] | null>;

export interface CreateFromTemplateInput {
  typeId?: string;
  templateId?: string;
  title?: string;
  /** What the user typed into the template's form, by input key. */
  inputs?: RawInputs;
  generate?: SectionGenerator;
  now?: Date;
}

export type CreateFromTemplateOk = {
  document: PbDocumentRecord;
  template: { source: "company" | "starter"; templateId: string; version: number; reviewed: boolean };
  /** Inputs filled automatically, and the variable each came from. */
  autoFilled: Record<string, string>;
  /** Sections the AI will write: still skeletons. */
  pendingAi: string[];
  /** The legal-review notice applies to this template and it has not been reviewed by a qualified advocate. */
  needsAdvocateReview: boolean;
};
export type CreateFromTemplateResult = PbResult<CreateFromTemplateOk> | { ok: false; error: { code: "inputs"; message: string; errors: Record<string, string> } };

export async function createDocumentFromTemplate(actor: PbActor, input: CreateFromTemplateInput): Promise<CreateFromTemplateResult> {
  if (!playbookCan(actor, "CREATE")) return { ok: false, error: { code: "forbidden", message: "You don't have permission to create documents." } };
  const r = await resolveTemplate(actor, { typeId: input.typeId, templateId: input.templateId });
  if (!r.ok) {
    const e = r.error;
    return { ok: false, error: e.code === "invalid" ? { code: "invalid", message: e.message, issues: e.issues } : e.code === "state" || e.code === "conflict" ? { code: "invalid", message: e.message, issues: [] } : { code: e.code, message: e.message } };
  }
  const { resolved } = r;
  const def = resolved.def;

  // 2. The inputs the user typed.
  const checked = validateInputValues(def.inputs, input.inputs ?? {});
  if (!checked.ok) {
    const first = Object.values(checked.errors)[0];
    return { ok: false, error: { code: "inputs", message: first, errors: checked.errors } };
  }

  // 3. Picked records become links; the access check is the editor's own.
  const links: DocLinks = {};
  for (const ns of PICKER_NAMESPACES) {
    if (ns === "party") continue;
    const id = checked.picks[ns];
    if (!id) continue;
    const kind = ns;
    const access = await checkLink(actor, kind, id);
    if (access !== "ok") return { ok: false, error: { code: access === "not_found" ? "invalid" : "forbidden", message: access === "not_found" ? `The ${ns} you picked does not exist.` : `You are not allowed to use ${ns} records in documents.`, ...(access === "not_found" ? { issues: [] } : {}) } as never };
    links[LINK_FIELD[ns]] = id;
  }

  // 4. Auto-fill from bindings. The given values are the user's; bindings fill only what they left empty.
  const now = input.now ?? new Date();
  const base: InputValues = { ...(checked.values as InputValues) };
  for (const [k, v] of Object.entries(checked.party)) base[`party.${k}`] = v;
  const loaded = await loadVariableValues(actor, {
    doc: { title: input.title ?? def.name, docNumber: null, version: null, status: "draft", issuedAt: null, authorId: actor.id }, links, inputs: base, now,
  });
  const { filled, sources } = applyBindings(def.inputs, input.inputs ?? {}, loaded.values);
  let values = checked.values;
  let lists = checked.lists;
  if (Object.keys(filled).length) {
    const again = validateInputValues(def.inputs, { ...(input.inputs ?? {}), ...filled });
    if (!again.ok) return { ok: false, error: { code: "inputs", message: Object.values(again.errors)[0], errors: again.errors } };
    values = again.values;
    lists = again.lists;
  }
  const stored: InputValues = { ...(values as InputValues) };
  for (const [k, v] of Object.entries(checked.party)) stored[`party.${k}`] = v;

  // 5. The skeleton and the document.
  const built = buildTemplateDoc(def);
  if (!built.ok) return { ok: false, error: { code: "invalid", message: `The template cannot be turned into a document: ${built.issues[0]?.message ?? "invalid"}`, issues: built.issues } };
  let pbdoc = built.doc;
  const pending = pendingAiSections(def);
  if (input.generate) {
    for (const key of pending) {
      const blocks = await input.generate({ doc: pbdoc, def, sectionKey: key, inputs: stored, values: loaded.values });
      if (blocks) pbdoc = replaceSectionBody(pbdoc, key, blocks) ?? pbdoc;
    }
  }
  const title = (input.title ?? "").trim() || defaultTitle(def, values);
  const created = await createDocument(actor, {
    title, pbdoc, docTypeId: resolved.typeId, templateRef: { templateId: resolved.templateId, version: resolved.version }, inputs: stored, lists, links,
  });
  if (!created.ok) return created;
  return {
    ok: true, document: created.document,
    template: { source: resolved.source, templateId: resolved.templateId, version: resolved.version, reviewed: resolved.reviewed },
    autoFilled: sources, pendingAi: input.generate ? [] : pending,
    needsAdvocateReview: def.legal.review && !resolved.reviewed,
  };
}

function defaultTitle(def: TemplateDef, values: Record<string, string | number | boolean>): string {
  const subject = ["subject", "title", "project_name", "role_title"].map((k) => values[k]).find((v) => typeof v === "string" && v.trim());
  return (subject ? `${def.name}: ${subject}` : def.name).slice(0, 200);
}

/** Replaces the body of a section (after its heading) with generated blocks. Returns null when the section is not there. */
function replaceSectionBody(doc: PBDoc, key: string, blocks: unknown[]): PBDoc | null {
  const i = doc.body.findIndex((b) => b.type === "section" && b.key === key);
  if (i === -1) return null;
  const sec = doc.body[i];
  if (sec.type !== "section") return null;
  const heading = sec.children[0]?.type === "heading" ? [sec.children[0]] : [];
  const next = { ...sec, children: [...heading, ...(blocks as PBDoc["body"])] };
  return { ...doc, body: doc.body.map((b, x) => (x === i ? next : b)) };
}
