import { can as accessCan, type AccessSubject } from "@/lib/access/can";
import { microByKey } from "@/lib/access/micro";

/**
 * CashFlow access from the person's micro features. Pure (no server-only imports) so server pages, actions, routes and the menu flags all use one rule.
 * The old capability names (`canManageTransactions`, `canViewBanking` ...) keep their meaning but answer from the person's access:
 * the write capabilities are one feature each; the "view" capabilities mean "may open any page of that group".
 */
export type FmsHolder = { subject: AccessSubject };

const PRODUCT = "cashflow-ai";

/** The one check. `key` is `<module>.<feature>` without the product, e.g. "customers.view". An unknown key is never allowed. */
export function fmsCan(holder: FmsHolder, key: string): boolean {
  const full = `${PRODUCT}.${key}`;
  const m = microByKey(full);
  return Boolean(m) && accessCan(holder.subject, PRODUCT, full, m!.level);
}
const any = (h: FmsHolder, keys: string[]) => keys.some((k) => fmsCan(h, k));

export const COMMERCIAL_VIEWS = ["customers.view", "vendors.view", "invoices.view", "receipts.view", "creditnotes.view", "debitnotes.view", "bills.view", "payables.view", "receivables.view", "payments.view", "paymentlinks.view", "refunds.view"];
export const STATEMENT_VIEWS = ["reports.view", "ledger.view", "trialbalance.view", "taxes.view", "gst.view", "tds.view", "incometax.view", "compliance.view", "monthclose.view"];
export const BANKING_VIEWS = ["bankaccounts.view", "cashaccounts.view", "bankrecon.view", "cashrecon.view", "settlements.view", "transfers.view"];
export const PAYROLL_VIEWS = ["payrollruns.view", "salarypayments.view"];

export const canViewCommercialFinance = (h: FmsHolder) => any(h, COMMERCIAL_VIEWS);
export const canViewFinancialStatements = (h: FmsHolder) => any(h, STATEMENT_VIEWS);
export const canViewBanking = (h: FmsHolder) => any(h, BANKING_VIEWS);
export const canViewPayrollFinance = (h: FmsHolder) => any(h, PAYROLL_VIEWS);
export const canManageTransactions = (h: FmsHolder) => fmsCan(h, "transactions.manage");
export const canApproveTransactions = (h: FmsHolder) => fmsCan(h, "transactions.approve");
export const canManageAccounts = (h: FmsHolder) => fmsCan(h, "accounts.manage");
export const canManageTaxConfig = (h: FmsHolder) => fmsCan(h, "tax.manage");
export const canManageFiscalPeriods = (h: FmsHolder) => fmsCan(h, "periods.manage");
export const canManageCompliance = (h: FmsHolder) => fmsCan(h, "compliance.manage");
export const canManageBanking = (h: FmsHolder) => fmsCan(h, "banking.manage");
export const canReconcile = (h: FmsHolder) => fmsCan(h, "banking.reconcile");
export const canManagePaymentLinks = (h: FmsHolder) => fmsCan(h, "paymentlinks.manage");
export const canRefundPayments = (h: FmsHolder) => fmsCan(h, "refunds.pay");
export const canViewReports = (h: FmsHolder) => fmsCan(h, "reports.export");
export const canViewAuditLog = (h: FmsHolder) => fmsCan(h, "audit.view");
export const isFmsAdmin = (h: FmsHolder) => fmsCan(h, "payouts.admin");

/** Who may move a refund from one status to the next: deciding a request belongs to the approver, running it to whoever may refund payments. */
export function canMoveRefund(h: FmsHolder, from: string, to: string): boolean {
  const decision = from === "requested" && (to === "approved" || to === "failed");
  return decision ? canApproveTransactions(h) : canRefundPayments(h);
}
