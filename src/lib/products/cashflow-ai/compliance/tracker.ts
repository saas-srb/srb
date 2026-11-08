import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { COMPLIANCE_ITEMS, isKnownItemKey, ITEM_STATUSES, type ItemStatus } from "@/lib/products/cashflow-ai/compliance/catalog";

/**
 * The company's own progress on the CA checklist. One row per catalog item
 * the team has touched (an item with no row is "to do"). Keyed by the
 * catalog's item key, never by position in the page.
 */
export const COMPLIANCE_ITEMS_COLLECTION = "fms_compliance_items";

export interface ComplianceItemState extends AuditFields {
  _id: string;
  itemKey: string;
  status: ItemStatus;
  /** Who is responsible — free text so an outside CA can be named too. */
  owner: string | null;
  note: string | null;
  doneAt: Date | null;
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<ComplianceItemState>(COMPLIANCE_ITEMS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await collection.createIndex({ itemKey: 1 }, { unique: true }).catch(() => {});
  }
  return collection;
}

export async function listItemStates(): Promise<Map<string, ComplianceItemState>> {
  const rows = await (await getCollection()).find({}).toArray();
  return new Map(rows.map((r) => [r.itemKey, r]));
}

const STATUS_VALUES = new Set<string>(ITEM_STATUSES.map((s) => s.value));

export async function saveItemState(
  input: { itemKey: string; status?: string; owner?: string | null; note?: string | null },
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isKnownItemKey(input.itemKey)) return { ok: false, error: "Unknown checklist item." };
  if (input.status !== undefined && !STATUS_VALUES.has(input.status)) return { ok: false, error: "Unknown status." };
  const owner = input.owner === undefined ? undefined : (input.owner?.trim().slice(0, 120) || null);
  const note = input.note === undefined ? undefined : (input.note?.trim().slice(0, 1000) || null);

  const collection = await getCollection();
  const existing = await collection.findOne({ itemKey: input.itemKey });
  const set: Record<string, unknown> = { ...updateStamp(actorId) };
  if (input.status !== undefined) {
    set.status = input.status;
    set.doneAt = input.status === "done" ? (existing?.status === "done" ? existing.doneAt : new Date()) : null;
  }
  if (owner !== undefined) set.owner = owner;
  if (note !== undefined) set.note = note;

  if (existing) {
    await collection.updateOne({ _id: existing._id }, { $set: set });
  } else {
    const doc: ComplianceItemState = {
      _id: newId(),
      itemKey: input.itemKey,
      status: (input.status as ItemStatus | undefined) ?? "todo",
      owner: owner ?? null,
      note: note ?? null,
      doneAt: input.status === "done" ? new Date() : null,
      ...createStamp(actorId),
    };
    try {
      await collection.insertOne(doc);
    } catch {
      // two people saved the same new item at once: the other row won, update it
      await collection.updateOne({ itemKey: input.itemKey }, { $set: set });
    }
  }

  if (input.status !== undefined && input.status !== (existing?.status ?? "todo")) {
    const title = COMPLIANCE_ITEMS.find((i) => i.key === input.itemKey)?.title ?? input.itemKey;
    await recordAudit({
      actorId,
      actorEmail,
      action: "status_change",
      entity: "compliance_item",
      entityId: input.itemKey,
      entityLabel: title,
      summary: `${existing?.status ?? "todo"} → ${input.status}`,
    });
  }
  return { ok: true };
}
