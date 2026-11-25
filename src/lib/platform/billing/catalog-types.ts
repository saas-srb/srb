import { formatMoney, type BillingInterval, type PlanLimits } from "@/lib/platform/billing/types";

/**
 * Coupon shapes (platform-level `billing_coupons`,
 * `billing_coupon_redemptions`). Client-safe — the data
 * access is in `coupons.ts`. Money is integer paise.
 */

export type CouponDuration = "once" | "repeating" | "forever";

export interface Coupon {
  _id: string;
  /** As entered (upper-cased); matched case-insensitively via `codeLower`. */
  code: string;
  /** Unique index. */
  codeLower: string;
  description: string;
  kind: "percent" | "fixed";
  /** 0 < percentOff ≤ 100 (up to 2 decimals) when kind = "percent". */
  percentOff: number | null;
  /** Paise off, when kind = "fixed". Capped at the quote subtotal. */
  amountOff: number | null;
  /** Plan ids it applies to, or every plan. */
  plans: string[] | "all";
  /** Billing cycles it applies to (at least one). */
  intervals: BillingInterval[];
  /** once = first billing cycle only; repeating = `durationCycles` cycles; forever = every cycle. */
  duration: CouponDuration;
  durationCycles: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
  /** Total redemptions across all companies; null = unlimited. */
  maxRedemptions: number | null;
  /** Redemptions per company; null = unlimited. */
  maxPerCompany: number | null;
  /** Only companies that have never paid for a subscription. */
  firstTimeOnly: boolean;
  active: boolean;
  /** Live (not released) redemptions — maintained atomically by `redeemCoupon`/`releaseRedemption`. */
  redeemedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CouponRedemption {
  _id: string;
  couponId: string;
  code: string;
  companyId: string;
  planId: string;
  interval: BillingInterval;
  /** Discount given on the first charge (paise, pre-tax), as quoted. */
  discount: number;
  /** Checkout reference (e.g. the provider order/subscription id); idempotency key per coupon + company. */
  reference: string | null;
  status: "redeemed" | "released";
  /** Billing cycles already charged with this discount (incremented by `markRedemptionCycleBilled`). */
  cyclesBilled: number;
  /** Copied from the coupon at redemption: 1 for once, N for repeating, null for forever. */
  durationCycles: number | null;
  redeemedAt: Date;
  releasedAt: Date | null;
  releaseReason: string | null;
  /** Internal uniqueness slots, removed on release. */
  slotKey?: string;
  refKey?: string;
}

export function describeCouponDiscount(c: Pick<Coupon, "kind" | "percentOff" | "amountOff">, currency = "INR"): string {
  return c.kind === "percent" ? `${c.percentOff}% off` : `${formatMoney(c.amountOff ?? 0, currency)} off`;
}

export function describeCouponDuration(c: Pick<Coupon, "duration" | "durationCycles">): string {
  if (c.duration === "once") return "First cycle";
  if (c.duration === "forever") return "Every cycle";
  return `${c.durationCycles} cycle${c.durationCycles === 1 ? "" : "s"}`;
}

export type CouponStatus = "active" | "inactive" | "scheduled" | "expired" | "used_up";

export function couponStatus(c: Pick<Coupon, "active" | "validFrom" | "validUntil" | "maxRedemptions" | "redeemedCount">, now = Date.now()): CouponStatus {
  if (!c.active) return "inactive";
  if (c.validUntil && new Date(c.validUntil).getTime() <= now) return "expired";
  if (c.validFrom && new Date(c.validFrom).getTime() > now) return "scheduled";
  if (c.maxRedemptions !== null && c.redeemedCount >= c.maxRedemptions) return "used_up";
  return "active";
}
