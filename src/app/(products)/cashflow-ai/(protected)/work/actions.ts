"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance, canManageTransactions, canViewCommercialFinance, canViewFinancialStatements } from "@/lib/fms-roles";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { saveComplianceProfile } from "@/lib/products/cashflow-ai/compliance/filings";
import { EMPTY_PROFILE, type ComplianceProfile } from "@/lib/products/cashflow-ai/compliance/filings-core";
import { taskById } from "@/lib/products/cashflow-ai/work/catalog";
import { appliesTo } from "@/lib/products/cashflow-ai/work/engine";
import { canonicalPeriod } from "@/lib/products/cashflow-ai/work/grouping";
import { autoTicks, loadAutoFacts } from "@/lib/products/cashflow-ai/work/auto";
import { getPlan, loadCompanyFacts, markDone, reopenWork, setStep, skipWork, startPlan } from "@/lib/products/cashflow-ai/work/store";

type Result = { ok: true } | { ok: false; error: string };

// Server actions are public endpoints: every one re-checks who is asking, whatever the page showed.
async function who() {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!(canViewFinancialStatements(user) || canViewCommercialFinance(user))) throw new Error("Forbidden");
  if (!(canManageCompliance(user) || canManageTransactions(user))) throw new Error("Forbidden");
  return { id: user.id, email: user.email };
}

const bad = (error: string): Result => ({ ok: false, error });

function refresh() {
  revalidatePath("/cashflow-ai/work", "layout");
  revalidatePath("/cashflow-ai");
}

/** The piece of work must be a real one, for a real period, that applies to this company, in a plan that has started. */
async function check(taskId: unknown, period: unknown): Promise<{ ok: true; taskId: string; period: string } | { ok: false; error: string }> {
  if (typeof taskId !== "string" || typeof period !== "string") return bad("That piece of work does not exist.") as { ok: false; error: string };
  const task = taskById(taskId);
  if (!task || !canonicalPeriod(task.frequency, period)) return bad("That piece of work does not exist.") as { ok: false; error: string };
  if (!(await getPlan())) return bad("Start your work plan first.") as { ok: false; error: string };
  if (!appliesTo(task, await loadCompanyFacts())) return bad("That work does not apply to your company.") as { ok: false; error: string };
  return { ok: true, taskId, period };
}

export async function startWorkPlanAction(answers: unknown): Promise<Result> {
  const actor = await who();
  const patch: Partial<ComplianceProfile> = {};
  if (answers && typeof answers === "object") {
    for (const k of Object.keys(EMPTY_PROFILE) as (keyof ComplianceProfile)[]) {
      const v = (answers as Record<string, unknown>)[k];
      if (typeof v === "boolean") patch[k] = v;
    }
  }
  if (Object.keys(patch).length > 0) await saveComplianceProfile(patch, actor.id, actor.email);
  const res = await startPlan(istToday(), actor);
  if (res.ok) refresh();
  return res;
}

export async function setStepAction(taskId: unknown, period: unknown, index: unknown, value: unknown): Promise<Result> {
  const actor = await who();
  const c = await check(taskId, period);
  if (!c.ok) return c;
  if (typeof index !== "number" || typeof value !== "boolean") return bad("No such step.");
  const res = await setStep(c.taskId, c.period, index, value, actor);
  if (res.ok) refresh();
  return res.ok ? { ok: true } : res;
}

export async function markDoneAction(taskId: unknown, period: unknown): Promise<Result> {
  const actor = await who();
  const c = await check(taskId, period);
  if (!c.ok) return c;
  const task = taskById(c.taskId)!;
  // what the books proved is worked out here, never taken from the browser
  const auto = await autoTicks(task.steps.map((s) => s.auto), await loadAutoFacts(istToday()), task.frequency === "monthly" ? c.period : null, canonicalPeriod(task.frequency, c.period)!.end < istToday());
  const res = await markDone(c.taskId, c.period, auto, actor);
  if (res.ok) refresh();
  return res;
}

export async function skipWorkAction(taskId: unknown, period: unknown, reason: unknown): Promise<Result> {
  const actor = await who();
  const c = await check(taskId, period);
  if (!c.ok) return c;
  const res = await skipWork(c.taskId, c.period, typeof reason === "string" ? reason : "", actor);
  if (res.ok) refresh();
  return res;
}

export async function reopenWorkAction(taskId: unknown, period: unknown): Promise<Result> {
  const actor = await who();
  if (typeof taskId !== "string" || typeof period !== "string") return bad("That piece of work does not exist.");
  const task = taskById(taskId);
  if (!task || !canonicalPeriod(task.frequency, period)) return bad("That piece of work does not exist.");
  const res = await reopenWork(taskId, period, actor);
  if (res.ok) refresh();
  return res;
}
