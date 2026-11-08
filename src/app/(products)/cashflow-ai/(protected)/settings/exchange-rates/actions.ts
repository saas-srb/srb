"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageAccounts } from "@/lib/fms-roles";
import { addExchangeRate, deleteExchangeRate } from "@/lib/products/cashflow-ai/exchange-rates";
import { isSupportedCurrency } from "@/lib/products/cashflow-ai/constants";

function revalidate() {
  revalidatePath("/cashflow-ai/settings/exchange-rates");
  revalidatePath("/cashflow-ai/reports/balance-sheet");
  revalidatePath("/cashflow-ai/reports/profit-and-loss");
  revalidatePath("/cashflow-ai/trial-balance");
  revalidatePath("/cashflow-ai/general-ledger");
}

export async function addExchangeRateAction(formData: FormData): Promise<void> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageAccounts(user)) throw new Error("Forbidden");

  const currency = String(formData.get("currency") ?? "").toUpperCase();
  const rateToBase = Number(formData.get("rateToBase"));
  const effectiveDate = String(formData.get("effectiveDate") ?? "");
  if (!isSupportedCurrency(currency) || !Number.isFinite(rateToBase) || rateToBase <= 0 || !effectiveDate) return;

  await addExchangeRate({ currency, rateToBase, effectiveDate: new Date(`${effectiveDate}T00:00:00`) }, user.id);
  revalidate();
}

export async function deleteExchangeRateAction(id: string): Promise<{ ok: boolean }> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageAccounts(user)) throw new Error("Forbidden");
  const res = await deleteExchangeRate(id, user.id);
  revalidate();
  return res;
}
