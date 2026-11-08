/**
 * Who does what (README §22). The roles are the checklist's suggestion; the
 * company names the real people or firms against each workstream.
 */
export interface Workstream {
  key: string;
  title: string;
  /** Suggested primary owner. */
  primaryRole: string;
  /** Suggested reviewer / support. */
  reviewRole: string;
}

export const WORKSTREAMS: Workstream[] = [
  { key: "bookkeeping", title: "Daily bookkeeping and document collection", primaryRole: "Accounts team / bookkeeper", reviewRole: "CA reviews" },
  { key: "reconciliation", title: "Bank and ledger reconciliation", primaryRole: "Accounts team / bookkeeper", reviewRole: "CA reviews exceptions" },
  { key: "gst-tds", title: "GST and TDS working and filing", primaryRole: "CA / tax professional", reviewRole: "Company provides data and payments" },
  { key: "payroll", title: "Payroll inputs and salary payments", primaryRole: "HR / company accounts", reviewRole: "CA / payroll provider supports compliance" },
  { key: "closing-mis", title: "Monthly closing and MIS", primaryRole: "Accounts team / CA", reviewRole: "Management reviews" },
  { key: "audit", title: "Statutory audit", primaryRole: "Independent statutory auditor", reviewRole: "Company and accounts team provide records" },
  { key: "income-tax", title: "Income-tax return and tax audit", primaryRole: "CA / tax professional", reviewRole: "Directors approve / sign where required" },
  { key: "roc", title: "MCA / ROC forms, AGM and statutory registers", primaryRole: "CA / CS as engaged", reviewRole: "Directors / management provide approvals" },
  { key: "events", title: "Event-based legal and company changes", primaryRole: "Company management with CA / CS", reviewRole: "Legal adviser if needed" },
  { key: "calendar", title: "Filing proofs and compliance calendar", primaryRole: "CA / CS and company compliance owner", reviewRole: "Management monitors" },
];

const KEYS = new Set(WORKSTREAMS.map((w) => w.key));
export const isWorkstreamKey = (k: string) => KEYS.has(k);
