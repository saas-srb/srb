"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canReconcile } from "@/lib/fms-roles";
import { createStatementLine, matchStatementLine, flagStatementLine, type StatementLineWriteData } from "@/lib/products/cashflow-ai/bank-reconciliation";

export interface BankReconciliationActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function revalidate(bankAccountId: string) {
  revalidatePath(`/cashflow-ai/bank-reconciliation/${bankAccountId}`);
  revalidatePath("/cashflow-ai/transactions");
  revalidatePath("/cashflow-ai");
}

export async function createStatementLineAction(input: Record<string, unknown>): Promise<BankReconciliationActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canReconcile(user)) throw new Error("Forbidden");

  const bankAccountId = String(input.bankAccountId ?? "");
  if (!bankAccountId) return { ok: false, fieldErrors: { bankAccountId: "Missing bank account." } };
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount === 0) return { ok: false, fieldErrors: { amount: "Enter a signed amount (negative for withdrawals)." } };
  const description = String(input.description ?? "").trim();
  if (!description) return { ok: false, fieldErrors: { description: "Enter a description." } };

  const data: StatementLineWriteData = {
    bankAccountId,
    statementDate: String(input.statementDate ?? new Date().toISOString().slice(0, 10)),
    description,
    amount,
    notes: (input.notes as string)?.trim() || null,
  };
  const line = await createStatementLine(data, user.id);
  revalidate(bankAccountId);
  return { ok: true, id: line._id };
}

export async function matchStatementLineAction(lineId: string, transactionId: string, bankAccountId: string): Promise<BankReconciliationActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canReconcile(user)) throw new Error("Forbidden");
  const res = await matchStatementLine(lineId, transactionId, user.id, user.email);
  if (!res.ok) return { ok: false, error: res.reason };
  revalidate(bankAccountId);
  return { ok: true };
}

export async function flagStatementLineAction(
  lineId: string,
  status: "duplicate" | "needs_review" | "unmatched" | "partially_matched",
  bankAccountId: string
): Promise<BankReconciliationActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canReconcile(user)) throw new Error("Forbidden");
  const res = await flagStatementLine(lineId, status, user.id, user.email);
  if (!res.ok) return { ok: false, error: res.reason };
  revalidate(bankAccountId);
  return { ok: true };
}
