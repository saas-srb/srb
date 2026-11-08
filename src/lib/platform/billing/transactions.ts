import "server-only";
import { randomUUID } from "node:crypto";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { methodLabel, receiptNumber, type TransactionStatus, type TransactionType, type TransactionView } from "@/lib/platform/billing/transactions-rule";

export type { TransactionView } from "@/lib/platform/billing/transactions-rule";

/**
 * The ledger of every money movement on a company's subscription: payments, failed payments and refunds. Written the moment they happen (when the
 * browser confirms a checkout AND when Razorpay's webhook reports a charge or a failure: whichever comes first; the other is a no-op), so the
 * history never depends on a webhook reaching the server. One row per (type, provider id). The tax invoice stays the legal document; this is
 * the statement a person reads, with a receipt PDF for each successful payment or refund.
 */
const COLLECTION = "billing_transactions";

interface TransactionDoc {
  _id: string;
  key: string;
  companyId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: string;
  at: Date;
  description: string;
  method: string | null;
  reference: string | null;
  refundReference: string | null;
  planId: string | null;
  planName: string | null;
  interval: string | null;
  subscriptionId: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  reason: string | null;
  /** Who paid, as on the billing details at the time (printed on the receipt). */
  payer: { name: string; email: string | null; gstin: string | null } | null;
  createdAt: Date;
}

let indexed = false;
async function col() {
  const c = (await getPlatformDb()).collection<TransactionDoc>(COLLECTION);
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ key: 1 }, { unique: true }), c.createIndex({ companyId: 1, at: -1 })]).catch(() => {});
  }
  return c;
}

export interface RecordTransactionInput {
  companyId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  /** The provider's id for this payment; with a refund, the payment it refunds. */
  paymentId: string;
  refundId?: string | null;
  at?: Date;
  description: string;
  method?: string | null;
  planId?: string | null;
  planName?: string | null;
  interval?: string | null;
  subscriptionId?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  reason?: string | null;
  payer?: TransactionDoc["payer"];
}

/** Idempotent (webhook retries, the browser and the webhook both reporting the same charge). Never throws: a ledger write must not break billing. */
export async function recordTransaction(input: RecordTransactionInput): Promise<void> {
  try {
    const key = `${input.type}:${input.type === "refund" ? input.refundId ?? input.paymentId : input.paymentId}`;
    const now = new Date();
    const c = await col();
    // A later report may know more (the invoice number, the method): fill gaps without touching what is already there.
    const known = {
      ...(input.invoiceId ? { invoiceId: input.invoiceId, invoiceNumber: input.invoiceNumber ?? null } : {}),
      ...(input.method ? { method: input.method } : {}),
      ...(input.planName ? { planName: input.planName } : {}),
    };
    await c.updateOne(
      { key },
      {
        $setOnInsert: {
          _id: `${input.type === "refund" ? "rf" : "tx"}_${randomUUID()}`,
          key,
          companyId: input.companyId,
          type: input.type,
          status: input.type === "failed" ? "failed" : "success",
          amount: input.amount,
          currency: input.currency.toUpperCase(),
          at: input.at ?? now,
          description: input.description,
          reference: input.paymentId,
          refundReference: input.refundId ?? null,
          planId: input.planId ?? null,
          interval: input.interval ?? null,
          subscriptionId: input.subscriptionId ?? null,
          reason: input.reason ?? null,
          payer: input.payer ?? null,
          createdAt: now,
          method: null,
          planName: null,
          invoiceId: null,
          invoiceNumber: null,
        },
      },
      { upsert: true },
    );
    if (Object.keys(known).length) await c.updateOne({ key }, { $set: known });
  } catch (err) {
    console.error("[billing] ledger write failed", input.type, input.paymentId, err);
  }
}

const view = (d: TransactionDoc): TransactionView => ({
  id: d._id,
  type: d.type,
  status: d.status,
  amount: d.amount,
  currency: d.currency,
  at: d.at.toISOString(),
  description: d.description,
  method: d.method ? methodLabel(d.method) : null,
  reference: d.reference,
  refundReference: d.refundReference,
  receiptNumber: receiptNumber(d._id, d.at),
  invoiceId: d.invoiceId,
  invoiceNumber: d.invoiceNumber,
  reason: d.reason,
});

export async function listCompanyTransactions(companyId: string, limit = 200): Promise<TransactionView[]> {
  const rows = await (await col()).find({ companyId }).sort({ at: -1 }).limit(limit).toArray();
  return rows.map(view);
}

/** One transaction for a viewer: a company sees only its own (anything else is "not found", never "forbidden"); the Console sees any. */
export async function getTransactionForViewer(id: string, viewer: { companyId: string | null; isPlatformAdmin: boolean }): Promise<(TransactionView & { companyId: string; payer: TransactionDoc["payer"]; planName: string | null; interval: string | null }) | null> {
  const d = await (await col()).findOne({ _id: id });
  if (!d || d.status === "failed" || d.type === "setup") return null;
  if (!viewer.isPlatformAdmin && d.companyId !== viewer.companyId) return null;
  return { ...view(d), companyId: d.companyId, payer: d.payer, planName: d.planName, interval: d.interval };
}
