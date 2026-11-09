/** T4 finance documents (fn.invoice_tpl to fn.petty_cash). Every figure, rate and tax amount comes from the company's billing and payroll records as an input. */
import { ai, aiSection, c1, col, f, fixedSection, hybridSection, kv, lockedSection, p, sig, whenSet } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { AMEND_POLICY, DOC_LAYOUT, POLICY_LAYOUT, docHeader, listRows, owner, policyHeader, policyInputs } from "@/lib/products/playbook-ai/catalogue/templates/t3-operations/common";
import { employeeInput } from "@/lib/products/playbook-ai/catalogue/templates/t1-hr/common";
import { NEVER_FINANCE, bankInputs, clientInput, letterHead } from "@/lib/products/playbook-ai/catalogue/templates/t4-vendor-presale-finance/common";

const BILL = { header: "letterhead", footer: "doc_number_page", titleAlign: "center" } as const;
const itemColumns = () => f.rows("items", "Line items", [col("description", "Description"), col("code", "HSN or SAC code", "text", false), col("quantity", "Quantity", "number"), col("rate", "Rate", "money"), col("amount", "Amount", "money")], { minRows: 1, maxRows: 80, help: "Take every line from the billing record. Do not retype rates." });
const taxColumns = () => f.rows("taxes", "Tax lines", [col("tax", "Tax"), col("rate", "Rate as per the tax calculation"), col("amount", "Amount", "money")], { minRows: 0, required: false, maxRows: 8, help: "From the tax calculation in billing; never typed from memory." });
const bankBlock = () => kv([["Bank", "{{input.bank_name}}"], ["Account name", "{{input.account_name}}"], ["Account number", "{{input.account_number}}"], ["IFSC", "{{input.ifsc|upper}}"], ["Branch", "{{input.branch|text|As per bank records}}"]]);

const invoice = defineTemplate("fn.invoice_tpl", {
  title: "Tax Invoice",
  layout: BILL,
  inputs: [clientInput(), f.text("invoice_number", "Invoice number"), f.date("invoice_date", "Invoice date"), f.date("due_date", "Due date"), f.text("place_of_supply", "Place of supply"), itemColumns(),
    f.money("taxable_value", "Total taxable value"), taxColumns(), f.money("total", "Invoice total"), ...bankInputs(), f.longtext("notes", "Notes", { required: false })],
  sections: [
    fixedSection("header", "Invoice details", [kv([["Invoice number", "{{input.invoice_number}}"], ["Invoice date", "{{input.invoice_date|date}}"], ["Due date", "{{input.due_date|date}}"], ["Place of supply", "{{input.place_of_supply}}"]]),
      kv([["Supplier", "{{company.legal_name}}"], ["Address", "{{company.address}}"], ["GSTIN", "{{company.gstin|upper}}"], ["PAN", "{{company.pan|upper}}"]]),
      kv([["Billed to", "{{client.name}}"], ["Address", "{{client.address}}"], ["GSTIN", "{{client.gstin|upper|Unregistered or not provided}}"]])]),
    fixedSection("items", "Items", [listRows("input.items", "{{item.description}} (HSN or SAC {{item.code|text|as applicable}}): {{item.quantity|number}} at {{item.rate|money}} = {{item.amount|money}}")]),
    fixedSection("gst", "Taxes", [kv([["Total taxable value", "{{input.taxable_value|money}}"]]), whenSet("input.taxes", [listRows("input.taxes", "{{item.tax}} ({{item.rate}}): {{item.amount|money}}")])]),
    fixedSection("total", "Total", [kv([["Invoice total", "{{input.total|money}}"], ["Amount in words", "{{input.total|words}}"]]), whenSet("input.notes", [p("{{input.notes}}")])]),
    fixedSection("bank", "Payment details", [bankBlock(), p("Please pay by the due date and quote the invoice number. Disputes must be raised in writing before the due date. Tax at source, if deducted, must be supported by the certificate the law prescribes. This invoice is computer generated.")]),
  ],
});

const proforma = defineTemplate("fn.proforma", {
  title: "Proforma Invoice",
  layout: BILL,
  inputs: [clientInput(), f.text("number", "Proforma number"), f.date("proforma_date", "Date"), f.date("valid_until", "Valid until"), itemColumns(), f.money("taxable_value", "Total taxable value"), taxColumns(), f.money("total", "Total")],
  sections: [
    fixedSection("items", "Items", [kv([["Proforma number", "{{input.number}}"], ["Date", "{{input.proforma_date|date}}"], ["Valid until", "{{input.valid_until|date}}"]]), p("To,\n**{{client.name}}**\n{{client.address}}\nGSTIN: {{client.gstin|upper|not provided}}"), listRows("input.items", "{{item.description}}: {{item.quantity|number}} at {{item.rate|money}} = {{item.amount|money}}")]),
    fixedSection("taxes", "Taxes and total", [kv([["Total taxable value", "{{input.taxable_value|money}}"]]), whenSet("input.taxes", [listRows("input.taxes", "{{item.tax}} ({{item.rate}}): {{item.amount|money}}")]), kv([["Total", "{{input.total|money}} ({{input.total|words}})"]]), callout0()]),
  ],
});
function callout0() { return p("This is a proforma invoice. It is not a tax invoice, does not create a tax liability, and cannot be used to claim input tax credit. A tax invoice will be issued when the supply is made or as the law requires."); }

const creditNote = defineTemplate("fn.credit_note", {
  title: "Credit Note",
  layout: BILL,
  inputs: [clientInput(), f.text("number", "Credit note number"), f.date("note_date", "Date"), f.text("invoice_number", "Original invoice number"), f.date("invoice_date", "Original invoice date"),
    f.longtext("reason_notes", "Reason for the credit", { feedsSections: ["reference"] }), f.money("taxable_amount", "Taxable value credited"), taxColumns(), f.money("total", "Total credited")],
  sections: [
    hybridSection("reference", "Reference", [kv([["Credit note number", "{{input.number}}"], ["Date", "{{input.note_date|date}}"], ["Against invoice", "{{input.invoice_number}} dated {{input.invoice_date|date}}"], ["Issued to", "{{client.name}}, {{client.address}}"], ["Client GSTIN", "{{client.gstin|upper|not provided}}"]]), p("Reason for the credit: [[input.reason_text|Reason|The reason for the credit, in one sentence]]")],
      ai("State the reason for the credit in one clear sentence, using only the notes.", ["input.reason_notes", "input.invoice_number"], NEVER_FINANCE, { tone: "neutral", minWords: 5, maxWords: 40 })),
    fixedSection("amount", "Amount", [kv([["Taxable value credited", "{{input.taxable_amount|money}}"]]), whenSet("input.taxes", [listRows("input.taxes", "{{item.tax}} ({{item.rate}}): {{item.amount|money}}")]), kv([["Total credited", "{{input.total|money}} ({{input.total|words}})"]]), p("This credit note reduces the amount due under the invoice named above. It will be set off against that invoice or, if the invoice is paid, against future invoices or refunded, as agreed with the client. Tax adjustments are made as the law requires.")]),
  ],
});

const receipt = defineTemplate("fn.receipt", {
  title: "Payment Receipt",
  layout: BILL,
  inputs: [clientInput(), f.text("number", "Receipt number"), f.date("received_on", "Date received"), f.money("amount", "Amount received"), f.select("mode", "Mode of payment", ["Bank transfer", "Cheque", "UPI", "Card", "Cash"]), f.text("reference", "Transaction or cheque reference", { required: false }), f.text("against", "Received against", { help: "Invoice number(s) or purpose." })],
  sections: [fixedSection("receipt", "Receipt", [kv([["Receipt number", "{{input.number}}"], ["Date", "{{input.received_on|date}}"], ["Received from", "{{client.name}}"], ["Amount", "{{input.amount|money}} ({{input.amount|words}})"], ["Mode", "{{input.mode}}"], ["Reference", "{{input.reference|text|Not applicable}}"], ["Received against", "{{input.against}}"]]), p("Received with thanks by {{company.legal_name}}. This receipt acknowledges the amount received and is subject to realisation where the payment is by cheque. It is computer generated."), p("For **{{company.legal_name}}**\n{{company.signatory_name}}, {{company.signatory_designation}}")])],
});

const reminder = defineTemplate("fn.payment_reminder", {
  title: "Payment Reminder",
  inputs: [clientInput(), f.text("contact", "Contact person at the client"), f.select("tone", "Tone", ["Friendly reminder", "Firm reminder", "Final notice"]),
    f.rows("invoices", "Overdue invoices", [col("number", "Invoice number"), col("date", "Invoice date", "date"), col("due", "Due date", "date"), col("amount", "Amount due", "money")], { minRows: 1, maxRows: 30 }), f.money("total_due", "Total overdue"),
    f.text("pay_to", "How to pay", { help: "For example the bank account on the invoices, or the payment link." }), f.longtext("note", "Anything specific to add", { required: false, feedsSections: ["letter"] })],
  sections: [
    hybridSection("letter", "Letter", [...letterHead("client", "Overdue payment: {{input.tone}}", "{{input.contact}}"), p("[[input.reminder_text|Message|A reminder in the chosen tone that the invoices below are overdue]]"), p("Please arrange payment of the total overdue amount of **{{input.total_due|money}}** at the earliest, {{input.pay_to}}. If you have already paid, please send us the payment details so that we can match it. If you dispute any invoice, please tell us in writing so that we can resolve it promptly."), p("Regards,\n{{company.signatory_name}}\n{{company.signatory_designation}}\n{{company.legal_name}}")],
      ai("Write two or three sentences in the chosen tone reminding the client that the listed invoices are overdue. Friendly: warm and assuming an oversight. Firm: direct and clear. Final notice: formal, stating that the company may take further steps allowed by the agreement. Do not threaten legal action or interest unless the notes say so.", ["client.name", "input.tone", "input.note"], [...NEVER_FINANCE, "threats, penalties, interest or legal action not in the notes"], { tone: "firm", minWords: 25, maxWords: 90 })),
    fixedSection("table", "Overdue invoices", [listRows("input.invoices", "Invoice {{item.number}} dated {{item.date|date}}, due {{item.due|date}}: {{item.amount|money}}")]),
  ],
});

const expensePolicy = defineTemplate("fn.expense_policy", {
  title: "Expense Policy",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.rows("limits", "Limits by category", [col("category", "Expense category"), col("limit", "Limit", "money"), col("conditions", "Conditions", "text", false)], { minRows: 1, maxRows: 25 }),
    f.rows("approvers", "Approval levels", [col("level", "Level"), col("approver", "Approver"), col("up_to", "Approves up to", "money")], { minRows: 1, maxRows: 8 }),
    f.number("claim_within_days", "Days within which a claim must be submitted", { min: 1, max: 365 }), f.number("pay_within_days", "Days within which approved claims are paid", { min: 1, max: 180 })],
  sections: [
    fixedSection("policy", "Policy", [policyHeader(), p("The Company reimburses reasonable expenses that employees incur wholly and necessarily for the Company's business, when they are within this policy, supported by documents and approved. Expenses that are personal, avoidable or unsupported are not reimbursed.")]),
    fixedSection("limits", "Limits", [listRows("input.limits", "**{{item.category}}**: up to {{item.limit|money}}. {{item.conditions|text}}"), p("Spending above a limit needs prior written approval from the next approval level.")]),
    lockedSection("claims", "Claims", [c1("Claims are submitted through the Company's expense system within {{input.claim_within_days|number}} days of the expense, with the original bill or receipt, the business purpose, and the names of any guests."), c1("Employees must give true claims. A false or inflated claim is serious misconduct and may lead to recovery and disciplinary action."), c1("Approved claims are paid within {{input.pay_within_days|number}} days of approval, through payroll or by bank transfer. Advances are settled against claims, and unspent advances are returned."), c1("Tax and statutory rules on reimbursements are applied as the law requires.")]),
    fixedSection("approval", "Approval", [listRows("input.approvers", "**{{item.level}}**: {{item.approver}}, up to {{item.up_to|money}}"), p("No one may approve their own claim or a claim of a person who approves theirs. {{input.owner}} reviews this policy regularly. "+AMEND_POLICY)]),
  ],
});

const travelPolicy = defineTemplate("fn.travel_policy", {
  title: "Travel Policy",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.rows("grades", "Entitlements by grade", [col("grade", "Grade or level"), col("travel", "Travel class"), col("stay", "Accommodation limit per night", "money"), col("allowance", "Daily allowance", "money")], { minRows: 1, maxRows: 15 }),
    f.longtext("booking_notes", "Booking and approval rules", { feedsSections: ["policy"] })],
  sections: [
    aiSection("policy", "Policy", [policyHeader(), p("Business travel must be necessary, approved in advance and booked economically. [[input.booking_text|Rules|How travel is approved and booked]]")], ai("Describe how travel is approved and booked, using only the notes.", ["input.booking_notes"], NEVER_FINANCE, { tone: "instructional", minWords: 30, maxWords: 150 })),
    fixedSection("entitlements", "Entitlements", [listRows("input.grades", "**{{item.grade}}**: travel by {{item.travel}}; accommodation up to {{item.stay|money}} per night; daily allowance {{item.allowance|money}}"), p("Costs above these entitlements need prior written approval. Travel costs are claimed under the Expense Policy with supporting documents. Employees must travel safely and follow the law and the rules of the carriers and hotels they use. "+AMEND_POLICY)]),
  ],
});

const reimbursement = defineTemplate("fn.reimbursement", {
  title: "Expense Reimbursement Claim",
  layout: DOC_LAYOUT,
  inputs: [employeeInput(), f.text("period", "Claim period"), f.rows("items", "Expenses", [col("date", "Date", "date"), col("category", "Category"), col("description", "Business purpose"), col("amount", "Amount", "money")], { minRows: 1, maxRows: 60 }), f.money("total", "Total claimed")],
  sections: [
    fixedSection("items", "Expenses", [kv([["Employee", "{{employee.name}}"], ["Employee code", "{{employee.code}}"], ["Department", "{{employee.department}}"], ["Claim period", "{{input.period}}"]]), listRows("input.items", "{{item.date|date}}, {{item.category}}: {{item.description}}, {{item.amount|money}}"), kv([["Total claimed", "{{input.total|money}} ({{input.total|words}})"]])]),
    lockedSection("declaration", "Declaration", [p("I declare that these expenses were incurred wholly and necessarily for the Company's business, that the amounts and details are true, that the bills and receipts attached are genuine, and that I have not claimed or been paid any of them before. I understand that a false claim is misconduct."), p("Employee signature: ______________________    Date: ______________"), p("Approved by: ______________________    Date: ______________")]),
  ],
});

const advance = defineTemplate("fn.advance_request", {
  title: "Salary Advance Request",
  layout: DOC_LAYOUT,
  inputs: [employeeInput(), f.money("amount", "Advance requested"), f.longtext("reason_notes", "Reason for the advance", { feedsSections: ["request"] }),
    f.number("instalments", "Number of monthly instalments for recovery", { min: 1, max: 60, help: "Use the company's advance policy. Recovery from salary must follow applicable law." }), f.date("first_recovery", "Recovery starts from the salary of")],
  sections: [
    hybridSection("request", "Request", [kv([["Employee", "{{employee.name}}"], ["Employee code", "{{employee.code}}"], ["Designation", "{{employee.designation}}"], ["Department", "{{employee.department}}"], ["Advance requested", "{{input.amount|money}} ({{input.amount|words}})"]]), p("Reason: [[input.reason_text|Reason|A short statement of the reason]]")],
      ai("State the reason for the advance in one or two respectful sentences, using only the notes.", ["employee.first_name", "input.reason_notes"], NEVER_FINANCE, { tone: "neutral", minWords: 5, maxWords: 50 })),
    lockedSection("recovery", "Recovery", [
      c1("I request the advance stated above and agree that the Company may recover it from my salary in {{input.instalments|number}} equal monthly instalments, beginning with the salary for {{input.first_recovery|date}}, to the extent the law permits deductions from wages."),
      c1("If my employment ends before the advance is fully recovered, I agree that the balance may be adjusted against my full and final settlement as far as the law permits, and I shall pay any remaining balance to the Company."),
      c1("The advance is a loan on the Company's discretion. It carries no interest unless the Company's policy says otherwise, and it does not create a right to any further advance."),
    ]),
    lockedSection("approval", "Approval", [p("Requested by the employee and approved by the Company as below."), sig("Employee", "counterparty", { designation: false }), sig("Reporting manager", "approver"), sig("Finance and HR", "company_signatory")]),
  ],
});

const budget = defineTemplate("fn.budget_proposal", {
  title: "Budget Proposal: {{input.department}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("department", "Department"), f.text("period", "Budget period"), f.rows("items", "Budget lines", [col("item", "Item"), col("amount", "Amount", "money"), col("note", "Basis", "text", false)], { minRows: 1, maxRows: 60 }), f.money("total", "Total requested"),
    f.longtext("justification_notes", "Why the budget is needed", { feedsSections: ["justification"] })],
  sections: [
    fixedSection("summary", "Summary", [docHeader([["Department", "{{input.department}}"], ["Period", "{{input.period}}"], ["Total requested", "{{input.total|money}} ({{input.total|words}})"]])]),
    fixedSection("table", "Budget", [listRows("input.items", "{{item.item}}: {{item.amount|money}}. {{item.note|text}}")]),
    aiSection("justification", "Justification", [p("[[input.justification_text|Justification|Why the budget is needed and what it will deliver]]")], ai("Explain why the budget is needed and what it will deliver, using only the notes and budget lines.", ["input.department", "input.justification_notes"], [...NEVER_FINANCE, "benefits, savings or returns not in the notes"], { minWords: 40, maxWords: 180 })),
  ],
});

const pettyCash = defineTemplate("fn.petty_cash", {
  title: "Petty Cash Policy",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.text("custodian", "Petty cash custodian"), f.money("float", "Petty cash float"), f.money("per_item_limit", "Limit for a single payment"), f.text("replenish", "When the float is replenished", { help: "For example 'when it falls to the amount Finance sets'." }), f.text("count_cycle", "How often the cash is counted")],
  sections: [fixedSection("policy", "Policy", [policyHeader(),
    c1("The Company keeps a petty cash float of {{input.float|money}} ({{input.float|words}}) with {{input.custodian}}, for small, urgent business expenses that cannot reasonably be paid through the usual payment process."),
    c1("A single payment may not exceed {{input.per_item_limit|money}}. A larger payment goes through the usual approval and payment process. Payments may not be split to stay within the limit."),
    c1("Every payment needs a signed voucher, approved by the person's manager, with the bill or receipt attached. Petty cash is never used for personal loans or advances."),
    c1("The float is replenished {{input.replenish}}, on a reconciliation of vouchers and cash signed by the custodian and checked by Finance."),
    c1("The cash is counted {{input.count_cycle}} by someone other than the custodian, and any difference is investigated and reported to Finance. Cash is kept locked, and loss or theft is reported at once."),
    c1(AMEND_POLICY)])],
});

export const FN_DOCS: TemplateDef[] = [invoice, proforma, creditNote, receipt, reminder, expensePolicy, travelPolicy, reimbursement, advance, budget, pettyCash];
