"use server";

import { repriceSubscription } from "@/lib/platform/billing/subscriptions";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { saveAddon, setAddonActive, setCompanyAddon, type AddonInput, type AddonSaveResult, type CompanyAddonResult } from "@/lib/platform/billing/addons";

const nullableNumber = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export async function saveAddonAction(id: string | null, input: AddonInput): Promise<AddonSaveResult> {
  const user = await requirePlatformPermission("addons.manage");
  const res = await saveAddon(
    id ? String(id) : null,
    {
      name: String(input?.name ?? ""),
      description: String(input?.description ?? ""),
      priceMonthly: Number(input?.priceMonthly),
      priceYearly: Number(input?.priceYearly),
      type: input?.type === "module" ? "module" : "limit",
      limitKey: input?.limitKey ?? null,
      amountPerUnit: nullableNumber(input?.amountPerUnit),
      moduleKey: input?.moduleKey ? String(input.moduleKey) : null,
      plans: input?.plans === "all" ? "all" : Array.isArray(input?.plans) ? input.plans.map(String) : [],
      maxQuantity: nullableNumber(input?.maxQuantity),
      active: Boolean(input?.active),
      sortOrder: Number(input?.sortOrder) || 0,
    },
    user.id,
  );
  if (res.ok) revalidatePath("/console/addons", "layout");
  return res;
}

export async function setAddonActiveAction(id: string, active: boolean): Promise<{ ok: boolean }> {
  const user = await requirePlatformPermission("addons.manage");
  const ok = await setAddonActive(String(id), Boolean(active), user.id);
  if (ok) revalidatePath("/console/addons", "layout");
  return { ok };
}

/** Add, change or remove (quantity 0) an add-on for one company, from its detail page. */
export async function setCompanyAddonAction(companyId: string, addonId: string, quantity: number, complimentary: boolean): Promise<CompanyAddonResult> {
  const user = await requirePlatformPermission("addons.manage");
  const res = await setCompanyAddon(String(companyId), String(addonId), Number(quantity), { complimentary: Boolean(complimentary), actorId: user.id });
  if (res.ok) {
    // A paying company's next renewal must reflect its new add-ons (no-op without a live subscription).
    const repriced = await repriceSubscription(String(companyId), user.id).catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
    if (!repriced.ok) await recordPlatformAudit({ actorId: user.id, action: "subscription.reprice_failed", target: { type: "company", id: String(companyId) }, companyId: String(companyId), details: { reason: "addon_change", error: repriced.error } });
    revalidatePath(`/console/companies/${companyId}`);
    revalidatePath("/console/addons");
  }
  return res;
}
