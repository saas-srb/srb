/** T4 vendor documents (vn.onboarding to vn.performance). */
import { ai, aiSection, c1, col, f, fixedSection, hybridSection, kv, lockedSection, p, sig, whenSet, whenYes } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { DOC_LAYOUT, POLICY_LAYOUT, docHeader, listRows, owner } from "@/lib/products/playbook-ai/catalogue/templates/t3-operations/common";
import { CONTRACT_LAYOUT, I, NEVER_CONTRACT, executionSection, lawSection, parties, taxes, confidentiality } from "@/lib/products/playbook-ai/catalogue/templates/t2-contracts/common";
import { companySignOff } from "@/lib/products/playbook-ai/catalogue/templates/t1-hr/common";
import { NEVER_COMMERCIAL, bankInputs, letterHead, vendorInput } from "@/lib/products/playbook-ai/catalogue/templates/t4-vendor-presale-finance/common";

const onboarding = defineTemplate("vn.onboarding", {
  title: "Vendor Onboarding Form",
  layout: DOC_LAYOUT,
  inputs: [vendorInput(), owner(), f.text("supplies", "Goods or services the vendor will supply"),
    f.text("gstin", "GSTIN", { bindings: ["vendor.gstin"], required: false, help: "Leave blank if the vendor is not registered for GST, and say why in the remarks." }),
    f.text("pan", "PAN", { bindings: ["vendor.pan"] }),
    f.yesno("msme", "Is the vendor registered as a micro, small or medium enterprise?"),
    f.text("udyam", "Udyam registration number", { required: false, showWhen: { key: "msme", equals: "yes" } }),
    ...bankInputs(), f.text("contact_name", "Vendor contact person", { bindings: ["vendor.contact_person"] }), f.longtext("remarks", "Remarks", { required: false })],
  sections: [
    fixedSection("details", "Vendor details", [docHeader(), kv([["Vendor", "{{vendor.name}}"], ["Address", "{{vendor.address}}"], ["Contact person", "{{input.contact_name}}"], ["Email", "{{vendor.email}}"], ["Phone", "{{vendor.phone}}"], ["Will supply", "{{input.supplies}}"]])]),
    fixedSection("compliance", "Tax and compliance details", [kv([["PAN", "{{input.pan|upper}}"], ["GSTIN", "{{input.gstin|upper|Not registered}}"]]), whenYes("input.msme", [p("The vendor states that it is a registered micro, small or medium enterprise, Udyam registration number {{input.udyam|upper|to be provided}}.")]), whenSet("input.remarks", [p("Remarks: {{input.remarks}}")]), p("Documents to be attached by the vendor: PAN card, GST registration certificate if registered, a cancelled cheque or bank letter, and the MSME registration certificate if applicable. The Company may ask for further documents and may verify the details with the authorities and the bank.")]),
    fixedSection("bank", "Bank details", [kv([["Bank", "{{input.bank_name}}"], ["Account holder", "{{input.account_name}}"], ["Account number", "{{input.account_number}}"], ["IFSC", "{{input.ifsc|upper}}"], ["Branch", "{{input.branch|text|As per bank letter}}"]]), p("Payments are made only to this account, in the vendor's name. A change of bank details is accepted only on a signed request on the vendor's letterhead, verified by the Company by calling the known contact.")]),
    lockedSection("declaration", "Declaration", [
      c1("The vendor declares that the information and documents given in this form are true and complete, and that it will tell the Company promptly of any change, including of its tax registration, bank account or ownership."),
      c1("The vendor shall issue valid tax invoices, shall comply with the laws that apply to it, and agrees that the Company may deduct tax at source and make other deductions as the law requires."),
      c1("The vendor agrees to follow the Company's vendor code of conduct and to keep the Company's information confidential."),
      sig("Vendor", "counterparty"), sig("For the Company", "company_signatory"),
    ]),
  ],
});

const rfp = defineTemplate("vn.rfp", {
  title: "Request for Proposal: {{input.title}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("title", "Title of the requirement"), f.date("deadline", "Proposals due by"), f.date("questions_by", "Questions due by", { required: false }),
    f.longtext("background_notes", "Background", { feedsSections: ["background"] }), f.longtext("scope_notes", "Scope of work required", { feedsSections: ["scope"] }),
    f.rows("criteria", "Evaluation criteria", [col("criterion", "Criterion"), col("weight", "Weight or importance")], { minRows: 1, maxRows: 15 }),
    f.longtext("submission_notes", "What a proposal must contain and how to submit it", { feedsSections: ["submission"] }),
    f.text("contact", "Contact for questions"), f.number("validity_days", "Days a proposal must remain valid", { min: 1, max: 365 })],
  sections: [
    aiSection("background", "Background", [docHeader([["Requirement", "{{input.title}}"], ["Proposals due by", "{{input.deadline|date}}"]]), p("[[input.background_text|Background|About the company and why the requirement exists]]")], ai("Give the background to the requirement, using only the notes.", ["company.name", "input.title", "input.background_notes"], NEVER_COMMERCIAL, { minWords: 40, maxWords: 150 })),
    aiSection("scope", "Scope of work", [p("[[input.scope_text|Scope|What the vendor is asked to deliver]]")], ai("Describe the scope of work required, with what is excluded, using only the notes.", ["input.title", "input.scope_notes"], NEVER_COMMERCIAL, { tone: "instructional", minWords: 50, maxWords: 250 })),
    fixedSection("criteria", "Evaluation criteria", [p("Proposals will be evaluated on the following criteria:"), listRows("input.criteria", "**{{item.criterion}}**: {{item.weight}}")]),
    aiSection("submission", "Submission", [p("Proposals must reach {{input.contact}} on or before {{input.deadline|date}}. Questions should be sent in writing. [[input.submission_text|Submission|What to include and how to submit]]"), whenSet("input.questions_by", [p("Questions must be received by {{input.questions_by|date}}.")])], ai("State what a proposal must contain and how to submit it, using only the notes.", ["input.contact", "input.deadline", "input.submission_notes"], NEVER_COMMERCIAL, { tone: "instructional", minWords: 30, maxWords: 150 })),
    lockedSection("terms", "Terms of this request", [
      c1("This request is an invitation to submit proposals. It is not an offer, and the Company is not bound to accept any proposal or to give a reason for its decision. The Company may change, extend or cancel this request at any time."),
      c1("Bidders bear all their costs of preparing and submitting proposals. Proposals must remain valid for {{input.validity_days|number}} days from the closing date."),
      c1("Information in this request and given in discussions is confidential and may be used only to prepare a proposal. The Company will keep bidders' proposals confidential and will use them only to evaluate them."),
      c1("A bidder must not offer any gift or improper advantage to the Company's people. Any such offer disqualifies the bid. Bidders must disclose any conflict of interest."),
      c1("Prices must be stated exclusive of taxes, with taxes shown separately, and in Indian rupees unless this request says otherwise. The selected bidder will be asked to sign a written contract on the Company's terms, and no work starts before it is signed."),
    ]),
  ],
});

const rfq = defineTemplate("vn.rfq", {
  title: "Request for Quotation",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.date("quote_by", "Quotation due by"), f.text("delivery_place", "Delivery place"), f.date("delivery_by", "Delivery required by"), f.text("contact", "Contact for questions"),
    f.rows("items", "Items", [col("item", "Item or service"), col("specification", "Specification", "text", false), col("quantity", "Quantity", "number"), col("unit", "Unit")], { minRows: 1, maxRows: 60 }),
    f.number("validity_days", "Days a quotation must remain valid", { min: 1, max: 365 })],
  sections: [
    fixedSection("items", "Items", [docHeader([["Quotation due by", "{{input.quote_by|date}}"], ["Contact", "{{input.contact}}"]]), p("Please quote for the following:"), listRows("input.items", "**{{item.item}}**: {{item.quantity|number}} {{item.unit}}. {{item.specification|text}}")]),
    lockedSection("terms", "Terms", [
      c1("Delivery to {{input.delivery_place}} by {{input.delivery_by|date}}. State the delivery period you can meet."),
      c1("Quote the unit price and total for each item, exclusive of taxes, with taxes shown separately, and state any packing, freight or other charges and the payment terms you require."),
      c1("The quotation must remain valid for {{input.validity_days|number}} days from the due date. This request is not an order, and the Company may accept or reject any quotation, or none, without giving a reason."),
      c1("Quotations must be sent to {{input.contact}} before the due date."),
    ]),
  ],
});

const evaluation = defineTemplate("vn.evaluation", {
  title: "Vendor Evaluation Scorecard: {{input.requirement}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("requirement", "Requirement being evaluated"), f.date("evaluated_on", "Evaluation date"),
    f.rows("criteria", "Criteria", [col("criterion", "Criterion"), col("weight", "Weight")], { minRows: 1, maxRows: 15 }),
    f.rows("scores", "Scores", [col("vendor", "Vendor"), col("criterion", "Criterion"), col("score", "Score", "number"), col("comment", "Comment", "text", false)], { minRows: 1, maxRows: 120, help: "Use the scoring scale the evaluators agreed before they began." }),
    f.longtext("recommendation_notes", "Evaluators' conclusions", { feedsSections: ["recommendation"] })],
  sections: [
    fixedSection("criteria", "Criteria", [docHeader([["Requirement", "{{input.requirement}}"], ["Evaluated on", "{{input.evaluated_on|date}}"]]), listRows("input.criteria", "**{{item.criterion}}**: weight {{item.weight}}")]),
    fixedSection("scores", "Scores", [listRows("input.scores", "{{item.vendor}}, {{item.criterion}}: {{item.score|number}}. {{item.comment|text}}")]),
    aiSection("recommendation", "Recommendation", [p("[[input.recommendation_text|Recommendation|Which vendor is recommended and why]]")], ai("State which vendor the evaluators recommend and why, using only the scores and conclusions supplied.", ["input.requirement", "input.recommendation_notes"], [...NEVER_COMMERCIAL, "scores or rankings that are not in the supplied scores"], { minWords: 40, maxWords: 170 })),
  ],
});

const po = defineTemplate("vn.po", {
  title: "Purchase Order",
  layout: { header: "letterhead", footer: "doc_number_page", titleAlign: "center" },
  inputs: [vendorInput(), f.date("po_date", "Order date"), f.text("quotation_ref", "Quotation or contract reference", { required: false }),
    f.rows("items", "Items", [col("description", "Description"), col("quantity", "Quantity", "number"), col("unit", "Unit"), col("rate", "Rate", "money"), col("amount", "Amount", "money")], { minRows: 1, maxRows: 60, help: "Take quantities and rates from the approved quotation or contract." }),
    f.money("taxable_value", "Total before tax"), f.rows("taxes", "Taxes", [col("tax", "Tax"), col("rate", "Rate as per invoice"), col("amount", "Amount", "money")], { minRows: 0, required: false, maxRows: 6, help: "From the tax calculation; never typed from memory." }),
    f.money("total", "Total order value"), f.text("delivery_place", "Deliver to"), f.date("delivery_by", "Deliver by"), f.number("payment_days", "Payment within (days of valid invoice)", { min: 0, max: 180 })],
  sections: [
    fixedSection("items", "Items", [p("Date: {{input.po_date|date}}\nPO number: {{doc.number||To be assigned on issue}}"), p("To,\n**{{vendor.name}}**\n{{vendor.address}}\nGSTIN: {{vendor.gstin|upper|not provided}}"), whenSet("input.quotation_ref", [p("Reference: {{input.quotation_ref}}")]), p("Please supply the following on the terms below:"), listRows("input.items", "{{item.description}}: {{item.quantity|number}} {{item.unit}} at {{item.rate|money}} = {{item.amount|money}}")]),
    fixedSection("taxes", "Taxes and total", [kv([["Total before tax", "{{input.taxable_value|money}}"]]), whenSet("input.taxes", [listRows("input.taxes", "{{item.tax}} ({{item.rate}}): {{item.amount|money}}")]), kv([["Total order value", "{{input.total|money}} ({{input.total|words}})"]])]),
    fixedSection("delivery", "Delivery", [p("Deliver to {{input.delivery_place}} by {{input.delivery_by|date}}, with a delivery note quoting this order number.")]),
    lockedSection("terms", "Terms", [
      c1("This order is accepted when the vendor confirms it or begins to perform it. The vendor's own terms do not apply."),
      c1("Goods and services must conform to the specification, be of satisfactory quality, and are subject to inspection. The Company may reject non-conforming supplies, which the vendor shall replace or correct at its cost."),
      c1("The vendor shall invoice against this order number, with a valid tax invoice, and the Company shall pay valid undisputed invoices within {{input.payment_days|number}} days of receiving them, after deducting tax at source where the law requires."),
      c1("Prices are fixed and include all charges unless this order says otherwise. The order may not be varied except in writing by the Company."),
      c1("The vendor shall keep the Company's information confidential and shall comply with all applicable laws. This order is governed by the laws of India."),
      ...companySignOff(), sig("Vendor's acknowledgement", "counterparty"),
    ]),
  ],
});

const workOrder = defineTemplate("vn.work_order", {
  title: "Work Order",
  layout: CONTRACT_LAYOUT,
  inputs: [vendorInput(), f.date("effective_date", "Work order date"), f.longtext("scope_notes", "Scope of work", { feedsSections: ["scope"] }), f.money("value", "Work order value (before tax)"),
    f.date("start_date", "Start date"), f.date("end_date", "Completion date"), I.paymentDays(), I.noticeDays(), I.cureDays(), I.city(), I.stamp(), I.witnesses()],
  sections: [
    lockedSection("parties", "Parties", parties("vendor", "Vendor", "This work order (the \"Work Order\") is issued on {{input.effective_date|date}} by:")),
    hybridSection("scope", "Scope", [c1("**Scope.** The Vendor shall carry out the following work for the Company (the \"Work\"): [[input.scope_text|Scope|Description of the work and deliverables]]"), c1("The Vendor shall perform the Work with professional skill and care, using suitably qualified people, and comply with the law and the Company's reasonable site and security rules.")],
      ai("Describe the work and its deliverables in clear contractual language, using only the notes.", ["vendor.name", "input.scope_notes"], NEVER_CONTRACT, { minWords: 30, maxWords: 200 })),
    lockedSection("value", "Value", [c1("The value of the Work is {{input.value|money}} ({{input.value|words}}), exclusive of applicable taxes, which are payable in addition against a valid tax invoice. The value is fixed unless the Company agrees a change in writing before it is incurred."), c1("The Vendor shall invoice as the Company agrees and the Company shall pay each valid undisputed invoice within {{input.payment_days|number}} days of receiving it."), ...taxes()]),
    lockedSection("timeline", "Timeline", [c1("The Vendor shall start on {{input.start_date|date}} and complete the Work by {{input.end_date|date}}. Time is of the essence. If the Vendor is likely to be late it shall tell the Company at once, and the Company may extend the date in writing.")]),
    lockedSection("terms", "Terms", [
      c1("The Vendor is an independent contractor and is responsible for its own people, taxes and statutory dues. It shall not subcontract the Work without the Company's written consent."),
      c1("Work product created for the Company belongs to the Company on payment. The Vendor shall keep the Company's information confidential, during the Work and afterwards."),
      c1("Either party may end this Work Order by giving {{input.notice_days|number}} days' written notice, or immediately if the other commits a material breach that it does not remedy within {{input.cure_days|number}} days of written notice. The Company shall pay for Work properly done up to the end."),
      c1("Neither party is liable for indirect or consequential loss, and each party's liability is limited to the value of this Work Order, except for fraud, wilful misconduct, breach of confidentiality, or liability that cannot be limited by law."),
      c1("Stamp duty, if payable, shall be borne by {{input.stamp_borne_by}}."),
    ]),
    lawSection(), executionSection("Vendor"),
  ],
});

const award = defineTemplate("vn.award", {
  title: "Letter of Award",
  inputs: [vendorInput(), f.text("reference", "RFP or quotation reference"), f.longtext("scope_notes", "What is being awarded", { feedsSections: ["letter"] }), f.money("value", "Award value (before tax)"), f.number("sign_within_days", "Days to sign the contract", { min: 1, max: 90 })],
  sections: [hybridSection("letter", "Letter", [
    ...letterHead("vendor", "Award of work: {{input.reference}}", "Sir or Madam"),
    p("With reference to your proposal {{input.reference}} and our discussions, we are pleased to inform you that {{company.legal_name}} has decided to award you the following: [[input.award_text|Award|What is awarded]]"),
    p("The value of the award is {{input.value|money}} ({{input.value|words}}), exclusive of applicable taxes. This letter records the Company's intention. The award is subject to the signing of a written contract or work order within {{input.sign_within_days|number}} days of this letter, on the Company's terms, and no work should start before it is signed. If the contract is not signed in that time, the Company may withdraw this award."),
    p("We thank you for your effort and look forward to working with you."), ...companySignOff(), sig("Vendor's acceptance", "counterparty"),
  ], ai("Describe what is awarded in one or two clear sentences, using only the notes.", ["vendor.name", "input.reference", "input.scope_notes"], NEVER_COMMERCIAL, { minWords: 15, maxWords: 80 }))],
});

const rejection = defineTemplate("vn.rejection", {
  title: "Vendor Regret Letter",
  inputs: [vendorInput(), f.text("reference", "RFP or quotation reference"), f.yesno("keep_on_list", "Keep the vendor on the approved list for future requirements?", { defaultValue: "yes" })],
  sections: [hybridSection("letter", "Letter", [
    ...letterHead("vendor", "Your proposal: {{input.reference}}", "Sir or Madam"),
    p("Thank you for responding to {{input.reference}} and for the time and effort that went into your proposal."),
    p("[[input.regret_text|Message|A short, courteous message that the Company will not proceed with this proposal]]"),
    whenYes("input.keep_on_list", [p("We value your interest and may contact you for future requirements.")]),
    p("We thank you again and wish you success."), p("Regards,\n{{company.signatory_name}}\n{{company.signatory_designation}}\n{{company.legal_name}}"),
  ], ai("Write two courteous sentences saying the Company will not proceed with the proposal this time. Give no scores, comparisons or reasons.", ["vendor.name", "input.reference"], [...NEVER_COMMERCIAL, "reasons for rejection, scores, prices or comparisons with other vendors"], { tone: "warm", minWords: 15, maxWords: 60 }))],
});

const sla = defineTemplate("vn.sla", {
  title: "Service Level Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [vendorInput(), I.effective(), f.longtext("service_notes", "Services covered", { feedsSections: ["services"] }),
    f.rows("targets", "Service targets", [col("service", "Service"), col("measure", "Measure"), col("target", "Target"), col("method", "How it is measured")], { minRows: 1, maxRows: 25 }),
    f.text("report_frequency", "How often the vendor reports"), f.number("report_days", "Days after period end for the report", { min: 1, max: 60 }),
    f.rows("credits", "Service credits", [col("shortfall", "Shortfall"), col("credit", "Credit")], { minRows: 1, maxRows: 10, help: "State the credits the parties agreed, in words or amounts." }),
    f.text("review_frequency", "How often the SLA is reviewed"), I.termMonths(), I.noticeDays(), I.cureDays(), I.city(), I.stamp(), I.witnesses()],
  sections: [
    lockedSection("parties", "Parties", parties("vendor", "Vendor", "This service level agreement (the \"SLA\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:")),
    hybridSection("services", "Services", [c1("**Services.** The Vendor shall provide the following services to the Company (the \"Services\") at the service levels in this SLA: [[input.services_text|Services|Description of the services covered]]")], ai("Describe the services covered, using only the notes.", ["vendor.name", "input.service_notes"], NEVER_CONTRACT, { minWords: 25, maxWords: 150 })),
    fixedSection("targets", "Service targets", [p("The Vendor shall meet these service levels in each reporting period:"), listRows("input.targets", "**{{item.service}}**: {{item.measure}} of {{item.target}}, measured by {{item.method}}")]),
    lockedSection("reporting", "Reporting", [c1("The Vendor shall give the Company a written report on performance against each service level {{input.report_frequency}}, within {{input.report_days|number}} days of the end of the period, with the data behind it and an explanation of any shortfall and the steps to prevent it happening again."), c1("The Company may check the Vendor's measurements and records on reasonable notice. If the parties disagree on a measurement, the Company's reasonable calculation applies until the disagreement is resolved.")]),
    fixedSection("penalties", "Service credits", [p("If the Vendor misses a service level, the Company is entitled to these credits against the next invoice:"), listRows("input.credits", "{{item.shortfall}}: {{item.credit}}"), p("Credits are a price adjustment that reflects the reduced value of the Services. They are not a penalty and do not limit the Company's other rights, including to end this SLA for repeated failure to meet the service levels.")]),
    lockedSection("review", "Review and term", [c1("The parties shall review this SLA {{input.review_frequency}} and may change it only in writing signed by both parties."), c1("This SLA starts on the Effective Date and continues for {{input.term_months|number}} months unless ended earlier. Either party may end it by {{input.notice_days|number}} days' written notice, or at once if the other commits a material breach not remedied within {{input.cure_days|number}} days of written notice."), ...confidentiality(false), c1("Stamp duty, if payable on this SLA, shall be borne by {{input.stamp_borne_by}}.")]),
    lawSection(), executionSection("Vendor"),
  ],
});

const paymentTerms = defineTemplate("vn.payment_terms", {
  title: "Payment Terms Schedule",
  layout: { header: "compact", footer: "doc_number_page", titleAlign: "center" },
  inputs: [vendorInput(), f.text("agreement_ref", "Agreement or order this schedule belongs to"), f.date("effective_date", "Effective date"), I.paymentDays(),
    f.rows("milestones", "Payment schedule", [col("milestone", "Milestone or event"), col("amount", "Amount", "money"), col("due", "Due date", "date", false)], { minRows: 1, maxRows: 24 }),
    f.text("late_payment", "Consequence of late payment", { required: false, help: "Only what the parties agreed, for example interest at an agreed rate." })],
  sections: [
    lockedSection("terms", "Terms", [
      p("This schedule is made on {{input.effective_date|date}} between {{company.legal_name}} and **{{vendor.name}}** (the \"Vendor\") and forms part of {{input.agreement_ref}} (the \"Agreement\")."),
      c1("The Vendor shall invoice on the events in the schedule below, with a valid tax invoice quoting the Agreement reference. The Company shall pay each valid undisputed invoice within {{input.payment_days|number}} days of receiving it."),
      c1("The Company may withhold an amount it disputes in good faith, shall tell the Vendor the reason, and shall pay the undisputed part."),
      whenSet("input.late_payment", [c1("Late payment: {{input.late_payment}}")]),
      ...taxes(),
    ]),
    fixedSection("schedule", "Schedule", [listRows("input.milestones", "{{item.milestone}}: {{item.amount|money}}, due {{item.due|date|on the event}}"), p("Amounts are exclusive of applicable taxes."), ...companySignOff(), sig("Vendor", "counterparty")]),
  ],
});

const vendorConduct = defineTemplate("vn.code_of_conduct", {
  title: "Vendor Code of Conduct",
  layout: POLICY_LAYOUT,
  inputs: [vendorInput(), f.longtext("extra_rules", "Additional requirements", { required: false, feedsSections: ["code"] })],
  sections: [
    hybridSection("code", "Code", [
      p("{{company.legal_name}} (the \"Company\") expects its vendors, and the people who work for them, to follow this Code. By supplying to the Company, the vendor agrees to follow it."),
      c1("**Legal compliance.** The vendor shall comply with all laws that apply to its business, including laws on tax, labour, safety, environment and data protection."),
      c1("**Integrity.** The vendor shall not offer, give, ask for or accept bribes or improper advantages, shall avoid conflicts of interest and tell the Company of any, and shall keep accurate records."),
      c1("**People.** The vendor shall not use forced, bonded or child labour, shall pay at least what the law requires, shall respect working-hours and safety laws, and shall not discriminate or harass."),
      c1("**Confidentiality and data.** The vendor shall protect the Company's confidential information and personal data and use it only for the Company's work."),
      c1("**Environment.** The vendor shall use resources responsibly and comply with environmental laws."),
      c1("**Subcontractors.** The vendor shall make sure its own subcontractors and suppliers meet standards equal to this Code."),
      p("[[input.additional_rules|Additional requirements|Further requirements specific to this vendor]]"),
      c1("**Reporting and checks.** The vendor shall report any breach of this Code to the Company promptly. The Company may, on reasonable notice, check compliance, and may suspend or end its relationship with a vendor that breaches this Code."),
    ], ai("Add short clauses for any additional requirements in the notes. If there are none, write nothing.", ["input.extra_rules"], NEVER_CONTRACT, { tone: "instructional", minWords: 5, maxWords: 100 })),
    lockedSection("acknowledgement", "Acknowledgement", [p("{{vendor.name}} confirms that it has read and understood this Code and will follow it."), sig("Vendor", "counterparty"), sig("For the Company", "company_signatory")]),
  ],
});

const performance = defineTemplate("vn.performance", {
  title: "Vendor Performance Review: {{vendor.name}}",
  layout: DOC_LAYOUT,
  inputs: [vendorInput(), owner(), f.text("period", "Review period"),
    f.rows("scores", "Scores", [col("criterion", "Criterion"), col("score", "Score", "number"), col("comment", "Comment", "text", false)], { minRows: 1, maxRows: 15, help: "Use the scale the company uses for vendor scoring." }),
    f.longtext("issue_notes", "Issues during the period", { feedsSections: ["issues"] }),
    f.rows("actions", "Agreed actions", [col("action", "Action"), col("owner", "Owner"), col("due", "Due date", "date", false)], { minRows: 0, required: false, maxRows: 15 })],
  sections: [
    fixedSection("scores", "Scores", [docHeader([["Vendor", "{{vendor.name}}"], ["Period", "{{input.period}}"]]), listRows("input.scores", "**{{item.criterion}}**: {{item.score|number}}. {{item.comment|text}}")]),
    aiSection("issues", "Issues", [p("[[input.issue_text|Issues|Issues during the period]]")], ai("Summarise the issues during the period, factually, using only the notes. If none, say no significant issues were recorded.", ["vendor.name", "input.issue_notes"], NEVER_COMMERCIAL, { tone: "neutral", minWords: 20, maxWords: 150 })),
    fixedSection("actions", "Actions", [whenSet("input.actions", [listRows("input.actions", "{{item.action}} (owner: {{item.owner}}, due {{item.due|date|as agreed}})")]), p("The review is shared with the vendor, and progress on actions is checked at the next review.")]),
  ],
});

export const VN_DOCS: TemplateDef[] = [onboarding, rfp, rfq, evaluation, po, workOrder, award, rejection, sla, paymentTerms, vendorConduct, performance];
