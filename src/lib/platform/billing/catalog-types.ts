import type { ModuleKey } from "@/lib/platform/onboarding/catalog";
import { formatMoney, type BillingInterval, type PlanLimits } from "@/lib/platform/billing/types";

/**
 * Coupon and add-on shapes (platform-level `billing_coupons`,
 * `billing_coupon_redemptions`, `billing_addons`). Client-safe — the data
 * access is in `coupons.ts` and `addons.ts`. Money is integer paise.
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

export type AddonLimitKey = keyof PlanLimits;
export const ADDON_LIMIT_KEYS: { key: AddonLimitKey; label: string; unit: string }[] = [
  { key: "seats", label: "Extra seats", unit: "seats" },
  { key: "aiTokensPerMonth", label: "Extra AI tokens / month", unit: "AI tokens" },
  { key: "storageMb", label: "Extra storage", unit: "MB" },
];

export interface Addon {
  _id: string;
  name: string;
  description: string;
  currency: string;
  /** Per unit, per cycle, pre-tax paise. */
  priceMonthly: number;
  priceYearly: number;
  /** limit = raises a plan limit by `amountPerUnit` per unit; module = unlocks a product. */
  type: "limit" | "module";
  limitKey: AddonLimitKey | null;
  amountPerUnit: number | null;
  moduleKey: ModuleKey | null;
  plans: string[] | "all";
  /** Max units per company; null = unlimited. Module unlocks are always 1. */
  maxQuantity: number | null;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export function describeCouponDiscount(c: Pick<Coupon, "kind" | "percentOff" | "amountOff">, currency = "INR"): string {
  return c.kind === "percent" ? `${c.percentOff}% off` : `${formatMoney(c.amountOff ?? 0, currency)} off`;
}

export function describeCouponDuration(c: Pick<Coupon, "duration" | "durationCycles">): string {
  if (c.duration === "once") return "First cycle";
  if (c.duration === "forever") return "Every cycle";
  return `${c.durationCycles} cycle${c.durationCycles === 1 ? "" : "s"}`;
}

export function describeAddonEffect(a: Pick<Addon, "type" | "limitKey" | "amountPerUnit" | "moduleKey">): string {
  if (a.type === "module") return `Unlocks ${a.moduleKey}`;
  const meta = ADDON_LIMIT_KEYS.find((k) => k.key === a.limitKey);
  return `+${(a.amountPerUnit ?? 0).toLocaleString("en-IN")} ${meta?.unit ?? a.limitKey} per unit`;
}

export type CouponStatus = "active" | "inactive" | "scheduled" | "expired" | "used_up";

export function couponStatus(c: Pick<Coupon, "active" | "validFrom" | "validUntil" | "maxRedemptions" | "redeemedCount">, now = Date.now()): CouponStatus {
  if (!c.active) return "inactive";
  if (c.validUntil && new Date(c.validUntil).getTime() <= now) return "expired";
  if (c.validFrom && new Date(c.validFrom).getTime() > now) return "scheduled";
  if (c.maxRedemptions !== null && c.redeemedCount >= c.maxRedemptions) return "used_up";
  return "active";
}
