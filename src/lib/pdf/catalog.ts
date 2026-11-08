/**
 * Every PDF the system produces, described (pure; shared by the page and the server). The list is the code's own: a new PDF is added
 * here once, with a sample for its preview (`samples.ts`), and every company sees it. What each company sees about it — when it was
 * last made, how often, by whom — comes from its own activity (`activity.ts`), never from this file.
 */

export type PdfCategory = "Invoices & receipts" | "Certificates" | "Reports" | "HR" | "Procurement" | "Projects" | "Contracts & procedures";

export interface PdfVariant {
  key: string;
  label: string;
}

export interface PdfUse {
  label: string;
  /** A page of the app where it is used, when there is one. */
  href?: string;
}

export interface PdfType {
  /** Stable id; also the key activity is recorded under. */
  key: string;
  name: string;
  /** The product (panel key) that makes it, or "account" for SelfRun's own billing. */
  product: string;
  category: PdfCategory;
  description: string;
  /** What is on the document. */
  contains: string[];
  /** What causes it to be made. */
  generated: string;
  /** Where in the app people open it. */
  usedIn: PdfUse[];
  /** Who can open it. */
  access: string;
  /** How it reaches people. */
  delivery: string;
  /** Notification-center events that tell people about it (see `event-names.ts`). */
  events: string[];
  /** The API route that makes it (documentation for admins and developers). */
  route: string;
  fileName: string;
  /** Other formats offered next to the PDF. */
  alsoAs?: string[];
  /** One entry per kind of document made by the same renderer (report types, invoice vs receipt …). */
  variants?: PdfVariant[];
  /** Carries the company's letterhead (name, logo, address, theme colours). SelfRun's own billing documents carry SelfRun's. */
  letterhead: "company" | "platform";
  /** "active": produced and used. "browser": printed by the browser from a page (nothing is generated on the server). "unused": built, but no screen produces it yet. */
  status: "active" | "browser" | "unused";
  /** Why it has no server-made preview. */
  note?: string;
}

const staff = "People with access to the product";

export const PDF_TYPES: PdfType[] = [
  {
    key: "saas_invoice", name: "Subscription tax invoice & credit note", product: "account", category: "Invoices & receipts",
    description: "The GST tax invoice for each subscription payment, and the credit note when a payment is refunded.",
    contains: ["Seller and buyer details with GSTIN", "Plan, period and line items", "CGST / SGST / IGST breakdown", "Total, place of supply, terms"],
    generated: "On demand, when someone opens or downloads it. The invoice itself is created automatically when a payment succeeds; a credit note when a refund is made.",
    usedIn: [{ label: "Settings → Invoices & payments", href: "/commandos/settings/billing/invoices" }, { label: "Platform Console → Invoices (SelfRun staff)" }],
    access: "Directors, for their own company only (SelfRun staff with invoice access can open any).",
    delivery: "Downloaded from the page. An email tells the Director it is ready (with the link); the PDF is not attached.",
    events: ["billing_invoice"], route: "/api/platform/billing/invoices/{id}/pdf", fileName: "<invoice number>.pdf",
    variants: [{ key: "invoice", label: "Tax invoice" }, { key: "credit_note", label: "Credit note" }], letterhead: "platform", status: "active",
  },
  {
    key: "transaction_receipt", name: "Subscription payment receipt", product: "account", category: "Invoices & receipts",
    description: "A receipt for any successful payment or refund on the subscription, including failed attempts' record.",
    contains: ["Receipt number, date and method", "Amount and plan", "Payer details", "Provider payment reference"],
    generated: "On demand, when someone downloads it from the payment history.",
    usedIn: [{ label: "Settings → Invoices & payments → Payment history", href: "/commandos/settings/billing/invoices" }],
    access: "Directors, for their own company only.", delivery: "Downloaded from the page; never emailed.", events: [],
    route: "/api/platform/billing/transactions/{id}/receipt", fileName: "<receipt number>.pdf", letterhead: "platform", status: "active",
  },
  {
    key: "fms_invoice", name: "Customer invoice", product: "fms", category: "Invoices & receipts",
    description: "The invoice you send to a customer, with line items, tax and payment terms.",
    contains: ["Your letterhead", "Customer, invoice number, dates, PO number", "Line items with tax", "Subtotal, discount, tax, total and amount due", "Payment terms and notes"],
    generated: "On demand, when someone opens the invoice's PDF. The invoice is created in the product; nothing is generated until it is opened.",
    usedIn: [{ label: "CashFlow → Invoices → open an invoice → PDF", href: "/cashflow-ai/invoices" }],
    access: "People who can view commercial finance (finance roles and Directors).",
    delivery: "Opened or downloaded by your team and handed to the customer; customers can also open it in their portal (see below). Not attached to emails.",
    events: ["fms_invoice_created", "fms_invoice_paid", "fms_invoices_due_soon", "fms_invoices_overdue"], route: "/api/cashflow-ai/invoices/{invoiceNumber}", fileName: "<invoice number>.pdf", letterhead: "company", status: "active",
  },
  {
    key: "portal_invoice", name: "Invoice in the client portal", product: "portal", category: "Invoices & receipts",
    description: "The same invoice layout, opened by your client from their portal.",
    contains: ["Your letterhead", "The client's own invoice with line items, tax and totals"],
    generated: "On demand, when the client opens it in the portal.",
    usedIn: [{ label: "Client & Student Portal → Invoices", href: "/clientos/invoices" }],
    access: "The signed-in client, for their own invoices only.", delivery: "Opened or downloaded by the client in the portal.", events: [],
    route: "/api/clientos/invoices/{invoiceNumber}", fileName: "<invoice number>.pdf", letterhead: "company", status: "active",
  },
  {
    key: "fms_receipt", name: "Customer payment receipt", product: "fms", category: "Invoices & receipts",
    description: "The receipt for a payment a customer made against one or more invoices.",
    contains: ["Your letterhead", "Receipt number, date, method and reference", "Invoices the payment was applied to", "Any advance left over"],
    generated: "On demand, when someone opens the receipt's PDF.",
    usedIn: [{ label: "CashFlow → Receipts → open a receipt → PDF", href: "/cashflow-ai/receipts" }],
    access: "People who can view commercial finance.", delivery: "Opened or downloaded by your team and handed to the customer.", events: ["fms_payment_received", "fms_receipt_voided"],
    route: "/api/cashflow-ai/receipts/{receiptNumber}", fileName: "<receipt number>.pdf", letterhead: "company", status: "active",
  },
  {
    key: "fms_payment_receipt", name: "Online payment receipt", product: "fms", category: "Invoices & receipts",
    description: "The receipt a customer gets after paying a payment link online.",
    contains: ["Your letterhead", "Receipt number, date and time", "What it was for, the method and the references (payment id, UTR)", "Amount received"],
    generated: "On demand, when the customer opens or downloads it from the page they paid on.",
    usedIn: [{ label: "The payment page the customer sees after paying", href: "/cashflow-ai/payment-links" }],
    access: "Whoever holds the paid payment link.", delivery: "Downloaded or shared by the customer.", events: ["fms_payment_received"],
    route: "/api/cashflow-ai/payments/receipt/{token}", fileName: "Receipt-<number>.pdf", letterhead: "company", status: "active",
  },
  {
    key: "fms_report", name: "Finance reports", product: "fms", category: "Reports",
    description: "Revenue, expense, tax and budget-versus-actual reports for a period.",
    contains: ["Report title and period", "Sections with line values", "Totals"],
    generated: "On demand, when someone chooses PDF on the reports page, for the dates they pick.",
    usedIn: [{ label: "CashFlow → Reports", href: "/cashflow-ai/reports" }],
    access: "People who can view finance reports.", delivery: "Downloaded from the page.", events: [],
    route: "/api/cashflow-ai/reports/{type}?format=pdf", fileName: "<report>.pdf", alsoAs: ["CSV", "Excel"],
    variants: [{ key: "revenue", label: "Revenue report" }, { key: "expense", label: "Expense report" }, { key: "tax", label: "Tax summary" }, { key: "budget-vs-actual", label: "Budget vs actual" }], letterhead: "company", status: "active",
  },
  {
    key: "tms_invoice", name: "Fee receipt (student payment)", product: "tms", category: "Invoices & receipts",
    description: "The receipt a student gets for a fee payment, with what has been paid and what is pending.",
    contains: ["Your institute's letterhead", "Student, programme and batch", "Amount, method, transaction reference", "Total fees, discount, paid to date, pending"],
    generated: "On demand, when staff or the student open it for a recorded payment.",
    usedIn: [{ label: "CohortAI → Payments → a payment", href: "/cohort-ai/payments" }, { label: "CohortAI → My payments (student)", href: "/cohort-ai/me/payments" }],
    access: "Training staff, and the student for their own payments.", delivery: "Opened or downloaded in the product; not emailed.", events: [],
    route: "/api/cohort-ai/invoices/{invoiceNumber}", fileName: "<receipt number>.pdf", letterhead: "company", status: "active",
  },
  {
    key: "tms_certificate", name: "Training certificate", product: "tms", category: "Certificates",
    description: "The certificate issued to a student for completing a programme, with a code anyone can verify.",
    contains: ["Student and programme", "Certificate number and issue date", "Verification code and link", "Signatory"],
    generated: "On demand, when staff or the student open it. The certificate record is created when it is issued; it can later be revoked or reissued under a new number.",
    usedIn: [{ label: "CohortAI → Certificates", href: "/cohort-ai/certificates" }, { label: "CohortAI → My certificates (student)", href: "/cohort-ai/me/certificates" }],
    access: "Training staff, and the student for their own certificates.", delivery: "Downloaded in the product. The student is notified when it is issued, reissued or revoked.",
    events: ["certificate_issued", "certificate_reissued", "certificate_reinstated", "certificate_revoked_alert"], route: "/api/cohort-ai/certificates/{id}/pdf", fileName: "<certificate number>.pdf", letterhead: "company", status: "active",
  },
  {
    key: "tms_report", name: "Training reports", product: "tms", category: "Reports",
    description: "Student, batch, programme, revenue, placement, certificate and attendance reports.",
    contains: ["Report title and the figures it covers", "A table of the rows"],
    generated: "On demand, when someone chooses PDF on the reports page.",
    usedIn: [{ label: "CohortAI → Reports", href: "/cohort-ai/reports" }],
    access: "People who manage training.", delivery: "Downloaded from the page.", events: [],
    route: "/api/cohort-ai/reports/{type}?format=pdf", fileName: "<report>.pdf", alsoAs: ["CSV", "Excel"],
    variants: [
      { key: "students", label: "Student report" }, { key: "batches", label: "Batch report" }, { key: "programs", label: "Program report" }, { key: "revenue", label: "Revenue report" },
      { key: "placements", label: "Placement report" }, { key: "certificates", label: "Certificate report" }, { key: "attendance", label: "Attendance report" },
    ], letterhead: "company", status: "active",
  },
  {
    key: "ots_certificate", name: "Test certificate", product: "ots", category: "Certificates",
    description: "The certificate given to a candidate who passes a test, with a code anyone can verify.",
    contains: ["Candidate, test and score", "Certificate number, issue and validity dates", "Verification code and link", "Signatory"],
    generated: "On demand, when staff or the candidate open it. The certificate is issued when a result is published; it can later be revoked or restored.",
    usedIn: [{ label: "EvalIQ → Certificates", href: "/evaliq/certificates" }, { label: "EvalIQ → My results (candidate)", href: "/evaliq/my-results" }],
    access: "Test staff, and the candidate for their own.", delivery: "Downloaded in the product. The candidate is notified when it is issued, revoked or restored.",
    events: ["ots_certificate", "ots_certificate_revoked_alert", "ots_certificate_restored"], route: "/api/evaliq/certificates/{id}/pdf", fileName: "<certificate number>.pdf", letterhead: "company", status: "active",
  },
  {
    key: "prms_item", name: "Expense / purchase invoice & receipt", product: "prms", category: "Procurement",
    description: "A formal invoice or receipt for an expense, purchase, subscription or asset recorded in SpendIQ.",
    contains: ["Your letterhead and GSTIN", "Vendor, requester, category and date", "Line items, subtotal and tax", "Payment method and reference"],
    generated: "On demand, when staff choose the invoice or receipt download on an item.",
    usedIn: [{ label: "SpendIQ → Expenses, Procurement and Subscriptions → PDF buttons", href: "/spendiq/expenses" }],
    access: staff + ".", delivery: "Downloaded from the item's row.", events: ["expense_approved", "expense_reimbursed"],
    route: "/api/spendiq/items/{id}/pdf?type=invoice|receipt", fileName: "INVOICE_<code>.pdf / RECEIPT_<code>.pdf",
    variants: [{ key: "invoice", label: "Invoice" }, { key: "receipt", label: "Receipt" }], letterhead: "company", status: "active",
  },
  {
    key: "prms_payment", name: "Vendor payment receipt", product: "prms", category: "Procurement",
    description: "The receipt for a payment made to a vendor against an invoice.",
    contains: ["Your letterhead", "Vendor, invoice and payment code", "Amount, method, reference and TDS deducted"],
    generated: "On demand, when finance staff open it from the payments list.",
    usedIn: [{ label: "SpendIQ → Payments", href: "/spendiq/payments" }],
    access: "People who manage finance.", delivery: "Downloaded from the page.", events: ["invoice_paid"],
    route: "/api/spendiq/payments/{code}", fileName: "<payment code>.pdf", letterhead: "company", status: "active",
  },
  {
    key: "prms_po", name: "Purchase order", product: "prms", category: "Procurement",
    description: "The purchase order you send to a vendor.",
    contains: ["Your letterhead", "Vendor, PO number, delivery address and date", "Items, quantities and rates", "Subtotal, GST and total", "Payment terms and notes"],
    generated: "On demand, when someone opens the PO's PDF (before or after it is issued).",
    usedIn: [{ label: "SpendIQ → Purchase orders → open a PO", href: "/spendiq/purchase-orders" }],
    access: "People who manage procurement or finance.", delivery: "Downloaded or printed and sent to the vendor by your team. It is not emailed automatically.", events: ["po_issued", "po_cancelled_alert"],
    route: "/api/spendiq/purchase-orders/{poNumber}", fileName: "<PO number>.pdf", letterhead: "company", status: "active",
  },
  {
    key: "prms_report", name: "Procurement & spend reports", product: "prms", category: "Reports",
    description: "Expense, procurement, vendor, budget, asset, SaaS, infrastructure, inventory, invoice and profit-centre reports.",
    contains: ["Report title and the figures it covers", "A table of the rows"],
    generated: "On demand, when someone chooses PDF on the reports page.",
    usedIn: [{ label: "SpendIQ → Reports", href: "/spendiq/reports" }],
    access: "People who can view reports.", delivery: "Downloaded from the page.", events: [],
    route: "/api/spendiq/reports/{type}?format=pdf", fileName: "<report>.pdf", alsoAs: ["CSV", "Excel"],
    variants: [
      { key: "expense", label: "Expense report" }, { key: "procurement", label: "Procurement report" }, { key: "vendor", label: "Vendor report" }, { key: "budget", label: "Budget report" },
      { key: "asset", label: "Asset report" }, { key: "saas", label: "SaaS report" }, { key: "infrastructure", label: "Infrastructure report" }, { key: "inventory", label: "Inventory report" },
      { key: "invoice", label: "Invoice report" }, { key: "profit-center", label: "Profit centre report" },
    ], letterhead: "company", status: "active",
  },
  {
    key: "pms_billing", name: "Project invoice & receipt", product: "pms", category: "Projects",
    description: "An invoice or receipt for a client project, by its billing model (fixed cost, hourly, milestone or sprint).",
    contains: ["Your letterhead", "Client and project", "Billing breakdown: hours, milestones or sprints", "Deductions and total"],
    generated: "On demand, when staff choose the download on a project.",
    usedIn: [{ label: "SprintOS → Dashboard → a project → Invoice / Receipt buttons", href: "/sprintos" }],
    access: staff + ".", delivery: "Downloaded from the project's row.", events: [],
    route: "/api/sprintos/projects/{id}/pdf?type=invoice|receipt", fileName: "PROJECT_<INVOICE|RECEIPT>_<project code>.pdf",
    variants: [{ key: "invoice", label: "Invoice" }, { key: "receipt", label: "Receipt" }], letterhead: "company", status: "active",
  },
  {
    key: "pms_report", name: "Project costing report", product: "pms", category: "Projects",
    description: "A project's financials, task progress and each person's contribution for a period.",
    contains: ["Project summary and status", "Revenue, cost and margin", "Task progress", "Contribution by person"],
    generated: "On demand, when someone chooses PDF on a project's costing page.",
    usedIn: [{ label: "SprintOS → Costing → a project", href: "/sprintos/costing" }],
    access: "People who can view project costing.", delivery: "Downloaded from the page.", events: [],
    route: "/api/sprintos/reports/{projectId}?format=pdf", fileName: "<project>.pdf", alsoAs: ["Excel"], letterhead: "company", status: "active",
  },
  {
    key: "hrms_payslip", name: "Payslip", product: "hrms", category: "HR",
    description: "An employee's monthly payslip with earnings, deductions, year-to-date totals and the payment details.",
    contains: ["Your letterhead and registrations", "Employee details, bank and statutory numbers", "Earnings, deductions, employer contributions", "Net pay in words", "Payment status and reference"],
    generated: "On demand, when HR or the employee open it. The payslip is created when payroll is run and published; a provisional payslip is marked as such.",
    usedIn: [{ label: "TalentOS → Payroll → a run", href: "/talentos/payroll" }, { label: "TalentOS → My salary (employee)", href: "/talentos/me/salary" }],
    access: "People who run or manage payroll, and the employee for their own payslips.", delivery: "Downloaded in the product (it can also be printed from the payslip page). The employee is notified when it is published; it is not emailed.",
    events: ["payslip_published", "payroll_ready", "salary_paid"], route: "/api/talentos/payslips/{id}/pdf", fileName: "<employee>-<month>.pdf", letterhead: "company", status: "active",
  },
  {
    key: "lpms_document", name: "Contract document (PDF output)", product: "lpms", category: "Contracts & procedures",
    description: "The PDF output of a ContractFlow document built from a template, with its variables filled in.",
    contains: ["Header and footer blocks", "The template's text, lists and tables with variables filled in"],
    generated: "The PDF writer is built into ContractFlow, but no screen asks for a PDF yet, so none is produced today.",
    usedIn: [], access: "—", delivery: "—", events: ["lpms_published", "lpms_signature_requested"],
    route: "(not connected to a route yet)", fileName: "<document number>.pdf", letterhead: "company", status: "unused", note: "No screen produces this PDF yet, so there is nothing to preview or count.",
  },
  {
    key: "sop_print", name: "Procedure (print / save as PDF)", product: "sop", category: "Contracts & procedures",
    description: "A published procedure, printed from the page. People use the browser's print dialog and choose “Save as PDF”.",
    contains: ["The procedure as shown on the page"],
    generated: "When a person chooses Print on a procedure. The browser makes the PDF on their own device; nothing is generated or stored on the server.",
    usedIn: [{ label: "PlayBook → a procedure → Print", href: "/playbook-ai/library" }],
    access: "People who can read the procedure.", delivery: "Printed or saved by the person on their device.", events: ["sop_assigned", "sop_updated"],
    route: "(browser print)", fileName: "chosen by the person", letterhead: "company", status: "browser", note: "Made by the browser from the page, so there is no server-made preview and no activity to count.",
  },
];

export const PDF_BY_KEY = new Map(PDF_TYPES.map((t) => [t.key, t]));
export const pdfCategories = (): PdfCategory[] => [...new Set(PDF_TYPES.map((t) => t.category))];
