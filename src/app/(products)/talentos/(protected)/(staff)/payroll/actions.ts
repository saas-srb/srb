"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canRunPayroll } from "@/lib/hrms-roles";
import {
  createRun,
  deleteRun,
  approveRun,
  getRun,
  getPayslip,
  recomputePayslip,
  recomputeRun,
  setPayslipHold,
  updatePayslipOverrides,
} from "@/lib/products/talentos/payroll-run";
import {
  initiatePayout,
  bulkInitiate,
  refreshSalaryPayout,
  retryPayout,
  cancelPayout,
  reconcilePayouts,
} from "@/lib/products/talentos/salary-payouts";
import { validatePayslipOverrides } from "@/lib/products/talentos/validation-payroll";
import { paymentGate } from "@/lib/products/cashflow-ai/payment-guard";
import { recordAudit } from "@/lib/products/talentos/audit";

export interface PayrollActionResult {
  ok: boolean;
  id?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requirePayroll() {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canRunPayroll(user)) throw new Error("Forbidden");
  return user;
}

function revalidate(month?: string) {
  revalidatePath("/talentos/payroll");
  revalidatePath("/talentos/payroll/payouts");
  if (month) revalidatePath(`/talentos/payroll/${month}`);
  revalidatePath("/talentos");
}

export async function createRunAction(month: string): Promise<PayrollActionResult> {
  const user = await requirePayroll();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "Pick a valid month." };

  const result = await createRun(month, user.id);
  if (!result.ok) return { ok: false, error: result.error };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "generate",
    entity: "payroll_run",
    entityId: result.run._id,
    entityLabel: month,
    summary: `${result.run.payslipCount} payslip(s), net ${result.run.totalNet}`,
  });
  revalidate(month);
  return { ok: true, id: result.run._id };
}

export async function deleteRunAction(runId: string): Promise<PayrollActionResult> {
  const user = await requirePayroll();
  const run = await getRun(runId);
  const result = await deleteRun(runId);
  if (!result.ok) return { ok: false, error: result.error };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "payroll_run", entityId: runId, entityLabel: run?.month });
  revalidate(run?.month);
  return { ok: true };
}

export async function approveRunAction(runId: string, acknowledgeWarnings = false): Promise<PayrollActionResult> {
  const user = await requirePayroll();
  const run = await getRun(runId);
  const result = await approveRun(runId, user.id, { acknowledgeWarnings: acknowledgeWarnings === true });
  if (!result.ok) return { ok: false, error: result.error };
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "approve",
    entity: "payroll_run",
    entityId: runId,
    entityLabel: run?.month,
    summary: acknowledgeWarnings ? "Run approved — salary payouts created (warnings acknowledged)" : "Run approved — salary payouts created",
  });
  revalidate(run?.month);
  return { ok: true };
}

export async function recomputeRunAction(runId: string): Promise<PayrollActionResult> {
  const user = await requirePayroll();
  const run = await getRun(runId);
  const result = await recomputeRun(runId);
  if (!result.ok) return { ok: false, error: result.error };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "payroll_run", entityId: runId, entityLabel: run?.month, summary: "Run recomputed from current attendance, leave, adjustments and declarations" });
  revalidate(run?.month);
  return { ok: true };
}

export async function setPayslipHoldAction(payslipId: string, held: boolean, reason: string): Promise<PayrollActionResult> {
  const user = await requirePayroll();
  const slip = await getPayslip(payslipId);
  if (!slip) return { ok: false, error: "Payslip not found." };
  const result = await setPayslipHold(payslipId, held === true, String(reason ?? ""));
  if (!result.ok) return { ok: false, error: result.error };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "payslip", entityId: payslipId, entityLabel: `${slip.employeeName} · ${slip.month}`, summary: held ? `Salary put on hold${reason ? `: ${reason}` : ""}` : "Salary hold released" });
  revalidatePayouts(slip.month);
  return { ok: true };
}

// ---- Payouts --------------------------------------------------------------

function revalidatePayouts(month?: string) {
  revalidate(month);
  revalidatePath("/talentos/attendance");
  revalidatePath("/talentos/leave");
}

export async function initiatePayoutAction(payoutId: string, code?: string): Promise<PayrollActionResult> {
  const user = await requirePayroll();
  const blocked = await paymentGate(user.id, code);
  if (blocked) return { ok: false, error: blocked };
  const result = await initiatePayout(payoutId, user);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePayouts();
  return { ok: true };
}

export async function bulkInitiatePayoutsAction(ids: string[], code?: string): Promise<PayrollActionResult & { initiated?: number }> {
  const user = await requirePayroll();
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 1000) return { ok: false, error: "Choose the salaries to pay." };
  const blocked = await paymentGate(user.id, code);
  if (blocked) return { ok: false, error: blocked };
  const result = await bulkInitiate(ids, user);
  revalidatePayouts();
  return { ok: true, initiated: result.initiated, error: result.errors[0] };
}

/** Asks RazorpayX where a payout stands, for when its webhook did not arrive. */
export async function refreshPayoutAction(payoutId: string): Promise<PayrollActionResult> {
  await requirePayroll();
  const result = await refreshSalaryPayout(payoutId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePayouts();
  return { ok: true };
}

export async function retryPayoutAction(payoutId: string, code?: string): Promise<PayrollActionResult> {
  const user = await requirePayroll();
  const blocked = await paymentGate(user.id, code);
  if (blocked) return { ok: false, error: blocked };
  const result = await retryPayout(payoutId, user);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePayouts();
  return { ok: true };
}

export async function cancelPayoutAction(payoutId: string): Promise<PayrollActionResult> {
  const user = await requirePayroll();
  const result = await cancelPayout(payoutId, user);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePayouts();
  return { ok: true };
}

export async function reconcilePayoutsAction(ids: string[]): Promise<PayrollActionResult & { reconciled?: number }> {
  const user = await requirePayroll();
  const n = await reconcilePayouts(ids, user);
  revalidate();
  return { ok: true, reconciled: n };
}

export async function recomputePayslipAction(payslipId: string): Promise<PayrollActionResult> {
  await requirePayroll();
  const slip = await getPayslip(payslipId);
  const result = await recomputePayslip(payslipId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidate(slip?.month);
  return { ok: true };
}

export async function savePayslipOverridesAction(payslipId: string, input: Record<string, unknown>): Promise<PayrollActionResult> {
  const user = await requirePayroll();
  const slip = await getPayslip(payslipId);
  if (!slip) return { ok: false, error: "Payslip not found." };

  const v = validatePayslipOverrides(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  const result = await updatePayslipOverrides(payslipId, v.data);
  if (!result.ok) return { ok: false, error: result.error };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    entity: "payslip",
    entityId: payslipId,
    entityLabel: `${slip.employeeName} · ${slip.month}`,
    summary: `arrears ${v.data.arrears}, other ${v.data.otherDeductions}${v.data.manualTds != null ? `, TDS ${v.data.manualTds}` : ""}`,
  });
  revalidate(slip.month);
  return { ok: true };
}
