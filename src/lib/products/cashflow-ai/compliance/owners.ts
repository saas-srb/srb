import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { WORKSTREAMS, isWorkstreamKey } from "@/lib/products/cashflow-ai/compliance/owners-core";

export const COMPLIANCE_OWNERS_COLLECTION = "fms_compliance_owners";

export interface WorkstreamOwner extends AuditFields {
  _id: string;
  workstreamKey: string;
  /** Name of the person or firm doing the work. */
  primary: string | null;
  /** Name of who reviews or supports. */
  reviewer: string | null;
  /** Phone or email — free text, only so the team knows how to reach them. */
  contact: string | null;
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<WorkstreamOwner>(COMPLIANCE_OWNERS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await collection.createIndex({ workstreamKey: 1 }, { unique: true }).catch(() => {});
  }
  return collection;
}

export async function listOwners(): Promise<Map<string, WorkstreamOwner>> {
  const rows = await (await getCollection()).find({}).toArray();
  return new Map(rows.map((r) => [r.workstreamKey, r]));
}

const clean = (v: string | null | undefined, max: number) => v?.trim().slice(0, max) || null;

export async function saveOwner(
  input: { workstreamKey: string; primary?: string | null; reviewer?: string | null; contact?: string | null },
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isWorkstreamKey(input.workstreamKey)) return { ok: false, error: "Unknown workstream." };
  const collection = await getCollection();
  const set: Record<string, unknown> = { ...updateStamp(actorId) };
  if (input.primary !== undefined) set.primary = clean(input.primary, 120);
  if (input.reviewer !== undefined) set.reviewer = clean(input.reviewer, 120);
  if (input.contact !== undefined) set.contact = clean(input.contact, 160);
  const res = await collection.updateOne({ workstreamKey: input.workstreamKey }, { $set: set });
  if (res.matchedCount === 0) {
    try {
      await collection.insertOne({ _id: newId(), workstreamKey: input.workstreamKey, primary: null, reviewer: null, contact: null, ...createStamp(actorId), ...(set as object) } as WorkstreamOwner);
    } catch {
      await collection.updateOne({ workstreamKey: input.workstreamKey }, { $set: set });
    }
  }
  const title = WORKSTREAMS.find((w) => w.key === input.workstreamKey)?.title ?? input.workstreamKey;
  await recordAudit({ actorId, actorEmail, action: "update", entity: "compliance_item", entityId: `owner:${input.workstreamKey}`, entityLabel: title, summary: [input.primary !== undefined && `primary: ${clean(input.primary, 120) ?? "—"}`, input.reviewer !== undefined && `reviewer: ${clean(input.reviewer, 120) ?? "—"}`].filter(Boolean).join(", ") || "contact updated" });
  return { ok: true };
}
