import { fmsEvents } from "@/lib/notify/triggers/fms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { newId, createStamp, updateStamp, notDeleted, nextYearSequence, formatYearCode, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { round2, canTransitionRefund, DEFAULT_REFUND_STATUS, type RefundStatus } from "@/lib/products/cashflow-ai/constants";
import { getReceipt } from "@/lib/products/cashflow-ai/receipts";
import { postSystemTransaction } from "@/lib/products/cashflow-ai/transactions";
import { razorpayCollectionsAccountId } from "@/lib/products/cashflow-ai/payments/payouts";
import { getPaymentProvider } from "@/lib/products/cashflow-ai/payments/provider";
import "@/lib/products/cashflow-ai/payments/providers";

/**
 * Refunds (§26) — every refund references its original receipt. Workflow
 * `requested → approved → processing → completed/failed` (§26's own list).
 * Completion posts a reversing `fms_transaction` (an `adjustment`, money
 * going back out) — refunds aren't reachable straight from `requested`.
 */

export const REFUNDS_COLLECTION = "fms_refunds";
const REFUND_NUMBER_PREFIX = "RFD";

export interface Refund extends AuditFields {
  _id: string;
  refundNumber: string;
  receiptId: string;
  receiptNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  reason: string;
  status: RefundStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  transactionId: string | null;
  /** Razorpay's id for the refund, once the money has been sent back to the customer. */
  providerRefundId?: string | null;
}

export interface SerializedRefund extends Omit<Refund, "createdAt" | "updatedAt" | "deletedAt" | "approvedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  approvedAt: string | null;
}

export function serializeRefund(r: Refund): SerializedRefund {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Refund>(REFUNDS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ refundNumber: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ receiptId: 1 }).catch(() => {}),
      collection.createIndex({ customerId: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateRefundNumber(year = new Date().getFullYear()): Promise<string> {
  const seq = await nextYearSequence(REFUND_NUMBER_PREFIX, year);
  return formatYearCode(REFUND_NUMBER_PREFIX, year, seq);
}

export async function getRefund(id: string): Promise<Refund | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function listRefundsForReceipt(receiptId: string): Promise<Refund[]> {
  const collection = await getCollection();
  return collection.find({ receiptId, ...notDeleted }).sort({ createdAt: -1 }).toArray();
}

export interface RefundFilter {
  search?: string;
  customerId?: string;
  status?: RefundStatus;
}
function buildFilter(opts: RefundFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ refundNumber: rx }, { receiptNumber: rx }, { customerName: rx }];
  }
  if (opts.customerId) filter.customerId = opts.customerId;
  if (opts.status) filter.status = opts.status;
  return filter;
}

export async function searchRefunds(opts: RefundFilter & { page?: number; pageSize?: number } = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export interface RefundWriteData {
  receiptId: string;
  amount: number;
  reason: string;
}

export async function requestRefund(
  data: RefundWriteData,
  actorId: string
): Promise<{ ok: true; refund: Refund } | { ok: false; reason: string }> {
  const receipt = await getReceipt(data.receiptId);
  if (!receipt) return { ok: false, reason: "Receipt not found." };
  const amount = round2(data.amount);
  if (amount <= 0) return { ok: false, reason: "Enter a refund amount." };

  const collection = await getCollection();
  const existingRefunds = await collection
    .find({ receiptId: receipt._id, status: { $ne: "failed" }, ...notDeleted })
    .toArray();
  const alreadyRefunded = existingRefunds.reduce((s, r) => s + r.amount, 0);
  if (amount + alreadyRefunded > receipt.amount + 0.01) {
    return { ok: false, reason: `Refund exceeds the receipt's amount (already refunded: ${alreadyRefunded}).` };
  }

  const doc: Refund = {
    _id: newId(),
    refundNumber: await generateRefundNumber(),
    receiptId: receipt._id,
    receiptNumber: receipt.receiptNumber,
    customerId: receipt.customerId,
    customerName: receipt.customerName,
    amount,
    reason: data.reason,
    status: DEFAULT_REFUND_STATUS,
    approvedBy: null,
    approvedAt: null,
    transactionId: null,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  await fmsEvents.refundRequested({ id: doc._id, refundNumber: doc.refundNumber, customerName: doc.customerName, amount: doc.amount, currency: "INR" }, actorId);
  return { ok: true, refund: doc };
}

export async function changeRefundStatus(
  id: string,
  toStatus: RefundStatus,
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Refund not found." };
  if (!canTransitionRefund(existing.status, toStatus)) {
    return { ok: false, reason: `Cannot move a ${existing.status} refund to ${toStatus}.` };
  }

  const patch: Record<string, unknown> = { status: toStatus };
  if (toStatus === "approved") {
    patch.approvedBy = actorId;
    patch.approvedAt = new Date();
  }

  // Moving a refund to "processing" is what sends the money back: Razorpay refunds the customer's original payment. A refund is only
  // "completed" after Razorpay has accepted it, never by someone typing that it was done.
  if (toStatus === "processing") {
    // The Razorpay payment this receipt was made from: the payment intent that created it.
    const intent = await (await getDb()).collection<{ gatewayPaymentId?: string | null; paymentProvider?: string; receiptId?: string | null }>("fms_payment_intents").findOne({ receiptId: existing.receiptId, paymentProvider: "razorpay", status: "SUCCESS" });
    const paymentId = intent?.gatewayPaymentId ?? "";
    if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) {
      return { ok: false, reason: "This receipt was not paid through Razorpay, so Razorpay cannot refund it. Pay the customer back with a payment from Razorpay (Pay someone), then it can be completed." };
    }
    const res = await getPaymentProvider("razorpay").refundPayment({ paymentId, providerPaymentId: paymentId, refundAmount: existing.amount, reason: existing.reason });
    if (!res.ok) return { ok: false, reason: res.error ?? "Razorpay did not accept the refund." };
    patch.providerRefundId = res.providerRefundId ?? null;
  }
  if (toStatus === "completed" && !existing.providerRefundId) {
    return { ok: false, reason: "Move the refund to Processing first: that sends the money back through Razorpay." };
  }

  if (toStatus === "completed") {
    const txn = await postSystemTransaction(
      {
        // Razorpay has sent the money back out of what it holds for the company: an expense against the Razorpay collections account, so that
        // account's balance goes down by what was refunded.
        type: "expense",
        transactionDate: new Date(),
        postingDate: new Date(),
        amount: existing.amount,
        currency: "INR",
        paymentMethod: "payment_gateway",
        sourceModule: "fms",
        sourceRecordId: existing._id,
        customerId: existing.customerId,
        vendorId: null,
        employeeId: null,
        projectId: null,
        department: null,
        accountId: null,
        fundAccountId: await razorpayCollectionsAccountId(actorId),
        fundAccountType: "bank",
        taxAmount: 0,
        referenceNumber: existing.providerRefundId ?? null,
        description: `Refund ${existing.refundNumber} for ${existing.customerName} (receipt ${existing.receiptNumber})`,
        attachments: [],
      },
      actorId,
      actorEmail
    );
    if ("ok" in txn) return txn;
    patch.transactionId = txn._id;
  }

  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { ...patch, ...updateStamp(actorId) } });
  await fmsEvents.refundStatus({ id: existing._id, refundNumber: existing.refundNumber, amount: existing.amount, currency: "INR" }, toStatus, actorId);
  // Razorpay accepted the refund: it is done, so the books are posted straight away.
  if (toStatus === "processing") return changeRefundStatus(id, "completed", actorId, actorEmail);
  return { ok: true };
}
