import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { getPlan } from "@/lib/platform/billing/plans";
import { getCompanySubscription } from "@/lib/platform/billing/subscription";
import { applyLimitOverrides } from "@/lib/platform/billing/overrides";
import type { CompanySubscription, Plan, PlanLimits } from "@/lib/platform/billing/types";

/**
 * A company's effective limits: its plan's limits (from the DB) plus the
 * extras from any add-ons it bought. Add-ons are recorded on the subscription
 * as `companies.subscription.addons: [{ addonId, quantity }]`, each pointing
 * at a platform-level `billing_addons` doc `{ _id, limitKey, amountPerUnit }`.
 * `null` (unlimited) stays unlimited whatever is added.
 */

export const UNLIMITED_LIMITS: PlanLimits = { seats: null, aiTokensPerMonth: null, storageMb: null, emailsPerMonth: null, voiceMinutesPerMonth: null, customDomains: null };
export const ADDONS_COLLECTION = "billing_addons";

export type LimitKey = keyof PlanLimits;
const LIMIT_KEYS: LimitKey[] = ["seats", "aiTokensPerMonth", "storageMb", "emailsPerMonth", "voiceMinutesPerMonth", "customDomains"];

export interface SubscriptionAddon {
  addonId: string;
  quantity: number;
}

export interface AddonLimitDoc {
  _id: string;
  limitKey: LimitKey;
  amountPerUnit: number;
}

/** The add-ons recorded on a subscription (tolerant of a missing or malformed field). */
export function subscriptionAddons(sub: CompanySubscription | null): SubscriptionAddon[] {
  const raw: unknown = sub?.addons;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a: unknown): a is SubscriptionAddon => !!a && typeof a === "object" && typeof (a as SubscriptionAddon).addonId === "string")
    .map((a) => ({ addonId: a.addonId, quantity: Number.isFinite(Number(a.quantity)) ? Math.max(0, Math.floor(Number(a.quantity))) : 0 }))
    .filter((a) => a.quantity > 0);
}

/** Pure: plan limits + Σ(quantity × amountPerUnit) per limit key. Unknown add-ons are ignored. */
export function applyAddonExtras(base: PlanLimits, addons: SubscriptionAddon[], docs: AddonLimitDoc[]): PlanLimits {
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const out: PlanLimits = { ...base };
  for (const a of addons) {
    const doc = byId.get(a.addonId);
    if (!doc || !LIMIT_KEYS.includes(doc.limitKey)) continue;
    const per = Number(doc.amountPerUnit);
    if (!Number.isFinite(per) || per <= 0) continue;
    const current = out[doc.limitKey];
    if (current === null) continue;
    out[doc.limitKey] = current + a.quantity * per;
  }
  return out;
}

async function addonDocs(ids: string[]): Promise<AddonLimitDoc[]> {
  if (ids.length === 0) return [];
  return (await getPlatformDb())
    .collection<AddonLimitDoc>(ADDONS_COLLECTION)
    .find({ _id: { $in: ids } }, { projection: { limitKey: 1, amountPerUnit: 1 } })
    .toArray();
}

/**
 * Effective limits for a subscription whose plan is already loaded: the plan's, plus any add-ons, then whatever the platform admin set for
 * this company in the Platform Console (see `overrides.ts`). Every limit check in the product reads this, so one change applies everywhere.
 */
export async function effectiveLimitsFor(sub: CompanySubscription | null, plan: Plan | null): Promise<PlanLimits> {
  if (!sub || sub.status === "internal") return { ...UNLIMITED_LIMITS };
  const base = plan?.limits ?? UNLIMITED_LIMITS;
  const addons = subscriptionAddons(sub);
  const withAddons = addons.length === 0 ? { ...base } : applyAddonExtras(base, addons, await addonDocs(addons.map((a) => a.addonId)));
  return applyLimitOverrides(withAddons, sub.overrides);
}

/** Plan limits + purchased add-on extras for a company. The platform owner is unlimited. */
export async function getEffectiveLimits(companyId: string): Promise<PlanLimits> {
  const sub = await getCompanySubscription(companyId);
  if (!sub || sub.status === "internal") return { ...UNLIMITED_LIMITS };
  return effectiveLimitsFor(sub, await getPlan(sub.planId));
}
