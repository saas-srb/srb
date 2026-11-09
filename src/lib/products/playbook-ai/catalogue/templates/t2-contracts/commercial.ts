/** T2 contracts, part 4: commercial and document-change agreements (vendor, partnership, reseller, MOU, amendment, renewal, termination, settlement, lease). */
import { ai, bullets, c1, callout, col, each, f, fixedSection, hybridSection, lockedSection, p, when, whenSet, whenYes } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import {
  CONTRACT_LAYOUT, I, NEVER_CONTRACT, baseTail, confidentiality, executionSection, generalProvisions, generalSection, lawSection, liability, parties, taxes, termSection, termination, governingLaw,
} from "@/lib/products/playbook-ai/catalogue/templates/t2-contracts/common";

const vendorAgreement = defineTemplate("ct.vendor_agreement", {
  title: "Vendor Supply Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("vendor", "Vendor"), I.effective(),
    f.longtext("supply_notes", "Goods or services to be supplied", { feedsSections: ["scope"] }),
    f.rows("prices", "Price list", [col("item", "Item or service"), col("rate", "Price", "money"), col("unit", "Per", "text")], { minRows: 1, maxRows: 40 }),
    f.number("delivery_days", "Days to deliver after an order", { min: 0, max: 365 }),
    f.number("inspection_days", "Days to inspect and reject after delivery", { min: 1, max: 90 }),
    f.number("warranty_months", "Warranty period (months)", { min: 0, max: 120 }),
    I.paymentDays(), I.termMonths(), I.autoRenew(), I.noticeDays(), I.cureDays(), I.survival(), I.liabilityCap(), ...baseTail(),
  ],
  sections: [
    lockedSection("parties", "Parties", parties("vendor", "Vendor", "This supply agreement (the \"Agreement\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:")),
    hybridSection("scope", "Scope", [
      c1("**Supply.** The Vendor shall supply to the Company, on the Company's written or electronic orders, the following goods or services (the \"Supplies\"): [[input.supply_text|Supplies|Description of the goods or services]]"),
      c1("Each order forms a separate contract on the terms of this Agreement. If an order or the Vendor's documents conflict with this Agreement, this Agreement prevails."),
    ], ai("Describe the goods or services to be supplied, with the specifications that were supplied, in clear contractual language.", ["vendor.name", "input.supply_notes"], NEVER_CONTRACT, { minWords: 25, maxWords: 160 })),
    fixedSection("price", "Price", [p("The prices of the Supplies are:"), each("input.prices", "item", [bullets(["{{item.item}}: {{item.rate|money}} per {{item.unit}}"])]), p("Prices are fixed for the term and include packing, forwarding and all charges, unless stated otherwise, and are exclusive of goods and services tax, which is payable in addition against a valid tax invoice.")]),
    lockedSection("delivery", "Delivery and acceptance", [
      c1("The Vendor shall deliver the Supplies to the place and by the date stated in the order, and in any case within {{input.delivery_days|number}} days of the order. Time is of the essence for delivery."),
      c1("Risk in goods passes to the Company on delivery, and ownership passes on delivery or payment, whichever is earlier. The Vendor shall pack goods properly and give a delivery note with each delivery."),
      c1("The Company may inspect the Supplies within {{input.inspection_days|number}} days of delivery and may reject any that do not conform to the order or this Agreement. The Vendor shall promptly replace or correct rejected Supplies at its cost, or refund the price."),
    ]),
    lockedSection("payment", "Payment", [c1("The Vendor shall invoice after delivery, and the Company shall pay each valid, undisputed invoice within {{input.payment_days|number}} days of receiving it. The Company may withhold amounts it disputes in good faith and shall tell the Vendor the reason."), ...taxes()]),
    lockedSection("warranty", "Warranty", [
      c1("The Vendor warrants that for {{input.warranty_months|number}} months from delivery the Supplies will conform to their specification, be of satisfactory quality and fit for their purpose, be free from defects in material and workmanship, and be delivered with good title free of any charge or claim."),
      c1("During the warranty period the Vendor shall repair or replace defective Supplies, or refund the price, at its cost, including reasonable transport. This does not limit the Company's other remedies."),
    ]),
    lockedSection("compliance", "Compliance", [
      c1("The Vendor shall comply with all laws that apply to it and to the Supplies, including tax, labour, environmental and safety laws, shall give valid tax invoices, and shall not offer or give any bribe or improper advantage to anyone in connection with this Agreement."),
      c1("The Company may, on reasonable notice, check the Vendor's compliance with this Agreement. The Vendor shall carry insurance appropriate to its business and the risks of the Supplies."),
    ]),
    termSection(),
    lockedSection("confidentiality", "Confidentiality", confidentiality()),
    lockedSection("liability", "Liability", liability()),
    lockedSection("termination", "Termination", termination()),
    generalSection(), lawSection(), executionSection("Vendor"),
  ],
});

const partnership = defineTemplate("ct.partnership", {
  title: "Strategic Alliance Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("party", "Partner", "Enter the partner's name and address."), I.effective(),
    f.longtext("purpose_notes", "Purpose of the alliance", { feedsSections: ["purpose"] }),
    f.rows("contributions", "Contributions", [col("who", "Party"), col("contribution", "What it contributes")], { minRows: 2, maxRows: 12 }),
    f.longtext("revenue_terms", "How revenue and costs are shared", { help: "State the agreed basis in words, including when it is paid and how it is accounted. Enter the figures that were agreed." }),
    f.text("company_lead", "Company relationship lead"), f.text("partner_lead", "Partner relationship lead"),
    f.text("review_frequency", "How often the leads meet to review", { help: "For example 'monthly'." }),
    I.termMonths(), I.noticeDays(), I.cureDays(), I.survival(), I.liabilityCap(), ...baseTail(),
  ],
  sections: [
    lockedSection("parties", "Parties", parties("party", "Partner", "This alliance agreement (the \"Agreement\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:")),
    hybridSection("purpose", "Purpose", [c1("**Purpose.** The parties wish to work together as follows (the \"Alliance\"): [[input.purpose_text|Purpose|What the parties will do together and why]]"), c1("Each party shall act in good faith, and in the spirit of this Agreement, towards the Alliance.")],
      ai("Describe the purpose of the alliance in clear, neutral language, using only the notes supplied.", ["party.name", "input.purpose_notes"], NEVER_CONTRACT, { minWords: 30, maxWords: 160 })),
    fixedSection("contributions", "Contributions", [p("Each party shall contribute the following to the Alliance:"), each("input.contributions", "item", [bullets(["**{{item.who}}**: {{item.contribution}}"])]), p("Each party bears its own costs of performing its contributions, unless the parties agree otherwise in writing.")]),
    lockedSection("revenue", "Revenue and costs", [
      c1("The parties shall share revenue and costs of the Alliance as follows: {{input.revenue_terms}}"),
      c1("Each party shall keep proper records of amounts relating to the Alliance, shall give the other a statement as this Agreement provides, and shall allow the other, on reasonable notice, to check those records."),
      ...taxes(),
    ]),
    lockedSection("governance", "Governance", [
      c1("The Company's lead is {{input.company_lead}} and the Partner's lead is {{input.partner_lead}}. The leads shall meet {{input.review_frequency}} to review the Alliance, and either party may replace its lead by written notice."),
      c1("A decision that affects the other party's rights or obligations under this Agreement needs the written agreement of both parties. Unresolved disagreements go to dispute resolution below."),
      c1("**Not a partnership.** The Alliance is a contractual arrangement. Nothing in it makes the parties partners in a partnership firm or members of a limited liability partnership, or gives either authority to bind the other. If the parties wish to form a firm or other entity, they shall do so by a separate document."),
      c1("Neither party shall use the other's name or logo without its written consent. Each party keeps ownership of its own intellectual property, and intellectual property created jointly shall be owned as the parties agree in writing."),
    ]),
    termSection2(),
    lockedSection("confidentiality", "Confidentiality", confidentiality()),
    lockedSection("liability", "Liability", liability()),
    lockedSection("exit", "Exit", termination()),
    generalSection(), lawSection(), executionSection("Partner"),
  ],
});

function termSection2() {
  return lockedSection("term", "Term", [c1("This Agreement starts on the Effective Date and continues for {{input.term_months|number}} months, unless it is ended earlier as this Agreement provides. Any extension must be agreed in writing before the term ends.")]);
}

const reseller = defineTemplate("ct.reseller", {
  title: "Reseller Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("party", "Reseller", "Enter the reseller's name and address."), I.effective(),
    f.longtext("products_notes", "Products or services the reseller may sell", { feedsSections: ["appointment"] }),
    f.text("territory", "Territory", { help: "For example a state, a region or a country." }),
    f.yesno("exclusive", "Is the appointment exclusive in the territory?", { defaultValue: "no" }),
    f.longtext("pricing_terms", "Pricing and margin", { help: "How the reseller's price or discount is set, in words, with the agreed figures.", feedsSections: ["pricing"] }),
    f.longtext("target_notes", "Sales targets", { required: false, help: "Targets as agreed, with the period they apply to." }),
    I.paymentDays(), I.termMonths(), I.noticeDays(), I.cureDays(), I.survival(), I.liabilityCap(), ...baseTail(),
  ],
  sections: [
    lockedSection("parties", "Parties", parties("party", "Reseller", "This reseller agreement (the \"Agreement\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:")),
    hybridSection("appointment", "Appointment", [
      c1("**Appointment.** The Company appoints the Reseller, and the Reseller accepts the appointment, to market and resell the following products and services of the Company (the \"Products\") in the Territory: [[input.products_text|Products|Products or services covered]]"),
      when("input.exclusive", "eq", "yes", [c1("The appointment is exclusive in the Territory for the term. The Company shall not appoint another reseller for the Products in the Territory, but may sell to customers directly where it is already doing so or as it agrees with the Reseller.")]),
      when("input.exclusive", "eq", "no", [c1("The appointment is non-exclusive. The Company may sell the Products directly and may appoint other resellers in the Territory.")]),
      c1("The Reseller shall use reasonable efforts to promote the Products, shall not make any promise or statement about them that the Company has not authorised, and shall not sell outside the Territory without the Company's written consent."),
    ], ai("Describe the products or services covered in clear contractual language, using only the notes supplied.", ["party.name", "input.products_notes"], NEVER_CONTRACT, { minWords: 15, maxWords: 120 })),
    lockedSection("territory", "Territory", [c1("The territory is: {{input.territory}} (the \"Territory\").")]),
    hybridSection("pricing", "Pricing and payment", [
      c1("The Reseller shall buy the Products from the Company at the prices and on the pricing terms below, and shall set its own resale prices: [[input.pricing_text|Pricing|How prices and margin work]]"),
      c1("The Company shall invoice the Reseller, and the Reseller shall pay within {{input.payment_days|number}} days of receiving each invoice, whether or not the Reseller has been paid by its customer."),
      ...taxes(),
    ], ai("State the pricing and margin terms in clear contractual language, using only the notes supplied.", ["input.pricing_terms"], NEVER_CONTRACT, { minWords: 20, maxWords: 140 })),
    lockedSection("targets", "Targets", [whenSet("input.target_notes", [c1("The Reseller shall use reasonable efforts to meet the following targets: {{input.target_notes}}")]), c1("The parties shall review performance from time to time. Failure to meet an agreed target is a ground for the Company to change or end exclusivity, if it applies, after discussing the matter with the Reseller.")]),
    lockedSection("conduct", "Conduct of business", [
      c1("The Reseller shall comply with all laws that apply to its business and shall not offer or give any bribe or improper advantage to anyone in connection with the Products."),
      c1("The Reseller may use the Company's names and marks only as the Company authorises in writing, and only to market the Products. All goodwill from that use belongs to the Company."),
      c1("The Reseller is an independent business and not an agent of the Company. It is solely responsible for its own staff, customers, taxes and liabilities, and shall deal with its customers' complaints promptly."),
    ]),
    termSection2(),
    lockedSection("confidentiality", "Confidentiality", confidentiality()),
    lockedSection("liability", "Liability", liability()),
    lockedSection("termination", "Termination", [...termination(), c1("On termination the Reseller shall stop marketing the Products and using the Company's marks, shall pay all amounts due, and the Company may, at its option, buy back unsold Products at the price the Reseller paid.")]),
    generalSection(), lawSection(), executionSection("Reseller"),
  ],
});

const mou = defineTemplate("ct.mou", {
  title: "Memorandum of Understanding",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("party", "Other party", "Enter the other party's name and address."), I.effective(),
    f.longtext("purpose_notes", "Objectives", { feedsSections: ["purpose"] }),
    f.longtext("company_roles", "What the Company will do", { feedsSections: ["roles"] }),
    f.longtext("party_roles", "What the other party will do", { feedsSections: ["roles"] }),
    I.termMonths(), I.survival(), ...baseTail(),
  ],
  sections: [
    lockedSection("parties", "Parties", parties("party", "Other Party", "This memorandum of understanding (the \"MoU\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:")),
    hybridSection("purpose", "Purpose", [c1("**Purpose.** The parties record their shared understanding and intentions in respect of the following: [[input.purpose_text|Purpose|Objectives of the MoU]]")], ai("Describe the objectives in clear, neutral language, using only the notes supplied.", ["party.name", "input.purpose_notes"], NEVER_CONTRACT, { minWords: 30, maxWords: 150 })),
    hybridSection("roles", "Roles", [
      c1("**Company.** The Company intends to: [[input.company_role_text|Company role|What the Company will do]]"),
      c1("**Other Party.** The Other Party intends to: [[input.party_role_text|Other party role|What the other party will do]]"),
      c1("Each party shall nominate a contact person for day-to-day coordination and shall bear its own costs unless they agree otherwise in writing."),
    ], ai("State each party's intended role as a short list, using only the notes supplied.", ["party.name", "input.company_roles", "input.party_roles"], NEVER_CONTRACT, { minWords: 30, maxWords: 180 })),
    lockedSection("term", "Term", [c1("This MoU starts on the Effective Date and continues for {{input.term_months|number}} months unless the parties extend it in writing or either party ends it earlier by written notice.")]),
    lockedSection("nonbinding", "Non-binding nature", [
      c1("This MoU records the parties' present intentions only. Except for the clauses on confidentiality, governing law and disputes, and stamp duty, it does not create legally binding obligations, and neither party is obliged to enter into any further agreement."),
      c1("Any binding commitment, including on payment, exclusivity or intellectual property, will arise only from a definitive written agreement signed by both parties."),
      c1("Each party may end discussions at any time without liability to the other."),
    ]),
    lockedSection("confidentiality", "Confidentiality", confidentiality()),
    lockedSection("law", "Governing law and stamp duty", [...governingLaw(), c1("Stamp duty, if payable on this MoU, shall be borne by {{input.stamp_borne_by}}.")]),
    executionSection("Other Party"),
  ],
});

const amendment = defineTemplate("ct.amendment", {
  title: "Amendment Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("party", "Other party", "Enter the other party's name and address."),
    f.text("original_title", "Agreement being amended", { help: "Its exact title, for example 'Master Services Agreement'." }),
    f.date("original_date", "Date of the agreement being amended"),
    I.effective(),
    f.rows("changes", "Changes", [col("clause", "Clause or section"), col("existing", "Existing wording or term"), col("amended", "Amended wording or term")], { minRows: 1, maxRows: 30 }),
    f.longtext("reason", "Reason for the amendment", { required: false, feedsSections: ["reference"] }),
    I.stamp(), I.witnesses(),
  ],
  sections: [
    hybridSection("reference", "Reference", [
      p("This amendment (the \"Amendment\") is made on {{input.effective_date|date}} between **{{company.legal_name}}**, of {{company.address}} (the \"Company\"), and **{{party.name}}**, of {{party.address}} (the \"Other Party\")."),
      c1("The parties are parties to the {{input.original_title}} dated {{input.original_date|date}} (the \"Agreement\"). Words defined in the Agreement have the same meaning in this Amendment."),
      c1("[[input.reason_text|Reason|Why the parties are amending the Agreement]]"),
    ], ai("State in one or two neutral sentences why the parties are amending the Agreement, using only the notes. If no reason was supplied, write that the parties wish to amend it as set out below.", ["input.reason", "input.original_title"], NEVER_CONTRACT, { minWords: 10, maxWords: 60 })),
    lockedSection("changes", "Changes", [c1("With effect from {{input.effective_date|date}}, the Agreement is amended as follows:"), each("input.changes", "item", [bullets(["**{{item.clause}}**: for \"{{item.existing}}\" read \"{{item.amended}}\""])])]),
    lockedSection("unchanged", "Unchanged terms", [
      c1("Except as this Amendment changes it, the Agreement continues in full force and effect, and this Amendment forms part of it. If this Amendment conflicts with the Agreement, this Amendment prevails."),
      c1("This Amendment is governed by the same law and the same dispute resolution provisions as the Agreement. It may be signed in counterparts and by electronic means to the extent the law permits."),
      c1("Stamp duty, if payable on this Amendment, shall be borne by {{input.stamp_borne_by}}."),
    ]),
    lockedSection("execution", "Execution", [p("The parties have signed this Amendment through their authorised signatories."), { type: "signatureBlock", label: "For the Company", partyRole: "company_signatory", showName: true, showDesignation: true, showDate: true }, { type: "signatureBlock", label: "For the Other Party", partyRole: "counterparty", showName: true, showDesignation: true, showDate: true }, whenYes("input.witnesses", [{ type: "signatureBlock", label: "Witness", partyRole: "witness", showName: true, showDesignation: false, showDate: true }])]),
  ],
});

const renewal = defineTemplate("ct.renewal", {
  title: "Renewal and Extension of Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("party", "Other party", "Enter the other party's name and address."),
    f.text("original_title", "Agreement being renewed"), f.date("original_date", "Date of that agreement"),
    f.date("current_end", "Current end date"), f.date("new_end", "New end date"), I.effective(),
    f.longtext("changed_terms", "Any terms that change on renewal", { required: false, help: "For example a revised fee. Leave blank if nothing changes." }),
    I.stamp(), I.witnesses(),
  ],
  sections: [
    lockedSection("reference", "Reference", [
      p("This renewal (the \"Renewal\") is made on {{input.effective_date|date}} between **{{company.legal_name}}**, of {{company.address}} (the \"Company\"), and **{{party.name}}**, of {{party.address}} (the \"Other Party\"), who are parties to the {{input.original_title}} dated {{input.original_date|date}} (the \"Agreement\"), which is due to end on {{input.current_end|date}}. Words defined in the Agreement have the same meaning here."),
    ]),
    lockedSection("new_term", "New term", [
      c1("The parties agree to extend the Agreement so that it ends on **{{input.new_end|date}}**, unless it is ended earlier as the Agreement provides."),
      whenSet("input.changed_terms", [c1("From the start of the extended period the following terms change: {{input.changed_terms}}")]),
      c1("Except as stated in this Renewal, all terms of the Agreement continue unchanged, including the dispute resolution provisions, and apply to the extended period. Rights and obligations that arose before the extension are not affected."),
      c1("This Renewal may be signed in counterparts and by electronic means to the extent the law permits. Stamp duty, if payable on it, shall be borne by {{input.stamp_borne_by}}."),
    ]),
    lockedSection("execution", "Execution", [p("The parties have signed this Renewal through their authorised signatories."), { type: "signatureBlock", label: "For the Company", partyRole: "company_signatory", showName: true, showDesignation: true, showDate: true }, { type: "signatureBlock", label: "For the Other Party", partyRole: "counterparty", showName: true, showDesignation: true, showDate: true }, whenYes("input.witnesses", [{ type: "signatureBlock", label: "Witness", partyRole: "witness", showName: true, showDesignation: false, showDate: true }])]),
  ],
});

const termination2 = defineTemplate("ct.termination", {
  title: "Termination of Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("party", "Other party", "Enter the other party's name and address."),
    f.select("kind", "Type of document", ["Notice of termination by the Company", "Mutual termination agreement"]),
    f.text("agreement_title", "Agreement being ended"), f.date("agreement_date", "Date of that agreement"),
    f.date("termination_date", "Termination takes effect on"), I.effective(),
    f.longtext("reason_notes", "Reason for termination", { required: false, feedsSections: ["notice"] }),
    f.longtext("dues_notes", "Amounts and items to settle", { required: false, help: "Outstanding payments, deliverables, returns of property or data, in words." }),
    f.yesno("witnesses", "Add witness signature blocks?"),
  ],
  sections: [
    hybridSection("notice", "Notice", [
      p("Date: {{input.effective_date|date}}\nTo: **{{party.name}}**, {{party.address}}"),
      p("**Subject: Termination of the {{input.agreement_title}} dated {{input.agreement_date|date}} (the \"Agreement\")**"),
      when("input.kind", "eq", "Notice of termination by the Company", [c1("**{{company.legal_name}}** (the \"Company\") gives notice that, under the termination provisions of the Agreement, the Agreement ends on **{{input.termination_date|date}}** (the \"Termination Date\"). This notice is given in writing as the Agreement requires.")]),
      when("input.kind", "eq", "Mutual termination agreement", [c1("**{{company.legal_name}}** (the \"Company\") and **{{party.name}}** (the \"Other Party\") agree that the Agreement ends by mutual consent on **{{input.termination_date|date}}** (the \"Termination Date\").")]),
      c1("[[input.reason_text|Reason|Neutral statement of why the Agreement is ending]]"),
    ], ai("State in one or two neutral sentences why the Agreement is ending, using only the notes supplied. If no reason was supplied, write nothing.", ["party.name", "input.reason_notes", "input.agreement_title"], [...NEVER_CONTRACT, "allegations of breach or fault not in the notes"], { tone: "neutral", minWords: 10, maxWords: 70 })),
    lockedSection("effect", "Effect of termination", [
      c1("From the Termination Date, neither party has any further obligation to perform the Agreement, except for obligations that by their nature continue, including confidentiality, intellectual property, liability, payment and governing law, which continue as the Agreement provides."),
      c1("Rights and liabilities that arose before the Termination Date are not affected, and each party shall return or destroy the other's materials, data and Confidential Information, and confirm in writing that it has done so."),
      when("input.kind", "eq", "Mutual termination agreement", [c1("Subject to the dues below, each party releases the other from claims arising out of the Agreement after the Termination Date, but not from claims for breach of confidentiality or of intellectual property rights, or for fraud, or for amounts already due.")]),
    ]),
    lockedSection("dues", "Dues", [
      c1("The parties shall settle all amounts due under the Agreement up to the Termination Date within the time the Agreement provides, or if it provides none, within a reasonable time after the Termination Date, on a proper invoice or statement."),
      whenSet("input.dues_notes", [c1("In particular: {{input.dues_notes}}")]),
      c1("This document may be signed in counterparts and by electronic means to the extent the law permits, and is governed by the same law and dispute resolution provisions as the Agreement."),
    ]),
    lockedSection("execution", "Execution", [p("Signed for the Company and, to confirm receipt or agreement, for the Other Party."), { type: "signatureBlock", label: "For the Company", partyRole: "company_signatory", showName: true, showDesignation: true, showDate: true }, { type: "signatureBlock", label: "For the Other Party (receipt or agreement)", partyRole: "counterparty", showName: true, showDesignation: true, showDate: true }, whenYes("input.witnesses", [{ type: "signatureBlock", label: "Witness", partyRole: "witness", showName: true, showDesignation: false, showDate: true }])]),
  ],
});

const settlement = defineTemplate("ct.settlement", {
  title: "Settlement Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("party", "Other party", "Enter the other party's name and address."), I.effective(),
    f.longtext("dispute_notes", "The dispute", { help: "What happened and what each side claims. Facts only.", feedsSections: ["recitals"] }),
    f.longtext("settlement_terms", "Terms of settlement", { help: "What each party will do, in words.", feedsSections: ["settlement"] }),
    f.money("settlement_amount", "Amount to be paid", { required: false }),
    f.select("payer", "Who pays", ["The Company", "The other party"], { required: false }),
    f.date("payment_date", "Payment due by", { required: false }),
    ...baseTail(),
  ],
  sections: [
    lockedSection("parties", "Parties", parties("party", "Other Party", "This settlement agreement (the \"Agreement\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:")),
    hybridSection("recitals", "Recitals", [c1("**Background.** A dispute has arisen between the parties (the \"Dispute\"): [[input.dispute_text|Dispute|Neutral summary of the dispute]]"), c1("The parties wish to settle the Dispute fully and finally, without admission of liability, on the terms of this Agreement.")],
      ai("Summarise the dispute neutrally, in the third person, using only the notes supplied. Do not assign fault.", ["party.name", "input.dispute_notes"], [...NEVER_CONTRACT, "allegations, fault or the strength of either side's case"], { tone: "neutral", minWords: 30, maxWords: 170 })),
    hybridSection("settlement", "Settlement", [
      c1("**Terms.** The parties settle the Dispute on these terms: [[input.settlement_text|Terms|What each party will do]]"),
      whenSet("input.settlement_amount", [c1("{{input.payer}} shall pay {{input.settlement_amount|money}} ({{input.settlement_amount|words}}) in full and final settlement, by {{input.payment_date|date|the date the parties agree in writing}}, by bank transfer to the account the payee notifies in writing. Tax at source shall be deducted where the law requires.")]),
      c1("The settlement takes effect when this Agreement is signed by both parties and, where an amount is payable, when it has been received."),
    ], ai("State the terms of settlement as clear, numbered obligations of each party, using only the notes supplied.", ["input.settlement_terms", "party.name"], NEVER_CONTRACT, { minWords: 30, maxWords: 220 })),
    lockedSection("release", "Release", [
      c1("On the settlement taking effect, each party releases the other, and its directors, officers, employees and affiliates, from all claims, demands and liabilities, known or unknown, arising out of the Dispute."),
      c1("The release does not cover obligations under this Agreement, claims that the law does not allow to be released, or claims unrelated to the Dispute."),
      c1("Neither party shall start or continue any proceeding about the Dispute, and each shall withdraw any pending proceeding on the Dispute within a reasonable time, at its own cost."),
    ]),
    lockedSection("no_admission", "No admission", [c1("This Agreement is a compromise. It is not an admission of liability, fault or wrongdoing by either party, and it shall not be used as evidence of any, except to enforce it.")]),
    lockedSection("confidentiality", "Confidentiality", [c1("The parties shall keep the terms of this Agreement and the negotiations leading to it confidential, and shall not make any statement that disparages the other about the Dispute, except to their advisers, auditors, insurers and regulators, as the law requires, or to enforce this Agreement.")]),
    lockedSection("general", "General provisions", [...generalProvisions().slice(2, 8)]),
    lawSection(), executionSection("Other Party"),
  ],
});

const lease = defineTemplate("ct.lease", {
  title: "Lease Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    f.select("role", "The Company is", ["The tenant", "The landlord"]),
    I.counter("party", "Other party", "Enter the name and address of the landlord or tenant, as the case may be."), I.effective(),
    f.longtext("premises", "Premises", { help: "Full address, floor, area and boundaries or a description sufficient to identify the property." }),
    f.text("use", "Permitted use", { help: "For example office use." }),
    f.money("rent", "Rent"), f.text("rent_period", "Rent is payable", { help: "For example 'each month' or 'each quarter'." }),
    f.text("rent_due", "Rent is due on", { help: "For example 'the fifth day of each month'." }),
    f.money("deposit", "Security deposit", { required: false }),
    f.longtext("escalation", "Rent revision", { required: false, help: "How and when the rent is revised, as agreed." }),
    f.longtext("charges", "Maintenance, utilities and taxes", { help: "Who pays what: maintenance, electricity, water, property tax and so on." }),
    I.termMonths("Term of the lease (months)"),
    f.number("lockin_months", "Lock-in period (months)", { min: 0, max: 600 }),
    I.noticeDays(), I.cureDays(), ...baseTail(),
  ],
  sections: [
    { ...fixedSection("registration_notice", "Registration and signing notice", [callout("important", "A lease beyond the period fixed by law, and certain other transactions in property, must be registered, and cannot be completed by electronic signature alone. Stamp duty and registration rules differ by state. Confirm the stamp duty, registration and signing requirements for this property with an advocate before signing.")], { locked: true }), draftOnly: true },
    lockedSection("parties", "Parties", [
      p("This lease agreement (the \"Lease\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:"),
      when("input.role", "eq", "The tenant", [p("**{{party.name}}**, of {{party.address}} (the \"Landlord\"); and"), p("**{{company.legal_name}}**, having its registered office at {{company.address}} (the \"Tenant\").")]),
      when("input.role", "eq", "The landlord", [p("**{{company.legal_name}}**, having its registered office at {{company.address}} (the \"Landlord\"); and"), p("**{{party.name}}**, of {{party.address}} (the \"Tenant\").")]),
    ]),
    lockedSection("premises", "Premises", [
      c1("The Landlord lets and the Tenant takes on lease the following premises (the \"Premises\"), with the fixtures and fittings listed in a schedule signed by the parties: {{input.premises}}"),
      c1("The Landlord confirms that it has good title to the Premises and the right to let them, that they are free of any charge or claim that would interfere with this Lease, and that all dues on them up to the Effective Date have been paid."),
      c1("The Tenant shall use the Premises only for: {{input.use}}."),
    ]),
    lockedSection("rent", "Rent and deposit", [
      c1("The Tenant shall pay the Landlord rent of {{input.rent|money}} ({{input.rent|words}}), payable {{input.rent_period}}, on {{input.rent_due}}, in advance, by bank transfer to the account the Landlord notifies in writing. Tax at source shall be deducted from rent where the law requires and the Tenant shall give the certificate the law prescribes."),
      whenSet("input.escalation", [c1("Rent revision: {{input.escalation}}")]),
      whenSet("input.deposit", [c1("The Tenant has paid, or shall pay on signing, an interest-free refundable security deposit of {{input.deposit|money}} ({{input.deposit|words}}). The Landlord may deduct from it only rent or charges due and the cost of repairing damage beyond fair wear and tear, and shall refund the balance when the Tenant hands back vacant possession.")]),
      c1("Maintenance, utilities, property tax and other charges are borne as follows: {{input.charges}}"),
    ]),
    lockedSection("term", "Term", [c1("The Lease starts on the Effective Date and continues for {{input.term_months|number}} months, unless ended earlier as this Lease provides. It may be renewed only by a written agreement signed by both parties before it ends.")]),
    lockedSection("lockin", "Lock-in", [c1("Neither party may end this Lease during the first {{input.lockin_months|number}} months from the Effective Date (the \"Lock-in Period\"), except for the other's uncured breach. A party that ends the Lease in breach of this clause shall pay the other the rent for the balance of the Lock-in Period.")]),
    lockedSection("obligations", "Obligations of the parties", [
      c1("The Tenant shall keep the Premises in good condition, shall not make structural changes without the Landlord's written consent, shall not sublet or part with possession, shall comply with the law and the rules of the building, and shall allow the Landlord to inspect the Premises on reasonable notice."),
      c1("The Landlord shall let the Tenant have quiet possession, shall carry out structural repairs and keep the Premises in a condition fit for the permitted use, and shall pay the charges that are its responsibility."),
    ]),
    lockedSection("termination", "Termination", [
      c1("After the Lock-in Period, either party may end this Lease by giving the other {{input.notice_days|number}} days' written notice."),
      c1("A party may end this Lease by written notice if the other commits a material breach, including non-payment of rent, and does not remedy it within {{input.cure_days|number}} days of written notice."),
      c1("On the Lease ending, the Tenant shall hand back vacant possession of the Premises in the condition in which it received them, apart from fair wear and tear, remove its belongings, and clear its dues, and the Landlord shall refund the deposit as provided above."),
    ]),
    lockedSection("general", "General provisions", [...generalProvisions().slice(2, 8)]),
    lawSection(), executionSection("Other Party"),
  ],
});

export const CT_COMMERCIAL: TemplateDef[] = [vendorAgreement, partnership, reseller, mou, amendment, renewal, termination2, settlement, lease];
