/**
 * "My work": everything a company has to do to keep its accounts and filing in order, by how often it comes round — every day, every week,
 * every month, every quarter, every year — each as a short list of steps that open the exact screen. This file is the single list; the page,
 * the reminders, the progress and the printed plan are all produced from it, so they can never disagree.
 *
 * Nothing here is a statutory figure. A due date either comes from the tax rulebook (`dueRule`) or is our own suggested working deadline
 * (`dueOffset`, labelled as a suggestion). A step whose screen is not built yet says so (`built: false`) and is done outside, then ticked.
 *
 * APPEND-ONLY: task ids and step order are stored with the company's ticks; never reorder or reuse an id.
 */

export type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

/** Facts about the company that decide which tasks apply to it. */
export type Need = "gst" | "employees" | "tds" | "company" | "cash";

/** Facts the books can prove, so the system can tick a step itself. A step with an `auto` key shows "done by CashFlow" once the fact holds. */
export type AutoFact =
  | "bank_matched" // no unmatched bank lines
  | "no_overdue_invoices"
  | "no_overdue_bills"
  | "no_missing_documents" // bills, receipts, expenses all have proof
  | "no_duplicate_bills"
  | "no_unclassified_entries"
  | "settlements_recorded"
  | "approvals_clear"
  | "payroll_dues_paid"
  | "filings_filled" // the year's filing calendar has been generated
  | "month_locked"; // (only for a month's close) the fiscal period for that month is closed

export interface Step {
  /** What to do, one sentence, in the words a person would use. */
  text: string;
  /** The screen that does it. */
  href?: string;
  /** Hint under the step: what to look for, or what "done" looks like. */
  hint?: string;
  /** The screen exists in CashFlow. false = done outside CashFlow (the portal, the auditor), then ticked. */
  built: boolean;
  auto?: AutoFact;
}

export interface WorkTask {
  id: string;
  frequency: Frequency;
  title: string;
  /** One sentence: why this matters. */
  why: string;
  needs?: Need[];
  /** Days from the END of the period when it becomes available (negative = already during the period). */
  availableOffset: number;
  /** The due date comes from this rule of the tax rulebook (or "advance-tax" for the rulebook's advance-tax instalments)... */
  dueRule?: string;
  /** ...otherwise from our own suggested deadline: days after the end of the period. Shown as "suggested". */
  dueOffset?: number;
  /** When the due date is a rule's, the task opens this many days before it (instead of availableOffset). */
  availableBeforeDue?: number;
  steps: Step[];
}

const H = {
  invoices: "/cashflow-ai/invoices",
  receipts: "/cashflow-ai/receipts",
  receivables: "/cashflow-ai/receivables",
  payouts: "/cashflow-ai/payouts",
  approvals: "/cashflow-ai/approvals",
  payables: "/cashflow-ai/payables",
  bills: "/spendiq/invoices",
  expenses: "/spendiq/expenses",
  bank: "/cashflow-ai/bank-reconciliation",
  settlements: "/cashflow-ai/settlements",
  cash: "/cashflow-ai/cash-reconciliation",
  cleanup: "/cashflow-ai/compliance/cleanup",
  calendar: "/cashflow-ai/compliance/calendar",
  close: "/cashflow-ai/month-close",
  pl: "/cashflow-ai/reports/profit-and-loss",
  cashflow: "/cashflow-ai/reports/cash-flow",
  budget: "/cashflow-ai/reports/budget-vs-actual",
  bs: "/cashflow-ai/reports/balance-sheet",
  payroll: "/talentos/payroll",
  payrollDues: "/talentos/payroll/compliance",
  gst: "/cashflow-ai/gst",
  gstSales: "/cashflow-ai/gst/sales",
  gstBuy: "/cashflow-ai/gst/purchases",
  gst2b: "/cashflow-ai/gst/reconcile",
  tds: "/cashflow-ai/tds",
  tdsChallan: "/cashflow-ai/tds/challans",
  tdsStmt: "/cashflow-ai/tds/statement",
  tdsCert: "/cashflow-ai/tds/certificates",
  tds26as: "/cashflow-ai/tds/credits",
  tax: "/cashflow-ai/income-tax",
  advTax: "/cashflow-ai/income-tax/advance-tax",
  taxLoss: "/cashflow-ai/income-tax/losses",
  taxReturn: "/cashflow-ai/income-tax/returns",
  party: "/cashflow-ai/party-reconciliation",
  vendorCtl: "/cashflow-ai/vendor-controls",
  checklist: "/cashflow-ai/compliance/checklist",
  settingsAccrual: "/cashflow-ai/settings/accrual",
  periods: "/cashflow-ai/settings/fiscal-periods",
};

export const WORK_TASKS: WorkTask[] = [
  // ───────────────────────────── EVERY DAY (about 10 minutes) ─────────────────────────────
  {
    id: "d-record",
    frequency: "daily",
    title: "Write down today's money in and out",
    why: "Books are only right if every sale, receipt and bill is entered the day it happens.",
    availableOffset: 0,
    dueOffset: 0,
    steps: [
      { text: "Raise an invoice for any work you finished today.", href: H.invoices, hint: "Money in → New invoice", built: true },
      { text: "Record every payment a customer made today (cash, cheque or bank transfer).", href: H.receipts, hint: "Add the proof: bank advice or cheque photo.", built: true },
      { text: "Enter every vendor bill you received today.", href: H.bills, hint: "Attach the bill. A duplicate is refused.", built: true },
      { text: "Enter today's expenses and expense claims.", href: H.expenses, built: true },
    ],
  },
  {
    id: "d-bank",
    frequency: "daily",
    title: "Match the bank's entries",
    why: "If the bank and your books agree every day, nothing can go missing for long.",
    availableOffset: 0,
    dueOffset: 1,
    steps: [
      { text: "Add the new bank statement lines (upload or type).", href: H.bank, built: true },
      { text: "Match each line to what you recorded, until none is left.", href: H.bank, hint: "Done when 'unmatched' shows 0.", built: true, auto: "bank_matched" },
      { text: "Razorpay paid you today? Check the payout and record it.", href: H.settlements, built: true, auto: "settlements_recorded" },
    ],
  },
  {
    id: "d-pay",
    frequency: "daily",
    title: "Approve and pay what is due",
    why: "Paying on time keeps vendors and employees happy; paying a wrong bill loses money.",
    availableOffset: 0,
    dueOffset: 0,
    steps: [
      { text: "Approve the payments waiting for you.", href: H.approvals, built: true, auto: "approvals_clear" },
      { text: "Look at the bills due today and pay them.", href: H.payables, hint: "Only to bank details that were confirmed by a second person.", built: true },
    ],
  },
  {
    id: "d-attention",
    frequency: "daily",
    title: "Look at what needs attention",
    why: "One list of anything wrong, before it grows.",
    availableOffset: 0,
    dueOffset: 0,
    steps: [{ text: "Open Home and clear the “Needs your attention” list.", href: "/cashflow-ai", built: true }],
  },

  // ───────────────────────────── EVERY WEEK (about 30 minutes) ─────────────────────────────
  {
    id: "w-collect",
    frequency: "weekly",
    title: "Collect the money customers owe",
    why: "Late payment from customers is the usual reason a profitable company runs short of cash.",
    availableOffset: -6,
    dueOffset: 0,
    steps: [
      { text: "See which invoices are overdue and send each customer a reminder or a payment link.", href: H.receivables, built: true, auto: "no_overdue_invoices" },
      { text: "Phone the customers with the biggest or oldest dues.", hint: "Write what they promised in the invoice notes.", built: false },
    ],
  },
  {
    id: "w-plan-pay",
    frequency: "weekly",
    title: "Plan what you will pay this week and next",
    why: "Knowing the payments ahead of time means no surprise, no late fee.",
    availableOffset: -6,
    dueOffset: 0,
    steps: [
      { text: "List the bills due in the next two weeks.", href: H.payables, built: true, auto: "no_overdue_bills" },
      { text: "Check the money in your bank covers them.", href: "/cashflow-ai/banking", built: true },
    ],
  },
  {
    id: "w-clean",
    frequency: "weekly",
    title: "Fix missing bills and duplicates",
    why: "A bill with no copy or entered twice is much harder to fix months later.",
    availableOffset: -6,
    dueOffset: 0,
    steps: [
      { text: "Attach the missing bill/receipt proofs.", href: H.cleanup, built: true, auto: "no_missing_documents" },
      { text: "Remove or cancel any bill that was entered twice.", href: H.cleanup, built: true, auto: "no_duplicate_bills" },
      { text: "Give every entry its account.", href: H.cleanup, built: true, auto: "no_unclassified_entries" },
    ],
  },
  {
    id: "w-cash",
    frequency: "weekly",
    title: "Count the cash in hand",
    why: "Cash is the easiest thing to lose track of.",
    needs: ["cash"],
    availableOffset: -6,
    dueOffset: 0,
    steps: [{ text: "Count the cash box and enter the count.", href: H.cash, built: true }],
  },
  {
    id: "w-numbers",
    frequency: "weekly",
    title: "Look at the week's numbers",
    why: "Five minutes with the cash position tells you if something is off.",
    availableOffset: -6,
    dueOffset: 0,
    steps: [{ text: "Open the cash-flow report and read the week.", href: H.cashflow, built: true }],
  },

  // ───────────────────────────── EVERY MONTH ─────────────────────────────
  {
    id: "m-payroll",
    frequency: "monthly",
    title: "Run payroll",
    why: "Salaries on time, with the right PF, ESI, professional tax and income tax cut.",
    needs: ["employees"],
    availableOffset: -7,
    dueOffset: 5,
    steps: [
      { text: "Check attendance, leave, overtime and expense claims for the month.", href: H.payroll, built: true },
      { text: "Run the month's payroll and approve it.", href: H.payroll, built: true },
      { text: "Pay the salaries.", href: H.payroll, hint: "Paid through your Razorpay account.", built: true },
      { text: "Deposit PF, ESI, professional tax and the income tax cut from salaries, and record each payment.", href: H.payrollDues, built: true, auto: "payroll_dues_paid" },
    ],
  },
  {
    id: "m-gst",
    frequency: "monthly",
    title: "GST for the month",
    why: "Tax on your sales, credit on your purchases, filed on time.",
    needs: ["gst"],
    availableOffset: 1,
    dueRule: "gstr3b",
    steps: [
      { text: "Check the month's sales list: fix any invoice marked with a problem.", href: H.gstSales, built: true },
      { text: "Decide the input credit on each purchase bill of the month.", href: H.gstBuy, built: true },
      { text: "Match your purchases with the GSTR-2B you downloaded from the GST portal.", href: H.gst2b, hint: "Download GSTR-2B on the portal and upload it here.", built: true },
      { text: "Read the monthly summary: tax on sales, credit, what is left to pay.", href: H.gst, built: true },
      { text: "File GSTR-1 on the GST portal.", hint: "Use the sales list. File generation inside CashFlow is not built yet.", built: false },
      { text: "File GSTR-3B on the GST portal and pay the tax.", hint: "Use the monthly summary figures.", built: false },
      { text: "Write down the GST payment (challan) you made.", href: H.gst, built: false },
    ],
  },
  {
    id: "m-tds",
    frequency: "monthly",
    title: "TDS for the month",
    why: "Tax cut from payments must be deposited by the 7th of the next month.",
    needs: ["tds"],
    availableOffset: 1,
    dueRule: "tds-deposit",
    steps: [
      { text: "Check the month's deductions: fix any bill marked with a problem.", href: H.tds, built: true },
      { text: "Pay the TDS on the TDS portal (challan 281) from your bank.", built: false },
      { text: "Record the challan (BSR code, serial, date).", href: H.tdsChallan, built: true },
    ],
  },
  {
    id: "m-close",
    frequency: "monthly",
    title: "Close the month's books",
    why: "A closed month cannot be changed by mistake, and your numbers are final.",
    needs: ["company"],
    availableOffset: 1,
    dueOffset: 7,
    steps: [
      { text: "Match the bank statement fully for the month.", href: H.bank, built: true, auto: "bank_matched" },
      { text: "Make sure every Razorpay payout is recorded.", href: H.settlements, built: true, auto: "settlements_recorded" },
      { text: "Go through the month-end list and tick each item.", href: H.close, built: true },
      { text: "Lock the month.", href: H.close, built: true, auto: "month_locked" },
    ],
  },
  {
    id: "m-statements",
    frequency: "monthly",
    title: "Agree balances with customers and vendors",
    why: "Differences found now are small; found at year-end they are a fight.",
    availableOffset: 1,
    dueOffset: 10,
    steps: [
      { text: "Send statements to the customers who owe the most and the vendors you owe the most.", href: H.party, built: true },
      { text: "Record what they confirm, and chase any difference.", href: H.party, built: true },
    ],
  },
  {
    id: "m-review",
    frequency: "monthly",
    title: "Read the month's profit and loss",
    why: "To see if the business is making money and where it is going.",
    availableOffset: 1,
    dueOffset: 10,
    steps: [
      { text: "Read the profit and loss and balance sheet for the month.", href: H.pl, built: true },
      { text: "Compare with the budget.", href: H.budget, built: true },
    ],
  },

  // ───────────────────────────── EVERY QUARTER ─────────────────────────────
  {
    id: "q-advtax",
    frequency: "quarterly",
    title: "Pay advance tax if it is due",
    why: "Paying income tax in instalments avoids interest.",
    needs: ["company"],
    availableOffset: -20,
    dueRule: "advance-tax",
    availableBeforeDue: 20,
    steps: [
      { text: "See how much to pay by the next date.", href: H.advTax, built: true },
      { text: "Pay it on the income-tax portal from your bank.", built: false },
      { text: "Record the payment (BSR code, serial, date).", href: H.advTax, built: true },
    ],
  },
  {
    id: "q-tdsreturn",
    frequency: "quarterly",
    title: "File the quarter's TDS statement",
    why: "Vendors and employees get their tax credit only after you file.",
    needs: ["tds"],
    availableOffset: 1,
    dueRule: "tds-return",
    steps: [
      { text: "Check the quarter's statement for problems (PAN missing, short deduction).", href: H.tdsStmt, built: true },
      { text: "Check every month's deposit matches what was deducted.", href: H.tdsChallan, built: true },
      { text: "Download the working file and prepare the statement in the return utility.", href: H.tdsStmt, built: true },
      { text: "File the statement on the TDS portal (TRACES).", built: false },
      { text: "After filing, download Form 16A and send it to each vendor; tick them off.", href: H.tdsCert, built: true },
    ],
  },
  {
    id: "q-credits",
    frequency: "quarterly",
    title: "Check the TDS customers cut from you",
    why: "You can only claim tax credit that shows in your Form 26AS.",
    needs: ["company"],
    availableOffset: 1,
    dueOffset: 30,
    steps: [
      { text: "Download Form 26AS from the income-tax portal and upload it here.", href: H.tds26as, built: true },
      { text: "Ask customers whose TDS does not show to deposit/report it.", href: H.tds26as, built: true },
    ],
  },
  {
    id: "q-review",
    frequency: "quarterly",
    title: "Quarterly review",
    why: "To catch slow problems: unmatched balances, unpaid dues, old receivables.",
    availableOffset: 1,
    dueOffset: 15,
    steps: [
      { text: "Agree balances with every major customer and vendor.", href: H.party, built: true },
      { text: "Decide on old receivables that will not be paid.", href: H.party, built: true },
      { text: "Go through your filing calendar and the full job list for anything not done.", href: H.checklist, built: true },
      { text: "Hold a board meeting and write the minutes.", hint: "Minutes templates are not built in CashFlow yet.", built: false },
    ],
  },

  // ───────────────────────────── EVERY YEAR ─────────────────────────────
  {
    id: "y-setup",
    frequency: "yearly",
    title: "Start the year: fill the filing calendar",
    why: "Every return and payment of the year, with its date, in one list.",
    needs: ["company"],
    availableOffset: -364,
    dueOffset: -335,
    steps: [{ text: "Answer the four questions and fill in the filing calendar for the year.", href: H.calendar, built: true, auto: "filings_filled" }],
  },
  {
    id: "y-close",
    frequency: "yearly",
    title: "Close the financial year",
    why: "Final, checked books are what the auditor and the tax return are built on.",
    needs: ["company"],
    availableOffset: 1,
    dueOffset: 30,
    steps: [
      { text: "Make sure all twelve months are closed.", href: H.periods, built: true },
      { text: "Agree balances with all customers and vendors; sort out differences.", href: H.party, built: true },
      { text: "Count and value stock, and check fixed assets exist.", hint: "Fixed-asset register is not built yet.", built: false },
      { text: "Book year-end entries your auditor needs (depreciation, provisions).", built: false },
      { text: "Read the final profit and loss and balance sheet.", href: H.bs, built: true },
    ],
  },
  {
    id: "y-audit",
    frequency: "yearly",
    title: "Statutory audit",
    why: "The law requires every company's accounts to be audited by a chartered accountant.",
    needs: ["company"],
    availableOffset: 30,
    dueOffset: 150,
    steps: [
      { text: "Give the auditor the books, bank reconciliations, GST and TDS workings.", hint: "The audit pack download is not built yet.", built: false },
      { text: "Answer the auditor's questions.", built: false },
      { text: "Get the signed audit report and financial statements.", built: false },
    ],
  },
  {
    id: "y-tax",
    frequency: "yearly",
    title: "Income-tax return",
    why: "The company's return must be filed every year, even with a loss.",
    needs: ["company"],
    availableOffset: 30,
    dueRule: "itr6",
    steps: [
      { text: "Choose your tax basis and check the year's tax working.", href: H.tax, built: true },
      { text: "Add the changes to profit and the losses to carry forward.", href: H.taxLoss, built: true },
      { text: "Pay any tax still due (self-assessment) and record it.", href: H.advTax, built: true },
      { text: "File the return (ITR-6) on the income-tax portal.", hint: "Return file generation is not built yet.", built: false },
      { text: "e-Verify the return and note the date.", href: H.taxReturn, built: true },
    ],
  },
  {
    id: "y-roc",
    frequency: "yearly",
    title: "Company filings: AGM and Registrar of Companies",
    why: "Companies must hold an annual meeting and file their accounts with the Registrar.",
    needs: ["company"],
    availableOffset: 30,
    dueRule: "agm",
    steps: [
      { text: "Hold the annual general meeting after the audit.", hint: "Notice and minutes templates are not built yet.", built: false },
      { text: "File the financial statements and annual return with the Registrar (AOC-4, MGT-7).", built: false },
      { text: "Every director completes KYC (DIR-3 KYC).", built: false },
      { text: "Tick off each filing on the calendar with its proof.", href: H.calendar, built: true },
    ],
  },
  {
    id: "y-gst-annual",
    frequency: "yearly",
    title: "GST annual return",
    why: "The yearly summary of the whole year's GST.",
    needs: ["gst"],
    availableOffset: 1,
    dueRule: "gstr9",
    steps: [
      { text: "Check the year's sales and purchases against the monthly returns.", href: H.gst, built: true },
      { text: "File GSTR-9 on the GST portal.", hint: "Working for the annual return is not built yet.", built: false },
    ],
  },
  {
    id: "y-form16",
    frequency: "yearly",
    title: "Give employees their Form 16",
    why: "Employees need it to file their own returns.",
    needs: ["employees"],
    availableOffset: 60,
    dueOffset: 120,
    steps: [
      { text: "File the fourth-quarter TDS statement on salaries.", built: false },
      { text: "Download Form 16 from the TDS portal and send it to each employee.", href: H.payrollDues, built: false },
    ],
  },
  {
    id: "y-review",
    frequency: "yearly",
    title: "Yearly review and backup",
    why: "A fresh start for the next year.",
    needs: ["company"],
    availableOffset: 30,
    dueOffset: 90,
    steps: [
      { text: "Go through the whole job list and clear anything left.", href: H.checklist, built: true },
      { text: "Renew licences and insurance that expire.", built: false },
      { text: "Download a backup of your books.", built: false },
    ],
  },
];

const BY_ID = new Map(WORK_TASKS.map((t) => [t.id, t]));
export const taskById = (id: string) => BY_ID.get(id);
export const FREQUENCY_LABEL: Record<Frequency, string> = { daily: "Every day", weekly: "Every week", monthly: "Every month", quarterly: "Every quarter", yearly: "Every year" };
export const FREQUENCIES: Frequency[] = ["daily", "weekly", "monthly", "quarterly", "yearly"];
