import "server-only";
import { randomUUID } from "node:crypto";
import { quoteCredits, chargeCredits } from "@/lib/wallet/api";
import { refundRedemption } from "@/lib/wallet/reversals";
import { formatCredits } from "@/lib/wallet/constants";
import { getPaymentPlan, updatePaymentPlan, summarise } from "@/lib/products/cohort-ai/payments";
import { listInvoicesForCustomer } from "@/lib/products/cashflow-ai/invoices";
import { invoiceBalance } from "@/lib/products/cashflow-ai/constants";
import { createCreditNote, issueCreditNote } from "@/lib/products/cashflow-ai/credit-notes";
import type { CurrentPortalUser } from "@/lib/portal-auth";

/**
 * Connects the central wallet to the two real payable records, using ONLY
 * their existing exported functions (no changes inside TMS/FMS):
 *  - a learner's TMS payment plan → credits reduce the plan's `discount`;
 *  - a client's FMS invoice → credits are issued as a Credit Note.
 * Promotional credits are a discount, not cash, so neither path records a
 * cash receipt/instalment (which would book them as income). Credits are 1:1
 * with INR; other currencies are refused. If applying the discount fails
 * after the charge, the charge is refunded automatically.
 */

export type PayResult = { ok: true; applied: number; message: string } | { ok: false; error: string };

export async function quoteTrainingCredits(user: CurrentPortalUser, planId: string): Promise<{ pending: number; usable: number } | null> {
  const plan = user.studentId ? await getPaymentPlan(planId) : null;
  if (!plan || plan.studentId !== user.studentId || plan.currency !== "INR") return null;
  const { pendingAmount } = summarise(plan);
  const { usable } = await quoteCredits(user.id, "training", pendingAmount);
  return { pending: pendingAmount, usable: Math.min(usable, Math.floor(pendingAmount)) };
}

export async function payTrainingFeeWithCredits(user: CurrentPortalUser, planId: string): Promise<PayResult> {
  const plan = user.studentId ? await getPaymentPlan(planId) : null;
  if (!plan || plan.studentId !== user.studentId) return { ok: false, error: "Payment plan not found." };
  if (plan.currency !== "INR") return { ok: false, error: "Credits can only be used on INR fees." };
  const { pendingAmount } = summarise(plan);
  const { usable } = await quoteCredits(user.id, "training", pendingAmount);
  const amount = Math.min(usable, Math.floor(pendingAmount));
  if (amount <= 0) return { ok: false, error: "Credits can't be applied to this fee right now." };

  const charge = await chargeCredits({ userId: user.id, module: "training", amount, price: pendingAmount, referenceId: planId, idempotencyKey: `product:training:${planId}:${randomUUID()}` });
  if (!charge.ok) return { ok: false, error: charge.error };

  try {
    const updated = await updatePaymentPlan(planId, { discount: plan.discount + amount }, `portal:${user.id}`);
    if (!updated) throw new Error("plan vanished");
  } catch (err) {
    console.error("Wallet: applying credits to TMS plan failed, refunding", err);
    await refundRedemption(charge.transactionId, "system", "Automatic refund: fee discount could not be applied");
    return { ok: false, error: "Something went wrong applying your credits — nothing was charged." };
  }
  return { ok: true, applied: amount, message: `${formatCredits(amount)} applied to your fees.` };
}

async function findClientInvoice(user: CurrentPortalUser, invoiceNumber: string) {
  if (!user.clientId) return null;
  const invoices = await listInvoicesForCustomer(user.clientId, 200);
  return invoices.find((i) => i.invoiceNumber === invoiceNumber && i.status !== "void" && i.status !== "draft") ?? null;
}

export async function quoteInvoiceCredits(user: CurrentPortalUser, invoiceNumber: string): Promise<{ balance: number; usable: number } | null> {
  const inv = await findClientInvoice(user, invoiceNumber);
  if (!inv || inv.currency !== "INR") return null;
  const balance = invoiceBalance(inv);
  if (balance <= 0) return null;
  const { usable } = await quoteCredits(user.id, "projects", balance);
  return { balance, usable: Math.min(usable, Math.floor(balance)) };
}

export async function payInvoiceWithCredits(user: CurrentPortalUser, invoiceNumber: string): Promise<PayResult> {
  const inv = await findClientInvoice(user, invoiceNumber);
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.currency !== "INR") return { ok: false, error: "Credits can only be used on INR invoices." };
  const balance = invoiceBalance(inv);
  const { usable } = await quoteCredits(user.id, "projects", balance);
  const amount = Math.min(usable, Math.floor(balance));
  if (amount <= 0) return { ok: false, error: "Credits can't be applied to this invoice right now." };

  const charge = await chargeCredits({ userId: user.id, module: "projects", amount, price: balance, referenceId: inv._id, idempotencyKey: `product:projects:${inv._id}:${randomUUID()}` });
  if (!charge.ok) return { ok: false, error: charge.error };

  const actor = `portal:${user.id}`;
  const note = await createCreditNote({ invoiceId: inv._id, amount, reason: `Paid with YO Credits (wallet transaction ${charge.transactionId})` }, actor);
  const issued = note.ok ? await issueCreditNote(note.note._id, actor) : { ok: false };
  if (!note.ok || !issued.ok) {
    console.error("Wallet: credit note for invoice failed, refunding", note.ok ? issued : note);
    await refundRedemption(charge.transactionId, "system", "Automatic refund: invoice credit note could not be issued");
    return { ok: false, error: "Something went wrong applying your credits — nothing was charged." };
  }
  return { ok: true, applied: amount, message: `${formatCredits(amount)} applied to invoice ${invoiceNumber}.` };
}
