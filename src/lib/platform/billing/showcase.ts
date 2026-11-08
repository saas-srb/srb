import { PLAN_FLAGS, USAGE_SERVICES, formatLimitValue, type BillingInterval, type Plan } from "@/lib/platform/billing/types";
import { planPrice } from "@/lib/platform/billing/pricing";
import { signupTrialDays } from "@/lib/platform/billing/signup-plan-rule";

/**
 * A plan as the pricing screens show it (the marketing page and the in-app plan chooser share it). Pure and serialisable: built on the
 * server from the catalogue, drawn by `PlanShowcase`. Prices in paise, before tax. `list` = the "usual" price shown struck through.
 */
export interface ShowcasePlan {
  id: string;
  name: string;
  description: string;
  currency: string;
  kind: "free" | "paid" | "contact";
  offer: Record<BillingInterval, number | null>;
  list: Record<BillingInterval, number | null>;
  offerLabel: string;
  seats: number | null;
  panels: string;
  flags: string[];
  highlights: string[];
  /** Every paid service with this plan's allowance, in `USAGE_SERVICES` order (seats excluded: it is shown as "Up to N users"). */
  limits: { key: string; label: string; /** Short name and value for the cards ("AI", "300K"). */ short: string; shortValue: string; provider: string | null; value: string; included: boolean; /** The number (null = unlimited) for drawing bars. */ raw: number | null }[];
  popular: boolean;
  /** Free-trial days a new sign-up on this plan gets (paid plans). */
  trialDays: number;
}

const n1 = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 1 });
const SHORT: Record<string, { label: string; fmt: (v: number) => string }> = {
  storageMb: { label: "Storage", fmt: (v) => (v >= 1024 ? `${n1(v / 1024)} GB` : `${v} MB`) },
  aiTokensPerMonth: { label: "AI", fmt: (v) => (v >= 1_000_000 ? `${n1(v / 1_000_000)}M` : `${Math.round(v / 1000)}K`) },
  emailsPerMonth: { label: "Emails", fmt: (v) => v.toLocaleString("en-IN") },
  voiceMinutesPerMonth: { label: "Voice", fmt: (v) => `${v} min` },
  customDomains: { label: "Domains", fmt: (v) => String(v) },
};

export function buildShowcase(plans: Plan[], defaultTrialDays = 30): ShowcasePlan[] {
  const paid = plans.filter((p) => !p.lifetimeFree && !p.contactSales);
  const popularId = paid.length >= 3 ? paid[Math.floor(paid.length / 2)]._id : (paid[0]?._id ?? "");
  return plans.map((p) => ({
    id: p._id,
    name: p.name,
    description: p.description,
    currency: p.currency,
    kind: p.contactSales ? "contact" : p.lifetimeFree ? "free" : "paid",
    offer: { monthly: planPrice(p, "monthly"), yearly: planPrice(p, "yearly") },
    list: { monthly: p.listPrices?.monthly ?? null, yearly: p.listPrices?.yearly ?? null },
    offerLabel: p.offerLabel ?? "",
    seats: p.limits.seats ?? null,
    // Every plan has every product; only the limits differ.
    panels: "Every product and feature",
    flags: (p.flags ?? []).flatMap((f) => PLAN_FLAGS.find((d) => d.key === f)?.label ?? []),
    highlights: p.highlights ?? [],
    limits: USAGE_SERVICES.filter((u) => u.limitKey !== "seats").map((u) => {
      const v = p.limits[u.limitKey];
      const sh = SHORT[u.limitKey];
      const shortValue = v === null ? "Unlimited" : typeof v !== "number" || v === 0 ? (u.comingSoon ? "Soon" : "—") : (sh?.fmt(v) ?? String(v));
      return { key: u.limitKey, label: u.label, short: sh?.label ?? u.label, shortValue, provider: u.provider, value: u.comingSoon && (v === 0 || v === undefined) ? "Coming soon" : formatLimitValue(u.limitKey, v ?? (u.limitKey in p.limits ? null : 0)), included: v === null || (typeof v === "number" && v > 0), raw: typeof v === "number" ? v : null };
    }),
    popular: p._id === popularId,
    trialDays: p.lifetimeFree || p.contactSales ? 0 : signupTrialDays(p.trialDays, defaultTrialDays),
  }));
}
