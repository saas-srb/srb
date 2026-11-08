/**
 * Checks on a statutory-rate table before the Platform Console saves it. A table with a gap in its slabs or a rate of 120% would silently
 * produce wrong payslips for every company, so nothing is saved that does not pass these (pure: no I/O).
 */
import type { BonusRates, EsiRates, GratuityRates, IncomeTaxYear, LeaveEncashmentRates, LwfRule, ProvidentFundRates, PtRule, PtSlab, StatutoryRates, TaxSlab } from "@/lib/products/talentos/payroll/rates";
import { INDIAN_STATES } from "@/lib/products/talentos/payroll/rates";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const rate = (v: unknown, label: string, errors: string[], max = 100) => {
  if (!isNum(v) || v < 0 || v > max) errors.push(`${label} must be a number from 0 to ${max}.`);
};
const money = (v: unknown, label: string, errors: string[]) => {
  if (!isNum(v) || v < 0 || v > 1e10) errors.push(`${label} must be an amount of rupees (0 or more).`);
};

function checkSlabs(slabs: unknown, label: string, errors: string[]) {
  if (!Array.isArray(slabs) || slabs.length === 0) return errors.push(`${label}: at least one slab is needed.`);
  let last = -1;
  (slabs as TaxSlab[]).forEach((s, i) => {
    rate(s?.rate, `${label}, slab ${i + 1} rate`, errors);
    const isLast = i === slabs.length - 1;
    if (isLast) {
      if (s?.upTo !== null) errors.push(`${label}: the last slab must have no upper limit.`);
    } else if (!isNum(s?.upTo) || s.upTo <= last) errors.push(`${label}, slab ${i + 1}: the upper limit must be above the previous one.`);
    else last = s.upTo;
  });
}

export function validateIncomeTaxYear(y: IncomeTaxYear): string[] {
  const e: string[] = [];
  if (!/^\d{4}-\d{2}$/.test(y?.fy ?? "") || Number(y.fy.slice(5)) !== (Number(y.fy.slice(0, 4)) + 1) % 100) e.push('The year must look like "2026-27".');
  rate(y?.cessPercent, "Cess", e, 20);
  for (const [name, r] of [["New regime", y?.newRegime], ["Old regime", y?.oldRegime]] as const) {
    if (!r) {
      e.push(`${name} is missing.`);
      continue;
    }
    money(r.standardDeduction, `${name} standard deduction`, e);
    money(r.rebate?.incomeLimit, `${name} rebate income limit`, e);
    money(r.rebate?.maxRebate, `${name} maximum rebate`, e);
    rate(r.maxSurchargePercent, `${name} highest surcharge`, e, 50);
    rate(r.employerNpsPercent, `${name} employer NPS limit`, e);
    let prev = 0;
    (r.surcharge ?? []).forEach((b, i) => {
      rate(b.rate, `${name} surcharge band ${i + 1} rate`, e, 50);
      if (!isNum(b.above) || b.above <= prev) e.push(`${name} surcharge band ${i + 1}: thresholds must increase.`);
      else prev = b.above;
    });
  }
  if (y?.newRegime) checkSlabs(y.newRegime.slabs, "New regime slabs", e);
  if (y?.oldRegime?.slabs) {
    checkSlabs(y.oldRegime.slabs.general, "Old regime slabs (under 60)", e);
    checkSlabs(y.oldRegime.slabs.senior, "Old regime slabs (60 to 79)", e);
    checkSlabs(y.oldRegime.slabs.superSenior, "Old regime slabs (80 and over)", e);
  } else e.push("Old regime slabs are missing.");
  const L = y?.limits;
  if (!L) e.push("Deduction limits are missing.");
  else for (const k of ["section80C", "section80CCD1B", "section80TTA", "section80TTB", "homeLoanInterestSelfOccupied", "employerFundsExempt", "rentPanThreshold"] as const) money(L[k], `Limit ${k}`, e);
  return e;
}

export function validateStatutory(s: StatutoryRates): string[] {
  const e: string[] = [];
  const pf: ProvidentFundRates = s?.providentFund;
  const esi: EsiRates = s?.esi;
  const g: GratuityRates = s?.gratuity;
  const b: BonusRates = s?.bonus;
  const l: LeaveEncashmentRates = s?.leaveEncashment;
  if (!pf || !esi || !g || !b || !l) return ["Provident fund, ESI, gratuity, bonus and leave encashment must all be present."];
  rate(pf.employeePercent, "PF employee %", e, 30);
  rate(pf.employerTotalPercent, "PF employer %", e, 30);
  rate(pf.epsPercent, "EPS %", e, 30);
  if (isNum(pf.epsPercent) && isNum(pf.employerTotalPercent) && pf.epsPercent > pf.employerTotalPercent) e.push("EPS % cannot be more than the employer's total PF %.");
  rate(pf.edliPercent, "EDLI %", e, 5);
  rate(pf.adminPercent, "EPF admin %", e, 5);
  money(pf.wageCeiling, "PF wage ceiling", e);
  money(pf.epsWageCeiling, "EPS wage ceiling", e);
  money(pf.edliWageCeiling, "EDLI wage ceiling", e);
  money(pf.adminMinimum, "EPF admin minimum", e);
  rate(esi.employeePercent, "ESI employee %", e, 10);
  rate(esi.employerPercent, "ESI employer %", e, 10);
  money(esi.wageThreshold, "ESI wage threshold", e);
  money(esi.wageThresholdDisabled, "ESI wage threshold (disability)", e);
  money(esi.dailyWageExemption, "ESI daily wage exemption", e);
  money(g.daysPerYear, "Gratuity days per year", e);
  money(g.daysInMonth, "Gratuity days in a month", e);
  money(g.minYears, "Gratuity minimum years", e);
  money(g.maxAmount, "Gratuity maximum", e);
  money(g.exemptLimit, "Gratuity exempt limit", e);
  rate(b.minPercent, "Bonus minimum %", e, 100);
  rate(b.maxPercent, "Bonus maximum %", e, 100);
  if (isNum(b.minPercent) && isNum(b.maxPercent) && b.minPercent > b.maxPercent) e.push("Bonus minimum % cannot be above the maximum.");
  money(b.eligibilityWageCeiling, "Bonus eligibility ceiling", e);
  money(b.calculationWageCeiling, "Bonus calculation ceiling", e);
  money(l.exemptLimit, "Leave encashment exempt limit", e);
  return e;
}

function checkPtSlabs(slabs: PtSlab[], label: string, e: string[]) {
  if (!slabs.length) return e.push(`${label}: at least one slab is needed.`);
  let next = 0;
  slabs.forEach((s, i) => {
    money(s.amount, `${label}, slab ${i + 1} amount`, e);
    if (!isNum(s.from) || s.from !== next) e.push(`${label}, slab ${i + 1}: starts at ${s.from} but the previous slab ended at ${next - 1}. There must be no gap or overlap.`);
    const last = i === slabs.length - 1;
    if (last) {
      if (s.to !== null) e.push(`${label}: the last slab must have no upper limit.`);
    } else if (!isNum(s.to) || s.to < s.from) e.push(`${label}, slab ${i + 1}: the upper limit must be at least the lower one.`);
    else next = s.to + 1;
    for (const [mm, amt] of Object.entries(s.monthAmounts ?? {})) {
      if (!/^(0[1-9]|1[0-2])$/.test(mm)) e.push(`${label}, slab ${i + 1}: "${mm}" is not a month (01 to 12).`);
      money(amt, `${label}, slab ${i + 1} amount for month ${mm}`, e);
    }
  });
}

export function validatePtRule(r: PtRule): string[] {
  const e: string[] = [];
  if (!(INDIAN_STATES as readonly string[]).includes(r?.state)) e.push(`"${r?.state}" is not a state or union territory.`);
  if (r?.frequency !== "monthly" && r?.frequency !== "half_yearly") e.push("Frequency must be monthly or half-yearly.");
  if (r?.noTax) return e;
  money(r?.annualCap, "Annual cap", e);
  checkPtSlabs(r?.slabs ?? [], "Slabs", e);
  if (r?.femaleSlabs?.length) checkPtSlabs(r.femaleSlabs, "Slabs for women", e);
  if (r?.frequency === "half_yearly" && (!r.payMonths || r.payMonths.length === 0 || r.payMonths.some((m) => !/^(0[1-9]|1[0-2])$/.test(m)))) e.push("A half-yearly state needs the months in which the tax is deducted.");
  return e;
}

export function validateLwfRule(r: LwfRule): string[] {
  const e: string[] = [];
  if (!(INDIAN_STATES as readonly string[]).includes(r?.state)) e.push(`"${r?.state}" is not a state or union territory.`);
  if (!r?.payMonths?.length || r.payMonths.some((m) => !/^(0[1-9]|1[0-2])$/.test(m))) e.push("The months of contribution must be two-digit months (06, 12 ...).");
  money(r?.employee, "Employee contribution", e);
  money(r?.employer, "Employer contribution", e);
  money(r?.wageCeiling, "Wage ceiling", e);
  return e;
}
