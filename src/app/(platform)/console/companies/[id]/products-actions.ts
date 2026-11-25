"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { setCompanyProducts } from "@/lib/platform/products/company-products";
import { repriceSubscription } from "@/lib/platform/billing/subscriptions";

/** The platform team sets what a company has. Access changes at once; a paid subscription is re-priced from its next renewal. */
export async function setCompanyProductsAction(companyId: string, input: { products: string[]; website: string; externalUrl?: string; reason: string }): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const user = await requirePlatformPermission("subscriptions.manage");
  const reason = String(input?.reason ?? "").trim().slice(0, 300);
  if (reason.length < 3) return { ok: false, error: "Say why you are changing this." };
  const mode = input.website === "external" || input.website === "none" ? input.website : "platform";
  const externalUrl = String(input.externalUrl ?? "").trim() || undefined;
  const saved = await setCompanyProducts(String(companyId), { products: (input.products ?? []).slice(0, 40).map(String), website: mode === "external" ? { mode, externalUrl } : { mode } }, { id: user.id, reason });
  if (!saved.ok) return saved;
  const company = await getCompany(String(companyId));
  const billed = company?.products ? await repriceSubscription(company._id, user.id, { products: company.products }) : null;
  revalidatePath(`/console/companies/${companyId}`);
  if (billed && !billed.ok) return { ok: true, message: `Products saved. Billing was not changed: ${billed.error}` };
  return { ok: true, message: `Products saved. ${billed?.ok ? (billed.message ?? "") : ""}`.trim() };
}
