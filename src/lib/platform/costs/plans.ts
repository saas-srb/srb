import "server-only";
import { countCompaniesByPlan, getPlan } from "@/lib/platform/billing/plans";
import { planPrice } from "@/lib/platform/billing/pricing";
import type { PlanInputForCost } from "@/lib/platform/costs/model";

/** A plan as the cost model sees it: its monthly price (paise, before GST), its limits and how many companies are on it. */
export async function toCostPlan(planId: string, counts?: Map<string, number>): Promise<PlanInputForCost | null> {
  const plan = await getPlan(planId);
  if (!plan) return null;
  const byPlan = counts ?? (await countCompaniesByPlan());
  return {
    id: plan._id,
    name: plan.name,
    priceMonthlyPaise: planPrice(plan, "monthly") ?? 0,
    limits: { aiTokensPerMonth: plan.limits.aiTokensPerMonth, storageMb: plan.limits.storageMb, emailsPerMonth: plan.limits.emailsPerMonth ?? null, voiceMinutesPerMonth: plan.limits.voiceMinutesPerMonth ?? null, seats: plan.limits.seats },
    lifetimeFree: plan.lifetimeFree === true,
    contactSales: plan.contactSales === true,
    companies: byPlan.get(plan._id) ?? 0,
  };
}

