"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { getPlan, listPlans, savePlan } from "@/lib/platform/billing/plans";
import { toCostPlan } from "@/lib/platform/costs/plans";
import { loadCostSettings, saveCostSettings } from "@/lib/platform/costs/store";
import { computePlans, sanitizeSettings, type CostSettings, type PlanInputForCost } from "@/lib/platform/costs/model";
import { majorToMinor, minorToMajor, parsePlanForm, planToFormValues } from "../plans/planFormValues";

type Result = { ok: true; message: string } | { ok: false; error: string };

/** Saves the assumptions (exchange rate, margin, how much customers use, shared bills …). */
export async function saveCostSettingsAction(raw: Partial<CostSettings>): Promise<Result> {
  const user = await requirePlatformPermission("plans.manage");
  if (!raw || typeof raw !== "object") return { ok: false, error: "Nothing to save." };
  await saveCostSettings(raw, user.id);
  revalidatePath("/console/costs");
  return { ok: true, message: "Assumptions saved." };
}

/**
 * Sets a plan's price to the suggestion worked out from the SAVED assumptions (never from a number the browser sends): the monthly
 * price becomes the suggestion and every other cycle moves by the same ratio, so the plan's own discounts stay. It goes through the same
 * save as the plan editor, so it is a new price version — companies already subscribed keep what they bought.
 */
export async function applyRecommendedPriceAction(planId: string, kind: "recommended" | "safe"): Promise<Result> {
  const user = await requirePlatformPermission("plans.manage");
  if (kind !== "recommended" && kind !== "safe") return { ok: false, error: "Unknown price." };
  const plan = await getPlan(String(planId));
  if (!plan) return { ok: false, error: "That plan no longer exists." };
  const [{ settings }, all] = await Promise.all([loadCostSettings(), listPlans()]);
  const inputs = (await Promise.all(all.map((p) => toCostPlan(p._id)))).filter((p): p is PlanInputForCost => !!p);
  const row = computePlans(inputs, sanitizeSettings(settings)).rows.find((r) => r.plan.id === plan._id);
  if (!row || row.plan.contactSales || row.plan.lifetimeFree || row.plan.priceMonthlyPaise === 0) return { ok: false, error: "This plan isn't priced by the calculator (free or contact-sales)." };
  const target = kind === "safe" ? row.safe : row.recommended;
  if (!(target > 0)) return { ok: false, error: "No price could be worked out for this plan." };
  const oldMonthly = row.plan.priceMonthlyPaise;
  const newMonthly = Math.round(target) * 100;
  if (newMonthly === oldMonthly) return { ok: false, error: "The plan already has this price." };
  const ratio = newMonthly / oldMonthly;
  const values = planToFormValues(plan);
  values.cycles = values.cycles.map((c) => {
    if (!c.enabled) return c;
    const old = majorToMinor(c.price);
    const next = c.id === "monthly" ? newMonthly : Math.round((old * ratio) / 100) * 100;
    const list = c.list ? Math.max(majorToMinor(c.list), next) : undefined;
    return { ...c, price: minorToMajor(next), ...(list !== undefined ? { list: minorToMajor(list) } : {}) };
  });
  const { input, errors } = parsePlanForm(values);
  if (Object.keys(errors).length > 0) return { ok: false, error: `Couldn't prepare the plan: ${Object.values(errors)[0]}` };
  const res = await savePlan(input, "update", user.id);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/console", "layout");
  return { ok: true, message: `${plan.name}: monthly price is now ₹${Math.round(target).toLocaleString("en-IN")} (new price version ${res.plan.priceVersion}; existing subscribers keep theirs).` };
}
