import "server-only";
import { getDb } from "@/lib/mongodb";
import { PB_COLLECTIONS } from "@/lib/products/playbook-ai/pb-collections";
import { newId } from "@/lib/products/playbook-ai/db";
import { playbookCan } from "@/lib/playbook-roles";
import { canonicalJson } from "@/lib/products/playbook-ai/doc/canonical";
import { sha256Hex } from "@/lib/products/playbook-ai/doc/hash";
import { recordPbAudit, type PbAuditAction } from "@/lib/products/playbook-ai/pb-audit";
import type { PbActor } from "@/lib/products/playbook-ai/documents-types";
import { getTemplateDef } from "@/lib/products/playbook-ai/catalogue/registry";
import type { CategoryKey, TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { CATEGORY_KEYS } from "@/lib/products/playbook-ai/catalogue/types";
import type { CatalogueIssue } from "@/lib/products/playbook-ai/catalogue/validate";
import { blankTemplateDef } from "@/lib/products/playbook-ai/tpl/blank";
import { threeWay, type ThreeWay } from "@/lib/products/playbook-ai/tpl/diff";
import {
  TEMPLATE_NAME_MAX, isCatalogueId, slugTypeId, validateCompanyTemplate, validatePolicy,
  type TemplateOrigin, type TemplateRecord, type TemplateReview, type TemplateVersionRecord,
} from "@/lib/products/playbook-ai/tpl/types";

/**
 * Company templates (`pb_templates`) and their immutable published versions (`pb_template_versions`). Server-only.
 *
 * Platform starters live in code and are never written here. "Make my copy" copies one in; the company edits its working copy freely
 * and PUBLISHES it to make it the version new documents use. A published version is a separate, never-updated row, so a document that
 * records "template X version 3" can always show exactly what version 3 said. Reviewing (the legal stamp) needs REVIEW_TEMPLATES and
 * applies to a specific content hash: any edit that changes the content clears it, so nothing is "reviewed" that was not.
 */

export type TplError =
  | { code: "forbidden"; message: string }
  | { code: "not_found"; message: string }
  | { code: "invalid"; message: string; issues: CatalogueIssue[] }
  | { code: "conflict"; message: string; currentRev: number; yourRev: number }
  | { code: "state"; message: string };
export type TplResult<T = object> = ({ ok: true } & T) | { ok: false; error: TplError };
const fail = (error: TplError): { ok: false; error: TplError } => ({ ok: false, error });
const forbidden = (what: string) => fail({ code: "forbidden", message: `You don't have permission to ${what}.` });
const notFound = () => fail({ code: "not_found", message: "That template does not exist." });

let indexesEnsured = false;
async function col() {
  const db = await getDb();
  const c = db.collection<TemplateRecord>(PB_COLLECTIONS.templates);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      c.createIndex({ typeId: 1, status: 1 }).catch(() => {}),
      c.createIndex({ deletedAt: 1, updatedAt: -1 }).catch(() => {}),
    ]);
  }
  return c;
}
async function vcol() {
  const db = await getDb();
  const c = db.collection<TemplateVersionRecord>(PB_COLLECTIONS.templateVersions);
  await c.createIndex({ templateId: 1, number: 1 }, { unique: true }).catch(() => {});
  return c;
}
/** Test hook: forget that indexes were created (after the test drops its database). */
export function resetTemplateIndexes(): void { indexesEnsured = false; }

/** Hash of a template's content. The version number is excluded: it changes at publish, the content does not. */
export function templateContentHash(def: TemplateDef): string {
  return sha256Hex(canonicalJson({ ...def, version: 0 }));
}

const person = (a: PbActor) => ({ id: a.id, name: a.name ?? a.email });

async function audit(actor: PbActor, action: PbAuditAction, rec: Pick<TemplateRecord, "_id" | "name">, summary: string, metadata?: Record<string, unknown>) {
  await recordPbAudit({ actor, action, entity: "template", entityId: rec._id, summary: `${summary}: ${rec.name}`, metadata: metadata ?? null });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------------------------------------------

export interface TemplateSummary {
  _id: string;
  typeId: string;
  name: string;
  category: CategoryKey;
  status: TemplateRecord["status"];
  origin: "starter" | "scratch";
  starterId: string | null;
  publishedVersion: number | null;
  rev: number;
  legalReview: boolean;
  /** True while the working copy carries a review stamp for its current content. */
  draftReviewed: boolean;
  starterUpdateAvailable: boolean;
  updatedAt: Date;
}

export interface StarterUpdate {
  starterId: string;
  fromVersion: number;
  toVersion: number;
  /** False when the platform no longer ships this starter. */
  stillShipped: boolean;
  diff: ThreeWay;
}

const isReviewed = (r: TemplateReview | null, hash: string) => !!r && r.contentSha256 === hash;

function starterUpdateOf(rec: TemplateRecord): StarterUpdate | null {
  if (rec.origin.kind !== "starter") return null;
  const now = getTemplateDef(rec.origin.starterId);
  if (!now) return { starterId: rec.origin.starterId, fromVersion: rec.origin.baseVersion, toVersion: rec.origin.baseVersion, stillShipped: false, diff: { starterChanges: [], yourChanges: [], conflicts: [] } };
  if (now.version <= rec.origin.baseVersion) return null;
  return { starterId: rec.origin.starterId, fromVersion: rec.origin.baseVersion, toVersion: now.version, stillShipped: true, diff: threeWay(rec.origin.base, rec.def, now) };
}

const summarize = (r: TemplateRecord): TemplateSummary => ({
  _id: r._id, typeId: r.typeId, name: r.name, category: r.def.category, status: r.status, origin: r.origin.kind, starterId: r.origin.kind === "starter" ? r.origin.starterId : null,
  publishedVersion: r.publishedVersion, rev: r.rev, legalReview: r.def.legal.review, draftReviewed: isReviewed(r.review, r.contentSha256),
  starterUpdateAvailable: r.origin.kind === "starter" && (getTemplateDef(r.origin.starterId)?.version ?? 0) > r.origin.baseVersion, updatedAt: r.updatedAt,
});

/** The company's templates. A person without MANAGE_TEMPLATES sees only the published ones (they are what "Use template" offers). */
export async function listTemplates(actor: PbActor, f: { status?: TemplateRecord["status"]; category?: CategoryKey; q?: string } = {}): Promise<TplResult<{ items: TemplateSummary[] }>> {
  if (!playbookCan(actor, "VIEW")) return forbidden("see templates");
  const manage = playbookCan(actor, "MANAGE_TEMPLATES");
  const filter: Record<string, unknown> = { deletedAt: null };
  if (f.status) filter.status = f.status;
  if (!manage) filter.status = "published";
  const rows = await (await col()).find(filter as never).sort({ updatedAt: -1 }).toArray();
  const q = f.q?.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) ?? [];
  const items = rows
    .filter((r) => !f.category || r.def.category === f.category)
    .filter((r) => q.every((w) => `${r.name} ${r.typeId} ${r.def.purpose}`.toLowerCase().includes(w)))
    .map(summarize);
  return { ok: true, items };
}

export async function getTemplate(actor: PbActor, id: string): Promise<TplResult<{ template: TemplateRecord; draftReviewed: boolean; publishedReviewed: boolean; starterUpdate: StarterUpdate | null }>> {
  if (!playbookCan(actor, "VIEW")) return forbidden("see templates");
  const rec = await (await col()).findOne({ _id: id, deletedAt: null });
  if (!rec) return notFound();
  if (rec.status !== "published" && !playbookCan(actor, "MANAGE_TEMPLATES")) return forbidden("see this template");
  let publishedReviewed = false;
  if (rec.publishedVersion !== null) {
    const v = await (await vcol()).findOne({ templateId: id, number: rec.publishedVersion });
    publishedReviewed = !!v && isReviewed(v.review, v.contentSha256);
  }
  return { ok: true, template: rec, draftReviewed: isReviewed(rec.review, rec.contentSha256), publishedReviewed, starterUpdate: starterUpdateOf(rec) };
}

export async function listTemplateVersions(actor: PbActor, id: string): Promise<TplResult<{ versions: Omit<TemplateVersionRecord, "def">[] }>> {
  if (!playbookCan(actor, "MANAGE_TEMPLATES")) return forbidden("see template versions");
  const rows = await (await vcol()).find({ templateId: id }).sort({ number: -1 }).toArray();
  return { ok: true, versions: rows.map(({ def: _d, ...r }) => { void _d; return r; }) };
}

export async function getTemplateVersion(actor: PbActor, id: string, number: number): Promise<TplResult<{ version: TemplateVersionRecord; reviewed: boolean }>> {
  if (!playbookCan(actor, "VIEW")) return forbidden("see templates");
  const v = await (await vcol()).findOne({ templateId: id, number });
  if (!v) return notFound();
  return { ok: true, version: v, reviewed: isReviewed(v.review, v.contentSha256) };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------------------------------------------------------------

function cleanName(name: unknown): string | null {
  const n = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  return n && n.length <= TEMPLATE_NAME_MAX ? n : null;
}

async function insert(actor: PbActor, typeId: string, name: string, origin: TemplateOrigin, def: TemplateDef): Promise<TplResult<{ template: TemplateRecord }>> {
  const v = validateCompanyTemplate(def, { origin, typeId });
  if (!v.ok) return fail({ code: "invalid", message: v.error, issues: v.issues });
  const now = new Date();
  const rec: TemplateRecord = {
    _id: newId(), typeId, name, origin, status: "draft", def: v.def, rev: 1, publishedVersion: null, versionSeq: 0, contentSha256: templateContentHash(v.def),
    review: null, numberingPrefix: null, approval: null, createdAt: now, updatedAt: now, createdBy: actor.id, updatedBy: actor.id, deletedAt: null,
  };
  await (await col()).insertOne(rec);
  return { ok: true, template: rec };
}

/** "Make my copy": copies a platform starter into the company's templates. The company then owns the copy. */
export async function cloneStarter(actor: PbActor, starterId: string, opts: { name?: string } = {}): Promise<TplResult<{ template: TemplateRecord }>> {
  if (!playbookCan(actor, "MANAGE_TEMPLATES")) return forbidden("copy templates");
  const starter = getTemplateDef(starterId);
  if (!starter) return fail({ code: "not_found", message: "That starter template does not exist yet." });
  const existing = await (await col()).findOne({ typeId: starter.id, status: { $ne: "archived" }, deletedAt: null });
  if (existing) return fail({ code: "state", message: "Your company already has a copy of this template. Open it, or archive it first to make a new copy." });
  const name = opts.name === undefined ? starter.name : cleanName(opts.name);
  if (!name) return fail({ code: "invalid", message: `Give the template a name of up to ${TEMPLATE_NAME_MAX} characters.`, issues: [{ path: "name", message: "required" }] });
  const def: TemplateDef = { ...structuredClone(starter), name, version: 1 };
  const r = await insert(actor, starter.id, name, { kind: "starter", starterId: starter.id, baseVersion: starter.version, base: structuredClone(starter) }, def);
  if (r.ok) await audit(actor, "template_create", r.template, "Copied the starter template", { starterId: starter.id, starterVersion: starter.version });
  return r;
}

/** A new template from scratch in one of the catalogue categories. */
export async function createTemplate(actor: PbActor, input: { name: string; category: CategoryKey }): Promise<TplResult<{ template: TemplateRecord }>> {
  if (!playbookCan(actor, "MANAGE_TEMPLATES")) return forbidden("create templates");
  const name = cleanName(input.name);
  if (!name) return fail({ code: "invalid", message: `Give the template a name of up to ${TEMPLATE_NAME_MAX} characters.`, issues: [{ path: "name", message: "required" }] });
  if (!(CATEGORY_KEYS as readonly string[]).includes(input.category)) return fail({ code: "invalid", message: "Choose a category.", issues: [{ path: "category", message: "unknown" }] });
  const typeId = slugTypeId(input.category, name);
  if (isCatalogueId(typeId)) return fail({ code: "state", message: "A platform starter already uses that name in this category. Choose a different name, or copy the starter." });
  const clash = await (await col()).findOne({ typeId, deletedAt: null });
  if (clash) return fail({ code: "state", message: "You already have a template with that name in this category." });
  const r = await insert(actor, typeId, name, { kind: "scratch" }, blankTemplateDef(typeId, input.category, name));
  if (r.ok) await audit(actor, "template_create", r.template, "Created a template from scratch");
  return r;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Editing, publishing, reviewing
// ---------------------------------------------------------------------------------------------------------------------------------

export interface SaveTemplateInput {
  id: string;
  /** The `rev` the edit started from. */
  rev: number;
  def: unknown;
  numberingPrefix?: unknown;
  approval?: unknown;
}

/**
 * Saves the working copy. A save from a stale `rev` is refused with a `conflict`, never merged silently. A change to the content clears
 * the review stamp (the template is unreviewed again) and an archived template cannot be edited.
 */
export async function saveTemplateDraft(actor: PbActor, input: SaveTemplateInput): Promise<TplResult<{ template: TemplateRecord; reviewCleared: boolean }>> {
  if (!playbookCan(actor, "MANAGE_TEMPLATES")) return forbidden("edit templates");
  const c = await col();
  const rec = await c.findOne({ _id: input.id, deletedAt: null });
  if (!rec) return notFound();
  if (rec.status === "archived") return fail({ code: "state", message: "An archived template cannot be edited. Restore it first." });
  if (rec.rev !== input.rev) return fail({ code: "conflict", message: "Someone else changed this template since you opened it. Reload it to see their changes, then make your edit again.", currentRev: rec.rev, yourRev: input.rev });
  if (!input.def || typeof input.def !== "object") return fail({ code: "invalid", message: "The template is missing.", issues: [] });
  const def = { ...(input.def as TemplateDef), id: rec.typeId, version: rec.def.version };
  const v = validateCompanyTemplate(def, { origin: rec.origin, typeId: rec.typeId });
  if (!v.ok) return fail({ code: "invalid", message: v.error, issues: v.issues });
  const policy = validatePolicy({ numberingPrefix: input.numberingPrefix === undefined ? rec.numberingPrefix : input.numberingPrefix, approval: input.approval === undefined ? rec.approval : input.approval });
  if (!policy.ok) return fail({ code: "invalid", message: policy.error, issues: [{ path: "policy", message: policy.error }] });
  const hash = templateContentHash(v.def);
  const changed = hash !== rec.contentSha256;
  const policyChanged = canonicalJson([policy.numberingPrefix, policy.approval]) !== canonicalJson([rec.numberingPrefix, rec.approval]);
  const name = cleanName(v.def.name);
  if (!name) return fail({ code: "invalid", message: `Give the template a name of up to ${TEMPLATE_NAME_MAX} characters.`, issues: [{ path: "name", message: "required" }] });
  const reviewCleared = changed && rec.review !== null;
  const now = new Date();
  const after = await c.findOneAndUpdate(
    { _id: rec._id, rev: rec.rev, deletedAt: null } as never,
    { $set: { def: v.def, name, contentSha256: hash, numberingPrefix: policy.numberingPrefix, approval: policy.approval, updatedAt: now, updatedBy: actor.id, ...(changed ? { review: null } : {}) }, $inc: { rev: 1 } } as never,
    { returnDocument: "after" }
  );
  if (!after) return fail({ code: "conflict", message: "Someone else changed this template at the same moment. Reload it and try again.", currentRev: rec.rev + 1, yourRev: input.rev });
  if (changed || policyChanged) await audit(actor, "template_edit", after, "Edited the template", { rev: after.rev, reviewCleared, contentChanged: changed });
  return { ok: true, template: after, reviewCleared };
}

/** Publishes the working copy as the next immutable version. New documents use it from now on. */
export async function publishTemplate(actor: PbActor, input: { id: string; note?: string }): Promise<TplResult<{ template: TemplateRecord; version: number }>> {
  if (!playbookCan(actor, "MANAGE_TEMPLATES")) return forbidden("publish templates");
  const c = await col();
  const rec = await c.findOne({ _id: input.id, deletedAt: null });
  if (!rec) return notFound();
  if (rec.status === "archived") return fail({ code: "state", message: "An archived template cannot be published. Restore it first." });
  const v = validateCompanyTemplate(rec.def, { origin: rec.origin, typeId: rec.typeId });
  if (!v.ok) return fail({ code: "invalid", message: v.error, issues: v.issues });
  const other = await c.findOne({ typeId: rec.typeId, status: "published", _id: { $ne: rec._id }, deletedAt: null });
  if (other) return fail({ code: "state", message: "Another template of this type is already published. Archive it first." });
  if (rec.publishedVersion !== null) {
    const last = await (await vcol()).findOne({ templateId: rec._id, number: rec.publishedVersion });
    if (last && last.contentSha256 === rec.contentSha256 && canonicalJson([last.numberingPrefix, last.approval]) === canonicalJson([rec.numberingPrefix, rec.approval])) {
      return fail({ code: "state", message: "Nothing has changed since the published version." });
    }
  }
  const number = rec.versionSeq + 1;
  const now = new Date();
  const claimed = await c.findOneAndUpdate({ _id: rec._id, versionSeq: rec.versionSeq, rev: rec.rev, deletedAt: null } as never, { $inc: { versionSeq: 1 } } as never, { returnDocument: "after" });
  if (!claimed) return fail({ code: "conflict", message: "The template changed while publishing. Reload it and publish again.", currentRev: rec.rev + 1, yourRev: rec.rev });
  const def: TemplateDef = { ...rec.def, version: number };
  const version: TemplateVersionRecord = {
    _id: newId(), templateId: rec._id, typeId: rec.typeId, number, name: rec.name, def, contentSha256: rec.contentSha256, note: input.note?.trim().slice(0, 500) || null,
    numberingPrefix: rec.numberingPrefix, approval: rec.approval, review: isReviewed(rec.review, rec.contentSha256) ? rec.review : null, publishedBy: actor.id, publishedAt: now,
  };
  await (await vcol()).insertOne(version);
  const after = await c.findOneAndUpdate({ _id: rec._id } as never, { $set: { status: "published", publishedVersion: number, def, updatedAt: now, updatedBy: actor.id }, $inc: { rev: 1 } } as never, { returnDocument: "after" });
  await audit(actor, "template_publish", rec, `Published version ${number}`, { version: number, reviewed: !!version.review });
  return { ok: true, template: after ?? claimed, version: number };
}

/**
 * Sets or clears the "reviewed by / on" stamp on the working copy's CURRENT content. Needs REVIEW_TEMPLATES (not MANAGE_TEMPLATES): the
 * person who edits a template is not automatically the person who may declare it reviewed. If the working copy equals the published
 * version, that version carries the stamp too.
 */
export async function setReview(actor: PbActor, input: { id: string; reviewed: boolean }): Promise<TplResult<{ template: TemplateRecord }>> {
  if (!playbookCan(actor, "REVIEW_TEMPLATES")) return forbidden("review templates");
  const c = await col();
  const rec = await c.findOne({ _id: input.id, deletedAt: null });
  if (!rec) return notFound();
  const now = new Date();
  const review: TemplateReview | null = input.reviewed ? { by: person(actor), on: now, contentSha256: rec.contentSha256 } : null;
  const after = await c.findOneAndUpdate({ _id: rec._id, rev: rec.rev } as never, { $set: { review, updatedAt: now, updatedBy: actor.id }, $inc: { rev: 1 } } as never, { returnDocument: "after" });
  if (!after) return fail({ code: "conflict", message: "The template changed while you were reviewing it. Open it again and review the current wording.", currentRev: rec.rev + 1, yourRev: rec.rev });
  if (rec.publishedVersion !== null) {
    await (await vcol()).updateOne({ templateId: rec._id, number: rec.publishedVersion, contentSha256: rec.contentSha256 } as never, { $set: { review } } as never);
  }
  await audit(actor, "template_review", rec, input.reviewed ? "Marked as reviewed" : "Cleared the review", { reviewed: input.reviewed });
  return { ok: true, template: after };
}

export async function archiveTemplate(actor: PbActor, id: string): Promise<TplResult<{ template: TemplateRecord }>> {
  if (!playbookCan(actor, "MANAGE_TEMPLATES")) return forbidden("archive templates");
  const c = await col();
  const after = await c.findOneAndUpdate({ _id: id, deletedAt: null, status: { $ne: "archived" } } as never, { $set: { status: "archived", updatedAt: new Date(), updatedBy: actor.id }, $inc: { rev: 1 } } as never, { returnDocument: "after" });
  if (!after) return fail({ code: "state", message: "That template does not exist or is already archived." });
  await audit(actor, "template_archive", after, "Archived the template");
  return { ok: true, template: after };
}

/** Restoring brings it back as a draft; publish it again to use it. */
export async function restoreTemplate(actor: PbActor, id: string): Promise<TplResult<{ template: TemplateRecord }>> {
  if (!playbookCan(actor, "MANAGE_TEMPLATES")) return forbidden("restore templates");
  const c = await col();
  const rec = await c.findOne({ _id: id, deletedAt: null, status: "archived" });
  if (!rec) return fail({ code: "state", message: "That template does not exist or is not archived." });
  const clash = await c.findOne({ typeId: rec.typeId, status: { $ne: "archived" }, deletedAt: null });
  if (clash) return fail({ code: "state", message: "Your company already has another template of this type." });
  const after = await c.findOneAndUpdate({ _id: id } as never, { $set: { status: "draft", publishedVersion: null, updatedAt: new Date(), updatedBy: actor.id }, $inc: { rev: 1 } } as never, { returnDocument: "after" });
  if (!after) return notFound();
  await audit(actor, "template_restore", after, "Restored the template");
  return { ok: true, template: after };
}

/** "I have looked at the starter update": the banner goes away. The company's content is untouched; only the marker it compares against moves. */
export async function acknowledgeStarterUpdate(actor: PbActor, id: string): Promise<TplResult<{ template: TemplateRecord }>> {
  if (!playbookCan(actor, "MANAGE_TEMPLATES")) return forbidden("edit templates");
  const c = await col();
  const rec = await c.findOne({ _id: id, deletedAt: null });
  if (!rec) return notFound();
  if (rec.origin.kind !== "starter") return fail({ code: "state", message: "This template was not copied from a starter." });
  const now = getTemplateDef(rec.origin.starterId);
  if (!now || now.version <= rec.origin.baseVersion) return fail({ code: "state", message: "There is no starter update to dismiss." });
  const after = await c.findOneAndUpdate({ _id: id } as never, { $set: { origin: { kind: "starter", starterId: rec.origin.starterId, baseVersion: now.version, base: structuredClone(now) }, updatedAt: new Date(), updatedBy: actor.id }, $inc: { rev: 1 } } as never, { returnDocument: "after" });
  if (!after) return notFound();
  await audit(actor, "template_ack", after, `Dismissed the starter update (version ${now.version})`, { starterVersion: now.version });
  return { ok: true, template: after };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Resolving a template for a new document
// ---------------------------------------------------------------------------------------------------------------------------------

export interface ResolvedTemplate {
  source: "company" | "starter";
  /** The company template id, or `starter:<typeId>` for a platform starter used directly. */
  templateId: string;
  version: number;
  typeId: string;
  def: TemplateDef;
  /** True when this exact content carries a review stamp (company templates only; a starter is never "reviewed"). */
  reviewed: boolean;
  review: TemplateReview | null;
  numberingPrefix: string | null;
  approval: TemplateRecord["approval"];
}

/**
 * The template a new document of this type uses: the company's current PUBLISHED version if it has one, otherwise the platform starter.
 * `templateId` pins a specific company template (its published version).
 */
export async function resolveTemplate(actor: PbActor, ref: { typeId?: string; templateId?: string }): Promise<TplResult<{ resolved: ResolvedTemplate }>> {
  if (!playbookCan(actor, "VIEW")) return forbidden("use templates");
  const c = await col();
  let rec: TemplateRecord | null = null;
  if (ref.templateId && !ref.templateId.startsWith("starter:")) {
    rec = await c.findOne({ _id: ref.templateId, deletedAt: null });
    if (!rec) return notFound();
    if (rec.status !== "published" || rec.publishedVersion === null) return fail({ code: "state", message: "That template is not published yet." });
  } else {
    const typeId = ref.templateId ? ref.templateId.slice("starter:".length) : ref.typeId;
    if (!typeId) return fail({ code: "invalid", message: "Choose a template.", issues: [] });
    rec = await c.findOne({ typeId, status: "published", deletedAt: null });
    if (!rec) {
      const starter = getTemplateDef(typeId);
      if (!starter) return fail({ code: "not_found", message: "There is no template for that document type yet." });
      return { ok: true, resolved: { source: "starter", templateId: `starter:${typeId}`, version: starter.version, typeId, def: starter, reviewed: false, review: null, numberingPrefix: null, approval: null } };
    }
  }
  const v = await (await vcol()).findOne({ templateId: rec._id, number: rec.publishedVersion as number });
  if (!v) return notFound();
  return { ok: true, resolved: { source: "company", templateId: rec._id, version: v.number, typeId: rec.typeId, def: v.def, reviewed: isReviewed(v.review, v.contentSha256), review: v.review, numberingPrefix: v.numberingPrefix, approval: v.approval } };
}

/** Type ids of the company's published templates, with the policy each asks for (numbering prefix, approval). */
export async function listPublishedPolicies(): Promise<Record<string, { numberingPrefix: string | null; approval: TemplateRecord["approval"] }>> {
  const rows = await (await col()).find({ status: "published", deletedAt: null }).toArray();
  const out: Record<string, { numberingPrefix: string | null; approval: TemplateRecord["approval"] }> = {};
  for (const r of rows) {
    const v = r.publishedVersion === null ? null : await (await vcol()).findOne({ templateId: r._id, number: r.publishedVersion });
    if (v) out[r.typeId] = { numberingPrefix: v.numberingPrefix, approval: v.approval };
  }
  return out;
}
