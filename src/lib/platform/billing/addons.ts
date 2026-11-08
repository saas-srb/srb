import "server-only";
import { randomUUID } from "node:crypto";
import type { Collection } from "mongodb";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION } from "@/lib/platform/tenancy/companies";
import { listPlans } from "@/lib/platform/billing/plans";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { getCompanySubscription } from "@/lib/platform/billing/subscription";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { MODULES, type ModuleKey } from "@/lib/platform/onboarding/catalog";
import type { BillingInterval, CompanyAddon, CompanySubscription, PlanLimits } from "@/lib/platform/billing/types";
import { ADDON_LIMIT_KEYS, type Addon, type AddonLimitKey } from "@/lib/platform/billing/catalog-types";

/**
 * Add-ons (platform-level `billing_addons`), managed in the Platform Console.
 * A company's add-ons live on its subscription:
 * `companies.subscription.addons: [{ addonId, quantity, addedAt, complimentary? }]`.
 *
 * Enforcement reads `getLimitBoosters(companyId)` → `{ limitKey, amountPerUnit, quantity }`
 * (effective limit = plan limit + Σ amountPerUnit × quantity; an unlimited plan
 * limit stays unlimited) and `getModuleUnlocks(companyId)`.
 */

export const ADDONS_COLLECTION = "billing_addons";

type CompanyDoc = { _id: string; name?: string; isPlatformOwner?: boolean; subscription?: CompanySubscription };

async function addons(): Promise<Collection<Addon>> {
  return (await getPlatformDb()).collection<Addon>(ADDONS_COLLECTION);
}
async function companies(): Promise<Collection<CompanyDoc>> {
  return (await getPlatformDb()).collection<CompanyDoc>(COMPANIES_COLLECTION);
}

export async function listAddons(opts: { activeOnly?: boolean; planId?: string } = {}): Promise<Addon[]> {
  const filter: Record<string, unknown> = {};
  if (opts.activeOnly) filter.active = true;
  if (opts.planId) filter.$or = [{ plans: "all" }, { plans: opts.planId }];
  return (await addons()).find(filter).sort({ sortOrder: 1, name: 1 }).toArray();
}

export async function getAddon(id: string): Promise<Addon | null> {
  return (await addons()).findOne({ _id: id });
}

export function addonAvailableOnPlan(addon: Pick<Addon, "plans">, planId: string): boolean {
  return addon.plans === "all" || addon.plans.includes(planId);
}

/** Per-unit price for the cycle. */
export function addonUnitPrice(addon: Pick<Addon, "priceMonthly" | "priceYearly">, interval: BillingInterval): number {
  return interval === "yearly" ? addon.priceYearly : addon.priceMonthly;
}

/** How many companies hold each add-on (id → count). */
export async function countAddonHolders(): Promise<Map<string, number>> {
  const rows = await (await companies())
    .aggregate<{ _id: string; n: number }>([
      { $match: { "subscription.addons.0": { $exists: true } } },
      { $unwind: "$subscription.addons" },
      { $match: { "subscription.addons.quantity": { $gt: 0 } } },
      { $group: { _id: "$subscription.addons.addonId", n: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id, r.n]));
}

/** Companies holding one add-on, with their quantity. */
export async function listAddonHolders(addonId: string): Promise<{ companyId: string; name: string; quantity: number; complimentary: boolean; addedAt: Date }[]> {
  const rows = await (await companies())
    .find({ "subscription.addons": { $elemMatch: { addonId, quantity: { $gt: 0 } } } }, { projection: { name: 1, "subscription.addons": 1 } })
    .limit(500)
    .toArray();
  return rows.flatMap((c) => {
    const h = c.subscription?.addons?.find((a) => a.addonId === addonId);
    return h ? [{ companyId: c._id, name: c.name ?? c._id, quantity: h.quantity, complimentary: Boolean(h.complimentary), addedAt: h.addedAt }] : [];
  });
}

// ---------------------------------------------------------------------------
// A company's add-ons
// ---------------------------------------------------------------------------

export async function getCompanyAddons(companyId: string): Promise<CompanyAddon[]> {
  const c = await (await companies()).findOne({ _id: companyId }, { projection: { subscription: 1 } });
  return (c?.subscription?.addons ?? []).filter((a) => a.quantity > 0);
}

/** Limit boosters the company holds — for enforcement. */
export async function getLimitBoosters(companyId: string): Promise<{ addonId: string; limitKey: AddonLimitKey; amountPerUnit: number; quantity: number }[]> {
  const held = await getCompanyAddons(companyId);
  if (!held.length) return [];
  const defs = await (await addons()).find({ _id: { $in: held.map((h) => h.addonId) }, type: "limit" }).toArray();
  const byId = new Map(defs.map((d) => [d._id, d]));
  return held.flatMap((h) => {
    const d = byId.get(h.addonId);
    return d?.limitKey && d.amountPerUnit ? [{ addonId: d._id, limitKey: d.limitKey, amountPerUnit: d.amountPerUnit, quantity: h.quantity }] : [];
  });
}

/** Plan limits raised by the company's boosters. null (unlimited) stays unlimited. */
export function applyLimitBoosters(limits: PlanLimits, boosters: { limitKey: AddonLimitKey; amountPerUnit: number; quantity: number }[]): PlanLimits {
  const out = { ...limits };
  for (const b of boosters) {
    const cur = out[b.limitKey];
    if (cur !== null) out[b.limitKey] = cur + b.amountPerUnit * b.quantity;
  }
  return out;
}

/** Products unlocked by the company's module add-ons. */
export async function getModuleUnlocks(companyId: string): Promise<ModuleKey[]> {
  const held = await getCompanyAddons(companyId);
  if (!held.length) return [];
  const defs = await (await addons()).find({ _id: { $in: held.map((h) => h.addonId) }, type: "module" }).toArray();
  return [...new Set(defs.map((d) => d.moduleKey).filter((m): m is ModuleKey => Boolean(m)))];
}

export type CompanyAddonResult = { ok: true } | { ok: false; error: string };

/**
 * Sets how many units of an add-on a company holds (0 removes it). Used by
 * the Platform Console (grants) and by checkout after a paid add-on purchase.
 * Each write is a single atomic update on the company document. Audited.
 */
export async function setCompanyAddon(
  companyId: string,
  addonId: string,
  quantity: number,
  opts: { complimentary?: boolean; actorId: string },
): Promise<CompanyAddonResult> {
  const col = await companies();
  const company = await col.findOne({ _id: companyId }, { projection: { isPlatformOwner: 1, subscription: 1 } });
  if (!company) return { ok: false, error: "Company not found." };
  if (company.isPlatformOwner) return { ok: false, error: "The platform owner isn't billed and already has everything." };
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 0) return { ok: false, error: "Enter a whole number of units." };

  const held = (company.subscription?.addons ?? []).find((a) => a.addonId === addonId);
  if (qty === 0) {
    if (!held) return { ok: true };
    await col.updateOne({ _id: companyId }, { $pull: { "subscription.addons": { addonId } } });
    await recordPlatformAudit({ actorId: opts.actorId, action: "company.addon.remove", target: { type: "addon", id: addonId }, companyId, details: { quantity: held.quantity } });
    return { ok: true };
  }

  const addon = await getAddon(addonId);
  if (!addon) return { ok: false, error: "That add-on doesn't exist." };
  if (!addon.active && !held) return { ok: false, error: "That add-on is inactive." };
  const max = addon.type === "module" ? 1 : addon.maxQuantity;
  if (max !== null && qty > max) return { ok: false, error: `At most ${max} unit${max === 1 ? "" : "s"} of ${addon.name}.` };

  // Materialise an implicit (never written) trial subscription before adding to it.
  if (!company.subscription) {
    const sub = await getCompanySubscription(companyId);
    if (!sub) return { ok: false, error: "Company not found." };
    await col.updateOne({ _id: companyId, subscription: { $exists: false } }, { $set: { subscription: sub } });
  }
  const planId = company.subscription?.planId ?? (await getCompanySubscription(companyId))?.planId ?? "";
  if (!opts.complimentary && !addonAvailableOnPlan(addon, planId)) return { ok: false, error: `${addon.name} isn't available on this company's plan.` };

  const complimentary = Boolean(opts.complimentary);
  const now = new Date();
  if (held) {
    await col.updateOne(
      { _id: companyId, "subscription.addons.addonId": addonId },
      { $set: { "subscription.addons.$.quantity": qty, "subscription.addons.$.complimentary": complimentary, "subscription.updatedAt": now } },
    );
  } else {
    const entry: CompanyAddon = { addonId, quantity: qty, addedAt: now, complimentary };
    const res = await col.updateOne({ _id: companyId, "subscription.addons.addonId": { $ne: addonId } }, { $push: { "subscription.addons": entry }, $set: { "subscription.updatedAt": now } });
    // Lost a race with a concurrent add of the same add-on: set its quantity instead.
    if (res.matchedCount === 0) {
      await col.updateOne({ _id: companyId, "subscription.addons.addonId": addonId }, { $set: { "subscription.addons.$.quantity": qty, "subscription.addons.$.complimentary": complimentary } });
    }
  }
  await recordPlatformAudit({
    actorId: opts.actorId,
    action: held ? "company.addon.update" : "company.addon.add",
    target: { type: "addon", id: addonId },
    companyId,
    details: { name: addon.name, quantity: qty, previousQuantity: held?.quantity ?? 0, complimentary },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Platform Console management
// ---------------------------------------------------------------------------

export interface AddonInput {
  name: string;
  description: string;
  /** Paise. */
  priceMonthly: number;
  priceYearly: number;
  type: "limit" | "module";
  limitKey: AddonLimitKey | null;
  amountPerUnit: number | null;
  moduleKey: string | null;
  plans: string[] | "all";
  maxQuantity: number | null;
  active: boolean;
  sortOrder: number;
}

export type AddonSaveResult = { ok: true; id: string } | { ok: false; errors: Record<string, string> };

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export async function saveAddon(id: string | null, input: AddonInput, actorId: string): Promise<AddonSaveResult> {
  const col = await addons();
  const errors: Record<string, string> = {};
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (name.length < 2) errors.name = "Enter a name.";
  const priceMonthly = Number(input.priceMonthly);
  const priceYearly = Number(input.priceYearly);
  if (!Number.isInteger(priceMonthly) || priceMonthly < 0) errors.priceMonthly = "Enter a price of 0 or more.";
  if (!Number.isInteger(priceYearly) || priceYearly < 0) errors.priceYearly = "Enter a price of 0 or more.";
  const type = input.type === "module" ? "module" : "limit";
  let limitKey: AddonLimitKey | null = null;
  let amountPerUnit: number | null = null;
  let moduleKey: ModuleKey | null = null;
  if (type === "limit") {
    limitKey = ADDON_LIMIT_KEYS.find((k) => k.key === input.limitKey)?.key ?? null;
    if (!limitKey) errors.limitKey = "Choose which limit this raises.";
    amountPerUnit = Number(input.amountPerUnit);
    if (!Number.isInteger(amountPerUnit) || amountPerUnit <= 0) errors.amountPerUnit = "Enter a whole number greater than zero.";
  } else {
    const m = MODULES.find((x) => x.key === input.moduleKey && !x.core);
    if (!m) errors.moduleKey = "Choose a product to unlock.";
    moduleKey = m?.key ?? null;
  }
  const known = new Set((await listPlans()).map((p) => p._id));
  let plans: string[] | "all" = "all";
  if (input.plans !== "all") {
    plans = [...new Set((Array.isArray(input.plans) ? input.plans : []).map(String))];
    if (!plans.length) errors.plans = "Choose at least one plan, or all plans.";
    else if (plans.some((p) => !known.has(p))) errors.plans = "Unknown plan selected.";
  }
  let maxQuantity: number | null = type === "module" ? 1 : null;
  if (type === "limit" && input.maxQuantity !== null && input.maxQuantity !== undefined && String(input.maxQuantity) !== "") {
    const n = Number(input.maxQuantity);
    if (!Number.isInteger(n) || n < 1 || n > 10_000) errors.maxQuantity = "Enter 1–10,000, or leave empty for unlimited.";
    else maxQuantity = n;
  }
  const sortOrder = Number.isFinite(Number(input.sortOrder)) ? Math.round(Number(input.sortOrder)) : 0;
  if (Object.keys(errors).length) return { ok: false, errors };

  const doc = {
    name,
    description: String(input.description ?? "").trim().slice(0, 300),
    priceMonthly,
    priceYearly,
    type,
    limitKey,
    amountPerUnit,
    moduleKey,
    plans,
    maxQuantity,
    active: Boolean(input.active),
    sortOrder,
  } satisfies Partial<Addon>;
  const now = new Date();
  if (id) {
    const existing = await col.findOne({ _id: id });
    if (!existing) return { ok: false, errors: { form: "This add-on no longer exists." } };
    if (existing.type !== type) return { ok: false, errors: { type: "The type can't change after creation; create a new add-on instead." } };
    await col.updateOne({ _id: id }, { $set: { ...doc, updatedAt: now } });
    const changed = (Object.keys(doc) as (keyof typeof doc)[]).filter((k) => JSON.stringify(doc[k]) !== JSON.stringify(existing[k]));
    await recordPlatformAudit({ actorId, action: "addon.update", target: { type: "addon", id }, details: { name, changed } });
    return { ok: true, id };
  }
  const currency = (await getBillingSettings()).billing.currency;
  let newId = slugify(name) || randomUUID();
  if (await col.findOne({ _id: newId }, { projection: { _id: 1 } })) newId = `${newId}-${randomUUID().slice(0, 6)}`;
  await col.insertOne({ _id: newId, ...doc, currency, createdAt: now, updatedAt: now });
  await recordPlatformAudit({ actorId, action: "addon.create", target: { type: "addon", id: newId }, details: { name, type, priceMonthly, priceYearly } });
  return { ok: true, id: newId };
}

export async function setAddonActive(id: string, active: boolean, actorId: string): Promise<boolean> {
  const res = await (await addons()).findOneAndUpdate({ _id: id }, { $set: { active, updatedAt: new Date() } });
  if (!res) return false;
  if (res.active !== active) await recordPlatformAudit({ actorId, action: active ? "addon.activate" : "addon.deactivate", target: { type: "addon", id }, details: { name: res.name } });
  return true;
}
