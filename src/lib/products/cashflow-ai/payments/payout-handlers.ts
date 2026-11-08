import "server-only";
import { getDb } from "@/lib/mongodb";
import type { FmsPayout } from "@/lib/products/cashflow-ai/payments/payouts";

/**
 * What each kind of payment does to the record it pays, once RazorpayX has paid it (or taken it back). The ledger entry is the engine's;
 * this only moves the module's own record on: the advance is disbursed, the bill is paid, the claim is reimbursed. Called by the engine
 * for every payout that ends, so it runs for a webhook too, not only for a request made in the browser.
 */
export async function handleSettled(p: FmsPayout): Promise<void> {
  if (!p.sourceRecordId) return;
  const db = await getDb();
  const done = p.status === "processed";
  const undone = p.status === "reversed";
  if (p.purpose === "advance") {
    const col = db.collection("fms_employee_advances");
    if (done) await col.updateOne({ _id: p.sourceRecordId as never, status: "approved" }, { $set: { status: "disbursed", disbursedAt: p.settledAt ?? new Date(), disbursementTransactionId: p.transactionId, payoutId: p._id, updatedAt: new Date() } });
    if (undone) await col.updateOne({ _id: p.sourceRecordId as never, status: "disbursed" }, { $set: { status: "approved", disbursedAt: null, disbursementTransactionId: null, updatedAt: new Date() } });
  } else if (p.purpose === "vendor_bill" && p.sourceModule === "prms") {
    const { markPaymentProcessed, deletePayment } = await import("@/lib/products/spendiq/payments");
    if (done) {
      await db.collection("prms_payments").updateOne({ _id: p.sourceRecordId as never }, { $set: { transactionReference: p.utr ?? p.providerPayoutId, razorpayPayoutId: p._id, updatedAt: new Date() } });
      await markPaymentProcessed(p.sourceRecordId, "razorpayx");
    }
    if (undone) await deletePayment(p.sourceRecordId, "razorpayx");
  } else if (p.purpose === "reimbursement" && p.sourceModule === "prms") {
    const { finalizeReimbursement, reverseReimbursement } = await import("@/lib/products/cashflow-ai/reimbursements");
    if (done) await finalizeReimbursement(p);
    if (undone) await reverseReimbursement(p);
  } else if (p.purpose === "reimbursement" && p.sourceModule === "hrms") {
    const col = db.collection("hrms_work_requests");
    if (done) await col.updateOne({ _id: p.sourceRecordId as never }, { $set: { paidAt: p.settledAt ?? new Date(), paidUtr: p.utr, payoutId: p._id, updatedAt: new Date() } });
    if (undone) await col.updateOne({ _id: p.sourceRecordId as never }, { $set: { paidAt: null, paidUtr: null, updatedAt: new Date() } });
  }
}
