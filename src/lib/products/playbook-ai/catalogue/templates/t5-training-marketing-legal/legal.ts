/**
 * T5 compliance and legal (lg.privacy to lg.declaration): eleven documents, ALL legal-review types.
 * Conventional clauses are fixed and locked and defer to "applicable law". Nothing statute-specific is invented: a statute, section,
 * authority, limit or period must come from an input or is listed in a draft-only "Notes for the advocate" section that the issue step removes.
 */
import { ai, bullets, c1, c2, col, callout, f, fixedSection, hybridSection, kv, lockedSection, p, sig, whenSet, whenYes } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { InputField, RawBlock, TemplateDef, TemplateSection } from "@/lib/products/playbook-ai/catalogue/types";
import { NEVER_LEGAL, NOTICE_LAYOUT, POLICY_LAYOUT, listRows, optionalText, whenUnset } from "@/lib/products/playbook-ai/catalogue/templates/t5-training-marketing-legal/common";
import { I, executionSection, generalProvisions, governingLaw, parties } from "@/lib/products/playbook-ai/catalogue/templates/t2-contracts/common";

const effective = (): InputField => f.date("effective_date", "Effective from");
const serviceName = (help = "The website, app or service the document covers, as users know it."): InputField => f.text("service_name", "Website, app or service", { help });

/** A draft-only, locked section that lists what the advocate must complete or confirm. The issue step removes it. */
function advocateNotes(items: string[]): TemplateSection {
  return { ...fixedSection("advocate_notes", "Notes for the advocate", [callout("info", "For the reviewing advocate. Remove before issue."), bullets(items)], { locked: true }), draftOnly: true };
}

const policyMeta = (): RawBlock =>
  kv([["Issued by", "{{company.legal_name}}"], ["Registered office", "{{company.address}}"], ["Effective from", "{{input.effective_date|date}}"], ["Reference", "{{doc.number||To be assigned on issue}}"]]);

const grievanceBlock = (): RawBlock[] => [
  kv([["Grievance Officer", "{{input.officer_name}}"], ["Designation", "{{input.officer_designation}}"], ["Email", "{{input.officer_email}}"], ["Address", "{{input.officer_address}}"], ["Phone", "{{input.officer_phone|text|Email is preferred}}"]]),
];
const officerInputs = (): InputField[] => [
  f.text("officer_name", "Grievance officer's name"), f.text("officer_designation", "Grievance officer's designation"),
  f.text("officer_email", "Grievance officer's email", { bindings: ["company.email"] }), f.text("officer_address", "Address for complaints", { bindings: ["company.address"] }),
  optionalText("officer_phone", "Grievance officer's phone"),
  f.number("response_days", "Days within which complaints are acknowledged and answered", { required: false, min: 1, max: 90, help: "Leave blank to say 'within the time required by applicable law'. Use the period your advocate confirms." }),
];

// ---------------------------------------------------------------------------
// lg.privacy
// ---------------------------------------------------------------------------
const privacy = defineTemplate("lg.privacy", {
  title: "Privacy Policy",
  layout: POLICY_LAYOUT,
  inputs: [
    serviceName("The website, app or service this policy covers."), effective(),
    f.rows("collected", "Personal data collected", [col("category", "Category of data"), col("examples", "Examples"), col("purpose", "Why it is collected")], { minRows: 1, maxRows: 25, help: "One row for each kind of personal data you collect, for example contact details or payment details." }),
    f.longtext("source_notes", "How the data is collected", { required: false, help: "For example forms, account sign-up, emails, cookies, calls.", feedsSections: ["collection"] }),
    f.longtext("recipients_notes", "Who the data is shared with", { help: "Categories of recipients and why, for example payment processors, hosting providers, professional advisers, authorities where the law requires.", feedsSections: ["sharing"] }),
    f.yesno("transfers_abroad", "Is personal data stored or sent outside India?", { help: "If yes, a transfer clause is added." }),
    f.longtext("retention_summary", "How long the data is kept", { help: "State your retention approach, for example 'for as long as the account is active and for the period the law requires afterwards'. Use the schedule your advocate confirms.", feedsSections: ["retention"] }),
    f.yesno("cookies_used", "Does the service use cookies?", { help: "If yes, the policy refers readers to the cookie policy." }),
    ...officerInputs(),
  ],
  sections: [
    advocateNotes(["Confirm which Indian data protection law and rules apply to this company and service, and cite them correctly here if wished.", "Confirm the notice, consent, children's data and cross-border transfer requirements that apply.", "Confirm the retention period for each category of data and the period for acknowledging complaints.", "Confirm the name of the authority a data principal may approach and the procedure to follow."]),
    lockedSection("introduction", "Introduction", [policyMeta(),
      c1("This policy explains how **{{company.legal_name}}** (\"we\", \"us\") collects, uses, shares and protects personal data when you use {{input.service_name}}. By using it, you acknowledge this policy."),
      c1("We process personal data in accordance with applicable law. Where this policy and applicable law differ, applicable law prevails."),
    ]),
    lockedSection("collection", "Collection", [
      c1("We collect the following personal data:"), listRows("input.collected", "**{{item.category}}** ({{item.examples}}): {{item.purpose}}"),
      c1("We collect personal data that you give us directly and data generated when you use {{input.service_name}}. We collect only the data needed for the purposes stated in this policy."),
      whenSet("input.source_notes", [c1("In particular: {{input.source_notes}}")]),
      whenYes("input.cookies_used", [c1("We use cookies and similar technologies. Please read our cookie policy for details and for how to manage them.")]),
    ]),
    lockedSection("use", "Use", [
      c1("We use personal data only for the purposes stated in the Collection section, to provide and improve {{input.service_name}}, to communicate with you, to keep our systems secure, to meet our legal obligations, and for any other purpose for which you have given your consent."),
      c1("We do not use your personal data for a purpose that is incompatible with the purposes above without first informing you and, where applicable law requires, obtaining your consent."),
    ]),
    hybridSection("sharing", "Sharing", [
      p("[[input.sharing_text|Sharing|Who the data is shared with and why]]"),
      c1("We do not sell your personal data. We share it only with those who need it to provide {{input.service_name}} or to meet a legal obligation, and we require them to protect it."),
      c1("We may disclose personal data where a court, regulator or authority lawfully requires us to, or where it is necessary to protect our rights, our users or the public, as permitted by applicable law."),
      whenYes("input.transfers_abroad", [c1("Your personal data may be stored or processed outside India. Where it is, we take steps to ensure that it is handled in accordance with applicable law.")]),
    ], ai("Describe who the personal data is shared with and why, as a short paragraph, using only the notes. Name only the categories of recipients the notes name.", ["company.name", "input.service_name", "input.recipients_notes"], NEVER_LEGAL, { tone: "formal", minWords: 30, maxWords: 130 })),
    lockedSection("retention", "Retention", [
      c1("We keep personal data only for as long as it is needed for the purposes for which it was collected, or for as long as applicable law requires."),
      c1("{{input.retention_summary}}"),
      c1("When personal data is no longer needed, we delete it or make it anonymous, subject to any retention that applicable law requires."),
    ]),
    lockedSection("security", "Security", [c1("We use reasonable security safeguards to protect personal data against unauthorised access, loss, misuse or disclosure. No system is completely secure, and we ask you to protect your own account details.")]),
    lockedSection("rights", "Rights", [
      c1("Subject to applicable law, you may ask us to:"),
      c2("give you a summary of the personal data we hold about you and how we process it;"),
      c2("correct, complete or update personal data that is inaccurate or incomplete;"),
      c2("erase personal data that we no longer need to keep;"),
      c2("withdraw a consent you have given, which does not affect processing done before the withdrawal."),
      c1("To exercise a right, write to the Grievance Officer below. We may need to verify your identity before we act on a request, and we will tell you if applicable law prevents us from doing what you ask."),
      c1("If you are not satisfied with our response, you may approach the authority that applicable law designates for such complaints."),
    ]),
    lockedSection("grievance", "Grievance officer", [
      c1("Complaints and questions about this policy or about how we handle personal data may be sent to our Grievance Officer:"),
      ...grievanceBlock(),
      whenSet("input.response_days", [c1("We will acknowledge and respond to your complaint within {{input.response_days|number}} days of receiving it.")]),
      whenUnset("input.response_days", [c1("We will acknowledge and respond to your complaint within the time required by applicable law.")]),
    ]),
    lockedSection("changes", "Changes to this policy", [c1("We may update this policy from time to time. The effective date above shows when the current version took effect. Where applicable law requires, we will tell you of material changes.")]),
  ],
});

// ---------------------------------------------------------------------------
// lg.terms
// ---------------------------------------------------------------------------
const terms = defineTemplate("lg.terms", {
  title: "Terms of Use",
  layout: POLICY_LAYOUT,
  inputs: [serviceName(), effective(), I.city(), f.yesno("paid_service", "Does the service involve fees or payment?", { help: "If yes, a fees clause is added." }), optionalText("contact_email", "Email for questions about these terms", "Leave blank to use the company email.")],
  sections: [
    advocateNotes(["Confirm the clauses that apply to this service, such as eligibility, user content, intermediary status and takedown, and consumer protection.", "Confirm the governing law and courts or arbitration seat the company wants.", "Add the cross-reference to the privacy policy and refund policy, if they exist."]),
    lockedSection("acceptance", "Acceptance", [policyMeta(),
      c1("These terms govern your use of {{input.service_name}}, provided by **{{company.legal_name}}** (\"we\", \"us\"). By accessing or using it you agree to these terms. If you do not agree, do not use it."),
      c1("If you use {{input.service_name}} on behalf of an organisation, you confirm that you have authority to bind it to these terms."),
      c1("You must be legally capable of entering into a binding contract under applicable law to use {{input.service_name}}."),
    ]),
    lockedSection("use", "Use of the service", [
      c1("You may use {{input.service_name}} only for lawful purposes and in line with these terms and any acceptable use policy we publish."),
      c1("You are responsible for keeping your account details confidential and for all activity under your account. Tell us promptly if you suspect unauthorised use."),
      c1("You must not misuse {{input.service_name}}, including by interfering with it, attempting to gain unauthorised access, copying or reselling it without our written permission, or using it to infringe anyone's rights."),
      c1("We may suspend or end your access, with or without notice where the circumstances require, if you breach these terms or if applicable law requires."),
      whenYes("input.paid_service", [c1("Where {{input.service_name}} or any part of it is paid for, you agree to pay the fees stated to you at the time of purchase, together with applicable taxes. Refunds and cancellations are governed by our refund and cancellation policy.")]),
    ]),
    lockedSection("ip", "Intellectual property", [
      c1("{{input.service_name}}, including its content, design, software, logos and trademarks, belongs to us or our licensors and is protected by applicable intellectual property law."),
      c1("We give you a limited, non-exclusive, non-transferable right to use {{input.service_name}} for your own lawful purposes. No other right is granted."),
      c1("If you submit content to {{input.service_name}}, you keep your ownership of it and give us a licence to host, display and use it as needed to provide {{input.service_name}}. You confirm that you have the right to submit it."),
    ]),
    lockedSection("liability", "Liability", [
      c1("{{input.service_name}} is provided on an \"as is\" and \"as available\" basis. To the extent applicable law permits, we do not give any warranty that it will be uninterrupted, secure or error-free."),
      c1("To the extent applicable law permits, we are not liable for any indirect, incidental or consequential loss, or for loss of profit, revenue, data or goodwill, arising from your use of {{input.service_name}}."),
      c1("To the extent applicable law permits, our total liability to you for any claim arising from these terms is limited to the fees, if any, that you paid to us for the service giving rise to the claim."),
      c1("Nothing in these terms excludes or limits any liability that cannot be excluded or limited under applicable law."),
    ]),
    lockedSection("law", "Governing law", [
      c1("These terms are governed by the laws of India."),
      c1("Subject to any right you have under applicable consumer protection law, the courts at {{input.jurisdiction_city}} have exclusive jurisdiction over any dispute arising from these terms."),
    ]),
    lockedSection("changes", "Changes and contact", [
      c1("We may change these terms from time to time. The updated terms apply from the date we publish them. Your continued use of {{input.service_name}} after that date means you accept them."),
      c1("If any provision of these terms is held invalid, the remaining provisions continue in force."),
      whenSet("input.contact_email", [c1("Questions about these terms may be sent to {{input.contact_email}}.")]),
      whenUnset("input.contact_email", [c1("Questions about these terms may be sent to {{company.email}}.")]),
    ]),
  ],
});

// ---------------------------------------------------------------------------
// lg.dpa
// ---------------------------------------------------------------------------
const dpa = defineTemplate("lg.dpa", {
  title: "Data Processing Agreement",
  layout: { header: "compact", footer: "doc_number_page", titleAlign: "center", pageBreakBefore: ["execution"] },
  inputs: [
    I.counter("client", "Client (the party that controls the personal data)"), I.effective(),
    f.text("main_agreement", "The agreement this DPA supports", { help: "For example 'the Master Services Agreement dated the first of April'. Name it exactly." }),
    f.text("data_subjects", "Whose personal data is processed", { help: "For example the Client's employees, customers or website users." }),
    f.longtext("data_categories", "Types of personal data processed", { feedsSections: ["scope"] }),
    f.longtext("purposes", "What the Company does with the data, and why", { feedsSections: ["scope"] }),
    f.number("breach_hours", "Hours within which the Company tells the Client of a personal data breach", { min: 1, max: 720, help: "Use the period agreed with the Client." }),
    f.select("end_action", "When the services end", ["Delete the personal data", "Return the personal data and then delete it"]),
    f.rows("sub_processors", "Approved sub-processors", [col("name", "Sub-processor"), col("service", "What it does"), col("location", "Where it processes data")], { required: false, minRows: 0, maxRows: 15 }),
    f.longtext("security_notes", "Specific security measures", { required: false, help: "Measures the parties agreed, in plain words. They are printed as written." }),
    I.city(), I.stamp(), I.witnesses(),
  ],
  sections: [
    advocateNotes(["Confirm that the Company and the Client are correctly described as processor and controller (data processor and data fiduciary) under the law that applies.", "Confirm any statutory requirement for processor contracts, breach notification and cross-border transfers, and cite it correctly.", "Check the liability position against the main agreement.", "Confirm the stamp duty category and duty for the state of execution."]),
    lockedSection("parties", "Parties and background", [
      ...parties("client", "Client", "This data processing agreement (the \"DPA\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:"),
      c1("The Company provides services to the Client under {{input.main_agreement}} (the \"Main Agreement\"). In providing them, the Company processes personal data on behalf of the Client."),
      c1("In this DPA, the Client is the \"Controller\" (the party that decides the purpose and means of processing, known as a data fiduciary under applicable law) and the Company is the \"Processor\" (the party that processes personal data on the Controller's behalf). \"Personal Data\" means personal data processed under the Main Agreement, and \"Applicable Data Protection Law\" means the law on personal data protection that applies to the processing."),
    ]),
    lockedSection("scope", "Scope", [
      c1("The Processor shall process Personal Data only on the Controller's documented instructions, for the purposes of providing the services under the Main Agreement, and for no other purpose unless Applicable Data Protection Law requires otherwise, in which case the Processor shall tell the Controller beforehand unless the law prohibits it."),
      c1("The details of the processing are:"),
      kv([["Whose data", "{{input.data_subjects}}"], ["Types of personal data", "{{input.data_categories}}"], ["Purpose of processing", "{{input.purposes}}"], ["Duration", "For the term of the Main Agreement, and afterwards only as this DPA provides"]]),
      c1("The Controller confirms that it is entitled under Applicable Data Protection Law to give the Processor the Personal Data and instructions, and that any notice and consent that the law requires has been given or obtained."),
      c1("The Processor shall tell the Controller if it believes an instruction breaches Applicable Data Protection Law."),
    ]),
    lockedSection("security", "Security", [
      c1("The Processor shall keep Personal Data confidential and ensure that everyone it authorises to process it is bound by a duty of confidentiality and receives suitable training."),
      c1("The Processor shall use reasonable technical and organisational security safeguards appropriate to the risk, to protect Personal Data against accidental or unlawful loss, alteration, unauthorised disclosure or access."),
      whenSet("input.security_notes", [c1("The parties have agreed these specific measures: {{input.security_notes}}")]),
    ]),
    lockedSection("sub_processors", "Sub-processors", [
      c1("The Controller authorises the Processor to use the sub-processors listed below. The Processor shall enter into a written contract with each sub-processor that imposes data protection duties no less protective than this DPA, and remains responsible to the Controller for its sub-processors' performance."),
      whenSet("input.sub_processors", [listRows("input.sub_processors", "**{{item.name}}**: {{item.service}} (location: {{item.location}})")]),
      c1("The Processor shall tell the Controller before it adds or replaces a sub-processor and give the Controller a reasonable opportunity to object. If the parties cannot resolve a reasonable objection, the Controller may end the affected services."),
    ]),
    lockedSection("rights", "Assistance and audit", [
      c1("Taking into account the nature of the processing, the Processor shall help the Controller, by appropriate measures, to respond to requests from individuals to exercise their rights under Applicable Data Protection Law, and shall pass any such request it receives to the Controller promptly without responding to it itself unless instructed."),
      c1("The Processor shall give the Controller the information reasonably necessary to show that it complies with this DPA, and shall allow and contribute to audits by the Controller or its appointed auditor on reasonable notice, during business hours, subject to confidentiality and without unreasonable disruption."),
    ]),
    lockedSection("breach", "Breach", [
      c1("The Processor shall tell the Controller without undue delay, and in any case within {{input.breach_hours|number}} hours of becoming aware, of any personal data breach affecting Personal Data."),
      c1("The notice shall describe, as far as then known, the nature of the breach, the data and individuals affected, the likely consequences and the measures taken or proposed. The Processor shall take reasonable steps to contain the breach, cooperate with the Controller's investigation and give further information as it becomes available."),
      c1("The Controller is responsible for deciding whether to notify any authority or individual as Applicable Data Protection Law requires. The Processor shall not notify them unless the law requires it to or the Controller instructs it to."),
    ]),
    lockedSection("end", "End of processing", [
      c1("When the services end, or earlier if the Controller asks in writing, the Processor shall, at the Controller's choice stated here: {{input.end_action}}, and confirm in writing that it has done so."),
      c1("The Processor may keep Personal Data only to the extent that applicable law requires, and shall keep it protected and use it for no other purpose."),
    ]),
    lockedSection("general_terms", "General provisions", [
      c1("**Liability.** Each party's liability under this DPA is subject to the limits and exclusions in the Main Agreement, except where applicable law does not allow them."),
      c1("**Conflict.** If this DPA and the Main Agreement conflict about the processing of Personal Data, this DPA prevails."),
      c1("**Term.** This DPA starts on the Effective Date and continues for as long as the Processor processes Personal Data under the Main Agreement."),
      ...generalProvisions(),
    ]),
    lockedSection("governing_law", "Governing law and disputes", governingLaw()),
    executionSection("Client"),
  ],
});

// ---------------------------------------------------------------------------
// lg.dpdp_notice
// ---------------------------------------------------------------------------
const dpdpNotice = defineTemplate("lg.dpdp_notice", {
  title: "Notice and Consent for Processing of Personal Data",
  layout: POLICY_LAYOUT,
  inputs: [
    serviceName("The service or activity for which the data is collected."), effective(),
    f.rows("purposes", "Purposes and the data used for each", [col("purpose", "Purpose"), col("data", "Personal data used")], { minRows: 1, maxRows: 20, help: "List each specific purpose separately and the data it needs." }),
    f.text("withdraw_how", "How a person can withdraw consent", { help: "For example 'by writing to the email address below'. It must be as easy as giving consent." }),
    f.text("contact_email", "Email for requests and complaints", { bindings: ["company.email"] }),
    optionalText("officer_name", "Name of the person who handles requests", "The data protection officer or contact person, if one is appointed."),
  ],
  sections: [
    advocateNotes(["Confirm the exact content the applicable data protection law requires in a notice and in a consent request, and the language and format requirements.", "Add the way to make a complaint to the authority the law designates, and any time limits.", "Confirm rules for children's and other special categories of data, if relevant.", "Confirm how consent records are to be kept."]),
    lockedSection("notice", "Notice", [policyMeta(),
      c1("**{{company.legal_name}}** (\"we\") asks for your personal data for {{input.service_name}}. This notice tells you what data we ask for, why, and how you can exercise your rights."),
      c1("We will process your personal data only for the following purposes, and only the data stated for each:"), listRows("input.purposes", "**{{item.purpose}}**: {{item.data}}"),
      c1("We process your personal data only with your consent or for another lawful purpose that applicable law permits. By giving consent you agree to the processing for the purposes above."),
      p("[ ] I have read this notice and I consent to the processing of my personal data for the purposes stated above."),
      p("Name: ______________________________    Date: ______________"),
    ]),
    lockedSection("rights", "Rights", [
      c1("Subject to applicable law, you may ask us to give you a summary of the personal data we process and the processing we carry out, to correct or update it, to erase it, and to respond to a grievance."),
      c1("Where applicable law allows, you may nominate another person to exercise these rights on your behalf if you die or become unable to exercise them."),
      c1("To exercise a right, write to {{input.contact_email}}. We will respond within the time that applicable law requires."),
      whenSet("input.officer_name", [c1("Your request will be handled by {{input.officer_name}}.")]),
      c1("If you are not satisfied with our response, you may complain to the authority that applicable law designates."),
    ]),
    lockedSection("withdrawal", "Withdrawal", [
      c1("You may withdraw your consent at any time, {{input.withdraw_how}}. Withdrawing consent is as easy as giving it."),
      c1("Withdrawal does not affect processing that was lawful before you withdrew. After you withdraw, we will stop processing your personal data for the purposes you consented to, and delete it unless applicable law requires us to keep it."),
      c1("Withdrawing consent may mean that we can no longer provide {{input.service_name}} or the part of it that depends on that data."),
    ]),
  ],
});

// ---------------------------------------------------------------------------
// lg.cookie
// ---------------------------------------------------------------------------
const cookie = defineTemplate("lg.cookie", {
  title: "Cookie Policy",
  layout: POLICY_LAYOUT,
  inputs: [
    f.text("website", "Website or app", { bindings: ["company.website"] }), effective(),
    f.rows("cookies", "Cookies and similar technologies", [col("name", "Name"), col("provider", "Provider"), col("purpose", "Purpose"), col("kind", "Type (necessary, analytics, advertising, preference)"), col("duration", "How long it lasts")], { minRows: 1, maxRows: 60 }),
    f.text("manage_how", "How users can change their choices", { help: "For example 'through the cookie settings link in the footer'." }),
    f.text("contact_email", "Email for questions", { bindings: ["company.email"] }),
  ],
  sections: [
    advocateNotes(["Confirm whether consent must be obtained before non-essential cookies are set, and how it must be recorded.", "Confirm the cookie list is complete and that each provider's role is described correctly."]),
    lockedSection("policy", "Policy", [policyMeta(),
      c1("This policy explains how **{{company.legal_name}}** uses cookies and similar technologies on {{input.website}}."),
      c1("Cookies are small files placed on your device when you visit a website. They help the site work, remember your choices and understand how it is used. Similar technologies, such as pixels and local storage, work in the same way."),
      c1("We use the following cookies and similar technologies:"), listRows("input.cookies", "**{{item.name}}** ({{item.provider}}), type {{item.kind}}: {{item.purpose}}. Lasts: {{item.duration}}."),
      c1("Cookies that are strictly necessary for the site to work are always on. Other cookies are used only where you have allowed them, to the extent applicable law requires."),
      c1("You can change your choices {{input.manage_how}}. You can also delete or block cookies through your browser settings, but parts of the site may then not work as intended."),
      c1("We may update this policy from time to time. The effective date above shows the current version. Questions may be sent to {{input.contact_email}}."),
    ]),
  ],
});

// ---------------------------------------------------------------------------
// lg.refund
// ---------------------------------------------------------------------------
const refund = defineTemplate("lg.refund", {
  title: "Refund and Cancellation Policy",
  layout: POLICY_LAYOUT,
  inputs: [
    serviceName("The product or service this policy applies to."), effective(),
    f.rows("rules", "Cancellation and refund rules", [col("situation", "Situation"), col("outcome", "What the customer gets"), col("timeline", "Time limit or timeline")], { minRows: 1, maxRows: 20, help: "One row for each situation, for example cancelling before delivery, a faulty product or a duplicate payment. State your actual terms." }),
    f.text("request_how", "How to request a cancellation or refund", { help: "For example 'by emailing support with the order details'." }),
    f.text("contact_email", "Email for refund queries", { bindings: ["company.email"] }),
  ],
  sections: [
    advocateNotes(["Check each rule against the consumer protection and e-commerce rules that apply to the business and the payment gateway's terms.", "Confirm that no rule excludes a right the customer has under applicable law."]),
    lockedSection("policy", "Policy", [policyMeta(),
      c1("This policy sets out when you may cancel and when you may receive a refund for {{input.service_name}} provided by **{{company.legal_name}}**."),
      c1("Cancellations and refunds are handled as follows:"), listRows("input.rules", "**{{item.situation}}**: {{item.outcome}}. Time limit: {{item.timeline}}."),
      c1("To request a cancellation or refund, please contact us {{input.request_how}}, giving the details we need to find your order or account."),
      c1("Approved refunds are made to the original method of payment unless we agree another method with you. The time your bank or payment provider takes to credit the refund is outside our control."),
      c1("We may refuse a request that does not meet this policy, and we will tell you why."),
      c1("Nothing in this policy limits any right you have under applicable law."),
      c1("Questions about this policy may be sent to {{input.contact_email}}."),
    ]),
  ],
});

// ---------------------------------------------------------------------------
// lg.aup
// ---------------------------------------------------------------------------
const aup = defineTemplate("lg.aup", {
  title: "Acceptable Use Policy",
  layout: POLICY_LAYOUT,
  inputs: [
    serviceName(), effective(),
    f.rows("extra_rules", "Additional rules specific to the service", [col("rule", "Rule")], { required: false, minRows: 0, maxRows: 20, help: "For example limits on automated access or on the content that may be uploaded." }),
    f.text("report_email", "Email for reporting misuse", { bindings: ["company.email"] }),
  ],
  sections: [
    advocateNotes(["Confirm that the prohibited uses reflect the laws that apply to the service and any intermediary duties.", "Confirm the suspension and takedown procedure the company is able to follow."]),
    lockedSection("policy", "Policy", [policyMeta(),
      c1("This policy sets out what you may and may not do when you use {{input.service_name}}, provided by **{{company.legal_name}}**. It forms part of our terms."),
      c1("You must not use {{input.service_name}} to:"),
      c2("break any law or encourage or help anyone else to do so;"),
      c2("infringe the intellectual property, privacy or other rights of any person;"),
      c2("upload or send content that is unlawful, defamatory, obscene, threatening, hateful or harassing;"),
      c2("spread malware or interfere with, disable or overload {{input.service_name}} or the systems that support it;"),
      c2("try to gain unauthorised access to accounts, systems or data;"),
      c2("send spam or unsolicited promotional messages;"),
      c2("pretend to be another person or organisation, or give false information."),
      whenSet("input.extra_rules", [c1("The following additional rules apply to {{input.service_name}}:"), listRows("input.extra_rules", "{{item.rule}}")]),
      c1("If you breach this policy, we may remove content, suspend or end your access, and report the matter to the authorities where applicable law permits or requires."),
      c1("To report misuse, write to {{input.report_email}}. We will review reports and act as we consider appropriate and as applicable law requires."),
      c1("We may update this policy from time to time. The updated policy applies from the date we publish it."),
    ]),
  ],
});

// ---------------------------------------------------------------------------
// lg.retention
// ---------------------------------------------------------------------------
const retention = defineTemplate("lg.retention", {
  title: "Data Retention Policy",
  layout: POLICY_LAYOUT,
  inputs: [
    f.text("owner", "Policy owner", { help: "The person or role accountable for this policy." }), effective(),
    f.rows("categories", "Retention schedule", [col("category", "Category of records or data"), col("period", "How long it is kept"), col("basis", "Why (legal requirement, contract or business need)"), col("owner", "Who is responsible", "text", false)], { minRows: 1, maxRows: 40, help: "State each period as confirmed by your advocate and accountant. This draft does not supply periods." }),
    f.text("hold_contact", "Who to ask about a legal hold", { help: "The person or team who can place or lift a legal hold." }),
  ],
  sections: [
    advocateNotes(["Confirm, for each category, the minimum period that applicable law requires (company, tax, labour, data protection and sector laws) and fill the schedule with those periods.", "Confirm how long personal data may be kept once its purpose is served.", "Confirm the disposal and certification method required for each category."]),
    lockedSection("policy", "Policy", [
      kv([["Owner", "{{input.owner}}"], ["Applies to", "All employees, contractors and others who create or look after records and data of {{company.legal_name}}"], ["Effective from", "{{input.effective_date|date}}"], ["Reference", "{{doc.number||To be assigned on issue}}"]]),
      c1("This policy sets how long {{company.legal_name}} keeps its records and data, and how they are disposed of, so that it meets its legal obligations and keeps no more than it needs."),
      c1("Records and data are kept for the period in the schedule. Where applicable law requires a longer period than the schedule states, the longer period applies."),
      c1("Personal data is kept no longer than needed for the purpose it was collected for, unless applicable law requires it to be kept."),
      c1("When a retention period ends, the record or data is securely deleted or destroyed, or made anonymous, unless a legal hold applies. The person responsible records the disposal."),
      c1("A legal hold overrides the schedule. When a claim, investigation or audit is pending or reasonably expected, records that may be relevant must not be deleted or changed until the hold is lifted. Questions about holds go to {{input.hold_contact}}."),
      c1("Anyone who becomes aware of a record being deleted too early, or kept too long, must tell the policy owner."),
      c1("This policy is reviewed regularly by its owner. Where it differs from applicable law, applicable law prevails."),
    ]),
    fixedSection("schedule", "Schedule", [p("The retention schedule is:"), listRows("input.categories", "**{{item.category}}**: kept {{item.period}}. Basis: {{item.basis}}. Responsible: {{item.owner|text|policy owner}}.")], { locked: true }),
  ],
});

// ---------------------------------------------------------------------------
// lg.legal_notice
// ---------------------------------------------------------------------------
const legalNotice = defineTemplate("lg.legal_notice", {
  title: "Legal Notice",
  layout: NOTICE_LAYOUT,
  inputs: [
    f.person("party", "Person or company receiving the notice", "party", { help: "Name and address of the recipient." }),
    f.text("subject", "Subject of the notice"),
    f.select("delivery", "How the notice is sent", ["Registered post", "Speed post", "Courier", "Email and registered post"]),
    f.longtext("facts_notes", "Facts", { help: "What happened, in date order: the agreement or dealing, what was due, what the recipient did or did not do. Facts only.", feedsSections: ["facts"] }),
    f.longtext("demand_notes", "What the sender demands", { help: "The specific action or payment demanded, as agreed with your advocate.", feedsSections: ["demand"] }),
    f.number("compliance_days", "Days allowed to comply", { min: 1, max: 365, help: "Use the period your advocate recommends." }),
    optionalText("reference_notes", "Earlier reminders or correspondence", "Dates and means of earlier requests, if any."),
  ],
  sections: [
    advocateNotes(["This is a draft for the advocate's review and, where appropriate, for issue on the advocate's own letterhead.", "Confirm the legal basis of each claim, the correct limitation position, any statutory pre-condition to a notice, and the proper recipient.", "Confirm the period allowed and the relief to demand."]),
    fixedSection("notice", "Notice", [
      kv([["Date", "{{date.today|date}}"], ["Sent by", "{{input.delivery}}"], ["Reference", "{{doc.number||To be assigned on issue}}"]]),
      p("To,\n**{{party.name}}**\n{{party.address}}"),
      p("**Subject: {{input.subject}}**"),
      p("This notice is given by **{{company.legal_name}}**, having its registered office at {{company.address}} (the \"Sender\"), to {{party.name}} (the \"Recipient\")."),
    ]),
    hybridSection("facts", "Facts", [p("[[input.facts_text|Facts|The facts leading to this notice, in date order]]"), whenSet("input.reference_notes", [p("**Earlier correspondence:** {{input.reference_notes}}")])],
      ai("Set out the facts leading to the notice in numbered paragraphs in date order, using only the notes. State facts neutrally; do not allege wrongdoing, motive or loss that the notes do not state. Do not cite any law.", ["company.name", "party.name", "input.subject", "input.facts_notes", "input.reference_notes"], NEVER_LEGAL, { tone: "formal", minWords: 60, maxWords: 400 })),
    hybridSection("demand", "Demand", [p("The Sender calls upon the Recipient as follows:"), p("[[input.demand_text|Demand|What the Recipient is called upon to do]]"), p("The Recipient must comply within {{input.compliance_days|number}} days of receiving this notice.")],
      ai("State what the Recipient is called upon to do, as a short numbered list, using only the demand notes. Do not add demands, amounts, interest or penalties that are not in them.", ["party.name", "input.demand_notes", "input.compliance_days"], NEVER_LEGAL, { tone: "firm", minWords: 20, maxWords: 200 })),
    lockedSection("reservation", "Reservation of rights", [
      c1("If the Recipient does not comply within the time stated, the Sender reserves the right to take such legal action against the Recipient as it may be advised, at the Recipient's risk as to costs and consequences, as per applicable law."),
      c1("This notice is without prejudice to the Sender's other rights and remedies, all of which are reserved. Nothing in this notice is an admission or a waiver of any right."),
      c1("A copy of this notice has been kept for the Sender's records."),
      sig("For the Sender", "company_signatory"),
    ]),
  ],
});

// ---------------------------------------------------------------------------
// lg.affidavit and lg.declaration
// ---------------------------------------------------------------------------
const affidavit = defineTemplate("lg.affidavit", {
  title: "Affidavit",
  layout: NOTICE_LAYOUT,
  inputs: [
    f.person("party", "Deponent (the person making the statement)", "party", { help: "Name and address of the deponent." }),
    f.select("relation", "Parentage or marital status wording", ["son of", "daughter of", "wife of", "husband of"]), f.text("parent_name", "Name of the parent or spouse"),
    f.number("age", "Age of the deponent (years)", { min: 18, max: 120 }), optionalText("occupation", "Occupation"),
    f.text("purpose", "What the affidavit is for", { help: "For example 'for submission to the registrar with an application'." }),
    f.rows("statements", "Statements of fact", [col("statement", "Statement, beginning with 'That'")], { minRows: 1, maxRows: 40, help: "One statement per row. They are printed in order. Include only facts within the deponent's own knowledge." }),
    f.text("place", "Place of verification"), f.date("verified_on", "Date of verification"),
  ],
  sections: [
    advocateNotes(["Confirm the form, stamp paper, oath or affirmation, notary or oath commissioner formalities and any rule that applies to the authority where this affidavit will be used.", "Confirm that a wet signature and attestation are needed; this document is not for e-signature.", "Check each statement for accuracy and relevance before the deponent signs."]),
    fixedSection("deponent", "Deponent", [
      p("**AFFIDAVIT**", "center"),
      p("I, **{{party.name}}**, {{input.relation}} {{input.parent_name}}, aged {{input.age|number}} years, residing at {{party.address}}, do hereby solemnly affirm and state on oath as follows:"),
      whenSet("input.occupation", [p("My occupation is {{input.occupation}}.")]),
      p("This affidavit is made {{input.purpose}}."),
    ], { locked: true }),
    fixedSection("statement", "Statement", [listRows("input.statements", "{{item.statement}}")]),
    lockedSection("verification", "Verification", [
      p("Verified at {{input.place}} on {{input.verified_on|date}} that the contents of this affidavit are true and correct to the best of my knowledge and belief, that nothing material has been concealed, and that no part of it is false."),
      sig("Deponent", "counterparty"),
      p("Before me: ______________________________"),
      p("[Attestation by the oath commissioner or notary, as per applicable law]"),
    ]),
  ],
});

const declaration = defineTemplate("lg.declaration", {
  title: "Declaration",
  layout: NOTICE_LAYOUT,
  inputs: [
    f.person("party", "Declarant (the person making the declaration)", "party", { help: "Name and address of the declarant." }),
    f.text("purpose", "What the declaration is for", { help: "For example 'in support of an application to a bank'." }),
    f.rows("statements", "Statements declared", [col("statement", "Statement")], { minRows: 1, maxRows: 40, help: "One statement per row. They are printed in order. Include only facts the declarant can personally confirm." }),
    f.text("place", "Place of declaration"), f.date("declared_on", "Date of declaration"),
  ],
  sections: [
    advocateNotes(["Confirm whether this declaration needs to be on stamp paper, notarised or sworn for the purpose it is used for; if so use an affidavit instead.", "Confirm the consequences the recipient attaches to a false declaration."]),
    fixedSection("declaration", "Declaration", [
      p("I, **{{party.name}}**, of {{party.address}}, do hereby declare, {{input.purpose}}, as follows:"),
      listRows("input.statements", "{{item.statement}}"),
    ]),
    lockedSection("undertaking", "Undertaking", [
      p("I declare that the statements above are true and correct to the best of my knowledge and belief and that I have not concealed any material fact."),
      p("I understand that if any statement is found to be false, action may be taken against me as per applicable law, and that the recipient may rely on this declaration."),
      p("Place: {{input.place}}. Date: {{input.declared_on|date}}."),
      sig("Declarant", "counterparty"),
    ]),
  ],
});

export const LEGAL_TEMPLATES: TemplateDef[] = [privacy, terms, dpa, dpdpNotice, cookie, refund, aup, retention, legalNotice, affidavit, declaration];
