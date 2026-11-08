"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { adminSetComplimentary } from "@/lib/platform/billing/subscriptions-admin";
import type { BillingActionResult } from "@/lib/platform/billing/subscriptions";

/** Lifetime free access for one company, from its detail page. `after` says what happens when it is taken away. Audited in the service. */
export async function setFreeAccessAction(companyId: string, on: boolean, after: "subscribe" | "trial" = "subscribe"): Promise<BillingActionResult> {
  const user = await requirePlatformPermission("subscriptions.manage");
  const res = await adminSetComplimentary(String(companyId ?? ""), Boolean(on), user.id, after === "trial" ? "trial" : "subscribe");
  if (res.ok) {
    revalidatePath("/console", "layout");
    revalidatePath("/", "layout");
  }
  return res;
}
