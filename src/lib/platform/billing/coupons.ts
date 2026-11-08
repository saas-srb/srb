import "server-only";
import { randomUUID } from "node:crypto";
import type { Collection } from "mongodb";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION } from "@/lib/platform/tenancy/companies";
import { listPlans } from "@/lib/platform/billing/plans";
import { SUBSCRIPTION_EVENTS_COLLECTION } from "@/lib/platform/billing/events";
import { recordPlatformAudit } from "@/lib/platform/audit";
import type { BillingInterval, CompanySubscription } from "@/lib/platform/billing/types";
import type { Coupon, CouponDuration, CouponRedemption } from "@/lib/platform/billing/catalog-types";

/**
 * Coupons (platform-level `billing_coupons`) and their redemptions
 * (`billing_coupon_redemptions`), managed in the Platform Console.
 *
 * CHECKOUT FLOW (the subscriptions/Razorpay workstream):
 *   1. `quoteCheckout({ planId, interval, companyId, couponCode })` — validates
 *      the code and prices the discount (`quote.couponId`, `quote.discount`).
 *   2. Before creating the provider order/subscription:
 *        const r = await redeemCoupon({ couponId: quote.couponId, companyId, planId, interval,
 *                                       discount: quote.discount, reference: <order/subscription id> });
 *      `r.ok === false` → show `r.error`, re-quote without the coupon.
 *      Race-safe: two concurrent redeems against the last slot → exactly one wins.
 *      Idempotent on (coupon, company, reference): a retried call returns the same redemption.
 *   3. Payment fails / order abandoned / checkout aborted → `releaseRedemption({ redemptionId: r.redemptionId, reason })`
 *      (or `{ reference }`). Frees the slot; safe to call twice.
 *   4. Every successful charge that carried the discount (first and renewals) →
 *      `markRedemptionCycleBilled(r.redemptionId)`.
 *   5. Renewals: `getRenewalRedemption(companyId)` says whether a discount still
 *      applies to the next cycle; quote it with `couponCode: redemption.code` —
 *      a company holding a live redemption with cycles left is priced as a
 *      continuation (limits, window and active flag aren't re-checked).
 */

export const COUPONS_COLLECTION = "billing_coupons";
export const COUPON_REDEMPTIONS_COLLECTION = "billing_coupon_redemptions";

let indexed = false;
async function cols(): Promise<{ coupons: Collection<Coupon>; redemptions: Collection<CouponRedemption> }> {
  const db = await getPlatformDb();
  const coupons = db.collection<Coupon>(COUPONS_COLLECTION);
  const redemptions = db.collection<CouponRedemption>(COUPON_REDEMPTIONS_COLLECTION);
  if (!indexed) {
    indexed = true;
    await Promise.all([
      coupons.createIndex({ codeLower: 1 }, { unique: true }),
      redemptions.createIndex({ slotKey: 1 }, { unique: true, partialFilterExpression: { slotKey: { $type: "string" } } }),
      redemptions.createIndex({ refKey: 1 }, { unique: true, partialFilterExpression: { refKey: { $type: "string" } } }),
      redemptions.createIndex({ couponId: 1, redeemedAt: -1 }),
      redemptions.createIndex({ companyId: 1, status: 1 }),
      redemptions.createIndex({ reference: 1 }),
    ]).catch((err) => {
      indexed = false;
      console.error("[billing] coupon indexes", err);
    });
  }
  return { coupons, redemptions };
}

export function normalizeCouponCode(code: string): string {
  return String(code ?? "").trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Discount math
// ---------------------------------------------------------------------------

/**
 * Paise taken off `subtotal` (plan + add-ons, pre-tax).
 * Percent: `round(subtotal × percent / 100)` to the nearest paisa (half up).
 * Fixed: the coupon amount, capped at the subtotal. Never negative, never > subtotal.
 */
export function computeCouponDiscount(coupon: Pick<Coupon, "kind" | "percentOff" | "amountOff">, subtotal: number): number {
  const base = Math.max(0, Math.round(subtotal));
  const raw = coupon.kind === "percent" ? Math.round((base * (coupon.percentOff ?? 0)) / 100) : Math.round(coupon.amountOff ?? 0);
  return Math.min(base, Math.max(0, raw));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidateCouponInput {
  code: string;
  /** Omit for an anonymous price preview (per-company rules are then skipped). */
  companyId?: string | null;
  planId: string;
  interval: BillingInterval;
}

export type ValidateCouponResult = { ok: true; coupon: Coupon; continuing: boolean } | { ok: false; error: string };

/** A company has paid before if it ever activated/reactivated, or is on a paid status now. */
async function hasEverPaid(companyId: string): Promise<boolean> {
  const db = await getPlatformDb();
  const company = await db.collection<{ _id: string; subscription?: CompanySubscription; isPlatformOwner?: boolean }>(COMPANIES_COLLECTION).findOne({ _id: companyId }, { projection: { subscription: 1, isPlatformOwner: 1 } });
  if (company?.isPlatformOwner) return true;
  const status = company?.subscription?.status;
  if (status === "active" || status === "past_due" || status === "grace") return true;
  const paid = await db.collection(SUBSCRIPTION_EVENTS_COLLECTION).countDocuments({ companyId, type: { $in: ["activated", "reactivated"] } }, { limit: 1 });
  return paid > 0;
}

/** A live redemption of this coupon by this company that still has discounted cycles left. */
async function continuingRedemption(couponId: string, companyId: string): Promise<CouponRedemption | null> {
  const { redemptions } = await cols();
  return redemptions.findOne({
    couponId,
    companyId,
    status: "redeemed",
    $or: [{ durationCycles: null }, { $expr: { $lt: ["$cyclesBilled", "$durationCycles"] } }],
  });
}

function planLabel(planId: string, plans: { _id: string; name: string }[]) {
  return plans.find((p) => p._id === planId)?.name ?? planId;
}

async function checkCoupon(input: ValidateCouponInput, allowContinuation: boolean): Promise<ValidateCouponResult> {
  const code = normalizeCouponCode(input.code);
  if (!code) return { ok: false, error: "Enter a coupon code." };
  const { coupons, redemptions } = await cols();
  const coupon = await coupons.findOne({ codeLower: code.toLowerCase() });
  if (!coupon) return { ok: false, error: "That coupon code isn't valid." };

  const plans = await listPlans();
  if (coupon.plans !== "all" && !coupon.plans.includes(input.planId)) {
    return { ok: false, error: `This coupon doesn't apply to the ${planLabel(input.planId, plans)} plan.` };
  }
  if (!coupon.intervals.includes(input.interval)) {
    return { ok: false, error: `This coupon only applies to ${coupon.intervals.join(" or ")} billing.` };
  }
  if (allowContinuation && input.companyId && (await continuingRedemption(coupon._id, input.companyId))) {
    return { ok: true, coupon, continuing: true };
  }
  if (!coupon.active) return { ok: false, error: "This coupon is no longer active." };
  const now = Date.now();
  if (coupon.validFrom && coupon.validFrom.getTime() > now) return { ok: false, error: "This coupon isn't active yet." };
  if (coupon.validUntil && coupon.validUntil.getTime() <= now) return { ok: false, error: "This coupon has expired." };
  if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
    return { ok: false, error: "This coupon has reached its redemption limit." };
  }
  if (input.companyId) {
    if (coupon.maxPerCompany !== null) {
      const used = await redemptions.countDocuments({ couponId: coupon._id, companyId: input.companyId, status: "redeemed" });
      if (used >= coupon.maxPerCompany) return { ok: false, error: "You've already used this coupon." };
    }
    if (coupon.firstTimeOnly && (await hasEverPaid(input.companyId))) {
      return { ok: false, error: "This coupon is for first-time subscribers only." };
    }
  }
  return { ok: true, coupon, continuing: false };
}

/** Whether `code` can be used for this plan/cycle (and company). Friendly error otherwise. */
export async function validateCoupon(input: ValidateCouponInput): Promise<ValidateCouponResult> {
  return checkCoupon(input, true);
}

// ---------------------------------------------------------------------------
// Redemption (race-safe)
// ---------------------------------------------------------------------------

export interface RedeemCouponInput {
  /** Either the coupon id (from a quote) or the code. */
  couponId?: string | null;
  code?: string | null;
  companyId: string;
  planId: string;
  interval: BillingInterval;
  /** Discount the quote gave (paise), recorded for reporting. */
  discount: number;
  /** Provider order/subscription id — makes retries idempotent. */
  reference?: string | null;
  /** Who triggered it; "system" for webhooks. */
  actorId?: string;
}

export type RedeemCouponResult = { ok: true; redemptionId: string; couponId: string; alreadyRedeemed: boolean } | { ok: false; error: string };

const isDup = (err: unknown) => (err as { code?: number })?.code === 11000;
const dupKey = (err: unknown): string => Object.keys((err as { keyPattern?: Record<string, unknown> })?.keyPattern ?? {})[0] ?? "";

/**
 * Claims one redemption of a coupon for a company. Per-company limit: the
 * redemption takes one of `maxPerCompany` unique slots (a unique index, so
 * concurrent claims can't both take the last one). Total limit: a single
 * conditional `$inc` that only matches while `redeemedCount < maxRedemptions`.
 * If the total claim fails, the slot is given back.
 */
export async function redeemCoupon(input: RedeemCouponInput): Promise<RedeemCouponResult> {
  const { coupons, redemptions } = await cols();
  const companyId = String(input.companyId ?? "");
  if (!companyId) return { ok: false, error: "A company is required to redeem a coupon." };

  let code = input.code ? normalizeCouponCode(input.code) : "";
  if (input.couponId) {
    const c = await coupons.findOne({ _id: input.couponId }, { projection: { code: 1 } });
    if (!c) return { ok: false, error: "That coupon code isn't valid." };
    code = c.code;
  }
  if (!code) return { ok: false, error: "Enter a coupon code." };

  const reference = input.reference ? String(input.reference) : null;
  // Idempotent retry: same coupon + company + reference → the existing live redemption.
  const lookup = await coupons.findOne({ codeLower: code.toLowerCase() }, { projection: { _id: 1 } });
  if (lookup && reference) {
    const existing = await redemptions.findOne({ refKey: `${lookup._id}:${companyId}:${reference}` });
    if (existing) return { ok: true, redemptionId: existing._id, couponId: existing.couponId, alreadyRedeemed: true };
  }

  const v = await checkCoupon({ code, companyId, planId: input.planId, interval: input.interval }, false);
  if (!v.ok) return v;
  const coupon = v.coupon;

  const doc: CouponRedemption = {
    _id: randomUUID(),
    couponId: coupon._id,
    code: coupon.code,
    companyId,
    planId: input.planId,
    interval: input.interval,
    discount: Math.max(0, Math.round(Number(input.discount) || 0)),
    reference,
    status: "redeemed",
    cyclesBilled: 0,
    durationCycles: coupon.duration === "forever" ? null : coupon.duration === "once" ? 1 : (coupon.durationCycles ?? 1),
    redeemedAt: new Date(),
    releasedAt: null,
    releaseReason: null,
  };
  if (reference) doc.refKey = `${coupon._id}:${companyId}:${reference}`;

  // 1) Per-company slot.
  let inserted = false;
  const slots = coupon.maxPerCompany === null ? [null] : Array.from({ length: coupon.maxPerCompany }, (_, i) => i + 1);
  for (const n of slots) {
    const attempt = { ...doc };
    if (n !== null) attempt.slotKey = `${coupon._id}:${companyId}:${n}`;
    try {
      await redemptions.insertOne(attempt);
      Object.assign(doc, attempt);
      inserted = true;
      break;
    } catch (err) {
      if (!isDup(err)) throw err;
      if (dupKey(err) === "refKey") {
        const existing = await redemptions.findOne({ refKey: doc.refKey });
        if (existing) return { ok: true, redemptionId: existing._id, couponId: existing.couponId, alreadyRedeemed: true };
      }
      // slot taken — try the next one
    }
  }
  if (!inserted) return { ok: false, error: "You've already used this coupon." };

  // 2) Total limit, as one conditional increment.
  const claimed = await coupons.updateOne(
    { _id: coupon._id, active: true, $or: [{ maxRedemptions: null }, { $expr: { $lt: ["$redeemedCount", "$maxRedemptions"] } }] },
    { $inc: { redeemedCount: 1 } },
  );
  if (claimed.modifiedCount !== 1) {
    await redemptions.deleteOne({ _id: doc._id });
    const now = await coupons.findOne({ _id: coupon._id }, { projection: { active: 1 } });
    return { ok: false, error: now?.active ? "This coupon has reached its redemption limit." : "This coupon is no longer active." };
  }

  await recordPlatformAudit({
    actorId: input.actorId ?? "system",
    action: "coupon.redeem",
    target: { type: "coupon", id: coupon._id },
    companyId,
    details: { code: coupon.code, redemptionId: doc._id, planId: input.planId, interval: input.interval, discount: doc.discount, reference },
  });
  return { ok: true, redemptionId: doc._id, couponId: coupon._id, alreadyRedeemed: false };
}

/**
 * Gives a redemption back (failed/abandoned payment, refund): frees the
 * company's slot and one of the total. Returns false if there was nothing
 * live to release — so calling it twice is harmless.
 */
export async function releaseRedemption(input: { redemptionId?: string | null; reference?: string | null; reason?: string; actorId?: string }): Promise<boolean> {
  const { coupons, redemptions } = await cols();
  const filter = input.redemptionId ? { _id: String(input.redemptionId) } : input.reference ? { reference: String(input.reference) } : null;
  if (!filter) return false;
  const released = await redemptions.findOneAndUpdate(
    { ...filter, status: "redeemed" },
    { $set: { status: "released", releasedAt: new Date(), releaseReason: input.reason?.slice(0, 200) || "payment_failed" }, $unset: { slotKey: "", refKey: "" } },
    { returnDocument: "after" },
  );
  if (!released) return false;
  await coupons.updateOne({ _id: released.couponId, redeemedCount: { $gt: 0 } }, { $inc: { redeemedCount: -1 } });
  await recordPlatformAudit({
    actorId: input.actorId ?? "system",
    action: "coupon.release",
    target: { type: "coupon", id: released.couponId },
    companyId: released.companyId,
    details: { code: released.code, redemptionId: released._id, reason: released.releaseReason, reference: released.reference },
  });
  return true;
}

/** Call on every successful charge that carried the discount. */
export async function markRedemptionCycleBilled(redemptionId: string): Promise<void> {
  const { redemptions } = await cols();
  await redemptions.updateOne({ _id: redemptionId, status: "redeemed" }, { $inc: { cyclesBilled: 1 } });
}

/** The company's live redemption whose discount still applies to the next cycle, if any. */
export async function getRenewalRedemption(companyId: string): Promise<CouponRedemption | null> {
  const { redemptions } = await cols();
  return redemptions.findOne(
    { companyId, status: "redeemed", $or: [{ durationCycles: null }, { $expr: { $lt: ["$cyclesBilled", "$durationCycles"] } }] },
    { sort: { redeemedAt: -1 } },
  );
}

// ---------------------------------------------------------------------------
// Platform Console management
// ---------------------------------------------------------------------------

export async function listCoupons(): Promise<Coupon[]> {
  const { coupons } = await cols();
  return coupons.find({}).sort({ active: -1, createdAt: -1 }).toArray();
}

export async function getCoupon(id: string): Promise<Coupon | null> {
  const { coupons } = await cols();
  return coupons.findOne({ _id: id });
}

export async function listCouponRedemptions(couponId: string, limit = 200): Promise<(CouponRedemption & { companyName: string | null })[]> {
  const { redemptions } = await cols();
  const rows = await redemptions.find({ couponId }).sort({ redeemedAt: -1 }).limit(limit).toArray();
  const ids = [...new Set(rows.map((r) => r.companyId))];
  const db = await getPlatformDb();
  const companies = await db.collection<{ _id: string; name: string }>(COMPANIES_COLLECTION).find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray();
  const names = new Map(companies.map((c) => [c._id, c.name]));
  return rows.map((r) => ({ ...r, companyName: names.get(r.companyId) ?? null }));
}

export interface CouponInput {
  code: string;
  description: string;
  kind: "percent" | "fixed";
  percentOff: number | null;
  /** Paise. */
  amountOff: number | null;
  plans: string[] | "all";
  intervals: BillingInterval[];
  duration: CouponDuration;
  durationCycles: number | null;
  /** ISO strings or Dates; null = no bound. */
  validFrom: string | Date | null;
  validUntil: string | Date | null;
  maxRedemptions: number | null;
  maxPerCompany: number | null;
  firstTimeOnly: boolean;
  active: boolean;
}

export type CouponSaveResult = { ok: true; id: string } | { ok: false; errors: Record<string, string> };

const toDate = (v: string | Date | null | undefined): Date | null | "invalid" => {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
};
const optInt = (v: unknown): number | null | "invalid" => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : "invalid";
};

async function parseCoupon(input: CouponInput): Promise<{ doc: Omit<Coupon, "_id" | "redeemedCount" | "createdAt" | "updatedAt">; errors: Record<string, string> }> {
  const errors: Record<string, string> = {};
  const code = normalizeCouponCode(input.code);
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) errors.code = "Use 3–32 letters, digits, hyphens or underscores.";
  const kind = input.kind === "fixed" ? "fixed" : "percent";
  let percentOff: number | null = null;
  let amountOff: number | null = null;
  if (kind === "percent") {
    percentOff = Math.round(Number(input.percentOff) * 100) / 100;
    if (!Number.isFinite(percentOff) || percentOff <= 0 || percentOff > 100) errors.percentOff = "Enter a percentage between 0 and 100.";
  } else {
    amountOff = Number(input.amountOff);
    if (!Number.isInteger(amountOff) || amountOff <= 0) errors.amountOff = "Enter an amount greater than zero.";
  }
  const known = new Set((await listPlans()).map((p) => p._id));
  let plans: string[] | "all" = "all";
  if (input.plans !== "all") {
    plans = [...new Set((Array.isArray(input.plans) ? input.plans : []).map(String))];
    if (!plans.length) errors.plans = "Choose at least one plan, or all plans.";
    else if (plans.some((p) => !known.has(p))) errors.plans = "Unknown plan selected.";
  }
  const intervals = [...new Set((Array.isArray(input.intervals) ? input.intervals : []).filter((i): i is BillingInterval => i === "monthly" || i === "yearly"))];
  if (!intervals.length) errors.intervals = "Choose monthly, yearly or both.";
  const duration: CouponDuration = input.duration === "repeating" || input.duration === "forever" ? input.duration : "once";
  let durationCycles: number | null = null;
  if (duration === "repeating") {
    const n = optInt(input.durationCycles);
    if (n === null || n === "invalid" || n > 120) errors.durationCycles = "Enter 1–120 billing cycles.";
    else durationCycles = n;
  }
  const validFrom = toDate(input.validFrom);
  const validUntil = toDate(input.validUntil);
  if (validFrom === "invalid") errors.validFrom = "Enter a valid date.";
  if (validUntil === "invalid") errors.validUntil = "Enter a valid date.";
  if (validFrom instanceof Date && validUntil instanceof Date && validUntil <= validFrom) errors.validUntil = "Must be after the start.";
  const maxRedemptions = optInt(input.maxRedemptions);
  if (maxRedemptions === "invalid") errors.maxRedemptions = "Enter a whole number, or leave empty for unlimited.";
  const maxPerCompany = optInt(input.maxPerCompany);
  if (maxPerCompany === "invalid" || (typeof maxPerCompany === "number" && maxPerCompany > 100)) errors.maxPerCompany = "Enter 1–100, or leave empty for unlimited.";
  return {
    errors,
    doc: {
      code,
      codeLower: code.toLowerCase(),
      description: String(input.description ?? "").trim().slice(0, 300),
      kind,
      percentOff,
      amountOff,
      plans,
      intervals,
      duration,
      durationCycles,
      validFrom: validFrom instanceof Date ? validFrom : null,
      validUntil: validUntil instanceof Date ? validUntil : null,
      maxRedemptions: typeof maxRedemptions === "number" ? maxRedemptions : null,
      maxPerCompany: typeof maxPerCompany === "number" ? maxPerCompany : null,
      firstTimeOnly: Boolean(input.firstTimeOnly),
      active: Boolean(input.active),
    },
  };
}

/** Create (no id) or update a coupon. Audited. */
export async function saveCoupon(id: string | null, input: CouponInput, actorId: string): Promise<CouponSaveResult> {
  const { coupons } = await cols();
  const { doc, errors } = await parseCoupon(input);
  const existing = id ? await coupons.findOne({ _id: id }) : null;
  if (id && !existing) return { ok: false, errors: { form: "This coupon no longer exists." } };
  if (existing && doc.maxRedemptions !== null && doc.maxRedemptions < existing.redeemedCount) {
    errors.maxRedemptions = `Already redeemed ${existing.redeemedCount} times — the limit can't be lower.`;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const now = new Date();
  try {
    if (existing) {
      await coupons.updateOne({ _id: existing._id }, { $set: { ...doc, updatedAt: now } });
      const changed = (Object.keys(doc) as (keyof typeof doc)[]).filter((k) => JSON.stringify(doc[k]) !== JSON.stringify(existing[k]));
      await recordPlatformAudit({ actorId, action: "coupon.update", target: { type: "coupon", id: existing._id }, details: { code: doc.code, changed } });
      return { ok: true, id: existing._id };
    }
    const newId = randomUUID();
    await coupons.insertOne({ _id: newId, ...doc, redeemedCount: 0, createdAt: now, updatedAt: now });
    await recordPlatformAudit({ actorId, action: "coupon.create", target: { type: "coupon", id: newId }, details: { code: doc.code, kind: doc.kind, percentOff: doc.percentOff, amountOff: doc.amountOff } });
    return { ok: true, id: newId };
  } catch (err) {
    if (isDup(err)) return { ok: false, errors: { code: "A coupon with this code already exists." } };
    throw err;
  }
}

export async function setCouponActive(id: string, active: boolean, actorId: string): Promise<boolean> {
  const { coupons } = await cols();
  const res = await coupons.findOneAndUpdate({ _id: id }, { $set: { active, updatedAt: new Date() } });
  if (!res) return false;
  if (res.active !== active) {
    await recordPlatformAudit({ actorId, action: active ? "coupon.activate" : "coupon.deactivate", target: { type: "coupon", id }, details: { code: res.code } });
  }
  return true;
}
