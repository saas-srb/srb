import "server-only";
import { getPlan, listPlans } from "@/lib/platform/billing/plans";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { planIntervals, planPrice } from "@/lib/platform/billing/pricing";
import { parseSignupInterval, signupTrialDays } from "@/lib/platform/billing/signup-plan-rule";
import type { BillingInterval } from "@/lib/platform/billing/types";

export interface SignupPlan {
  planId: string;
  name: string;
  interval: BillingInterval;
  trialDays: number;
  currency: string;
  /** Per cycle, paise, before tax. */
  price: number;
}

/**
 * The plan a visitor picked on the pricing page, if it can really be started: it exists, is on sale, is paid (Free needs no trial and "contact us"
 * plans are not sold online) and offers the chosen cycle. Anything else is null, and sign-up simply gives the default plan, so a stale or edited
 * link never breaks registration.
 */
export async function resolveSignupPlan(planId: unknown, interval: unknown): Promise<SignupPlan | null> {
  const id = typeof planId === "string" ? planId.trim().slice(0, 64) : "";
  if (!id) return null;
  const plan = await getPlan(id).catch(() => null);
  if (!plan || !plan.active || plan.lifetimeFree || plan.contactSales) return null;
  const offered = planIntervals(plan);
  const wanted = parseSignupInterval(interval);
  const chosen: BillingInterval = wanted && offered.includes(wanted) ? wanted : offered[0];
  const price = planPrice(plan, chosen);
  if (!chosen || price === null) return null;
  const defaults = (await getBillingSettings().catch(() => null))?.billing.defaultTrialDays ?? 0;
  return { planId: plan._id, name: plan.name, interval: chosen, trialDays: signupTrialDays(plan.trialDays, defaults), currency: plan.currency, price };
}

/**
 * The paid plan whose free trial starts when someone signs up for "All products" without picking a plan (the free plan
 * holds one product): the cheapest plan on sale that allows every product. Null when there is none.
 */
export async function allProductsTrialPlan(): Promise<SignupPlan | null> {
  const plans = (await listPlans({ activeOnly: true }).catch(() => [])).filter((p) => !p.lifetimeFree && !p.contactSales && !p.maxProducts);
  plans.sort((a, b) => (planPrice(a, "monthly") ?? Number.MAX_SAFE_INTEGER) - (planPrice(b, "monthly") ?? Number.MAX_SAFE_INTEGER) || a.sortOrder - b.sortOrder);
  return plans.length ? resolveSignupPlan(plans[0]._id, "monthly") : null;
}
