import { COMPLIANCE_ITEMS } from "@/lib/products/cashflow-ai/compliance/catalog";

/**
 * What the system can SEE about a checklist item, from the live books. Pure:
 * `facts` in, a verdict per item out. A signal is only given where the data
 * really proves the point:
 *  - "verified" — the data shows the item is satisfied right now
 *  - "issue"    — the data shows a problem with it
 * Items the books cannot prove (most of them) get no signal at all. A signal
 * never changes the saved status; the team decides, the system only informs.
 */
export interface ComplianceFacts {
  bankLinesTotal: number;
  bankLinesOpen: number;
  periodsDefined: number;
  periodsOpenButFinished: number;
  overdueInvoices: number;
  overdueBills: number;
  duplicateInvoiceNumbers: number;
  trialBalanceBalanced: boolean;
  /** Months with an approved payroll run. */
  payrollMonths: number;
  payrollDuesOverdue: number;
  /** An approved or paid run exists for the previous calendar month. */
  previousMonthPayrollApproved: boolean;
  filingsTotal: number;
  filingsWithoutDate: number;
  billsWithoutDocument: number;
  receiptsWithoutProof: number;
  expensesWithoutBill: number;
  duplicateBillGroups: number;
  unclassifiedEntries: number;
}

export type AutoSignal = { state: "verified" | "issue"; detail: string };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

type Rule = { title: string; needs: (keyof ComplianceFacts)[]; evaluate: (f: ComplianceFacts) => AutoSignal | null };

/** Rules are matched by the item's exact title in the catalog; the test fails if a title changes. */
export const AUTO_RULES: Rule[] = [
  {
    title: "Reconcile every bank account to its statement each month",
    needs: ["bankLinesTotal", "bankLinesOpen"],
    evaluate: (f) =>
      f.bankLinesTotal === 0
        ? null
        : f.bankLinesOpen > 0
          ? { state: "issue", detail: `${plural(f.bankLinesOpen, "bank line")} still unmatched or under review.` }
          : { state: "verified", detail: "Every imported bank line is matched." },
  },
  {
    title: "Lock the period after review",
    needs: ["periodsDefined", "periodsOpenButFinished"],
    evaluate: (f) =>
      f.periodsDefined === 0
        ? null
        : f.periodsOpenButFinished > 0
          ? { state: "issue", detail: `${plural(f.periodsOpenButFinished, "finished period")} still open.` }
          : { state: "verified", detail: "No finished period is left open." },
  },
  {
    title: "Review the trial balance",
    needs: ["trialBalanceBalanced"],
    evaluate: (f) => (f.trialBalanceBalanced ? null : { state: "issue", detail: "The trial balance does not balance." }),
  },
  {
    title: "Overdue receivables are followed up",
    needs: ["overdueInvoices"],
    evaluate: (f) =>
      f.overdueInvoices > 0
        ? { state: "issue", detail: `${plural(f.overdueInvoices, "invoice")} overdue — make sure each is being followed up.` }
        : { state: "verified", detail: "No invoice is overdue." },
  },
  {
    title: "Payment terms, overdue bills and disputes are monitored",
    needs: ["overdueBills"],
    evaluate: (f) => (f.overdueBills > 0 ? { state: "issue", detail: `${plural(f.overdueBills, "bill")} overdue.` } : null),
  },
  {
    title: "Invoice numbering has no gaps or duplicates",
    needs: ["duplicateInvoiceNumbers"],
    evaluate: (f) => (f.duplicateInvoiceNumbers > 0 ? { state: "issue", detail: `${plural(f.duplicateInvoiceNumbers, "invoice number")} used more than once.` } : null),
  },
  {
    title: "Statutory payments are made by their due dates",
    needs: ["payrollMonths", "payrollDuesOverdue"],
    evaluate: (f) =>
      f.payrollMonths === 0
        ? null
        : f.payrollDuesOverdue > 0
          ? { state: "issue", detail: `${plural(f.payrollDuesOverdue, "payroll due")} overdue.` }
          : { state: "verified", detail: "No payroll due is overdue." },
  },
  {
    title: "Monthly payroll is processed and approved",
    needs: ["previousMonthPayrollApproved"],
    evaluate: (f) => (f.previousMonthPayrollApproved ? { state: "verified", detail: "Last month's payroll run is approved." } : null),
  },
  {
    title: "Compliance calendar with upcoming deadlines",
    needs: ["filingsTotal", "filingsWithoutDate"],
    evaluate: (f) =>
      f.filingsTotal === 0
        ? null
        : f.filingsWithoutDate > 0
          ? { state: "issue", detail: `${plural(f.filingsWithoutDate, "filing")} still without a due date.` }
          : { state: "verified", detail: "Every filing on the calendar has a date." },
  },
  {
    title: "Supporting documents are attached to entries",
    needs: ["billsWithoutDocument", "receiptsWithoutProof", "expensesWithoutBill"],
    evaluate: (f) => {
      const parts = [
        f.billsWithoutDocument > 0 && plural(f.billsWithoutDocument, "vendor bill"),
        f.receiptsWithoutProof > 0 && plural(f.receiptsWithoutProof, "receipt"),
        f.expensesWithoutBill > 0 && plural(f.expensesWithoutBill, "expense"),
      ].filter(Boolean);
      return parts.length > 0 ? { state: "issue", detail: `Without a document: ${parts.join(", ")}.` } : null;
    },
  },
  {
    title: "Check for duplicate invoices, bills and payments",
    needs: ["duplicateBillGroups"],
    evaluate: (f) => (f.duplicateBillGroups > 0 ? { state: "issue", detail: `${plural(f.duplicateBillGroups, "set")} of vendor bills look like the same bill entered twice.` } : null),
  },
  {
    title: "Duplicate invoice and duplicate payment risks are checked",
    needs: ["duplicateBillGroups"],
    evaluate: (f) => (f.duplicateBillGroups > 0 ? { state: "issue", detail: `${plural(f.duplicateBillGroups, "set")} of vendor bills look like the same bill entered twice.` } : null),
  },
  {
    title: "Suspense and unclassified entries are reviewed and cleared",
    needs: ["unclassifiedEntries"],
    evaluate: (f) =>
      f.unclassifiedEntries > 0
        ? { state: "issue", detail: `${plural(f.unclassifiedEntries, "entry")} not given an account, so it sits in Other income / Other expenses.` }
        : { state: "verified", detail: "Every income and expense entry has an account." },
  },
];

const KEY_BY_TITLE = new Map(COMPLIANCE_ITEMS.map((i) => [i.title, i.key]));

/** Item key → signal, for the items the books can speak to. */
export function evaluateSignals(facts: Partial<ComplianceFacts>): Map<string, AutoSignal> {
  const out = new Map<string, AutoSignal>();
  for (const rule of AUTO_RULES) {
    const key = KEY_BY_TITLE.get(rule.title);
    if (!key) continue;
    // a fact that could not be read gives no signal — never a quiet "verified"
    if (rule.needs.some((n) => facts[n] === undefined)) continue;
    const s = rule.evaluate(facts as ComplianceFacts);
    if (s) out.set(key, s);
  }
  return out;
}

/** Items that are marked Done but the books show a problem — the ones to look at first. */
export function doneButIssue(signals: Map<string, AutoSignal>, statuses: Map<string, string>): string[] {
  return [...signals].filter(([k, s]) => s.state === "issue" && statuses.get(k) === "done").map(([k]) => k);
}
