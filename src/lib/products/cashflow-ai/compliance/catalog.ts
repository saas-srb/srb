/**
 * The CA / accounting / statutory checklist, section by section — a pure
 * catalog (no DB, no "server-only") so pages, tests and the tracker share it.
 *
 * Source: local/CA_Pvt_Ltd_Complete_Checklist_README.md. Each item's key is
 * `<section key>.<position>` and is stored with the company's progress, so the
 * lists are APPEND-ONLY: never reorder or delete an item, only add at the end.
 *
 * Nothing here states a due date, rate or threshold. The checklist itself says
 * the CA/CS must confirm applicability and dates; the catalog only names the
 * work. Dates live in the company's own filing calendar (filings.ts).
 */

export type ComplianceOwner = "accounts" | "ca" | "ca_cs" | "management" | "auditor" | "hr";

export const OWNER_LABELS: Record<ComplianceOwner, string> = {
  accounts: "Accounts team",
  ca: "CA / tax professional",
  ca_cs: "CA / CS",
  management: "Management / directors",
  auditor: "Statutory auditor",
  hr: "HR + accounts",
};

export interface ComplianceSection {
  key: string;
  /** Number in the README, so the team and the CA talk about the same thing. */
  number: number;
  title: string;
  /** One plain sentence: what this part is about. */
  summary: string;
  owner: ComplianceOwner;
  /** Where in the app this work happens, when there is a place for it. */
  href?: string;
  items: string[];
}

export const COMPLIANCE_SECTIONS: ComplianceSection[] = [
  {
    key: "bookkeeping",
    number: 2,
    title: "Bookkeeping",
    summary: "Every rupee in and out is recorded, with a bill or proof, in the right ledger.",
    owner: "accounts",
    href: "/cashflow-ai/transactions",
    items: [
      "Record all sales invoices, credit notes and debit notes",
      "Record all purchase bills and vendor credit/debit notes",
      "Record customer receipts, advances and refunds",
      "Record every bank transaction",
      "Record cash and petty-cash transactions",
      "Record employee expenses and reimbursements",
      "Record rent, utilities, software and subscriptions",
      "Record marketing and advertising costs",
      "Record professional and consulting fees",
      "Record bank charges, interest and payment-gateway fees",
      "Record fixed-asset purchases and disposals",
      "Record inventory purchases, usage and sales (if applicable)",
      "Record salaries, wages and director remuneration",
      "Record share capital, dividends and shareholder transactions",
      "Record loans, deposits and advances",
      "Record foreign-currency transactions (if any)",
      "Record accruals, provisions and prepaid expenses",
      "Bank and payment-processor ledgers are maintained",
      "Customer and vendor ledgers are maintained",
      "Director, related-party and loan ledgers are maintained",
      "Fixed-asset register and depreciation ledger are maintained",
      "GST input/output, TDS and TCS ledgers are maintained",
      "Payroll and statutory-liability ledgers are maintained",
      "Share-capital and reserve ledgers are maintained",
      "Project / cost-centre tracking is in place where needed",
      "Supporting documents are attached to entries",
      "Invoice numbering has no gaps or duplicates",
      "Access to accounting records follows roles; backups and retention are in place",
      "Opening balances are verified against last year's audited accounts",
      "Suspense and unclassified entries are reviewed and cleared",
      "Manual journal entries are documented and reviewed",
    ],
  },
  {
    key: "bank-recon",
    number: 3,
    title: "Bank, payment-gateway and balance reconciliation",
    summary: "What the books say matches what the bank, Razorpay and cash box actually show.",
    owner: "accounts",
    href: "/cashflow-ai/bank-reconciliation",
    items: [
      "Reconcile every bank account to its statement each month",
      "Reconcile Razorpay / other gateway settlements (gross, fees, taxes on fees, refunds, chargebacks)",
      "Reconcile credit-card statements",
      "Reconcile cash in hand with a physical count",
      "Reconcile loan EMIs with lender statements",
      "Reconcile transfers between own bank accounts",
      "Identify and follow up unidentified receipts",
      "Document every reconciling item with its reason",
    ],
  },
  {
    key: "ledger-recon",
    number: 4,
    title: "Customer, vendor and other ledger reconciliation",
    summary: "Party balances in your books agree with what the other side says.",
    owner: "accounts",
    href: "/cashflow-ai/receivables",
    items: [
      "Reconcile customer statements and ageing",
      "Reconcile vendor statements and ageing",
      "Match customer and vendor advances to invoices / bills",
      "Check for duplicate invoices, bills and payments",
      "Get balance confirmations from major parties",
      "Reconcile employee advances and reimbursements",
      "Reconcile related-party balances",
      "Review write-offs and doubtful debts",
      "Review unusual balances (credit balances in receivables, debit balances in payables)",
    ],
  },
  {
    key: "month-close",
    number: 5,
    title: "Monthly closing and reporting",
    summary: "A fixed routine at month-end so the books are final before the month is locked.",
    owner: "accounts",
    href: "/cashflow-ai/settings/fiscal-periods",
    items: [
      "Book accruals, prepaid expenses and provisions",
      "Post depreciation and other period-end provisions",
      "Update inventory and cost of goods sold (if applicable)",
      "Reconcile payroll and statutory dues",
      "Reconcile GST and TDS ledgers",
      "Review the trial balance",
      "Prepare profit and loss, balance sheet and cash-flow statement",
      "Review receivable and payable ageing",
      "Review margins and budget vs actual",
      "Review unusual entries",
      "Lock the period after review",
      "Share reports with management",
    ],
  },
  {
    key: "gst",
    number: 6,
    title: "GST",
    summary: "Registration, correct invoices, returns, input credit and payments for GST.",
    owner: "ca",
    href: "/cashflow-ai/gst",
    items: [
      "GST registration details are correct and current",
      "HSN/SAC codes and place of supply are set correctly",
      "Invoices carry every particular GST law requires",
      "GSTR-1 is prepared and filed",
      "GSTR-3B is prepared, tax paid and filed",
      "GSTR-2B is reconciled with purchase books",
      "Input tax credit eligibility, blocked credit and reversals are checked",
      "Reverse charge (RCM) purchases are identified and accounted",
      "GST ledgers (cash, credit, liability) agree with books",
      "GST challans are saved",
      "Exports, SEZ supplies and LUT are handled correctly",
      "E-invoice and e-way bill applicability is assessed",
      "Annual return (GSTR-9) and reconciliation (GSTR-9C) are assessed",
      "GST notices and demands are tracked to closure",
    ],
  },
  {
    key: "tds",
    number: 7,
    title: "TDS and TCS",
    summary: "Tax deducted on payments is correct, deposited on time, reported and certified.",
    owner: "ca",
    href: "/cashflow-ai/tds",
    items: [
      "TDS sections, thresholds and rates are confirmed for each payment type",
      "PAN of every payee is collected and validated",
      "TDS is deducted on every applicable payment",
      "TDS is deposited by the due date; challans are saved",
      "Quarterly returns (24Q / 26Q / 27Q) are filed",
      "Form 16 / 16A certificates are issued",
      "Books are reconciled with Form 26AS / AIS / TIS",
      "TCS applicability is assessed and, if applicable, collected and deposited",
      "Lower or nil deduction certificates are tracked",
      "Short deduction, interest and late fees are reviewed",
      "Payments to non-residents are assessed (Form 15CA / 15CB)",
    ],
  },
  {
    key: "income-tax",
    number: 8,
    title: "Income tax",
    summary: "From accounting profit to taxable income, advance tax, return and notices.",
    owner: "ca",
    href: "/cashflow-ai/income-tax",
    items: [
      "Taxable income is computed from accounting profit",
      "Disallowed and conditionally allowed expenses are reviewed",
      "Depreciation is computed under income-tax rules and compared with Companies Act depreciation",
      "Brought-forward losses and unabsorbed depreciation are tracked",
      "Current tax and deferred tax are computed",
      "Advance tax instalments are computed and paid on time",
      "Tax challans, refunds and demands are tracked",
      "Tax audit applicability is assessed (3CA / 3CB / 3CD)",
      "MAT applicability is assessed",
      "Income-tax return (ITR-6) is prepared, filed and e-verified",
      "Income-tax notices are tracked to closure",
    ],
  },
  {
    key: "payroll",
    number: 9,
    title: "Payroll and employee accounting",
    summary: "Salaries, deductions and employee dues are booked and agree with what is paid to the government.",
    owner: "hr",
    href: "/cashflow-ai/products/hrms",
    items: [
      "Monthly payroll is processed and approved",
      "Salary expense and employee deductions are booked in the ledger",
      "PF, ESI, professional tax and TDS on salary are computed correctly",
      "Statutory payments are made by their due dates",
      "Employee advances and loans are tracked",
      "Full-and-final settlements are accounted",
      "Gratuity, bonus and leave-encashment liabilities are assessed",
      "Professional tax, labour welfare fund and state obligations are assessed",
      "Tax declarations and investment proofs are collected",
      "Form 16 and other tax documents are issued",
      "Payroll expense and statutory dues are reconciled at year-end",
    ],
  },
  {
    key: "payables",
    number: 10,
    title: "Accounts payable and vendor payment controls",
    summary: "Only genuine, correct bills are paid, to the right bank account, with the right approval.",
    owner: "accounts",
    href: "/cashflow-ai/payables",
    items: [
      "Vendor invoices are verified before booking",
      "Invoices are matched to POs, contracts or proof of service",
      "Invoice number, date, amount, GSTIN and tax are verified",
      "Vendor bank details are validated; changes are verified independently",
      "Duplicate invoice and duplicate payment risks are checked",
      "Payment schedule and due-date report are prepared",
      "TDS and RCM are applied where required",
      "Vendor advances and security deposits are tracked",
      "Payment terms, overdue bills and disputes are monitored",
      "MSME vendors and their payment timelines are identified",
      "Vendor confirmations and payment evidence are kept",
      "Payment approvals follow the internal authorisation policy",
    ],
  },
  {
    key: "receivables",
    number: 11,
    title: "Accounts receivable, sales and collections",
    summary: "Customers are billed correctly, collections are matched to invoices, overdue money is chased.",
    owner: "accounts",
    href: "/cashflow-ai/receivables",
    items: [
      "Customer invoices and credit/debit notes are compliant",
      "Customer billing details and GSTIN are verified",
      "Invoices, refunds, credit notes and adjustments are tracked",
      "Customer-wise outstanding and ageing reports are maintained",
      "Overdue receivables are followed up",
      "Collections are reconciled to invoices and customer accounts",
      "Gateway fees, taxes on fees, refunds and net settlements are recorded correctly",
      "Customer advances and unallocated receipts are reconciled",
      "Bad debts and doubtful receivables are reviewed",
      "Sales agree with GST returns and financial-statement revenue",
      "Exports and foreign-currency receipts are tracked (if any)",
    ],
  },
  {
    key: "annual-accounts",
    number: 12,
    title: "Annual financial statements and statutory audit",
    summary: "Year-end books closed, statements prepared, audited, approved and filed.",
    owner: "auditor",
    items: [
      "Books are closed for the financial year ending 31 March",
      "Opening balances agree with the previous audited accounts",
      "Bank, customer, vendor, loan, tax and statutory balances are reconciled",
      "Final trial balance is prepared",
      "Balance sheet and statement of profit and loss are prepared",
      "Cash-flow statement is prepared where required",
      "Notes to accounts and accounting policies are prepared",
      "Fixed-asset, depreciation, inventory, receivable and payable schedules are prepared",
      "Loan, advance, related-party and contingent-liability schedules are prepared",
      "GST / TDS reconciliation statements are prepared",
      "Current / deferred tax workings are prepared",
      "Director remuneration and related-party disclosures are prepared",
      "Audit schedules and supporting evidence are ready",
      "Auditor queries and proposed adjustments are resolved",
      "Statutory auditor's report is obtained",
      "Financial statements and Board's Report are finalised",
      "Board approval and signing are completed",
      "Financial statements are presented to shareholders at the AGM",
      "Approved statements are filed with the ROC",
      "Audit observations and corrective actions are tracked",
    ],
  },
  {
    key: "roc-filings",
    number: 13,
    title: "MCA / ROC annual and event-based filings",
    summary: "Forms filed with the Registrar of Companies, yearly and whenever something changes.",
    owner: "ca_cs",
    href: "/cashflow-ai/compliance/calendar",
    items: [
      "AOC-4 (or applicable variant) — financial statements",
      "MGT-7 / MGT-7A — annual return",
      "ADT-1 — auditor appointment, if applicable",
      "DIR-3 KYC — director KYC as per current rules",
      "DPT-3 — deposits / specified outstanding receipts, if applicable",
      "MSME Form I — dues to micro and small enterprises, if applicable",
      "MGT-14 — specified resolutions, if applicable",
      "AOC-4 CFS / XBRL / BEN-2 — if the company falls under them",
      "INC-20A — commencement of business, if applicable",
      "DIR-12 — director / KMP changes",
      "INC-22 — registered-office change",
      "SH-7 — authorised capital change",
      "PAS-3 — return of allotment",
      "CHG-1 / CHG-4 — charge created, modified or satisfied",
      "Name change, constitutional amendments and special resolutions filings",
      "Strike-off / closure filings, if the company is closing",
      "Any other filing triggered by a transaction, change or notice",
      "Every filing acknowledgement is saved",
    ],
  },
  {
    key: "board-records",
    number: 14,
    title: "Board, AGM and statutory company records",
    summary: "Meetings, minutes and registers that company law requires you to keep.",
    owner: "ca_cs",
    items: [
      "Register of members is maintained",
      "Register of directors and KMP is maintained",
      "Register of contracts in which directors are interested is maintained",
      "Register of charges is maintained, if applicable",
      "Board / general-meeting notices, agendas, attendance and minutes are kept",
      "Board papers and resolutions are prepared",
      "Minutes are completed within the prescribed time",
      "Directors' interest disclosures (MBP-1) are obtained",
      "Directors' non-disqualification declarations (DIR-8) are obtained",
      "Minimum Board-meeting frequency is met",
      "AGM notice, agenda and documents are prepared",
      "AGM is held within the statutory period",
      "Board's Report and annexures are prepared",
      "Shareholder resolutions and attendance records are kept",
      "Shareholding records, share certificates and transfers are maintained",
      "Auditor appointment, tenure and rotation are reviewed",
      "Registers are kept at the required place and in the required form",
      "Related-party transactions are reviewed and approved",
      "Annual-return certification and additional reporting are assessed",
    ],
  },
  {
    key: "capital-loans",
    number: 15,
    title: "Share capital, directors, loans and corporate changes",
    summary: "Who owns the company, who runs it, and money coming in from or going to them.",
    owner: "ca_cs",
    items: [
      "Authorised, issued, subscribed and paid-up capital are verified",
      "Share capital and shareholder records agree with the books",
      "Share certificates and stamping records are maintained",
      "Allotments, transfers, buybacks, rights and bonus issues are reviewed",
      "Dematerialisation requirement is assessed",
      "Director DIN, DSC, KYC and appointment / cessation records are verified",
      "Director remuneration and reimbursements are recorded correctly",
      "Loans to / from directors, shareholders and related parties are reviewed under law",
      "Receipts are assessed: deposit or another kind of funding?",
      "Loan agreements, sanction letters, repayment schedules and interest workings are kept",
      "Guarantees, security and collateral are reviewed",
      "Registered-office, name, objects and constitutional changes are reviewed",
      "Shareholding changes and beneficial-ownership declarations are reviewed",
      "Related-party contracts and approvals are tracked",
      "Dividend declaration, payment and compliance are reviewed, if applicable",
    ],
  },
  {
    key: "assets-inventory",
    number: 16,
    title: "Fixed assets, depreciation and inventory",
    summary: "What the company owns, what it is worth after wear, and the stock on hand.",
    owner: "accounts",
    href: "/cashflow-ai/assets",
    items: [
      "Fixed-asset register is maintained",
      "Purchases, sales, transfers and disposals are recorded",
      "Invoices and ownership documents are verified",
      "Depreciation is calculated under the Companies Act",
      "Depreciation is calculated separately under income-tax rules",
      "Impairment, useful life and residual value are reviewed",
      "Assets are physically verified where appropriate",
      "Fixed assets are reconciled to the general ledger",
      "Stock movement and valuation records are maintained, if applicable",
      "Opening stock, purchases, closing stock and COGS are reconciled",
      "Obsolete, damaged and slow-moving stock is accounted",
      "Inventory is reconciled with purchase and sales records",
    ],
  },
  {
    key: "loans-investments",
    number: 17,
    title: "Loans, advances, investments and interest",
    summary: "Money borrowed, lent or invested — balances, interest and legal limits.",
    owner: "accounts",
    items: [
      "Register of loans taken and loans given is maintained",
      "Balances are reconciled with lender statements",
      "Principal and interest schedules are prepared",
      "EMI payments are reconciled with bank statements",
      "Current / non-current classification is reviewed",
      "Director and shareholder loans and advances are tracked",
      "Fixed deposits and other investments are reconciled",
      "Accrued interest receivable / payable is accounted",
      "Guarantees, security and collateral are reviewed",
      "Legal limits and reporting for loans, investments and guarantees are checked",
      "Interest income agrees with bank certificates and tax records",
    ],
  },
  {
    key: "mis",
    number: 18,
    title: "Cash flow, budgets and management reporting",
    summary: "Where the money is, where it will be, and how the business is doing against plan.",
    owner: "accounts",
    href: "/cashflow-ai/reports/cash-flow",
    items: [
      "Monthly cash-flow and cash-position reports are prepared",
      "Cash-flow forecast is prepared",
      "Expected collections and vendor payments are tracked",
      "Working capital is monitored",
      "Monthly operating expenses and budget variance are tracked",
      "Revenue, gross margin and profitability are analysed",
      "Department / project profitability is reviewed where required",
      "Burn rate / runway is tracked where relevant",
      "Loan repayments and commitments are monitored",
      "Management reports for directors are prepared",
      "Unusual expenditure and cost-saving opportunities are identified",
    ],
  },
  {
    key: "other-laws",
    number: 19,
    title: "Other statutory and regulatory compliance",
    summary: "Registrations and licences beyond tax and company law — only those that apply to you.",
    owner: "management",
    href: "/cashflow-ai/compliance/calendar",
    items: [
      "EPF — registration, contributions, returns, employee records",
      "ESI — registration, contributions, returns, employee records",
      "Professional tax — registration, deductions and returns in applicable states",
      "Labour welfare fund — contributions and filings where applicable",
      "Shops and Establishments — state registration and compliance",
      "POSH — Internal Committee and annual reporting where applicable",
      "Gratuity and bonus — eligibility, accounting, statutory requirements",
      "Trade and municipal licences where required",
      "IEC — for import / export businesses",
      "FEMA / RBI — foreign investment, remittances, external borrowing, reporting",
      "Transfer pricing — documentation and Form 3CEB where applicable",
      "SEBI, RBI, FCRA or sector-specific compliance where the business is covered",
      "Data-protection and industry-specific regulatory requirements",
      "Environmental, factory or other operational licences where required",
    ],
  },
  {
    key: "handover",
    number: 21,
    title: "Documents and evidence the CA should provide",
    summary: "The pack you should receive from your CA — tick each as it arrives.",
    owner: "ca",
    items: [
      "Updated books and general-ledger export",
      "Monthly trial balance",
      "Bank reconciliation for each bank account",
      "Customer / vendor reconciliation and ageing reports",
      "GST returns, reconciliations and challans",
      "TDS / TCS returns, challans and certificates",
      "Payroll summaries and statutory-payment evidence",
      "Monthly P&L, balance sheet and agreed MIS",
      "Final audited financial statements and audit report",
      "Income-tax computation and ITR acknowledgement",
      "Tax audit report, where applicable",
      "Fixed-asset and depreciation schedules",
      "Loan and interest schedules",
      "Board's Report and AGM records",
      "MCA / ROC forms and filing acknowledgements",
      "Compliance calendar with upcoming deadlines",
      "List of pending notices, unresolved reconciliations and outstanding liabilities",
      "Year-end schedules and supporting working papers",
      "Accounting-data export, backup and handover records",
    ],
  },
];

export interface ComplianceItem {
  key: string;
  sectionKey: string;
  title: string;
}

export function itemKey(sectionKey: string, index: number): string {
  return `${sectionKey}.${index + 1}`;
}

export const COMPLIANCE_ITEMS: ComplianceItem[] = COMPLIANCE_SECTIONS.flatMap((s) =>
  s.items.map((title, i) => ({ key: itemKey(s.key, i), sectionKey: s.key, title }))
);

const ITEM_KEYS = new Set(COMPLIANCE_ITEMS.map((i) => i.key));
export function isKnownItemKey(key: string): boolean {
  return ITEM_KEYS.has(key);
}

export function getSection(key: string): ComplianceSection | undefined {
  return COMPLIANCE_SECTIONS.find((s) => s.key === key);
}

export type ItemStatus = "todo" | "in_progress" | "done" | "not_applicable";
export const ITEM_STATUSES: { value: ItemStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "not_applicable", label: "Not applicable" },
];

export interface SectionProgress {
  sectionKey: string;
  total: number;
  done: number;
  inProgress: number;
  notApplicable: number;
  /** Items that count towards progress (everything except not-applicable). */
  applicable: number;
  /** 0–100, of applicable items. 100 when nothing applies. */
  percent: number;
}

/** Pure: progress per section from the saved statuses (missing = to do). */
export function computeProgress(statuses: Map<string, ItemStatus>): SectionProgress[] {
  return COMPLIANCE_SECTIONS.map((s) => {
    let done = 0;
    let inProgress = 0;
    let notApplicable = 0;
    s.items.forEach((_, i) => {
      const st = statuses.get(itemKey(s.key, i)) ?? "todo";
      if (st === "done") done += 1;
      else if (st === "in_progress") inProgress += 1;
      else if (st === "not_applicable") notApplicable += 1;
    });
    const total = s.items.length;
    const applicable = total - notApplicable;
    return {
      sectionKey: s.key,
      total,
      done,
      inProgress,
      notApplicable,
      applicable,
      percent: applicable === 0 ? 100 : Math.round((done / applicable) * 100),
    };
  });
}
