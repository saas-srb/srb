import "server-only";
import { getPlan } from "@/lib/platform/billing/plans";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { addonAvailableOnPlan, addonUnitPrice, getCompanyAddons, listAddons } from "@/lib/platform/billing/addons";
import { computeCouponDiscount, validateCoupon } from "@/lib/platform/billing/coupons";
import { describeCouponDiscount } from "@/lib/platform/billing/catalog-types";
import { planPrice } from "@/lib/platform/billing/pricing";
import type { BillingInterval, CompanyAddon } from "@/lib/platform/billing/types";

/**
 * The one place a price is worked out before a company pays: checkout,
 * plan changes and invoices all ask `quoteCheckout`. Amounts are pre-tax,
 * in paise; GST is split and added by the invoices workstream (`gst.ts`).
 *
 * Add-on lines come from `addons.ts`, the discount from `coupons.ts`.
 * Callers must only rely on the `Quote` shape.
 */

export interface QuoteLine {
  kind: "plan" | "addon" | "discount";
  /** Plan id, add-on id or coupon id. */
  refId: string;
  label: string;
  /** Pre-tax, paise. Discount lines are negative. */
  amount: number;
}

export interface Quote {
  planId: string;
  interval: BillingInterval;
  currency: string;
  lines: QuoteLine[];
  /** Plan + add-ons, before discount. */
  subtotal: number;
  /** Positive number of paise taken off. */
  discount: number;
  /** subtotal − discount; what GST is charged on. */
  taxable: number;
  gstRatePercent: number;
  /** Applied coupon, if the code was valid. */
  couponId: string | null;
  /** Why a supplied coupon code was not applied. */
  couponError: string | null;
}

export interface QuoteInput {
  planId: string;
  interval: BillingInterval;
  companyId?: string | null;
  couponCode?: string | null;
  addonIds?: string[];
}

/**
 * Add-on quantities requested. `addonIds` entries are add-on ids; repeat an
 * id, or write `"<id>:<qty>"`, for several units. When `addonIds` is omitted
 * and a company is given, the company's current add-ons are priced (renewals,
 * plan changes). Pass `[]` to price the plan alone.
 */
function requestedAddons(input: QuoteInput, held: CompanyAddon[]): Map<string, number> {
  const out = new Map<string, number>();
  if (input.addonIds === undefined) {
    for (const h of held) if (h.quantity > 0) out.set(h.addonId, h.quantity);
    return out;
  }
  for (const raw of input.addonIds) {
    const [id, q] = String(raw).split(":");
    const qty = q === undefined ? 1 : Number(q);
    if (!id || !Number.isInteger(qty) || qty <= 0) continue;
    out.set(id, (out.get(id) ?? 0) + qty);
  }
  return out;
}

/**
 * Lines: the plan, then one line per add-on (unit price × quantity for the
 * interval; 0 when the company holds it complimentary), then the coupon as a
 * negative line. Add-ons that don't exist, aren't available on the plan, or
 * are inactive (unless already held) are left out; quantities are capped at
 * the add-on's max. Percent coupons discount plan + add-ons, rounded to the
 * nearest paisa; fixed coupons are capped at the subtotal (see
 * `computeCouponDiscount`). All amounts are integer paise.
 */
export async function quoteCheckout(input: QuoteInput): Promise<Quote | null> {
  const [plan, settings] = await Promise.all([getPlan(input.planId), getBillingSettings()]);
  if (!plan) return null;
  // Current catalogue price; null when the plan doesn't offer this billing cycle.
  const price = planPrice(plan, input.interval);
  if (price === null) return null;
  const lines: QuoteLine[] = [{ kind: "plan", refId: plan._id, label: `${plan.name} (${input.interval})`, amount: price }];

  const held = input.companyId ? await getCompanyAddons(input.companyId) : [];
  const wanted = requestedAddons(input, held);
  if (wanted.size) {
    const defs = await listAddons();
    for (const addon of defs) {
      const qtyWanted = wanted.get(addon._id);
      if (!qtyWanted) continue;
      const holding = held.find((h) => h.addonId === addon._id);
      if (!addon.active && !holding) continue;
      if (!addonAvailableOnPlan(addon, plan._id) && !holding?.complimentary) continue;
      const max = addon.type === "module" ? 1 : addon.maxQuantity;
      const qty = max === null ? qtyWanted : Math.min(qtyWanted, max);
      const free = Boolean(holding?.complimentary);
      lines.push({
        kind: "addon",
        refId: addon._id,
        label: `${addon.name}${qty > 1 ? ` × ${qty}` : ""} (${free ? "complimentary" : input.interval})`,
        amount: free ? 0 : addonUnitPrice(addon, input.interval) * qty,
      });
    }
  }
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);

  let discount = 0;
  let couponId: string | null = null;
  let couponError: string | null = null;
  if (input.couponCode && String(input.couponCode).trim()) {
    const v = await validateCoupon({ code: input.couponCode, companyId: input.companyId ?? null, planId: plan._id, interval: input.interval });
    if (v.ok) {
      discount = computeCouponDiscount(v.coupon, subtotal);
      couponId = v.coupon._id;
      lines.push({ kind: "discount", refId: v.coupon._id, label: `Coupon ${v.coupon.code} (${describeCouponDiscount(v.coupon, plan.currency || settings.billing.currency)})`, amount: -discount });
    } else couponError = v.error;
  }

  return {
    planId: plan._id,
    interval: input.interval,
    currency: plan.currency || settings.billing.currency,
    lines,
    subtotal,
    discount,
    taxable: subtotal - discount,
    gstRatePercent: settings.tax.gstRatePercent,
    couponId,
    couponError,
  };
}
