import "server-only";
import { notify } from "@/lib/products/spendiq/notifications";
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
import {
  DEFAULT_PO_STATUS,
  DEFAULT_CURRENCY,
  DEFAULT_GST_RATE,
  round2,
  type PoStatus,
} from "@/lib/products/spendiq/constants";

export const PURCHASE_ORDERS_COLLECTION = "prms_purchase_orders";
const PO_CODE_PREFIX = "PO";

export interface PoItem {
  description: string;
  hsn: string | null;
  quantity: number;
  uom: string;
  unitPrice: number;
  gstRate: number;
  /** Pre-tax line total. */
  lineTotal: number;
  gstAmount: number;
  /** Accumulated accepted quantity from goods receipts. */
  receivedQty: number;
}

export interface PurchaseOrder extends AuditFields {
  _id: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  requisitionId: string | null;
  rfqId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  projectId: string | null;
  projectName: string | null;
  items: PoItem[];
  subtotal: number;
  discount: number;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
  currency: string;
  deliveryAddress: string | null;
  deliveryDate: string | null;
  paymentTerms: string | null;
  notes: string | null;
  status: PoStatus;
  issuedAt: Date | null;
}

export interface SerializedPurchaseOrder
  extends Omit<PurchaseOrder, "createdAt" | "updatedAt" | "deletedAt" | "issuedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  issuedAt: string | null;
}

export function serializePurchaseOrder(p: PurchaseOrder): SerializedPurchaseOrder {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
    issuedAt: p.issuedAt ? p.issuedAt.toISOString() : null,
  };
}

export interface PoItemInput {
  description: string;
  hsn?: string | null;
  quantity: number;
  uom: string;
  unitPrice: number;
  gstRate: number;
}

export function priceItems(items: PoItemInput[], discount: number) {
  const priced: PoItem[] = items.map((it) => {
    const lineTotal = round2(it.quantity * it.unitPrice);
    return {
      description: it.description,
      hsn: it.hsn ?? null,
      quantity: it.quantity,
      uom: it.uom || "pcs",
      unitPrice: round2(it.unitPrice),
      gstRate: Number.isFinite(it.gstRate) ? it.gstRate : DEFAULT_GST_RATE,
      lineTotal,
      gstAmount: 0,
      receivedQty: 0,
    };
  });
  const subtotal = round2(priced.reduce((s, it) => s + it.lineTotal, 0));
  const disc = round2(Math.min(discount, subtotal));
  const taxableAmount = round2(subtotal - disc);
  const ratio = subtotal > 0 ? taxableAmount / subtotal : 0;
  let gstAmount = 0;
  for (const it of priced) {
    it.gstAmount = round2(it.lineTotal * ratio * (it.gstRate / 100));
    gstAmount += it.gstAmount;
  }
  gstAmount = round2(gstAmount);
  return {
    items: priced,
    subtotal,
    discount: disc,
    taxableAmount,
    gstAmount,
    totalAmount: round2(taxableAmount + gstAmount),
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<PurchaseOrder>(PURCHASE_ORDERS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ poNumber: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ vendorId: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ requisitionId: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generatePoNumber(): Promise<string> {
  return formatCode(PO_CODE_PREFIX, await nextSequence("po_number"));
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function getPurchaseOrderByNumber(poNumber: string): Promise<PurchaseOrder | null> {
  const collection = await getCollection();
  return collection.findOne({ poNumber, ...notDeleted });
}

export interface PoFilter {
  search?: string;
  status?: PoStatus;
  vendorId?: string;
}

function buildFilter(opts: PoFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ poNumber: rx }, { vendorName: rx }, { "items.description": rx }];
  }
  if (opts.status) filter.status = opts.status;
  if (opts.vendorId) filter.vendorId = opts.vendorId;
  return filter;
}

export interface SearchPoOptions extends PoFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "poNumber" | "totalAmount" | "status";
  sortDir?: "asc" | "desc";
}

export async function searchPurchaseOrders(opts: SearchPoOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);
  const sortField = opts.sortBy ?? "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function countPurchaseOrders(filter: PoFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(buildFilter(filter));
}

export async function exportPurchaseOrders(opts: PoFilter & { ids?: string[] } = {}): Promise<PurchaseOrder[]> {
  const collection = await getCollection();
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildFilter(opts);
  return collection.find(filter).sort({ createdAt: -1 }).limit(5000).toArray();
}

export async function listOpenPoOptions(): Promise<
  { _id: string; poNumber: string; vendorName: string; totalAmount: number; currency: string }[]
> {
  const collection = await getCollection();
  const docs = await collection
    .find({ ...notDeleted, status: { $in: ["issued", "partially_received"] } }, { projection: { poNumber: 1, vendorName: 1, totalAmount: 1, currency: 1 } })
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map((d) => ({ _id: d._id, poNumber: d.poNumber, vendorName: d.vendorName, totalAmount: d.totalAmount, currency: d.currency }));
}

export interface PoWriteData {
  vendorId: string;
  vendorName: string;
  requisitionId?: string | null;
  rfqId?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  items: PoItemInput[];
  discount: number;
  currency: string;
  deliveryAddress: string | null;
  deliveryDate: string | null;
  paymentTerms: string | null;
  notes: string | null;
}

export async function createPurchaseOrder(data: PoWriteData, actorId: string): Promise<PurchaseOrder> {
  const collection = await getCollection();
  const priced = priceItems(data.items, data.discount);
  const doc: PurchaseOrder = {
    _id: newId(),
    poNumber: await generatePoNumber(),
    vendorId: data.vendorId,
    vendorName: data.vendorName,
    requisitionId: data.requisitionId ?? null,
    rfqId: data.rfqId ?? null,
    departmentId: data.departmentId ?? null,
    departmentName: data.departmentName ?? null,
    projectId: data.projectId ?? null,
    projectName: data.projectName ?? null,
    ...priced,
    currency: data.currency || DEFAULT_CURRENCY,
    deliveryAddress: data.deliveryAddress,
    deliveryDate: data.deliveryDate,
    paymentTerms: data.paymentTerms,
    notes: data.notes,
    status: DEFAULT_PO_STATUS,
    issuedAt: null,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updatePurchaseOrder(
  id: string,
  data: PoWriteData,
  actorId: string
): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Purchase order not found." };
  if (existing.status !== "draft") return { ok: false, reason: "Only draft purchase orders can be edited." };
  const priced = priceItems(data.items, data.discount);
  await collection.updateOne(
    { _id: id, ...notDeleted },
    {
      $set: {
        vendorId: data.vendorId,
        vendorName: data.vendorName,
        departmentId: data.departmentId ?? null,
        departmentName: data.departmentName ?? null,
        projectId: data.projectId ?? null,
        projectName: data.projectName ?? null,
        ...priced,
        currency: data.currency || DEFAULT_CURRENCY,
        deliveryAddress: data.deliveryAddress,
        deliveryDate: data.deliveryDate,
        paymentTerms: data.paymentTerms,
        notes: data.notes,
        ...updateStamp(actorId),
      },
    }
  );
  return { ok: true };
}

export async function issuePurchaseOrder(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Purchase order not found." };
  if (existing.status !== "draft") return { ok: false, reason: "Purchase order is not a draft." };
  if (existing.items.length === 0) return { ok: false, reason: "Add at least one line item first." };
  await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { status: "issued", issuedAt: new Date(), ...updateStamp(actorId) } }
  );
  return { ok: true };
}

export async function setPurchaseOrderStatus(
  id: string,
  status: PoStatus,
  actorId: string
): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const before = await collection.findOne({ _id: id, ...notDeleted }, { projection: { status: 1, poNumber: 1, vendorName: 1, createdBy: 1 } });
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { status, ...updateStamp(actorId) } }
  );
  // The person who raised the PO is told when it is cancelled, closed or moves on, whether the change was made in SpendIQ or in the Workspace.
  if (res.modifiedCount === 1 && before && before.status !== status && before.createdBy && before.createdBy !== actorId) {
    await notify({
      recipientUserId: before.createdBy,
      audience: "staff",
      type: status === "cancelled" ? "po_cancelled_alert" : `po_${status}`,
      title: `Purchase order ${before.poNumber} (${before.vendorName}) is now ${status.replace(/_/g, " ")}`,
      link: `/spendiq/purchase-orders/${id}`,
    });
  }
  return { ok: res.modifiedCount === 1 };
}

export async function deletePurchaseOrder(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Purchase order not found." };
  if (!["draft", "cancelled"].includes(existing.status)) {
    return { ok: false, reason: "Only draft or cancelled purchase orders can be deleted." };
  }
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: true };
}

/**
 * Applies accepted quantities from a goods receipt to the PO line items and
 * recomputes the PO status (issued → partially_received → received).
 */
export async function applyReceiptToPurchaseOrder(
  poId: string,
  accepted: { itemIndex: number; acceptedQty: number }[],
  actorId: string
): Promise<void> {
  const collection = await getCollection();
  const po = await collection.findOne({ _id: poId, ...notDeleted });
  if (!po) return;
  const items = po.items.map((it, i) => {
    const add = accepted.find((a) => a.itemIndex === i)?.acceptedQty ?? 0;
    return { ...it, receivedQty: round2(it.receivedQty + add) };
  });
  const fullyReceived = items.every((it) => it.receivedQty >= it.quantity);
  const anyReceived = items.some((it) => it.receivedQty > 0);
  const status: PoStatus = fullyReceived ? "received" : anyReceived ? "partially_received" : po.status;
  await collection.updateOne(
    { _id: poId, ...notDeleted },
    { $set: { items, status, ...updateStamp(actorId) } }
  );
}
