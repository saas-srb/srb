import "server-only";
import { getDb } from "@/lib/mongodb";
import {
  newId,
  createStamp,
  updateStamp,
  notDeleted,
  nextYearSequence,
  formatYearCode,
  type AuditFields,
} from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { getInvoice, applyReceiptToInvoice } from "@/lib/products/cashflow-ai/invoices";
import { recordReceipt } from "@/lib/products/cashflow-ai/receipts";
import { PaymentProviderId, getPaymentProvider } from "./provider";
import { markLinkPaid } from "./links";
import { postSystemTransaction } from "@/lib/products/cashflow-ai/transactions";
import { razorpayCollectionsAccountId } from "./payouts";
import { alertOwners } from "@/lib/products/cashflow-ai/payment-alerts";
import type { PaymentMethod as LedgerPaymentMethod } from "@/lib/products/cashflow-ai/constants";
import "./providers";
import { NOT_CONNECTED, NOT_CONNECTED_MESSAGE, resolveRazorpayCredentials } from "@/lib/platform/integrations/payments";

/** The gateway's payment method (UPI, CARD, NETBANKING …) as the ledger names methods (upi, credit_card, bank_transfer …). */
function ledgerMethod(m: string | null | undefined): LedgerPaymentMethod {
  const v = String(m ?? "").toLowerCase();
  if (v === "upi") return "upi";
  if (v === "card" || v === "credit_card") return "credit_card";
  if (v === "debit_card") return "debit_card";
  if (v === "netbanking" || v === "bank_transfer" || v === "net_banking") return "bank_transfer";
  if (v === "neft" || v === "rtgs" || v === "imps") return v;
  return "payment_gateway";
}

export const PAYMENT_INTENTS_COLLECTION = "fms_payment_intents";
const INTENT_NUMBER_PREFIX = "PAY";

export type PaymentSourceModule =
  | "Cohort AI"
  | "SprintOS"
  | "SpendIQ"
  | "LMS"
  | "PORTAL"
  | "CashFlow"
  | "TalentOS"
  | "WEBSITE"
  | "DIRECT"
  | "OFFERS";

export type PaymentIntentStatus =
  | "CREATED"
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "RECONCILED";

export type PaymentMethod =
  | "UPI"
  | "CARD"
  | "NET_BANKING"
  | "WALLET"
  | "BANK_TRANSFER"
  | "CASH"
  | "CHEQUE"
  | "PAYMENT_LINK";

export interface PaymentIntent extends AuditFields {
  _id: string;
  paymentNumber: string;
  sourceModule: PaymentSourceModule;
  sourceType: string;
  sourceId: string;
  customerId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  invoiceId: string | null;
  amount: number;
  walletCreditsUsed: number;
  offerDiscountAmount: number;
  netAmount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentProvider: PaymentProviderId;
  paymentSessionId: string | null;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  gatewaySignature: string | null;
  checkoutUrl: string | null;
  status: PaymentIntentStatus;
  utr: string | null;
  failureReason: string | null;
  receiptId: string | null;
  receiptNumber: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown>;
  initiatedAt: Date;
  completedAt: Date | null;
  /** The ledger entry of a payment with no invoice. */
  transactionId?: string | null;
  /** The money arrived but could not be booked as it should have been: a person must look (the owners are told). */
  reviewNote?: string | null;
  /** Held while one request is completing this payment, so the webhook and the browser cannot both book it. */
  completing?: boolean;
  completingAt?: Date | null;
}

export interface SerializedPaymentIntent
  extends Omit<PaymentIntent, "createdAt" | "updatedAt" | "deletedAt" | "initiatedAt" | "completedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  initiatedAt: string;
  completedAt: string | null;
}

export function serializePaymentIntent(pi: PaymentIntent): SerializedPaymentIntent {
  return {
    ...pi,
    createdAt: pi.createdAt.toISOString(),
    updatedAt: pi.updatedAt.toISOString(),
    deletedAt: pi.deletedAt ? pi.deletedAt.toISOString() : null,
    initiatedAt: pi.initiatedAt.toISOString(),
    completedAt: pi.completedAt ? pi.completedAt.toISOString() : null,
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<PaymentIntent>(PAYMENT_INTENTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ paymentNumber: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ idempotencyKey: 1 }, { sparse: true }).catch(() => {}),
      collection.createIndex({ sourceModule: 1, sourceId: 1 }).catch(() => {}),
      collection.createIndex({ invoiceId: 1 }).catch(() => {}),
      collection.createIndex({ customerId: 1 }).catch(() => {}),
      collection.createIndex({ gatewayOrderId: 1 }, { sparse: true }).catch(() => {}),
      collection.createIndex({ gatewayPaymentId: 1 }, { sparse: true }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generatePaymentNumber(year = new Date().getFullYear()): Promise<string> {
  const seq = await nextYearSequence(INTENT_NUMBER_PREFIX, year);
  return formatYearCode(INTENT_NUMBER_PREFIX, year, seq);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getPaymentIntent(id: string): Promise<PaymentIntent | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function getPaymentIntentByNumber(paymentNumber: string): Promise<PaymentIntent | null> {
  const collection = await getCollection();
  return collection.findOne({ paymentNumber, ...notDeleted });
}

export async function getPaymentIntentByIdempotencyKey(key: string): Promise<PaymentIntent | null> {
  const collection = await getCollection();
  return collection.findOne({ idempotencyKey: key, ...notDeleted });
}

export async function getPaymentIntentByGatewayOrder(gatewayOrderId: string): Promise<PaymentIntent | null> {
  const collection = await getCollection();
  return collection.findOne({ gatewayOrderId, ...notDeleted });
}

export async function getPaymentIntentByGatewayPayment(gatewayPaymentId: string): Promise<PaymentIntent | null> {
  const collection = await getCollection();
  return collection.findOne({ gatewayPaymentId, ...notDeleted });
}

export interface PaymentIntentFilter {
  search?: string;
  sourceModule?: PaymentSourceModule;
  status?: PaymentIntentStatus;
  customerId?: string;
  invoiceId?: string;
}

export async function searchPaymentIntents(
  opts: PaymentIntentFilter & { page?: number; pageSize?: number; sortBy?: "createdAt" | "amount"; sortDir?: "asc" | "desc" } = {}
) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter: Record<string, unknown> = { ...notDeleted };

  if (opts.sourceModule) filter.sourceModule = opts.sourceModule;
  if (opts.status) filter.status = opts.status;
  if (opts.customerId) filter.customerId = opts.customerId;
  if (opts.invoiceId) filter.invoiceId = opts.invoiceId;

  if (opts.search?.trim()) {
    const rx = new RegExp(opts.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { paymentNumber: rx },
      { customerName: rx },
      { customerEmail: rx },
      { gatewayPaymentId: rx },
      { utr: rx },
    ];
  }

  const sortField = opts.sortBy ?? "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

// ---------------------------------------------------------------------------
// Writes & Intent Creation
// ---------------------------------------------------------------------------

export interface CreatePaymentIntentData {
  sourceModule: PaymentSourceModule;
  sourceType: string;
  sourceId: string;
  customerId?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  invoiceId?: string | null;
  amount: number;
  walletCreditsUsed?: number;
  offerDiscountAmount?: number;
  currency?: string;
  paymentMethod?: PaymentMethod;
  paymentProvider?: PaymentProviderId;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
  actorId?: string | null;
}

export async function createPaymentIntent(
  data: CreatePaymentIntentData
): Promise<{ ok: true; intent: PaymentIntent } | { ok: false; reason: string; code?: typeof NOT_CONNECTED }> {
  if (data.idempotencyKey) {
    const existing = await getPaymentIntentByIdempotencyKey(data.idempotencyKey);
    if (existing) {
      return { ok: true, intent: existing };
    }
  }

  const grossAmount = Math.max(data.amount, 0);
  const walletCredits = Math.max(data.walletCreditsUsed ?? 0, 0);
  const offerDiscount = Math.max(data.offerDiscountAmount ?? 0, 0);
  const netAmount = Math.max(grossAmount - walletCredits - offerDiscount, 0);

  if (data.invoiceId) {
    const inv = await getInvoice(data.invoiceId);
    if (inv) {
      const outstanding = inv.totalAmount - inv.amountPaid - inv.amountCredited;
      if (grossAmount > outstanding + 0.01) {
        return { ok: false, reason: `Requested payment amount (₹${grossAmount}) exceeds outstanding invoice balance (₹${outstanding}).` };
      }
    }
  }

  // Money is collected through Razorpay, into the company's OWN merchant account, never another company's.
  const providerId = "razorpay" as const;
  if (!(await resolveRazorpayCredentials("payments"))) {
    return { ok: false, reason: NOT_CONNECTED_MESSAGE, code: NOT_CONNECTED };
  }
  const provider = getPaymentProvider(providerId);
  const intentId = newId();
  const paymentNumber = await generatePaymentNumber();

  const providerRes = await provider.createPaymentIntent({
    intentId,
    paymentNumber,
    amount: Math.round(netAmount * 100),
    amountInRupees: netAmount,
    currency: data.currency || "INR",
    customerName: data.customerName,
    customerEmail: data.customerEmail,
    customerPhone: data.customerPhone || undefined,
    description: `Payment for ${data.sourceModule} (${data.sourceType}) - ${paymentNumber}`,
    metadata: {
      sourceModule: data.sourceModule,
      sourceId: data.sourceId,
    },
  });

  if (!providerRes.ok) {
    return { ok: false, reason: providerRes.error || "Failed to initialize payment gateway order." };
  }

  const now = new Date();
  const doc: PaymentIntent = {
    _id: intentId,
    paymentNumber,
    sourceModule: data.sourceModule,
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    customerId: data.customerId ?? null,
    customerName: data.customerName,
    customerEmail: data.customerEmail,
    customerPhone: data.customerPhone ?? null,
    invoiceId: data.invoiceId ?? null,
    amount: grossAmount,
    walletCreditsUsed: walletCredits,
    offerDiscountAmount: offerDiscount,
    netAmount,
    currency: data.currency || "INR",
    paymentMethod: data.paymentMethod || "UPI",
    paymentProvider: providerId,
    paymentSessionId: providerRes.clientSecret ?? null,
    gatewayOrderId: providerRes.providerOrderId ?? null,
    gatewayPaymentId: providerRes.providerPaymentId ?? null,
    gatewaySignature: null,
    checkoutUrl: providerRes.checkoutUrl ?? null,
    status: "CREATED",
    utr: null,
    failureReason: null,
    receiptId: null,
    receiptNumber: null,
    idempotencyKey: data.idempotencyKey ?? null,
    metadata: data.metadata || {},
    initiatedAt: now,
    completedAt: null,
    ...createStamp(data.actorId ?? null),
  };

  const collection = await getCollection();
  await collection.insertOne(doc);

  await recordAudit({
    actorId: data.actorId || "system",
    actorEmail: data.customerEmail,
    action: "create",
    entity: "payment_intent",
    entityId: doc._id,
    entityLabel: doc.paymentNumber,
    summary: `Created Payment Intent ${doc.paymentNumber} for ₹${netAmount} via ${providerId}`,
  });

  return { ok: true, intent: doc };
}

/**
 * Transitions a payment intent to SUCCESS, generates receipt, updates invoice, and triggers ledger posting.
 * Atomically guarded against duplicate completions.
 */
export async function markPaymentIntentSuccessful(
  intentId: string,
  opts: {
    gatewayPaymentId?: string;
    gatewaySignature?: string;
    utr?: string;
    paymentMethod?: PaymentMethod;
    actorId?: string | null;
  }
): Promise<{ ok: boolean; intent?: PaymentIntent; reason?: string }> {
  const collection = await getCollection();
  const now = new Date();

  // Claim the payment first: Razorpay's webhook and the customer's browser both report it, usually within a second of each other, and only one
  // of them may book it. (A claim that was never finished, because the server stopped, can be taken over after two minutes.)
  const claimed = await collection.findOneAndUpdate(
    {
      _id: intentId,
      ...notDeleted,
      status: { $in: ["CREATED", "PENDING", "PROCESSING", "FAILED"] },
      $or: [{ completing: { $ne: true } }, { completingAt: { $lt: new Date(now.getTime() - 120_000) } }],
    } as never,
    { $set: { completing: true, completingAt: now } },
    { returnDocument: "after" },
  );
  if (!claimed) {
    const current = await collection.findOne({ _id: intentId, ...notDeleted });
    if (!current) return { ok: false, reason: "Payment intent not found." };
    if (current.status === "SUCCESS") return { ok: true, intent: current };
    if (current.completing) return { ok: false, reason: "This payment is being confirmed. Check again in a moment." };
    return { ok: false, reason: `Cannot complete a ${current.status} payment intent.` };
  }
  const intent = claimed;

  let receiptId: string | null = null;
  let receiptNumber: string | null = null;
  let transactionId: string | null = null;
  let reviewNote: string | null = null;
  try {
    // What the customer paid sits at Razorpay until it settles to the bank: it is booked to that account.
    const accountId = await razorpayCollectionsAccountId(opts.actorId || "razorpay");
    const inv = intent.invoiceId ? await getInvoice(intent.invoiceId) : null;
    if (intent.invoiceId && !inv) {
      reviewNote = "The invoice this payment was for no longer exists.";
    } else if (inv) {
      const recRes = await recordReceipt(
        {
          customerId: inv.customerId,
          customerName: inv.customerName,
          receiptDate: now.toISOString().slice(0, 10),
          amount: intent.netAmount,
          method: ledgerMethod(opts.paymentMethod || intent.paymentMethod),
          transactionReference: opts.utr || opts.gatewayPaymentId || intent.paymentNumber,
          viaGateway: true,
          fundAccountId: accountId,
          fundAccountType: "bank",
          allocations: [{ invoiceId: inv._id, amount: intent.netAmount }],
          currency: intent.currency,
          notes: `Automated payment for ${intent.paymentNumber} (${intent.sourceModule})`,
        },
        opts.actorId || "system",
        "system@internal.invalid"
      );
      if (recRes.ok) {
        receiptId = recRes.receipt._id;
        receiptNumber = recRes.receipt.receiptNumber;
      } else {
        reviewNote = `Money received but the receipt could not be made: ${recRes.reason}`;
      }
    } else {
      // A payment link with no invoice behind it: the money is still income and must be in the books.
      const date = new Date(`${now.toISOString().slice(0, 10)}T00:00:00`);
      const txn = await postSystemTransaction(
        {
          type: "income", transactionDate: date, postingDate: date, amount: intent.netAmount, currency: intent.currency, paymentMethod: ledgerMethod(opts.paymentMethod || intent.paymentMethod),
          sourceModule: "fms", sourceRecordId: intent._id, customerId: intent.customerId, vendorId: null, employeeId: null, projectId: null, department: null, accountId: null,
          fundAccountId: accountId, fundAccountType: "bank", taxAmount: 0, referenceNumber: opts.utr || opts.gatewayPaymentId || intent.paymentNumber,
          description: `Payment ${intent.paymentNumber} from ${intent.customerName}`, attachments: [],
        },
        opts.actorId || "system",
        null,
      );
      if ("ok" in txn) reviewNote = `Money received but it could not be booked: ${txn.reason}`;
      else transactionId = txn._id;
    }
  } catch (e) {
    reviewNote = `Money received but booking it failed: ${e instanceof Error ? e.message : String(e)}`;
  }

  // The money did arrive (the gateway says so), so the payment is complete either way; if it could not be booked, a person is told.
  const updated = await collection.findOneAndUpdate(
    { _id: intentId },
    {
      $set: {
        status: "SUCCESS",
        completedAt: now,
        gatewayPaymentId: opts.gatewayPaymentId || intent.gatewayPaymentId,
        gatewaySignature: opts.gatewaySignature || intent.gatewaySignature,
        utr: opts.utr || intent.utr,
        receiptId,
        receiptNumber,
        transactionId,
        reviewNote,
        completing: false,
        ...updateStamp(opts.actorId || null),
      },
    },
    { returnDocument: "after" }
  );
  if (!updated) return { ok: false, reason: "The payment could not be saved." };

  if (intent.sourceType === "DIRECT_LINK") await markLinkPaid(intent.sourceId, intentId);

  await recordAudit({
    actorId: opts.actorId || "system",
    actorEmail: intent.customerEmail,
    action: "status_change",
    entity: "payment_intent",
    entityId: intentId,
    entityLabel: intent.paymentNumber,
    summary: `Payment ${intent.paymentNumber} completed successfully. Receipt: ${receiptNumber || "N/A"}${reviewNote ? `. NEEDS REVIEW: ${reviewNote}` : ""}`,
  });
  if (reviewNote) {
    await alertOwners("A customer payment needs your attention", [`₹${intent.netAmount.toLocaleString("en-IN")} from ${intent.customerName} was received through Razorpay (payment ${intent.paymentNumber}), but: ${reviewNote}`, "The money is safe at Razorpay. Open Payments in CashFlow to book it by hand."]);
  }

  return { ok: true, intent: updated };
}

export async function markPaymentIntentFailed(
  intentId: string,
  failureReason: string,
  actorId: string | null = null
): Promise<boolean> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: intentId, status: { $in: ["CREATED", "PENDING", "PROCESSING"] } },
    {
      $set: {
        status: "FAILED",
        failureReason,
        ...updateStamp(actorId),
      },
    }
  );
  return res.modifiedCount === 1;
}
