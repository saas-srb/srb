import { safeDay } from "@/lib/products/cashflow-ai/accrual/core";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/cashflow-ai/db";
import { listAccounts } from "@/lib/products/cashflow-ai/accounts";
import { getTrialBalance } from "@/lib/products/cashflow-ai/reports/trial-balance";
import { listFiscalPeriods } from "@/lib/products/cashflow-ai/fiscal-periods";
import { BANK_STATEMENT_LINES_COLLECTION } from "@/lib/products/cashflow-ai/bank-reconciliation";
import { overdueInvoices } from "@/lib/products/cashflow-ai/receivables";
import { overdueBills } from "@/lib/products/cashflow-ai/payables";
import { getTaxConfig } from "@/lib/products/cashflow-ai/tax-config";
import { dueOverview } from "@/lib/products/talentos/statutory-dues";
import { cleanupReport } from "@/lib/products/cashflow-ai/hygiene";
import { accrualTieOut, countMissingAccruals } from "@/lib/products/cashflow-ai/accrual/engine";
import { getAccrualSettings } from "@/lib/products/cashflow-ai/accrual/settings";
import { listFilings } from "@/lib/products/cashflow-ai/compliance/filings";
import { filingState } from "@/lib/products/cashflow-ai/compliance/filings-core";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import type { HealthCheck } from "@/lib/products/cashflow-ai/compliance/health-core";

/**
 * "Is anything wrong right now?" — checks read from the live books, so the
 * answer is never a manual tick. Each one is a plain sentence plus where to
 * go to fix it. A check that cannot run says so ("could not be checked")
 * instead of passing quietly.
 */
async function safe(key: string, label: string, href: string | undefined, run: () => Promise<Omit<HealthCheck, "key" | "label" | "href">>): Promise<HealthCheck> {
  try {
    return { key, label, href, ...(await run()) };
  } catch {
    return { key, label, href, level: "unknown", detail: "This could not be checked right now. Try again in a moment." };
  }
}

export async function runHealthChecks(today: string): Promise<HealthCheck[]> {
  return Promise.all([
    safe("coa", "Chart of accounts is set up", "/cashflow-ai/settings/accounts", async () => {
      const n = (await listAccounts()).length;
      return n > 0
        ? { level: "ok", detail: `${n} accounts in the chart of accounts.` }
        : { level: "bad", detail: "No accounts yet. Create the default chart of accounts before recording anything." };
    }),
    safe("accrual", "Books are kept on the accrual basis", "/cashflow-ai/settings/accrual", async () => {
      if (!(await getAccrualSettings())) return { level: "warn", detail: "Invoices and bills are not yet posted when raised: the ledger records only money received and paid. A company's books must be on the accrual basis; ask your CA and switch it on." };
      const [tie, missing] = await Promise.all([accrualTieOut(), countMissingAccruals()]);
      if (!tie) return { level: "unknown", detail: "Accrual books are on but could not be compared with the records." };
      const off = Math.abs(tie.receivable.difference) >= 0.01 || Math.abs(tie.payable.difference) >= 0.01;
      if (off) return { level: "bad", detail: `The ledger and the invoice / bill records differ (receivable ${tie.receivable.difference.toFixed(2)}, payable ${tie.payable.difference.toFixed(2)}).` };
      if (missing) return { level: "warn", detail: `${missing} document${missing === 1 ? " is" : "s are"} not yet in the ledger.` };
      return { level: "ok", detail: "On, and the ledger agrees with the invoice and bill records." };
    }),
    safe("trial-balance", "Trial balance balances", "/cashflow-ai/trial-balance", async () => {
      const tb = await getTrialBalance();
      return tb.balanced
        ? { level: "ok", detail: "Total debits equal total credits." }
        : { level: "bad", detail: `Debits ${formatMoney(tb.totalDebits)} and credits ${formatMoney(tb.totalCredits)} differ. Ask your CA before closing anything.` };
    }),
    safe("bank-lines", "Bank statement lines are matched", "/cashflow-ai/bank-reconciliation", async () => {
      const db = await getDb();
      const open = await db
        .collection(BANK_STATEMENT_LINES_COLLECTION)
        .countDocuments({ ...notDeleted, status: { $in: ["unmatched", "partially_matched", "duplicate", "needs_review"] } });
      return open === 0
        ? { level: "ok", detail: "Every imported bank line is matched." }
        : { level: "warn", detail: `${open} bank line${open === 1 ? "" : "s"} still need matching or review.` };
    }),
    safe("periods", "Finished months are locked", "/cashflow-ai/settings/fiscal-periods", async () => {
      const periods = await listFiscalPeriods();
      if (periods.length === 0) return { level: "warn", detail: "No fiscal period is defined yet, so no month can be locked." };
      const stale = periods.filter((p) => p.status === "open" && (safeDay(p.endDate) ?? "9999-12-31") < today);
      return stale.length === 0
        ? { level: "ok", detail: "No finished period is left open." }
        : { level: "warn", detail: `Still open although finished: ${stale.map((p) => p.name).join(", ")}. Lock them once reviewed.` };
    }),
    safe("cleanup", "Bills, duplicates and unclassified entries", "/cashflow-ai/compliance/cleanup", async () => {
      const c = await cleanupReport();
      const parts = [
        c.duplicates.length && `${c.duplicates.length} set${c.duplicates.length === 1 ? "" : "s"} of possible duplicate bills`,
        (c.billsWithoutDocument.length + c.receiptsWithoutProof.length + c.expensesWithoutBill.length) > 0 && `${c.billsWithoutDocument.length} bills, ${c.receiptsWithoutProof.length} receipts and ${c.expensesWithoutBill.length} expenses without a document`,
        c.unclassified.length && `${c.unclassified.length} entr${c.unclassified.length === 1 ? "y" : "ies"} without an account`,
      ].filter(Boolean);
      return parts.length === 0 ? { level: "ok", detail: "No duplicate bills, every bill has its document, every entry has an account." } : { level: c.duplicates.some((d) => d.kind === "exact") ? "bad" : "warn", detail: `${parts.join("; ")}.` };
    }),
    safe("receivables", "Overdue customer invoices", "/cashflow-ai/receivables", async () => {
      const o = await overdueInvoices();
      return o.count === 0 ? { level: "ok", detail: "Nothing overdue." } : { level: "warn", detail: `${o.count} invoice${o.count === 1 ? "" : "s"} overdue, ${formatMoney(o.amount)} to collect.` };
    }),
    safe("payables", "Overdue vendor bills", "/cashflow-ai/payables", async () => {
      const o = await overdueBills();
      return o.count === 0 ? { level: "ok", detail: "Nothing overdue." } : { level: "warn", detail: `${o.count} bill${o.count === 1 ? "" : "s"} overdue, ${formatMoney(o.amount)} to pay.` };
    }),
    safe("tax-rates", "GST rates are configured", "/cashflow-ai/settings/tax-config", async () => {
      const cfg = await getTaxConfig();
      const active = cfg.rates.filter((r) => r.isActive).length;
      return active > 0 ? { level: "ok", detail: `${active} active tax rates.` } : { level: "bad", detail: "No active tax rate. Invoices cannot charge GST." };
    }),
    safe("payroll-dues", "Payroll government dues paid on time", "/talentos/payroll/compliance", async () => {
      const overview = await dueOverview();
      const overdue = overview.reduce((n, m) => n + m.overdue, 0);
      if (overview.length === 0) return { level: "ok", detail: "No approved payroll yet, so nothing is due." };
      return overdue === 0 ? { level: "ok", detail: "No payroll due is overdue." } : { level: "bad", detail: `${overdue} payroll due${overdue === 1 ? " is" : "s are"} overdue (PF, ESI, TDS, PT or LWF).` };
    }),
    safe("filings", "Filing calendar is up to date", "/cashflow-ai/compliance/calendar", async () => {
      const filings = await listFilings();
      if (filings.length === 0) return { level: "warn", detail: "Your filing calendar is empty: tap Fill in my filing calendar." };
      const states = filings.map((f) => filingState(f, today));
      const overdue = states.filter((s) => s === "overdue").length;
      const noDate = states.filter((s) => s === "no_date").length;
      if (overdue > 0) return { level: "bad", detail: `${overdue} filing${overdue === 1 ? " is" : "s are"} past the due date and not marked filed.` };
      if (noDate > 0) return { level: "warn", detail: `${noDate} filing${noDate === 1 ? " has" : "s have"} no due date yet. Add the date, or tap Fill in my filing calendar.` };
      return { level: "ok", detail: "Every filing has a date and none is overdue." };
    }),
  ]);
}
