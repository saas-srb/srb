"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTaxConfig } from "@/lib/fms-roles";
import { getTaxConfig, updateTaxConfig } from "@/lib/products/cashflow-ai/tax-config";

function revalidate() {
  revalidatePath("/cashflow-ai/settings/tax-config");
}

export async function addTaxRateAction(formData: FormData): Promise<void> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTaxConfig(user)) throw new Error("Forbidden");

  const name = String(formData.get("name") ?? "").trim();
  const ratePercent = Number(formData.get("ratePercent"));
  if (!name || !Number.isFinite(ratePercent) || ratePercent < 0) return;

  const config = await getTaxConfig();
  await updateTaxConfig([...config.rates, { name, ratePercent, isActive: true }], user.id);
  revalidate();
}

export async function deleteTaxRateAction(id: string): Promise<{ ok: boolean }> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTaxConfig(user)) throw new Error("Forbidden");
  const config = await getTaxConfig();
  await updateTaxConfig(config.rates.filter((r) => r.id !== id), user.id);
  revalidate();
  return { ok: true };
}

export async function toggleTaxRateAction(id: string): Promise<{ ok: boolean }> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTaxConfig(user)) throw new Error("Forbidden");
  const config = await getTaxConfig();
  await updateTaxConfig(
    config.rates.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r)),
    user.id
  );
  revalidate();
  return { ok: true };
}
