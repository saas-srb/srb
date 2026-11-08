import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { TOPUP_SERVICES, allocateBurn, serviceDef, type TopupService } from "@/lib/platform/billing/topup-catalog";
import type { PlanLimits } from "@/lib/platform/billing/types";

/**
 * Where purchased top-ups live (platform database): the packs a company bought, and how much of the current month's overflow has been paid for
 * out of them. Entitlements read `creditLimitExtras` (so every limit check in the product sees plan + credits at once), and metered use calls
 * `burnCredits` once a service goes past the plan's own allowance. No imports of entitlements here: entitlements import THIS.
 */

export const CREDIT_PACKS = "billing_credit_packs";
export const CREDIT_BURN = "billing_credit_burn";

export interface CreditPackDoc {
  _id: string;
  companyId: string;
  packId: string;
  service: TopupService;
  /** Credit units bought (tokens, emails, minutes, domain slots). */
  units: number;
  /** In METER units (voice = seconds): what the pack held and what is left. Domain slots don't use them. */
  total: number;
  remaining: number;
  amountPaid: number;
  currency: string;
  /** Razorpay payment id: unique, so a pack can only be granted once for a payment. */
  paymentId: string;
  orderId: string | null;
  purchasedAt: Date;
  expiresAt: Date;
  invoiceId: string | null;
  invoiceNumber: string | null;
}

interface BurnDoc {
  _id: string;
  companyId: string;
  service: TopupService;
  period: string;
  /** Meter units paid from credits this month. */
  burned: number;
}

let indexed = false;
export async function packsCol() {
  const c = (await getPlatformDb()).collection<CreditPackDoc>(CREDIT_PACKS);
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ paymentId: 1 }, { unique: true }), c.createIndex({ companyId: 1, service: 1, expiresAt: 1 })]).catch(() => {});
  }
  return c;
}
async function burnCol() {
  return (await getPlatformDb()).collection<BurnDoc>(CREDIT_BURN);
}

const period = (d = new Date()) => d.toISOString().slice(0, 7);

export interface ServiceCredits {
  service: TopupService;
  /** Credit units still to use (domain packs: slots held). */
  remaining: number;
  /** Credit units already used this month. */
  usedThisMonth: number;
  nextExpiry: Date | null;
}

/** The company's live credits per service (expired packs don't count). */
export async function creditsOf(companyId: string, now = new Date()): Promise<ServiceCredits[]> {
  const [packs, burns] = await Promise.all([
    (await packsCol()).find({ companyId, expiresAt: { $gt: now } }).toArray(),
    (await burnCol()).find({ companyId, period: period(now) }).toArray(),
  ]);
  return TOPUP_SERVICES.map((def) => {
    const mine = packs.filter((p) => p.service === def.key);
    const live = def.consumable ? mine.filter((p) => p.remaining > 0) : mine;
    const remaining = def.consumable ? live.reduce((n, p) => n + p.remaining, 0) / def.perUnit : live.reduce((n, p) => n + p.units, 0);
    const used = (burns.find((b) => b.service === def.key)?.burned ?? 0) / def.perUnit;
    const soonest = live.map((p) => p.expiresAt.getTime()).sort((a, b) => a - b)[0];
    return { service: def.key, remaining, usedThisMonth: used, nextExpiry: soonest ? new Date(soonest) : null };
  });
}

/**
 * Plan limits plus credits. For a consumable the extra is what is left PLUS what this month already took, because the month's usage counter
 * already contains that part; a domain pack simply adds its slots. An unlimited (null) limit stays unlimited.
 */
export async function withCreditLimits(companyId: string, limits: PlanLimits): Promise<PlanLimits> {
  try {
    const credits = await creditsOf(companyId);
    const out = { ...limits };
    for (const c of credits) {
      const def = serviceDef(c.service);
      const cur = out[def.limitKey];
      if (cur === null || cur === undefined) continue;
      out[def.limitKey] = cur + (def.consumable ? c.remaining + c.usedThisMonth : c.remaining);
    }
    return out;
  } catch (err) {
    console.error("[credits] could not read credits; using plan limits", err);
    return limits;
  }
}

/** Takes `meterUnits` of a service from the company's packs (soonest-expiring first). Returns how much could not be covered. */
export async function burnCredits(companyId: string, service: TopupService, meterUnits: number): Promise<number> {
  const def = serviceDef(service);
  if (!def.consumable || meterUnits <= 0) return meterUnits;
  const col = await packsCol();
  const now = new Date();
  let left = Math.ceil(meterUnits);
  // A few rounds: a concurrent use may have taken from the same pack between the read and the update.
  for (let round = 0; round < 3 && left > 0; round++) {
    const packs = await col.find({ companyId, service, remaining: { $gt: 0 }, expiresAt: { $gt: now } }, { projection: { remaining: 1, expiresAt: 1 } }).toArray();
    const { takes } = allocateBurn(packs.map((p) => ({ id: p._id, remaining: p.remaining, expiresAt: p.expiresAt })), left, now);
    if (takes.length === 0) break;
    for (const t of takes) {
      const r = await col.findOneAndUpdate({ _id: t.id, remaining: { $gte: t.take } }, { $inc: { remaining: -t.take } });
      if (r) left -= t.take;
    }
  }
  const burned = Math.ceil(meterUnits) - left;
  if (burned > 0) await (await burnCol()).updateOne({ _id: `${companyId}:${service}:${period(now)}` }, { $inc: { burned }, $setOnInsert: { companyId, service, period: period(now) } }, { upsert: true });
  return left;
}
