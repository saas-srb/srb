"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canApproveTransactions } from "@/lib/fms-roles";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { approvePayout, refreshPayout, rejectPayout, retryPayout, startPayout, type PayoutPurpose } from "@/lib/products/cashflow-ai/payments/payouts";
import { paymentGate } from "@/lib/products/cashflow-ai/payment-guard";
import { savePaymentControls, validateControls } from "@/lib/products/cashflow-ai/payment-controls";
import { alertOwners } from "@/lib/products/cashflow-ai/payment-alerts";
import { isFmsAdmin } from "@/lib/fms-roles";

export interface DeskResult {
  ok: boolean;
  error?: string;
  message?: string;
}

async function requireApprover() {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  // Money leaves the company here: only roles that may approve transactions.
  if (!canApproveTransactions(user)) throw new Error("Forbidden");
  return user;
}

const str = (v: unknown, max = 120) => String(v ?? "").trim().slice(0, max);

export async function payAnyoneAction(input: Record<string, unknown>): Promise<DeskResult> {
  const user = await requireApprover();
  const blocked = await paymentGate(user.id, input.code);
  if (blocked) return { ok: false, error: blocked };
  const upi = str(input.channel, 8) === "upi";
  const purpose: PayoutPurpose = ["vendor_bill", "refund", "reimbursement", "advance", "other"].includes(str(input.purpose, 20)) ? (str(input.purpose, 20) as PayoutPurpose) : "other";
  const mode = ({ imps: "IMPS", neft: "NEFT", rtgs: "RTGS", upi: "UPI" } as const)[str(input.channel, 8) as "imps" | "neft" | "rtgs" | "upi"] ?? null;
  const note = str(input.note, 120);
  const r = await startPayout(
    {
      purpose,
      sourceModule: "fms",
      sourceRecordId: null,
      payee: { name: str(input.payeeName), upiId: upi ? str(input.payeeAccount) : null, accountNumber: upi ? null : str(input.payeeAccount, 30), ifsc: str(input.ifsc, 12), kind: purpose === "vendor_bill" ? "vendor" : purpose === "reimbursement" || purpose === "advance" ? "employee" : "customer" },
      amount: Number(String(input.amount ?? "").replace(/[, ]/g, "")),
      narration: note || "Payment",
      mode,
      clientRequestId: str(input.clientRequestId, 64) || null,
      description: `Payment to ${str(input.payeeName)}${note ? `: ${note}` : ""}`,
    },
    { id: user.id, email: user.email ?? null },
  );
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({ actorId: user.id, actorEmail: user.email ?? null, action: "create", entity: "transaction", entityId: r.payout._id, entityLabel: "Razorpay payment", summary: `₹${r.payout.amount} to ${r.payout.payeeName}` });
  revalidatePath("/cashflow-ai/payouts");
  return { ok: true, message: r.payout.status === "pending_approval" ? "Saved. A second person must approve it before any money moves." : "Sent to Razorpay. It shows as paid once the bank confirms." };
}

export async function refreshPayoutDeskAction(id: string): Promise<DeskResult> {
  const user = await requireApprover();
  const r = await refreshPayout(id, { id: user.id, email: user.email ?? null });
  revalidatePath("/cashflow-ai/payouts");
  return r.ok ? { ok: true, message: `Status: ${r.status}` } : { ok: false, error: r.error };
}

export async function retryPayoutDeskAction(id: string, code?: string): Promise<DeskResult> {
  const user = await requireApprover();
  const blocked = await paymentGate(user.id, code);
  if (blocked) return { ok: false, error: blocked };
  const r = await retryPayout(id, { id: user.id, email: user.email ?? null });
  revalidatePath("/cashflow-ai/payouts");
  return r.ok ? { ok: true, message: "Sent again to Razorpay." } : { ok: false, error: r.error };
}

export async function approvePayoutAction(id: string, code: string): Promise<DeskResult> {
  const user = await requireApprover();
  const blocked = await paymentGate(user.id, code);
  if (blocked) return { ok: false, error: blocked };
  const r = await approvePayout(id, { id: user.id, email: user.email ?? null });
  revalidatePath("/cashflow-ai/payouts");
  return r.ok ? { ok: true, message: "Approved and sent to Razorpay." } : { ok: false, error: r.error };
}

export async function rejectPayoutAction(id: string, reason: string): Promise<DeskResult> {
  const user = await requireApprover();
  const r = await rejectPayout(id, { id: user.id, email: user.email ?? null }, reason);
  revalidatePath("/cashflow-ai/payouts");
  return r.ok ? { ok: true, message: "Refused." } : { ok: false, error: r.error };
}

/** Only the company owner changes the rules for money leaving the company, and only with a confirmation code. */
export async function savePaymentControlsAction(input: Record<string, unknown>): Promise<DeskResult & { fieldErrors?: Record<string, string> }> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!isFmsAdmin(user)) throw new Error("Forbidden");
  const blocked = await paymentGate(user.id, input.code);
  if (blocked) return { ok: false, error: blocked };
  const v = validateControls(input);
  if (!v.valid) return { ok: false, error: Object.values(v.errors)[0], fieldErrors: v.errors };
  await savePaymentControls(v.data, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email ?? null, action: "update", entity: "payment_controls", entityId: "main", entityLabel: "Payment limits", summary: `one payment ≤ ₹${v.data.perPayoutMax}, day ≤ ₹${v.data.dailyMax}, approval from ₹${v.data.approvalThreshold}, code ${v.data.requireCode ? "on" : "OFF"}, hold ${v.data.payeeHoldHours}h` });
  await alertOwners("Payment limits were changed", [`${user.email ?? "A user"} changed the rules for money leaving the company: one payment up to ₹${v.data.perPayoutMax.toLocaleString("en-IN")}, ₹${v.data.dailyMax.toLocaleString("en-IN")} a day, a second person approves from ₹${v.data.approvalThreshold.toLocaleString("en-IN")}, confirmation code ${v.data.requireCode ? "on" : "OFF"}.`]);
  revalidatePath("/cashflow-ai/payouts");
  return { ok: true, message: "Saved." };
}
