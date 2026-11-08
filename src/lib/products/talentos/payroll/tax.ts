/**
 * Income tax on salary (TDS under section 192 / section 392 of the Income-tax Act, 2025). Pure functions: no I/O.
 *
 * What an employer must do each month is: estimate the employee's total income for the whole financial year, work out the tax on it under
 * the regime the employee chose, subtract the tax already deducted (here and at earlier employers), and deduct the balance in equal
 * instalments over the months that are left. This file does exactly that, in rupees, with the rounding the law prescribes:
 *   - total income is rounded to the nearest 10 rupees (section 288A),
 *   - the tax is rounded to the nearest 10 rupees (section 288B),
 *   - each month's TDS is rounded to the nearest rupee.
 *
 * What it models: slabs for both regimes and for the three age groups of the old regime; the standard deduction; the rebate (section 87A)
 * with marginal relief where the law gives it; surcharge with marginal relief; the 4% cess; HRA exemption; the Chapter VI-A deductions of
 * the old regime (80C, 80CCD(1B), 80D, 80DD, 80DDB, 80E, 80G, 80TTA/80TTB, 80U) and interest on a self-occupied home loan; employer NPS
 * under 80CCD(2) in both regimes; tax on employer contributions above 7.5 lakh; income from other sources; and the salary and TDS from a
 * previous employer in the same year.
 *
 * What it does not model (use a manual TDS override on the payslip for these): capital gains and other special-rate income, relief under
 * section 89 for arrears, residents who are not ordinarily resident, and non-residents.
 */
import type { IncomeTaxYear, SurchargeBand, TaxSlab } from "@/lib/products/talentos/payroll/rates";

export type Regime = "new" | "old";

/** Rounds to the nearest 10 rupees (halves go up), as sections 288A and 288B require. */
export const roundToTen = (n: number): number => Math.round(n / 10) * 10;
export const roundRupee = (n: number): number => Math.round(n);

/** Age in completed years on `onDate`; `null` when the date of birth is not known. */
export function ageOn(dateOfBirth: string | null | undefined, onDate: string): number | null {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [y, m, d] = onDate.split("-").map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

/** Tax on `income` by the slabs (before rebate, surcharge and cess). */
export function slabTax(income: number, slabs: TaxSlab[]): number {
  const taxable = Math.max(0, income);
  let tax = 0;
  let lower = 0;
  for (const slab of slabs) {
    if (taxable <= lower) break;
    const top = slab.upTo === null ? taxable : Math.min(taxable, slab.upTo);
    tax += ((top - lower) * slab.rate) / 100;
    if (slab.upTo === null) break;
    lower = slab.upTo;
  }
  return tax;
}

/** The slab that the last rupee of `income` falls in, as a percentage (the employee's marginal rate). */
export function marginalRate(income: number, slabs: TaxSlab[]): number {
  for (const slab of slabs) if (slab.upTo === null || income <= slab.upTo) return slab.rate;
  return slabs[slabs.length - 1]?.rate ?? 0;
}

// ── Declarations (what the employee tells the employer) ─────────────────────────────────────────────────────────────────────

/** Amounts in rupees for the whole financial year, already limited to what is proved or accepted. Every field defaults to nothing. */
export interface DeductionAmounts {
  /** Life insurance, ELSS, PPF, tuition fees, home-loan principal, NSC, tax-saving FD … (employee PF is added automatically). */
  section80C: number;
  /** Additional self contribution to NPS (80CCD(1B)). */
  section80CCD1B: number;
  /** Health insurance premium (and preventive health check-up) for self, spouse and children. */
  section80DSelf: number;
  section80DSelfSenior: boolean;
  /** The same for parents. */
  section80DParents: number;
  section80DParentsSenior: boolean;
  /** Preventive health check-up included in the premium amounts above. */
  section80DPreventive: number;
  /** Interest on an education loan (no limit, for 8 years). */
  section80E: number;
  /** Donations: the amount that qualifies after applying the 50% / 100% rates. */
  section80G: number;
  /** Interest on savings accounts (80TTA) or on deposits for a senior citizen (80TTB). */
  interestSavings: number;
  /** Dependant with disability (80DD), self with disability (80U): none, normal (40%+) or severe (80%+). */
  disability80DD: "none" | "normal" | "severe";
  disability80U: "none" | "normal" | "severe";
  /** Treatment of specified diseases (80DDB): the expense, and whether the patient is a senior citizen. */
  section80DDB: number;
  section80DDBSenior: boolean;
  /** Interest paid on a loan for a self-occupied house (section 24(b)). */
  homeLoanInterest: number;
  /** Leave travel allowance exemption (old regime), as proved by travel bills. */
  ltaExemption: number;
  /** Other income for the year: interest, rent and so on, net. Negative = a loss from house property (set off up to the limit). */
  otherIncome: number;
  /** Rent paid for the whole year, and whether the city is a metro (Delhi, Mumbai, Chennai, Kolkata, and others notified). */
  rentPaidAnnual: number;
  rentInMetro: boolean;
}

export const NO_DEDUCTIONS: DeductionAmounts = {
  section80C: 0,
  section80CCD1B: 0,
  section80DSelf: 0,
  section80DSelfSenior: false,
  section80DParents: 0,
  section80DParentsSenior: false,
  section80DPreventive: 0,
  section80E: 0,
  section80G: 0,
  interestSavings: 0,
  disability80DD: "none",
  disability80U: "none",
  section80DDB: 0,
  section80DDBSenior: false,
  homeLoanInterest: 0,
  ltaExemption: 0,
  otherIncome: 0,
  rentPaidAnnual: 0,
  rentInMetro: false,
};

// ── The annual computation ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AnnualTaxInput {
  year: IncomeTaxYear;
  regime: Regime;
  /** Age on the last day of the financial year (old-regime slabs depend on it); `null` is treated as under 60. */
  age: number | null;
  /** Cash salary the employee is taxed on for the year, from this employer and any earlier one, before exemptions and deductions (without the employer's NPS contribution, which is added from `employerNps`). */
  taxableSalary: number;
  /** Basic + dearness allowance for the year (HRA and NPS limits are a share of this). */
  basicPlusDa: number;
  /** HRA received for the year. */
  hraReceived: number;
  /** Employer's contribution to PF, NPS and superannuation for the year. */
  employerPf: number;
  employerNps: number;
  employerSuperannuation: number;
  /** The employee's own PF for the year (counts towards 80C). */
  employeePf: number;
  /** Professional tax for the year (deductible from salary income in the old regime only). */
  professionalTax: number;
  declared: DeductionAmounts;
}

export interface AnnualTaxResult {
  regime: Regime;
  fy: string;
  grossSalary: number;
  perquisiteOnEmployerFunds: number;
  hraExemption: number;
  ltaExemption: number;
  standardDeduction: number;
  professionalTax: number;
  incomeFromSalary: number;
  otherIncome: number;
  grossTotalIncome: number;
  /** Itemised deductions that actually reduced the tax (only those allowed in the chosen regime). */
  deductions: { label: string; section: string; amount: number }[];
  totalDeductions: number;
  /** Total income, rounded to the nearest 10 rupees. */
  taxableIncome: number;
  taxOnIncome: number;
  rebate: number;
  surcharge: number;
  cess: number;
  /** Tax for the year, rounded to the nearest 10 rupees. */
  totalTax: number;
  marginalRatePercent: number;
}

const cap = (value: number, limit: number) => Math.max(0, Math.min(value, limit));

/** HRA exemption under section 10(13A): the least of HRA received, rent less 10% of basic+DA, and 50% / 40% of basic+DA. */
export function hraExemption(input: { hraReceived: number; basicPlusDa: number; rentPaidAnnual: number; metro: boolean }, year: IncomeTaxYear): number {
  const { hraReceived, basicPlusDa, rentPaidAnnual, metro } = input;
  if (hraReceived <= 0 || rentPaidAnnual <= 0 || basicPlusDa <= 0) return 0;
  const rentExcess = rentPaidAnnual - (basicPlusDa * year.limits.hraRentExcessPercent) / 100;
  const share = (basicPlusDa * (metro ? year.limits.hraMetroPercent : year.limits.hraNonMetroPercent)) / 100;
  return Math.max(0, Math.round(Math.min(hraReceived, rentExcess, share)));
}

/** Surcharge for `taxable` income on `tax`, with marginal relief, in a regime with the given bands and highest rate. */
function surchargeFor(taxable: number, tax: number, bands: SurchargeBand[], maxRate: number, taxAt: (income: number) => number): number {
  const sorted = [...bands].sort((a, b) => a.above - b.above);
  const rateAt = (income: number) => Math.min(maxRate, [...sorted].reverse().find((b) => income > b.above)?.rate ?? 0);
  const rate = rateAt(taxable);
  if (rate === 0) return 0;
  let total = tax + (tax * rate) / 100;
  // Marginal relief: tax plus surcharge may not exceed the tax plus surcharge at the threshold plus the income above it.
  for (const band of sorted) {
    if (taxable <= band.above) continue;
    const atThreshold = taxAt(band.above);
    const limit = atThreshold + (atThreshold * rateAt(band.above)) / 100 + (taxable - band.above);
    total = Math.min(total, limit);
  }
  return Math.max(0, total - tax);
}

/** The itemised deductions of the old regime, limited as the Act limits them. */
function oldRegimeDeductions(i: AnnualTaxInput): { label: string; section: string; amount: number }[] {
  const L = i.year.limits;
  const d = i.declared;
  const out: { label: string; section: string; amount: number }[] = [];
  const add = (label: string, section: string, amount: number) => {
    const a = Math.round(amount);
    if (a > 0) out.push({ label, section, amount: a });
  };
  add("Investments (PF, life insurance, ELSS, PPF, tuition fees, home-loan principal …)", "80C", cap(i.employeePf + d.section80C, L.section80C));
  add("Additional contribution to NPS", "80CCD(1B)", cap(d.section80CCD1B, L.section80CCD1B));
  const selfCap = d.section80DSelfSenior ? L.section80D.selfSenior : L.section80D.self;
  const parentsCap = d.section80DParentsSenior ? L.section80D.parentsSenior : L.section80D.parents;
  add("Health insurance: self, spouse, children", "80D", cap(d.section80DSelf, selfCap));
  add("Health insurance: parents", "80D", cap(d.section80DParents, parentsCap));
  add("Dependant with disability", "80DD", d.disability80DD === "none" ? 0 : L.section80DD[d.disability80DD]);
  add("Specified diseases", "80DDB", cap(d.section80DDB, d.section80DDBSenior ? L.section80DDB.senior : L.section80DDB.normal));
  add("Education loan interest", "80E", Math.max(0, d.section80E));
  add("Donations", "80G", Math.max(0, d.section80G));
  const senior = (i.age ?? 0) >= 60;
  add(senior ? "Interest on deposits (senior citizen)" : "Interest on savings account", senior ? "80TTB" : "80TTA", cap(d.interestSavings, senior ? L.section80TTB : L.section80TTA));
  add("Self with disability", "80U", d.disability80U === "none" ? 0 : L.section80U[d.disability80U]);
  return out;
}

/** The full annual computation for one employee and one regime. */
export function computeAnnualTax(i: AnnualTaxInput): AnnualTaxResult {
  const { year, regime } = i;
  const R = regime === "new" ? year.newRegime : year.oldRegime;
  const d = i.declared;

  // The employer's NPS contribution is part of salary (and deducted again under 80CCD(2) below). Employer contributions to PF, NPS and
  // superannuation together above the limit are a further perquisite in both regimes; the NPS part of that excess is already in salary.
  const employerNps = Math.max(0, i.employerNps);
  const employerFunds = Math.max(0, i.employerPf) + employerNps + Math.max(0, i.employerSuperannuation);
  const excessFunds = Math.max(0, employerFunds - year.limits.employerFundsExempt);
  const perquisite = Math.max(0, excessFunds - employerNps);
  const grossSalary = Math.max(0, Math.round(i.taxableSalary)) + Math.round(employerNps) + Math.round(perquisite);

  const hra = regime === "old" ? hraExemption({ hraReceived: i.hraReceived, basicPlusDa: i.basicPlusDa, rentPaidAnnual: d.rentPaidAnnual, metro: d.rentInMetro }, year) : 0;
  const lta = regime === "old" ? Math.max(0, Math.round(d.ltaExemption)) : 0;
  const standardDeduction = Math.min(R.standardDeduction, Math.max(0, grossSalary - hra - lta));
  const pt = regime === "old" ? Math.max(0, Math.round(i.professionalTax)) : 0;
  const incomeFromSalary = Math.max(0, grossSalary - hra - lta - standardDeduction - pt);

  // House property: interest on a self-occupied house is a loss set off against other income, up to the limit (old regime only).
  const houseInterest = regime === "old" ? cap(d.homeLoanInterest, year.limits.homeLoanInterestSelfOccupied) : 0;
  const otherIncome = Math.round(d.otherIncome) - Math.round(houseInterest);
  const grossTotalIncome = incomeFromSalary + otherIncome;

  const deductions = regime === "old" ? oldRegimeDeductions(i) : [];
  // Employer NPS (80CCD(2)) is allowed in both regimes, up to a share of basic + DA.
  const npsAllowed = cap(i.employerNps, (i.basicPlusDa * R.employerNpsPercent) / 100);
  if (npsAllowed > 0) deductions.push({ label: "Employer contribution to NPS", section: "80CCD(2)", amount: Math.round(npsAllowed) });
  const totalDeductions = deductions.reduce((s, x) => s + x.amount, 0);
  const taxableIncome = roundToTen(Math.max(0, grossTotalIncome - totalDeductions));

  // Slabs for the regime (and, in the old regime, the age group).
  const slabs =
    regime === "new" ? year.newRegime.slabs : (i.age ?? 0) >= 80 ? year.oldRegime.slabs.superSenior : (i.age ?? 0) >= 60 ? year.oldRegime.slabs.senior : year.oldRegime.slabs.general;

  const taxBeforeRebate = slabTax(taxableIncome, slabs);
  let tax = taxBeforeRebate;
  let rebate = 0;
  if (taxableIncome <= R.rebate.incomeLimit) {
    rebate = Math.min(tax, R.rebate.maxRebate);
    tax -= rebate;
  } else if (R.rebate.marginalRelief) {
    const excess = taxableIncome - R.rebate.incomeLimit;
    if (tax > excess) {
      rebate = tax - excess;
      tax = excess;
    }
  }

  const taxAt = (income: number) => {
    let t = slabTax(income, slabs);
    if (income <= R.rebate.incomeLimit) t -= Math.min(t, R.rebate.maxRebate);
    else if (R.rebate.marginalRelief) t = Math.min(t, income - R.rebate.incomeLimit);
    return t;
  };
  const surcharge = surchargeFor(taxableIncome, tax, R.surcharge, R.maxSurchargePercent, taxAt);
  const cess = ((tax + surcharge) * year.cessPercent) / 100;
  const totalTax = roundToTen(tax + surcharge + cess);

  return {
    regime,
    fy: year.fy,
    grossSalary,
    perquisiteOnEmployerFunds: Math.round(perquisite),
    hraExemption: hra,
    ltaExemption: lta,
    standardDeduction,
    professionalTax: pt,
    incomeFromSalary,
    otherIncome,
    grossTotalIncome,
    deductions,
    totalDeductions,
    taxableIncome,
    taxOnIncome: Math.round(taxBeforeRebate),
    rebate: Math.round(rebate),
    surcharge: Math.round(surcharge),
    cess: Math.round(cess),
    totalTax,
    marginalRatePercent: marginalRate(taxableIncome, slabs),
  };
}

// ── Monthly TDS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface MonthlyTdsInput extends AnnualTaxInput {
  /** Tax already deducted from this employee in this financial year (this employer, earlier months). */
  tdsDeductedSoFar: number;
  /** Tax already deducted by earlier employers in this financial year (from Form 12B / Form 16). */
  tdsPreviousEmployer: number;
  /** Months left in the financial year including this one (1 in March). */
  monthsRemaining: number;
  /** A person who leaves: deduct everything that is still due now. */
  isFinalMonth?: boolean;
}

export interface MonthlyTdsResult {
  tds: number;
  annual: AnnualTaxResult;
  /** Tax due for the year less what has been deducted so far. */
  balanceTax: number;
}

/** What to deduct this month: the balance of the year's tax spread equally over the months that remain. */
export function monthlyTds(i: MonthlyTdsInput): MonthlyTdsResult {
  const annual = computeAnnualTax(i);
  const balance = Math.max(0, annual.totalTax - Math.max(0, i.tdsDeductedSoFar) - Math.max(0, i.tdsPreviousEmployer));
  const months = i.isFinalMonth ? 1 : Math.max(1, i.monthsRemaining);
  return { tds: roundRupee(balance / months), annual, balanceTax: balance };
}
