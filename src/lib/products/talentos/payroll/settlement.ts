/**
 * Full and final settlement for someone who leaves. Pure: it turns the facts of the exit into the earnings and recoveries that go on the
 * final month's payslip, so the final payslip is computed by the same engine as every other (pro-rated salary to the last working day, PF,
 * ESI, professional tax, and income tax with all the year's remaining tax deducted now).
 *
 * Leave encashment and gratuity are split into an exempt part and a taxable part (sections 10(10AA) and 10(10)); only the taxable part
 * counts as taxable earnings. Recoveries (unserved notice, the outstanding balance of loans, other dues) are taken in full: the 50% limit on
 * deductions does not stop a company recovering what the employee owes from the final payment, so the final payslip is computed with the cap off.
 */
import { computeGratuity, computeLeaveEncashment, type GratuityResult } from "@/lib/products/talentos/payroll/statutory";
import type { StatutoryRates } from "@/lib/products/talentos/payroll/rates";
import type { PayrollAdjustment } from "@/lib/products/talentos/payroll/compute";

export type ExitReason = "resignation" | "retirement" | "termination" | "death" | "disability" | "end_of_contract";

export interface SettlementInput {
  reason: ExitReason;
  joinDate: string;
  exitDate: string;
  /** Last drawn basic + dearness allowance and fixed gross, per month. */
  lastBasicPlusDa: number;
  fixedMonthlyGross: number;
  /** Days of leave the policy pays for at exit (the encashable balance, already limited by the leave type's maximum). */
  leaveDaysToEncash: number;
  /** Days in a month for a day's pay: 30 by convention, or 26. */
  leaveDaysInMonth: number;
  averageMonthlySalary: number;
  /** Notice days the employee did not serve (the policy's notice less the notice given), 0 when served in full. */
  noticeShortfallDays: number;
  loansOutstanding: { loanId: string; name: string; balance: number }[];
  /** Other amounts the company owes or recovers, entered by HR. */
  otherEarnings: { name: string; amount: number; taxable: boolean }[];
  otherRecoveries: { name: string; amount: number }[];
  /** Establishment has 10 or more employees (the Payment of Gratuity Act applies). */
  gratuityCoveredByAct: boolean;
  fixedTerm: boolean;
  /** Pay gratuity at exit (some companies defer it to a separate payment). */
  payGratuity: boolean;
  rates: StatutoryRates;
}

export interface SettlementResult {
  adjustments: PayrollAdjustment[];
  gratuity: GratuityResult | null;
  leaveEncashment: { amount: number; exempt: number; taxable: number };
  noticeRecovery: number;
  loanRecovery: number;
  /** Total of the earnings and recoveries above (not including the final month's salary). */
  netAdjustment: number;
}

const adj = (id: string, kind: "earning" | "deduction", name: string, amount: number, taxable: boolean): PayrollAdjustment => ({ id, kind, name, amount: Math.round(amount), taxable, pf: false, esi: false });

export function buildSettlement(i: SettlementInput): SettlementResult {
  const adjustments: PayrollAdjustment[] = [];

  const encash = computeLeaveEncashment({
    days: i.leaveDaysToEncash,
    basicPlusDa: i.lastBasicPlusDa,
    daysInMonth: i.leaveDaysInMonth,
    averageMonthlySalary: i.averageMonthlySalary,
    onLeaving: true,
    rates: i.rates.leaveEncashment,
  });
  if (encash.exempt > 0) adjustments.push(adj("fnf-leave-exempt", "earning", "Leave encashment (exempt)", encash.exempt, false));
  if (encash.taxable > 0) adjustments.push(adj("fnf-leave-taxable", "earning", "Leave encashment", encash.taxable, true));

  let gratuity: GratuityResult | null = null;
  if (i.payGratuity) {
    gratuity = computeGratuity({
      lastBasicPlusDa: i.lastBasicPlusDa,
      joinDate: i.joinDate,
      exitDate: i.exitDate,
      deathOrDisability: i.reason === "death" || i.reason === "disability",
      fixedTerm: i.fixedTerm,
      coveredByAct: i.gratuityCoveredByAct,
      rates: i.rates.gratuity,
    });
    if (gratuity.eligible) {
      if (gratuity.exempt > 0) adjustments.push(adj("fnf-gratuity-exempt", "earning", "Gratuity (exempt)", gratuity.exempt, false));
      if (gratuity.taxable > 0) adjustments.push(adj("fnf-gratuity-taxable", "earning", "Gratuity", gratuity.taxable, true));
    }
  }

  for (const [n, e] of i.otherEarnings.entries()) if (e.amount > 0) adjustments.push(adj(`fnf-earn-${n}`, "earning", e.name, e.amount, e.taxable));

  const noticeRecovery = Math.round((i.fixedMonthlyGross / 30) * Math.max(0, i.noticeShortfallDays));
  if (noticeRecovery > 0) adjustments.push(adj("fnf-notice", "deduction", `Notice period shortfall (${i.noticeShortfallDays} days)`, noticeRecovery, false));

  let loanRecovery = 0;
  for (const l of i.loansOutstanding) {
    if (l.balance > 0) {
      adjustments.push(adj(`fnf-loan-${l.loanId}`, "deduction", `${l.name}: balance recovered`, l.balance, false));
      loanRecovery += Math.round(l.balance);
    }
  }
  for (const [n, d] of i.otherRecoveries.entries()) if (d.amount > 0) adjustments.push(adj(`fnf-rec-${n}`, "deduction", d.name, d.amount, false));

  const earned = adjustments.filter((a) => a.kind === "earning").reduce((s, a) => s + a.amount, 0);
  const recovered = adjustments.filter((a) => a.kind === "deduction").reduce((s, a) => s + a.amount, 0);
  return { adjustments, gratuity, leaveEncashment: encash, noticeRecovery, loanRecovery, netAdjustment: earned - recovered };
}
