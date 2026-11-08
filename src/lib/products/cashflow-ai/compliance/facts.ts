import { safeDay } from "@/lib/products/cashflow-ai/accrual/core";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/cashflow-ai/db";
import { getTrialBalance } from "@/lib/products/cashflow-ai/reports/trial-balance";
import { listFiscalPeriods } from "@/lib/products/cashflow-ai/fiscal-periods";
import { BANK_STATEMENT_LINES_COLLECTION } from "@/lib/products/cashflow-ai/bank-reconciliation";
import { INVOICES_COLLECTION } from "@/lib/products/cashflow-ai/invoices";
import { overdueInvoices } from "@/lib/products/cashflow-ai/receivables";
import { overdueBills } from "@/lib/products/cashflow-ai/payables";
import { dueOverview } from "@/lib/products/talentos/statutory-dues";
import { PAYROLL_RUNS_COLLECTION } from "@/lib/products/talentos/payroll-run";
import { cleanupReport } from "@/lib/products/cashflow-ai/hygiene";
import { listFilings } from "@/lib/products/cashflow-ai/compliance/filings";
import type { ComplianceFacts } from "@/lib/products/cashflow-ai/compliance/auto-core";

/** "YYYY-MM" of the month before `today` (a YYYY-MM-DD). */
export function previousMonth(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Reads the live books for the checklist's auto signals. Anything that cannot
 * be read is returned as `null` for that part so no signal is given — an
 * unreadable fact must never turn into "verified".
 */
export async function gatherFacts(today: string): Promise<Partial<ComplianceFacts>> {
  const db = await getDb();
  const attempt = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch {
      return null;
    }
  };

  const [bankTotal, bankOpen, periods, inv, bills, dup, tb, overview, prevRun, filings, clean] = await Promise.all([
    attempt(() => db.collection(BANK_STATEMENT_LINES_COLLECTION).countDocuments({ ...notDeleted })),
    attempt(() => db.collection(BANK_STATEMENT_LINES_COLLECTION).countDocuments({ ...notDeleted, status: { $in: ["unmatched", "partially_matched", "duplicate", "needs_review"] } })),
    attempt(() => listFiscalPeriods()),
    attempt(() => overdueInvoices()),
    attempt(() => overdueBills()),
    attempt(async () => {
      const rows = await db
        .collection(INVOICES_COLLECTION)
        .aggregate([{ $match: { ...notDeleted, invoiceNumber: { $type: "string" } } }, { $group: { _id: "$invoiceNumber", n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $count: "dups" }])
        .toArray();
      return (rows[0]?.dups as number | undefined) ?? 0;
    }),
    attempt(() => getTrialBalance()),
    attempt(() => dueOverview()),
    attempt(() => db.collection(PAYROLL_RUNS_COLLECTION).countDocuments({ month: previousMonth(today), status: { $in: ["approved", "paid"] } })),
    attempt(() => listFilings()),
    attempt(() => cleanupReport()),
  ]);

  const facts: Partial<ComplianceFacts> = {};
  if (bankTotal !== null && bankOpen !== null) Object.assign(facts, { bankLinesTotal: bankTotal, bankLinesOpen: bankOpen });
  if (periods) Object.assign(facts, { periodsDefined: periods.length, periodsOpenButFinished: periods.filter((p) => p.status === "open" && (safeDay(p.endDate) ?? "9999-12-31") < today).length });
  if (inv) facts.overdueInvoices = inv.count;
  if (bills) facts.overdueBills = bills.count;
  if (dup !== null) facts.duplicateInvoiceNumbers = dup;
  if (tb) facts.trialBalanceBalanced = tb.balanced;
  if (overview) Object.assign(facts, { payrollMonths: overview.length, payrollDuesOverdue: overview.reduce((n, m) => n + m.overdue, 0) });
  if (prevRun !== null) facts.previousMonthPayrollApproved = prevRun > 0;
  if (filings) Object.assign(facts, { filingsTotal: filings.length, filingsWithoutDate: filings.filter((f) => f.status === "pending" && !f.dueDate).length });
  if (clean) Object.assign(facts, { billsWithoutDocument: clean.billsWithoutDocument.length, receiptsWithoutProof: clean.receiptsWithoutProof.length, expensesWithoutBill: clean.expensesWithoutBill.length, duplicateBillGroups: clean.duplicates.length, unclassifiedEntries: clean.unclassified.length });
  return facts;
}
