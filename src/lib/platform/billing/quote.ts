import "server-only";
import { getPlan } from "@/lib/platform/billing/plans";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { computeCouponDiscount, validateCoupon } from "@/lib/platform/billing/coupons";
import { describeCouponDiscount } from "@/lib/platform/billing/catalog-types";
import { planPrice } from "@/lib/platform/billing/pricing";
import type { BillingInterval } from "@/lib/platform/billing/types";

/**
 * The one place a price is worked out before a company pays: checkout,
 * plan changes and invoices all ask `quoteCheckout`. Amounts are pre-tax,
 * in paise; GST is split and added by the invoices workstream (`gst.ts`).
 *
 * The discount comes from `coupons.ts`.
 * Callers must only rely on the `Quote` shape.
 */

export interface QuoteLine {
  kind: "plan" | "topup" | "discount";
  /** Plan id or coupon id. */
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
  /** The plan price, before discount. */
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
}

/**
 * Lines: the plan, then the coupon as a negative line. Percent coupons discount the plan price, rounded to the nearest paisa; fixed
 * coupons are capped at the subtotal (see `computeCouponDiscount`). All amounts are integer paise.
 */
export async function quoteCheckout(input: QuoteInput): Promise<Quote | null> {
  const [plan, settings] = await Promise.all([getPlan(input.planId), getBillingSettings()]);
  if (!plan) return null;
  // Current catalogue price; null when the plan doesn't offer this billing cycle.
  const price = planPrice(plan, input.interval);
  if (price === null) return null;
  const lines: QuoteLine[] = [{ kind: "plan", refId: plan._id, label: `${plan.name} (${input.interval})`, amount: price }];

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
