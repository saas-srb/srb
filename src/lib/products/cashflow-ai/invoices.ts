import { fmsEvents } from "@/lib/notify/triggers/fms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { emitEvent } from "@/lib/platform/events";
import { escapeRegExp } from "@/lib/text-search";
import {
  newId,
  createStamp,
  updateStamp,
  notDeleted,
  nextYearSequence,
  formatYearCode,
  type AuditFields,
} from "@/lib/products/cashflow-ai/db";
import {
  DEFAULT_CURRENCY,
  DEFAULT_INVOICE_STATUS,
  round2,
  canTransitionInvoice,
  invoiceBalance,
  type InvoiceStatus,
} from "@/lib/products/cashflow-ai/constants";
import { syncInvoiceAccrual, trySync } from "@/lib/products/cashflow-ai/accrual/posting";
import { priceLineItems, type FmsLineItem, type FmsLineItemInput } from "@/lib/products/cashflow-ai/pricing";

/**
 * Customer-facing (accounts-receivable) invoices (§7). Confirmed via research
 * that no persisted client-invoice record exists anywhere else in the
 * platform (`src/lib/clientos/client.ts`'s "Invoice Summary" is a computed
 * milestone estimate, not a real invoice) — this is FMS-owned from scratch.
 * References `pms_clients`/`pms_projects` by id only, never duplicates them.
 */

export const INVOICES_COLLECTION = "fms_invoices";
const INVOICE_NUMBER_PREFIX = "INV";

export interface Invoice extends AuditFields {
  _id: string;
  invoiceNumber: string;
  customerId: string;
  /** Denormalized snapshot — company name at time of invoicing. */
  customerName: string;
  projectId: string | null;
  invoiceDate: string;
  dueDate: string;
  items: FmsLineItem[];
  discount: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  amountCredited: number;
  currency: string;
  paymentTerms: string | null;
  poNumber: string | null;
  status: InvoiceStatus;
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

// `invoiceBalance` lives in `fms/constants.ts` (client-safe, no `server-only`,
// imported above) and is re-exported here for server-side convenience — a
// client component must import it from `fms/constants` directly, never
// through this file, or it pulls the mongodb driver into the browser bundle.
export { invoiceBalance };

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Invoice>(INVOICES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ invoiceNumber: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ customerId: 1 }).catch(() => {}),
      collection.createIndex({ projectId: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ dueDate: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateInvoiceNumber(year = new Date().getFullYear()): Promise<string> {
  const seq = await nextYearSequence(INVOICE_NUMBER_PREFIX, year);
  return formatYearCode(INVOICE_NUMBER_PREFIX, year, seq);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getInvoice(id: string): Promise<Invoice | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | null> {
  const collection = await getCollection();
  return collection.findOne({ invoiceNumber, ...notDeleted });
}

export interface InvoiceFilter {
  search?: string;
  status?: InvoiceStatus;
  customerId?: string;
  projectId?: string;
}

function buildFilter(opts: InvoiceFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ invoiceNumber: rx }, { customerName: rx }, { poNumber: rx }];
  }
  if (opts.status) filter.status = opts.status;
  if (opts.customerId) filter.customerId = opts.customerId;
  if (opts.projectId) filter.projectId = opts.projectId;
  return filter;
}

export interface SearchInvoicesOptions extends InvoiceFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "dueDate" | "invoiceDate" | "createdAt" | "totalAmount" | "invoiceNumber";
  sortDir?: "asc" | "desc";
}

export async function searchInvoices(opts: SearchInvoicesOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);
  const sortField = opts.sortBy ?? "dueDate";
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

export async function listInvoicesForCustomer(customerId: string, limit = 200): Promise<Invoice[]> {
  const collection = await getCollection();
  return collection.find({ customerId, ...notDeleted }).sort({ invoiceDate: -1 }).limit(limit).toArray();
}

/** Lightweight list for the Receipt form's invoice-allocation picker. */
export async function listOutstandingInvoicesForCustomer(customerId: string): Promise<Invoice[]> {
  const collection = await getCollection();
  const docs = await collection
    .find({ customerId, status: { $in: ["sent", "partially_paid", "overdue"] }, ...notDeleted })
    .sort({ dueDate: 1 })
    .toArray();
  return docs.filter((d) => invoiceBalance(d) > 0.01);
}

const EXPORT_ROW_LIMIT = 5000;
export async function exportInvoices(opts: InvoiceFilter & { ids?: string[] } = {}): Promise<Invoice[]> {
  const collection = await getCollection();
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildFilter(opts);
  return collection.find(filter).sort({ createdAt: -1 }).limit(EXPORT_ROW_LIMIT).toArray();
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface InvoiceWriteData {
  customerId: string;
  customerName: string;
  projectId: string | null;
  invoiceDate: string;
  dueDate: string;
  items: FmsLineItemInput[];
  discount: number;
  currency: string;
  paymentTerms: string | null;
  poNumber: string | null;
  notes: string | null;
}

export async function createInvoice(data: InvoiceWriteData, actorId: string): Promise<Invoice> {
  const collection = await getCollection();
  const priced = priceLineItems(data.items, data.discount);
  const doc: Invoice = {
    _id: newId(),
    invoiceNumber: await generateInvoiceNumber(new Date(data.invoiceDate).getFullYear()),
    customerId: data.customerId,
    customerName: data.customerName,
    projectId: data.projectId,
    invoiceDate: data.invoiceDate,
    dueDate: data.dueDate,
    items: priced.items,
    discount: priced.discount,
    subtotal: priced.subtotal,
    taxAmount: priced.taxAmount,
    totalAmount: priced.totalAmount,
    amountPaid: 0,
    amountCredited: 0,
    currency: data.currency || DEFAULT_CURRENCY,
    paymentTerms: data.paymentTerms,
    poNumber: data.poNumber,
    status: DEFAULT_INVOICE_STATUS,
    notes: data.notes,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  await emitEvent("invoice.created", { entity: invoiceEntity(doc), actorId, data: { invoiceNumber: doc.invoiceNumber, customerName: doc.customerName, totalAmount: doc.totalAmount, currency: doc.currency, dueDate: doc.dueDate } });
  await fmsEvents.invoiceCreated({ id: doc._id, invoiceNumber: doc.invoiceNumber, customerName: doc.customerName, totalAmount: doc.totalAmount, currency: doc.currency, dueDate: doc.dueDate }, actorId);
  return doc;
}

function invoiceEntity(i: Invoice) {
  return { type: "invoice", id: i._id, label: `${i.invoiceNumber} · ${i.customerName}`, url: `/cashflow-ai/invoices/${i._id}` };
}

/** Emits `invoice.paid` when a receipt or credit note has just settled the invoice in full. */
async function emitIfPaid(inv: Invoice, status: InvoiceStatus, actorId: string): Promise<void> {
  if (status !== "paid" || inv.status === "paid") return;
  await emitEvent("invoice.paid", { entity: invoiceEntity(inv), actorId, data: { invoiceNumber: inv.invoiceNumber, customerName: inv.customerName, totalAmount: inv.totalAmount, currency: inv.currency } });
  await fmsEvents.invoicePaid({ id: inv._id, invoiceNumber: inv.invoiceNumber, customerName: inv.customerName, totalAmount: inv.totalAmount, currency: inv.currency }, actorId);
}

/** Blocked once money has moved against the invoice — correct via a credit note, not a silent edit. */
export async function updateInvoice(
  id: string,
  data: InvoiceWriteData,
  actorId: string
): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Invoice not found." };
  if (existing.amountPaid > 0 || existing.amountCredited > 0) {
    return { ok: false, reason: "Invoices with payments or credit notes applied cannot be edited." };
  }
  const priced = priceLineItems(data.items, data.discount);
  // An invoice that was already in the opening balances cannot change its amount: the ledger carries it as it stood. Correct it with a credit note.
  if ((existing as { openingAccrued?: boolean }).openingAccrued === true && Math.abs(priced.totalAmount - existing.totalAmount) > 0.005) {
    return { ok: false, reason: "This invoice was issued before accrual books started, so its amount cannot be changed. Issue a credit note for the difference." };
  }
  await collection.updateOne(
    { _id: id, ...notDeleted },
    {
      $set: {
        projectId: data.projectId,
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate,
        items: priced.items,
        discount: priced.discount,
        subtotal: priced.subtotal,
        taxAmount: priced.taxAmount,
        totalAmount: priced.totalAmount,
        currency: data.currency || DEFAULT_CURRENCY,
        paymentTerms: data.paymentTerms,
        poNumber: data.poNumber,
        notes: data.notes,
        ...updateStamp(actorId),
      },
    }
  );
  const posted = await trySync(() => syncInvoiceAccrual(id, { id: actorId, email: null }));
  if (!posted.ok) {
    // the ledger could not follow (a closed period): put the invoice back as it was
    const { _id: _omit, ...before } = existing;
    void _omit;
    await collection.updateOne({ _id: id }, { $set: before });
    return { ok: false, reason: posted.error };
  }
  return { ok: true };
}

export async function setInvoiceStatus(
  id: string,
  status: InvoiceStatus,
  actorId: string
): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Invoice not found." };
  if (!canTransitionInvoice(existing.status, status)) {
    return { ok: false, reason: `Cannot move a ${existing.status} invoice to ${status}.` };
  }
  // Credit notes have already reduced what is owed on it: cancelling the invoice as well would take the same money out twice.
  if ((status === "cancelled" || status === "void") && existing.amountCredited > 0.005) {
    return { ok: false, reason: "This invoice has credit notes against it. Cancel the credit notes first, then cancel the invoice." };
  }
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { status, ...updateStamp(actorId) } });
  const posted = await trySync(() => syncInvoiceAccrual(id, { id: actorId, email: null }));
  if (!posted.ok) {
    await collection.updateOne({ _id: id }, { $set: { status: existing.status, updatedAt: existing.updatedAt, updatedBy: existing.updatedBy } });
    return { ok: false, reason: posted.error };
  }
  return { ok: true };
}

/**
 * Applies a receipt (or its reversal, via a negative `amount`) to an
 * invoice's running balance. Mirrors `src/lib/spendiq/invoices.ts`'s
 * `applyPaymentToInvoice` formula exactly, on FMS's own collection —
 * PRMS's version is hard-coded to `prms_invoices` so it can't be reused
 * cross-module directly.
 */
export async function applyReceiptToInvoice(invoiceId: string, amount: number, actorId: string): Promise<void> {
  const collection = await getCollection();
  const inv = await collection.findOne({ _id: invoiceId, ...notDeleted });
  if (!inv) return;
  const amountPaid = round2(inv.amountPaid + amount);
  const balance = round2(inv.totalAmount - amountPaid - inv.amountCredited);
  // A cancelled invoice stays cancelled whatever happens to the money paid against it.
  const status: InvoiceStatus = inv.status === "cancelled" || inv.status === "void" ? inv.status : balance <= 0.01 ? "paid" : amountPaid > 0 ? "partially_paid" : inv.status === "overdue" ? "overdue" : "sent";
  await collection.updateOne({ _id: invoiceId, ...notDeleted }, { $set: { amountPaid, status, ...updateStamp(actorId) } });
  // a draft invoice that has just been paid is now issued: it must be in the ledger before the receipt settles it
  await trySync(() => syncInvoiceAccrual(invoiceId, { id: actorId, email: null }));
  await emitIfPaid(inv, status, actorId);
}

/** Same shape as `applyReceiptToInvoice`, for credit notes. */
export async function applyCreditToInvoice(invoiceId: string, amount: number, actorId: string): Promise<void> {
  const collection = await getCollection();
  const inv = await collection.findOne({ _id: invoiceId, ...notDeleted });
  if (!inv) return;
  const amountCredited = round2(inv.amountCredited + amount);
  const balance = round2(inv.totalAmount - inv.amountPaid - amountCredited);
  const status: InvoiceStatus = inv.status === "cancelled" || inv.status === "void" ? inv.status : balance <= 0.01 ? "paid" : inv.amountPaid > 0 ? "partially_paid" : inv.status;
  await collection.updateOne({ _id: invoiceId, ...notDeleted }, { $set: { amountCredited, status, ...updateStamp(actorId) } });
  await trySync(() => syncInvoiceAccrual(invoiceId, { id: actorId, email: null }));
  await emitIfPaid(inv, status, actorId);
}

export async function deleteInvoice(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Invoice not found." };
  if (existing.amountPaid > 0 || existing.amountCredited > 0) {
    return { ok: false, reason: "Invoices with payments or credit notes cannot be deleted." };
  }
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  const posted = await trySync(() => syncInvoiceAccrual(id, { id: actorId, email: null }));
  if (!posted.ok) {
    await collection.updateOne({ _id: id }, { $set: { deletedAt: null } });
    return { ok: false, reason: posted.error };
  }
  return { ok: true };
}
