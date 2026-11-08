import "server-only";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { burnCredits } from "@/lib/platform/billing/credits-store";
import { TOPUP_SERVICES, overflowOf } from "@/lib/platform/billing/topup-catalog";
import type { UsageMetric } from "@/lib/platform/billing/types";

/**
 * Called after every metered use (`recordUsage`): the part of it that went beyond the plan's OWN monthly allowance is paid from the company's
 * top-up credits. Separate from `credits-store` because it needs entitlements, which themselves read the store. Never throws: metering must
 * not fail because of credits.
 */
export async function burnAfterUsage(metric: UsageMetric, before: number, after: number): Promise<void> {
  try {
    const def = TOPUP_SERVICES.find((d) => d.metric === metric);
    if (!def || !def.consumable) return;
    const companyId = await currentCompanyIdOrNull();
    if (!companyId) return;
    const base = (await getEntitlements()).baseLimits?.[def.limitKey];
    if (base === null || base === undefined) return; // unlimited: nothing to cover
    const overflow = overflowOf(before, after, base * def.perUnit);
    if (overflow > 0) await burnCredits(companyId, def.key, overflow);
  } catch (err) {
    console.error("[credits] burn failed", metric, err);
  }
}
