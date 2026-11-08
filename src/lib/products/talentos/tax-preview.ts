import "server-only";
import { getEmployee } from "@/lib/products/talentos/employees";
import { computePayslip } from "@/lib/products/talentos/payroll/compute";
import { buildPayslipInput, loadProfiles, loadRunContext, loadSubject } from "@/lib/products/talentos/payroll/context";
import { financialYearOf, incomeTaxFor, monthsOfFy, type IncomeTaxYear } from "@/lib/products/talentos/payroll/rates";
import type { DeductionAmounts, Regime } from "@/lib/products/talentos/payroll/tax";
import type { PreviousEmployer } from "@/lib/products/talentos/tax-declarations";
import { todayDateString } from "@/lib/products/talentos/settings";

/**
 * "What will my tax be?" for an employee who is filling in a declaration: the same payroll engine that makes the payslip is run twice, once
 * for each regime, with the figures they typed. Nothing is saved. It reads the real salary structure, the payslips already issued this
 * financial year, the remaining months, PF and professional tax, so the result is what payroll would deduct, not a rough guess.
 */

export interface RegimeSummary {
  regime: Regime;
  grossSalary: number;
  hraExemption: number;
  standardDeduction: number;
  professionalTax: number;
  otherIncome: number;
  deductions: { label: string; section: string; amount: number }[];
  totalDeductions: number;
  taxableIncome: number;
  taxOnIncome: number;
  rebate: number;
  surcharge: number;
  cess: number;
  /** Tax for the whole financial year. */
  yearTax: number;
  /** What payroll would deduct this month, and the months left over which the rest is spread. */
  thisMonth: number;
  monthsRemaining: number;
  /** Tax already deducted this year by this and any earlier employer. */
  deductedSoFar: number;
}

export interface TaxPreview {
  fy: string;
  month: string;
  confirmed: boolean;
  source: string;
  new: RegimeSummary;
  old: RegimeSummary;
  /** The regime that costs less, and by how much for the year. */
  better: Regime;
  saving: number;
  /** How much more could still be claimed (old regime) before the limit is reached. */
  headroom: { section80C: number; section80CCD1B: number; section80D: number };
  limits: IncomeTaxYear["limits"];
}

export async function previewTax(
  employeeId: string,
  declared: DeductionAmounts,
  previousEmployer: PreviousEmployer,
): Promise<{ ok: true; preview: TaxPreview } | { ok: false; error: string }> {
  const employee = await getEmployee(employeeId);
  if (!employee) return { ok: false, error: "Employee not found." };
  const profiles = await loadProfiles([employeeId]);
  const profile = profiles.get(employeeId);
  if (!profile) return { ok: false, error: "Your salary details have not been set up yet, so tax cannot be estimated. Ask HR." };

  const today = todayDateString().slice(0, 7);
  const fy = financialYearOf(today);
  // Estimate from this month's position; once the year is over, from its last month.
  const month = monthsOfFy(fy).includes(today) ? today : monthsOfFy(fy)[11];
  const subject = await loadSubject(employee, profile, month);
  if (!subject) return { ok: false, error: "Your salary structure has not been set up yet, so tax cannot be estimated. Ask HR." };
  const ctx = await loadRunContext(month, [employee], profiles);
  const base = buildPayslipInput(ctx, subject);

  const run = (regime: Regime): RegimeSummary | null => {
    const out = computePayslip({
      ...base,
      profile: { ...base.profile, tdsApplicable: true },
      overrides: { ...base.overrides, manualTds: null },
      declaration: { regime, amounts: declared, previousEmployer: { taxableSalary: previousEmployer.taxableSalary, employeePf: previousEmployer.employeePf, professionalTax: previousEmployer.professionalTax, tds: previousEmployer.tds } },
    });
    const a = out.tax.annual;
    if (!a) return null;
    return {
      regime,
      grossSalary: a.grossSalary,
      hraExemption: a.hraExemption + a.ltaExemption,
      standardDeduction: a.standardDeduction,
      professionalTax: a.professionalTax,
      otherIncome: a.otherIncome,
      deductions: a.deductions,
      totalDeductions: a.totalDeductions,
      taxableIncome: a.taxableIncome,
      taxOnIncome: a.taxOnIncome,
      rebate: a.rebate,
      surcharge: a.surcharge,
      cess: a.cess,
      yearTax: a.totalTax,
      thisMonth: out.tax.tds,
      monthsRemaining: out.tax.monthsRemaining,
      deductedSoFar: base.ytd.tds + previousEmployer.tds,
    };
  };
  const nw = run("new");
  const od = run("old");
  if (!nw || !od) return { ok: false, error: "Tax is not worked out for you (it is switched off for your profile). Ask HR." };

  const year = incomeTaxFor(fy, ctx.rates.incomeTax);
  const used = (section: string) => od.deductions.filter((d) => d.section === section).reduce((n, d) => n + d.amount, 0);
  const better: Regime = od.yearTax < nw.yearTax ? "old" : "new";
  return {
    ok: true,
    preview: {
      fy,
      month,
      confirmed: year.confirmed,
      source: year.source,
      new: nw,
      old: od,
      better,
      saving: Math.abs(nw.yearTax - od.yearTax),
      headroom: {
        section80C: Math.max(0, year.limits.section80C - used("80C")),
        section80CCD1B: Math.max(0, year.limits.section80CCD1B - used("80CCD(1B)")),
        section80D: Math.max(0, year.limits.section80D.self + year.limits.section80D.parents - used("80D")),
      },
      limits: year.limits,
    },
  };
}
