import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { normalizeAccess } from "@/lib/access/can";
import type { AccessMap, Level } from "@/lib/access/types";
import { isHiddenAccessProduct, loadPersonForEdit, updatePerson, type SaveResult } from "@/lib/products/commandos/people";
import { hiddenProducts } from "@/lib/platform/products/visible";
import { recordAccessAudit } from "@/lib/products/commandos/custom-roles";
import { BLOCKED_STATUSES } from "@/lib/security/account-status";

/**
 * Bulk access for People & access (there are no role presets any more):
 *  - give several people the SAME access at once (replace, or add to what each already has),
 *  - copy one person's access to others,
 *  - ACCESS TEMPLATES: simple saved bundles of features an admin can apply. A template is NOT a role: applying it just writes features onto people (and
 *    only once); changing or deleting a template later changes nobody.
 * Every person goes through `updatePerson`, so the Director rule, seat limits, delegated-manager limits and the audit event are the same as editing one person.
 */
export const TEMPLATES_COLLECTION = "access_templates";
export const MAX_BULK = 100;
export const MAX_TEMPLATES = 50;

export interface AccessTemplate { id: string; name: string; description: string; access: AccessMap; featureCount: number; createdAt: Date; updatedAt: Date }
interface TemplateDoc { _id: string; name: string; description: string; access: AccessMap; createdBy: string; createdAt: Date; updatedAt: Date }

const count = (a: AccessMap) => Object.values(a).reduce((n, m) => n + Object.keys(m).length, 0);
const rank = (l: Level | undefined) => (l === "write" ? 2 : l === "read" ? 1 : 0);

/** Pure: the access a person ends up with. `add` keeps what they have and raises levels; `replace` gives exactly `incoming`. */
export function mergeAccess(current: AccessMap, incoming: AccessMap, mode: "replace" | "add"): AccessMap {
  if (mode === "replace") return JSON.parse(JSON.stringify(incoming)) as AccessMap;
  const out: AccessMap = JSON.parse(JSON.stringify(current)) as AccessMap;
  for (const [product, features] of Object.entries(incoming)) for (const [key, level] of Object.entries(features)) {
    const have = out[product]?.[key];
    if (rank(level) > rank(have)) (out[product] ??= {})[key] = level;
  }
  return out;
}

async function col() { return (await getDb()).collection<TemplateDoc>(TEMPLATES_COLLECTION); }
const view = (d: TemplateDoc): AccessTemplate => ({ id: d._id, name: d.name, description: d.description, access: d.access, featureCount: count(d.access), createdAt: d.createdAt, updatedAt: d.updatedAt });

export async function listTemplates(): Promise<AccessTemplate[]> {
  return (await (await col()).find({}).sort({ name: 1 }).toArray()).map(view);
}

export type TemplateResult = { ok: true; template: AccessTemplate } | { ok: false; error: string };

export async function saveTemplate(input: { id?: string; name: string; description?: string; access: unknown }, actorId: string): Promise<TemplateResult> {
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (name.length < 2) return { ok: false, error: "Give the template a name." };
  const access = normalizeAccess(input.access);
  if (count(access) === 0) return { ok: false, error: "Pick at least one feature for the template." };
  const c = await col();
  const clash = await c.findOne({ name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }, ...(input.id ? { _id: { $ne: input.id } } : {}) });
  if (clash) return { ok: false, error: "A template with that name already exists." };
  const now = new Date();
  const description = String(input.description ?? "").trim().slice(0, 200);
  if (input.id) {
    const r = await c.findOneAndUpdate({ _id: input.id }, { $set: { name, description, access, updatedAt: now } }, { returnDocument: "after" });
    if (!r) return { ok: false, error: "That template no longer exists." };
    await recordAccessAudit({ actorId, action: "template.updated", target: name, detail: `${count(access)} features` });
    return { ok: true, template: view(r) };
  }
  if ((await c.countDocuments({})) >= MAX_TEMPLATES) return { ok: false, error: `A company can keep up to ${MAX_TEMPLATES} templates.` };
  const doc: TemplateDoc = { _id: randomUUID(), name, description, access, createdBy: actorId, createdAt: now, updatedAt: now };
  await c.insertOne(doc);
  await recordAccessAudit({ actorId, action: "template.created", target: name, detail: `${count(access)} features` });
  return { ok: true, template: view(doc) };
}

export async function deleteTemplate(id: string, actorId: string): Promise<{ ok: boolean; error?: string }> {
  const r = await (await col()).findOneAndDelete({ _id: id });
  if (!r) return { ok: false, error: "That template no longer exists." };
  await recordAccessAudit({ actorId, action: "template.deleted", target: r.name, detail: "people who had it applied keep their access" });
  return { ok: true };
}

export interface BulkRow { id: string; ok: boolean; skipped?: boolean; error?: string }
export interface BulkResult { changed: number; skipped: number; failed: number; rows: BulkRow[] }
export type BulkSource = { kind: "access"; access: unknown } | { kind: "person"; userId: string } | { kind: "template"; templateId: string };

/** Resolves the access to apply. A Director cannot be a source (their access is "everything" and is not a bundle). */
export async function resolveSource(src: BulkSource): Promise<{ ok: true; access: AccessMap; label: string } | { ok: false; error: string }> {
  if (src.kind === "access") { const a = normalizeAccess(src.access); return count(a) ? { ok: true, access: a, label: "chosen features" } : { ok: false, error: "Pick at least one feature." }; }
  if (src.kind === "template") { const t = await (await col()).findOne({ _id: src.templateId }); return t ? { ok: true, access: t.access, label: `template ${t.name}` } : { ok: false, error: "That template no longer exists." }; }
  const p = await loadPersonForEdit(src.userId);
  if (!p) return { ok: false, error: "That person no longer exists." };
  if (p.isDirector) return { ok: false, error: "A Director's access cannot be copied: a Director has everything." };
  return count(p.picked) ? { ok: true, access: p.picked, label: `access of ${p.details.name || p.details.email}` } : { ok: false, error: "That person has no access to copy." };
}

/** Applies one access to several people. Never throws; every person gets their own result. */
export async function bulkSetAccess(ids: string[], source: BulkSource, mode: "replace" | "add", actor: { id: string; email: string; roles: readonly string[] }): Promise<BulkResult> {
  const unique = [...new Set(ids.filter((i) => typeof i === "string" && ObjectId.isValid(i)))].slice(0, MAX_BULK);
  const result: BulkResult = { changed: 0, skipped: 0, failed: 0, rows: [] };
  if (unique.length === 0) return { ...result, failed: 1, rows: [{ id: "", ok: false, error: "Choose at least one person." }] };
  const src = await resolveSource(source);
  if (!src.ok) return { ...result, failed: unique.length, rows: unique.map((id) => ({ id, ok: false, error: src.error })) };
  const users = (await getDb()).collection<{ _id: ObjectId; status?: string }>("admin_users");
  for (const id of unique) {
    try {
      if (source.kind === "person" && source.userId === id) { result.skipped++; result.rows.push({ id, ok: true, skipped: true, error: "That is the person being copied." }); continue; }
      const person = await loadPersonForEdit(id);
      const row = await users.findOne({ _id: new ObjectId(id) }, { projection: { status: 1 } });
      if (!person || !row) { result.failed++; result.rows.push({ id, ok: false, error: "Unknown account." }); continue; }
      if (person.isDirector) { result.skipped++; result.rows.push({ id, ok: true, skipped: true, error: "A Director's access cannot be changed." }); continue; }
      if (BLOCKED_STATUSES.includes((row.status ?? "active") as never)) { result.skipped++; result.rows.push({ id, ok: true, skipped: true, error: "This account cannot sign in; change its status first." }); continue; }
      // Products the company doesn't have are left exactly as the person had them: a bulk change neither removes nor grants them.
      const hidden = await hiddenProducts();
      const part = (map: typeof src.access, isHidden: boolean) => Object.fromEntries(Object.entries(map).filter(([p]) => isHiddenAccessProduct(p, hidden) === isHidden)) as typeof src.access;
      const next = { ...mergeAccess(part(person.picked, false), part(src.access, false), mode), ...part(person.picked, true) };
      const saved: SaveResult = await updatePerson(id, { ...person.details, access: next }, actor);
      if (saved.ok) { result.changed++; result.rows.push({ id, ok: true }); } else { result.failed++; result.rows.push({ id, ok: false, error: saved.error ?? "Could not save." }); }
    } catch (err) {
      result.failed++; result.rows.push({ id, ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "Could not save." });
    }
  }
  await recordAccessAudit({ actorId: actor.id, action: "user.access_bulk", target: `${unique.length} people`, detail: `${mode} from ${src.label}: ${result.changed} changed, ${result.skipped} skipped, ${result.failed} failed` });
  return result;
}
