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
import { syncBillAccrual, trySync } from "@/lib/products/cashflow-ai/accrual/posting";
import { DEFAULT_INVOICE_STATUS, DEFAULT_CURRENCY, round2, paymentTermDays, type InvoiceStatus } from "@/lib/products/spendiq/constants";
import { getPurchaseOrder } from "@/lib/products/spendiq/purchase-orders";
import { listReceiptsForPo } from "@/lib/products/spendiq/goods-receipts";

export const INVOICES_COLLECTION = "prms_invoices";
const INVOICE_CODE_PREFIX = "INV";

export interface Invoice extends AuditFields {
  _id: string;
  invoiceNumber: string;
  vendorInvoiceNumber: string | null;
  vendorId: string;
  vendorName: string;
  poId: string | null;
  poNumber: string | null;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  gstAmount: number;
  tdsRate: number;
  tdsAmount: number;
  /** The TDS section the deduction was made under (upper-case code from the company's TDS settings); null when none was chosen. */
  tdsSection?: string | null;
  totalAmount: number;
  /** Net payable after TDS. */
  netPayable: number;
  amountPaid: number;
  currency: string;
  status: InvoiceStatus;
  storageKey: string | null;
  filename: string | null;
  poMatched: boolean;
  grnMatched: boolean;
  notes: string | null;
}

export interface SerializedInvoice extends Omit<Invoice, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeInvoice(i: Invoice): SerializedInvoice {
  return {
    ...i,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    deletedAt: i.deletedAt ? i.deletedAt.toISOString() : null,
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Invoice>(INVOICES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ invoiceNumber: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ vendorId: 1 }).catch(() => {}),
      collection.createIndex({ poId: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ dueDate: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateInvoiceNumber(): Promise<string> {
  return formatCode(INVOICE_CODE_PREFIX, await nextSequence("invoice_number"));
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export interface InvoiceFilter {
  search?: string;
  status?: InvoiceStatus;
  vendorId?: string;
}

function buildFilter(opts: InvoiceFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ invoiceNumber: rx }, { vendorInvoiceNumber: rx }, { vendorName: rx }, { poNumber: rx }];
  }
  if (opts.status) filter.status = opts.status;
  if (opts.vendorId) filter.vendorId = opts.vendorId;
  return filter;
}

export async function searchInvoices(
  opts: InvoiceFilter & { page?: number; pageSize?: number; sortBy?: string; sortDir?: "asc" | "desc" } = {}
) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);
  const sortField = opts.sortBy || "dueDate";
  const sortDir = opts.sortDir === "desc" ? -1 : 1;
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function countInvoices(filter: InvoiceFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(buildFilter(filter));
}

export async function outstandingPayable(): Promise<number> {
  const collection = await getCollection();
  const res = await collection
    .aggregate<{ total: number }>([
      { $match: { deletedAt: null, status: { $in: ["pending", "approved", "partially_paid", "overdue"] } } },
      { $group: { _id: null, total: { $sum: { $subtract: ["$netPayable", "$amountPaid"] } } } },
    ])
    .toArray();
  return round2(res[0]?.total ?? 0);
}

export async function exportInvoices(opts: InvoiceFilter & { ids?: string[] } = {}): Promise<Invoice[]> {
  const collection = await getCollection();
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildFilter(opts);
  return collection.find(filter).sort({ createdAt: -1 }).limit(5000).toArray();
}

export interface InvoiceWriteData {
  vendorId: string;
  vendorName: string;
  vendorInvoiceNumber: string | null;
  poId: string | null;
  poNumber: string | null;
  invoiceDate: string;
  dueDate: string | null;
  subtotal: number;
  gstAmount: number;
  tdsRate: number;
  /** undefined = leave the bill's section as it is (e.g. when only an attachment changes). */
  tdsSection?: string | null;
  currency: string;
  notes: string | null;
  storageKey?: string | null;
  filename?: string | null;
}

function computeTotals(subtotal: number, gstAmount: number, tdsRate: number) {
  const total = round2(subtotal + gstAmount);
  const tdsAmount = round2(subtotal * (tdsRate / 100));
  return { subtotal: round2(subtotal), gstAmount: round2(gstAmount), tdsRate, tdsAmount, totalAmount: total, netPayable: round2(total - tdsAmount) };
}

export async function createInvoice(data: InvoiceWriteData, actorId: string): Promise<Invoice> {
  const collection = await getCollection();
  let dueDate = data.dueDate;
  if (!dueDate && data.poId) {
    const po = await getPurchaseOrder(data.poId);
    dueDate = po?.paymentTerms ? addDays(data.invoiceDate, paymentTermDays(po.paymentTerms)) : addDays(data.invoiceDate, 30);
  }
  const totals = computeTotals(data.subtotal, data.gstAmount, data.tdsRate);

  let poMatched = false;
  let grnMatched = false;
  if (data.poId) {
    const po = await getPurchaseOrder(data.poId);
    if (po) {
      poMatched = Math.abs(po.totalAmount - totals.totalAmount) <= Math.max(po.totalAmount * 0.02, 1);
      const receipts = await listReceiptsForPo(data.poId);
      grnMatched = receipts.some((r) => r.status === "accepted" || r.status === "partially_accepted");
    }
  }

  const doc: Invoice = {
    _id: newId(),
    invoiceNumber: await generateInvoiceNumber(),
    vendorInvoiceNumber: data.vendorInvoiceNumber,
    vendorId: data.vendorId,
    vendorName: data.vendorName,
    poId: data.poId,
    poNumber: data.poNumber,
    invoiceDate: data.invoiceDate,
    dueDate: dueDate ?? addDays(data.invoiceDate, 30),
    ...totals,
    tdsSection: data.tdsSection ?? null,
    amountPaid: 0,
    currency: data.currency || DEFAULT_CURRENCY,
    status: DEFAULT_INVOICE_STATUS,
    storageKey: data.storageKey ?? null,
    filename: data.filename ?? null,
    poMatched,
    grnMatched,
    notes: data.notes,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  const posted = await trySync(() => syncBillAccrual(doc._id, { id: actorId, email: null }));
  if (!posted.ok) {
    // never leave a bill the ledger does not know about
    await collection.deleteOne({ _id: doc._id });
    throw new Error(posted.error);
  }
  return doc;
}

export async function updateInvoice(id: string, data: InvoiceWriteData, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Invoice not found." };
  if (["paid", "partially_paid"].includes(existing.status)) return { ok: false, reason: "Paid invoices cannot be edited." };
  const totals = computeTotals(data.subtotal, data.gstAmount, data.tdsRate);
  // A bill that was already in the opening balances cannot change its amount: the ledger carries it as it stood. Correct it with a debit note.
  if ((existing as { openingAccrued?: boolean }).openingAccrued === true && Math.abs(totals.netPayable - existing.netPayable) > 0.005) {
    return { ok: false, reason: "This bill was entered before accrual books started, so its amount cannot be changed. Record a debit note for the difference." };
  }
  await collection.updateOne(
    { _id: id, ...notDeleted },
    {
      $set: {
        vendorInvoiceNumber: data.vendorInvoiceNumber,
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate ?? existing.dueDate,
        ...totals,
        ...(data.tdsSection !== undefined ? { tdsSection: data.tdsSection } : {}),
        currency: data.currency || DEFAULT_CURRENCY,
        notes: data.notes,
        ...(data.storageKey !== undefined ? { storageKey: data.storageKey, filename: data.filename ?? null } : {}),
        ...updateStamp(actorId),
      },
    }
  );
  const posted = await trySync(() => syncBillAccrual(id, { id: actorId, email: null }));
  if (!posted.ok) {
    const { _id: _omit, ...before } = existing;
    void _omit;
    await collection.updateOne({ _id: id }, { $set: before });
    return { ok: false, reason: posted.error };
  }
  return { ok: true };
}

export async function setInvoiceStatus(id: string, status: InvoiceStatus, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const before = await collection.findOne({ _id: id, ...notDeleted }, { projection: { status: 1, invoiceNumber: 1, vendorName: 1, createdBy: 1 } });
  const res = await collection.updateOne({ _id: id, ...notDeleted }, { $set: { status, ...updateStamp(actorId) } });
  if (res.modifiedCount === 1 && before) {
    const posted = await trySync(() => syncBillAccrual(id, { id: actorId, email: null }));
    if (!posted.ok) {
      await collection.updateOne({ _id: id }, { $set: { status: before.status } });
      return { ok: false, reason: posted.error };
    }
  }
  // Whoever recorded the invoice hears when its status is decided (approved, rejected, disputed …), from whichever screen it was decided.
  if (res.modifiedCount === 1 && before && before.status !== status && before.createdBy && before.createdBy !== actorId) {
    await notify({
      recipientUserId: before.createdBy,
      audience: "staff",
      type: /reject|dispute|cancel|void/i.test(status) ? `invoice_${status}_alert` : `invoice_${status}`,
      title: `Invoice ${before.invoiceNumber} from ${before.vendorName}: ${status.replace(/_/g, " ")}`,
      link: `/spendiq/invoices/${id}`,
    });
  }
  return { ok: res.modifiedCount === 1 };
}

/** Called by the payments module after a payment is recorded. */
export async function applyPaymentToInvoice(invoiceId: string, amount: number, actorId: string): Promise<void> {
  const collection = await getCollection();
  const inv = await collection.findOne({ _id: invoiceId, ...notDeleted });
  if (!inv) return;
  const amountPaid = round2(inv.amountPaid + amount);
  // A cancelled bill stays cancelled whatever happens to the payments made against it.
  const status: InvoiceStatus = inv.status === "cancelled" ? inv.status : amountPaid >= inv.netPayable - 0.01 ? "paid" : amountPaid > 0 ? "partially_paid" : inv.status;
  await collection.updateOne({ _id: invoiceId, ...notDeleted }, { $set: { amountPaid, status, ...updateStamp(actorId) } });
}

export async function deleteInvoice(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Invoice not found." };
  if (existing.amountPaid > 0) return { ok: false, reason: "Invoices with payments cannot be deleted." };
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  const posted = await trySync(() => syncBillAccrual(id, { id: actorId, email: null }));
  if (!posted.ok) {
    await collection.updateOne({ _id: id }, { $set: { deletedAt: null } });
    return { ok: false, reason: posted.error };
  }
  return { ok: true };
}
