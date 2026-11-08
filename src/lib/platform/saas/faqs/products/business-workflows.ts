import { productPath } from "@/lib/platform/saas/product-routes";
import type { FaqHubGroup } from "@/lib/platform/saas/faqs";

export const BUSINESS_WORKFLOWS_FAQS: FaqHubGroup[] = [
  {
    id: "cashflow-ai",
    title: "SelfRun CashFlow AI",
    href: productPath("fms"),
    items: [
      {
        q: "Which customer records does CashFlow use for invoicing?",
        a: "Invoices select an existing SprintOS client as the customer rather than creating a separate finance customer record; the invoice keeps a customer-name snapshot for the invoice.",
        evidence: ["src/lib/products/cashflow-ai/invoices.ts:30-45", "src/app/(products)/cashflow-ai/(protected)/invoices/actions.ts:57-81"],
      },
      {
        q: "Can I assign an invoice to a project?",
        a: "Yes. An invoice can retain a project reference alongside its client, so finance records can be associated with a SprintOS project.",
        evidence: ["src/lib/products/cashflow-ai/invoices.ts:36-45", "src/app/(products)/cashflow-ai/(protected)/invoices/actions.ts:75-81"],
      },
      {
        q: "What information goes on an invoice?",
        a: "The invoice action accepts a customer, optional project, invoice and due dates, line items, discount, currency, payment terms, purchase-order number and notes.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/invoices/actions.ts:42-81"],
      },
      {
        q: "How are invoice line items entered?",
        a: "Each non-empty line description is saved with quantity, unit price and tax rate; at least one line is required to create an invoice.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/invoices/actions.ts:42-68"],
      },
      {
        q: "Can I use an invoice discount?",
        a: "Yes. Invoice input includes a discount value, which is passed into the invoice pricing logic with the line items.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/invoices/actions.ts:75-82", "src/lib/products/cashflow-ai/invoices.ts:191-220"],
      },
      {
        q: "Can invoice dates and due dates be different?",
        a: "Yes. The invoice and due dates are separate required date fields; the action rejects either one if it is not a valid YYYY-MM-DD date.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/invoices/actions.ts:64-72"],
      },
      {
        q: "Can I set a customer’s billing currency on an invoice?",
        a: "The invoice accepts a currency and defaults it from the selected customer’s billing settings, falling back to INR when none is supplied.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/invoices/actions.ts:75-81"],
      },
      {
        q: "Can invoices include a customer purchase-order reference?",
        a: "Yes. The invoice record has a PO number field, populated from the invoice form when provided.",
        evidence: ["src/lib/products/cashflow-ai/invoices.ts:36-59", "src/app/(products)/cashflow-ai/(protected)/invoices/actions.ts:75-81"],
      },
      {
        q: "Can I update an existing invoice?",
        a: "Yes. Saving with an invoice ID updates that invoice after checking it exists; creating without an ID generates a new invoice.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/invoices/actions.ts:84-106"],
      },
      {
        q: "Can an invoice be moved between statuses?",
        a: "The invoice action accepts a status change only when it is a recognized invoice status, and the underlying transition rules can refuse an invalid move.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/invoices/actions.ts:108-117", "src/lib/products/cashflow-ai/invoices.ts:280-300"],
      },
      {
        q: "Can an invoice with receipts or credits be deleted?",
        a: "No. The invoice logic refuses deletion when it has payments or credit notes, protecting records already linked to it.",
        evidence: ["src/lib/products/cashflow-ai/invoices.ts:320-335"],
      },
      {
        q: "Can one receipt cover several invoices?",
        a: "Yes. A receipt can allocate its amount across multiple invoices belonging to one customer, with each allocation checked against that invoice’s outstanding balance.",
        evidence: ["src/lib/products/cashflow-ai/receipts.ts:143-173"],
      },
      {
        q: "Can a receipt allocate more than its total?",
        a: "No. The combined allocation total cannot exceed the receipt amount (apart from the small rounding tolerance used by the validation).",
        evidence: ["src/lib/products/cashflow-ai/receipts.ts:153-161"],
      },
      {
        q: "Can I leave some of a receipt unallocated?",
        a: "Yes. Any receipt amount not applied to selected invoices is retained as an unapplied advance amount.",
        evidence: ["src/lib/products/cashflow-ai/receipts.ts:34-40", "src/lib/products/cashflow-ai/receipts.ts:184-197"],
      },
      {
        q: "Can a receipt be applied to another customer’s invoice?",
        a: "No. Every selected invoice is checked against the receipt’s customer ID before the receipt is recorded.",
        evidence: ["src/lib/products/cashflow-ai/receipts.ts:163-170"],
      },
      {
        q: "How do I find invoices eligible for a receipt?",
        a: "The receipt flow exposes a customer-specific outstanding-invoice lookup; it returns no choices when no customer is selected.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/receipts/actions.ts:34-39"],
      },
      {
        q: "What payment details can I record on a receipt?",
        a: "A receipt records its date, payment method, amount, optional transaction reference, currency, selected fund account and notes.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/receipts/actions.ts:42-78", "src/lib/products/cashflow-ai/receipts.ts:139-151"],
      },
      {
        q: "Can I void a receipt that was entered incorrectly?",
        a: "Yes. Voiding reverses each invoice allocation and the linked transaction, then marks the receipt voided.",
        evidence: ["src/lib/products/cashflow-ai/receipts.ts:248-261"],
      },
      {
        q: "Can I issue a credit note against an invoice?",
        a: "Yes. Credit notes are linked to invoices and their amount is checked against the invoice’s current outstanding balance.",
        evidence: ["src/lib/products/cashflow-ai/credit-notes.ts:7-10", "src/lib/products/cashflow-ai/credit-notes.ts:115-130"],
      },
      {
        q: "Can the same credit amount exceed what an invoice still owes?",
        a: "No. The credit-note logic rejects a credit above the linked invoice’s outstanding balance.",
        evidence: ["src/lib/products/cashflow-ai/credit-notes.ts:115-130"],
      },
      {
        q: "Can a credit note be cancelled?",
        a: "Yes. A cancellation action is provided for a credit note, and its status is changed to cancelled by the credit-note logic.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/credit-notes/actions.ts:24-58", "src/lib/products/cashflow-ai/credit-notes.ts:153-175"],
      },
      {
        q: "Can clients see their CashFlow invoices in ClientOS?",
        a: "Yes. The client invoice view uses the signed-in client’s invoice records and presents a portal-safe invoice summary.",
        evidence: ["src/lib/products/cashflow-ai/portal-invoices.ts:1-45"],
      },
      {
        q: "Are draft or void invoices shown in the client portal?",
        a: "No. The portal-facing invoice mapping excludes draft and void invoices before returning the client view.",
        evidence: ["src/lib/products/cashflow-ai/portal-invoices.ts:26-45"],
      },
      {
        q: "Can I see a customer’s outstanding receivables?",
        a: "Customer finance summaries aggregate received and outstanding totals for the customer’s invoices, and include a transaction count.",
        evidence: ["src/lib/products/cashflow-ai/customers.ts:16-61"],
      },
      {
        q: "Does CashFlow show receivables by age?",
        a: "The receivables and payables logic uses aging buckets to summarize overdue balances, rather than only a single overall balance.",
        evidence: ["src/lib/products/cashflow-ai/receivables.ts:1-90", "src/lib/products/cashflow-ai/constants.ts:1-80"],
      },
      {
        q: "Can I track bills and vendor balances as well as customer invoices?",
        a: "Yes. CashFlow includes bill and payable views, including vendor-wise totals and overdue payable summaries.",
        evidence: ["src/lib/products/cashflow-ai/payables.ts:47-122", "docs/products.md:141-152"],
      },
      {
        q: "Can a vendor payment be recorded against a bill?",
        a: "Yes. CashFlow has a vendor-payment action that records a payment and a follow-up action for marking it processed against a bill.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/vendor-payments/actions.ts:27-80"],
      },
      {
        q: "Can a customer refund be linked to an earlier receipt?",
        a: "Yes. Refund records reference a receipt and the refund logic checks the original receipt before accepting the refund.",
        evidence: ["src/lib/products/cashflow-ai/refunds.ts:17-25", "src/lib/products/cashflow-ai/refunds.ts:111-141"],
      },
      {
        q: "Can requested refunds be approved or rejected?",
        a: "Refund status changes are handled separately from refund requests, and invalid status transitions are rejected.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/refunds/actions.ts:24-45", "src/lib/products/cashflow-ai/refunds.ts:155-175"],
      },
      {
        q: "Can a refund be larger than the amount received?",
        a: "No. The refund logic prevents the cumulative refunds from exceeding the linked receipt amount.",
        evidence: ["src/lib/products/cashflow-ai/refunds.ts:122-141"],
      },
      {
        q: "Can employees request an advance and later record repayment?",
        a: "Yes. Advance actions cover requesting an advance, changing its status and recording repayments; repayments reduce the outstanding amount.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/advances/actions.ts:30-86", "src/lib/products/cashflow-ai/employee-advances.ts:231-275"],
      },
      {
        q: "Does CashFlow track employee expenses for reimbursement?",
        a: "Yes. Employee expense detail and reimbursement flows track reimbursed totals and can post reimbursements with project references.",
        evidence: ["src/lib/products/cashflow-ai/employee-expenses.ts:24-37", "src/lib/products/cashflow-ai/reimbursements.ts:1-30", "src/lib/products/cashflow-ai/reimbursements.ts:128-150"],
      },
      {
        q: "Can I reconcile bank statement lines to transactions?",
        a: "Yes. Bank reconciliation lets users match a statement line to a transaction, and it rejects a match if the transaction belongs to a different bank account.",
        evidence: ["src/lib/products/cashflow-ai/bank-reconciliation.ts:12-20", "src/lib/products/cashflow-ai/bank-reconciliation.ts:120-145"],
      },
      {
        q: "Can a bank statement line be flagged instead of matched?",
        a: "Yes. The reconciliation actions include flagging a statement line, in addition to matching it to a transaction.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/bank-reconciliation/actions.ts:21-65"],
      },
      {
        q: "Can I record a cash count for reconciliation?",
        a: "Yes. A dedicated cash-reconciliation action records a cash count separately from bank-statement matching.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/cash-reconciliation/actions.ts:8-35"],
      },
      {
        q: "Can I move money between cash or bank accounts?",
        a: "CashFlow has a transfer action for recording a movement between fund accounts.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/transfers/actions.ts:10-55", "src/lib/products/cashflow-ai/fund-transfers.ts:1-80"],
      },
      {
        q: "Can I keep separate cash accounts?",
        a: "Yes. Cash accounts have their own create, update and delete actions, distinct from bank accounts.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/cash-accounts/actions.ts:10-66"],
      },
      {
        q: "Can I maintain bank account details?",
        a: "Yes. Bank-account actions create, update and delete bank-account records; a separate protected action reveals an account number.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/bank-accounts/actions.ts:18-90"],
      },
      {
        q: "Does CashFlow have a chart of accounts?",
        a: "Yes. Account settings provide account create, update, delete and default-account seeding operations.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/settings/accounts/actions.ts:10-85", "src/lib/products/cashflow-ai/accounts.ts:1-40"],
      },
      {
        q: "Can I review general-ledger activity?",
        a: "Yes. CashFlow includes general-ledger and journal functionality, with transactions posted through the finance logic.",
        evidence: ["src/lib/products/cashflow-ai/transactions.ts:23-27", "docs/products.md:141-152"],
      },
      {
        q: "Does CashFlow provide a trial balance?",
        a: "Yes. The finance reporting routes include a trial-balance report.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/trial-balance/page.tsx:1-60", "src/lib/products/cashflow-ai/reports/trial-balance.ts:1-68"],
      },
      {
        q: "Can I review a profit-and-loss report?",
        a: "Yes. CashFlow provides a profit-and-loss report based on its financial records.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/reports/profit-and-loss/page.tsx:1-60", "src/lib/products/cashflow-ai/reports/profit-and-loss.ts:1-67"],
      },
      {
        q: "Can I compare a budget with actual results?",
        a: "Yes. A dedicated budget-versus-actual report route is available.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/reports/budget-vs-actual/page.tsx:1-60", "src/lib/products/cashflow-ai/reports/budget-vs-actual.ts:1-80"],
      },
      {
        q: "Can I review project profitability from finance?",
        a: "Yes. CashFlow has a project-profitability report, which complements the project references on finance transactions and invoices.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/reports/project-profitability/page.tsx:1-60", "src/lib/products/cashflow-ai/transactions.ts:74-82"],
      },
      {
        q: "What does CashFlow’s project finance summary show?",
        a: "The project-finance screen summarizes client receivables, pending items, sent payment links and collected transactions, and separates billing, invoices, links and receivables in tabs.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/products/pms/page.tsx:36-45", "src/app/(products)/cashflow-ai/(protected)/products/pms/page.tsx:51-80"],
      },
      {
        q: "Is there a cash-flow report?",
        a: "Yes. The reports menu includes a dedicated cash-flow page.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/reports/cash-flow/page.tsx:1-60"],
      },
      {
        q: "Can I see a financial summary report?",
        a: "Yes. CashFlow provides a financial-summary report route in addition to individual statement reports.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/reports/financial-summary/page.tsx:1-60"],
      },
      {
        q: "Does CashFlow report revenue separately?",
        a: "Yes. A revenue report is available as a separate report screen.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/reports/revenue/page.tsx:1-60"],
      },
      {
        q: "Can I view expense totals in a report?",
        a: "Yes. CashFlow has a separate expense-report screen.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/reports/expense/page.tsx:1-60"],
      },
      {
        q: "Can I report tax amounts?",
        a: "Yes. The finance reports include a tax-report screen, and tax rates can be configured in settings.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/reports/tax/page.tsx:1-60", "src/app/(products)/cashflow-ai/(protected)/settings/tax-config/actions.ts:12-45"],
      },
      {
        q: "Can I manage tax rates rather than hard-code them?",
        a: "Yes. Tax-rate settings include add, delete and enable/disable actions.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/settings/tax-config/actions.ts:12-45"],
      },
      {
        q: "Can I configure currency exchange rates?",
        a: "Yes. Exchange-rate settings provide actions to add and delete exchange-rate entries.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/settings/exchange-rates/actions.ts:17-39"],
      },
      {
        q: "Can accounting periods be closed and reopened?",
        a: "Yes. Fiscal periods can be created, closed and reopened; closing has a guarded result that can explain why it was refused.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/settings/fiscal-periods/actions.ts:15-49", "src/lib/products/cashflow-ai/fiscal-periods.ts:92-170"],
      },
      {
        q: "Are finance actions limited to authorized users?",
        a: "Yes. Invoice and receipt mutations require an authenticated CashFlow user with transaction-management permission.",
        evidence: ["src/app/(products)/cashflow-ai/(protected)/invoices/actions.ts:22-38", "src/app/(products)/cashflow-ai/(protected)/receipts/actions.ts:20-32"],
      },
    ],
  },
  {
    id: "spendiq",
    title: "SelfRun SpendIQ",
    href: productPath("prms"),
    items: [
      {
        q: "Can employees create their own purchase requisitions?",
        a: "Yes. A requisition can be created for the signed-in requester and records their user and employee identity.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/requisitions/actions.ts:45-90"],
      },
      {
        q: "Can a requester submit a requisition after saving it?",
        a: "Yes. A separate submit action moves the request into its approval flow and notifies procurement approvers.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/requisitions/actions.ts:92-123"],
      },
      {
        q: "Can a requisition be approved or rejected with a note?",
        a: "Yes. Authorized approvers can decide a requisition either way and include a decision note; the requester is notified.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/requisitions/actions.ts:125-176"],
      },
      {
        q: "Can a requisition go through more than one approval step?",
        a: "Yes. The decision logic can report partial progress and full approval, rather than treating every approval as a single yes/no action.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/requisitions/actions.ts:145-176"],
      },
      {
        q: "Does SpendIQ notify employees about requisition decisions?",
        a: "Yes. Requesters receive a notification indicating rejection, full approval or progress through the approval flow.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/requisitions/actions.ts:151-168"],
      },
      {
        q: "Can procurement create an RFQ from a requisition?",
        a: "Yes. Procurement can create an RFQ using a requisition ID and selected vendor IDs.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/rfq/actions.ts:82-89"],
      },
      {
        q: "Can an RFQ include multiple product or service lines?",
        a: "Yes. RFQ input parses multiple lines and requires at least one valid description-and-quantity line.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/rfq/actions.ts:35-59"],
      },
      {
        q: "Can I select several vendors for an RFQ?",
        a: "Yes. An RFQ stores a filtered list of selected vendor IDs with its title, lines and optional requisition and department references.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/rfq/actions.ts:51-68"],
      },
      {
        q: "Can I mark an RFQ as sent to vendors?",
        a: "Yes. The send action changes the RFQ status to sent and records that it was marked as sent to vendors.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/rfq/actions.ts:91-98"],
      },
      {
        q: "Can I compare vendor quotations on an RFQ?",
        a: "The RFQ flow records each vendor’s unit prices by line, with optional delivery days, payment terms, technical score and notes.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/rfq/actions.ts:100-120"],
      },
      {
        q: "Can an RFQ award be turned into a purchase order?",
        a: "Yes. Awarding an RFQ invokes the award logic and returns the resulting purchase-order ID.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/rfq/actions.ts:123-131"],
      },
      {
        q: "Can an approved requisition prefill a purchase order?",
        a: "Yes. The purchase-order prefill reads the requisition’s department, project, preferred vendor, currency and requested line details.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/purchase-orders/actions.ts:165-185"],
      },
      {
        q: "Can a purchase order be linked back to its requisition?",
        a: "Yes. Purchase orders retain the requisition reference; creating one from an approved requisition marks that requisition converted.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/purchase-orders/actions.ts:79-109"],
      },
      {
        q: "What details can a purchase order capture?",
        a: "A purchase order can include a vendor, department, project, line items, discount, currency, delivery address and date, payment terms and notes.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/purchase-orders/actions.ts:66-99"],
      },
      {
        q: "Can I issue a purchase order after drafting it?",
        a: "Yes. Issuing a PO changes it through the purchase-order logic, records an audit entry and notifies relevant staff.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/purchase-orders/actions.ts:122-134"],
      },
      {
        q: "Can an issued purchase order be cancelled or closed?",
        a: "Yes. Separate actions set a PO to cancelled or closed and record the status change.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/purchase-orders/actions.ts:136-152"],
      },
      {
        q: "Can I record goods received against a purchase order?",
        a: "Yes. A goods-receipt action requires a selected PO and creates a receipt through the goods-receipt business logic.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/grn/actions.ts:23-55"],
      },
      {
        q: "Can I manage vendor records in SpendIQ?",
        a: "Yes. Vendor actions support creating, updating and deleting vendor records, with vendor changes audited.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/vendors/actions.ts:30-86"],
      },
      {
        q: "Does the system prevent deleting a vendor still used by open requests?",
        a: "Yes. Vendor deletion checks open requisition references and returns a reason rather than deleting a vendor that is still referenced.",
        evidence: ["src/lib/products/spendiq/vendors.ts:280-310"],
      },
      {
        q: "Can vendor payment terms be captured?",
        a: "Yes. Vendor records include payment terms, and PO defaults can use the selected vendor’s payment terms when no override is supplied.",
        evidence: ["src/lib/products/spendiq/vendors.ts:220-250", "src/app/(products)/spendiq/(protected)/(staff)/purchase-orders/actions.ts:89-96"],
      },
      {
        q: "Can finance enter vendor invoices?",
        a: "Yes. SpendIQ provides vendor invoices with a save action requiring a valid vendor and invoice lines.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/invoices/actions.ts:42-84"],
      },
      {
        q: "Can an invoice be approved or rejected?",
        a: "Yes. The vendor-invoice action has a decision operation that validates the requested status and passes it to the invoice workflow.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/invoices/actions.ts:136-154"],
      },
      {
        q: "Can I record and process a payment for a vendor invoice?",
        a: "Yes. SpendIQ has separate actions to record a payment and process a recorded payment.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/invoices/actions.ts:156-195"],
      },
      {
        q: "Can vendor invoice documents be attached?",
        a: "Yes. The vendor-invoice flow includes an upload action for an invoice file.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/invoices/actions.ts:103-134"],
      },
      {
        q: "Can employee expenses include a receipt or invoice file?",
        a: "Yes. Employee expenses have a separate action to upload an invoice attachment to an expense record.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/expenses/actions.ts:128-162"],
      },
      {
        q: "Can managers approve or reject an employee expense?",
        a: "Yes. The expense action records a decision and an optional note for approval or rejection.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/expenses/actions.ts:164-184"],
      },
      {
        q: "Can an approved expense be reimbursed?",
        a: "Yes. SpendIQ exposes a reimbursement action for an expense; its exact payment execution behavior is separate from this recorded workflow.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/expenses/actions.ts:185-195"],
      },
      {
        q: "Can an expense repeat on a recurring schedule?",
        a: "The expense workflow lets staff toggle whether an expense is recurring.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/expenses/actions.ts:196-204"],
      },
      {
        q: "Can I maintain departmental or project budgets?",
        a: "Yes. SpendIQ includes budget create/update and delete operations, plus an action to refresh budget figures.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/budgets/actions.ts:10-85"],
      },
      {
        q: "Does SpendIQ provide an analytics screen?",
        a: "Yes. A staff analytics route is available alongside the procurement dashboard.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/analytics/page.tsx:1-80"],
      },
      {
        q: "Can I manage inventory items?",
        a: "Yes. Inventory actions create, update and delete inventory items and record inventory transactions.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/inventory/actions.ts:17-98"],
      },
      {
        q: "Can an inventory transaction be recorded against a specific item?",
        a: "Yes. The inventory transaction action takes an item ID and the transaction details separately from item maintenance.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/inventory/actions.ts:70-90"],
      },
      {
        q: "Can I see the value of stock on hand?",
        a: "Yes. The inventory business logic provides an inventory stock-value calculation.",
        evidence: ["src/lib/products/spendiq/inventory.ts:120-145"],
      },
      {
        q: "Can I assign an asset to an employee?",
        a: "Yes. Asset assignment records the employee ID and name together with an optional note.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/assets/actions.ts:101-108"],
      },
      {
        q: "Can an assigned asset be returned?",
        a: "Yes. A separate return action records the return and any note.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/assets/actions.ts:110-117"],
      },
      {
        q: "Can I update an asset’s lifecycle status?",
        a: "Yes. Asset status changes are validated against the supported statuses before being saved.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/assets/actions.ts:119-127"],
      },
      {
        q: "Can asset records include purchase and depreciation details?",
        a: "Yes. The asset model includes purchase-date and depreciation-related fields, and asset detail pages expose individual assets.",
        evidence: ["src/lib/products/spendiq/assets.ts:13-35", "src/app/(products)/spendiq/(protected)/(staff)/assets/[id]/page.tsx:1-80"],
      },
      {
        q: "Can I manage infrastructure resources that have renewal dates?",
        a: "Yes. Infrastructure records include status, renewal date and vendor references; active and expiring resources are used in commitment calculations.",
        evidence: ["src/lib/products/spendiq/infrastructure.ts:19-71"],
      },
      {
        q: "Can I track software subscriptions by vendor and billing cycle?",
        a: "Yes. Subscription records include a vendor, billing cycle and status, and invalid cycle or status values are rejected.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/subscriptions/actions.ts:30-60", "src/lib/products/spendiq/software-subscriptions.ts:21-75"],
      },
      {
        q: "Can recurring subscriptions be viewed as a monthly commitment?",
        a: "Yes. Subscription logic calculates a monthly equivalent and a total monthly commitment for active subscriptions.",
        evidence: ["src/lib/products/spendiq/software-subscriptions.ts:4-5", "src/lib/products/spendiq/software-subscriptions.ts:63-80"],
      },
      {
        q: "Can I track third-party services separately from subscriptions?",
        a: "Yes. SpendIQ has a third-party-services resource with its own create, update and delete actions, including vendor, cycle and status fields.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/third-party/actions.ts:30-78"],
      },
      {
        q: "Can I store contracts with vendor records?",
        a: "Yes. SpendIQ offers contract records and an action to attach a contract document.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/contracts/actions.ts:32-88", "src/lib/products/spendiq/contracts.ts:11-65"],
      },
      {
        q: "Can requisitions, expenses and purchase orders point to projects?",
        a: "Yes. The shared project picker reads active SprintOS projects for requisition, expense and PO forms.",
        evidence: ["src/lib/products/spendiq/pickers.ts:6-34"],
      },
      {
        q: "Can SpendIQ forms reuse employee records from TalentOS?",
        a: "Yes. SpendIQ’s shared pickers use TalentOS employee and department options rather than maintaining duplicate employee and department lists.",
        evidence: ["src/lib/products/spendiq/pickers.ts:6-13"],
      },
      {
        q: "Can I see requisitions and expenses as an employee?",
        a: "Yes. The employee area has separate requisition and expense pages, including details for an individual request or expense.",
        evidence: ["src/app/(products)/spendiq/(protected)/me/requisitions/page.tsx:1-70", "src/app/(products)/spendiq/(protected)/me/expenses/page.tsx:1-70"],
      },
      {
        q: "Can I manage procurement settings?",
        a: "Yes. The staff settings page saves SpendIQ procurement settings through a dedicated action.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/settings/actions.ts:9-34", "src/app/(products)/spendiq/(protected)/(staff)/settings/page.tsx:1-26"],
      },
      {
        q: "Can authorized teams export SpendIQ records?",
        a: "Yes. SpendIQ exposes entity-based export routes and report endpoints; supported entity types are determined by those routes.",
        evidence: ["src/app/(products)/api/spendiq/export/[entity]/route.ts:1-80", "src/app/(products)/api/spendiq/reports/[type]/route.ts:1-55"],
      },
      {
        q: "Does SpendIQ keep a record of procurement decisions?",
        a: "Yes. Requisition, RFQ, PO and vendor mutations record audit events, including approval, status and conversion actions.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/requisitions/actions.ts:103-149", "src/app/(products)/spendiq/(protected)/(staff)/rfq/actions.ts:82-130", "src/app/(products)/spendiq/(protected)/(staff)/purchase-orders/actions.ts:122-152"],
      },
      {
        q: "Can a requester edit a requisition created by someone else?",
        a: "Only procurement staff can update another requester’s requisition; the action checks the requester identity before allowing a non-staff user to update it.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/requisitions/actions.ts:51-60"],
      },
      {
        q: "Are high-value approved requisitions treated differently?",
        a: "When an approved requisition meets the configured finance-notification threshold, SpendIQ sends an additional notification to finance and administrative roles.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/requisitions/actions.ts:168-184"],
      },
      {
        q: "Can I attach supporting files to requisitions?",
        a: "Yes. Requisition actions include uploading and removing an attachment by storage key.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/requisitions/actions.ts:209-246"],
      },
      {
        q: "Does a goods receipt require a purchase order?",
        a: "Yes. The goods-receipt action requires a PO selection and returns a field error if one is missing.",
        evidence: ["src/app/(products)/spendiq/(protected)/(staff)/grn/actions.ts:23-29"],
      },
    ],
  },
  {
    id: "sprintos",
    title: "SelfRun SprintOS",
    href: productPath("pms"),
    items: [
      {
        q: "What work can I manage in SprintOS?",
        a: "SprintOS covers clients, projects, milestones, tasks, timesheets, shared documents, activity and project costing.",
        evidence: ["docs/products.md:81-88"],
      },
      {
        q: "Can I create and update project records?",
        a: "Yes. Project actions validate project input and support both creation and updates.",
        evidence: ["src/app/(products)/sprintos/(protected)/projects/actions.ts:42-108"],
      },
      {
        q: "Can projects have a project manager?",
        a: "Yes. The project form stores a project-manager ID, and project lists resolve employee options for manager selection.",
        evidence: ["src/app/(products)/sprintos/(protected)/projects/actions.ts:77-93", "src/app/(products)/sprintos/(protected)/projects/page.tsx:13-33"],
      },
      {
        q: "Can I set a project’s priority and progress?",
        a: "Yes. Project updates include priority and progress, and progress has a dedicated action constrained to a percentage range.",
        evidence: ["src/app/(products)/sprintos/(protected)/projects/actions.ts:77-93", "src/app/(products)/sprintos/(protected)/projects/actions.ts:147-162"],
      },
      {
        q: "Can project status changes be guarded?",
        a: "Yes. Project status transitions go through a separate validated status action rather than being silently included in a general edit.",
        evidence: ["src/app/(products)/sprintos/(protected)/projects/actions.ts:59-67", "src/app/(products)/sprintos/(protected)/projects/actions.ts:112-145"],
      },
      {
        q: "Are project members notified when a project status changes?",
        a: "Yes. The status action notifies the project’s members and manager when it changes.",
        evidence: ["src/app/(products)/sprintos/(protected)/projects/actions.ts:124-144"],
      },
      {
        q: "Can I delete a project?",
        a: "Yes. Project deletion is a separate action and reports when the project could not be deleted.",
        evidence: ["src/app/(products)/sprintos/(protected)/projects/actions.ts:165-183"],
      },
      {
        q: "Can a project be assigned to an existing client?",
        a: "Yes. SprintOS has client records and project forms load client choices, allowing project work to be associated with the client record.",
        evidence: ["src/app/(products)/sprintos/(protected)/(staff)/clients/actions.ts:30-70", "src/app/(products)/sprintos/(protected)/projects/page.tsx:25-36"],
      },
      {
        q: "Can I create a client record in SprintOS?",
        a: "Yes. Client actions validate input and create or update a SprintOS client; deletion is also a distinct action.",
        evidence: ["src/app/(products)/sprintos/(protected)/(staff)/clients/actions.ts:30-86"],
      },
      {
        q: "Can clients be downloaded as an export?",
        a: "Yes. SprintOS exposes a client export route in addition to the client list and detail pages.",
        evidence: ["src/app/(products)/api/sprintos/clients/export/route.ts:1-50", "src/app/(products)/sprintos/(protected)/(staff)/clients/page.tsx:1-80"],
      },
      {
        q: "Can one project have multiple members?",
        a: "Yes. Project membership is maintained separately from the project record and can be saved for a project and employee.",
        evidence: ["src/app/(products)/sprintos/(protected)/projects/member-actions.ts:35-77"],
      },
      {
        q: "Can a project member be removed?",
        a: "Yes. There is a separate remove-member action that records the removal in project activity.",
        evidence: ["src/app/(products)/sprintos/(protected)/projects/member-actions.ts:80-96"],
      },
      {
        q: "Does SprintOS source project team members from TalentOS?",
        a: "Yes. Project-management pages use TalentOS employee options for project managers, and project members reference employee IDs.",
        evidence: ["src/app/(products)/sprintos/(protected)/projects/page.tsx:13-33", "src/app/(products)/sprintos/(protected)/projects/member-actions.ts:35-77"],
      },
      {
        q: "Can projects contain milestones?",
        a: "Yes. Milestones are attached to a project and can be created, updated and deleted from that project’s milestone actions.",
        evidence: ["src/app/(products)/sprintos/(protected)/projects/[id]/milestone-actions.ts:30-67", "src/app/(products)/sprintos/(protected)/projects/[id]/milestone-actions.ts:84-107"],
      },
      {
        q: "Can milestones be connected to tasks?",
        a: "Yes. Milestone changes track the number of linked task IDs, and milestone business logic can derive progress from task status.",
        evidence: ["src/app/(products)/sprintos/(protected)/projects/[id]/milestone-actions.ts:53-65", "src/lib/products/sprintos/milestones.ts:45-75"],
      },
      {
        q: "Can milestone completion notify the project manager?",
        a: "Yes. When a milestone changes to completed, the project manager receives a notification.",
        evidence: ["src/app/(products)/sprintos/(protected)/projects/[id]/milestone-actions.ts:65-83"],
      },
      {
        q: "Can project teams manage tasks in a board view?",
        a: "Yes. SprintOS includes a project board route as well as task-list and task-detail routes.",
        evidence: ["src/app/(products)/sprintos/(protected)/projects/[id]/board/page.tsx:1-59", "src/app/(products)/sprintos/(protected)/projects/[id]/tasks/page.tsx:1-79"],
      },
      {
        q: "Can tasks have subtasks?",
        a: "Yes. Task logic distinguishes tasks with a parent task from top-level tasks, supporting a parent/child task structure.",
        evidence: ["src/lib/products/sprintos/tasks.ts:140-170"],
      },
      {
        q: "Can I filter tasks by status?",
        a: "Yes. Task queries accept status filters and load a project’s tasks by status.",
        evidence: ["src/lib/products/sprintos/tasks.ts:100-120", "src/lib/products/sprintos/tasks.ts:205-230"],
      },
      {
        q: "Can a task have attachments?",
        a: "Yes. SprintOS has a task-attachment collection and operations to create and count attachments for a task.",
        evidence: ["src/lib/products/sprintos/task-attachments.ts:6-50"],
      },
      {
        q: "Can I see the project timeline?",
        a: "Yes. Each project has a timeline route, and SprintOS timeline logic gathers project milestones and deadlines.",
        evidence: ["src/app/(products)/sprintos/(protected)/projects/[id]/timeline/page.tsx:1-72", "src/lib/products/sprintos/timeline.ts:53-120"],
      },
      {
        q: "Is there a company-wide project calendar?",
        a: "Yes. Staff users have a calendar page that scopes project visibility according to their access.",
        evidence: ["src/app/(products)/sprintos/(protected)/(staff)/calendar/page.tsx:1-50"],
      },
      {
        q: "Can project documents be managed from a project page?",
        a: "Yes. SprintOS has a project-specific documents route and document API endpoints.",
        evidence: ["src/app/(products)/sprintos/(protected)/projects/[id]/documents/page.tsx:1-43", "src/app/(products)/api/sprintos/documents/route.ts:1-80"],
      },
      {
        q: "Can a project be exported?",
        a: "Yes. SprintOS exposes a project export endpoint.",
        evidence: ["src/app/(products)/api/sprintos/projects/export/route.ts:1-72"],
      },
      {
        q: "Can I download a project as a PDF?",
        a: "Yes. SprintOS provides a project PDF endpoint for an individual project.",
        evidence: ["src/app/(products)/api/sprintos/projects/[id]/pdf/route.ts:1-80"],
      },
      {
        q: "Can employees use a self-service SprintOS area?",
        a: "Yes. The /me area has an employee dashboard and separate views for assigned projects, tasks and timesheets.",
        evidence: ["src/app/(products)/sprintos/(protected)/me/page.tsx:26-61", "src/app/(products)/sprintos/(protected)/me/projects/page.tsx:1-40", "src/app/(products)/sprintos/(protected)/me/tasks/page.tsx:1-30"],
      },
      {
        q: "Can employees log time to a project?",
        a: "Yes. A timesheet entry requires project access and can optionally reference a task belonging to that same project.",
        evidence: ["src/app/(products)/sprintos/(protected)/me/timesheet/actions.ts:36-58"],
      },
      {
        q: "Can time be recorded against a project without selecting a task?",
        a: "Yes. Task validation only runs when a task ID is supplied, so a project-level time entry without a task is supported.",
        evidence: ["src/app/(products)/sprintos/(protected)/me/timesheet/actions.ts:47-56"],
      },
      {
        q: "Does SprintOS prevent overlapping time entries?",
        a: "Yes. The timesheet save action rejects entries that overlap another entry for the employee on the same day.",
        evidence: ["src/app/(products)/sprintos/(protected)/me/timesheet/actions.ts:58-64"],
      },
      {
        q: "Can an employee log duplicate time for the same project and task?",
        a: "No. SprintOS checks for a duplicate project/task entry at the same time and date before saving.",
        evidence: ["src/app/(products)/sprintos/(protected)/me/timesheet/actions.ts:53-60"],
      },
      {
        q: "Does the timesheet stop a day from exceeding 24 hours?",
        a: "Yes. The save action compares the day’s existing hours plus the new entry against a 24-hour maximum.",
        evidence: ["src/app/(products)/sprintos/(protected)/me/timesheet/actions.ts:61-67"],
      },
      {
        q: "Can employees edit a timesheet after submitting it?",
        a: "No. Submitted and approved entries are not editable through the employee action.",
        evidence: ["src/app/(products)/sprintos/(protected)/me/timesheet/actions.ts:71-80"],
      },
      {
        q: "Can employees submit several timesheet entries together?",
        a: "Yes. The submission action accepts a list of entry IDs and submits the current employee’s eligible entries.",
        evidence: ["src/app/(products)/sprintos/(protected)/me/timesheet/actions.ts:98-122"],
      },
      {
        q: "Are project managers notified when time is submitted?",
        a: "Yes. After submission, the action identifies the project managers for the submitted projects and notifies them that review is pending.",
        evidence: ["src/app/(products)/sprintos/(protected)/me/timesheet/actions.ts:103-122"],
      },
      {
        q: "Can reviewers approve or reject a timesheet entry?",
        a: "Yes. Reviewers can approve or reject an entry and include an optional note; the employee receives a notification.",
        evidence: ["src/app/(products)/sprintos/(protected)/(staff)/timesheets/review-actions.ts:21-48"],
      },
      {
        q: "Can timesheets be reviewed in bulk?",
        a: "Yes. The bulk review action accepts multiple IDs and applies the chosen approved or rejected decision to each entry.",
        evidence: ["src/app/(products)/sprintos/(protected)/(staff)/timesheets/review-actions.ts:50-62"],
      },
      {
        q: "Can employees distinguish billable from non-billable time?",
        a: "Yes. The employee timesheet summary separates billable and non-billable hours for the selected range.",
        evidence: ["src/app/(products)/sprintos/(protected)/me/timesheet/page.tsx:53-80"],
      },
      {
        q: "Can I see my hours by project and task?",
        a: "Yes. Employee timesheet reporting includes hours by project and hours by task, alongside a time trend.",
        evidence: ["src/app/(products)/sprintos/(protected)/me/timesheet/page.tsx:53-60"],
      },
      {
        q: "Can SprintOS compare estimated and actual project cost?",
        a: "Yes. Project costing calculates actuals from tracked project data and compares them with estimates.",
        evidence: ["docs/products.md:85-88", "src/lib/products/sprintos/costing.ts:100-165"],
      },
      {
        q: "Can project costing use employee cost rates?",
        a: "Yes. Costing reads project members and associates a member’s employee record with the project’s costing configuration.",
        evidence: ["src/lib/products/sprintos/costing.ts:100-145"],
      },
      {
        q: "Can costing be configured separately per project?",
        a: "Yes. The costing configuration action is scoped to a project and validates the submitted configuration before saving.",
        evidence: ["src/app/(products)/sprintos/(protected)/(staff)/costing/actions.ts:17-44"],
      },
      {
        q: "Can I review costing for a particular project?",
        a: "Yes. SprintOS provides a costing list and a project-specific costing detail route.",
        evidence: ["src/app/(products)/sprintos/(protected)/(staff)/costing/page.tsx:1-80", "src/app/(products)/sprintos/(protected)/(staff)/costing/[id]/page.tsx:1-80"],
      },
      {
        q: "Does SprintOS provide project analytics?",
        a: "Yes. Staff analytics aggregates projects, clients, timesheets, milestones and active project-member data.",
        evidence: ["src/app/(products)/sprintos/(protected)/(staff)/analytics/page.tsx:12-52"],
      },
      {
        q: "Can I configure project categories and technology suggestions?",
        a: "Yes. SprintOS settings store editable project categories and technology suggestions for project forms.",
        evidence: ["src/lib/products/sprintos/settings.ts:7-18", "src/lib/products/sprintos/settings.ts:37-73"],
      },
      {
        q: "Can activity be associated with a project?",
        a: "Yes. SprintOS activity records can reference a project, which enables project-specific activity timelines.",
        evidence: ["src/lib/products/sprintos/activity.ts:13-45", "src/lib/products/sprintos/activity.ts:80-145"],
      },
      {
        q: "Can project updates synchronize with team messaging?",
        a: "Yes. Project actions attempt to synchronize a project channel; a messaging failure is treated as optional and does not block the project action.",
        evidence: ["src/app/(products)/sprintos/(protected)/projects/actions.ts:30-39", "src/app/(products)/sprintos/(protected)/projects/actions.ts:97-112"],
      },
      {
        q: "Can project completion be tracked through milestones and tasks?",
        a: "Yes. Milestones can link task IDs, and milestone progress logic reads linked task statuses when available.",
        evidence: ["src/lib/products/sprintos/milestones.ts:45-75", "src/lib/products/sprintos/tasks.ts:205-230"],
      },
      {
        q: "Can I export project costing as a spreadsheet or CSV?",
        a: "Yes. The project report endpoint returns CSV or XLSX for project costing, alongside its PDF report option.",
        evidence: ["src/app/(products)/api/sprintos/reports/[projectId]/route.ts:35-80", "src/app/(products)/api/sprintos/reports/[projectId]/route.ts:90-185"],
      },
      {
        q: "Can I export costing for the whole project portfolio?",
        a: "Yes. A portfolio report can be exported with project value, estimated and actual cost, revenue, hours, profit, loss and margin.",
        evidence: ["src/app/(products)/api/sprintos/reports/[projectId]/route.ts:35-83"],
      },
      {
        q: "Can SprintOS create client-related finance records in CashFlow?",
        a: "CashFlow’s invoice and transaction models reference SprintOS clients and projects by ID; this supports cross-product association, not automatic creation of finance records.",
        evidence: ["src/lib/products/cashflow-ai/invoices.ts:30-45", "src/lib/products/cashflow-ai/transactions.ts:74-82"],
      },
    ],
  },
  {
    id: "contractflow-ai",
    title: "SelfRun ContractFlow AI",
    href: productPath("lpms"),
    items: [
      {
        q: "What kinds of documents can ContractFlow manage?",
        a: "ContractFlow supports configurable document-maker types for records such as NDAs, service agreements, privacy documents and internal policies.",
        evidence: ["docs/products.md:153-164", "src/lib/products/contractflow-ai/types.ts:41-60"],
      },
      {
        q: "Can each document type have its own fields?",
        a: "Yes. A maker type defines a field schema with field keys, labels, types, options, required flags and optional defaults.",
        evidence: ["src/lib/products/contractflow-ai/types.ts:5-13", "src/lib/products/contractflow-ai/types.ts:41-60"],
      },
      {
        q: "Can a maker type have a category and description?",
        a: "Yes. Maker types store a category and description, as well as a name, slug, icon and color.",
        evidence: ["src/lib/products/contractflow-ai/types.ts:41-60"],
      },
      {
        q: "Can each document type use its own numbering format?",
        a: "Yes. Numbering settings include a prefix, separator, starting number, padding and optional year and month components.",
        evidence: ["src/lib/products/contractflow-ai/types.ts:32-39"],
      },
      {
        q: "Can maker types be archived?",
        a: "Yes. Maker-type administration includes an archive operation, and the model records an archived flag.",
        evidence: ["src/lib/products/contractflow-ai/makers.ts:86-108", "src/lib/products/contractflow-ai/types.ts:41-60"],
      },
      {
        q: "Can I create a document from a template?",
        a: "Yes. Document creation accepts a maker type and an optional template ID, plus a title and field values.",
        evidence: ["src/lib/products/contractflow-ai/documents.ts:10-42", "src/app/(products)/contractflow-ai/(protected)/actions.ts:41-56"],
      },
      {
        q: "Can documents be created without a template?",
        a: "Yes. The document action makes the template ID optional; the new document still gets its maker type, title and draft status.",
        evidence: ["src/lib/products/contractflow-ai/documents.ts:10-42"],
      },
      {
        q: "Can templates be organized by document type?",
        a: "Yes. Template search can filter by maker type and title, and template records store their maker-type ID.",
        evidence: ["src/lib/products/contractflow-ai/templates.ts:8-32", "src/lib/products/contractflow-ai/types.ts:81-98"],
      },
      {
        q: "Can templates contain reusable clauses and content blocks?",
        a: "Templates are block-based and support content such as headings, paragraphs, bullets, numbered lists, tables, notes, variables and signature blocks.",
        evidence: ["docs/products.md:156-158", "src/lib/products/contractflow-ai/types.ts:63-79"],
      },
      {
        q: "Can a template include a header and footer?",
        a: "Yes. Templates store separate block collections for their main content, header and footer.",
        evidence: ["src/lib/products/contractflow-ai/types.ts:81-98"],
      },
      {
        q: "Can a template use branded colors and a logo?",
        a: "Yes. The branding configuration supports logo, colors, header and footer options, with optional header and footer text.",
        evidence: ["src/lib/products/contractflow-ai/types.ts:15-22"],
      },
      {
        q: "Can I clone a template to create a variation?",
        a: "Yes. Template cloning copies the existing template content and creates a new template under the supplied name.",
        evidence: ["src/lib/products/contractflow-ai/templates.ts:129-136"],
      },
      {
        q: "Can template edits be tracked by version?",
        a: "Yes. Updating a template increments its version, and the template record includes its current version.",
        evidence: ["src/lib/products/contractflow-ai/templates.ts:76-103", "src/lib/products/contractflow-ai/types.ts:81-98"],
      },
      {
        q: "Can templates be archived without deleting them?",
        a: "Yes. Archiving marks a template archived; normal template listing filters archived templates out.",
        evidence: ["src/lib/products/contractflow-ai/templates.ts:8-32", "src/lib/products/contractflow-ai/templates.ts:105-127"],
      },
      {
        q: "Can document content contain dynamic variables?",
        a: "Yes. Variables use double-brace notation such as {{variable.name}}, and ContractFlow can detect and resolve variable keys.",
        evidence: ["src/lib/products/contractflow-ai/variables.ts:5-31"],
      },
      {
        q: "Can a variable be populated from a selected business record?",
        a: "Yes. Variable resolution uses an entity key, selected record ID and field key; when no entity is selected or a value cannot be found, it leaves an unresolved marker.",
        evidence: ["src/lib/products/contractflow-ai/variables.ts:42-69"],
      },
      {
        q: "Which business-data sources can provide variables?",
        a: "The variable model includes workspace, TalentOS, SprintOS, SpendIQ, Cohort AI, CashFlow, DealFlow and CyberVault source families.",
        evidence: ["src/lib/products/contractflow-ai/types.ts:242-251"],
      },
      {
        q: "Can I store selected entity records on a document?",
        a: "Yes. Documents keep selected entity IDs separately from field values, and updates can replace the selected-entity mapping.",
        evidence: ["src/lib/products/contractflow-ai/types.ts:100-136", "src/lib/products/contractflow-ai/documents.ts:42-72"],
      },
      {
        q: "Can a document have a category?",
        a: "Yes. Document search accepts a category filter, and categories can be maintained as separate records with maker-type associations.",
        evidence: ["src/lib/products/contractflow-ai/library.ts:7-40", "src/lib/products/contractflow-ai/types.ts:227-240"],
      },
      {
        q: "Can categories be nested?",
        a: "Yes. A category record includes a parent ID, which supports a parent-child category hierarchy.",
        evidence: ["src/lib/products/contractflow-ai/types.ts:227-240"],
      },
      {
        q: "Can I search the document library?",
        a: "Yes. The document library supports text search and filters for maker type, status, category and owner, with pagination and sorting.",
        evidence: ["src/lib/products/contractflow-ai/library.ts:7-52"],
      },
      {
        q: "Can I filter documents by status?",
        a: "Yes. Document search accepts a status filter, and documents use statuses including draft, review, pending approval, approved, published, active and archived.",
        evidence: ["src/lib/products/contractflow-ai/library.ts:7-30", "src/lib/products/contractflow-ai/types.ts:1-3"],
      },
      {
        q: "Can I filter documents by owner?",
        a: "Yes. Document-library search supports an owner filter against the document owner ID.",
        evidence: ["src/lib/products/contractflow-ai/library.ts:7-34"],
      },
      {
        q: "Can I edit a document after submitting it for review?",
        a: "Documents can be edited while in draft or review status; the document update logic rejects edits in other statuses.",
        evidence: ["src/lib/products/contractflow-ai/documents.ts:44-69"],
      },
      {
        q: "Can a draft be sent for approval?",
        a: "Yes. The submit-for-approval action requires edit permission and routes the document into pending approval.",
        evidence: ["src/app/(products)/contractflow-ai/(protected)/actions.ts:79-91", "src/lib/products/contractflow-ai/documents.ts:135-155"],
      },
      {
        q: "Can approval decisions include comments?",
        a: "Yes. Approvers can approve or reject a document with notes, and those notes are stored with the decision.",
        evidence: ["src/app/(products)/contractflow-ai/(protected)/actions.ts:93-126", "src/lib/products/contractflow-ai/documents.ts:170-205"],
      },
      {
        q: "Can an approved document be published?",
        a: "Yes. Publishing has a distinct permission-gated action and updates the document to published.",
        evidence: ["src/app/(products)/contractflow-ai/(protected)/actions.ts:129-138", "src/lib/products/contractflow-ai/documents.ts:205-220"],
      },
      {
        q: "Can a published document later be archived?",
        a: "Yes. Users with archive permission can archive documents in published or active status.",
        evidence: ["src/app/(products)/contractflow-ai/(protected)/documents/[id]/page.tsx:20-35"],
      },
      {
        q: "Can the document status determine which actions appear?",
        a: "Yes. The document screen uses status and permission checks to decide whether the user can edit, submit, approve, publish, archive or delete.",
        evidence: ["src/app/(products)/contractflow-ai/(protected)/documents/[id]/page.tsx:20-35"],
      },
      {
        q: "Can each document have a change history?",
        a: "Yes. ContractFlow keeps document versions with a version number, content snapshot, change note, creator and timestamp.",
        evidence: ["src/lib/products/contractflow-ai/versions.ts:8-47", "src/lib/products/contractflow-ai/types.ts:138-153"],
      },
      {
        q: "Can I inspect earlier document versions?",
        a: "Yes. Version history can be listed newest-first, and a specific version can be fetched by its version number.",
        evidence: ["src/lib/products/contractflow-ai/versions.ts:50-73"],
      },
      {
        q: "Can an earlier document version be restored?",
        a: "Yes. Restoring a version copies its saved blocks, header, footer, field values and selected entities back to the document.",
        evidence: ["src/lib/products/contractflow-ai/versions.ts:75-100"],
      },
      {
        q: "Can approval workflows have several steps?",
        a: "Yes. A workflow stores an ordered list of approval steps, each with its own label and role requirements.",
        evidence: ["src/lib/products/contractflow-ai/types.ts:155-180"],
      },
      {
        q: "Can workflow steps use conditions?",
        a: "Yes. Workflow steps can store conditions with a field, operator and value.",
        evidence: ["src/lib/products/contractflow-ai/types.ts:155-169"],
      },
      {
        q: "Can workflow steps notify roles or escalate?",
        a: "Yes. A step can list roles to notify and an optional escalation delay in days.",
        evidence: ["src/lib/products/contractflow-ai/types.ts:161-169"],
      },
      {
        q: "Can I see approvals assigned to me or my role?",
        a: "Yes. Pending approvals are filtered to records assigned to the viewer or to one of the viewer’s roles.",
        evidence: ["src/lib/products/contractflow-ai/workflows.ts:107-126"],
      },
      {
        q: "Can I see the approval history for one document?",
        a: "Yes. The approval lookup returns approval records associated with a specific document.",
        evidence: ["src/lib/products/contractflow-ai/workflows.ts:128-141"],
      },
      {
        q: "Can users without admin access still be restricted from unpublished documents?",
        a: "Yes. Library search limits non-admin and non-manager users to published or active documents, with authors additionally able to see documents they own.",
        evidence: ["src/lib/products/contractflow-ai/library.ts:14-24"],
      },
      {
        q: "Are document permissions split by action?",
        a: "Yes. ContractFlow checks separate permissions for creating, editing, approving, publishing, archiving, downloading and deleting documents.",
        evidence: ["src/app/(products)/contractflow-ai/(protected)/actions.ts:41-159", "src/app/(products)/contractflow-ai/(protected)/documents/[id]/page.tsx:20-35"],
      },
      {
        q: "Does ContractFlow keep an audit trail?",
        a: "Yes. Document, template, maker and workflow operations write audit events, and audit records include action, entity and actor details.",
        evidence: ["src/lib/products/contractflow-ai/documents.ts:35-42", "src/lib/products/contractflow-ai/templates.ts:59-73", "src/lib/products/contractflow-ai/audit.ts:6-44"],
      },
      {
        q: "Can documents record an effective date or expiry date?",
        a: "Yes. Document records include optional effective and expiry dates, and document-library search accepts effective-date and expiry-date filters.",
        evidence: ["src/lib/products/contractflow-ai/types.ts:100-136", "src/lib/products/contractflow-ai/library.ts:7-11"],
      },
      {
        q: "Can a document store its owner and collaborators?",
        a: "Yes. Document records include an owner and a collaborators list, in addition to the creator and updater.",
        evidence: ["src/lib/products/contractflow-ai/types.ts:100-136"],
      },
      {
        q: "Can documents be created, approved and downloaded only by permitted users?",
        a: "Yes. The UI and server actions separately enforce CREATE, APPROVE and DOWNLOAD permissions, so document actions depend on a user’s assigned permissions.",
        evidence: ["src/app/(products)/contractflow-ai/(protected)/actions.ts:41-107", "src/app/(products)/contractflow-ai/(protected)/documents/[id]/page.tsx:20-55"],
      },
    ],
  },
];
