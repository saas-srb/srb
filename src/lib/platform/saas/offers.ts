import "server-only";
import { getStandardPlans } from "@/lib/platform/billing/plans";
import { buildShowcase, type ShowcasePlan } from "@/lib/platform/billing/showcase";
import { formatMoney } from "@/lib/platform/billing/types";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";

/**
 * The offers of the product, read from the plan catalogue: nothing here is written by hand. An offer is a plan whose real price is
 * below its list price (the same numbers the pricing page shows), a yearly price below twelve monthly ones, or the free plan.
 */
export interface PlanOffer {
  id: string;
  name: string;
  label: string;
  /** Formatted prices. */
  price: string;
  list: string;
  save: string;
  pct: number;
  /** Yearly alternative, when the plan offers it. */
  yearly: { price: string; vsMonthly: string; perMonth: string; pct: number } | null;
  seats: string;
  popular: boolean;
}

export interface Offers {
  plans: PlanOffer[];
  /** The biggest discount among the plans (0 when none has one). */
  topPct: number;
  topPlan: string;
  /** The label the catalogue gives the offer ("Launch offer"), or a generic one. */
  label: string;
  free: ShowcasePlan | null;
  /** Epoch ms of the offer's end: only when a price offer exists AND `SAAS_OFFER_ENDS_AT` is set to a future date — never an invented deadline. */
  endsAt: number | null;
  /** Paying yearly instead of twelve months, for every paid plan whose yearly price is below twelve monthly ones (real prices, no list price needed). */
  yearly: { id: string; name: string; price: string; /** Twelve months paid monthly. */ twelve: string; yearly: NonNullable<PlanOffer["yearly"]> }[];
  /** The cheapest paid plan's monthly price, e.g. "₹499" (null when no plan is sold online). */
  from: { name: string; price: string } | null;
  allPlans: ShowcasePlan[];
}

/** The configured end date while it is in the future; otherwise none. */
function offerEnd(): number | null {
  const set = SAAS_BRAND.offerEndsAt ? Date.parse(SAAS_BRAND.offerEndsAt) : NaN;
  return Number.isFinite(set) && set > Date.now() ? set : null;
}

export async function getOffers(): Promise<Offers> {
  const all = buildShowcase(await getStandardPlans().catch(() => []));
  const paid = all.filter((p) => p.kind === "paid");
  const plans: PlanOffer[] = paid.flatMap((p) => {
    const m = p.offer.monthly;
    const l = p.list.monthly;
    if (!m || !l || l <= m) return [];
    const y = p.offer.yearly;
    return [{
      id: p.id, name: p.name, label: p.offerLabel || "Offer",
      price: formatMoney(m, p.currency), list: formatMoney(l, p.currency), save: formatMoney(l - m, p.currency), pct: Math.round((1 - m / l) * 100),
      yearly: y && m * 12 > y ? { price: formatMoney(y, p.currency), vsMonthly: formatMoney(m * 12 - y, p.currency), perMonth: formatMoney(Math.round(y / 12), p.currency), pct: Math.round((1 - y / (m * 12)) * 100) } : null,
      seats: p.seats ? `Up to ${p.seats.toLocaleString("en-IN")} ${p.seats === 1 ? "user" : "users"}` : "Unlimited users",
      popular: p.popular,
    }];
  });
  const top = plans.reduce<PlanOffer | null>((a, b) => (!a || b.pct > a.pct ? b : a), null);
  const yearly = paid.flatMap((p) => {
    const m = p.offer.monthly;
    const y = p.offer.yearly;
    if (!m || !y || m * 12 <= y) return [];
    return [{ id: p.id, name: p.name, price: formatMoney(m, p.currency), twelve: formatMoney(m * 12, p.currency), yearly: { price: formatMoney(y, p.currency), vsMonthly: formatMoney(m * 12 - y, p.currency), perMonth: formatMoney(Math.round(y / 12), p.currency), pct: Math.round((1 - y / (m * 12)) * 100) } }];
  });
  const cheapest = paid.filter((p) => p.offer.monthly).reduce<(typeof paid)[number] | null>((a, b) => (!a || (b.offer.monthly ?? 0) < (a.offer.monthly ?? 0) ? b : a), null);
  return {
    plans,
    topPct: top?.pct ?? 0,
    topPlan: top?.name ?? "",
    label: plans.find((p) => p.label !== "Offer")?.label ?? "Launch offer",
    free: all.find((p) => p.kind === "free") ?? null,
    endsAt: top ? offerEnd() : null,
    yearly,
    from: cheapest ? { name: cheapest.name, price: formatMoney(cheapest.offer.monthly ?? 0, cheapest.currency) } : null,
    allPlans: all,
  };
}
