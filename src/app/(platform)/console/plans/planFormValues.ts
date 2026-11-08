import type { ModuleKey } from "@/lib/platform/onboarding/catalog";
import { BILLING_INTERVALS, PLAN_LIMIT_DEFS, type BillingInterval, type Plan, type PlanLimits } from "@/lib/platform/billing/types";
import { planIntervals, planPrice } from "@/lib/platform/billing/pricing";

/**
 * The plan form's raw values (what the browser submits) and their conversion
 * to/from a plan. Client-safe and data-free: prices are typed in major units
 * (rupees) and stored in minor units (paise); a blank limit means unlimited;
 * blank trial days means the platform default.
 */

export interface PlanFormValues {
  id: string;
  name: string;
  description: string;
  currency: string;
  /** One row per known billing cycle. Price in major units, up to 2 decimals. */
  cycles: { id: BillingInterval; enabled: boolean; price: string; /** The "usual" price shown struck through (blank or absent = none). */ list?: string }[];
  allModules: boolean;
  modules: string[];
  /** One highlight per line. */
  highlights: string;
  flags: string[];
  /** Known limits by key; blank = unlimited. */
  limits: Record<string, string>;
  /** Further numeric limits; blank value = unlimited. */
  customLimits: { key: string; value: string }[];
  /** Blank = platform default. */
  trialDays: string;
  active: boolean;
  isDefault: boolean;
  /** Badge on the offer, e.g. "Launch offer". */
  offerLabel: string;
  /** Free for life: never billed, no trial. */
  lifetimeFree: boolean;
  /** Not sold online: "Contact support" instead of a price. */
  contactSales: boolean;
}

export interface ParsedPlanForm {
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
  trialDays: number | null;
  active: boolean;
  isDefault: boolean;
  listPrices: Partial<Record<BillingInterval, number>>;
  offerLabel: string;
  lifetimeFree: boolean;
  contactSales: boolean;
}

/** Same keys as the server's `PlanFieldErrors` (id, price.<cycle>, limit.<key>, customLimits …). */
export type PlanFormErrors = Record<string, string>;

export function emptyPlanForm(currency: string): PlanFormValues {
  return {
    id: "",
    name: "",
    description: "",
    currency,
    cycles: BILLING_INTERVALS.map((i) => ({ id: i.id, enabled: true, price: "", list: "" })),
    allModules: false,
    modules: [],
    highlights: "",
    flags: [],
    limits: Object.fromEntries(PLAN_LIMIT_DEFS.map((d) => [d.key, ""])),
    customLimits: [],
    trialDays: "",
    active: true,
    isDefault: false,
    offerLabel: "",
    lifetimeFree: false,
    contactSales: false,
  };
}

/** Minor units → "1999" / "1999.50" for an input. */
export function minorToMajor(amount: number): string {
  const whole = Math.trunc(amount / 100);
  const rest = Math.abs(amount % 100);
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, "0")}`;
}

/** "1,999.5" → 199950; NaN when it isn't a non-negative amount with at most 2 decimals. */
export function majorToMinor(value: string): number {
  const v = value.replace(/[,\s₹$€£]/g, "");
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) return Number.NaN;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

const toInt = (value: string): number => (/^-?\d{1,15}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN);
const toLimit = (value: string): number | null => (value.replace(/[,\s]/g, "") === "" ? null : toInt(value.replace(/[,\s]/g, "")));
const KNOWN = new Set<string>(PLAN_LIMIT_DEFS.map((d) => d.key));

export function planToFormValues(plan: Plan): PlanFormValues {
  const limit = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  const offered = planIntervals(plan);
  return {
    id: plan._id,
    name: plan.name,
    description: plan.description,
    currency: plan.currency,
    cycles: BILLING_INTERVALS.map((i) => {
      const price = offered.includes(i.id) ? planPrice(plan, i.id) : (plan.prices?.[i.id] ?? null);
      const list = plan.listPrices?.[i.id];
      return { id: i.id, enabled: offered.includes(i.id), price: price === null ? "" : minorToMajor(price), list: typeof list === "number" ? minorToMajor(list) : "" };
    }),
    allModules: plan.modules === "all",
    modules: plan.modules === "all" ? [] : [...plan.modules],
    highlights: (plan.highlights ?? []).join("\n"),
    flags: [...(plan.flags ?? [])],
    limits: Object.fromEntries(PLAN_LIMIT_DEFS.map((d) => [d.key, limit(plan.limits[d.key])])),
    customLimits: Object.entries(plan.limits)
      .filter(([k]) => !KNOWN.has(k))
      .map(([key, v]) => ({ key, value: limit(v) })),
    trialDays: plan.trialDays === null || plan.trialDays === undefined ? "" : String(plan.trialDays),
    active: plan.active,
    isDefault: plan.isDefault,
    offerLabel: plan.offerLabel ?? "",
    lifetimeFree: plan.lifetimeFree === true,
    contactSales: plan.contactSales === true,
  };
}

/**
 * Converts submitted values to a plan input. Values that can't be read as
 * numbers become NaN, which the plan validator reports on the right field;
 * the money format and duplicate custom limit keys get their own messages here.
 */
export function parsePlanForm(v: PlanFormValues): { input: ParsedPlanForm; errors: PlanFormErrors } {
  const errors: PlanFormErrors = {};
  const cycles = Array.isArray(v.cycles) ? v.cycles : [];
  const intervals: BillingInterval[] = [];
  const prices: Partial<Record<BillingInterval, number>> = {};
  const listPrices: Partial<Record<BillingInterval, number>> = {};
  for (const c of cycles) {
    if (!c || c.enabled !== true) continue;
    const id = String(c.id) as BillingInterval;
    intervals.push(id);
    const amount = majorToMinor(String(c.price ?? ""));
    if (Number.isNaN(amount)) errors[`price.${id}`] = "Enter an amount, e.g. 999 or 999.50.";
    prices[id] = amount;
    const listText = String(c.list ?? "").trim();
    if (listText !== "") {
      const lp = majorToMinor(listText);
      if (Number.isNaN(lp)) errors[`listPrice.${id}`] = "Enter an amount, or leave blank.";
      else listPrices[id] = lp;
    }
  }

  const limits: PlanLimits = { seats: null, aiTokensPerMonth: null, storageMb: null };
  for (const d of PLAN_LIMIT_DEFS) limits[d.key] = toLimit(String(v.limits?.[d.key] ?? ""));
  const seen = new Set<string>();
  for (const [index, row] of (Array.isArray(v.customLimits) ? v.customLimits : []).entries()) {
    const key = String(row?.key ?? "").trim();
    if (!key && String(row?.value ?? "").trim() === "") continue; // an untouched empty row
    if (!key) {
      errors[`customLimits.${index}`] = "Give the limit a key, e.g. projects.";
      continue;
    }
    if (KNOWN.has(key) || seen.has(key)) {
      errors[`customLimits.${index}`] = `"${key}" is already a limit on this plan.`;
      continue;
    }
    seen.add(key);
    limits[key] = toLimit(String(row?.value ?? ""));
  }

  const trial = String(v.trialDays ?? "").trim();
  return {
    errors,
    input: {
      _id: String(v.id ?? ""),
      name: String(v.name ?? ""),
      description: String(v.description ?? ""),
      currency: String(v.currency ?? ""),
      intervals,
      prices,
      modules: v.allModules ? "all" : ((Array.isArray(v.modules) ? v.modules.map(String) : []) as ModuleKey[]),
      highlights: String(v.highlights ?? "")
        .split("\n")
        .map((h) => h.trim())
        .filter(Boolean),
      flags: Array.isArray(v.flags) ? v.flags.map(String) : [],
      limits,
      trialDays: trial === "" ? null : toInt(trial),
      active: v.active === true,
      isDefault: v.isDefault === true,
      listPrices,
      offerLabel: String(v.offerLabel ?? ""),
      lifetimeFree: v.lifetimeFree === true,
      contactSales: v.contactSales === true,
    },
  };
}
