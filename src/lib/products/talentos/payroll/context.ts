import "server-only";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/talentos/db";
import { getOrgSettings, classifyDay, type OrgSettings } from "@/lib/products/talentos/settings";
import { addDays, eachDateString, monthBounds } from "@/lib/products/talentos/time";
import { holidaySetInRange } from "@/lib/products/talentos/holidays";
import { getCompanyDetails } from "@/lib/products/talentos/company";
import { ATTENDANCE_COLLECTION, type AttendanceRecord } from "@/lib/products/talentos/attendance";
import { LEAVE_REQUESTS_COLLECTION, LEAVE_TYPES_COLLECTION, type LeaveRequest } from "@/lib/products/talentos/leave";
import { approvedOvertime, approvedShortLeaveDates, pendingForPayroll } from "@/lib/products/talentos/work-requests";
import { getPayrollConfig, type PayrollConfig } from "@/lib/products/talentos/payroll-config";
import { PAYROLL_PROFILES_COLLECTION, DEFAULT_STATUTORY, type PayrollProfile } from "@/lib/products/talentos/payroll";
import { effectiveStructure, type SalaryStructure } from "@/lib/products/talentos/salary-revisions";
import { getPrimaryBankAccount, type BankAccount } from "@/lib/products/talentos/bank-accounts";
import { declarationsForEmployees, effectiveAmounts, NO_PREVIOUS_EMPLOYER, type TaxDeclaration } from "@/lib/products/talentos/tax-declarations";
import { pendingForMonth } from "@/lib/products/talentos/payroll-adjustments";
import { instalmentsDue } from "@/lib/products/talentos/payroll-loans";
import type { Employee } from "@/lib/products/talentos/employees";
import { DEFAULT_PAID_DAYS_POLICY, computePaidDays, type AttendanceMark, type PaidDaysDay, type PaidDaysPolicy, type PaidDaysResult } from "@/lib/products/talentos/payroll/paid-days";
import { DEFAULT_ENGINE_POLICY, ZERO_YTD, type EnginePolicy, type LoanInstalment, type PayrollAdjustment, type PayslipInput } from "@/lib/products/talentos/payroll/compute";
import { toPayrollStructure } from "@/lib/products/talentos/payroll/structure";
import { esiDecisionEarlier, yearToDate, type PayslipLike } from "@/lib/products/talentos/payroll/ytd";
import { financialYearOf, monthsOfFy, normaliseState, type IncomeTaxYear, type LwfRule, type PtRule } from "@/lib/products/talentos/payroll/rates";
import { loadRates, type RatesBundle } from "@/lib/products/talentos/payroll/rates-store";
import { NO_DEDUCTIONS } from "@/lib/products/talentos/payroll/tax";
import { incomeTaxFor, ptRuleFor } from "@/lib/products/talentos/payroll/rates";

/**
 * Everything the payroll engine needs about a month, gathered with a handful of queries for the whole run instead of a few per employee:
 * the company's policy, the calendar (weekly offs and the holidays of each work state), each person's attendance and approved leave, the
 * one-off items and loan instalments due, tax declarations, and the year-to-date totals from earlier payslips. `buildPayslipInput` then turns
 * that, for one employee, into the pure engine's input.
 */

const PAYSLIPS_COLLECTION = "hrms_payslips";
const RUNS_COLLECTION = "hrms_payroll_runs";

export interface RunContext {
  month: string;
  fy: string;
  config: PayrollConfig;
  settings: OrgSettings;
  /** The office's state: the default work state. */
  defaultState: string | null;
  rates: RatesBundle;
  policy: EnginePolicy;
  paidDaysPolicy: PaidDaysPolicy;
  holidaysByState: Map<string, Set<string>>;
  attendance: Map<string, Map<string, AttendanceRecord>>;
  leaves: Map<string, LeaveRequest[]>;
  paidLeaveCodes: Set<string>;
  adjustments: Map<string, PayrollAdjustment[]>;
  loans: Map<string, LoanInstalment[]>;
  declarations: Map<string, TaxDeclaration>;
  history: Map<string, PayslipLike[]>;
  monthWorkingDaysByState: Map<string, number>;
  /** Approved leave requests overlapping the month that are still waiting for a decision (listed as a warning). */
  pendingLeaveEmployees: Set<string>;
  /** Overtime requested and approved for the month, per employee. */
  overtime: Map<string, { regularMinutes: number; holidayMinutes: number }>;
  /** Days with an approved partial leave, per employee. */
  shortLeaves: Map<string, Set<string>>;
  /** Requests still waiting for a decision that would change this month's pay. */
  pendingRequests: { overtime: number; expenses: number };
}

export interface PayrollSubject {
  employee: Employee;
  profile: PayrollProfile;
  structure: SalaryStructure;
  bank: BankAccount | null;
}

const stateKey = (s: string | null) => s ?? "";

export function policyFromConfig(config: PayrollConfig): { engine: EnginePolicy; paidDays: PaidDaysPolicy } {
  const overtime = { enabled: config.overtimeEnabled, fromAttendance: !config.overtimeRequiresApproval, afterMinutesPerDay: Math.round(config.hoursPerDay * 60), multiplier: config.overtimeMultiplier, holidayMultiplier: config.holidayWorkMultiplier };
  return {
    engine: {
      ...DEFAULT_ENGINE_POLICY,
      wageDefinition: config.wageDefinition,
      statutoryBonus: { enabled: config.statutoryBonusEnabled, percent: config.statutoryBonusPercent, minimumWage: config.minimumWage },
      deductionCapPercent: config.deductionCapPercent,
      noPanRule: config.noPanRule,
      includeGratuityProvision: config.includeGratuityProvision,
      hoursPerDay: config.hoursPerDay,
      paidDays: { overtime },
    },
    paidDays: { ...DEFAULT_PAID_DAYS_POLICY, basis: config.paidDaysBasis, fixedDays: config.fixedDays, sandwich: config.sandwichRule, unmarkedDay: config.unmarkedDay, lateMarksPerHalfDay: config.lateMarksPerHalfDay, overtime },
  };
}

/** The work state of an employee: their own setting, else the office's. */
export function workStateOf(profile: Pick<PayrollProfile, "statutory">, defaultState: string | null): string | null {
  return normaliseState(profile.statutory?.workState) ?? defaultState;
}

export async function loadRunContext(month: string, employees: Employee[], profiles: Map<string, PayrollProfile>, opts: { excludeRunId?: string } = {}): Promise<RunContext> {
  const db = await getDb();
  const ids = employees.map((e) => e._id);
  const { from, to } = monthBounds(month);
  const windowFrom = addDays(from, -7);
  const windowTo = addDays(to, 7);
  const fy = financialYearOf(month);

  const [config, settings, company, rates] = await Promise.all([getPayrollConfig(), getOrgSettings(), getCompanyDetails(), loadRates()]);
  const defaultState = normaliseState(settings.state) ?? normaliseState(company.state);
  const { engine, paidDays } = policyFromConfig(config);

  // Holidays for each work state in use.
  const states = new Set<string>([stateKey(defaultState)]);
  for (const e of employees) states.add(stateKey(workStateOf(profiles.get(e._id) ?? { statutory: DEFAULT_STATUTORY }, defaultState)));
  const holidaysByState = new Map<string, Set<string>>();
  const monthWorkingDaysByState = new Map<string, number>();
  await Promise.all(
    [...states].map(async (s) => {
      const set = await holidaySetInRange(windowFrom, windowTo, { state: s || null });
      holidaysByState.set(s, set);
      monthWorkingDaysByState.set(s, eachDateString(from, to).filter((d) => classifyDay(d, settings, set) === "working").length);
    }),
  );

  const [attRows, leaveRows, leaveTypes, pendingLeave, adjustments, loans, declarations, runs, overtime, shortLeaves, pendingRequests] = await Promise.all([
    db.collection<AttendanceRecord>(ATTENDANCE_COLLECTION).find({ employeeId: { $in: ids }, date: { $gte: windowFrom, $lte: windowTo }, ...notDeleted }).toArray(),
    db.collection<LeaveRequest>(LEAVE_REQUESTS_COLLECTION).find({ employeeId: { $in: ids }, status: "approved", startDate: { $lte: windowTo }, endDate: { $gte: windowFrom }, ...notDeleted }).toArray(),
    db.collection<{ code: string; paid: boolean }>(LEAVE_TYPES_COLLECTION).find({}).toArray(),
    db.collection<LeaveRequest>(LEAVE_REQUESTS_COLLECTION).find({ employeeId: { $in: ids }, status: "pending", startDate: { $lte: to }, endDate: { $gte: from }, ...notDeleted }, { projection: { employeeId: 1 } }).toArray(),
    pendingForMonth(month, ids),
    instalmentsDue(month, ids),
    declarationsForEmployees(ids, fy),
    db.collection<{ _id: string; status: string }>(RUNS_COLLECTION).find({ status: { $in: ["approved", "paid"] }, ...(opts.excludeRunId ? { _id: { $ne: opts.excludeRunId } } : {}) }, { projection: { _id: 1 } }).toArray(),
    approvedOvertime(month, ids),
    approvedShortLeaveDates(windowFrom, windowTo, ids),
    pendingForPayroll(month),
  ]);

  const attendance = new Map<string, Map<string, AttendanceRecord>>();
  for (const r of attRows) {
    const m = attendance.get(r.employeeId) ?? new Map();
    m.set(r.date, r);
    attendance.set(r.employeeId, m);
  }
  const leaves = new Map<string, LeaveRequest[]>();
  for (const r of leaveRows) leaves.set(r.employeeId, [...(leaves.get(r.employeeId) ?? []), r]);

  // Earlier payslips of this financial year (and the ESI period), from runs that were approved or paid.
  const fyMonths = monthsOfFy(fy);
  const esiFrom = fyMonths.filter((m) => m < month);
  const approvedRunIds = runs.map((r) => r._id);
  const slipRows = esiFrom.length === 0 || ids.length === 0 ? [] : await db.collection<PayslipLike & { employeeId: string; runId: string }>(PAYSLIPS_COLLECTION).find({ employeeId: { $in: ids }, runId: { $in: approvedRunIds }, month: { $in: [...esiFrom, ...previousEsiMonths(month)] } }).toArray();
  const history = new Map<string, PayslipLike[]>();
  for (const s of slipRows) history.set(s.employeeId, [...(history.get(s.employeeId) ?? []), s]);

  return {
    month,
    fy,
    config,
    settings,
    defaultState,
    rates,
    policy: engine,
    paidDaysPolicy: paidDays,
    holidaysByState,
    attendance,
    leaves,
    paidLeaveCodes: new Set(leaveTypes.filter((t) => t.paid).map((t) => t.code)),
    adjustments,
    loans,
    declarations,
    history,
    monthWorkingDaysByState,
    pendingLeaveEmployees: new Set(pendingLeave.map((l) => l.employeeId)),
    overtime,
    shortLeaves,
    pendingRequests,
  };
}

/** The months of the previous financial year that share an ESI contribution period with `month` (January to March). */
function previousEsiMonths(month: string): string[] {
  const mm = Number(month.slice(5, 7));
  if (mm >= 4) return [];
  const y = Number(month.slice(0, 4));
  return [`${y - 1}-10`, `${y - 1}-11`, `${y - 1}-12`];
}

export async function loadProfiles(employeeIds: string[]): Promise<Map<string, PayrollProfile>> {
  if (employeeIds.length === 0) return new Map();
  const db = await getDb();
  const rows = await db.collection<PayrollProfile>(PAYROLL_PROFILES_COLLECTION).find({ employeeId: { $in: employeeIds }, ...notDeleted }).toArray();
  return new Map(rows.map((p) => [p.employeeId, { ...p, da: p.da ?? 0, employerNps: p.employerNps ?? 0, statutory: { ...DEFAULT_STATUTORY, ...(p.statutory ?? {}) } }]));
}

export async function loadSubject(employee: Employee, profile: PayrollProfile, month: string): Promise<PayrollSubject | null> {
  const { to } = monthBounds(month);
  const [structure, bank] = await Promise.all([effectiveStructure(employee._id, to), getPrimaryBankAccount(employee._id)]);
  if (!structure) return null;
  return { employee, profile, structure, bank };
}

// ── Days ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** One employee's days of the month, from the calendar, attendance and approved leave. */
export function paidDaysFor(ctx: RunContext, s: PayrollSubject): PaidDaysResult {
  const state = workStateOf(s.profile, ctx.defaultState);
  const holidays = ctx.holidaysByState.get(stateKey(state)) ?? new Set<string>();
  const { from, to } = monthBounds(ctx.month);
  const att = ctx.attendance.get(s.employee._id) ?? new Map<string, AttendanceRecord>();
  const requests = ctx.leaves.get(s.employee._id) ?? [];

  const shortSet = ctx.shortLeaves.get(s.employee._id) ?? new Set<string>();
  const days: PaidDaysDay[] = eachDateString(addDays(from, -7), addDays(to, 7)).map((date) => {
    const kind = classifyDay(date, ctx.settings, holidays);
    const rec = att.get(date);
    let leave = null as PaidDaysDay["leave"];
    if (kind === "working") {
      for (const r of requests) {
        if (date < r.startDate || date > r.endDate) continue;
        let fraction = 1;
        if (date === r.startDate && r.halfDayStart) fraction -= 0.5;
        if (date === r.endDate && r.halfDayEnd && r.startDate !== r.endDate) fraction -= 0.5;
        if (r.startDate === r.endDate && r.halfDayEnd && !r.halfDayStart) fraction -= 0.5;
        leave = { fraction: Math.min(1, (leave?.fraction ?? 0) + fraction), paid: ctx.paidLeaveCodes.has(r.leaveTypeCode) };
      }
    }
    const mark: AttendanceMark = rec?.status === "present" || rec?.status === "half_day" || rec?.status === "absent" || rec?.status === "on_leave" ? rec.status : "none";
    return { date, kind, attendance: mark, shortLeave: shortSet.has(date), leave, workedMinutes: rec?.workedMinutes ?? 0, isLate: rec?.isLate ?? false };
  });
  return computePaidDays({ month: ctx.month, joinDate: s.employee.professional.joiningDate ?? null, exitDate: s.employee.professional.relievingDate ?? null, days, policy: ctx.paidDaysPolicy, approvedOvertime: ctx.overtime.get(s.employee._id) });
}

// ── The engine's input ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface BuildOptions {
  overrides?: { arrears: number; manualTds: number | null; otherDeductions: number };
  /** Extra one-off items (the final settlement). */
  extraAdjustments?: PayrollAdjustment[];
  /** Replace the loan instalments (the final settlement recovers the whole balance instead). */
  loans?: LoanInstalment[];
  /** Final payslip of a person who is leaving: recoveries are taken in full. */
  settlement?: boolean;
}

export function buildPayslipInput(ctx: RunContext, s: PayrollSubject, opts: BuildOptions = {}): PayslipInput {
  const { config } = ctx;
  const state = workStateOf(s.profile, ctx.defaultState);
  const flags = s.profile.statutory;
  const days = paidDaysFor(ctx, s);
  const decl = ctx.declarations.get(s.employee._id) ?? null;
  const incomeTax: IncomeTaxYear = incomeTaxFor(ctx.fy, ctx.rates.incomeTax);
  const pt: PtRule | null = config.ptRegistered ? ptRuleFor(state, ctx.rates.pt) : null;
  const lwf: LwfRule | null = state ? (ctx.rates.lwf.find((r) => r.state.toLowerCase() === state.toLowerCase()) ?? null) : null;
  const history = ctx.history.get(s.employee._id) ?? [];

  const adjustments = [...(ctx.adjustments.get(s.employee._id) ?? []), ...(opts.extraAdjustments ?? [])];
  const prev = decl?.previousEmployer ?? NO_PREVIOUS_EMPLOYER;
  const policy = opts.settlement ? { ...ctx.policy, deductionCapPercent: 100 } : ctx.policy;

  return {
    month: ctx.month,
    employee: {
      id: s.employee._id,
      gender: s.employee.personal.gender ?? null,
      dateOfBirth: s.employee.personal.dateOfBirth ?? null,
      state,
      joinDate: s.employee.professional.joiningDate ?? null,
      exitDate: s.employee.professional.relievingDate ?? null,
      pan: s.profile.panNumber,
      hasUan: !!s.profile.uan,
      hasEsiNumber: !!s.profile.esiNumber,
      hasBankAccount: !!s.bank,
    },
    profile: {
      pfApplicable: flags.pfApplicable && config.pfRegistered,
      pfMode: flags.pfMode ?? config.pfDefaultMode,
      epsEligible: flags.epsEligible,
      esiApplicable: flags.esiApplicable && config.esiRegistered,
      esiDisabled: flags.esiDisabled,
      ptApplicable: flags.ptApplicable && config.ptRegistered,
      lwfApplicable: flags.lwfApplicable && config.lwfRegistered,
      tdsApplicable: flags.tdsApplicable && config.tdsEnabled,
    },
    structure: toPayrollStructure(s.structure),
    days,
    monthWorkingDays: ctx.monthWorkingDaysByState.get(stateKey(state)) ?? days.workingDays,
    adjustments,
    loans: opts.loans ?? ctx.loans.get(s.employee._id) ?? [],
    declaration: {
      regime: decl?.regime ?? config.defaultTaxRegime,
      amounts: decl ? effectiveAmounts(decl, ctx.month, config.proofCutoffMonth) : NO_DEDUCTIONS,
      previousEmployer: { taxableSalary: prev.taxableSalary, employeePf: prev.employeePf, professionalTax: prev.professionalTax, tds: prev.tds },
    },
    ytd: history.length ? yearToDate(ctx.month, history) : ZERO_YTD,
    esiDecidedEarlierInPeriod: esiDecisionEarlier(ctx.month, history),
    overrides: opts.overrides ?? { arrears: 0, manualTds: null, otherDeductions: 0 },
    policy,
    rates: { statutory: ctx.rates.statutory, incomeTax, pt, lwf },
  };
}
