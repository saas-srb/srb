"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-roles";
import { recordAssetExpense, isValidAssetExpenseCategory, type RecordAssetExpenseData } from "@/lib/products/cashflow-ai/asset-expenses";
import { isValidPaymentMethod, isValidFundAccountType } from "@/lib/products/cashflow-ai/constants";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";

export interface AssetExpenseActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function revalidate(assetId?: string) {
  revalidatePath("/cashflow-ai/asset-expenses");
  revalidatePath("/cashflow-ai/assets");
  revalidatePath("/cashflow-ai/transactions");
  revalidatePath("/cashflow-ai");
  if (assetId) revalidatePath(`/cashflow-ai/assets/${assetId}`);
}

export async function recordAssetExpenseAction(input: Record<string, unknown>): Promise<AssetExpenseActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTransactions(user)) throw new Error("Forbidden");

  const assetId = String(input.assetId ?? "");
  if (!assetId) return { ok: false, fieldErrors: { assetId: "Missing asset reference." } };

  const category = String(input.category ?? "");
  if (!isValidAssetExpenseCategory(category)) return { ok: false, fieldErrors: { category: "Select a category." } };

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, fieldErrors: { amount: "Enter an expense amount." } };

  const method = String(input.method ?? "bank_transfer");
  if (!isValidPaymentMethod(method)) return { ok: false, fieldErrors: { method: "Unknown payment method." } };

  const fundAccountKey = String(input.fundAccountKey ?? "");
  let fundAccountId: string | null = null;
  let fundAccountType: RecordAssetExpenseData["fundAccountType"] = null;
  if (fundAccountKey) {
    const [type, accountId] = fundAccountKey.split(":");
    if (isValidFundAccountType(type) && accountId) {
      fundAccountType = type;
      fundAccountId = accountId;
    }
  }

  const data: RecordAssetExpenseData = {
    assetId,
    category,
    amount,
    expenseDate: String(input.expenseDate ?? new Date().toISOString().slice(0, 10)),
    method,
    vendorId: (input.vendorId as string) || null,
    vendorName: (input.vendorName as string)?.trim() || null,
    notes: (input.notes as string)?.trim() || null,
    fundAccountId,
    fundAccountType,
  };

  const res = await recordAssetExpense(data, user.id, user.email);
  if (!res.ok) return { ok: false, error: res.reason };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "record",
    entity: "transaction",
    entityId: res.expense._id,
    entityLabel: res.expense.expenseNumber,
    summary: `${res.expense.category} expense of ${amount} for ${res.expense.assetCode}`,
  });
  revalidate(assetId);
  return { ok: true, id: res.expense._id };
}
