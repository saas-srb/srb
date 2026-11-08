"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { applySimplePricing, deletePlan, movePlan, savePlan, setDefaultPlan, setPlanActive, validatePlanInput, type PlanMutationResult } from "@/lib/platform/billing/plans";
import { parsePlanForm, type PlanFormErrors, type PlanFormValues } from "./planFormValues";

export type SavePlanActionResult = { ok: true; id: string; message: string } | { ok: false; error: string; fieldErrors?: PlanFormErrors };

const done = () => revalidatePath("/console", "layout");

export async function savePlanAction(mode: "create" | "update", values: PlanFormValues): Promise<SavePlanActionResult> {
  const user = await requirePlatformPermission("plans.manage");
  if (mode !== "create" && mode !== "update") return { ok: false, error: "Unknown action." };
  if (!values || typeof values !== "object") return { ok: false, error: "Nothing to save." };
  const { input, errors } = parsePlanForm(values);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Fix the highlighted fields.", fieldErrors: { ...validatePlanInput(input, mode), ...errors } };
  }
  const res = await savePlan(input, mode, user.id);
  if (!res.ok) return res;
  done();
  const name = res.plan.name;
  const message =
    mode === "create"
      ? `Plan "${name}" created.`
      : res.priceChanged
        ? `Plan "${name}" saved. New prices are price version ${res.plan.priceVersion} and apply to new subscriptions; existing subscribers keep theirs.`
        : `Plan "${name}" saved.`;
  return { ok: true, id: res.plan._id, message };
}

export async function setPlanActiveAction(id: string, active: boolean, confirmCompanies?: number): Promise<PlanMutationResult> {
  const user = await requirePlatformPermission("plans.manage");
  const res = await setPlanActive(String(id), active === true, user.id, { confirmCompanies: typeof confirmCompanies === "number" ? confirmCompanies : undefined });
  if (res.ok) done();
  return res;
}

export async function setDefaultPlanAction(id: string): Promise<PlanMutationResult> {
  const user = await requirePlatformPermission("plans.manage");
  const res = await setDefaultPlan(String(id), user.id);
  if (res.ok) done();
  return res;
}

export async function movePlanAction(id: string, direction: "up" | "down"): Promise<PlanMutationResult> {
  const user = await requirePlatformPermission("plans.manage");
  if (direction !== "up" && direction !== "down") return { ok: false, error: "Unknown direction." };
  const res = await movePlan(String(id), direction, user.id);
  if (res.ok) done();
  return res;
}

export async function deletePlanAction(id: string): Promise<PlanMutationResult> {
  const user = await requirePlatformPermission("plans.manage");
  const res = await deletePlan(String(id), user.id);
  if (res.ok) done();
  return res;
}


/** Loads the simple pricing (Free, Starter, Growth, Business, Enterprise) into the catalogue; existing subscribers keep the price they bought. */
export async function applySimplePricingAction(): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const user = await requirePlatformPermission("plans.manage");
  const res = await applySimplePricing(user.id);
  if (!res.ok) return res;
  done();
  revalidatePath("/pricing");
  return { ok: true, message: `Simple pricing loaded: ${[...res.created, ...res.updated].join(", ")}.` };
}
