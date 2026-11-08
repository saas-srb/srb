"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-roles";
import { recordTransfer, type RecordTransferData } from "@/lib/products/cashflow-ai/fund-transfers";
import { isValidFundAccountType } from "@/lib/products/cashflow-ai/constants";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";

export interface TransferActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function revalidate() {
  revalidatePath("/cashflow-ai/transfers");
  revalidatePath("/cashflow-ai/bank-accounts");
  revalidatePath("/cashflow-ai/cash-accounts");
  revalidatePath("/cashflow-ai/transactions");
  revalidatePath("/cashflow-ai");
}

export async function recordTransferAction(input: Record<string, unknown>): Promise<TransferActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTransactions(user)) throw new Error("Forbidden");

  const fromAccountType = String(input.fromAccountType ?? "");
  const toAccountType = String(input.toAccountType ?? "");
  if (!isValidFundAccountType(fromAccountType) || !isValidFundAccountType(toAccountType)) {
    return { ok: false, fieldErrors: { fromAccountType: "Select an account type." } };
  }

  const fromAccountId = String(input.fromAccountId ?? "");
  const toAccountId = String(input.toAccountId ?? "");
  if (!fromAccountId) return { ok: false, fieldErrors: { fromAccountId: "Select a source account." } };
  if (!toAccountId) return { ok: false, fieldErrors: { toAccountId: "Select a destination account." } };

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, fieldErrors: { amount: "Enter a transfer amount." } };

  const data: RecordTransferData = {
    fromAccountId,
    fromAccountType,
    toAccountId,
    toAccountType,
    amount,
    transferDate: String(input.transferDate ?? new Date().toISOString().slice(0, 10)),
    referenceNumber: (input.referenceNumber as string)?.trim() || null,
    notes: (input.notes as string)?.trim() || null,
  };

  const res = await recordTransfer(data, user.id, user.email);
  if (!res.ok) return { ok: false, error: res.reason };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "fund_transfer",
    entityId: res.transfer._id,
    entityLabel: res.transfer.transferNumber,
    summary: `${res.transfer.fromAccountName} → ${res.transfer.toAccountName}: ${amount}`,
  });
  revalidate();
  return { ok: true, id: res.transfer._id };
}
