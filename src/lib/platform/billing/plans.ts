import "server-only";
import type { Collection } from "mongodb";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION } from "@/lib/platform/tenancy/companies";
import { MODULES, type ModuleKey } from "@/lib/platform/onboarding/catalog";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { currentPriceVersion, planIntervals, planPrice } from "@/lib/platform/billing/pricing";
import {
  BILLING_INTERVAL_IDS,
  DEFAULT_TRIAL_DAYS,
  PLAN_FLAGS,
  PLAN_LIMIT_DEFS,
  type BillingInterval,
  type Plan,
  type PlanLimits,
  type PlanPriceVersion,
} from "@/lib/platform/billing/types";

/**
 * The plans catalogue (platform-level `billing_plans`), managed in the
 * Platform Console. The list below only seeds an empty catalogue on first use
 * (Starter ₹499, Growth ₹999, Business ₹1,999 per month; yearly = 10×
 * monthly) — after that, the database is the only source.
 */

export const PLANS_COLLECTION = "billing_plans";

type PlanSeed = Omit<Plan, "createdAt" | "updatedAt">;

const ALL_FLAGS = ["customDomain", "whiteLabel", "apiAccess", "prioritySupport"];

/**
 * The five plans, always. Every plan has every product and every feature; the only things that change are how many people, and the allowance
 * of each paid third-party service (storage, AI, email, voice, domains — see `USAGE_SERVICES`). Nothing is sold separately: more of anything
 * means the next plan. `prices` are what is charged (monthly and yearly = 10 × monthly, two months free). No invented "usual" price is shown struck through: a plan shows an offer only if the operator sets a real list price.
 */
/**
 * The paid plans' limits are what their price pays for at FULL use, worked out in the Platform Console → Costs & pricing calculator from the
 * providers' official prices (shared bills spread over 50 paying companies, 200 free ones, Razorpay's 4.16% and a 10% buffer): a company that
 * uses every limit to the last unit still leaves the platform a little money. Every paid plan gives clearly more than Free (AI tokens, files, email), and Free keeps
 * enough AI tokens for the sign-up website to be written. Re-run the calculator when a provider changes a price.
 */
/**
 * The Free plan's monthly AI tokens. Sized so the AI-written website made at sign-up (planning, about eight pages, an offering page each,
 * a repair pass and three photos: roughly 100–200K tokens) always finishes, with room left over for the assistants afterwards.
 */
export const FREE_AI_TOKENS = 250_000;
/** What the Free plan allowed before: a company still on exactly this number was never edited by the operator and is raised once. */
const OLD_FREE_AI_TOKENS = 20_000;

export const DEFAULT_PLANS: PlanSeed[] = [
  {
    _id: "free",
    name: "Free",
    description: "For one person. Every product and feature, free for life.",
    currency: "INR",
    priceMonthly: 0,
    priceYearly: 0,
    intervals: ["monthly", "yearly"],
    prices: { monthly: 0, yearly: 0 },
    lifetimeFree: true,
    highlights: ["Free for life, no card needed"],
    flags: ALL_FLAGS,
    modules: "all",
    limits: { seats: 1, aiTokensPerMonth: FREE_AI_TOKENS, storageMb: 500, emailsPerMonth: 100, voiceMinutesPerMonth: 5, customDomains: 1 },
    trialDays: 0,
    active: true,
    isDefault: true,
    sortOrder: 10,
  },
  {
    _id: "starter",
    name: "Starter",
    description: "For a small team. Up to 10 people, every product and feature.",
    currency: "INR",
    priceMonthly: 49_900,
    priceYearly: 499_000,
    intervals: ["monthly", "yearly"],
    prices: { monthly: 49_900, yearly: 499_000 },
    highlights: [],
    listPrices: { monthly: 199_900, yearly: 1_999_000 },
    offerLabel: "Launch offer",
    flags: ALL_FLAGS,
    modules: "all",
    limits: { seats: 10, aiTokensPerMonth: 400_000, storageMb: 1_500, emailsPerMonth: 300, voiceMinutesPerMonth: 10, customDomains: 2 },
    trialDays: 0,
    active: true,
    isDefault: false,
    sortOrder: 20,
  },
  {
    _id: "growth",
    name: "Growth",
    description: "For a growing team. Up to 50 people, every product and feature.",
    currency: "INR",
    priceMonthly: 99_900,
    priceYearly: 999_000,
    intervals: ["monthly", "yearly"],
    prices: { monthly: 99_900, yearly: 999_000 },
    highlights: [],
    listPrices: { monthly: 399_900, yearly: 3_999_000 },
    offerLabel: "Launch offer",
    flags: ALL_FLAGS,
    modules: "all",
    limits: { seats: 50, aiTokensPerMonth: 1_000_000, storageMb: 10_000, emailsPerMonth: 2_000, voiceMinutesPerMonth: 40, customDomains: 3 },
    trialDays: 0,
    active: true,
    isDefault: false,
    sortOrder: 30,
  },
  {
    _id: "business",
    name: "Business",
    description: "For a company. Up to 200 people, every product and feature.",
    currency: "INR",
    priceMonthly: 199_900,
    priceYearly: 1_999_000,
    intervals: ["monthly", "yearly"],
    prices: { monthly: 199_900, yearly: 1_999_000 },
    highlights: [],
    listPrices: { monthly: 799_900, yearly: 7_999_000 },
    offerLabel: "Launch offer",
    flags: ALL_FLAGS,
    modules: "all",
    limits: { seats: 200, aiTokensPerMonth: 2_000_000, storageMb: 25_000, emailsPerMonth: 6_000, voiceMinutesPerMonth: 120, customDomains: 5 },
    trialDays: 0,
    active: true,
    isDefault: false,
    sortOrder: 40,
  },
  {
    _id: "enterprise",
    name: "Enterprise",
    description: "For large teams. Up to 500 people, set up with you.",
    currency: "INR",
    priceMonthly: 0,
    priceYearly: 0,
    intervals: ["monthly"],
    prices: { monthly: 0 },
    contactSales: true,
    highlights: ["Dedicated onboarding and support"],
    flags: ALL_FLAGS,
    modules: "all",
    limits: { seats: 500, aiTokensPerMonth: 20_000_000, storageMb: 512_000, emailsPerMonth: 100_000, voiceMinutesPerMonth: 3_000, customDomains: 20 },
    trialDays: 0,
    active: true,
    isDefault: false,
    sortOrder: 50,
  },
];

/** Bump when DEFAULT_PLANS changes (prices or limits): every catalogue still on an older revision is moved to it once. */
const PRICING_REV = 3;

/**
 * The launch offer. The paid plans carry a NORMAL price (`listPrices`) above the price they are sold at now (`prices`). Until the deadline
 * (`SAAS_BRAND.offerEndsAt`) the lower price is charged and the normal one is shown struck through; when the deadline passes
 * `endOfferIfDue` makes the normal price the real one, for every new subscription. Whoever bought during the offer keeps the price they bought.
 */
export function offerEndMs(): number | null {
  const t = SAAS_BRAND.offerEndsAt ? Date.parse(SAAS_BRAND.offerEndsAt) : NaN;
  return Number.isFinite(t) ? t : null;
}
export function offerActive(now = Date.now()): boolean {
  const end = offerEndMs();
  return end !== null && now < end;
}
/** A seed as it should be stored right now: with the offer running as written; once it has ended, the normal price is the price and the offer is gone. */
function effectiveSeed(seed: PlanSeed): PlanSeed {
  if (offerActive() || !seed.listPrices) return seed;
  const prices = { ...(seed.prices ?? {}), ...seed.listPrices };
  return { ...seed, prices, priceMonthly: prices.monthly ?? seed.priceMonthly, priceYearly: prices.yearly ?? seed.priceYearly, listPrices: undefined, offerLabel: undefined };
}

export const STANDARD_PLAN_IDS = DEFAULT_PLANS.map((p) => p._id);

let seeded = false;
async function collection() {
  const col = (await getPlatformDb()).collection<Plan>(PLANS_COLLECTION);
  if (!seeded) {
    seeded = true;
    if ((await col.countDocuments({}, { limit: 1 })) === 0) {
      const now = new Date();
      await col
        .insertMany(
          DEFAULT_PLANS.map(effectiveSeed).map((p) => {
            const prices = p.prices ?? { monthly: p.priceMonthly, yearly: p.priceYearly };
            const intervals: BillingInterval[] = p.intervals ?? ["monthly", "yearly"];
            return { ...p, intervals, prices, priceVersion: 1, priceHistory: [{ version: 1, currency: p.currency, intervals, prices, effectiveFrom: now, createdBy: "seed" }], createdAt: now, updatedAt: now };
          }),
        )
        .catch(() => {});
    }
  }
  await endOfferIfDue(col);
  return col;
}

let offerCheckedAt = 0;
let endingOffer = false;
/** After the deadline: every plan that still carries a normal price above its sold price is moved to the normal price, once. */
async function endOfferIfDue(col: Collection<Plan>): Promise<void> {
  const end = offerEndMs();
  if (end === null || Date.now() < end || endingOffer || Date.now() - offerCheckedAt < 60_000) return;
  offerCheckedAt = Date.now();
  const meta = (await getPlatformDb()).collection<{ _id: string; endsAt: number }>("platform_meta");
  if ((await meta.findOne({ _id: "offer-ended" }))?.endsAt === end) return;
  endingOffer = true;
  try {
    for (const live of await col.find({ "listPrices.monthly": { $gt: 0 } }).toArray()) {
      const prices = { monthly: live.priceMonthly, yearly: live.priceYearly, ...(live.prices ?? {}), ...(live.listPrices ?? {}) };
      const res = await savePlan(
        { _id: live._id, name: live.name, description: live.description, currency: live.currency, intervals: planIntervals(live), prices, modules: live.modules, highlights: live.highlights ?? [], flags: live.flags ?? [], limits: live.limits, trialDays: live.trialDays ?? null, active: live.active, isDefault: live.isDefault, listPrices: {}, offerLabel: "", lifetimeFree: live.lifetimeFree === true, contactSales: live.contactSales === true },
        "update",
        "system:offer-ended",
      );
      if (!res.ok) throw new Error(`offer end: ${live._id}: ${res.error}`);
    }
    await meta.updateOne({ _id: "offer-ended" }, { $set: { endsAt: end } }, { upsert: true });
  } catch (err) {
    console.error("[plans] could not end the offer", err);
    offerCheckedAt = 0;
  } finally {
    endingOffer = false;
  }
}

export async function listPlans(opts: { activeOnly?: boolean } = {}): Promise<Plan[]> {
  return (await collection()).find(opts.activeOnly ? { active: true } : {}).sort({ sortOrder: 1, _id: 1 }).toArray();
}

export async function getPlan(id: string): Promise<Plan | null> {
  return (await collection()).findOne({ _id: id });
}

export async function getDefaultPlan(): Promise<Plan | null> {
  const col = await collection();
  return (await col.findOne({ isDefault: true, active: true })) ?? (await col.findOne({ active: true }, { sort: { sortOrder: 1 } }));
}

// ---------------------------------------------------------------------------
// Managing the catalogue (Platform Console, `/console/plans`).
//
//  - Plan ids are stable, lowercase and never change once created.
//  - Exactly one ACTIVE plan is the default. Making a plan the default clears
//    the flag everywhere else; the default can't be deactivated or deleted —
//    another plan has to be made the default first.
//  - Deactivating (active = false) hides a plan from pricing/checkout and new
//    subscriptions; companies already on it keep it. When companies are on it
//    the caller must confirm with the current count (a stale confirmation is
//    refused). Deleting is only possible for a plan no company has ever used.
//  - PRICE VERSIONING. Prices, billing cycles and currency form a price
//    version. Changing any of them appends a new immutable version to
//    `priceHistory` (effective from the save) and bumps `priceVersion`; the
//    provider plan ids of the old version are moved onto that history entry
//    and removed from the plan, so the subscriptions workstream creates fresh
//    provider plans for NEW subscribers while existing provider subscriptions
//    (fixed-amount) keep charging what they bought. A subscription records the
//    version it bought (`CompanySubscription.priceVersion`), and
//    `planPriceAtVersion()` answers what it pays. Products, limits, highlights,
//    flags and trial days are not versioned: they apply to everyone on the
//    plan right away (trial days only to trials started afterwards).
//  - Every mutation writes the platform audit log.
// ---------------------------------------------------------------------------

/** What the Platform Console submits for a plan (money already in paise). */
export interface PlanInput {
  _id: string;
  name: string;
  description: string;
  currency: string;
  intervals: BillingInterval[];
  prices: Partial<Record<BillingInterval, number>>;
  modules: ModuleKey[] | "all";
  highlights: string[];
  flags: string[];
  limits: PlanLimits;
  /** null = platform default. */
  trialDays: number | null;
  active: boolean;
  isDefault: boolean;
  /** Struck-through "usual" prices per cycle (display only), the offer badge, and the plan kinds. */
  listPrices?: Partial<Record<BillingInterval, number>>;
  offerLabel?: string;
  lifetimeFree?: boolean;
  contactSales?: boolean;
}

/** Keys: id, name, description, currency, intervals, price.<interval>, modules, highlights, flags, limit.<key>, trialDays, isDefault. */
export type PlanFieldErrors = Record<string, string>;
export type SavePlanResult = { ok: true; plan: Plan; priceChanged: boolean } | { ok: false; error: string; fieldErrors?: PlanFieldErrors };
export type PlanMutationResult = { ok: true } | { ok: false; error: string; needsConfirmation?: { companies: number } };

export const PLAN_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;
export const CUSTOM_LIMIT_KEY_PATTERN = /^[a-z][a-zA-Z0-9]{1,39}$/;
export const MAX_TRIAL_DAYS = 365;
export const MAX_HIGHLIGHTS = 12;
export const MAX_CUSTOM_LIMITS = 10;
const MAX_PRICE = 100_000_000_00; // ₹10 crore in paise — a sanity bound, not a business rule.
/** Ids with a meaning elsewhere (the platform owner, the fallback trial) or in product URLs. */
const RESERVED_PLAN_IDS = new Set(["internal", "trial", "new", "all", "none", "default"]);
const SELECTABLE_MODULES = new Set<string>(MODULES.filter((m) => !m.core).map((m) => m.key));
const KNOWN_LIMITS = new Map<string, (typeof PLAN_LIMIT_DEFS)[number]>(PLAN_LIMIT_DEFS.map((d) => [d.key, d]));
const FLAG_KEYS = new Set<string>(PLAN_FLAGS.map((f) => f.key));

const isWholeNumber = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);

/** Field validation without the database. Uniqueness and the default rule are checked in `savePlan`. */
export function validatePlanInput(input: PlanInput, mode: "create" | "update"): PlanFieldErrors {
  const errors: PlanFieldErrors = {};
  if (mode === "create") {
    if (!PLAN_ID_PATTERN.test(input._id)) errors.id = "Use 2–32 lowercase letters, digits or hyphens, starting with a letter.";
    else if (RESERVED_PLAN_IDS.has(input._id)) errors.id = `"${input._id}" is reserved — choose another id.`;
  }
  const name = input.name.trim();
  if (!name) errors.name = "Give the plan a name.";
  else if (name.length > 60) errors.name = "Keep the name under 60 characters.";
  if (input.description.trim().length > 300) errors.description = "Keep the description under 300 characters.";
  if (!/^[A-Z]{3}$/.test(input.currency)) errors.currency = "Use a 3-letter currency code, e.g. INR.";

  const intervals = Array.isArray(input.intervals) ? input.intervals : [];
  if (intervals.length === 0) errors.intervals = "Offer at least one billing cycle.";
  else if (intervals.some((i) => !BILLING_INTERVAL_IDS.includes(i))) errors.intervals = "Unknown billing cycle.";
  for (const i of intervals) {
    const price = input.prices?.[i];
    if (!isWholeNumber(price) || price < 0 || price > MAX_PRICE) errors[`price.${i}`] = "Enter a price of 0 or more.";
  }

  if (input.modules !== "all") {
    if (!Array.isArray(input.modules) || input.modules.length === 0) errors.modules = "Pick at least one product, or include every product.";
    else if (input.modules.some((m) => !SELECTABLE_MODULES.has(m))) errors.modules = "Unknown product selected.";
  }

  if (!Array.isArray(input.highlights) || input.highlights.length > MAX_HIGHLIGHTS) errors.highlights = `Up to ${MAX_HIGHLIGHTS} highlights.`;
  else if (input.highlights.some((h) => typeof h !== "string" || !h.trim() || h.trim().length > 120)) errors.highlights = "Each highlight needs 1–120 characters.";
  if (!Array.isArray(input.flags) || input.flags.some((f) => !FLAG_KEYS.has(f))) errors.flags = "Unknown feature flag.";
  for (const i of intervals) {
    const lp = input.listPrices?.[i];
    if (lp !== undefined && (!isWholeNumber(lp) || lp < 0 || lp > MAX_PRICE)) errors[`listPrice.${i}`] = "Enter a price of 0 or more, or leave blank.";
  }
  if ((input.offerLabel ?? "").trim().length > 40) errors.offerLabel = "Keep the offer label under 40 characters.";

  const limitKeys = Object.keys(input.limits ?? {});
  for (const def of PLAN_LIMIT_DEFS) if (!limitKeys.includes(def.key)) errors[`limit.${def.key}`] = "Missing limit.";
  const custom = limitKeys.filter((k) => !KNOWN_LIMITS.has(k));
  if (custom.length > MAX_CUSTOM_LIMITS) errors.limits = `Up to ${MAX_CUSTOM_LIMITS} custom limits.`;
  for (const key of limitKeys) {
    const v = input.limits[key];
    const def = KNOWN_LIMITS.get(key);
    if (!def && !CUSTOM_LIMIT_KEY_PATTERN.test(key)) {
      errors[`limit.${key}`] = "Limit keys are camelCase letters and digits, e.g. projects or clientPortals.";
      continue;
    }
    const min = def?.min ?? 0;
    if (v !== null && (!isWholeNumber(v) || v < min)) errors[`limit.${key}`] = min > 0 ? `Enter at least ${min}, or leave blank for unlimited.` : "Enter a whole number, or leave blank for unlimited.";
  }

  if (input.trialDays !== null && (!isWholeNumber(input.trialDays) || input.trialDays < 0 || input.trialDays > MAX_TRIAL_DAYS)) errors.trialDays = `Enter 0–${MAX_TRIAL_DAYS} days, or leave blank for the platform default.`;
  if (input.isDefault && !input.active) errors.isDefault = "The default plan must be active.";
  return errors;
}

function normalise(input: PlanInput): PlanInput {
  const intervals = BILLING_INTERVAL_IDS.filter((i) => Array.isArray(input.intervals) && input.intervals.includes(i));
  const unknownIntervals = Array.isArray(input.intervals) ? input.intervals.filter((i) => !BILLING_INTERVAL_IDS.includes(i)) : [];
  const prices: Partial<Record<BillingInterval, number>> = {};
  for (const i of intervals) prices[i] = input.prices?.[i] as number;
  const limits: PlanLimits = { seats: null, aiTokensPerMonth: null, storageMb: null };
  const listPrices: Partial<Record<BillingInterval, number>> = {};
  for (const i of intervals) if (typeof input.listPrices?.[i] === "number") listPrices[i] = input.listPrices[i] as number;
  for (const [k, v] of Object.entries(input.limits ?? {})) limits[String(k).trim()] = v === null || v === undefined ? null : (v as number);
  return {
    _id: String(input._id ?? "").trim().toLowerCase(),
    name: String(input.name ?? "").trim(),
    description: String(input.description ?? "").trim(),
    currency: String(input.currency ?? "").trim().toUpperCase(),
    intervals: [...intervals, ...unknownIntervals],
    prices,
    modules: input.modules === "all" ? "all" : Array.isArray(input.modules) ? ([...new Set(input.modules.map(String))].sort((a, b) => a.localeCompare(b)) as ModuleKey[]) : [],
    highlights: Array.isArray(input.highlights) ? input.highlights.map((h) => String(h ?? "").trim()).filter(Boolean) : [],
    flags: Array.isArray(input.flags) ? [...new Set(input.flags.map(String))].sort((a, b) => a.localeCompare(b)) : [],
    limits,
    trialDays: input.trialDays === null || input.trialDays === undefined ? null : input.trialDays,
    active: input.active === true,
    isDefault: input.isDefault === true,
    listPrices,
    offerLabel: String(input.offerLabel ?? "").trim(),
    lifetimeFree: input.lifetimeFree === true,
    contactSales: input.contactSales === true,
  };
}

/** The pricing part of a plan (what a price version captures), normalised for comparison. */
function pricingOf(plan: Pick<Plan, "currency" | "priceMonthly" | "priceYearly" | "intervals" | "prices">) {
  const intervals = planIntervals(plan);
  const prices: Partial<Record<BillingInterval, number>> = {};
  for (const i of intervals) prices[i] = planPrice(plan, i) ?? 0;
  return { currency: plan.currency, intervals, prices };
}

const samePricing = (a: ReturnType<typeof pricingOf>, b: ReturnType<typeof pricingOf>) => JSON.stringify(a) === JSON.stringify(b);

/** Which top-level fields differ (for the audit log; values are small and secret-free). */
function changedFields(before: Plan, after: Record<string, unknown>): string[] {
  const keys = ["name", "description", "currency", "intervals", "prices", "modules", "highlights", "flags", "limits", "trialDays", "active", "isDefault", "listPrices", "offerLabel", "lifetimeFree", "contactSales"];
  return keys.filter((k) => JSON.stringify((before as unknown as Record<string, unknown>)[k] ?? null) !== JSON.stringify(after[k] ?? null));
}

/**
 * Creates or edits a plan. Never touches `createdAt`; provider ids are only
 * moved into the price history when the pricing changes (see above).
 */
export async function savePlan(raw: PlanInput, mode: "create" | "update", actorId: string): Promise<SavePlanResult> {
  const clean = normalise(raw);
  const fieldErrors = validatePlanInput(clean, mode);
  const col = await collection();
  const existing = PLAN_ID_PATTERN.test(clean._id) ? await col.findOne({ _id: clean._id }) : null;
  if (mode === "create" && existing) fieldErrors.id = `A plan with the id "${clean._id}" already exists.`;
  if (mode === "update" && !existing) return { ok: false, error: "That plan no longer exists." };
  if (existing?.isDefault && existing.active) {
    if (!clean.active) fieldErrors.isDefault = "The default plan can't be deactivated. Make another plan the default first.";
    else if (!clean.isDefault) fieldErrors.isDefault = "This is the default plan. Make another plan the default instead.";
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, error: "Fix the highlighted fields.", fieldErrors };

  const now = new Date();
  const pricing = { currency: clean.currency, intervals: clean.intervals, prices: clean.prices };
  const fields = {
    name: clean.name,
    description: clean.description,
    currency: clean.currency,
    intervals: clean.intervals,
    prices: clean.prices,
    // Mirrors for code that predates configurable cycles (0 when the cycle isn't offered).
    priceMonthly: clean.prices.monthly ?? 0,
    priceYearly: clean.prices.yearly ?? 0,
    modules: clean.modules,
    highlights: clean.highlights,
    flags: clean.flags,
    limits: clean.limits,
    trialDays: clean.trialDays,
    active: clean.active,
    isDefault: clean.isDefault,
    listPrices: clean.listPrices ?? {},
    offerLabel: clean.offerLabel ?? "",
    lifetimeFree: clean.lifetimeFree === true,
    contactSales: clean.contactSales === true,
    updatedAt: now,
  };

  let priceChanged = false;
  if (mode === "create") {
    const last = await col.find({}, { projection: { sortOrder: 1 } }).sort({ sortOrder: -1 }).limit(1).next();
    const version: PlanPriceVersion = { version: 1, ...pricing, effectiveFrom: now, createdBy: actorId };
    try {
      await col.insertOne({ _id: clean._id, ...fields, sortOrder: (last?.sortOrder ?? 0) + 10, priceVersion: 1, priceHistory: [version], createdAt: now });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return { ok: false, error: "Fix the highlighted fields.", fieldErrors: { id: `A plan with the id "${clean._id}" already exists.` } };
      throw err;
    }
    priceChanged = true;
  } else {
    const before = existing!;
    const oldPricing = pricingOf(before);
    priceChanged = !samePricing(oldPricing, pricingOf({ ...before, ...fields }));
    if (priceChanged) {
      const fromVersion = currentPriceVersion(before);
      // Older docs have no history: record what they were selling as version 1 (effective since creation).
      const history: PlanPriceVersion[] = before.priceHistory?.length ? before.priceHistory.map((v) => ({ ...v })) : [{ version: fromVersion, ...oldPricing, effectiveFrom: before.createdAt, createdBy: "legacy" }];
      const last = history[history.length - 1];
      if (before.provider) last.provider = before.provider;
      history.push({ version: fromVersion + 1, ...pricing, effectiveFrom: now, createdBy: actorId });
      // Conditional on the version we read, so two concurrent price edits can't both claim the same version.
      const res = await col.updateOne(
        { _id: clean._id, ...(before.priceVersion === undefined ? { priceVersion: { $exists: false } } : { priceVersion: before.priceVersion }) },
        { $set: { ...fields, priceVersion: fromVersion + 1, priceHistory: history }, $unset: { provider: "" } },
      );
      if (res.matchedCount !== 1) return { ok: false, error: "Someone else changed this plan's prices just now. Reload and try again." };
    } else {
      await col.updateOne({ _id: clean._id }, { $set: fields });
    }
  }
  if (clean.isDefault) await col.updateMany({ _id: { $ne: clean._id }, isDefault: true }, { $set: { isDefault: false, updatedAt: now } });

  const plan = (await col.findOne({ _id: clean._id }))!;
  await recordPlatformAudit({
    actorId,
    action: mode === "create" ? "plan.create" : "plan.update",
    target: { type: "plan", id: plan._id },
    details:
      mode === "create"
        ? { name: plan.name, currency: plan.currency, prices: plan.prices, intervals: plan.intervals, isDefault: plan.isDefault }
        : {
            changed: changedFields(existing!, fields),
            ...(priceChanged ? { priceVersion: { from: currentPriceVersion(existing!), to: plan.priceVersion }, prices: { from: pricingOf(existing!).prices, to: plan.prices }, currency: plan.currency } : {}),
          },
  });
  return { ok: true, plan, priceChanged };
}

/** Companies whose subscription is on the plan (any status; the platform owner excluded). */
export async function countCompaniesOnPlan(id: string): Promise<number> {
  return (await getPlatformDb()).collection(COMPANIES_COLLECTION).countDocuments({ isPlatformOwner: { $ne: true }, "subscription.planId": id });
}

/**
 * Activate or deactivate a plan. Deactivating the default is refused; when
 * companies are on the plan, `confirmCompanies` must equal their current count
 * (otherwise `needsConfirmation` reports it). Companies on it keep it.
 */
export async function setPlanActive(id: string, active: boolean, actorId: string, opts: { confirmCompanies?: number } = {}): Promise<PlanMutationResult> {
  const col = await collection();
  const plan = await col.findOne({ _id: id });
  if (!plan) return { ok: false, error: "That plan no longer exists." };
  if (plan.active === active) return { ok: true };
  if (!active) {
    if (plan.isDefault) return { ok: false, error: "The default plan can't be deactivated. Make another plan the default first." };
    const companies = await countCompaniesOnPlan(id);
    if (companies > 0 && opts.confirmCompanies !== companies) {
      return { ok: false, error: `${companies} ${companies === 1 ? "company is" : "companies are"} on this plan. Confirm to deactivate it — they keep it.`, needsConfirmation: { companies } };
    }
  }
  await col.updateOne({ _id: id }, { $set: { active, updatedAt: new Date() } });
  await recordPlatformAudit({ actorId, action: active ? "plan.activate" : "plan.deactivate", target: { type: "plan", id }, details: active ? {} : { companiesOnPlan: await countCompaniesOnPlan(id) } });
  return { ok: true };
}

/** Makes an active plan the default for new sign-ups (clears the flag elsewhere). */
export async function setDefaultPlan(id: string, actorId: string): Promise<PlanMutationResult> {
  const col = await collection();
  const plan = await col.findOne({ _id: id });
  if (!plan) return { ok: false, error: "That plan no longer exists." };
  if (!plan.active) return { ok: false, error: "Activate the plan before making it the default." };
  if (plan.isDefault) return { ok: true };
  const previous = await col.findOne({ isDefault: true }, { projection: { _id: 1 } });
  const now = new Date();
  await col.updateOne({ _id: id }, { $set: { isDefault: true, updatedAt: now } });
  await col.updateMany({ _id: { $ne: id }, isDefault: true }, { $set: { isDefault: false, updatedAt: now } });
  await recordPlatformAudit({ actorId, action: "plan.set_default", target: { type: "plan", id }, details: { previous: previous?._id ?? null } });
  return { ok: true };
}

/** Moves a plan one place up or down the list (renumbers every plan 10, 20, 30 …). */
export async function movePlan(id: string, direction: "up" | "down", actorId: string): Promise<PlanMutationResult> {
  const col = await collection();
  const plans = await col.find({}, { projection: { _id: 1, sortOrder: 1 } }).sort({ sortOrder: 1, _id: 1 }).toArray();
  const from = plans.findIndex((p) => p._id === id);
  if (from === -1) return { ok: false, error: "That plan no longer exists." };
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= plans.length) return { ok: true };
  [plans[from], plans[to]] = [plans[to], plans[from]];
  const now = new Date();
  await col.bulkWrite(plans.map((p, i) => ({ updateOne: { filter: { _id: p._id }, update: { $set: { sortOrder: (i + 1) * 10, updatedAt: now } } } })));
  await recordPlatformAudit({ actorId, action: "plan.reorder", target: { type: "plan", id }, details: { direction, order: plans.map((p) => p._id) } });
  return { ok: true };
}

/**
 * Deletes a plan that no company is on and none ever was (no subscription
 * history). Anything else must be deactivated instead, so history, invoices
 * and revenue analytics keep resolving the plan.
 */
export async function deletePlan(id: string, actorId: string): Promise<PlanMutationResult> {
  const col = await collection();
  const plan = await col.findOne({ _id: id });
  if (!plan) return { ok: false, error: "That plan no longer exists." };
  if (plan.isDefault) return { ok: false, error: "The default plan can't be deleted. Make another plan the default first." };
  const db = await getPlatformDb();
  const [companies, history] = await Promise.all([countCompaniesOnPlan(id), db.collection("subscription_events").countDocuments({ planId: id }, { limit: 1 })]);
  if (companies > 0) return { ok: false, error: `${companies} ${companies === 1 ? "company is" : "companies are"} on this plan, so it can't be deleted. Deactivate it instead.` };
  if (history > 0) return { ok: false, error: "Companies have used this plan before, so it's kept for their history. Deactivate it instead." };
  await col.deleteOne({ _id: id });
  await recordPlatformAudit({ actorId, action: "plan.delete", target: { type: "plan", id }, details: { name: plan.name } });
  return { ok: true };
}

/**
 * How many companies reference each plan (any subscription status; the
 * platform owner excluded), read from the raw registry so it covers every
 * company. Companies without a stored subscription aren't counted.
 */
export async function countCompaniesByPlan(): Promise<Map<string, number>> {
  const rows = await (await getPlatformDb())
    .collection(COMPANIES_COLLECTION)
    .aggregate<{ _id: string; n: number }>([
      { $match: { isPlatformOwner: { $ne: true }, "subscription.planId": { $type: "string" } } },
      { $group: { _id: "$subscription.planId", n: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id, r.n]));
}

/** Whether a plan switches on a capability flag. */
export function planHasFlag(plan: Pick<Plan, "flags"> | null | undefined, flag: string): boolean {
  return Boolean(plan?.flags?.includes(flag));
}


/**
 * Loads (or refreshes) the simple pricing: Free, Starter, Growth, Business, Enterprise (see `DEFAULT_PLANS`). Plans that already exist are
 * updated in place; a price change becomes a new price version, so companies already subscribed keep what they bought. Free becomes the
 * default plan for new sign-ups. Anything else in the catalogue is left as it is.
 */
export async function applySimplePricing(actorId: string): Promise<{ ok: true; created: string[]; updated: string[] } | { ok: false; error: string }> {
  const col = await collection();
  const created: string[] = [];
  const updated: string[] = [];
  // Free first, so it takes the default flag before the old default is edited.
  for (const seed of DEFAULT_PLANS.map(effectiveSeed)) {
    const exists = Boolean(await col.findOne({ _id: seed._id }, { projection: { _id: 1 } }));
    const res = await savePlan(
      {
        _id: seed._id,
        name: seed.name,
        description: seed.description,
        currency: seed.currency,
        intervals: seed.intervals ?? ["monthly", "yearly"],
        prices: seed.prices ?? { monthly: seed.priceMonthly, yearly: seed.priceYearly },
        modules: seed.modules,
        highlights: seed.highlights ?? [],
        flags: seed.flags ?? [],
        limits: seed.limits,
        trialDays: seed.trialDays,
        active: true,
        isDefault: seed.isDefault,
        listPrices: seed.listPrices ?? {},
        offerLabel: seed.offerLabel ?? "",
        lifetimeFree: seed.lifetimeFree === true,
        contactSales: seed.contactSales === true,
      },
      exists ? "update" : "create",
      actorId,
    );
    if (!res.ok) return { ok: false, error: `${seed.name}: ${res.error}${res.fieldErrors ? ` (${Object.entries(res.fieldErrors).map(([k, v]) => `${k}: ${v}`).join("; ")})` : ""}` };
    (exists ? updated : created).push(seed._id);
    await col.updateOne({ _id: seed._id }, { $set: { sortOrder: seed.sortOrder } });
  }
  return { ok: true, created, updated };
}


/**
 * The five plans the pricing screens always show, in order: the catalogue's own version of each (so edits in the Platform Console apply),
 * or the built-in one when it is missing or switched off. Missing plans are also written to the catalogue (existing ones are never
 * touched), so a fresh database sells the five plans from the first request. Never returns fewer than five.
 */
let upgrading: Promise<{ ok: boolean }> | null = null;

/** A stored plan from before the five-plan pricing (no list prices / plan kind / new limits): it is brought up to date once. */
function isLegacyStandardPlan(live: Plan, seed: PlanSeed): boolean {
  return (
    (seed.listPrices !== undefined && live.listPrices === undefined) ||
    (seed.lifetimeFree === true && live.lifetimeFree === undefined) ||
    (seed.contactSales === true && live.contactSales === undefined) ||
    live.limits.emailsPerMonth === undefined
  );
}

export async function getStandardPlans(): Promise<Plan[]> {
  const col = await collection();
  let stored = await col.find({ _id: { $in: STANDARD_PLAN_IDS } }).toArray();
  // Plans saved before the five-plan pricing are updated in place (a price change is a new price version, so subscribers keep theirs).
  if (stored.some((live) => { const seed = DEFAULT_PLANS.find((d) => d._id === live._id); return seed ? isLegacyStandardPlan(live, seed) : false; })) {
    upgrading ??= applySimplePricing("system").finally(() => { upgrading = null; });
    await upgrading.catch(() => {});
    stored = await col.find({ _id: { $in: STANDARD_PLAN_IDS } }).toArray();
  }
  // The final pricing (prices and limits worked out in the Costs & pricing calculator) is loaded once into any catalogue still on an
  // older revision; after that the operator's edits are never overwritten.
  const meta = (await getPlatformDb()).collection<{ _id: string; rev: number }>("platform_meta");
  if (((await meta.findOne({ _id: "pricing-rev" }))?.rev ?? 0) < PRICING_REV) {
    upgrading ??= applySimplePricing("system:pricing-rev").finally(() => { upgrading = null; });
    const done = await upgrading.catch(() => ({ ok: false }));
    if (done.ok) await meta.updateOne({ _id: "pricing-rev" }, { $set: { rev: PRICING_REV } }, { upsert: true });
    stored = await col.find({ _id: { $in: STANDARD_PLAN_IDS } }).toArray();
  }
  // The Free plan used to carry 20,000 AI tokens — too few to even finish the sign-up website. A stored Free plan still on exactly that
  // number (never edited) is raised once; any other value was chosen by the operator and is left alone.
  const freeLive = stored.find((p) => p._id === "free");
  if (freeLive && freeLive.limits.aiTokensPerMonth === OLD_FREE_AI_TOKENS) {
    await col.updateOne({ _id: "free", "limits.aiTokensPerMonth": OLD_FREE_AI_TOKENS }, { $set: { "limits.aiTokensPerMonth": FREE_AI_TOKENS, updatedAt: new Date() } });
    freeLive.limits = { ...freeLive.limits, aiTokensPerMonth: FREE_AI_TOKENS };
  }
  const byId = new Map(stored.map((p) => [p._id, p]));
  const missing = DEFAULT_PLANS.filter((p) => !byId.has(p._id));
  if (missing.length > 0) {
    const now = new Date();
    await col
      .insertMany(
        missing.map(effectiveSeed).map((p) => {
          const prices = p.prices ?? { monthly: p.priceMonthly, yearly: p.priceYearly };
          const intervals: BillingInterval[] = p.intervals ?? ["monthly", "yearly"];
          return { ...p, intervals, prices, priceVersion: 1, priceHistory: [{ version: 1, currency: p.currency, intervals, prices, effectiveFrom: now, createdBy: "seed" }], createdAt: now, updatedAt: now };
        }),
        { ordered: false },
      )
      .catch(() => {});
  }
  const now = new Date();
  return DEFAULT_PLANS.map(effectiveSeed).map((seed) => {
    const live = byId.get(seed._id);
    return live && live.active ? live : { ...seed, createdAt: now, updatedAt: now };
  });
}
