import type { MicroFeature } from "./types";

const P = "cashflow-ai";
type Row = [short: string, module: string, kind: MicroFeature["kind"], label: string, description: string, level: "read" | "write", legacy: string[], scope?: "all"];

/** What everybody given CashFlow gets: the dashboard (which shows only what their other features allow). */
const BASELINE = new Set(["dashboard.view"]);

const COMMERCIAL = ["fms.canViewCommercialFinance"];
const STATEMENTS = ["fms.canViewFinancialStatements"];
const BANKING = ["fms.canViewBanking"];
const PAYROLL = ["fms.canViewPayrollFinance"];
const OPEN = ["fms.hasFmsAccess"];

/** [short, module, label, description] pages grouped by who may open them today. */
const views = (legacy: string[], rows: [string, string, string, string][]): Row[] => rows.map(([short, module, label, description]) => [short, module, "page", label, description, "read", legacy] as Row);

const ROWS: Row[] = [
  ["dashboard.view", "Dashboard", "page", "Open the dashboard", "Open the CashFlow dashboard with the numbers of the areas the person can see.", "read", OPEN],
  ...views(COMMERCIAL, [
    ["customers.view", "Customers", "See customers", "Open the customer list and a customer's account."],
    ["vendors.view", "Vendors", "See vendors", "Open the vendor list and a vendor's account."],
    ["invoices.view", "Invoices", "See invoices", "Open sales invoices."],
    ["receipts.view", "Receipts", "See receipts", "Open payment receipts."],
    ["creditnotes.view", "Credit notes", "See credit notes", "Open credit notes."],
    ["debitnotes.view", "Debit notes", "See debit notes", "Open debit notes."],
    ["bills.view", "Bills", "See bills", "Open purchase bills."],
    ["payables.view", "Payables", "See payables", "Open what is owed to vendors."],
    ["receivables.view", "Receivables", "See receivables", "Open what customers owe."],
    ["payments.view", "Payments", "See payments", "Open online payments."],
    ["paymentlinks.view", "Payment links", "See payment links", "Open payment links."],
    ["refunds.view", "Refunds", "See refunds", "Open refund requests."],
  ]),
  ...views(STATEMENTS, [
    ["reports.view", "Reports", "Open reports", "Open financial reports."],
    ["ledger.view", "Ledger", "See the general ledger", "Open the general ledger."],
    ["trialbalance.view", "Ledger", "See the trial balance", "Open the trial balance."],
    ["taxes.view", "Taxes", "Open the taxes overview", "Open the taxes overview."],
    ["gst.view", "GST", "See GST", "Open GST returns and reconciliation."],
    ["tds.view", "TDS", "See TDS", "Open TDS deductions, returns and certificates."],
    ["incometax.view", "Income tax", "See income tax", "Open income tax computation and filings."],
    ["compliance.view", "Compliance", "See the compliance calendar", "Open the compliance calendar and filings."],
    ["monthclose.view", "Month close", "See month close", "Open the month-end and year-end close."],
  ]),
  ...views(BANKING, [
    ["bankaccounts.view", "Bank & cash", "See bank accounts", "Open bank accounts and their balances."],
    ["cashaccounts.view", "Bank & cash", "See cash accounts", "Open cash accounts."],
    ["bankrecon.view", "Bank & cash", "See bank reconciliation", "Open bank reconciliation."],
    ["cashrecon.view", "Bank & cash", "See cash reconciliation", "Open cash counts and reconciliation."],
    ["settlements.view", "Bank & cash", "See settlements", "Open payment gateway settlements."],
    ["transfers.view", "Bank & cash", "See fund transfers", "Open transfers between accounts."],
  ]),
  ...views(PAYROLL, [
    ["payrollruns.view", "Payroll finance", "See payroll runs", "Open payroll runs (HR pay data)."],
    ["salarypayments.view", "Payroll finance", "See salary payments", "Open salary payments."],
  ]),
  ...views(OPEN, [
    ["transactions.view", "Transactions", "See transactions", "Open the transaction list."],
    ["approvals.view", "Approvals", "See approvals", "Open the approvals list."],
    ["advances.view", "Employee advances", "See employee advances", "Open employee advances."],
    ["employeeexpenses.view", "Employee expenses", "See employee expenses", "Open employee expense claims."],
    ["assets.view", "Fixed assets", "See fixed assets", "Open fixed assets, their expenses and disposals."],
    ["beneficiaries.view", "Beneficiaries", "See beneficiaries", "Open payment beneficiaries."],
    ["payouts.view", "Payouts", "See payouts", "Open payouts."],
  ]),
  ["products.view", "Products", "page", "See the other products' summaries", "Open the SpendIQ, SprintOS and Cohort AI summaries shown inside CashFlow.", "read", OPEN],
  ["settings.view", "Settings", "page", "Open settings pages", "Open the settings pages (changing anything needs its own feature).", "read", OPEN],
  ["transactions.manage", "Transactions", "button", "Create and edit financial records", "Create and edit transactions, invoices, bills, receipts, credit and debit notes, advances, expenses, assets and transfers.", "write", ["fms.canManageTransactions"]],
  ["transactions.approve", "Transactions", "button", "Approve and reject", "Move a transaction or note through approval, and decide refund requests.", "write", ["fms.canApproveTransactions"]],
  ["accounts.manage", "Settings", "button", "Manage the chart of accounts and settings", "Edit the chart of accounts and other CashFlow settings.", "write", ["fms.canManageAccounts"]],
  ["tax.manage", "Settings", "button", "Manage tax configuration", "Edit tax rates and configuration.", "write", ["fms.canManageTaxConfig"]],
  ["periods.manage", "Settings", "button", "Manage fiscal periods", "Open, close and lock fiscal periods.", "write", ["fms.canManageFiscalPeriods"]],
  ["compliance.manage", "Compliance", "button", "Manage compliance", "File and record GST, TDS and income tax compliance.", "write", ["fms.canManageCompliance"]],
  ["banking.manage", "Bank & cash", "button", "Manage bank and cash", "Create and edit bank and cash accounts and record transfers.", "write", ["fms.canManageBanking"]],
  ["banking.reconcile", "Bank & cash", "button", "Reconcile", "Enter and match bank statement lines and record cash counts.", "write", ["fms.canReconcile"]],
  ["paymentlinks.manage", "Payment links", "button", "Manage payment links", "Create and manage payment links.", "write", ["fms.canManagePaymentLinks"]],
  ["refunds.pay", "Refunds", "button", "Process refunds", "Process, complete or fail an approved refund (this posts the money-out entry).", "write", ["fms.canRefundPayments"]],
  ["payouts.admin", "Payouts", "button", "Administer payouts", "Retry and manage payouts (CashFlow administrators).", "write", ["fms.isFmsAdmin"]],
  ["vendorcontrols.manage", "Vendors", "page", "Manage vendor controls", "Open and change vendor payment controls and verification.", "write", ["fms.canManageTransactions"]],
  ["reports.export", "Reports", "export", "Download reports", "Download financial reports and the full dashboard detail (also what the report exports and the AI report runs need).", "read", ["fms.canViewReports"]],
  ["audit.view", "Activity log", "page", "Read the activity log", "Read the CashFlow audit trail.", "read", ["fms.canViewAuditLog"]],
];

export const CASHFLOW_MICRO: MicroFeature[] = ROWS.map(([short, module, kind, label, description, level, legacy, scope]) => ({
  key: `${P}.${short}`, product: P, module, kind, label, description, level, legacy, ...(scope ? { scope } : {}), ...(BASELINE.has(short) ? { baseline: true } : {}),
}));
