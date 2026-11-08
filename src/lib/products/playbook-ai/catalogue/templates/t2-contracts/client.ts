/** T2 contracts, part 1: agreements with clients (ct.client_agreement, ct.msa, ct.sow, ct.license). */
import { ai, aiSection, bullets, c1, col, each, f, hybridSection, kv, lockedSection, fixedSection, p, when } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import {
  CONTRACT_LAYOUT, I, NEVER_CONTRACT, baseTail, confidentiality, executionSection, generalSection, lawSection, liability, parties, taxes, termSection, termination, workProductIp,
} from "@/lib/products/playbook-ai/catalogue/templates/t2-contracts/common";

const feesByModel = () => [
  when("input.fee_model", "eq", "Fixed fee", [c1("**Fees.** The Client shall pay the Company a fixed fee of {{input.fee_amount|money}} ({{input.fee_amount|words}}) {{input.fee_unit}} for the Services.")]),
  when("input.fee_model", "eq", "Time and materials", [c1("**Fees.** The Client shall pay the Company for time spent on the Services at {{input.fee_amount|money}} ({{input.fee_amount|words}}) {{input.fee_unit}}, as recorded in timesheets the Company shares with the Client.")]),
  when("input.fee_model", "eq", "Monthly retainer", [c1("**Fees.** The Client shall pay the Company a retainer of {{input.fee_amount|money}} ({{input.fee_amount|words}}) {{input.fee_unit}} for the Services.")]),
];

const clientAgreement = defineTemplate("ct.client_agreement", {
  title: "Client Services Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("client", "Client"), I.effective(),
    f.longtext("services_notes", "Services to be provided", { help: "Describe what the company will do, and what is not included.", feedsSections: ["services"] }),
    f.select("fee_model", "Fee model", ["Fixed fee", "Time and materials", "Monthly retainer"]),
    f.money("fee_amount", "Fee amount", { help: "The fixed fee, the rate, or the retainer, according to the fee model." }),
    f.text("fee_unit", "Fee is charged", { help: "For example 'for the whole project', 'per hour' or 'per month'." }),
    I.paymentDays(), I.termMonths(), I.autoRenew(), I.noticeDays(), I.cureDays(), I.survival(), I.liabilityCap(), ...baseTail(),
  ],
  sections: [
    lockedSection("parties", "Parties", parties("client", "Client")),
    hybridSection("services", "Services", [
      c1("**Services.** The Company shall provide the following services to the Client (the \"Services\"): [[input.services_text|Services|Description of the Services and what is excluded]]"),
      c1("The Company shall perform the Services with reasonable skill and care, using suitably qualified personnel, and in line with any timetable the parties agree in writing."),
      c1("The Client shall give the Company, in good time, the information, access, decisions and cooperation the Company reasonably needs to perform the Services. The Company is not responsible for delay or failure caused by the Client not doing so."),
      c1("Any change to the scope of the Services must be agreed in writing by both parties, with its effect on fees and timetable."),
    ], ai("Describe the services to be provided and anything expressly excluded, in clear contractual language, using only the notes supplied.", ["client.name", "input.services_notes"], NEVER_CONTRACT, { minWords: 40, maxWords: 220 })),
    lockedSection("fees", "Fees and payment", [
      ...feesByModel(),
      c1("The Company shall invoice the Client as the parties agree, and the Client shall pay each invoice within {{input.payment_days|number}} days of receiving it, without set-off except for amounts it disputes in good faith and notifies in writing."),
      c1("If an undisputed invoice remains unpaid after the period to remedy a breach in this Agreement, the Company may suspend the Services on written notice until it is paid."),
      ...taxes(),
    ]),
    termSection(),
    lockedSection("ip", "Intellectual property", workProductIp("the Client", "the Company")),
    lockedSection("confidentiality", "Confidentiality", confidentiality()),
    lockedSection("liability", "Liability", liability()),
    lockedSection("termination", "Termination", termination()),
    generalSection(),
    lawSection(),
    executionSection("Client"),
  ],
});

const msa = defineTemplate("ct.msa", {
  title: "Master Services Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("client", "Client"), I.effective(),
    f.longtext("framework_notes", "Kinds of services covered", { help: "Describe the general nature of the services that statements of work under this agreement will cover.", feedsSections: ["framework"] }),
    I.paymentDays(), I.termMonths(), I.autoRenew(), I.noticeDays(), I.cureDays(), I.survival(), I.liabilityCap(), ...baseTail(),
  ],
  sections: [
    lockedSection("parties", "Parties", parties("client", "Client", "This master services agreement (the \"Agreement\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:")),
    hybridSection("framework", "Framework", [
      c1("**Purpose.** This Agreement sets the general terms on which the Company may provide services to the Client. The specific services, deliverables, timetable and fees for each engagement are set out in a statement of work (\"SOW\") signed by both parties. [[input.framework_text|Scope of services|The kinds of services this Agreement covers]]"),
      c1("**Order of precedence.** Each SOW forms part of this Agreement. If a SOW conflicts with this Agreement, this Agreement prevails, unless the SOW expressly says that it overrides a named clause of this Agreement."),
      c1("**Standard of performance.** The Company shall perform each SOW with reasonable skill and care, using suitably qualified personnel, and the Client shall give the cooperation, information and access the Company reasonably needs."),
    ], ai("Describe in clear contractual language the general kinds of services covered, using only the notes supplied.", ["client.name", "input.framework_notes"], NEVER_CONTRACT, { minWords: 25, maxWords: 140 })),
    lockedSection("sow_process", "SOW process", [
      c1("**Requesting and agreeing a SOW.** A SOW is made when both parties sign it. Each SOW shall state the scope, deliverables, timetable, fees and payment schedule, the acceptance procedure, and any assumptions and dependencies."),
      c1("**Changes.** Any change to a SOW must be recorded in a written change request signed by both parties, stating its effect on scope, timetable and fees. Neither party is bound by an oral change."),
      c1("**Acceptance.** Deliverables are accepted as each SOW provides. If a SOW does not provide a procedure, the Client shall review each deliverable promptly and tell the Company in writing of any material non-conformity, and the Company shall correct it."),
    ]),
    lockedSection("fees", "Fees and payment", [
      c1("**Fees.** The Client shall pay the fees set out in each SOW. The Company shall invoice as the SOW provides, and the Client shall pay each invoice within {{input.payment_days|number}} days of receiving it, except for amounts it disputes in good faith and notifies in writing."),
      ...taxes(),
    ]),
    termSection(),
    lockedSection("ip", "Intellectual property", workProductIp("the Client", "the Company")),
    lockedSection("confidentiality", "Confidentiality", confidentiality()),
    lockedSection("liability", "Liability", liability()),
    lockedSection("termination", "Termination", [
      ...termination(),
      c1("Ending this Agreement does not end a SOW that is in progress unless the parties agree. The terms of this Agreement continue to apply to that SOW until it is completed or ended."),
    ]),
    generalSection(),
    lockedSection("disputes", "Disputes", [...lawSection().body]),
    executionSection("Client"),
  ],
});

const sow = defineTemplate("ct.sow", {
  title: "Statement of Work",
  layout: { header: "compact", footer: "doc_number_page", titleAlign: "center", pageBreakBefore: ["execution"] },
  inputs: [
    I.counter("client", "Client"),
    f.text("msa_ref", "Master agreement this SOW is made under", { help: "Title and date of the signed master services agreement." }),
    f.text("sow_ref", "SOW reference", { required: false }),
    f.text("project_name", "Project name"),
    f.longtext("scope_notes", "Scope of work", { help: "What is in scope, what is out of scope, and the assumptions.", feedsSections: ["scope"] }),
    f.rows("deliverables", "Deliverables", [col("name", "Deliverable"), col("description", "Description", "text", false), col("due", "Due date", "date")], { minRows: 1, maxRows: 30 }),
    f.date("start_date", "Start date"), f.date("end_date", "Planned completion date"),
    f.money("total_fee", "Total fee for this SOW"),
    f.rows("payments", "Payment schedule", [col("milestone", "Milestone or event"), col("amount", "Amount", "money"), col("due", "Invoice date", "date", false)], { minRows: 1, maxRows: 24 }),
    f.number("acceptance_days", "Days the client has to review a deliverable", { min: 1, max: 90 }),
    f.date("effective_date", "SOW effective date"),
    f.yesno("witnesses", "Add witness signature blocks?"),
  ],
  sections: [
    lockedSection("reference", "Reference", [
      p("This Statement of Work (\"SOW\") is made on {{input.effective_date|date}} between **{{company.legal_name}}** (the \"Company\") and **{{client.name}}** (the \"Client\") under the master agreement {{input.msa_ref}} (the \"Agreement\"). Terms defined in the Agreement have the same meaning here. If this SOW conflicts with the Agreement, the Agreement prevails unless this SOW expressly overrides a named clause."),
      kv([["Project", "{{input.project_name}}"], ["SOW reference", "{{input.sow_ref|text|Not numbered}}"]]),
    ]),
    aiSection("scope", "Scope of work", [p("[[input.scope_text|Scope|What is in scope, what is out of scope, assumptions]]")], ai("Write the scope of work in clear contractual language: what is in scope, what is out of scope and the assumptions, using only the notes supplied.", ["client.name", "input.project_name", "input.scope_notes"], NEVER_CONTRACT, { minWords: 60, maxWords: 300 })),
    fixedSection("deliverables", "Deliverables", [each("input.deliverables", "item", [bullets(["**{{item.name}}**: {{item.description|text|As described in the scope}}. Due: {{item.due|date}}."])])]),
    fixedSection("timeline", "Timeline", [kv([["Start date", "{{input.start_date|date}}"], ["Planned completion", "{{input.end_date|date}}"]]), p("Dates depend on the Client giving the information, access and decisions the Company needs on time. If the Client is late, the Company's dates move by the same time.")]),
    fixedSection("fees", "Fees", [kv([["Total fee for this SOW", "{{input.total_fee|money}} ({{input.total_fee|words}}), exclusive of applicable taxes"]]), p("Payment schedule:"), each("input.payments", "item", [bullets(["{{item.milestone}}: {{item.amount|money}}, invoice date {{item.due|date|on the event}}"])]), p("Invoices are paid as the Agreement provides.")]),
    lockedSection("acceptance", "Acceptance", [
      c1("The Client shall review each deliverable within {{input.acceptance_days|number}} days of receiving it and shall either accept it or tell the Company in writing, with reasons, which requirements it does not meet."),
      c1("The Company shall correct material non-conformities and resubmit. A deliverable is deemed accepted if the Client does not respond within the review period, or uses it in production."),
    ]),
    executionSection("Client"),
  ],
});

const license = defineTemplate("ct.license", {
  title: "Licence Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("client", "Licensee"), I.effective(),
    f.longtext("licensed_material", "What is being licensed", { help: "Name and description of the software or content, and the version if any.", feedsSections: ["grant"] }),
    f.select("exclusivity", "Licence type", ["Non-exclusive", "Exclusive"]),
    f.text("permitted_use", "Permitted use and scope", { help: "For example internal business use at one location, or a stated number of users, as agreed." }),
    f.money("licence_fee", "Licence fee"), f.text("fee_basis", "Fee is charged", { help: "For example 'once', 'each year' or 'each month'." }),
    f.longtext("support_notes", "Support and maintenance included", { required: false, feedsSections: ["support"] }),
    I.paymentDays(), I.termMonths(), I.autoRenew(), I.noticeDays(), I.cureDays(), I.survival(), I.liabilityCap(), ...baseTail(),
  ],
  sections: [
    lockedSection("parties", "Parties", parties("client", "Licensee", "This licence agreement (the \"Agreement\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:").map((b, i) => (i === 1 ? p("**{{company.legal_name}}**, having its registered office at {{company.address}} (the \"Licensor\"); and") : b)).map((b, i) => (i === 3 ? p("The Licensor and the Licensee are each a \"party\" and together the \"parties\".") : b))),
    hybridSection("grant", "Grant of licence", [
      c1("**Licensed material.** The Licensor grants the Licensee a {{input.exclusivity}}, non-transferable licence, for the term of this Agreement, to use the following (the \"Licensed Material\") for the permitted use stated below: [[input.licensed_text|Licensed material|Description of what is licensed]]"),
      c1("**Permitted use.** {{input.permitted_use}}."),
      c1("The Licensor and its licensors keep all ownership of the Licensed Material and all intellectual property rights in it. Nothing in this Agreement transfers ownership to the Licensee, and the Licensor keeps all rights not expressly granted."),
    ], ai("Describe the licensed material precisely, using only the notes supplied.", ["input.licensed_material", "input.permitted_use"], NEVER_CONTRACT, { minWords: 20, maxWords: 120 })),
    lockedSection("restrictions", "Restrictions", [
      c1("The Licensee shall not (a) copy, modify, translate or create derivative works of the Licensed Material except as this Agreement allows; (b) sell, rent, lease, sublicense or otherwise make it available to anyone outside the permitted use; (c) reverse engineer, decompile or disassemble it, except to the extent the law does not allow this restriction; (d) remove any ownership notice; or (e) use it to break any law or the rights of others."),
      c1("The Licensee shall tell the Licensor promptly if it learns of any unauthorised use of the Licensed Material, and shall allow the Licensor, on reasonable notice and during business hours, to check that the Licensee is complying with this Agreement."),
    ]),
    lockedSection("fees", "Fees", [
      c1("The Licensee shall pay the Licensor a licence fee of {{input.licence_fee|money}} ({{input.licence_fee|words}}), charged {{input.fee_basis}}. The Licensor shall invoice, and the Licensee shall pay within {{input.payment_days|number}} days of receiving the invoice."),
      ...taxes(),
    ]),
    hybridSection("support", "Support", [
      c1("**Support.** The Licensor shall provide the support and maintenance described below, if any, during the term. Anything not described is outside this Agreement and may be agreed separately in writing. [[input.support_text|Support|What support and maintenance is included]]"),
    ], ai("Describe the support and maintenance included, using only the notes supplied. If none was supplied, say that no support is included.", ["input.support_notes"], NEVER_CONTRACT, { minWords: 10, maxWords: 120 })),
    termSection(),
    lockedSection("warranty", "Warranty and liability", [
      c1("**Warranty.** The Licensor warrants that it has the right to grant this licence. Except as stated in this Agreement, and to the extent the law permits, the Licensed Material is provided as it is and the Licensor gives no other warranty, including that it will be error-free or uninterrupted."),
      ...liability(),
    ]),
    lockedSection("confidentiality", "Confidentiality", confidentiality()),
    lockedSection("termination", "Termination", [
      ...termination(),
      c1("When the licence ends, the Licensee shall stop using the Licensed Material and shall delete or return all copies, and shall confirm this in writing if the Licensor asks."),
    ]),
    generalSection(), lawSection(), executionSection("Licensee"),
  ],
});


export const CT_CLIENT: TemplateDef[] = [clientAgreement, msa, sow, license];
