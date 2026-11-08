/**
 * Year-to-date totals from an employee's earlier payslips (pure). Payroll for a month needs to know what the year has already seen: the
 * taxable pay so far and the tax already deducted (to spread what is left), the PF and professional tax paid (for 80C and the annual cap),
 * and whether ESI coverage was decided earlier in the contribution period.
 *
 * Payslips made before the engine kept these totals (version 1) are read from their lines, so the first run after an upgrade is still right.
 */
import { monthsOfFy, financialYearOf } from "@/lib/products/talentos/payroll/rates";
import { esiPeriodStart } from "@/lib/products/talentos/payroll/statutory";
import { ZERO_YTD, type YearToDate } from "@/lib/products/talentos/payroll/compute";

export interface PayslipLike {
  month: string;
  grossPay: number;
  earnings: { code?: string; name: string; amount: number }[];
  deductions: { code?: string; name: string; amount: number }[];
  employerContributions: { code?: string; name: string; amount: number }[];
  schemaVersion?: number;
  bases?: { taxableEarnings: number; basicPlusDa: number; hra: number };
  statutory?: { esiCoveredDecision?: boolean | null };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const line = (rows: { code?: string; name: string; amount: number }[], codes: string[], names: string[]) =>
  sum(rows.filter((r) => (r.code && codes.includes(r.code)) || (!r.code && names.includes(r.name))).map((r) => r.amount));

/** Totals for the financial year that holds `month`, from payslips of earlier months of that year. */
export function yearToDate(month: string, slips: PayslipLike[]): YearToDate {
  const fyMonths = monthsOfFy(financialYearOf(month));
  const earlier = slips.filter((s) => fyMonths.includes(s.month) && s.month < month);
  if (earlier.length === 0) return ZERO_YTD;
  const mm = Number(month.slice(5, 7));
  const halfStart = mm >= 4 && mm <= 9 ? `${month.slice(0, 4)}-04` : mm >= 10 ? `${month.slice(0, 4)}-10` : `${Number(month.slice(0, 4)) - 1}-10`;
  const inHalf = earlier.filter((s) => s.month >= halfStart);
  return {
    taxableEarnings: sum(earlier.map((s) => (s.bases ? s.bases.taxableEarnings : s.grossPay))),
    basicPlusDa: sum(earlier.map((s) => (s.bases ? s.bases.basicPlusDa : line(s.earnings, ["BASIC", "DA"], ["Basic"])))),
    hra: sum(earlier.map((s) => (s.bases ? s.bases.hra : line(s.earnings, ["HRA"], ["HRA"])))),
    employerPf: sum(earlier.map((s) => line(s.employerContributions, ["ER_EPF", "ER_EPS"], ["Employer PF", "Employer EPS"]))),
    employerNps: sum(earlier.map((s) => line(s.employerContributions, ["ER_NPS"], []))),
    employeePf: sum(earlier.map((s) => line(s.deductions, ["PF"], ["Provident Fund"]))),
    professionalTax: sum(earlier.map((s) => line(s.deductions, ["PT"], ["Professional Tax"]))),
    tds: sum(earlier.map((s) => line(s.deductions, ["TDS"], ["TDS"]))),
    halfYearGross: sum(inHalf.map((s) => s.grossPay)),
  };
}

/** What the first payslip of the current ESI contribution period decided: true / false, or null when the person has none in the period yet. */
export function esiDecisionEarlier(month: string, slips: PayslipLike[]): boolean | null {
  const start = esiPeriodStart(month);
  const inPeriod = slips.filter((s) => s.month >= start && s.month < month).sort((a, b) => (a.month < b.month ? -1 : 1));
  if (inPeriod.length === 0) return null;
  const first = inPeriod[0];
  if (first.schemaVersion && first.schemaVersion >= 2) return first.statutory?.esiCoveredDecision ?? null;
  return first.deductions.some((d) => d.code === "ESI" || d.name === "ESI");
}
