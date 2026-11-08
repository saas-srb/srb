import { hrmsEvents } from "@/lib/notify/triggers/hrms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, notDeleted } from "@/lib/products/talentos/db";
import { monthBounds } from "@/lib/products/talentos/time";
import { EMPLOYEES_COLLECTION, employeeFullName, descendantEmployeeIds, type Employee } from "@/lib/products/talentos/employees";
import { ACTIVE_EMPLOYEE_STATUSES } from "@/lib/products/talentos/employee-status";
import { getPayrollConfig } from "@/lib/products/talentos/payroll-config";
import { markApplied as markAdjustmentsApplied, releaseRun as releaseAdjustments } from "@/lib/products/talentos/payroll-adjustments";
import { applyRecoveries, outstandingFor, reverseRecoveries } from "@/lib/products/talentos/payroll-loans";
import { markSettlementApplied, releaseSettlements, settlementsForMonth, type Settlement } from "@/lib/products/talentos/payroll-settlements";
import { buildPayslipInput, loadProfiles, loadRunContext, loadSubject, type PayrollSubject, type RunContext } from "@/lib/products/talentos/payroll/context";
import { computePayslip, type ComputedPayslip, type PayslipWarning } from "@/lib/products/talentos/payroll/compute";
import { buildSettlement } from "@/lib/products/talentos/payroll/settlement";
import { incomeTaxFor, type StatutoryRates } from "@/lib/products/talentos/payroll/rates";

export const PAYROLL_RUNS_COLLECTION = "hrms_payroll_runs";
export const PAYSLIPS_COLLECTION = "hrms_payslips";

export type PayrollRunStatus = "draft" | "approved" | "paid";

/** Something the person running payroll should know about the whole run, before approving it. */
export interface RunCheck {
  level: "info" | "review" | "blocking";
  code: string;
  message: string;
}

export interface PayrollRun {
  _id: string;
  month: string; // "yyyy-mm"
  status: PayrollRunStatus;
  payslipCount: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  totalEmployerCost: number;
  /** Totals by head, for the statutory returns. */
  totals?: { employeePf: number; employerPf: number; esiEmployee: number; esiEmployer: number; professionalTax: number; tds: number; lwf: number };
  checks?: RunCheck[];
  generatedBy: string;
  generatedAt: Date;
  approvedBy: string | null;
  approvedAt: Date | null;
  /** The warnings of "review" level the approver acknowledged. */
  acknowledgedWarnings?: number;
  paidBy: string | null;
  paidAt: Date | null;
}

export interface PayComponentLine {
  name: string;
  amount: number;
  code?: string;
  /** Earnings at full pay for the month, when the line was cut for loss of pay. */
  fixedAmount?: number;
  taxable?: boolean;
  group?: "statutory" | "tax" | "loan" | "other";
  due?: number;
}

export interface Payslip {
  _id: string;
  runId: string;
  month: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  workingDays: number;
  lopDays: number;
  lopAmount: number;
  earnings: PayComponentLine[];
  grossPay: number;
  deductions: PayComponentLine[];
  totalDeductions: number;
  employerContributions: PayComponentLine[];
  employerCost: number;
  netPay: number;
  overrides: { arrears: number; manualTds: number | null; otherDeductions: number };
  /** Snapshot of the employee's primary bank account at generation. */
  bankAccountId: string | null;
  bankAccountLast4: string | null;
  bankName: string | null;
  ifsc: string | null;
  updatedAt: Date;

  // Version 2 (the statutory engine): how the figures were reached.
  schemaVersion?: 2;
  fixedGross?: number;
  monthDays?: number;
  paidDays?: number;
  basisDays?: number;
  payFactor?: number;
  daysNotes?: string[];
  statutory?: ComputedPayslip["statutory"];
  tax?: ComputedPayslip["tax"];
  bases?: ComputedPayslip["bases"];
  warnings?: PayslipWarning[];
  carriedForward?: number;
  loanInstalments?: { loanId: string; amount: number }[];
  adjustmentIds?: string[];
  /** Salary held back: no payout is made until it is released. */
  held?: boolean;
  holdReason?: string | null;
  settlementId?: string | null;
  /** The state used for professional tax and holidays. */
  workState?: string | null;
  ratesUsed?: { fy: string; taxConfirmed: boolean; statutoryConfirmed: boolean; ptConfirmed: boolean | null };
}

export interface SerializedPayrollRun extends Omit<PayrollRun, "generatedAt" | "approvedAt" | "paidAt"> {
  generatedAt: string;
  approvedAt: string | null;
  paidAt: string | null;
}
export interface SerializedPayslip extends Omit<Payslip, "updatedAt"> {
  updatedAt: string;
}

let indexesEnsured = false;
async function collections() {
  const db = await getDb();
  const runs = db.collection<PayrollRun>(PAYROLL_RUNS_COLLECTION);
  const payslips = db.collection<Payslip>(PAYSLIPS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      runs.createIndex({ month: 1 }, { unique: true }).catch(() => {}),
      payslips.createIndex({ runId: 1 }).catch(() => {}),
      payslips.createIndex({ employeeId: 1, month: 1 }).catch(() => {}),
    ]);
  }
  return { db, runs, payslips };
}

export function serializeRun(r: PayrollRun): SerializedPayrollRun {
  return { ...r, generatedAt: r.generatedAt.toISOString(), approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null, paidAt: r.paidAt ? r.paidAt.toISOString() : null };
}
export function serializePayslip(p: Payslip): SerializedPayslip {
  return { ...p, updatedAt: p.updatedAt.toISOString() };
}

// ---------------------------------------------------------------------------
// Period locking — a "paid" run freezes that month's attendance & leave.
// ---------------------------------------------------------------------------

export async function isMonthLocked(month: string): Promise<boolean> {
  const { runs } = await collections();
  const run = await runs.findOne({ month, status: "paid" });
  return run !== null;
}

// ---------------------------------------------------------------------------
// Who is on a month's payroll, and the figures
// ---------------------------------------------------------------------------

/** Active employees, plus anyone whose last working day falls in the month (they get their final pay); never someone who joined later or left earlier. */
async function payrollEmployees(month: string, restrictToManagerId?: string): Promise<Employee[]> {
  const { db } = await collections();
  const { from, to } = monthBounds(month);
  const filter: Record<string, unknown> = {
    ...notDeleted,
    $or: [{ status: { $in: ACTIVE_EMPLOYEE_STATUSES } }, { "professional.relievingDate": { $gte: from, $lte: to } }],
  };
  if (restrictToManagerId) filter._id = { $in: await descendantEmployeeIds(restrictToManagerId) };
  const all = await db.collection<Employee>(EMPLOYEES_COLLECTION).find(filter).sort({ firstName: 1 }).toArray();
  return all.filter((e) => {
    if (e.professional?.relievingDate && e.professional.relievingDate < from) return false;
    if (e.professional?.joiningDate && e.professional.joiningDate > to) return false;
    return true;
  });
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function rollupTotals(slips: Payslip[]) {
  const line = (s: Payslip, list: "deductions" | "employerContributions", codes: string[], names: string[]) =>
    sum((s[list] ?? []).filter((l) => (l.code && codes.includes(l.code)) || (!l.code && names.includes(l.name))).map((l) => l.amount));
  return {
    payslipCount: slips.length,
    totalGross: sum(slips.map((p) => p.grossPay)),
    totalDeductions: sum(slips.map((p) => p.totalDeductions)),
    totalNet: sum(slips.map((p) => p.netPay)),
    totalEmployerCost: sum(slips.map((p) => p.employerCost)),
    totals: {
      employeePf: sum(slips.map((s) => line(s, "deductions", ["PF"], ["Provident Fund"]))),
      employerPf: sum(slips.map((s) => line(s, "employerContributions", ["ER_EPF", "ER_EPS"], ["Employer PF", "Employer EPS"]))),
      esiEmployee: sum(slips.map((s) => line(s, "deductions", ["ESI"], ["ESI"]))),
      esiEmployer: sum(slips.map((s) => line(s, "employerContributions", ["ER_ESI"], ["Employer ESI"]))),
      professionalTax: sum(slips.map((s) => line(s, "deductions", ["PT"], ["Professional Tax"]))),
      tds: sum(slips.map((s) => line(s, "deductions", ["TDS"], ["TDS"]))),
      lwf: sum(slips.map((s) => line(s, "deductions", ["LWF"], []))),
    },
  };
}

/** The final-settlement items to add to a leaving employee's payslip. */
async function settlementInputs(ctx: RunContext, s: PayrollSubject, settlement: Settlement) {
  const basicDa = s.structure.basic + (s.structure.da ?? 0);
  const built = buildSettlement({
    reason: settlement.reason,
    joinDate: s.employee.professional.joiningDate ?? settlement.exitDate,
    exitDate: settlement.exitDate,
    lastBasicPlusDa: basicDa,
    fixedMonthlyGross: s.structure.basic + (s.structure.da ?? 0) + s.structure.hra + s.structure.allowances.reduce((n, a) => n + a.amount, 0),
    leaveDaysToEncash: settlement.leaveDaysToEncash,
    leaveDaysInMonth: ctx.config.leaveEncashmentDaysInMonth,
    averageMonthlySalary: basicDa,
    noticeShortfallDays: settlement.noticeShortfallDays,
    loansOutstanding: await outstandingFor(s.employee._id),
    otherEarnings: settlement.otherEarnings,
    otherRecoveries: settlement.otherRecoveries,
    gratuityCoveredByAct: ctx.config.gratuityCovered,
    fixedTerm: settlement.fixedTerm,
    payGratuity: settlement.payGratuity,
    rates: ctx.rates.statutory as StatutoryRates,
  });
  return built;
}

interface Preserved {
  overrides: { arrears: number; manualTds: number | null; otherDeductions: number };
  held: boolean;
  holdReason: string | null;
}
const NO_OVERRIDES: Preserved = { overrides: { arrears: 0, manualTds: null, otherDeductions: 0 }, held: false, holdReason: null };

/** One employee's payslip, computed from the run context. */
async function computeFor(ctx: RunContext, s: PayrollSubject, keep: Preserved, settlements: Map<string, Settlement>): Promise<Payslip> {
  const settlement = settlements.get(s.employee._id) ?? null;
  const built = settlement ? await settlementInputs(ctx, s, settlement) : null;
  const input = buildPayslipInput(ctx, s, {
    overrides: keep.overrides,
    extraAdjustments: built?.adjustments,
    // A leaving employee's loans are recovered in full by the settlement, not by the normal instalment.
    loans: built ? [] : undefined,
    settlement: !!built,
  });
  const c = computePayslip(input);

  const earnedComponents = c.earnings.filter((e) => !e.code.startsWith("ADJ:") && e.code !== "ARREARS" && e.code !== "OT" && e.code !== "BONUS");
  const lopAmount = Math.max(0, sum(earnedComponents.map((e) => e.fixedAmount - e.amount)));
  // Instalments, and the balances a final settlement recovers in full.
  const loanInstalments = c.deductions.filter((d) => d.code.startsWith("LOAN:") || d.code.startsWith("ADJ:fnf-loan-")).map((d) => ({ loanId: d.code.startsWith("LOAN:") ? d.code.slice(5) : d.code.slice("ADJ:fnf-loan-".length), amount: d.amount }));
  const adjustmentIds = input.adjustments.filter((a) => !a.id.startsWith("fnf-")).map((a) => a.id);
  const rates = input.rates;
  return {
    _id: newId(),
    runId: "",
    month: ctx.month,
    employeeId: s.employee._id,
    employeeCode: s.employee.employeeCode,
    employeeName: employeeFullName(s.employee),
    workingDays: input.days.workingDays,
    lopDays: c.daysSummary.lopDays,
    lopAmount,
    earnings: c.earnings.map((e) => ({ code: e.code, name: e.name, amount: e.amount, fixedAmount: e.fixedAmount, taxable: e.taxable })),
    grossPay: c.grossEarned,
    deductions: c.deductions.map((d) => ({ code: d.code, name: d.name, amount: d.amount, group: d.group, due: d.due })),
    totalDeductions: c.totalDeductions,
    employerContributions: c.employerContributions.map((e) => ({ code: e.code, name: e.name, amount: e.amount })),
    employerCost: c.employerCost,
    netPay: c.netPay,
    overrides: keep.overrides,
    bankAccountId: s.bank?._id ?? null,
    bankAccountLast4: s.bank?.accountNumberLast4 ?? null,
    bankName: s.bank?.bankName ?? null,
    ifsc: s.bank?.ifsc ?? null,
    updatedAt: new Date(),
    schemaVersion: 2,
    fixedGross: c.fixedGross,
    monthDays: c.daysSummary.monthDays,
    paidDays: c.daysSummary.paidDays,
    basisDays: c.daysSummary.basisDays,
    payFactor: c.daysSummary.payFactor,
    daysNotes: c.daysSummary.notes,
    statutory: c.statutory,
    tax: c.tax,
    bases: c.bases,
    warnings: ctx.pendingLeaveEmployees.has(s.employee._id) ? [...c.warnings, { level: "review", code: "pending_leave", message: "This employee has leave requests in this month that nobody has decided yet." }] : c.warnings,
    carriedForward: c.carriedForward,
    loanInstalments,
    adjustmentIds,
    held: keep.held,
    holdReason: keep.holdReason,
    settlementId: settlement?._id ?? null,
    workState: input.employee.state,
    ratesUsed: { fy: rates.incomeTax.fy, taxConfirmed: rates.incomeTax.confirmed, statutoryConfirmed: rates.statutory.providentFund.confirmed && rates.statutory.esi.confirmed, ptConfirmed: rates.pt ? rates.pt.confirmed : null },
  };
}

// ---------------------------------------------------------------------------
// Checks on the whole run
// ---------------------------------------------------------------------------

export async function runChecks(ctx: RunContext, slips: Payslip[], skipped: { name: string; reason: string }[]): Promise<RunCheck[]> {
  const out: RunCheck[] = [];
  const { runs } = await collections();
  const add = (level: RunCheck["level"], code: string, message: string) => out.push({ level, code, message });

  const tax = incomeTaxFor(ctx.fy, ctx.rates.incomeTax);
  if (!tax.confirmed) add("review", "tax_unconfirmed", `The income-tax slabs for FY ${tax.fy} have not been confirmed by a platform administrator yet. Tax is worked out on ${tax.source}`);
  const s = ctx.rates.statutory;
  if (!s.providentFund.confirmed || !s.esi.confirmed) add("review", "statutory_unconfirmed", "The provident fund / ESI rates have not been confirmed by a platform administrator yet.");
  const unconfirmedPt = new Set(slips.filter((p) => p.ratesUsed?.ptConfirmed === false).map((p) => p.statutory?.pt.note.split(":")[0] ?? ""));
  if (unconfirmedPt.size > 0) add("info", "pt_unconfirmed", `Professional-tax slabs not yet confirmed by a platform administrator: ${[...unconfirmedPt].filter(Boolean).join(", ")}.`);

  if (skipped.length > 0) add("review", "no_structure", `${skipped.length} employee(s) have no salary structure and are not on this run: ${skipped.slice(0, 8).map((x) => x.name).join(", ")}${skipped.length > 8 ? " …" : ""}.`);

  // The month before should be closed first: this month's tax and ESI read its payslips.
  const previous = await runs.find({ month: { $lt: ctx.month } }).sort({ month: -1 }).limit(1).toArray();
  if (previous[0] && previous[0].status === "draft") add("review", "previous_draft", `The ${previous[0].month} run is still a draft. Approve it first: income tax and ESI for this month read its figures.`);

  const blockingCount = slips.filter((p) => (p.warnings ?? []).some((w) => w.level === "blocking")).length;
  if (blockingCount > 0) add("blocking", "blocking_payslips", `${blockingCount} payslip(s) have a problem that must be fixed before approval.`);
  const noBank = slips.filter((p) => !p.bankAccountId).length;
  if (noBank > 0) add("review", "no_bank", `${noBank} payslip(s) have no bank account, so their salary cannot be paid by transfer.`);
  const heldCount = slips.filter((p) => p.held).length;
  if (heldCount > 0) add("info", "held", `${heldCount} payslip(s) are on hold: no payout is made for them until the hold is released.`);
  const unmarked = slips.filter((p) => (p.daysNotes ?? []).some((n) => n.includes("no attendance recorded"))).length;
  if (unmarked > 0) add("review", "unmarked", `${unmarked} employee(s) have working days with no attendance recorded, treated as loss of pay. Fix attendance and recompute if that is wrong.`);

  if (ctx.pendingRequests.overtime > 0) add("review", "pending_overtime", `${ctx.pendingRequests.overtime} overtime request(s) for this month are waiting for a decision. Decide them (Requests) and recompute, or they are not paid in this run.`);
  if (ctx.pendingRequests.expenses > 0) add("review", "pending_expenses", `${ctx.pendingRequests.expenses} expense claim(s) are waiting for a decision. Approved ones are paid in the month chosen when they are approved.`);

  const company = await (await import("@/lib/products/talentos/company")).getCompanyDetails();
  if (ctx.config.pfRegistered && !company.pfEstablishmentCode) add("info", "no_pf_code", "The company's PF establishment code is not set (Settings → Company). The PF return needs it.");
  if (ctx.config.esiRegistered && !company.esiEstablishmentCode) add("info", "no_esi_code", "The company's ESI code is not set (Settings → Company). The ESI return needs it.");
  if (ctx.config.tdsEnabled && !company.tan) add("review", "no_tan", "The company's TAN is not set (Settings → Company). Form 16 and the TDS return need it.");
  if (!ctx.defaultState) add("review", "no_state", "No state is set for the office (Settings → Work Schedule), so employees without their own work state get no professional tax and no state holidays.");
  return out;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function getRunByMonth(month: string): Promise<PayrollRun | null> {
  const { runs } = await collections();
  return runs.findOne({ month });
}
export async function getRun(id: string): Promise<PayrollRun | null> {
  const { runs } = await collections();
  return runs.findOne({ _id: id });
}
export async function listRuns(): Promise<PayrollRun[]> {
  const { runs } = await collections();
  return runs.find({}).sort({ month: -1 }).toArray();
}
export async function getPayslipsForRun(runId: string): Promise<Payslip[]> {
  const { payslips } = await collections();
  return payslips.find({ runId }).sort({ employeeName: 1 }).toArray();
}
export async function getPayslip(id: string): Promise<Payslip | null> {
  const { payslips } = await collections();
  return payslips.findOne({ _id: id });
}

/** Payslips visible to the employee — from approved or paid runs only. */
export async function payslipsForEmployee(employeeId: string): Promise<{ payslip: Payslip; run: PayrollRun }[]> {
  const { payslips, runs } = await collections();
  const visibleRuns = await runs.find({ status: { $in: ["approved", "paid"] } }).toArray();
  const runById = new Map(visibleRuns.map((r) => [r._id, r]));
  const slips = await payslips.find({ employeeId, runId: { $in: visibleRuns.map((r) => r._id) } }).sort({ month: -1 }).toArray();
  return slips.map((s) => ({ payslip: s, run: runById.get(s.runId)! }));
}

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

async function buildSlips(month: string, employees: Employee[], keep: Map<string, Preserved>, excludeRunId?: string) {
  const profiles = await loadProfiles(employees.map((e) => e._id));
  const ctx = await loadRunContext(month, employees, profiles, { excludeRunId });
  const settlements = await settlementsForMonth(month);
  const slips: Payslip[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (const emp of employees) {
    const profile = profiles.get(emp._id);
    const subject = profile ? await loadSubject(emp, profile, month) : null;
    if (!subject) {
      skipped.push({ name: employeeFullName(emp), reason: "no salary structure" });
      continue;
    }
    slips.push(await computeFor(ctx, subject, keep.get(emp._id) ?? NO_OVERRIDES, settlements));
  }
  return { ctx, slips, skipped, settlements };
}

export async function createRun(
  month: string,
  actorId: string,
  opts: { restrictToManagerId?: string } = {},
): Promise<{ ok: true; run: PayrollRun } | { ok: false; error: string }> {
  const { runs, payslips } = await collections();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Pick a valid month." };
  const existing = await runs.findOne({ month });
  if (existing) return { ok: false, error: `A payroll run for ${month} already exists.` };

  const employees = await payrollEmployees(month, opts.restrictToManagerId);
  const { ctx, slips, skipped } = await buildSlips(month, employees, new Map());
  if (slips.length === 0) return { ok: false, error: "No employees have a salary structure for this month." };

  const runId = newId();
  for (const s of slips) s.runId = runId;
  const run: PayrollRun = {
    _id: runId,
    month,
    status: "draft",
    ...rollupTotals(slips),
    checks: await runChecks(ctx, slips, skipped),
    generatedBy: actorId,
    generatedAt: new Date(),
    approvedBy: null,
    approvedAt: null,
    paidBy: null,
    paidAt: null,
  };
  await runs.insertOne(run);
  await payslips.insertMany(slips);
  await hrmsEvents.payrollReady({ id: run._id, month, employees: slips.length });
  return { ok: true, run };
}

async function refreshRun(runId: string): Promise<void> {
  const { runs, payslips } = await collections();
  const slips = await payslips.find({ runId }).toArray();
  await runs.updateOne({ _id: runId }, { $set: rollupTotals(slips) });
}

/**
 * Works the whole draft run out again from the current attendance, leave, adjustments, loans and declarations, keeping the hand-entered
 * overrides and holds. Employees who have become eligible since are added; payslips are replaced in place.
 */
export async function recomputeRun(runId: string): Promise<{ ok: boolean; error?: string }> {
  const { runs, payslips } = await collections();
  const run = await runs.findOne({ _id: runId });
  if (!run) return { ok: false, error: "Run not found." };
  if (run.status !== "draft") return { ok: false, error: "Only draft runs can be recomputed." };
  const old = await payslips.find({ runId }).toArray();
  const keep = new Map<string, Preserved>(old.map((p) => [p.employeeId, { overrides: p.overrides, held: !!p.held, holdReason: p.holdReason ?? null }]));
  const employees = await payrollEmployees(run.month);
  const { ctx, slips, skipped } = await buildSlips(run.month, employees, keep, runId);
  if (slips.length === 0) return { ok: false, error: "No employees have a salary structure for this month." };
  for (const s of slips) s.runId = runId;
  await payslips.deleteMany({ runId });
  await payslips.insertMany(slips);
  await runs.updateOne({ _id: runId }, { $set: { ...rollupTotals(slips), checks: await runChecks(ctx, slips, skipped) } });
  return { ok: true };
}

/** Recomputes one payslip of a draft run (after fixing attendance, an override, a declaration …). */
export async function recomputePayslip(payslipId: string): Promise<{ ok: boolean; error?: string }> {
  const { db, runs, payslips } = await collections();
  const slip = await payslips.findOne({ _id: payslipId });
  if (!slip) return { ok: false, error: "Payslip not found." };
  const run = await runs.findOne({ _id: slip.runId });
  if (!run || run.status !== "draft") return { ok: false, error: "Only draft runs can be recomputed." };
  const emp = await db.collection<Employee>(EMPLOYEES_COLLECTION).findOne({ _id: slip.employeeId });
  if (!emp) return { ok: false, error: "Employee not found." };
  const { slips, skipped } = await buildSlips(slip.month, [emp], new Map([[emp._id, { overrides: slip.overrides, held: !!slip.held, holdReason: slip.holdReason ?? null }]]), run._id);
  if (slips.length === 0) return { ok: false, error: skipped[0] ? "No salary structure for this employee." : "Could not compute." };
  const fresh = slips[0];
  await payslips.updateOne({ _id: payslipId }, { $set: { ...fresh, _id: payslipId, runId: slip.runId } });
  await refreshRun(slip.runId);
  return { ok: true };
}

export async function updatePayslipOverrides(
  payslipId: string,
  overrides: { arrears: number; manualTds: number | null; otherDeductions: number },
): Promise<{ ok: boolean; error?: string }> {
  const { payslips, runs } = await collections();
  const slip = await payslips.findOne({ _id: payslipId });
  if (!slip) return { ok: false, error: "Payslip not found." };
  const run = await runs.findOne({ _id: slip.runId });
  if (!run || run.status !== "draft") return { ok: false, error: "Only draft runs can be edited." };
  await payslips.updateOne({ _id: payslipId }, { $set: { overrides } });
  return recomputePayslip(payslipId);
}

/** Holds back (or releases) one employee's salary. A held payslip is paid by no payout until released. */
export async function setPayslipHold(payslipId: string, held: boolean, reason: string | null): Promise<{ ok: boolean; error?: string }> {
  const { payslips, runs } = await collections();
  const slip = await payslips.findOne({ _id: payslipId });
  if (!slip) return { ok: false, error: "Payslip not found." };
  const run = await runs.findOne({ _id: slip.runId });
  if (!run) return { ok: false, error: "Run not found." };
  if (run.status === "paid") return { ok: false, error: "A paid run cannot be changed." };
  await payslips.updateOne({ _id: payslipId }, { $set: { held, holdReason: held ? (reason ?? "").slice(0, 200) || null : null, updatedAt: new Date() } });
  if (run.status === "approved") {
    // Releasing after approval creates the payout that was left out.
    const { createPayoutsForRun } = await import("@/lib/products/talentos/salary-payouts");
    const fresh = await payslips.findOne({ _id: payslipId });
    if (fresh && !held) await createPayoutsForRun(run, [fresh], run.approvedBy ?? "system");
  }
  return { ok: true };
}

export async function approveRun(runId: string, actorId: string, opts: { acknowledgeWarnings?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  const { runs, payslips } = await collections();
  const run = await runs.findOne({ _id: runId });
  if (!run) return { ok: false, error: "Run not found." };
  if (run.status !== "draft") return { ok: false, error: `Run is already ${run.status}.` };

  const config = await getPayrollConfig();
  if (config.requireSeparateApprover && run.generatedBy === actorId) return { ok: false, error: "Your company's policy needs someone other than the person who created this run to approve it." };

  const slips = await payslips.find({ runId }).toArray();
  const blocking = slips.filter((s) => (s.warnings ?? []).some((w) => w.level === "blocking"));
  if (blocking.length > 0) return { ok: false, error: `Fix these payslips first: ${blocking.slice(0, 5).map((s) => s.employeeName).join(", ")}${blocking.length > 5 ? " …" : ""}.` };
  if ((run.checks ?? []).some((c) => c.level === "blocking")) return { ok: false, error: "The run has a problem that must be fixed before approval." };
  const reviewCount = slips.reduce((n, s) => n + (s.warnings ?? []).filter((w) => w.level === "review").length, 0) + (run.checks ?? []).filter((c) => c.level === "review").length;
  if (reviewCount > 0 && !opts.acknowledgeWarnings) return { ok: false, error: `The run has ${reviewCount} point(s) to review. Look at them, then approve again to confirm you have seen them.` };

  await runs.updateOne({ _id: runId }, { $set: { status: "approved", approvedBy: actorId, approvedAt: new Date(), acknowledgedWarnings: reviewCount } });
  const approvedRun = { ...run, status: "approved" as const };

  // Book what this run used: one-off items, loan instalments, settlements.
  await markAdjustmentsApplied(slips.flatMap((s) => s.adjustmentIds ?? []), runId);
  await applyRecoveries(runId, run.month, slips.flatMap((s) => s.loanInstalments ?? []));
  await markSettlementApplied(slips.map((s) => s.settlementId).filter((x): x is string => !!x), runId);
  // One salary payout per payslip that is not on hold (status: pending).
  const { createPayoutsForRun } = await import("@/lib/products/talentos/salary-payouts");
  await createPayoutsForRun(approvedRun, slips.filter((s) => !s.held), actorId);

  const { notifyEmployee } = await import("@/lib/products/talentos/notifications");
  for (const s of slips) {
    await notifyEmployee(s.employeeId, {
      type: "payslip_published",
      title: `Your ${run.month} payslip is ready`,
      body: s.held ? "Your salary for this month is on hold. HR will contact you." : `Net pay ${Math.round(s.netPay).toLocaleString("en-IN")}`,
      link: `/talentos/me/salary/${run.month}`,
      entityType: "payslip",
      entityId: s._id,
    });
  }
  return { ok: true };
}

export async function deleteRun(runId: string): Promise<{ ok: boolean; error?: string }> {
  const { db, runs, payslips } = await collections();
  const run = await runs.findOne({ _id: runId });
  if (!run) return { ok: false, error: "Run not found." };
  if (run.status === "paid") return { ok: false, error: "A paid run cannot be deleted." };

  const inFlight = await db.collection("hrms_salary_payouts").countDocuments({ runId, status: { $in: ["initiated", "processing", "paid"] } });
  if (inFlight > 0) return { ok: false, error: "This run has payouts that are initiated or paid. Delete is blocked." };

  await db.collection("hrms_salary_payouts").deleteMany({ runId });
  // Give back what the run had used, so nothing is lost or paid twice.
  await releaseAdjustments(runId);
  await reverseRecoveries(runId);
  await releaseSettlements(runId);
  await payslips.deleteMany({ runId });
  await runs.deleteOne({ _id: runId });
  return { ok: true };
}
