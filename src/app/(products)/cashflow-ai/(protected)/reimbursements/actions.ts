"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canApproveTransactions } from "@/lib/fms-roles";
import { paymentGate } from "@/lib/products/cashflow-ai/payment-guard";
import { recordReimbursement, type RecordReimbursementData } from "@/lib/products/cashflow-ai/reimbursements";
import { isValidPaymentMethod, isValidFundAccountType } from "@/lib/products/cashflow-ai/constants";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";

export interface ReimbursementActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function revalidate(expenseId?: string) {
  revalidatePath("/cashflow-ai/employee-expenses");
  revalidatePath("/cashflow-ai/approvals");
  revalidatePath("/cashflow-ai/transactions");
  revalidatePath("/cashflow-ai");
  if (expenseId) revalidatePath(`/cashflow-ai/employee-expenses/${expenseId}`);
}

export async function recordReimbursementAction(input: Record<string, unknown>): Promise<ReimbursementActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  // Sending money to an employee is the finance manager's act.
  if (!canApproveTransactions(user)) throw new Error("Forbidden");
  const blocked = await paymentGate(user.id, input.code);
  if (blocked) return { ok: false, error: blocked };

  const method = String(input.method ?? "bank_transfer");
  if (!isValidPaymentMethod(method)) return { ok: false, fieldErrors: { method: "Unknown payment method." } };

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, fieldErrors: { amount: "Enter a reimbursement amount." } };

  const expenseId = String(input.expenseId ?? "");
  if (!expenseId) return { ok: false, fieldErrors: { expenseId: "Missing expense reference." } };

  const fundAccountKey = String(input.fundAccountKey ?? "");
  let fundAccountId: string | null = null;
  let fundAccountType: RecordReimbursementData["fundAccountType"] = null;
  if (fundAccountKey) {
    const [type, accountId] = fundAccountKey.split(":");
    if (isValidFundAccountType(type) && accountId) {
      fundAccountType = type;
      fundAccountId = accountId;
    }
  }

  const data: RecordReimbursementData = {
    expenseId,
    amount,
    method,
    transactionReference: (input.transactionReference as string)?.trim() || null,
    paymentDate: String(input.paymentDate ?? new Date().toISOString().slice(0, 10)),
    fundAccountId,
    fundAccountType,
    notes: (input.notes as string)?.trim() || null,
  };

  const res = await recordReimbursement(data, user.id, user.email);
  if (!res.ok) return { ok: false, error: res.reason };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "record",
    entity: "transaction",
    entityId: res.payoutId,
    entityLabel: "Reimbursement payment",
    summary: `Sent ${amount} through Razorpay for expense ${expenseId}`,
  });
  revalidate(expenseId);
  return { ok: true, id: res.payoutId };
}
