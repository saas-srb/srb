import "server-only";
import { runHealthChecks } from "@/lib/products/cashflow-ai/compliance/health";
import { cleanupReport } from "@/lib/products/cashflow-ai/hygiene";
import { listSettlements } from "@/lib/products/cashflow-ai/payments/settlements";
import { listPendingApprovals } from "@/lib/products/cashflow-ai/approvals";
import { listFilings } from "@/lib/products/cashflow-ai/compliance/filings";
import { listFiscalPeriodState } from "@/lib/products/cashflow-ai/month-close/store";
import type { AutoFact } from "@/lib/products/cashflow-ai/work/catalog";

/**
 * Steps the books can prove themselves. A fact is present only when it could be read AND holds; if it cannot be read, or does not hold, it is
 * absent, and the step stays for a person to tick. (An unreadable fact must never tick a step.)
 */
export type AutoFacts = Partial<Record<Exclude<AutoFact, "month_locked">, true>>;

async function attempt<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function loadAutoFacts(today: string): Promise<AutoFacts> {
  const [checks, clean, settlements, approvals, filings] = await Promise.all([
    attempt(() => runHealthChecks(today)),
    attempt(() => cleanupReport()),
    attempt(() => listSettlements()),
    attempt(() => listPendingApprovals()),
    attempt(() => listFilings()),
  ]);
  const ok = (key: string) => checks?.find((c) => c.key === key)?.level === "ok";
  const f: AutoFacts = {};
  if (ok("bank-lines")) f.bank_matched = true;
  if (ok("receivables")) f.no_overdue_invoices = true;
  if (ok("payables")) f.no_overdue_bills = true;
  if (ok("payroll-dues")) f.payroll_dues_paid = true;
  if (clean) {
    if (clean.billsWithoutDocument.length + clean.receiptsWithoutProof.length + clean.expensesWithoutBill.length === 0) f.no_missing_documents = true;
    if (clean.duplicates.length === 0) f.no_duplicate_bills = true;
    if (clean.unclassified.length === 0) f.no_unclassified_entries = true;
  }
  if (settlements && settlements.every((s) => s.status !== "ready" && s.status !== "review")) f.settlements_recorded = true;
  if (approvals && approvals.length === 0) f.approvals_clear = true;
  if (filings && filings.length > 0) f.filings_filled = true;
  return f;
}

/** Whether the fiscal period for a month (YYYY-MM) is closed. */
export async function isMonthLocked(month: string): Promise<boolean> {
  try {
    return (await listFiscalPeriodState(month)).state === "closed";
  } catch {
    return false;
  }
}

/** Which of a task's steps the books have proved, in step order. `periodKey` is only used for the month-lock step. */
export async function autoTicks(autoKeys: (AutoFact | undefined)[], facts: AutoFacts, monthKey: string | null, periodEnded = false): Promise<boolean[]> {
  const locked = autoKeys.includes("month_locked") && monthKey ? await isMonthLocked(monthKey) : false;
  // The facts describe the books today, so they cannot vouch for a period that is over (only the month lock is tied to its month),
  // and "a filing exists" says nothing about which year it is for.
  return autoKeys.map((k) => (!k ? false : k === "month_locked" ? locked : k === "filings_filled" || periodEnded ? false : facts[k] === true));
}
