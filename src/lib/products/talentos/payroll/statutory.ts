/**
 * Statutory deductions and contributions for Indian payroll: provident fund (EPF, EPS, EDLI, admin), ESI, professional tax, labour welfare
 * fund, statutory bonus, gratuity and leave encashment. Pure functions: no I/O, no clock. The figures they use come from `rates.ts`.
 *
 * Rounding follows the departments' own practice: PF contributions round to the nearest rupee, ESI contributions round UP to the next
 * rupee, and everything else is rounded to the nearest rupee.
 */
import type { BonusRates, EsiRates, GratuityRates, LeaveEncashmentRates, LwfRule, ProvidentFundRates, PtRule, PtSlab } from "@/lib/products/talentos/payroll/rates";

/** Which statutory deductions apply to one employee, and how. */
export interface StatutoryFlags {
  pfApplicable: boolean;
  /** "ceiling", "actual", or null to follow the company's default. */
  pfMode: "ceiling" | "actual" | null;
  /** Member of the pension scheme (EPS). Not for someone who first joined PF after 1 September 2014 with wages above the ceiling. */
  epsEligible: boolean;
  esiApplicable: boolean;
  /** A person with disability (higher ESI wage threshold). */
  esiDisabled: boolean;
  ptApplicable: boolean;
  lwfApplicable: boolean;
  tdsApplicable: boolean;
  /** The state the person works in (professional tax, labour welfare fund and state holidays); null = the office's state. */
  workState: string | null;
}

export const DEFAULT_STATUTORY: StatutoryFlags = {
  pfApplicable: true,
  pfMode: null,
  epsEligible: true,
  esiApplicable: true,
  esiDisabled: false,
  ptApplicable: true,
  lwfApplicable: true,
  tdsApplicable: true,
  workState: null,
};

// ── Provident fund ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PfInput {
  /** PF wages earned this month: basic + dearness allowance + the components marked as PF wages, after loss of pay. */
  pfWages: number;
  /** "ceiling": contributions are on wages up to the ceiling. "actual": on all PF wages (higher contribution, agreed by employer and employee). */
  mode: "ceiling" | "actual";
  /** True for a member of the pension scheme. A member who first joined PF after 1 September 2014 with wages above the ceiling is not. */
  epsEligible: boolean;
  rates: ProvidentFundRates;
}

export interface PfResult {
  /** The wages the contribution is worked out on. */
  contributionWages: number;
  /** Wages for the pension scheme (EPS) and for insurance (EDLI): never above their ceilings. */
  epsWages: number;
  edliWages: number;
  employee: number;
  employerEpf: number;
  employerEps: number;
  employerTotal: number;
  edli: number;
  admin: number;
}

export const ZERO_PF: PfResult = { contributionWages: 0, epsWages: 0, edliWages: 0, employee: 0, employerEpf: 0, employerEps: 0, employerTotal: 0, edli: 0, admin: 0 };

export function computePf(i: PfInput): PfResult {
  const wages = Math.max(0, Math.round(i.pfWages));
  if (wages === 0) return ZERO_PF;
  const r = i.rates;
  const contributionWages = i.mode === "actual" ? wages : Math.min(wages, r.wageCeiling);
  const employee = Math.round((contributionWages * r.employeePercent) / 100);
  const employerTotal = Math.round((contributionWages * r.employerTotalPercent) / 100);
  const epsWages = i.epsEligible ? Math.min(wages, r.epsWageCeiling) : 0;
  const employerEps = i.epsEligible ? Math.round((epsWages * r.epsPercent) / 100) : 0;
  const employerEpf = Math.max(0, employerTotal - employerEps);
  const edliWages = Math.min(wages, r.edliWageCeiling);
  return {
    contributionWages,
    epsWages,
    edliWages,
    employee,
    employerEpf,
    employerEps,
    employerTotal,
    edli: Math.round((edliWages * r.edliPercent) / 100),
    admin: Math.round((contributionWages * r.adminPercent) / 100),
  };
}

// ── Employees' State Insurance ─────────────────────────────────────────────────────────────────────────────────────────────

/** ESI runs in two contribution periods a year: April to September and October to March. Returns the first month ("yyyy-mm") of the one that holds `month`. */
export function esiPeriodStart(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  if (m >= 4 && m <= 9) return `${y}-04`;
  if (m >= 10) return `${y}-10`;
  return `${y - 1}-10`;
}

export interface EsiCoverageInput {
  /** The employee's fixed monthly wages (before any loss of pay): the figure the threshold is tested against. */
  monthlyWages: number;
  /** A person with disability has a higher threshold. */
  disabled: boolean;
  /**
   * What an earlier month of this contribution period decided: true (covered), false (not covered), or null when this is the first month the
   * person is on the payroll in the period. A person who is covered stays covered to the end of the period even if wages rise above the threshold.
   */
  decidedEarlierInPeriod: boolean | null;
  rates: EsiRates;
}

export function esiCovered(i: EsiCoverageInput): boolean {
  if (i.decidedEarlierInPeriod !== null) return i.decidedEarlierInPeriod;
  const threshold = i.disabled ? i.rates.wageThresholdDisabled : i.rates.wageThreshold;
  return i.monthlyWages > 0 && i.monthlyWages <= threshold;
}

export interface EsiInput {
  covered: boolean;
  /** ESI wages earned this month: all wages except overtime (and the other items the Act leaves out), after loss of pay. */
  esiWages: number;
  /** Days paid in the month, for the daily-wage exemption. */
  paidDays: number;
  rates: EsiRates;
}

export interface EsiResult {
  covered: boolean;
  wages: number;
  employee: number;
  employer: number;
  /** True when the employee pays nothing because the daily wage is at or below the exemption. */
  employeeExempt: boolean;
}

const ceilRupee = (n: number) => Math.ceil(n - 1e-9);

export function computeEsi(i: EsiInput): EsiResult {
  const wages = Math.max(0, Math.round(i.esiWages));
  if (!i.covered || wages === 0) return { covered: i.covered, wages: 0, employee: 0, employer: 0, employeeExempt: false };
  const daily = i.paidDays > 0 ? wages / i.paidDays : wages;
  const exempt = daily <= i.rates.dailyWageExemption;
  return {
    covered: true,
    wages,
    employee: exempt ? 0 : ceilRupee((wages * i.rates.employeePercent) / 100),
    employer: ceilRupee((wages * i.rates.employerPercent) / 100),
    employeeExempt: exempt,
  };
}

// ── Professional tax ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PtInput {
  /** The employee's work state, normalised (see `normaliseState`), or null when unknown. */
  state: string | null;
  gender: "male" | "female" | "other" | "undisclosed" | null;
  /** Wages for the period the slab is read on: this month's gross wages; for a half-yearly state, the six months' wages. */
  wages: number;
  /** The month being paid, "yyyy-mm". */
  month: string;
  /** Professional tax already deducted in this financial year (the annual cap is applied to the total). */
  deductedThisYear: number;
  rule: PtRule | null;
}

export type PtIssue = "no_state" | "no_rule" | "not_confirmed" | null;

export interface PtResult {
  amount: number;
  issue: PtIssue;
  /** What was applied, in words, for the payslip and the run's notes. */
  note: string;
}

function slabFor(slabs: PtSlab[], wages: number): PtSlab | null {
  return slabs.find((s) => wages >= s.from && (s.to === null || wages <= s.to)) ?? null;
}

export function computePt(i: PtInput): PtResult {
  if (!i.state) return { amount: 0, issue: "no_state", note: "The employee's work state is not set, so professional tax could not be worked out." };
  if (!i.rule) return { amount: 0, issue: "no_rule", note: `No professional-tax rule is set up for ${i.state}.` };
  const rule = i.rule;
  if (rule.noTax) return { amount: 0, issue: null, note: `${rule.state} charges no professional tax.` };
  const mm = i.month.slice(5, 7);
  if (rule.frequency === "half_yearly" && !(rule.payMonths ?? []).includes(mm)) return { amount: 0, issue: rule.confirmed ? null : "not_confirmed", note: `${rule.state} collects professional tax half-yearly (not this month).` };
  const useFemale = i.gender === "female" && rule.femaleSlabs && rule.femaleSlabs.length > 0;
  const slab = slabFor(useFemale ? rule.femaleSlabs! : rule.slabs, Math.round(i.wages));
  let amount = slab ? (slab.monthAmounts?.[mm] ?? slab.amount) : 0;
  const room = Math.max(0, rule.annualCap - Math.max(0, i.deductedThisYear));
  amount = Math.min(amount, room);
  return { amount, issue: rule.confirmed ? null : "not_confirmed", note: `${rule.state}${useFemale ? " (women)" : ""}: slab ${slab ? `${slab.from}${slab.to === null ? "+" : `–${slab.to}`}` : "none"}` };
}

// ── Labour welfare fund ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface LwfResult {
  employee: number;
  employer: number;
  issue: "no_state" | "no_rule" | null;
}

export function computeLwf(i: { state: string | null; month: string; wages: number; rule: LwfRule | null; enabled: boolean }): LwfResult {
  if (!i.enabled) return { employee: 0, employer: 0, issue: null };
  if (!i.state) return { employee: 0, employer: 0, issue: "no_state" };
  if (!i.rule) return { employee: 0, employer: 0, issue: "no_rule" };
  if (!i.rule.payMonths.includes(i.month.slice(5, 7))) return { employee: 0, employer: 0, issue: null };
  if (i.rule.wageCeiling > 0 && i.wages > i.rule.wageCeiling) return { employee: 0, employer: 0, issue: null };
  return { employee: i.rule.employee, employer: i.rule.employer, issue: null };
}

// ── Statutory bonus ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Bonus for one month under the Payment of Bonus Act: a percentage (8.33% to 20%) of the wage, where the wage taken is the smaller of the
 * employee's basic + DA and the calculation ceiling (or the state's minimum wage, if that is higher). Only employees whose monthly wages are
 * at most the eligibility ceiling are eligible.
 */
export function statutoryBonusMonthly(i: { basicPlusDa: number; percent: number; minimumWage: number; rates: BonusRates }): number {
  if (i.basicPlusDa <= 0 || i.basicPlusDa > i.rates.eligibilityWageCeiling) return 0;
  const percent = Math.min(i.rates.maxPercent, Math.max(i.rates.minPercent, i.percent));
  const ceiling = Math.max(i.rates.calculationWageCeiling, i.minimumWage);
  return Math.round((Math.min(i.basicPlusDa, ceiling) * percent) / 100);
}

// ── Gratuity ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Years of service between two "yyyy-mm-dd" dates, as a decimal (days / 365.25). */
export function serviceYears(joinDate: string, exitDate: string): number {
  const days = (Date.parse(`${exitDate}T00:00:00Z`) - Date.parse(`${joinDate}T00:00:00Z`)) / 86_400_000 + 1;
  return Math.max(0, days / 365.25);
}

/** Completed years, where a final part-year of more than `roundUpAfterMonths` months counts as one more year. */
export function gratuityYears(joinDate: string, exitDate: string, rates: GratuityRates): number {
  const total = serviceYears(joinDate, exitDate);
  const whole = Math.floor(total);
  const monthsLeft = (total - whole) * 12;
  return monthsLeft > rates.roundUpAfterMonths ? whole + 1 : whole;
}

export interface GratuityInput {
  /** Last drawn basic + dearness allowance, per month. */
  lastBasicPlusDa: number;
  joinDate: string;
  exitDate: string;
  /** Death or disability: no minimum service. */
  deathOrDisability?: boolean;
  /** Fixed-term employees are eligible after one year (Code on Social Security, 2020). */
  fixedTerm?: boolean;
  /** True when the Payment of Gratuity Act (or the Code) covers the establishment (10 or more employees). */
  coveredByAct: boolean;
  rates: GratuityRates;
}

export interface GratuityResult {
  eligible: boolean;
  reason: string;
  years: number;
  amount: number;
  /** Part of the amount that is exempt from tax under section 10(10), and the taxable balance. */
  exempt: number;
  taxable: number;
}

export function computeGratuity(i: GratuityInput): GratuityResult {
  const total = serviceYears(i.joinDate, i.exitDate);
  const years = gratuityYears(i.joinDate, i.exitDate, i.rates);
  const minYears = i.fixedTerm ? 1 : i.rates.minYears;
  if (!i.deathOrDisability && total < minYears) {
    return { eligible: false, reason: `Service of ${total.toFixed(2)} years is below the ${minYears} years needed.`, years, amount: 0, exempt: 0, taxable: 0 };
  }
  const raw = (i.lastBasicPlusDa / i.rates.daysInMonth) * i.rates.daysPerYear * years;
  const amount = Math.round(Math.min(raw, i.rates.maxAmount));
  // Exempt: the least of the amount, the formula amount, and the limit (for an establishment the Act covers). Otherwise half a month's salary per year.
  const formula = i.coveredByAct ? raw : (i.lastBasicPlusDa / 2) * years;
  const exempt = Math.round(Math.min(amount, formula, i.rates.exemptLimit));
  return { eligible: true, reason: "", years, amount, exempt, taxable: Math.max(0, amount - exempt) };
}

/** What to set aside each month so the gratuity is funded (it is part of the employer's cost, not paid out monthly). */
export function gratuityMonthlyProvision(basicPlusDa: number, rates: GratuityRates): number {
  return Math.round(((basicPlusDa / rates.daysInMonth) * rates.daysPerYear) / 12);
}

// ── Leave encashment ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface LeaveEncashmentInput {
  days: number;
  /** Basic + dearness allowance per month (the usual basis). */
  basicPlusDa: number;
  /** Days in the month used to turn a month's salary into a day's: 30 by convention (26 where the policy says so). */
  daysInMonth: number;
  /** Average monthly salary of the last 10 months (basic + DA + commission), for the tax exemption. */
  averageMonthlySalary: number;
  /** True when it is paid on leaving the job (retirement, resignation): only then is any of it exempt from tax. */
  onLeaving: boolean;
  rates: LeaveEncashmentRates;
}

export function computeLeaveEncashment(i: LeaveEncashmentInput): { amount: number; exempt: number; taxable: number } {
  const amount = Math.round((i.basicPlusDa / Math.max(1, i.daysInMonth)) * Math.max(0, i.days));
  if (!i.onLeaving) return { amount, exempt: 0, taxable: amount };
  const exempt = Math.round(Math.min(amount, i.rates.exemptLimit, i.averageMonthlySalary * i.rates.exemptMonthsOfAverageSalary));
  return { amount, exempt, taxable: Math.max(0, amount - exempt) };
}
