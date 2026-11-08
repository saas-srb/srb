"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageFiscalPeriods } from "@/lib/fms-roles";
import { createFiscalPeriod, closePeriod, reopenPeriod } from "@/lib/products/cashflow-ai/fiscal-periods";

function revalidate() {
  revalidatePath("/cashflow-ai/settings/fiscal-periods");
  revalidatePath("/cashflow-ai/reports/balance-sheet");
  revalidatePath("/cashflow-ai/general-ledger");
  revalidatePath("/cashflow-ai/trial-balance");
}

export async function createFiscalPeriodAction(formData: FormData): Promise<void> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageFiscalPeriods(user)) throw new Error("Forbidden");

  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (!name || !startDate || !endDate) return;

  await createFiscalPeriod(
    { name, startDate: new Date(`${startDate}T00:00:00`), endDate: new Date(`${endDate}T23:59:59`) },
    user.id
  );
  revalidate();
}

export async function closeFiscalPeriodAction(id: string): Promise<{ ok: boolean; reason?: string }> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageFiscalPeriods(user)) throw new Error("Forbidden");
  const res = await closePeriod(id, user.id, user.email);
  revalidate();
  return res;
}

export async function reopenFiscalPeriodAction(id: string): Promise<{ ok: boolean; reason?: string }> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageFiscalPeriods(user)) throw new Error("Forbidden");
  const res = await reopenPeriod(id, user.id, user.email);
  revalidate();
  return res;
}
