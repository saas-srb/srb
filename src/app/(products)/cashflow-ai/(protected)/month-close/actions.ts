"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageFiscalPeriods, canReconcile } from "@/lib/fms-roles";
import { isMonthString } from "@/lib/products/cashflow-ai/month-close/core";
import { clearStep, lockMonth, recordOverride, recordStep, removeOverride } from "@/lib/products/cashflow-ai/month-close/store";

type Result = { ok: true } | { ok: false; error: string };

// Server actions are public endpoints: every one re-checks who is asking, whatever the page showed.
async function who(level: "record" | "lock") {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  const allowed = level === "lock" ? canManageFiscalPeriods(user) : canReconcile(user) || canManageFiscalPeriods(user);
  if (!allowed) throw new Error("Forbidden");
  return { id: user.id, email: user.email };
}

function refresh() {
  revalidatePath("/cashflow-ai/month-close");
  revalidatePath("/cashflow-ai/settings/fiscal-periods");
}

const bad = (error: string): Result => ({ ok: false, error });

export async function recordStepAction(month: unknown, stepKey: unknown, note: unknown): Promise<Result> {
  const actor = await who("record");
  if (!isMonthString(month) || typeof stepKey !== "string") return bad("Choose a valid month and step.");
  const r = await recordStep(month, stepKey, note, actor);
  if (r.ok) refresh();
  return r;
}

export async function clearStepAction(month: unknown, stepKey: unknown): Promise<Result> {
  const actor = await who("record");
  if (!isMonthString(month) || typeof stepKey !== "string") return bad("Choose a valid month and step.");
  const r = await clearStep(month, stepKey, actor);
  if (r.ok) refresh();
  return r;
}

export async function recordOverrideAction(month: unknown, reason: unknown): Promise<Result> {
  const actor = await who("lock");
  if (!isMonthString(month)) return bad("Choose a valid month.");
  const r = await recordOverride(month, reason, actor);
  if (r.ok) refresh();
  return r;
}

export async function removeOverrideAction(month: unknown): Promise<Result> {
  const actor = await who("lock");
  if (!isMonthString(month)) return bad("Choose a valid month.");
  const r = await removeOverride(month, actor);
  if (r.ok) refresh();
  return r;
}

export async function lockMonthAction(month: unknown): Promise<Result> {
  const actor = await who("lock");
  if (!isMonthString(month)) return bad("Choose a valid month.");
  const r = await lockMonth(month, actor);
  if (r.ok) refresh();
  return r.ok ? { ok: true } : r;
}
