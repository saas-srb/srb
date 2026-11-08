/**
 * Pure parts of the filing calendar (no DB): categories, the standard list of
 * filings a company can add in one click, and how a filing's state is worked
 * out from its date. Nothing here carries a due date — see filings.ts.
 */

export type FilingCategory = "gst" | "tds" | "income_tax" | "payroll" | "roc" | "audit" | "other";
export const FILING_CATEGORIES: { value: FilingCategory; label: string }[] = [
  { value: "gst", label: "GST" },
  { value: "tds", label: "TDS / TCS" },
  { value: "income_tax", label: "Income tax" },
  { value: "payroll", label: "Payroll dues (PF / ESI / PT)" },
  { value: "roc", label: "MCA / ROC" },
  { value: "audit", label: "Audit & accounts" },
  { value: "other", label: "Other" },
];

export type FilingStatus = "pending" | "filed" | "not_applicable";

export interface FilingTemplate {
  name: string;
  form: string | null;
  category: FilingCategory;
  frequency: string;
}

/** The recurring and annual filings named in the checklist. Applicability and dates are the CA's call. */
export const FILING_TEMPLATES: FilingTemplate[] = [
  { name: "GST outward supplies return", form: "GSTR-1", category: "gst", frequency: "Monthly / quarterly" },
  { name: "GST summary return and tax payment", form: "GSTR-3B", category: "gst", frequency: "Monthly / quarterly" },
  { name: "GST annual return", form: "GSTR-9", category: "gst", frequency: "Yearly" },
  { name: "GST reconciliation statement", form: "GSTR-9C", category: "gst", frequency: "Yearly" },
  { name: "TDS deposit (non-salary and salary)", form: "Challan 281", category: "tds", frequency: "Monthly" },
  { name: "TDS return — salary", form: "24Q", category: "tds", frequency: "Quarterly" },
  { name: "TDS return — resident payees", form: "26Q", category: "tds", frequency: "Quarterly" },
  { name: "TDS return — non-resident payees", form: "27Q", category: "tds", frequency: "Quarterly" },
  { name: "TCS return", form: "27EQ", category: "tds", frequency: "Quarterly" },
  { name: "Form 16 to employees", form: "Form 16", category: "tds", frequency: "Yearly" },
  { name: "Form 16A to payees", form: "Form 16A", category: "tds", frequency: "Quarterly" },
  { name: "Advance tax instalment", form: null, category: "income_tax", frequency: "Quarterly" },
  { name: "Tax audit report", form: "3CA / 3CB / 3CD", category: "income_tax", frequency: "Yearly, if applicable" },
  { name: "Income-tax return of the company", form: "ITR-6", category: "income_tax", frequency: "Yearly" },
  { name: "Provident fund contribution and return", form: "EPF ECR", category: "payroll", frequency: "Monthly" },
  { name: "ESI contribution and return", form: "ESI", category: "payroll", frequency: "Monthly" },
  { name: "Professional tax payment / return", form: "PT", category: "payroll", frequency: "As per state" },
  { name: "Labour welfare fund", form: "LWF", category: "payroll", frequency: "As per state" },
  { name: "Financial statements filing", form: "AOC-4", category: "roc", frequency: "Yearly" },
  { name: "Annual return", form: "MGT-7 / MGT-7A", category: "roc", frequency: "Yearly" },
  { name: "Auditor appointment", form: "ADT-1", category: "roc", frequency: "If applicable" },
  { name: "Director KYC", form: "DIR-3 KYC", category: "roc", frequency: "Yearly" },
  { name: "Deposits return", form: "DPT-3", category: "roc", frequency: "Yearly, if applicable" },
  { name: "Dues to micro and small enterprises", form: "MSME Form I", category: "roc", frequency: "Half-yearly, if applicable" },
  { name: "Annual general meeting", form: null, category: "audit", frequency: "Yearly" },
  { name: "Statutory audit completed", form: null, category: "audit", frequency: "Yearly" },
];

export function isDateString(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export type FilingDisplayState = "filed" | "not_applicable" | "no_date" | "overdue" | "due_soon" | "upcoming";

/** `today` is a YYYY-MM-DD in the company's time zone. Due soon = within 7 days. */
export function filingState(f: { status: FilingStatus; dueDate: string | null }, today: string): FilingDisplayState {
  if (f.status === "filed") return "filed";
  if (f.status === "not_applicable") return "not_applicable";
  if (!f.dueDate) return "no_date";
  if (f.dueDate < today) return "overdue";
  const days = Math.round((new Date(`${f.dueDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000);
  return days <= 7 ? "due_soon" : "upcoming";
}

/**
 * What the company says about itself, so the calendar only holds dates that apply. `null` = not answered yet,
 * which counts as "does not apply" for GST, TDS and payroll (never guess that a company owes them) but is asked about in plain words.
 */
export interface ComplianceProfile {
  gstRegistered: boolean | null;
  hasEmployees: boolean | null;
  deductsTds: boolean | null;
  isPrivateLimited: boolean | null;
}
export const EMPTY_PROFILE: ComplianceProfile = { gstRegistered: null, hasEmployees: null, deductsTds: null, isPrivateLimited: null };

export const PROFILE_QUESTIONS: { key: keyof ComplianceProfile; question: string; help: string }[] = [
  { key: "gstRegistered", question: "Is your company registered for GST?", help: "You have a GSTIN and charge GST on your invoices." },
  { key: "hasEmployees", question: "Do you have employees on salary?", help: "Adds the provident fund (PF), ESI and professional tax dates." },
  { key: "deductsTds", question: "Do you deduct TDS when you pay salaries, rent, contractors or professionals?", help: "Adds the monthly TDS payment and the quarterly TDS statements." },
  { key: "isPrivateLimited", question: "Is your company a company registered with the MCA (a Private Limited or similar)?", help: "Adds the yearly company filings with the Registrar and the audit." },
];

/** Which filing types apply. Income tax, MCA and audit are always listed for a company: every company files a return and its accounts. */
export function categoriesFor(profile: ComplianceProfile): Set<FilingCategory> {
  const out = new Set<FilingCategory>(["income_tax", "other"]);
  if (profile.gstRegistered === true) out.add("gst");
  if (profile.deductsTds === true) out.add("tds");
  if (profile.hasEmployees === true) out.add("payroll");
  // Private Limited is a yes/no the company may leave open: a company using this product is a company, so only an explicit "no" drops the ROC / audit dates.
  if (profile.isPrivateLimited !== false) {
    out.add("roc");
    out.add("audit");
  }
  return out;
}

/** The category a rule is judged by. PF and ESI always belong to payroll, whatever category the rulebook files them under. */
export function effectiveCategory(item: { ruleId: string; category: FilingCategory }): FilingCategory {
  return item.ruleId === "pf" || item.ruleId === "esi" ? "payroll" : item.category;
}

export function appliesToProfile(item: { ruleId: string; category: FilingCategory }, profile: ComplianceProfile): boolean {
  return categoriesFor(profile).has(effectiveCategory(item));
}

export const isFilingYear = (fy: string) => /^\d{4}-\d{2}$/.test(fy) && (Number(fy.slice(0, 4)) + 1) % 100 === Number(fy.slice(5, 7));

/** The Indian financial year ("2026-27", 1 April to 31 March) that a YYYY-MM-DD falls in. */
export function currentFilingYear(today: string): string {
  const y = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
