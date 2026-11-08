import "server-only";
import { loadProfiles } from "@/lib/products/talentos/payroll/context";
import { getDb } from "@/lib/mongodb";
import { EMPLOYEES_COLLECTION, type Employee } from "@/lib/products/talentos/employees";
import type { Payslip } from "@/lib/products/talentos/payroll-run";
import type { ExportSlip } from "@/lib/products/talentos/payroll/exports";
import { BUILTIN_STATUTORY } from "@/lib/products/talentos/payroll/rates";

/** Joins a run's payslips with the numbers the returns need from each employee's payroll profile (UAN, ESI number, PAN) and their exit date. */
export async function exportSlipsForRun(slips: Payslip[]): Promise<ExportSlip[]> {
  const ids = slips.map((s) => s.employeeId);
  const [profiles, employees] = await Promise.all([
    loadProfiles(ids),
    getDb().then((db) => db.collection<Employee>(EMPLOYEES_COLLECTION).find({ _id: { $in: ids } }, { projection: { professional: 1 } }).toArray()),
  ]);
  const byEmp = new Map(employees.map((e) => [e._id, e]));
  const pfRates = BUILTIN_STATUTORY.providentFund;
  return slips.map((s) => {
    const p = profiles.get(s.employeeId);
    const pf = s.statutory?.pf;
    // A payslip made before the statutory engine kept these figures: work them out from its lines.
    const basic = s.earnings.filter((e) => e.code === "BASIC" || e.name === "Basic").reduce((n, e) => n + e.amount, 0);
    const legacyPfWages = Math.min(basic, pfRates.wageCeiling);
    const exitDate = byEmp.get(s.employeeId)?.professional?.relievingDate ?? null;
    return {
      employeeId: s.employeeId,
      employeeCode: s.employeeCode,
      employeeName: s.employeeName,
      grossPay: s.grossPay,
      netPay: s.netPay,
      lopDays: s.lopDays,
      paidDays: s.paidDays ?? Math.max(0, (s.monthDays ?? 30) - s.lopDays),
      monthDays: s.monthDays ?? 30,
      earnings: s.earnings,
      deductions: s.deductions,
      employerContributions: s.employerContributions,
      pfWages: s.statutory?.pfWages ?? basic,
      esiWages: s.statutory?.esiWages ?? s.grossPay,
      esiCovered: s.statutory?.esi.covered ?? s.deductions.some((d) => d.code === "ESI" || d.name === "ESI"),
      epsWages: pf?.epsWages ?? legacyPfWages,
      edliWages: pf?.edliWages ?? legacyPfWages,
      contributionWages: pf?.contributionWages ?? legacyPfWages,
      taxableEarnings: s.tax?.taxableEarnings ?? s.grossPay,
      regime: s.tax?.regime ?? "new",
      annualTax: s.tax?.annual?.totalTax ?? null,
      state: s.workState ?? null,
      uan: p?.uan ?? null,
      esiNumber: p?.esiNumber ?? null,
      pan: p?.panNumber ?? null,
      exitDate: exitDate && s.month === exitDate.slice(0, 7) ? exitDate : null,
      held: !!s.held,
    };
  });
}
