import { fmsEvents } from "@/lib/notify/triggers/fms";
import "server-only";
import {
  recordPayment as prmsRecordPayment,
  getPayment as getPrmsPayment,
  searchPayments as searchPrmsPayments,
  type PaymentWriteData as PrmsPaymentWriteData,
} from "@/lib/products/spendiq/payments";
import { listPaymentsForInvoice } from "@/lib/products/spendiq/payments";
import { getInvoice as getPrmsBill } from "@/lib/products/spendiq/invoices";
import type { FundAccountType } from "@/lib/products/cashflow-ai/constants";
import { startPayout } from "@/lib/products/cashflow-ai/payments/payouts";
import { vendorPayee } from "@/lib/products/cashflow-ai/payments/payees";
import { adjustedAgainstBill } from "@/lib/products/cashflow-ai/vendor-controls/store";

/**
 * FMS's "Vendor Payments" (§11 — "FMS should manage the financial portion:
 * Payment, Payment reference, Reconciliation"). Reuses PRMS's own tested
 * `recordPayment`/`markPaymentProcessed` (the same amountPaid/status math
 * every PRMS vendor payment already goes through) instead of reimplementing
 * it — then posts a linked, already-`completed` `fms_transaction` so the
 * general ledger has a matching entry. No new payment collection: PRMS's
 * `prms_payments` (and its `PAY-0001` numbering) stays the single source of
 * truth for the payment record itself.
 */

export interface RecordVendorPaymentResult {
  ok: boolean;
  reason?: string;
  paymentId?: string;
}

const MODE_OF: Record<string, "NEFT" | "RTGS" | "IMPS" | "UPI"> = { neft: "NEFT", rtgs: "RTGS", imps: "IMPS", upi: "UPI" };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What can still be paid on a bill: what is owed, less what is paid, less payments already scheduled or on their way (a failed one
 * does not count), less any advance or deposit adjusted against it. Paying the same bill twice is the commonest way a company loses money to its own books.
 */
export async function payableOnBill(billId: string, exceptPaymentId?: string): Promise<{ ok: true; remaining: number; currency: string } | { ok: false; reason: string }> {
  const bill = await getPrmsBill(billId);
  if (!bill) return { ok: false, reason: "Bill not found." };
  if (bill.status === "cancelled") return { ok: false, reason: "This bill is cancelled." };
  const inFlight = (await listPaymentsForInvoice(billId))
    .filter((p) => p.status === "scheduled" && p._id !== exceptPaymentId)
    .reduce((n, p) => n + p.amount, 0);
  // An advance or deposit already set against the bill is money the vendor holds: paying the full bill again would pay it twice.
  const adjusted = await adjustedAgainstBill(billId);
  return { ok: true, remaining: round2(bill.netPayable - bill.amountPaid - inFlight - adjusted), currency: bill.currency };
}

/** Starts the Razorpay payout for a vendor payment that exists (scheduled) and has not been paid. */
async function payViaRazorpay(paymentId: string, actorId: string, actorEmail: string | null): Promise<{ ok: boolean; reason?: string }> {
  const payment = await getPrmsPayment(paymentId);
  if (!payment) return { ok: false, reason: "Payment not found." };
  if (payment.status === "processed") return { ok: false, reason: "This payment has already been made." };
  const room = await payableOnBill(payment.invoiceId, payment._id);
  if (!room.ok) return { ok: false, reason: room.reason };
  if (payment.amount > room.remaining + 0.01) {
    return { ok: false, reason: room.remaining <= 0.01 ? "This bill is already paid, or other payments on it cover what is owed." : `Only ${room.currency} ${room.remaining} is still payable on this bill; this payment is ${room.currency} ${payment.amount}.` };
  }
  const payee = await vendorPayee(payment.vendorId, payment.vendorName);
  if (!payee.ok) return { ok: false, reason: payee.error };
  const res = await startPayout(
    {
      purpose: "vendor_bill",
      sourceModule: "prms",
      sourceRecordId: payment._id,
      payee: payee.payee,
      amount: payment.amount,
      narration: `Bill ${payment.invoiceNumber}`,
      vendorId: payment.vendorId,
      mode: MODE_OF[String(payment.method)] ?? null,
      description: `Vendor payment ${payment.paymentCode} for bill ${payment.invoiceNumber}`,
    },
    { id: actorId, email: actorEmail },
  );
  return res.ok ? { ok: true } : { ok: false, reason: res.error };
}

/**
 * Pays a vendor bill through Razorpay. The payment is saved first (scheduled) and its payout started; it becomes "processed", and the bill
 * is reduced, only when Razorpay reports the money paid. Choose "scheduled" to pay later with `markVendorPaymentProcessed`.
 */
export async function recordVendorPayment(
  data: PrmsPaymentWriteData,
  actorId: string,
  actorEmail: string | null,
  _fundAccountId: string | null = null,
  _fundAccountType: FundAccountType | null = null,
): Promise<RecordVendorPaymentResult> {
  void _fundAccountId;
  void _fundAccountType;
  const bill = await getPrmsBill(data.invoiceId);
  if (!bill) return { ok: false, reason: "Bill not found." };
  const room = await payableOnBill(data.invoiceId);
  if (!room.ok) return { ok: false, reason: room.reason };
  const wanted = round2(data.amount);
  if (wanted > room.remaining + 0.01) {
    return { ok: false, reason: room.remaining <= 0.01 ? "This bill is already paid, or payments already scheduled on it cover what is owed." : `Only ${room.currency} ${room.remaining} is still payable on this bill (after payments already scheduled).` };
  }
  const payee = await vendorPayee(bill.vendorId, bill.vendorName);
  if (data.status !== "scheduled" && !payee.ok) return { ok: false, reason: payee.error };

  const res = await prmsRecordPayment({ ...data, status: "scheduled" }, actorId);
  if (!res.ok || !res.id) return { ok: false, reason: res.reason };
  if (data.status === "scheduled") {
    await fmsEvents.vendorPayment({ id: res.id, amount: Number((data as { amount?: number }).amount ?? 0), vendorName: bill.vendorName, reference: null }, "recorded", actorId);
    return { ok: true, paymentId: res.id };
  }
  const paid = await payViaRazorpay(res.id, actorId, actorEmail);
  if (!paid.ok) {
    // Nothing went out, so no half-made payment is left behind.
    const { deletePayment } = await import("@/lib/products/spendiq/payments");
    await deletePayment(res.id, actorId);
    return { ok: false, reason: paid.reason };
  }
  await fmsEvents.vendorPayment({ id: res.id, amount: Number((data as { amount?: number }).amount ?? 0), vendorName: bill.vendorName, reference: null }, "recorded", actorId);
  return { ok: true, paymentId: res.id };
}

/** Pays a scheduled (or earlier failed) vendor payment now, through Razorpay. */
export async function markVendorPaymentProcessed(id: string, actorId: string, actorEmail: string | null): Promise<{ ok: boolean; reason?: string }> {
  return payViaRazorpay(id, actorId, actorEmail);
}

export async function listVendorPayments(opts: Parameters<typeof searchPrmsPayments>[0] = {}) {
  return searchPrmsPayments(opts);
}
