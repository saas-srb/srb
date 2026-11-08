import "server-only";
import { cache } from "react";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { getCompanySubscription } from "@/lib/platform/billing/subscription";
import { getStandardPlans } from "@/lib/platform/billing/plans";
import { planPrice } from "@/lib/platform/billing/pricing";
import { nextPlanIn, type PlanStep } from "@/lib/platform/billing/upgrade-offer-rule";

export type { UpgradeOffer } from "@/lib/platform/billing/upgrade-offer-rule";

/**
 * The one-step-up offer the "Upgrade plan" strip shows: Free → Starter, Starter → Growth, Growth → Business (always the next plan by price, never
 * a jump). Null when there is nothing to offer: the platform's own company, complimentary workspaces, the top plan sold online, or any failure
 * (a strip must never break a page). Once per request.
 */
export const getUpgradeOffer = cache(async () => {
  try {
    const companyId = await currentCompanyIdOrNull();
    if (!companyId) return null;
    const sub = await getCompanySubscription(companyId);
    if (!sub || sub.status === "internal") return null;
    const plans = await getStandardPlans();
    const steps: PlanStep[] = plans.map((p) => ({ id: p._id, name: p.name, monthly: p.contactSales ? null : p.lifetimeFree ? 0 : planPrice(p, "monthly"), currency: p.currency, active: p.active !== false }));
    return nextPlanIn(steps, sub.planId);
  } catch {
    return null;
  }
});
