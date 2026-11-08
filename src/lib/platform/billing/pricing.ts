import { BILLING_INTERVAL_IDS, type BillingInterval, type Plan, type PlanPriceVersion } from "@/lib/platform/billing/types";

/**
 * Reading a plan's prices — client-safe, no data access. Every caller that
 * needs "what does this plan cost per <cycle>" should go through here, so
 * older plan documents (priceMonthly/priceYearly only) and newer ones
 * (`intervals` + `prices` + price versions) read the same way.
 */

type PriceSource = Pick<Plan, "priceMonthly" | "priceYearly" | "intervals" | "prices">;

/** Billing cycles the plan offers, in catalogue order. */
export function planIntervals(plan: Pick<Plan, "intervals">): BillingInterval[] {
  const on = plan.intervals && plan.intervals.length > 0 ? new Set(plan.intervals) : new Set<BillingInterval>(["monthly", "yearly"]);
  return BILLING_INTERVAL_IDS.filter((i) => on.has(i));
}

/** Current price for a cycle (paise, pre-tax), or null when the plan doesn't offer that cycle. */
export function planPrice(plan: PriceSource, interval: BillingInterval): number | null {
  if (!planIntervals(plan).includes(interval)) return null;
  const explicit = plan.prices?.[interval];
  if (typeof explicit === "number") return explicit;
  if (interval === "monthly") return plan.priceMonthly;
  if (interval === "yearly") return plan.priceYearly;
  return null;
}

/** The current price version (older docs without history are version 1). */
export function currentPriceVersion(plan: Pick<Plan, "priceVersion">): number {
  return plan.priceVersion ?? 1;
}

/**
 * The price a subscription pays: the version it was bought at when known,
 * otherwise the current catalogue price. Returns null for a cycle that version didn't offer.
 */
export function planPriceAtVersion(plan: PriceSource & Pick<Plan, "priceVersion" | "priceHistory">, interval: BillingInterval, version: number | null | undefined): number | null {
  if (version && version !== currentPriceVersion(plan)) {
    const old: PlanPriceVersion | undefined = plan.priceHistory?.find((v) => v.version === version);
    if (old) return old.intervals.includes(interval) ? (old.prices[interval] ?? null) : null;
  }
  return planPrice(plan, interval);
}

/** Trial length for a plan: its own value, or the platform default when blank. */
export function resolveTrialDays(plan: Pick<Plan, "trialDays"> | null | undefined, platformDefault: number): number {
  return typeof plan?.trialDays === "number" ? plan.trialDays : platformDefault;
}
