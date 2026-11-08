import "server-only";
import {
  listRuns as listHrmsRuns,
  getRun as getHrmsRun,
  getPayslipsForRun as getHrmsPayslipsForRun,
  type PayrollRun,
  type Payslip,
} from "@/lib/products/talentos/payroll-run";
import { searchPayouts as searchHrmsPayouts, type PayoutSearch, type SalaryPayout } from "@/lib/products/talentos/salary-payouts";

/**
 * FMS's Payroll read layer (§12). HRMS already computes payroll AND
 * executes the real salary payment (`hrms_salary_payouts` — provider-
 * agnostic, real UTR/reference, reconciliation). There is nothing to
 * "fill in" on the payment side — unlike PRMS's expense reimbursement gap
 * (see `fms/reimbursements.ts`), HRMS's payout execution is already
 * complete. This module only reads HRMS's real exports directly; it never
 * writes to any `hrms_*` collection.
 */

export async function listPayrollRuns(): Promise<PayrollRun[]> {
  return listHrmsRuns();
}

export async function getPayrollRunDetail(id: string): Promise<{ run: PayrollRun; payslips: Payslip[] } | null> {
  const run = await getHrmsRun(id);
  if (!run) return null;
  const payslips = await getHrmsPayslipsForRun(id);
  return { run, payslips };
}

export async function listSalaryPayments(opts: PayoutSearch = {}) {
  return searchHrmsPayouts(opts);
}

/** Salary payable = net pay across every payslip whose payout hasn't reached `paid` yet. */
export async function totalSalaryPayable(): Promise<number> {
  try {
    const runs = await listHrmsRuns();
    const unpaidRuns = runs.filter((r) => r.status !== "paid" && r.status !== "draft");
    let total = 0;
    for (const run of unpaidRuns) {
      const { items } = await searchHrmsPayouts({ month: run.month, pageSize: 500 });
      total += items.filter((p) => p.status !== "paid" && p.status !== "cancelled").reduce((s, p) => s + p.netPayable, 0);
    }
    return Math.round(total * 100) / 100;
  } catch {
    return 0;
  }
}

export type { PayrollRun, Payslip, SalaryPayout };
