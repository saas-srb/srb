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
import { round2, type GrnStatus } from "@/lib/products/spendiq/constants";
import { getPurchaseOrder, applyReceiptToPurchaseOrder } from "@/lib/products/spendiq/purchase-orders";

export const GOODS_RECEIPTS_COLLECTION = "prms_goods_receipts";
const GRN_CODE_PREFIX = "GRN";

export interface GrnItem {
  itemIndex: number;
  description: string;
  orderedQty: number;
  previouslyReceived: number;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  remarks: string | null;
}

export interface GoodsReceipt extends AuditFields {
  _id: string;
  grnNumber: string;
  poId: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  items: GrnItem[];
  warehouseLocation: string | null;
  receivedDate: string;
  qualityChecked: boolean;
  remarks: string | null;
  status: GrnStatus;
}

export interface SerializedGoodsReceipt extends Omit<GoodsReceipt, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeGoodsReceipt(g: GoodsReceipt): SerializedGoodsReceipt {
  return {
    ...g,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    deletedAt: g.deletedAt ? g.deletedAt.toISOString() : null,
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<GoodsReceipt>(GOODS_RECEIPTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ grnNumber: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ poId: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateGrnNumber(): Promise<string> {
  return formatCode(GRN_CODE_PREFIX, await nextSequence("grn_number"));
}

export async function getGoodsReceipt(id: string): Promise<GoodsReceipt | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function listReceiptsForPo(poId: string): Promise<GoodsReceipt[]> {
  const collection = await getCollection();
  return collection.find({ poId, ...notDeleted }).sort({ createdAt: -1 }).toArray();
}

export interface GrnFilter {
  search?: string;
  status?: GrnStatus;
}

function buildFilter(opts: GrnFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ grnNumber: rx }, { poNumber: rx }, { vendorName: rx }];
  }
  if (opts.status) filter.status = opts.status;
  return filter;
}

export async function searchGoodsReceipts(
  opts: GrnFilter & { page?: number; pageSize?: number; sortBy?: string; sortDir?: "asc" | "desc" } = {}
) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);
  const sortField = opts.sortBy || "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function countGoodsReceipts(filter: GrnFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(buildFilter(filter));
}

export interface GrnLineInput {
  itemIndex: number;
  receivedQty: number;
  acceptedQty: number;
  remarks?: string | null;
}

export interface GrnWriteData {
  poId: string;
  warehouseLocation: string | null;
  receivedDate: string;
  qualityChecked: boolean;
  remarks: string | null;
  lines: GrnLineInput[];
}

export async function createGoodsReceipt(
  data: GrnWriteData,
  actorId: string
): Promise<{ ok: boolean; reason?: string; id?: string }> {
  const po = await getPurchaseOrder(data.poId);
  if (!po) return { ok: false, reason: "Purchase order not found." };
  if (!["issued", "partially_received"].includes(po.status)) {
    return { ok: false, reason: "Only issued purchase orders can receive goods." };
  }

  const items: GrnItem[] = [];
  for (const line of data.lines) {
    const poItem = po.items[line.itemIndex];
    if (!poItem) continue;
    const received = Math.max(round2(line.receivedQty), 0);
    const accepted = Math.min(Math.max(round2(line.acceptedQty), 0), received);
    const outstanding = round2(poItem.quantity - poItem.receivedQty);
    if (accepted > outstanding + 0.001) {
      return { ok: false, reason: `Accepted qty for "${poItem.description}" exceeds the outstanding order quantity.` };
    }
    items.push({
      itemIndex: line.itemIndex,
      description: poItem.description,
      orderedQty: poItem.quantity,
      previouslyReceived: poItem.receivedQty,
      receivedQty: received,
      acceptedQty: accepted,
      rejectedQty: round2(received - accepted),
      remarks: line.remarks?.trim() || null,
    });
  }
  if (items.length === 0) return { ok: false, reason: "Record at least one received line." };

  const totalReceived = items.reduce((s, it) => s + it.receivedQty, 0);
  const totalAccepted = items.reduce((s, it) => s + it.acceptedQty, 0);
  const status: GrnStatus =
    totalAccepted === 0 ? "rejected" : totalAccepted < totalReceived ? "partially_accepted" : "accepted";

  const collection = await getCollection();
  const doc: GoodsReceipt = {
    _id: newId(),
    grnNumber: await generateGrnNumber(),
    poId: po._id,
    poNumber: po.poNumber,
    vendorId: po.vendorId,
    vendorName: po.vendorName,
    items,
    warehouseLocation: data.warehouseLocation,
    receivedDate: data.receivedDate,
    qualityChecked: data.qualityChecked,
    remarks: data.remarks,
    status,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);

  await applyReceiptToPurchaseOrder(
    po._id,
    items.map((it) => ({ itemIndex: it.itemIndex, acceptedQty: it.acceptedQty })),
    actorId
  );

  return { ok: true, id: doc._id };
}

export async function deleteGoodsReceipt(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Goods receipt not found." };
  // Reverse the accepted quantities on the PO.
  await applyReceiptToPurchaseOrder(
    existing.poId,
    existing.items.map((it) => ({ itemIndex: it.itemIndex, acceptedQty: -it.acceptedQty })),
    actorId
  );
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: true };
}
