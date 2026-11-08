import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import {
  newId,
  createStamp,
  updateStamp,
  notDeleted,
  nextSequence,
  formatCode,
  type AuditFields,
} from "@/lib/products/spendiq/db";
import { round2, type InventoryTxnType } from "@/lib/products/spendiq/constants";

export const INVENTORY_ITEMS_COLLECTION = "prms_inventory_items";
export const INVENTORY_TXNS_COLLECTION = "prms_inventory_transactions";
const ITEM_CODE_PREFIX = "INV";

export interface InventoryItem extends AuditFields {
  _id: string;
  itemCode: string;
  name: string;
  category: string | null;
  uom: string;
  unitCost: number;
  currentStock: number;
  minStock: number;
  vendorId: string | null;
  vendorName: string | null;
  location: string | null;
  notes: string | null;
}

export interface SerializedInventoryItem extends Omit<InventoryItem, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeInventoryItem(i: InventoryItem): SerializedInventoryItem {
  return {
    ...i,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    deletedAt: i.deletedAt ? i.deletedAt.toISOString() : null,
  };
}

export interface InventoryTransaction {
  _id: string;
  itemId: string;
  itemName: string;
  type: InventoryTxnType;
  quantity: number;
  unitCost: number | null;
  reference: string | null;
  note: string | null;
  balanceAfter: number;
  date: Date;
  actorId: string;
}

let indexesEnsured = false;
async function collections() {
  const db = await getDb();
  const items = db.collection<InventoryItem>(INVENTORY_ITEMS_COLLECTION);
  const txns = db.collection<InventoryTransaction>(INVENTORY_TXNS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      items.createIndex({ itemCode: 1 }, { unique: true }).catch(() => {}),
      items.createIndex({ name: 1 }).catch(() => {}),
      items.createIndex({ category: 1 }).catch(() => {}),
      txns.createIndex({ itemId: 1, date: -1 }).catch(() => {}),
      txns.createIndex({ date: -1 }).catch(() => {}),
    ]);
  }
  return { items, txns };
}

export async function generateItemCode(): Promise<string> {
  return formatCode(ITEM_CODE_PREFIX, await nextSequence("inventory_item_code"));
}

export async function getInventoryItem(id: string): Promise<InventoryItem | null> {
  const { items } = await collections();
  return items.findOne({ _id: id, ...notDeleted });
}

export interface InventoryFilter {
  search?: string;
  category?: string;
  lowStock?: boolean;
}

function buildFilter(opts: InventoryFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ itemCode: rx }, { name: rx }, { category: rx }];
  }
  if (opts.category) filter.category = opts.category;
  if (opts.lowStock) filter.$expr = { $lte: ["$currentStock", "$minStock"] };
  return filter;
}

export async function searchInventoryItems(
  opts: InventoryFilter & { page?: number; pageSize?: number; sortBy?: string; sortDir?: "asc" | "desc" } = {}
) {
  const { items } = await collections();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);
  const sortField = opts.sortBy || "name";
  const sortDir = opts.sortDir === "desc" ? -1 : 1;
  const [rows, total] = await Promise.all([
    items.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    items.countDocuments(filter),
  ]);
  return { items: rows, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function countInventoryItems(filter: InventoryFilter = {}): Promise<number> {
  const { items } = await collections();
  return items.countDocuments(buildFilter(filter));
}

export async function inventoryStockValue(): Promise<number> {
  const { items } = await collections();
  const res = await items
    .aggregate<{ total: number }>([
      { $match: { ...notDeleted } },
      { $group: { _id: null, total: { $sum: { $multiply: ["$currentStock", "$unitCost"] } } } },
    ])
    .toArray();
  return round2(res[0]?.total ?? 0);
}

export async function exportInventoryItems(opts: InventoryFilter & { ids?: string[] } = {}): Promise<InventoryItem[]> {
  const { items } = await collections();
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildFilter(opts);
  return items.find(filter).sort({ name: 1 }).limit(5000).toArray();
}

export async function listTransactions(itemId: string, limit = 100): Promise<InventoryTransaction[]> {
  const { txns } = await collections();
  return txns.find({ itemId }).sort({ date: -1 }).limit(limit).toArray();
}

export async function consumptionReport(days = 90): Promise<{ itemName: string; consumed: number }[]> {
  const { txns } = await collections();
  const since = new Date(Date.now() - days * 86400000);
  const rows = await txns
    .aggregate<{ _id: string; consumed: number }>([
      { $match: { type: "stock_out", date: { $gte: since } } },
      { $group: { _id: "$itemName", consumed: { $sum: "$quantity" } } },
      { $sort: { consumed: -1 } },
      { $limit: 20 },
    ])
    .toArray();
  return rows.map((r) => ({ itemName: r._id, consumed: r.consumed }));
}

export interface InventoryItemWriteData {
  name: string;
  category: string | null;
  uom: string;
  unitCost: number;
  minStock: number;
  vendorId: string | null;
  vendorName: string | null;
  location: string | null;
  notes: string | null;
}

export async function createInventoryItem(data: InventoryItemWriteData, actorId: string): Promise<InventoryItem> {
  const { items } = await collections();
  const doc: InventoryItem = {
    _id: newId(),
    itemCode: await generateItemCode(),
    name: data.name,
    category: data.category,
    uom: data.uom || "pcs",
    unitCost: round2(data.unitCost),
    currentStock: 0,
    minStock: Math.max(data.minStock, 0),
    vendorId: data.vendorId,
    vendorName: data.vendorName,
    location: data.location,
    notes: data.notes,
    ...createStamp(actorId),
  };
  await items.insertOne(doc);
  return doc;
}

export async function updateInventoryItem(id: string, data: InventoryItemWriteData, actorId: string): Promise<InventoryItem | null> {
  const { items } = await collections();
  return items.findOneAndUpdate(
    { _id: id, ...notDeleted },
    {
      $set: {
        name: data.name,
        category: data.category,
        uom: data.uom || "pcs",
        unitCost: round2(data.unitCost),
        minStock: Math.max(data.minStock, 0),
        vendorId: data.vendorId,
        vendorName: data.vendorName,
        location: data.location,
        notes: data.notes,
        ...updateStamp(actorId),
      },
    },
    { returnDocument: "after" }
  );
}

export async function recordInventoryTransaction(
  itemId: string,
  input: { type: InventoryTxnType; quantity: number; unitCost?: number | null; reference?: string | null; note?: string | null },
  actorId: string
): Promise<{ ok: boolean; reason?: string }> {
  const { items, txns } = await collections();
  const item = await items.findOne({ _id: itemId, ...notDeleted });
  if (!item) return { ok: false, reason: "Item not found." };

  const qty = Math.abs(round2(input.quantity));
  if (qty <= 0) return { ok: false, reason: "Enter a quantity." };

  let delta = 0;
  if (input.type === "stock_in") delta = qty;
  else if (input.type === "stock_out") delta = -qty;
  else delta = round2(input.quantity); // adjustment: signed

  const balanceAfter = round2(item.currentStock + delta);
  if (balanceAfter < 0) return { ok: false, reason: "Insufficient stock for this transaction." };

  await txns.insertOne({
    _id: newId(),
    itemId,
    itemName: item.name,
    type: input.type,
    quantity: input.type === "adjustment" ? round2(input.quantity) : qty,
    unitCost: input.unitCost ?? null,
    reference: input.reference?.trim() || null,
    note: input.note?.trim() || null,
    balanceAfter,
    date: new Date(),
    actorId,
  });

  const set: Record<string, unknown> = { currentStock: balanceAfter, ...updateStamp(actorId) };
  if (input.type === "stock_in" && input.unitCost && input.unitCost > 0) {
    // Weighted-average cost.
    const totalValue = item.currentStock * item.unitCost + qty * input.unitCost;
    set.unitCost = balanceAfter > 0 ? round2(totalValue / balanceAfter) : round2(input.unitCost);
  }
  await items.updateOne({ _id: itemId, ...notDeleted }, { $set: set });
  return { ok: true };
}

export async function deleteInventoryItem(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const { items } = await collections();
  const item = await items.findOne({ _id: id, ...notDeleted });
  if (!item) return { ok: false, reason: "Item not found." };
  if (item.currentStock > 0) return { ok: false, reason: "Item still has stock on hand." };
  await items.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: true };
}
