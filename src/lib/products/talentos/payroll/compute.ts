/**
 * One employee's payslip for one month. Pure: everything it needs is passed in, and nothing is read from or written to a database, so the
 * same inputs always give the same payslip and every rule can be tested with plain numbers.
 *
 * The order of work is the order the law and common sense put it in:
 *   1. earn each pay component for the days paid (pay factor), add overtime, arrears, bonus and one-off earnings;
 *   2. take the statutory wages out of those earnings (PF wages, ESI wages, gross wages for professional tax);
 *   3. provident fund, ESI, professional tax and labour welfare fund;
 *   4. income tax (TDS): project the whole year, work out the tax, deduct the balance over the months that are left;
 *   5. recoveries (loan instalments, fixed deductions, other deductions), kept within the legal limit on deductions from wages;
 *   6. net pay, the employer's cost, and a list of everything the person running payroll should look at.
 */
import {
  computeEsi, computeLwf, computePf, computePt, esiCovered, statutoryBonusMonthly, gratuityMonthlyProvision, type EsiResult, type LwfResult, type PfResult, type PtResult,
} from "@/lib/products/talentos/payroll/statutory";
import { ageOn, monthlyTds, type AnnualTaxResult, type DeductionAmounts, type Regime } from "@/lib/products/talentos/payroll/tax";
import { financialYearOf, monthsOfFy, type IncomeTaxYear, type LwfRule, type PtRule, type StatutoryRates } from "@/lib/products/talentos/payroll/rates";
import type { PaidDaysPolicy, PaidDaysResult } from "@/lib/products/talentos/payroll/paid-days";

// ── Inputs ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A pay component of the salary structure, per month at full pay. */
export interface StructureComponent {
  code: string;
  name: string;
  amount: number;
  kind: "basic" | "da" | "hra" | "allowance" | "reimbursement";
  /** Part of taxable salary. */
  taxable: boolean;
  /** Counted in PF wages. Basic and DA always; other allowances only where the company's PF policy says so. */
  pf: boolean;
  /** Counted in ESI wages. */
  esi: boolean;
  /** Paid in proportion to the days paid. A reimbursement paid on bills is not. */
  prorate: boolean;
}

export interface PayrollStructure {
  components: StructureComponent[];
  /** Fixed monthly deductions the company makes (for example a canteen charge). */
  fixedDeductions: { name: string; amount: number }[];
  /** The employer's own NPS contribution per month (part of the cost to company). */
  employerNps: number;
}

export interface PayrollAdjustment {
  id: string;
  kind: "earning" | "deduction";
  name: string;
  amount: number;
  taxable: boolean;
  pf: boolean;
  esi: boolean;
}

export interface LoanInstalment {
  loanId: string;
  name: string;
  /** Instalment due this month. */
  emi: number;
}

export interface EmployeeFacts {
  id: string;
  gender: "male" | "female" | "other" | "undisclosed" | null;
  dateOfBirth: string | null;
  /** Work state, matched to a known state; `null` when it is missing or unrecognised. */
  state: string | null;
  joinDate: string | null;
  exitDate: string | null;
  pan: string | null;
  hasUan: boolean;
  hasEsiNumber: boolean;
  hasBankAccount: boolean;
}

export interface StatutoryProfile {
  pfApplicable: boolean;
  pfMode: "ceiling" | "actual";
  epsEligible: boolean;
  esiApplicable: boolean;
  esiDisabled: boolean;
  ptApplicable: boolean;
  lwfApplicable: boolean;
  /** Deduct income tax at source for this employee. */
  tdsApplicable: boolean;
}

export interface TaxDeclarationFacts {
  regime: Regime;
  amounts: DeductionAmounts;
  previousEmployer: { taxableSalary: number; employeePf: number; professionalTax: number; tds: number };
}

/** Totals of the same financial year's earlier payslips from this employer. */
export interface YearToDate {
  taxableEarnings: number;
  basicPlusDa: number;
  hra: number;
  employerPf: number;
  employerNps: number;
  employeePf: number;
  professionalTax: number;
  tds: number;
  /** Gross wages paid over the months of the current half-year (for half-yearly professional tax). */
  halfYearGross: number;
}

export const ZERO_YTD: YearToDate = { taxableEarnings: 0, basicPlusDa: 0, hra: 0, employerPf: 0, employerNps: 0, employeePf: 0, professionalTax: 0, tds: 0, halfYearGross: 0 };

export interface EnginePolicy {
  /** "flags": PF wages are the components marked PF. "fifty_percent_rule": at least half of total remuneration (Code on Wages, 2019). */
  wageDefinition: "flags" | "fifty_percent_rule";
  statutoryBonus: { enabled: boolean; percent: number; minimumWage: number };
  /** Voluntary recoveries (loan instalments, fixed and other deductions) may not take total deductions above this % of gross wages. */
  deductionCapPercent: number;
  /** With no PAN: "warn" only, or deduct tax at not less than 20% of taxable earnings (section 206AA). */
  noPanRule: "warn" | "apply_20_percent";
  /** Add the monthly gratuity provision to the employer's cost. */
  includeGratuityProvision: boolean;
  /** Hours of work in a day, for the hourly rate used for overtime. */
  hoursPerDay: number;
  paidDays: Pick<PaidDaysPolicy, "overtime">;
}

export const DEFAULT_ENGINE_POLICY: EnginePolicy = {
  wageDefinition: "flags",
  statutoryBonus: { enabled: false, percent: 8.33, minimumWage: 0 },
  deductionCapPercent: 50,
  noPanRule: "warn",
  includeGratuityProvision: true,
  hoursPerDay: 8,
  paidDays: { overtime: { enabled: false, afterMinutesPerDay: 480, multiplier: 2, holidayMultiplier: 2 } },
};

export interface PayslipInput {
  month: string;
  employee: EmployeeFacts;
  profile: StatutoryProfile;
  structure: PayrollStructure;
  days: PaidDaysResult;
  /** Working days in the whole month (for the overtime hourly rate). */
  monthWorkingDays: number;
  adjustments: PayrollAdjustment[];
  loans: LoanInstalment[];
  declaration: TaxDeclarationFacts;
  ytd: YearToDate;
  /** What an earlier month of the current ESI contribution period decided (see `esiCovered`). */
  esiDecidedEarlierInPeriod: boolean | null;
  overrides: { arrears: number; manualTds: number | null; otherDeductions: number };
  policy: EnginePolicy;
  rates: { statutory: StatutoryRates; incomeTax: IncomeTaxYear; pt: PtRule | null; lwf: LwfRule | null };
}

// ── Outputs ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface EarningLine {
  code: string;
  name: string;
  /** At full pay for the month; equals `amount` for a component that is not prorated and for one-off earnings. */
  fixedAmount: number;
  amount: number;
  taxable: boolean;
}

export interface DeductionLine {
  code: string;
  name: string;
  amount: number;
  group: "statutory" | "tax" | "loan" | "other";
  /** For a recovery the legal cap trimmed: what was due. */
  due?: number;
}

export interface ContributionLine {
  code: string;
  name: string;
  amount: number;
}

export type WarningLevel = "info" | "review" | "blocking";
export interface PayslipWarning {
  level: WarningLevel;
  code: string;
  message: string;
}

export interface ComputedPayslip {
  earnings: EarningLine[];
  fixedGross: number;
  grossEarned: number;
  deductions: DeductionLine[];
  totalDeductions: number;
  employerContributions: ContributionLine[];
  employerCost: number;
  netPay: number;
  /** Deductions that could not be taken because net pay would have gone below zero or past the legal cap. */
  carriedForward: number;
  daysSummary: { monthDays: number; paidDays: number; lopDays: number; basisDays: number; payFactor: number; notes: string[] };
  statutory: {
    pfWages: number;
    esiWages: number;
    ptWages: number;
    pf: PfResult;
    esi: EsiResult;
    esiCoveredDecision: boolean | null;
    pt: PtResult;
    lwf: LwfResult;
  };
  tax: {
    regime: Regime;
    fy: string;
    taxableEarnings: number;
    annual: AnnualTaxResult | null;
    tds: number;
    balanceTax: number;
    manualOverride: boolean;
    monthsRemaining: number;
  };
  /** Bases carried to later months (year-to-date totals are built from these). */
  bases: { taxableEarnings: number; basicPlusDa: number; hra: number };
  warnings: PayslipWarning[];
}

const r0 = (n: number) => Math.round(n);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function earnComponent(c: StructureComponent, payFactor: number): number {
  return r0(c.prorate ? c.amount * payFactor : c.amount);
}

// ── The computation ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function computePayslip(input: PayslipInput): ComputedPayslip {
  const { month, employee, profile, structure, days, policy, rates } = input;
  const warnings: PayslipWarning[] = [];
  const warn = (level: WarningLevel, code: string, message: string) => warnings.push({ level, code, message });
  const factor = days.payFactor;

  // 1. Earnings -------------------------------------------------------------------------------------------------------------------
  const earnings: EarningLine[] = [];
  const earnedByComponent = new Map<string, number>();
  for (const c of structure.components) {
    const amount = earnComponent(c, factor);
    earnedByComponent.set(c.code, amount);
    earnings.push({ code: c.code, name: c.name, fixedAmount: r0(c.amount), amount, taxable: c.taxable });
  }
  const fixedGross = sum(structure.components.map((c) => r0(c.amount)));

  // Overtime: hourly rate from basic + DA over the month's working days, at the multiplier the policy sets.
  const otPolicy = policy.paidDays.overtime;
  let overtimePay = 0;
  if (otPolicy.enabled && (days.overtimeMinutes > 0 || days.holidayWorkedMinutes > 0)) {
    const basicDa = sum(structure.components.filter((c) => c.kind === "basic" || c.kind === "da").map((c) => c.amount));
    const hourly = basicDa / Math.max(1, input.monthWorkingDays) / Math.max(1, policy.hoursPerDay);
    overtimePay = r0((days.overtimeMinutes / 60) * hourly * otPolicy.multiplier + (days.holidayWorkedMinutes / 60) * hourly * otPolicy.holidayMultiplier);
    if (overtimePay > 0) earnings.push({ code: "OT", name: "Overtime", fixedAmount: overtimePay, amount: overtimePay, taxable: true });
  }

  const oneOffEarnings = input.adjustments.filter((a) => a.kind === "earning" && a.amount > 0);
  for (const a of oneOffEarnings) earnings.push({ code: `ADJ:${a.id}`, name: a.name, fixedAmount: r0(a.amount), amount: r0(a.amount), taxable: a.taxable });
  if (input.overrides.arrears > 0) earnings.push({ code: "ARREARS", name: "Arrears", fixedAmount: r0(input.overrides.arrears), amount: r0(input.overrides.arrears), taxable: true });

  const basicDaFixed = sum(structure.components.filter((c) => c.kind === "basic" || c.kind === "da").map((c) => c.amount));
  const basicDaEarned = sum(structure.components.filter((c) => c.kind === "basic" || c.kind === "da").map((c) => earnedByComponent.get(c.code) ?? 0));
  if (policy.statutoryBonus.enabled) {
    const bonus = r0(statutoryBonusMonthly({ basicPlusDa: basicDaFixed, percent: policy.statutoryBonus.percent, minimumWage: policy.statutoryBonus.minimumWage, rates: rates.statutory.bonus }) * factor);
    if (bonus > 0) earnings.push({ code: "BONUS", name: "Statutory bonus", fixedAmount: bonus, amount: bonus, taxable: true });
  }
  const grossEarned = sum(earnings.map((e) => e.amount));

  // 2. Statutory wages ------------------------------------------------------------------------------------------------------------
  const adjPf = sum(oneOffEarnings.filter((a) => a.pf).map((a) => a.amount));
  const adjEsi = sum(oneOffEarnings.filter((a) => a.esi).map((a) => a.amount));
  let pfWages = sum(structure.components.filter((c) => c.pf || c.kind === "basic" || c.kind === "da").map((c) => earnedByComponent.get(c.code) ?? 0)) + adjPf;
  if (policy.wageDefinition === "fifty_percent_rule") pfWages = Math.max(pfWages, r0(grossEarned * 0.5));
  const esiWages = sum(structure.components.filter((c) => c.esi).map((c) => earnedByComponent.get(c.code) ?? 0)) + adjEsi;
  const fixedEsiWages = sum(structure.components.filter((c) => c.esi).map((c) => c.amount));

  // 3. PF, ESI, PT, LWF -----------------------------------------------------------------------------------------------------------
  const pf = profile.pfApplicable ? computePf({ pfWages, mode: profile.pfMode, epsEligible: profile.epsEligible, rates: rates.statutory.providentFund }) : computePf({ pfWages: 0, mode: "ceiling", epsEligible: false, rates: rates.statutory.providentFund });
  let esiDecision: boolean | null = null;
  let esi: EsiResult = { covered: false, wages: 0, employee: 0, employer: 0, employeeExempt: false };
  if (profile.esiApplicable) {
    esiDecision = esiCovered({ monthlyWages: fixedEsiWages, disabled: profile.esiDisabled, decidedEarlierInPeriod: input.esiDecidedEarlierInPeriod, rates: rates.statutory.esi });
    esi = computeEsi({ covered: esiDecision, esiWages, paidDays: Math.max(1, days.paidDays), rates: rates.statutory.esi });
  }
  const ptWages = grossEarned;
  const pt: PtResult = profile.ptApplicable
    ? computePt({ state: employee.state, gender: employee.gender, wages: rates.pt?.frequency === "half_yearly" ? input.ytd.halfYearGross + grossEarned : ptWages, month, deductedThisYear: input.ytd.professionalTax, rule: rates.pt })
    : { amount: 0, issue: null, note: "Professional tax is switched off for this employee." };
  const lwf = computeLwf({ state: employee.state, month, wages: grossEarned, rule: rates.lwf, enabled: profile.lwfApplicable });

  // 4. Income tax -----------------------------------------------------------------------------------------------------------------
  const fy = financialYearOf(month);
  const fyMonths = monthsOfFy(fy);
  const monthIdx = fyMonths.indexOf(month);
  // The months left in the year, or up to the month the person leaves, including this one.
  let lastMonthIdx = 11;
  if (employee.exitDate) {
    const exitMonth = employee.exitDate.slice(0, 7);
    const exitIdx = fyMonths.indexOf(exitMonth);
    if (exitIdx >= 0 && exitIdx < 12) lastMonthIdx = Math.min(lastMonthIdx, exitIdx);
  }
  const monthsRemaining = Math.max(1, lastMonthIdx - monthIdx + 1);
  const isFinalMonth = !!employee.exitDate && employee.exitDate.slice(0, 7) === month;
  const taxableEarningsNow = sum(earnings.filter((e) => e.taxable).map((e) => e.amount));
  // What a normal month looks like from here on: the structure at full pay.
  const recurringTaxable = sum(structure.components.filter((c) => c.taxable).map((c) => r0(c.amount)));
  const recurringHra = sum(structure.components.filter((c) => c.kind === "hra").map((c) => r0(c.amount)));
  const hraEarned = sum(structure.components.filter((c) => c.kind === "hra").map((c) => earnedByComponent.get(c.code) ?? 0));
  const futureMonths = monthsRemaining - 1;
  const regime = input.declaration.regime;
  const taxYear = rates.incomeTax;
  const age = ageOn(employee.dateOfBirth, `${Number(taxYear.fy.slice(0, 4)) + 1}-03-31`);

  // Employee PF and professional tax for the months still to come, at this month's level.
  const futurePf = r0(pf.employee * futureMonths);
  let futurePt = 0;
  if (profile.ptApplicable && rates.pt && futureMonths > 0) {
    let done = input.ytd.professionalTax + pt.amount;
    for (let k = monthIdx + 1; k <= lastMonthIdx; k++) {
      const amt = computePt({ state: employee.state, gender: employee.gender, wages: recurringTaxable, month: fyMonths[k], deductedThisYear: done, rule: rates.pt }).amount;
      futurePt += amt;
      done += amt;
    }
  }

  const prev = input.declaration.previousEmployer;
  const annualInput = {
    year: taxYear,
    regime,
    age,
    taxableSalary: input.ytd.taxableEarnings + taxableEarningsNow + recurringTaxable * futureMonths + prev.taxableSalary,
    basicPlusDa: input.ytd.basicPlusDa + basicDaEarned + basicDaFixed * futureMonths,
    hraReceived: input.ytd.hra + hraEarned + recurringHra * futureMonths,
    employerPf: input.ytd.employerPf + pf.employerTotal + pf.employerTotal * futureMonths,
    employerNps: input.ytd.employerNps + r0(structure.employerNps * factor) + structure.employerNps * futureMonths,
    employerSuperannuation: 0,
    employeePf: input.ytd.employeePf + pf.employee + futurePf + prev.employeePf,
    professionalTax: input.ytd.professionalTax + pt.amount + futurePt + prev.professionalTax,
    declared: input.declaration.amounts,
  };
  let tds = 0;
  let annual: AnnualTaxResult | null = null;
  let balanceTax = 0;
  const manual = input.overrides.manualTds != null && input.overrides.manualTds >= 0;
  if (profile.tdsApplicable || manual) {
    const m = monthlyTds({ ...annualInput, tdsDeductedSoFar: input.ytd.tds, tdsPreviousEmployer: prev.tds, monthsRemaining, isFinalMonth });
    annual = m.annual;
    balanceTax = m.balanceTax;
    tds = manual ? r0(input.overrides.manualTds as number) : m.tds;
    if (!manual && !employee.pan && policy.noPanRule === "apply_20_percent") tds = Math.max(tds, r0(taxableEarningsNow * 0.2));
  }
  if (!profile.tdsApplicable && !manual) annual = null;

  // 5. Recoveries within the legal cap --------------------------------------------------------------------------------------------
  const deductions: DeductionLine[] = [];
  const push = (d: DeductionLine) => {
    if (d.amount > 0) deductions.push(d);
  };
  push({ code: "PF", name: "Provident Fund", amount: pf.employee, group: "statutory" });
  push({ code: "ESI", name: "ESI", amount: esi.employee, group: "statutory" });
  push({ code: "PT", name: "Professional Tax", amount: pt.amount, group: "statutory" });
  push({ code: "LWF", name: "Labour Welfare Fund", amount: lwf.employee, group: "statutory" });
  push({ code: "TDS", name: "Income Tax (TDS)", amount: tds, group: "tax" });
  const statutoryTotal = sum(deductions.map((d) => d.amount));

  const voluntaryDue: DeductionLine[] = [];
  for (const l of input.loans) if (l.emi > 0) voluntaryDue.push({ code: `LOAN:${l.loanId}`, name: l.name, amount: r0(l.emi), group: "loan" });
  for (const d of structure.fixedDeductions) if (d.amount > 0) voluntaryDue.push({ code: `FIXED:${d.name}`, name: d.name, amount: r0(d.amount), group: "other" });
  for (const a of input.adjustments) if (a.kind === "deduction" && a.amount > 0) voluntaryDue.push({ code: `ADJ:${a.id}`, name: a.name, amount: r0(a.amount), group: "other" });
  if (input.overrides.otherDeductions > 0) voluntaryDue.push({ code: "OTHER", name: "Other deductions", amount: r0(input.overrides.otherDeductions), group: "other" });

  // Total deductions may not take more than the cap share of wages (Payment of Wages Act / Code on Wages), and net pay may not go below zero.
  const capTotal = r0((grossEarned * policy.deductionCapPercent) / 100);
  let room = Math.max(0, Math.min(capTotal - statutoryTotal, grossEarned - statutoryTotal));
  let carriedForward = 0;
  for (const d of voluntaryDue) {
    const take = Math.min(d.amount, room);
    room -= take;
    if (take > 0) push({ ...d, amount: take, due: take < d.amount ? d.amount : undefined });
    if (take < d.amount) {
      carriedForward += d.amount - take;
      warn("review", "deduction_deferred", `${d.name}: ${d.amount - take} could not be recovered this month (total deductions are limited to ${policy.deductionCapPercent}% of wages) and stays due.`);
    }
  }
  const totalDeductions = sum(deductions.map((d) => d.amount));
  let netPay = grossEarned - totalDeductions;
  if (netPay < 0) {
    // Statutory deductions alone exceed pay (a very low month): pay nothing and report it rather than a negative payslip.
    warn("blocking", "negative_net", `Deductions (${totalDeductions}) are more than the pay earned (${grossEarned}). Review this payslip before the run is approved.`);
    netPay = 0;
  }

  // 6. Employer side --------------------------------------------------------------------------------------------------------------
  const employerContributions: ContributionLine[] = [];
  const addEr = (code: string, name: string, amount: number) => {
    if (amount > 0) employerContributions.push({ code, name, amount });
  };
  addEr("ER_EPF", "Employer PF (EPF)", pf.employerEpf);
  addEr("ER_EPS", "Employer pension (EPS)", pf.employerEps);
  addEr("ER_EDLI", "EDLI", pf.edli);
  addEr("ER_ADMIN", "EPF administration charge", pf.admin);
  addEr("ER_ESI", "Employer ESI", esi.employer);
  addEr("ER_LWF", "Employer labour welfare fund", lwf.employer);
  addEr("ER_NPS", "Employer NPS", r0(structure.employerNps * factor));
  if (policy.includeGratuityProvision) addEr("ER_GRATUITY", "Gratuity provision", r0(gratuityMonthlyProvision(basicDaFixed, rates.statutory.gratuity) * factor));
  const employerCost = grossEarned + sum(employerContributions.map((c) => c.amount));

  // 7. What to look at ------------------------------------------------------------------------------------------------------------
  if (!employee.pan && profile.tdsApplicable) warn("review", "no_pan", policy.noPanRule === "apply_20_percent" ? "No PAN: tax is deducted at not less than 20% (section 206AA)." : "No PAN on record. Collect it: tax may have to be deducted at 20%, and Form 16 cannot be issued correctly without it.");
  if (profile.pfApplicable && !employee.hasUan) warn("review", "no_uan", "PF applies but there is no UAN. The monthly PF return (ECR) cannot include this employee without one.");
  if (esi.covered && !employee.hasEsiNumber) warn("review", "no_esi_number", "ESI applies but there is no ESI (IP) number.");
  // Tax for the year is spread over the months left, so it needs the pay of the months before. A person who was already employed earlier in this
  // financial year but has no payslip for it in the system (payroll started mid-year, or pay was run elsewhere) would be under-taxed.
  if (profile.tdsApplicable && input.ytd.taxableEarnings === 0 && input.declaration.previousEmployer.taxableSalary === 0 && !employee.exitDate) {
    const firstMonth = employee.joinDate && employee.joinDate.slice(0, 7) > fyMonths[0] ? employee.joinDate.slice(0, 7) : fyMonths[0];
    if (firstMonth < month) warn("review", "no_opening_balance", `${monthIdx - fyMonths.indexOf(firstMonth)} earlier month(s) of this financial year have no payslip in the system, so the tax for the year is worked out as if this were the first month and will be too low. Enter the pay, PF, professional tax and tax of those months under "previous employer" in the employee's tax declaration.`);
  }
  if (!employee.hasBankAccount) warn("review", "no_bank", "No bank account on record, so the salary cannot be paid by transfer.");
  if (!employee.state && (profile.ptApplicable || profile.lwfApplicable)) warn("review", "no_state", "Work state is not set, so professional tax / labour welfare fund could not be worked out.");
  if (pt.issue === "no_rule") warn("review", "pt_no_rule", pt.note);
  if (pt.issue === "not_confirmed") warn("info", "pt_unconfirmed", `Professional-tax slabs for ${employee.state} have not been confirmed by a platform administrator yet.`);
  if (lwf.issue === "no_rule") warn("review", "lwf_no_rule", `The labour welfare fund is switched on but no rule is set for ${employee.state}.`);
  if (profile.tdsApplicable && !taxYear.confirmed) warn("info", "tax_unconfirmed", `Income-tax slabs for ${taxYear.fy} have not been confirmed by a platform administrator yet.`);
  if (profile.tdsApplicable && !employee.dateOfBirth && regime === "old") warn("info", "no_dob", "Date of birth is missing; the old-regime slabs for under-60 are used.");
  if (manual) warn("info", "manual_tds", "Income tax was entered by hand; the computed figure is not used.");
  if (days.lopDays > days.employedDays / 2 && days.employedDays > 0) warn("review", "high_lop", `More than half of the month is loss of pay (${days.lopDays} days).`);
  if (days.unmarkedDays > 0) warn("review", "unmarked_days", `${days.unmarkedDays} working day(s) have no attendance recorded and were treated as loss of pay.`);
  if (profile.pfApplicable && pf.contributionWages > 0 && pf.contributionWages < 1) warn("info", "pf_zero", "No PF wages this month.");
  if (structure.components.length === 0) warn("blocking", "no_structure", "No salary structure.");

  return {
    earnings,
    fixedGross,
    grossEarned,
    deductions,
    totalDeductions,
    employerContributions,
    employerCost,
    netPay,
    carriedForward,
    daysSummary: { monthDays: days.monthDays, paidDays: days.paidDays, lopDays: days.lopDays, basisDays: days.basisDays, payFactor: days.payFactor, notes: days.notes },
    statutory: { pfWages, esiWages, ptWages, pf, esi, esiCoveredDecision: esiDecision, pt, lwf },
    tax: { regime, fy, taxableEarnings: taxableEarningsNow, annual, tds, balanceTax, manualOverride: manual, monthsRemaining },
    bases: { taxableEarnings: taxableEarningsNow, basicPlusDa: basicDaEarned, hra: hraEarned },
    warnings,
  };
}
