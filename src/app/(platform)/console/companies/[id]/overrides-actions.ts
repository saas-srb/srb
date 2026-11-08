"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { saveCompanyOverrides, type OverridesResult } from "@/lib/platform/billing/overrides-admin";
import type { OverridesInput } from "@/lib/platform/billing/overrides";

/** Platform admin: change what one company may use, beyond its plan. Needs the "manage subscriptions" permission; audited in the service. */
export async function saveCompanyOverridesAction(companyId: string, input: OverridesInput): Promise<OverridesResult> {
  const user = await requirePlatformPermission("subscriptions.manage");
  const res = await saveCompanyOverrides(String(companyId ?? ""), input ?? {}, user.id);
  if (res.ok) {
    revalidatePath(`/console/companies/${companyId}`);
    revalidatePath("/console", "layout");
  }
  return res;
}
