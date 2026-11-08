import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, nextSequence, formatCode, type AuditFields } from "@/lib/products/spendiq/db";
import { round2 } from "@/lib/products/spendiq/constants";
import { getInvoice, applyPaymentToInvoice } from "@/lib/products/spendiq/invoices";

export const PAYMENTS_COLLECTION = "prms_payments";
const PAYMENT_CODE_PREFIX = "PAY";

export interface Payment extends AuditFields {
  _id: string;
  paymentCode: string;
  invoiceId: string;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  amount: number;
  paymentDate: Date;
  method: string;
  transactionReference: string | null;
  tdsDeducted: number;
  status: "scheduled" | "processed" | "failed";
  notes: string | null;
}

export interface SerializedPayment extends Omit<Payment, "createdAt" | "updatedAt" | "deletedAt" | "paymentDate"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  paymentDate: string;
}

export function serializePayment(p: Payment): SerializedPayment {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
    paymentDate: p.paymentDate.toISOString().slice(0, 10),
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Payment>(PAYMENTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ paymentCode: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ invoiceId: 1 }).catch(() => {}),
      collection.createIndex({ vendorId: 1 }).catch(() => {}),
      collection.createIndex({ paymentDate: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generatePaymentCode(): Promise<string> {
  return formatCode(PAYMENT_CODE_PREFIX, await nextSequence("payment_code"));
}

export async function listPaymentsForInvoice(invoiceId: string): Promise<Payment[]> {
  const collection = await getCollection();
  return collection.find({ invoiceId, ...notDeleted }).sort({ paymentDate: -1 }).toArray();
}

export interface PaymentFilter {
  search?: string;
  vendorId?: string;
  status?: Payment["status"];
}

function buildPaymentFilter(opts: PaymentFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.vendorId) filter.vendorId = opts.vendorId;
  if (opts.status) filter.status = opts.status;
  if (opts.search?.trim()) {
    const rx = new RegExp(opts.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ paymentCode: rx }, { invoiceNumber: rx }, { vendorName: rx }, { transactionReference: rx }];
  }
  return filter;
}

export async function searchPayments(
  opts: PaymentFilter & { page?: number; pageSize?: number; sortBy?: "paymentDate" | "amount"; sortDir?: "asc" | "desc" } = {}
) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildPaymentFilter(opts);
  const sortField = opts.sortBy ?? "paymentDate";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function paymentsThisMonth(): Promise<number> {
  const collection = await getCollection();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const res = await collection
    .aggregate<{ total: number }>([
      { $match: { deletedAt: null, status: "processed", paymentDate: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ])
    .toArray();
  return round2(res[0]?.total ?? 0);
}

export async function exportPayments(opts: PaymentFilter & { ids?: string[] } = {}): Promise<Payment[]> {
  const collection = await getCollection();
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildPaymentFilter(opts);
  return collection.find(filter).sort({ paymentDate: -1 }).limit(5000).toArray();
}

export interface PaymentWriteData {
  invoiceId: string;
  amount: number;
  paymentDate: string;
  method: string;
  transactionReference: string | null;
  tdsDeducted: number;
  status: "scheduled" | "processed" | "failed";
  notes: string | null;
}

export async function recordPayment(data: PaymentWriteData, actorId: string): Promise<{ ok: boolean; reason?: string; id?: string }> {
  const invoice = await getInvoice(data.invoiceId);
  if (!invoice) return { ok: false, reason: "Invoice not found." };
  const amount = round2(data.amount);
  if (amount <= 0) return { ok: false, reason: "Enter a payment amount." };
  const outstanding = round2(invoice.netPayable - invoice.amountPaid);
  if (data.status === "processed" && amount > outstanding + 0.01) {
    return { ok: false, reason: `Payment exceeds the outstanding balance of ${invoice.currency} ${outstanding}.` };
  }

  const collection = await getCollection();
  const doc: Payment = {
    _id: newId(),
    paymentCode: await generatePaymentCode(),
    invoiceId: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    vendorId: invoice.vendorId,
    vendorName: invoice.vendorName,
    amount,
    paymentDate: new Date(`${data.paymentDate}T00:00:00`),
    method: data.method,
    transactionReference: data.transactionReference?.trim() || null,
    tdsDeducted: round2(data.tdsDeducted),
    status: data.status,
    notes: data.notes,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);

  if (data.status === "processed") {
    await applyPaymentToInvoice(invoice._id, amount, actorId);
  }
  return { ok: true, id: doc._id };
}

export async function markPaymentProcessed(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const payment = await collection.findOne({ _id: id, ...notDeleted });
  if (!payment) return { ok: false, reason: "Payment not found." };
  if (payment.status === "processed") return { ok: true };
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { status: "processed", ...updateStamp(actorId) } });
  await applyPaymentToInvoice(payment.invoiceId, payment.amount, actorId);
  return { ok: true };
}

export async function deletePayment(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const payment = await collection.findOne({ _id: id, ...notDeleted });
  if (!payment) return { ok: false, reason: "Payment not found." };
  if (payment.status === "processed") {
    await applyPaymentToInvoice(payment.invoiceId, -payment.amount, actorId);
  }
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: true };
}

export async function getPayment(id: string): Promise<Payment | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}
