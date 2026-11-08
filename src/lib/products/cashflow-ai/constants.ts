/**
 * Client-safe FMS constants and pure helpers. NEVER import `server-only` here —
 * this module is imported by client components (badges, forms, tables). Server
 * modules re-export from here where convenient.
 *
 * Money convention mirrors `src/lib/spendiq/constants.ts` exactly: plain
 * rupee-unit `number`, `round2()` before every persist, a `currency` field per
 * document. No Decimal/BigInt/cents — staying consistent with every other
 * module in the platform.
 */

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

export const DEFAULT_CURRENCY = "INR";
export const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "AED"] as const;

export function isSupportedCurrency(value: unknown): boolean {
  return typeof value === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(value.toUpperCase());
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  AED: "د.إ",
};

export function currencySymbol(code: string | undefined): string {
  return CURRENCY_SYMBOLS[(code ?? DEFAULT_CURRENCY).toUpperCase()] ?? "";
}

/** e.g. formatMoney(1234.5, "INR") -> "₹1,234.50" */
export function formatMoney(amount: number | null | undefined, code = DEFAULT_CURRENCY): string {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  const symbol = currencySymbol(code);
  const locale = code === "INR" ? "en-IN" : "en-US";
  return `${symbol}${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/**
 * Invoice balance is never persisted — always derived so it can't drift from
 * its inputs. Lives here (not in `fms/invoices.ts`, which has `import
 * "server-only"` and touches mongodb) specifically so client components can
 * import it directly without pulling the mongodb driver into the browser
 * bundle — importing ANY runtime export from a `server-only` file into a
 * `"use client"` component drags its whole module graph along, which Next.js
 * refuses to bundle.
 */
export function invoiceBalance(inv: { totalAmount: number; amountPaid: number; amountCredited: number }): number {
  return round2(inv.totalAmount - inv.amountPaid - inv.amountCredited);
}

// ---------------------------------------------------------------------------
// Transaction type & status (§5)
// ---------------------------------------------------------------------------

export const TRANSACTION_TYPES = [
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "transfer", label: "Transfer" },
  { value: "adjustment", label: "Adjustment" },
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number]["value"];

export function isValidTransactionType(value: unknown): value is TransactionType {
  return typeof value === "string" && TRANSACTION_TYPES.some((t) => t.value === value);
}

export const TRANSACTION_STATUSES = [
  { value: "draft", label: "Draft", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50", open: true },
  { value: "pending_approval", label: "Pending Approval", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500", open: true },
  { value: "approved", label: "Approved", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500", open: true },
  { value: "scheduled", label: "Scheduled", badgeClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400", dotClass: "bg-purple-500", open: true },
  { value: "processing", label: "Processing", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50", open: true },
  { value: "completed", label: "Completed", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500", open: false },
  { value: "failed", label: "Failed", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive", open: false },
  { value: "cancelled", label: "Cancelled", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50", open: false },
  { value: "rejected", label: "Rejected", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive", open: false },
  { value: "reversed", label: "Reversed", badgeClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400", dotClass: "bg-orange-500", open: false },
  { value: "reconciled", label: "Reconciled", badgeClass: "bg-primary/10 text-primary", dotClass: "bg-primary/70", open: false },
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]["value"];

export function isValidTransactionStatus(value: unknown): value is TransactionStatus {
  return typeof value === "string" && TRANSACTION_STATUSES.some((s) => s.value === value);
}
export function getStatusMeta(value: string | undefined) {
  return TRANSACTION_STATUSES.find((s) => s.value === value) ?? TRANSACTION_STATUSES[0];
}

/**
 * Controlled state transitions (§5: "Use controlled state transitions").
 * `rejected`, `cancelled`, `failed` and `reversed` are terminal — correcting
 * a mistake means raising a new transaction, never mutating a closed one.
 */
export const TRANSACTION_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "rejected", "cancelled"],
  approved: ["scheduled", "processing", "completed", "cancelled"],
  scheduled: ["processing", "cancelled"],
  processing: ["completed", "failed"],
  completed: ["reconciled", "reversed"],
  failed: ["cancelled"],
  cancelled: [],
  rejected: [],
  reversed: [],
  reconciled: ["reversed"],
};

export function canTransitionTransaction(from: TransactionStatus, to: TransactionStatus): boolean {
  return TRANSACTION_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Payment methods (§24)
// ---------------------------------------------------------------------------

export const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "upi", label: "UPI" },
  { value: "credit_card", label: "Credit Card" },
  { value: "debit_card", label: "Debit Card" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "neft", label: "NEFT" },
  { value: "rtgs", label: "RTGS" },
  { value: "imps", label: "IMPS" },
  { value: "payment_gateway", label: "Payment Gateway" },
  { value: "other", label: "Other" },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export function isValidPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && PAYMENT_METHODS.some((m) => m.value === value);
}
export function paymentMethodLabel(value: string | undefined | null): string {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? "—";
}

// ---------------------------------------------------------------------------
// Source modules (§5 "Source Module" — where a transaction originated)
// ---------------------------------------------------------------------------

export const SOURCE_MODULES = [
  { value: "fms", label: "CashFlow (Manual Entry)" },
  { value: "hrms", label: "TalentOS" },
  { value: "pms", label: "SprintOS" },
  { value: "prms", label: "SpendIQ" },
  { value: "tms", label: "Cohort AI" },
  { value: "lms", label: "DealFlow" },
] as const;
export type SourceModule = (typeof SOURCE_MODULES)[number]["value"];

export function isValidSourceModule(value: unknown): value is SourceModule {
  return typeof value === "string" && SOURCE_MODULES.some((m) => m.value === value);
}
export function sourceModuleLabel(value: string | undefined | null): string {
  return SOURCE_MODULES.find((m) => m.value === value)?.label ?? value ?? "—";
}

// ---------------------------------------------------------------------------
// Invoices (§7)
// ---------------------------------------------------------------------------

export const INVOICE_STATUSES = [
  { value: "draft", label: "Draft", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50" },
  { value: "sent", label: "Sent", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500" },
  { value: "partially_paid", label: "Partially Paid", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
  { value: "paid", label: "Paid", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "overdue", label: "Overdue", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive" },
  { value: "cancelled", label: "Cancelled", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50" },
  { value: "void", label: "Void", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50" },
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]["value"];
export const DEFAULT_INVOICE_STATUS: InvoiceStatus = "draft";

export function isValidInvoiceStatus(value: unknown): value is InvoiceStatus {
  return typeof value === "string" && INVOICE_STATUSES.some((s) => s.value === value);
}
export function getInvoiceStatusMeta(value: string | undefined) {
  return INVOICE_STATUSES.find((s) => s.value === value) ?? INVOICE_STATUSES[0];
}

/** `overdue` is reachable manually or is derived for reporting from `dueDate`; never automatic on write. */
export const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["sent", "cancelled", "void"],
  sent: ["partially_paid", "paid", "overdue", "cancelled", "void"],
  partially_paid: ["paid", "overdue", "cancelled"],
  overdue: ["partially_paid", "paid", "cancelled"],
  paid: [],
  cancelled: [],
  void: [],
};
export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return INVOICE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Payment Receipts (§8)
// ---------------------------------------------------------------------------

export const RECEIPT_STATUSES = [
  { value: "completed", label: "Completed", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "voided", label: "Voided", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50" },
] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number]["value"];

// ---------------------------------------------------------------------------
// Refunds (§26)
// ---------------------------------------------------------------------------

export const REFUND_STATUSES = [
  { value: "requested", label: "Requested", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50" },
  { value: "approved", label: "Approved", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500" },
  { value: "processing", label: "Processing", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
  { value: "completed", label: "Completed", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "failed", label: "Failed", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive" },
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number]["value"];
export const DEFAULT_REFUND_STATUS: RefundStatus = "requested";

export function isValidRefundStatus(value: unknown): value is RefundStatus {
  return typeof value === "string" && REFUND_STATUSES.some((s) => s.value === value);
}
export function getRefundStatusMeta(value: string | undefined) {
  return REFUND_STATUSES.find((s) => s.value === value) ?? REFUND_STATUSES[0];
}

export const REFUND_TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  requested: ["approved", "failed"],
  approved: ["processing", "failed"],
  processing: ["completed", "failed"],
  completed: [],
  failed: [],
};
export function canTransitionRefund(from: RefundStatus, to: RefundStatus): boolean {
  return REFUND_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Credit Notes (§27) / Debit Notes (§27)
// ---------------------------------------------------------------------------

export const NOTE_STATUSES = [
  { value: "draft", label: "Draft", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50" },
  { value: "issued", label: "Issued", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "cancelled", label: "Cancelled", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive" },
] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number]["value"];
export const DEFAULT_NOTE_STATUS: NoteStatus = "draft";

export function isValidNoteStatus(value: unknown): value is NoteStatus {
  return typeof value === "string" && NOTE_STATUSES.some((s) => s.value === value);
}
export function getNoteStatusMeta(value: string | undefined) {
  return NOTE_STATUSES.find((s) => s.value === value) ?? NOTE_STATUSES[0];
}

// ---------------------------------------------------------------------------
// Aging buckets (§9 / §10)
// ---------------------------------------------------------------------------

export const AGING_BUCKET_LABELS = ["Current", "1-30 days", "31-60 days", "61-90 days", "90+ days"] as const;

/** `daysOverdue` <= 0 means not yet due. */
export function agingBucketFor(daysOverdue: number): string {
  if (daysOverdue <= 0) return "Current";
  if (daysOverdue <= 30) return "1-30 days";
  if (daysOverdue <= 60) return "31-60 days";
  if (daysOverdue <= 90) return "61-90 days";
  return "90+ days";
}

// ---------------------------------------------------------------------------
// Chart of Accounts (§29 — minimal Phase 1 subset)
// ---------------------------------------------------------------------------

export const ACCOUNT_TYPES = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number]["value"];

export function isValidAccountType(value: unknown): value is AccountType {
  return typeof value === "string" && ACCOUNT_TYPES.some((t) => t.value === value);
}

/** Debit-normal (asset/expense) vs credit-normal (liability/equity/income) — §28/§29. */
export function normalBalanceSide(type: AccountType): "debit" | "credit" {
  return type === "asset" || type === "expense" ? "debit" : "credit";
}

// ---------------------------------------------------------------------------
// Employee Advances (§12 — genuinely new, nothing exists in HRMS for this)
// ---------------------------------------------------------------------------

export const ADVANCE_STATUSES = [
  { value: "requested", label: "Requested", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50" },
  { value: "approved", label: "Approved", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500" },
  { value: "disbursed", label: "Disbursed", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
  { value: "repaid", label: "Repaid", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "rejected", label: "Rejected", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive" },
] as const;
export type AdvanceStatus = (typeof ADVANCE_STATUSES)[number]["value"];
export const DEFAULT_ADVANCE_STATUS: AdvanceStatus = "requested";

export function isValidAdvanceStatus(value: unknown): value is AdvanceStatus {
  return typeof value === "string" && ADVANCE_STATUSES.some((s) => s.value === value);
}
export function getAdvanceStatusMeta(value: string | undefined) {
  return ADVANCE_STATUSES.find((s) => s.value === value) ?? ADVANCE_STATUSES[0];
}

export const ADVANCE_TRANSITIONS: Record<AdvanceStatus, AdvanceStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["disbursed", "rejected"],
  disbursed: ["repaid"],
  repaid: [],
  rejected: [],
};
export function canTransitionAdvance(from: AdvanceStatus, to: AdvanceStatus): boolean {
  return ADVANCE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Bank & Cash Accounts (§19, §21 — genuinely new, no company-level account
// concept exists anywhere in the platform)
// ---------------------------------------------------------------------------

export const FUND_ACCOUNT_TYPES = [
  { value: "bank", label: "Bank" },
  { value: "cash", label: "Cash" },
] as const;
export type FundAccountType = (typeof FUND_ACCOUNT_TYPES)[number]["value"];

export function isValidFundAccountType(value: unknown): value is FundAccountType {
  return typeof value === "string" && FUND_ACCOUNT_TYPES.some((t) => t.value === value);
}

export const FUND_ACCOUNT_STATUSES = [
  { value: "active", label: "Active", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "inactive", label: "Inactive", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
  { value: "closed", label: "Closed", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50" },
] as const;
export type FundAccountStatus = (typeof FUND_ACCOUNT_STATUSES)[number]["value"];
export const DEFAULT_FUND_ACCOUNT_STATUS: FundAccountStatus = "active";

export function isValidFundAccountStatus(value: unknown): value is FundAccountStatus {
  return typeof value === "string" && FUND_ACCOUNT_STATUSES.some((s) => s.value === value);
}
export function getFundAccountStatusMeta(value: string | undefined) {
  return FUND_ACCOUNT_STATUSES.find((s) => s.value === value) ?? FUND_ACCOUNT_STATUSES[0];
}

// ---------------------------------------------------------------------------
// Asset Expenses (§14 — genuinely new, no ongoing/recurring asset cost
// concept exists anywhere in PRMS or FMS). Lives here (not in
// `fms/asset-expenses.ts`, which has `import "server-only"`) so client
// components can import it directly — same rule `invoiceBalance` follows.
// ---------------------------------------------------------------------------

export type AssetExpenseCategory = "maintenance" | "insurance" | "amc" | "other";

export const ASSET_EXPENSE_CATEGORIES: { value: AssetExpenseCategory; label: string }[] = [
  { value: "maintenance", label: "Maintenance" },
  { value: "insurance", label: "Insurance" },
  { value: "amc", label: "AMC / Service Contract" },
  { value: "other", label: "Other" },
];

export function isValidAssetExpenseCategory(value: unknown): value is AssetExpenseCategory {
  return typeof value === "string" && ASSET_EXPENSE_CATEGORIES.some((c) => c.value === value);
}

// ---------------------------------------------------------------------------
// Bank Reconciliation (§20)
// ---------------------------------------------------------------------------

export const STATEMENT_LINE_STATUSES = [
  { value: "unmatched", label: "Unmatched", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50" },
  { value: "matched", label: "Matched", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "partially_matched", label: "Partially Matched", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
  { value: "duplicate", label: "Duplicate", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive" },
  { value: "needs_review", label: "Needs Review", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500" },
] as const;
export type StatementLineStatus = (typeof STATEMENT_LINE_STATUSES)[number]["value"];
export const DEFAULT_STATEMENT_LINE_STATUS: StatementLineStatus = "unmatched";

export function isValidStatementLineStatus(value: unknown): value is StatementLineStatus {
  return typeof value === "string" && STATEMENT_LINE_STATUSES.some((s) => s.value === value);
}
export function getStatementLineStatusMeta(value: string | undefined) {
  return STATEMENT_LINE_STATUSES.find((s) => s.value === value) ?? STATEMENT_LINE_STATUSES[0];
}
