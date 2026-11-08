/**
 * Client-safe PRMS constants and pure helpers. NEVER import `server-only` here —
 * this module is imported by client components (badges, forms, tables). Server
 * modules re-export from here where convenient.
 *
 * Badge/dot class shapes mirror `src/lib/sprintos/constants.ts` so the shared badge
 * styling applies unchanged.
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

// ---------------------------------------------------------------------------
// Priority (requisitions, expenses)
// ---------------------------------------------------------------------------

export const PRIORITIES = [
  { value: "low", label: "Low", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50", weight: 1 },
  { value: "medium", label: "Medium", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500", weight: 2 },
  { value: "high", label: "High", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500", weight: 3 },
  { value: "urgent", label: "Urgent", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive", weight: 4 },
] as const;

export type Priority = (typeof PRIORITIES)[number]["value"];
export const DEFAULT_PRIORITY: Priority = "medium";

export function isValidPriority(value: unknown): value is Priority {
  return typeof value === "string" && PRIORITIES.some((p) => p.value === value);
}
export function getPriorityMeta(value: string | undefined) {
  return PRIORITIES.find((p) => p.value === value) ?? PRIORITIES[1];
}

// ---------------------------------------------------------------------------
// Purchase Requisition workflow
//   draft → submitted → manager_approval → procurement_review → approved → converted
//   (any non-terminal state → rejected)
// ---------------------------------------------------------------------------

export const REQUISITION_STATUSES = [
  { value: "draft", label: "Draft", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50", open: true },
  { value: "submitted", label: "Submitted", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50", open: true },
  { value: "manager_approval", label: "Manager Approval", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500", open: true },
  { value: "procurement_review", label: "Procurement Review", badgeClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400", dotClass: "bg-purple-500", open: true },
  { value: "approved", label: "Approved", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500", open: false },
  { value: "converted", label: "Converted", badgeClass: "bg-primary/10 text-primary", dotClass: "bg-primary/70", open: false },
  { value: "rejected", label: "Rejected", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive", open: false },
] as const;

export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number]["value"];
export const DEFAULT_REQUISITION_STATUS: RequisitionStatus = "draft";

/** Statuses that still count as a "pending" request awaiting a decision. */
export const PENDING_REQUISITION_STATUSES: RequisitionStatus[] = [
  "submitted",
  "manager_approval",
  "procurement_review",
];

export function isValidRequisitionStatus(value: unknown): value is RequisitionStatus {
  return typeof value === "string" && REQUISITION_STATUSES.some((s) => s.value === value);
}
export function getRequisitionStatusMeta(status: string | undefined) {
  return REQUISITION_STATUSES.find((s) => s.value === status) ?? REQUISITION_STATUSES[0];
}

/** Approval levels, in order. `procurement_review` is only added above a cost threshold. */
export const APPROVAL_LEVELS = [
  { level: 1, status: "manager_approval" as RequisitionStatus, role: "dept_manager", label: "Department Manager" },
  { level: 2, status: "procurement_review" as RequisitionStatus, role: "procurement_manager", label: "Procurement" },
] as const;

// ---------------------------------------------------------------------------
// Vendor
// ---------------------------------------------------------------------------

export const VENDOR_CATEGORIES = [
  { value: "hardware_supplier", label: "Hardware Supplier" },
  { value: "software_vendor", label: "Software Vendor" },
  { value: "cloud_provider", label: "Cloud Provider" },
  { value: "internet_provider", label: "Internet Provider" },
  { value: "office_supplier", label: "Office Supplier" },
  { value: "furniture_vendor", label: "Furniture Vendor" },
  { value: "recruitment_agency", label: "Recruitment Agency" },
  { value: "marketing_agency", label: "Marketing Agency" },
  { value: "consultant", label: "Consultant" },
  { value: "amc_vendor", label: "AMC Vendor" },
  { value: "other", label: "Other" },
] as const;

export type VendorCategory = (typeof VENDOR_CATEGORIES)[number]["value"];
export const DEFAULT_VENDOR_CATEGORY: VendorCategory = "other";

export function isValidVendorCategory(value: unknown): value is VendorCategory {
  return typeof value === "string" && VENDOR_CATEGORIES.some((c) => c.value === value);
}
export function getVendorCategoryLabel(value: string | undefined): string {
  return VENDOR_CATEGORIES.find((c) => c.value === value)?.label ?? "Other";
}

export const VENDOR_STATUSES = [
  { value: "active", label: "Active", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500", active: true },
  { value: "inactive", label: "Inactive", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/50", active: false },
  { value: "blacklisted", label: "Blacklisted", badgeClass: "bg-destructive/15 text-destructive", dotClass: "bg-destructive", active: false },
] as const;

export type VendorStatus = (typeof VENDOR_STATUSES)[number]["value"];
export const DEFAULT_VENDOR_STATUS: VendorStatus = "active";

export function isValidVendorStatus(value: unknown): value is VendorStatus {
  return typeof value === "string" && VENDOR_STATUSES.some((s) => s.value === value);
}
export function getVendorStatusMeta(status: string | undefined) {
  return VENDOR_STATUSES.find((s) => s.value === status) ?? VENDOR_STATUSES[0];
}

/** Vendor payment terms (days). */
export const PAYMENT_TERMS = [
  { value: "advance", label: "Advance" },
  { value: "net_7", label: "Net 7" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "net_45", label: "Net 45" },
  { value: "net_60", label: "Net 60" },
  { value: "net_90", label: "Net 90" },
] as const;

export type PaymentTerm = (typeof PAYMENT_TERMS)[number]["value"];
export const DEFAULT_PAYMENT_TERM: PaymentTerm = "net_30";

export function isValidPaymentTerm(value: unknown): value is PaymentTerm {
  return typeof value === "string" && PAYMENT_TERMS.some((t) => t.value === value);
}

/** Payment terms in days — for invoice due-date calculation (Phase 6). */
export function paymentTermDays(term: string | undefined): number {
  const m = /^net_(\d+)$/.exec(term ?? "");
  return m ? Number(m[1]) : 0;
}

// ---------------------------------------------------------------------------
// Payment method (expenses, payments)
// ---------------------------------------------------------------------------

export const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "upi", label: "UPI" },
  { value: "credit_card", label: "Credit Card" },
  { value: "debit_card", label: "Debit Card" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "net_banking", label: "Net Banking" },
  { value: "auto_debit", label: "Auto Debit" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];
export const DEFAULT_PAYMENT_METHOD: PaymentMethod = "bank_transfer";

export function isValidPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && PAYMENT_METHODS.some((m) => m.value === value);
}

// ---------------------------------------------------------------------------
// Expense / requisition category tree (spec section 7). `value` is the stable
// key stored on records; `subcategories` are free-form suggestions.
// ---------------------------------------------------------------------------

export const EXPENSE_CATEGORY_TREE = [
  {
    value: "office_operations",
    label: "Office Operations",
    subcategories: [
      "Stationery", "Printing", "Pantry", "Furniture", "Office Equipment", "Housekeeping",
      "Electricity", "Water", "Rent", "Internet", "Telephone",
    ],
  },
  {
    value: "infrastructure",
    label: "Infrastructure",
    subcategories: [
      "Servers", "Cloud Hosting", "VPS", "Dedicated Servers", "Domain", "SSL", "CDN",
      "Backup Storage", "Database Hosting",
    ],
  },
  {
    value: "software_saas",
    label: "Software & SaaS",
    subcategories: [
      "OpenAI", "ElevenLabs", "Google Workspace", "Microsoft 365", "Slack", "GitHub", "Figma",
      "Notion", "Zoom", "AWS", "Azure", "DigitalOcean", "Vercel",
    ],
  },
  {
    value: "marketing",
    label: "Marketing",
    subcategories: ["Google Ads", "Meta Ads", "LinkedIn Ads", "SEO Tools", "Email Marketing"],
  },
  {
    value: "professional_services",
    label: "Professional Services",
    subcategories: ["CA", "Legal", "Consultancy", "Freelancer", "Recruitment"],
  },
  {
    value: "others",
    label: "Others",
    subcategories: ["Travel", "Food", "Training", "Miscellaneous"],
  },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORY_TREE)[number]["value"];
export const EXPENSE_CATEGORIES = EXPENSE_CATEGORY_TREE.map((c) => ({ value: c.value, label: c.label }));
export const DEFAULT_EXPENSE_CATEGORY: ExpenseCategory = "office_operations";

export function isValidExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === "string" && EXPENSE_CATEGORY_TREE.some((c) => c.value === value);
}
export function getExpenseCategoryLabel(value: string | undefined): string {
  return EXPENSE_CATEGORY_TREE.find((c) => c.value === value)?.label ?? "Others";
}
export function subcategoriesFor(category: string | undefined): readonly string[] {
  return EXPENSE_CATEGORY_TREE.find((c) => c.value === category)?.subcategories ?? [];
}

// ---------------------------------------------------------------------------
// Asset categories (spec section 8) — used from Phase 4, listed here so the
// dashboard and settings can reference the master list early.
// ---------------------------------------------------------------------------

export const ASSET_CATEGORIES = [
  "Laptop", "Desktop", "Monitor", "Mobile", "Tablet", "Printer", "Router", "Switch",
  "UPS", "Server", "Camera", "Office Chair", "Desk", "AC", "Projector", "Biometric Device",
] as const;

// ---------------------------------------------------------------------------
// Units of measure (requisition quantity)
// ---------------------------------------------------------------------------

export const UNITS_OF_MEASURE = [
  "pcs", "units", "sets", "boxes", "licenses", "seats", "months", "years", "hours", "kg", "reams",
] as const;

export const DEFAULT_UOM = "pcs";

// ---------------------------------------------------------------------------
// GST rate options (India)
// ---------------------------------------------------------------------------

export const GST_RATES = [0, 5, 12, 18, 28] as const;
export const DEFAULT_GST_RATE = 18;

export function isValidGstRate(value: unknown): boolean {
  const n = Number(value);
  return Number.isFinite(n) && (GST_RATES as readonly number[]).includes(n);
}

// ---------------------------------------------------------------------------
// Generic status-meta lookup helper (shared by every module badge)
// ---------------------------------------------------------------------------

interface StatusMeta {
  value: string;
  label: string;
  badgeClass: string;
  dotClass: string;
}
function metaLookup<T extends readonly StatusMeta[]>(list: T, value: string | undefined): T[number] {
  return (list.find((s) => s.value === value) ?? list[0]) as T[number];
}

const MUTED = "bg-muted text-muted-foreground";
const MUTED_DOT = "bg-muted-foreground/50";
const BLUE = "bg-blue-500/15 text-blue-600 dark:text-blue-400";
const GREEN = "bg-green-500/15 text-green-600 dark:text-green-400";
const AMBER = "bg-amber-500/15 text-amber-600 dark:text-amber-400";
const PURPLE = "bg-purple-500/15 text-purple-600 dark:text-purple-400";
const RED = "bg-destructive/15 text-destructive";
const PRIMARY = "bg-primary/10 text-primary";

// ---------------------------------------------------------------------------
// RFQ (Phase 2)
// ---------------------------------------------------------------------------

export const RFQ_STATUSES = [
  { value: "draft", label: "Draft", badgeClass: MUTED, dotClass: MUTED_DOT },
  { value: "sent", label: "Sent to Vendors", badgeClass: BLUE, dotClass: "bg-blue-500" },
  { value: "quoted", label: "Quotes Received", badgeClass: PURPLE, dotClass: "bg-purple-500" },
  { value: "awarded", label: "Awarded", badgeClass: GREEN, dotClass: "bg-green-500" },
  { value: "cancelled", label: "Cancelled", badgeClass: RED, dotClass: "bg-destructive" },
] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number]["value"];
export const isValidRfqStatus = (v: unknown): v is RfqStatus =>
  typeof v === "string" && RFQ_STATUSES.some((s) => s.value === v);
export const getRfqStatusMeta = (v: string | undefined) => metaLookup(RFQ_STATUSES, v);

// ---------------------------------------------------------------------------
// Purchase Order (Phase 2)
// ---------------------------------------------------------------------------

export const PO_STATUSES = [
  { value: "draft", label: "Draft", badgeClass: MUTED, dotClass: MUTED_DOT },
  { value: "issued", label: "Issued", badgeClass: BLUE, dotClass: "bg-blue-500" },
  { value: "partially_received", label: "Partially Received", badgeClass: AMBER, dotClass: "bg-amber-500" },
  { value: "received", label: "Received", badgeClass: GREEN, dotClass: "bg-green-500" },
  { value: "closed", label: "Closed", badgeClass: PRIMARY, dotClass: "bg-primary/70" },
  { value: "cancelled", label: "Cancelled", badgeClass: RED, dotClass: "bg-destructive" },
] as const;
export type PoStatus = (typeof PO_STATUSES)[number]["value"];
export const DEFAULT_PO_STATUS: PoStatus = "draft";
export const isValidPoStatus = (v: unknown): v is PoStatus =>
  typeof v === "string" && PO_STATUSES.some((s) => s.value === v);
export const getPoStatusMeta = (v: string | undefined) => metaLookup(PO_STATUSES, v);

// ---------------------------------------------------------------------------
// Goods Receipt (Phase 2)
// ---------------------------------------------------------------------------

export const GRN_STATUSES = [
  { value: "draft", label: "Draft", badgeClass: MUTED, dotClass: MUTED_DOT },
  { value: "accepted", label: "Accepted", badgeClass: GREEN, dotClass: "bg-green-500" },
  { value: "partially_accepted", label: "Partially Accepted", badgeClass: AMBER, dotClass: "bg-amber-500" },
  { value: "rejected", label: "Rejected", badgeClass: RED, dotClass: "bg-destructive" },
] as const;
export type GrnStatus = (typeof GRN_STATUSES)[number]["value"];
export const getGrnStatusMeta = (v: string | undefined) => metaLookup(GRN_STATUSES, v);

// ---------------------------------------------------------------------------
// Expense (Phase 3)
// ---------------------------------------------------------------------------

export const EXPENSE_STATUSES = [
  { value: "pending", label: "Pending", badgeClass: AMBER, dotClass: "bg-amber-500" },
  { value: "approved", label: "Approved", badgeClass: GREEN, dotClass: "bg-green-500" },
  { value: "rejected", label: "Rejected", badgeClass: RED, dotClass: "bg-destructive" },
  { value: "reimbursed", label: "Reimbursed", badgeClass: PRIMARY, dotClass: "bg-primary/70" },
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number]["value"];
export const DEFAULT_EXPENSE_STATUS: ExpenseStatus = "pending";
export const isValidExpenseStatus = (v: unknown): v is ExpenseStatus =>
  typeof v === "string" && EXPENSE_STATUSES.some((s) => s.value === v);
export const getExpenseStatusMeta = (v: string | undefined) => metaLookup(EXPENSE_STATUSES, v);

export const RECURRENCE_INTERVALS = [
  { value: "monthly", label: "Monthly", months: 1 },
  { value: "quarterly", label: "Quarterly", months: 3 },
  { value: "half_yearly", label: "Half-yearly", months: 6 },
  { value: "yearly", label: "Yearly", months: 12 },
] as const;
export type RecurrenceInterval = (typeof RECURRENCE_INTERVALS)[number]["value"];
export const isValidRecurrenceInterval = (v: unknown): v is RecurrenceInterval =>
  typeof v === "string" && RECURRENCE_INTERVALS.some((r) => r.value === v);
export const recurrenceMonths = (v: string | undefined): number =>
  RECURRENCE_INTERVALS.find((r) => r.value === v)?.months ?? 1;

export const EXPENSE_TYPES = [
  { value: "one_time", label: "One-time" },
  { value: "recurring", label: "Recurring" },
] as const;

// ---------------------------------------------------------------------------
// Asset (Phase 4)
// ---------------------------------------------------------------------------

export const ASSET_STATUSES = [
  { value: "in_stock", label: "In Stock", badgeClass: BLUE, dotClass: "bg-blue-500" },
  { value: "assigned", label: "Assigned", badgeClass: GREEN, dotClass: "bg-green-500" },
  { value: "under_repair", label: "Under Repair", badgeClass: AMBER, dotClass: "bg-amber-500" },
  { value: "lost", label: "Lost", badgeClass: RED, dotClass: "bg-destructive" },
  { value: "retired", label: "Retired", badgeClass: MUTED, dotClass: MUTED_DOT },
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number]["value"];
export const DEFAULT_ASSET_STATUS: AssetStatus = "in_stock";
export const isValidAssetStatus = (v: unknown): v is AssetStatus =>
  typeof v === "string" && ASSET_STATUSES.some((s) => s.value === v);
export const getAssetStatusMeta = (v: string | undefined) => metaLookup(ASSET_STATUSES, v);

export const DEPRECIATION_METHODS = [
  { value: "none", label: "No Depreciation" },
  { value: "slm", label: "Straight Line (SLM)" },
  { value: "wdv", label: "Written Down Value (WDV)" },
] as const;
export type DepreciationMethod = (typeof DEPRECIATION_METHODS)[number]["value"];
export const isValidDepreciationMethod = (v: unknown): v is DepreciationMethod =>
  typeof v === "string" && DEPRECIATION_METHODS.some((m) => m.value === v);

// ---------------------------------------------------------------------------
// Inventory (Phase 4)
// ---------------------------------------------------------------------------

export const INVENTORY_TXN_TYPES = [
  { value: "stock_in", label: "Stock In" },
  { value: "stock_out", label: "Stock Out" },
  { value: "adjustment", label: "Adjustment" },
] as const;
export type InventoryTxnType = (typeof INVENTORY_TXN_TYPES)[number]["value"];
export const isValidInventoryTxnType = (v: unknown): v is InventoryTxnType =>
  typeof v === "string" && INVENTORY_TXN_TYPES.some((t) => t.value === v);

// ---------------------------------------------------------------------------
// Recurring resources — Infrastructure / SaaS / Third-party / Contracts (Phase 5)
// ---------------------------------------------------------------------------

export const RESOURCE_STATUSES = [
  { value: "active", label: "Active", badgeClass: GREEN, dotClass: "bg-green-500" },
  { value: "expiring", label: "Expiring Soon", badgeClass: AMBER, dotClass: "bg-amber-500" },
  { value: "expired", label: "Expired", badgeClass: RED, dotClass: "bg-destructive" },
  { value: "cancelled", label: "Cancelled", badgeClass: MUTED, dotClass: MUTED_DOT },
] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number]["value"];
export const DEFAULT_RESOURCE_STATUS: ResourceStatus = "active";
export const isValidResourceStatus = (v: unknown): v is ResourceStatus =>
  typeof v === "string" && RESOURCE_STATUSES.some((s) => s.value === v);
export const getResourceStatusMeta = (v: string | undefined) => metaLookup(RESOURCE_STATUSES, v);

export const BILLING_CYCLES = [
  { value: "monthly", label: "Monthly", months: 1 },
  { value: "quarterly", label: "Quarterly", months: 3 },
  { value: "annual", label: "Annual", months: 12 },
  { value: "biennial", label: "Biennial", months: 24 },
] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number]["value"];
export const isValidBillingCycle = (v: unknown): v is BillingCycle =>
  typeof v === "string" && BILLING_CYCLES.some((b) => b.value === v);
export const billingCycleMonths = (v: string | undefined): number =>
  BILLING_CYCLES.find((b) => b.value === v)?.months ?? 1;
/** Normalises any billing amount to a per-month figure. */
export const monthlyEquivalent = (amount: number, cycle: string | undefined): number =>
  amount / billingCycleMonths(cycle);

export const INFRA_RESOURCE_TYPES = [
  "Physical Server", "Cloud Server", "VPS", "Domain", "SSL Certificate", "Hosting",
  "CDN", "DNS", "Database Server", "Object Storage", "Backup Storage",
] as const;

export const CONTRACT_TYPES = [
  "AMC", "Service Agreement", "Retainer", "License", "Lease", "SLA", "NDA", "MSA",
] as const;

// ---------------------------------------------------------------------------
// Invoice & Payment (Phase 6)
// ---------------------------------------------------------------------------

export const INVOICE_STATUSES = [
  { value: "pending", label: "Pending", badgeClass: AMBER, dotClass: "bg-amber-500" },
  { value: "approved", label: "Approved", badgeClass: BLUE, dotClass: "bg-blue-500" },
  { value: "partially_paid", label: "Partially Paid", badgeClass: PURPLE, dotClass: "bg-purple-500" },
  { value: "paid", label: "Paid", badgeClass: GREEN, dotClass: "bg-green-500" },
  { value: "overdue", label: "Overdue", badgeClass: RED, dotClass: "bg-destructive" },
  { value: "cancelled", label: "Cancelled", badgeClass: MUTED, dotClass: MUTED_DOT },
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]["value"];
export const DEFAULT_INVOICE_STATUS: InvoiceStatus = "pending";
export const isValidInvoiceStatus = (v: unknown): v is InvoiceStatus =>
  typeof v === "string" && INVOICE_STATUSES.some((s) => s.value === v);
export const getInvoiceStatusMeta = (v: string | undefined) => metaLookup(INVOICE_STATUSES, v);

export const PAYMENT_STATUSES = [
  { value: "scheduled", label: "Scheduled", badgeClass: BLUE, dotClass: "bg-blue-500" },
  { value: "processed", label: "Processed", badgeClass: GREEN, dotClass: "bg-green-500" },
  { value: "failed", label: "Failed", badgeClass: RED, dotClass: "bg-destructive" },
] as const;
export const getPaymentStatusMeta = (v: string | undefined) => metaLookup(PAYMENT_STATUSES, v);

// ---------------------------------------------------------------------------
// Budget (Phase 7)
// ---------------------------------------------------------------------------

export const BUDGET_LEVELS = [
  { value: "company", label: "Company" },
  { value: "department", label: "Department" },
  { value: "project", label: "Project" },
  { value: "category", label: "Category" },
] as const;
export type BudgetLevel = (typeof BUDGET_LEVELS)[number]["value"];
export const isValidBudgetLevel = (v: unknown): v is BudgetLevel =>
  typeof v === "string" && BUDGET_LEVELS.some((b) => b.value === v);

export const BUDGET_PERIODS = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number]["value"];
export const isValidBudgetPeriod = (v: unknown): v is BudgetPeriod =>
  typeof v === "string" && BUDGET_PERIODS.some((b) => b.value === v);

// ---------------------------------------------------------------------------
// GST / tax helpers
// ---------------------------------------------------------------------------

export interface TaxBreakdown {
  subtotal: number;
  discount: number;
  taxable: number;
  gstRate: number;
  gstAmount: number;
  total: number;
}
export function computeTax(subtotal: number, discount: number, gstRate: number): TaxBreakdown {
  const taxable = Math.max(subtotal - discount, 0);
  const gstAmount = Math.round(taxable * (gstRate / 100) * 100) / 100;
  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    taxable: round2(taxable),
    gstRate,
    gstAmount,
    total: round2(taxable + gstAmount),
  };
}
export function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/** Days until an ISO date (negative = past). */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86400000);
}
