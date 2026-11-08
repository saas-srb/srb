import "server-only";
import { getDb } from "@/lib/mongodb";
import { PB_COLLECTIONS } from "@/lib/products/playbook-ai/pb-collections";
import { newId, createStamp, updateStamp, type AuditFields } from "@/lib/products/playbook-ai/db";
import { playbookCan } from "@/lib/playbook-roles";
import { IDENT_RE } from "@/lib/products/playbook-ai/doc/limits";
import { recordPbAudit } from "@/lib/products/playbook-ai/pb-audit";
import { formatIsoDateIndia } from "@/lib/products/playbook-ai/doc/format";
import type { PbActor } from "@/lib/products/playbook-ai/documents-types";
import type { CustomVariableDef } from "@/lib/products/playbook-ai/variables-registry";

/** Company-defined variables (`custom.*`, collection `pb_variables`). Random ids; uniqueness of `key` is per company (scoped index). */

interface CustomRecord extends AuditFields, CustomVariableDef { _id: string }

let indexesEnsured = false;
async function col() {
  const db = await getDb();
  const c = db.collection<CustomRecord>(PB_COLLECTIONS.variables);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await c.createIndex({ key: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } }).catch(() => {});
  }
  return c;
}
export function resetCustomVariableIndexes(): void { indexesEnsured = false; }

export async function listCustomVariables(): Promise<CustomVariableDef[]> {
  const c = await col();
  const rows = await c.find({ deletedAt: null }).sort({ key: 1 }).toArray();
  return rows.map((r) => ({ key: r.key, label: r.label, description: r.description, valueType: r.valueType, value: r.value }));
}

export type CustomVariableInput = { id?: string; name: string; label: string; description?: string; valueType: CustomVariableDef["valueType"]; value: string | number };
export type CustomVariableResult = { ok: true; id: string; key: string } | { ok: false; error: string };

/** Creates or edits a custom variable. `name` is the part after `custom.` (lower-case letters, digits, underscore). Needs MANAGE_VARIABLES. */
export async function saveCustomVariable(actor: PbActor, input: CustomVariableInput): Promise<CustomVariableResult> {
  if (!playbookCan(actor, "MANAGE_VARIABLES")) return { ok: false, error: "You are not allowed to manage variables." };
  if (!IDENT_RE.test(input.name)) return { ok: false, error: "The name must start with a lower-case letter and use only lower-case letters, digits and underscores." };
  const label = input.label.trim();
  if (!label || label.length > 120) return { ok: false, error: "Give the variable a label of up to 120 characters." };
  let value: string | number;
  if (input.valueType === "number" || input.valueType === "money") {
    const n = typeof input.value === "number" ? input.value : Number(String(input.value).replace(/,/g, "").trim());
    if (!Number.isFinite(n) || String(input.value).trim() === "") return { ok: false, error: "The value must be a number." };
    value = n;
  } else if (input.valueType === "date") {
    if (typeof input.value !== "string" || !formatIsoDateIndia(input.value)) return { ok: false, error: "The value must be a date (YYYY-MM-DD)." };
    value = input.value;
  } else {
    value = String(input.value).trim();
    if (!value || value.length > 1000) return { ok: false, error: "The value must be 1 to 1000 characters." };
  }
  const key = `custom.${input.name}`;
  const c = await col();
  const clash = await c.findOne({ key, deletedAt: null, ...(input.id ? { _id: { $ne: input.id } } : {}) });
  if (clash) return { ok: false, error: `A variable named ${key} already exists.` };
  const fields = { key, label, description: input.description?.trim() || undefined, valueType: input.valueType, value };
  if (input.id) {
    const r = await c.findOneAndUpdate({ _id: input.id, deletedAt: null }, { $set: { ...fields, ...updateStamp(actor.id) } }, { returnDocument: "after" });
    if (!r) return { ok: false, error: "That variable no longer exists." };
    await recordPbAudit({ actor, action: "variable_change", entity: "variable", entityId: input.id, summary: `Edited ${key}` });
    return { ok: true, id: input.id, key };
  }
  const id = newId();
  try {
    await c.insertOne({ _id: id, ...fields, ...createStamp(actor.id) } as CustomRecord);
  } catch {
    return { ok: false, error: `A variable named ${key} already exists.` };
  }
  await recordPbAudit({ actor, action: "variable_change", entity: "variable", entityId: id, summary: `Created ${key}` });
  return { ok: true, id, key };
}

/** Soft delete. Issued documents are unaffected (they render from their frozen snapshot); drafts using it will report it as unknown. */
export async function deleteCustomVariable(actor: PbActor, id: string): Promise<{ ok: boolean; error?: string }> {
  if (!playbookCan(actor, "MANAGE_VARIABLES")) return { ok: false, error: "You are not allowed to manage variables." };
  const c = await col();
  const r = await c.findOneAndUpdate({ _id: id, deletedAt: null }, { $set: { deletedAt: new Date(), ...updateStamp(actor.id) } });
  if (!r) return { ok: false, error: "That variable no longer exists." };
  await recordPbAudit({ actor, action: "variable_change", entity: "variable", entityId: id, summary: `Deleted ${r.key}` });
  return { ok: true };
}
