/** T2 contracts, part 3: people agreements (ct.employment, ct.consultancy, ct.freelancer, ct.training_bond). */
import { ai, bullets, c1, col, each, f, fixedSection, hybridSection, lockedSection, p, whenSet, when } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import {
  CONTRACT_LAYOUT, I, NEVER_CONTRACT, baseTail, confidentiality, executionSection, generalProvisions, lawSection, liability, parties, taxes, termination, workProductIp,
} from "@/lib/products/playbook-ai/catalogue/templates/t2-contracts/common";

const employment = defineTemplate("ct.employment", {
  title: "Employment Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("employee", "Employee"),
    f.date("effective_date", "Date of joining", { bindings: ["employee.joining_date"] }),
    f.text("designation", "Designation", { bindings: ["employee.designation"] }),
    f.text("department", "Department", { bindings: ["employee.department"] }),
    f.text("location", "Place of work", { bindings: ["employee.work_location"] }),
    f.text("reporting_manager", "Reports to", { bindings: ["employee.reporting_manager"], required: false }),
    f.longtext("duty_notes", "Main duties", { required: false, feedsSections: ["role"] }),
    f.money("annual_ctc", "Annual cost to company (CTC)"),
    f.number("probation_months", "Probation (months)", { min: 0, max: 24 }),
    f.number("probation_notice_days", "Notice during probation (days)", { min: 0, max: 365 }),
    f.number("notice_days", "Notice after confirmation (days)", { min: 0, max: 365 }),
    f.text("working_hours", "Working days and hours"),
    I.survival(),
    f.number("solicit_months", "Post-employment non-solicitation of Company employees (months)", { required: false, min: 1, max: 60, help: "Leave blank for none. A restriction on working elsewhere after employment is generally not enforceable in India and is not included." }),
    ...baseTail(),
  ],
  sections: [
    lockedSection("parties", "Parties", [
      p("This employment agreement (the \"Agreement\") is made on {{input.effective_date|date}} between **{{company.legal_name}}**, having its registered office at {{company.address}} (the \"Company\"), and **{{employee.name}}**, of {{employee.address}} (the \"Employee\"). It sets out the terms of the Employee's employment from {{input.effective_date|date}} (the \"Start Date\")."),
    ]),
    hybridSection("role", "Role", [
      c1("**Appointment.** The Company employs the Employee as **{{input.designation}}** in the {{input.department}} department, at {{input.location}}, reporting to {{input.reporting_manager|text|the manager the Company names}}. The Company may, for business reasons, ask the Employee to work at another of its offices or at client sites, and may change the Employee's duties and reporting line within the Employee's skills."),
      c1("**Duties.** The Employee shall devote full working time and attention to the Company's work, carry out lawful and reasonable instructions, comply with the Company's policies as in force, and act in the Company's best interests. [[input.duty_text|Duties|Main duties of the role]]"),
      c1("**Exclusivity.** While employed, the Employee shall not take up any other employment, business or engagement, paid or unpaid, that competes with the Company or affects the Employee's work, without the Company's prior written consent, and shall tell the Company of any conflict of interest."),
    ], ai("Describe the main duties of the role in a short paragraph, using only the notes supplied.", ["employee.designation", "input.designation", "input.department", "input.duty_notes"], NEVER_CONTRACT, { minWords: 25, maxWords: 110 })),
    lockedSection("pay", "Remuneration", [
      c1("**Remuneration.** The Employee's annual cost to company is {{input.annual_ctc|money}} ({{input.annual_ctc|words}}), made up as set out in the compensation annexure issued to the Employee and revised by the Company from time to time."),
      c1("The Company shall pay salary on its regular pay date after deducting tax at source and the other deductions and contributions that applicable law requires. The Company may also deduct amounts that the Employee owes it, as far as the law permits."),
      c1("Bonus, incentives and other benefits, if any, are as the Company's policies provide and are not part of the Employee's right unless stated in writing."),
    ]),
    lockedSection("hours", "Working hours", [c1("The Employee's working days and hours are {{input.working_hours}}. The Company may change them as business needs require, within the law."), c1("The Employee shall record attendance honestly through the Company's system and shall work additional hours when the work reasonably needs it, as the law and the Company's policy allow.")]),
    lockedSection("leave", "Leave", [c1("The Employee is entitled to leave and public holidays under the Company's Leave Policy and applicable law, as in force from time to time. Leave must be applied for and approved in advance, except in an emergency."), c1("Statutory leave and benefits are granted as applicable law provides, and this Agreement does not reduce them.")]),
    lockedSection("ip", "Intellectual property", [
      c1("All works, inventions, software, designs, documents and other material created by the Employee in the course of the employment, or using the Company's time, systems or information (\"Work Product\"), and all intellectual property rights in them, belong to the Company. To the extent any right does not vest in the Company automatically, the Employee assigns it to the Company, for the full term of the right and throughout the world, and shall sign any document reasonably required to confirm this, including after the employment ends."),
    ]),
    lockedSection("confidentiality", "Confidentiality", [
      c1("The Employee shall keep confidential, during the employment and for {{input.survival_months|number}} months after it ends (and, for trade secrets, for as long as they remain secret), all non-public information of the Company and its clients, vendors and employees that the Employee learns through the employment, and shall use it only for the Company's work."),
      c1("This clause does not apply to information that is public other than through the Employee's breach, or that the law requires the Employee to disclose. Nothing in this Agreement stops the Employee from reporting a suspected violation of law to a regulator or authority."),
    ]),
    lockedSection("restraint", "Restraint during and after employment", [
      c1("During the employment the Employee shall not compete with the Company, solicit its clients away from it, or induce its employees to leave."),
      whenSet("input.solicit_months", [c1("For {{input.solicit_months|number}} months after the employment ends, the Employee shall not directly solicit or induce any employee of the Company, with whom the Employee worked, to leave the Company. This clause is limited in time and scope to protect the Company's legitimate interest and applies only to the extent the law permits.")]),
      c1("Nothing in this Agreement restricts the Employee from working in any profession or business after the employment ends, except for the Employee's continuing duties of confidentiality and the restriction above, if any."),
    ]),
    lockedSection("probation", "Probation and confirmation", [
      c1("The Employee will be on probation for {{input.probation_months|number}} months from the Start Date. The Company may extend the probation by written notice. Confirmation will be in writing; until then the Employee remains on probation."),
      c1("During probation, either party may end the employment by giving {{input.probation_notice_days|number}} days' written notice or salary in lieu of notice."),
    ]),
    lockedSection("termination", "Termination", [
      c1("After confirmation, either party may end the employment by giving {{input.notice_days|number}} days' written notice or salary in lieu of notice."),
      c1("The Company may end the employment without notice or payment in lieu for serious misconduct, fraud, dishonesty, breach of confidentiality, or breach of this Agreement or the Company's policies, after following the procedure that the Company's policies and applicable law require."),
      c1("On leaving, the Employee shall complete a proper handover, return all Company property, documents and data, and clear all dues. The Company shall make the full and final settlement after clearance, as per its policy and applicable law."),
    ]),
    lockedSection("general", "General provisions", [
      c1("**Policies.** The Company's Code of Conduct and policies, as in force from time to time, form part of the terms of employment. If a policy conflicts with this Agreement, this Agreement prevails."),
      c1("**Prior documents.** This Agreement replaces the offer letter and any earlier understanding on its subject, except that any compensation annexure issued under it continues to apply."),
      ...generalProvisions().slice(2, 8),
    ]),
    lawSection(), executionSection("Employee"),
  ],
});

const consultancy = defineTemplate("ct.consultancy", {
  title: "Consultancy Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("party", "Consultant", "Enter the consultant's name and address."), I.effective(),
    f.longtext("services_notes", "Services to be provided", { feedsSections: ["services"] }),
    f.select("fee_model", "Fee model", ["Fixed fee", "Hourly rate", "Monthly fee"]),
    f.money("fee_amount", "Fee amount"), f.text("fee_unit", "Fee is charged", { help: "For example 'for the whole engagement', 'per hour' or 'per month'." }),
    f.yesno("expenses", "Reimburse approved expenses?", { defaultValue: "yes" }),
    I.paymentDays(), I.termMonths(), I.noticeDays(), I.cureDays(), I.survival(), I.liabilityCap(), ...baseTail(),
  ],
  sections: [
    lockedSection("parties", "Parties", parties("party", "Consultant", "This consultancy agreement (the \"Agreement\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:")),
    hybridSection("services", "Services", [
      c1("**Services.** The Consultant shall provide the following services to the Company (the \"Services\"): [[input.services_text|Services|Description of the Services and the outcome expected]]"),
      c1("The Consultant shall perform the Services with the skill, care and diligence expected of a professional in the field, shall comply with the law and with the Company's reasonable instructions on outcomes and security, and shall use its own judgment on how to perform them."),
    ], ai("Describe the services and the expected outcomes in clear contractual language, using only the notes supplied.", ["party.name", "input.services_notes"], NEVER_CONTRACT, { minWords: 30, maxWords: 180 })),
    lockedSection("fee", "Fee", [
      when("input.fee_model", "eq", "Fixed fee", [c1("The Company shall pay the Consultant a fixed fee of {{input.fee_amount|money}} ({{input.fee_amount|words}}) {{input.fee_unit}}.")]),
      when("input.fee_model", "eq", "Hourly rate", [c1("The Company shall pay the Consultant {{input.fee_amount|money}} ({{input.fee_amount|words}}) {{input.fee_unit}} for time spent on the Services, as recorded in time records the Consultant gives with each invoice.")]),
      when("input.fee_model", "eq", "Monthly fee", [c1("The Company shall pay the Consultant {{input.fee_amount|money}} ({{input.fee_amount|words}}) {{input.fee_unit}} for the Services.")]),
      c1("The Consultant shall invoice the Company and the Company shall pay each valid invoice within {{input.payment_days|number}} days of receiving it."),
      when("input.expenses", "eq", "yes", [c1("The Company shall reimburse reasonable, documented expenses that it approved in writing before they were incurred.")]),
      when("input.expenses", "eq", "no", [c1("The fee includes all expenses the Consultant incurs, and the Consultant shall not claim any separately.")]),
      ...taxes(),
    ]),
    lockedSection("term", "Term", [c1("This Agreement starts on the Effective Date and continues for {{input.term_months|number}} months, unless it is ended earlier as this Agreement provides.")]),
    lockedSection("independence", "Independent contractor", [
      c1("The Consultant is an independent contractor. Nothing in this Agreement creates an employment relationship, partnership or agency between the Company and the Consultant or its personnel."),
      c1("The Consultant is solely responsible for its own taxes, registrations and statutory dues, and for the pay, benefits and statutory contributions of any person it engages. The Consultant is not entitled to any employee benefit from the Company, and may serve other clients provided it does not breach confidentiality or create a conflict of interest."),
    ]),
    lockedSection("ip", "Intellectual property", workProductIp("the Company", "the Consultant")),
    lockedSection("confidentiality", "Confidentiality", confidentiality()),
    lockedSection("liability", "Liability", liability()),
    lockedSection("termination", "Termination", termination()),
    lockedSection("general", "General provisions", generalProvisions()),
    lawSection(), executionSection("Consultant"),
  ],
});

const freelancer = defineTemplate("ct.freelancer", {
  title: "Freelancer Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("party", "Freelancer", "Enter the freelancer's name and address."), I.effective(),
    f.longtext("scope_notes", "Scope of the work", { feedsSections: ["scope"] }),
    f.rows("deliverables", "Deliverables", [col("name", "Deliverable"), col("due", "Due date", "date"), col("fee", "Fee for it", "money")], { minRows: 1, maxRows: 30 }),
    f.number("revisions", "Rounds of revision included", { min: 0, max: 20 }),
    f.yesno("portfolio", "Freelancer may show the work in its portfolio?", { defaultValue: "no" }),
    I.paymentDays(), I.noticeDays(), I.cureDays(), I.survival(), I.liabilityCap(), ...baseTail(),
  ],
  sections: [
    lockedSection("parties", "Parties", parties("party", "Freelancer", "This freelancer agreement (the \"Agreement\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:")),
    hybridSection("scope", "Scope", [
      c1("**Scope.** The Freelancer shall carry out the following work for the Company (the \"Work\"): [[input.scope_text|Scope|Description of the work]]"),
      c1("The Freelancer shall perform the Work with professional skill and care, to the specification and by the dates stated in this Agreement, and decides how and where it works and with what tools."),
      c1("The Company shall give the Freelancer the information, materials and feedback it reasonably needs, in good time. The Work includes {{input.revisions|number}} rounds of revision; further changes are charged as agreed in writing before they start."),
    ], ai("Describe the scope of the work and what is excluded, in clear contractual language, using only the notes supplied.", ["party.name", "input.scope_notes", "input.revisions"], NEVER_CONTRACT, { minWords: 30, maxWords: 180 })),
    fixedSection("deliverables", "Deliverables", [each("input.deliverables", "item", [bullets(["**{{item.name}}**, due {{item.due|date}}, fee {{item.fee|money}}"])])]),
    lockedSection("fee", "Fee and payment", [
      c1("The Company shall pay the Freelancer the fee stated for each deliverable above, within {{input.payment_days|number}} days of receiving a valid invoice after the deliverable is delivered and accepted."),
      c1("A deliverable is accepted if the Company does not tell the Freelancer in writing, with reasons, within a reasonable time after delivery, that it does not meet the specification."),
      ...taxes(),
    ]),
    lockedSection("ip", "Intellectual property", [
      c1("On payment in full for a deliverable, the Freelancer assigns to the Company all intellectual property rights in it, except the Freelancer's pre-existing tools, templates and know-how that are incorporated in it, which the Freelancer licenses to the Company on a perpetual, non-exclusive, worldwide basis to the extent needed to use the deliverable."),
      c1("The Freelancer confirms that the Work is its own original work, that it does not infringe anyone's rights, and that it will not include third-party material without telling the Company and obtaining the licence needed."),
      when("input.portfolio", "eq", "yes", [c1("After the Company has published or launched the deliverable, the Freelancer may show it in its portfolio, without disclosing the Company's Confidential Information.")]),
      when("input.portfolio", "eq", "no", [c1("The Freelancer shall not show or refer to the Work or the Company in its portfolio or marketing without the Company's written consent.")]),
    ]),
    lockedSection("confidentiality", "Confidentiality", confidentiality()),
    lockedSection("independence", "Independent contractor", [c1("The Freelancer is an independent contractor and not an employee, partner or agent of the Company, is responsible for its own taxes, registrations and statutory dues, and is not entitled to any employee benefit. The Freelancer may work for others if this does not breach confidentiality or create a conflict of interest.")]),
    lockedSection("liability", "Liability", liability()),
    lockedSection("termination", "Termination", [...termination(), c1("If this Agreement ends before the Work is complete, the Company shall pay for the deliverables delivered and for work done on the rest in proportion to the fee, and the Freelancer shall hand over the work done so far.")]),
    lockedSection("general", "General provisions", generalProvisions()),
    lawSection(), executionSection("Freelancer"),
  ],
});

const trainingBond = defineTemplate("ct.training_bond", {
  title: "Training Bond Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("employee", "Employee"), I.effective(),
    f.longtext("training_notes", "Training being given", { help: "Name, provider, duration and what the employee will learn.", feedsSections: ["training"] }),
    f.money("training_cost", "Cost the Company will actually spend", { help: "The documented amount the company pays for the training. Do not include an amount that is not a genuine cost." }),
    f.number("bond_months", "Minimum service after the training (months)", { min: 1, max: 60, help: "Keep the period reasonable for the cost. A long period may not be enforceable." }),
    ...baseTail(),
  ],
  sections: [
    lockedSection("parties", "Parties", [p("This training bond agreement (the \"Agreement\") is made on {{input.effective_date|date}} between **{{company.legal_name}}**, having its registered office at {{company.address}} (the \"Company\"), and **{{employee.name}}**, employee code {{employee.code}}, designation {{employee.designation}} (the \"Employee\").")]),
    hybridSection("training", "Training", [
      c1("**Training.** The Company will arrange for the Employee to undergo the following training (the \"Training\"), at the Company's cost: [[input.training_text|Training|Description of the training]]"),
      c1("The Employee shall attend and complete the Training diligently and shall apply the skills gained in the Company's work."),
    ], ai("Describe the training in a short paragraph, using only the notes supplied.", ["employee.name", "input.training_notes"], NEVER_CONTRACT, { minWords: 15, maxWords: 90 })),
    lockedSection("cost", "Cost", [
      c1("The Company will spend {{input.training_cost|money}} ({{input.training_cost|words}}) on the Training (the \"Training Cost\"). The Employee acknowledges that this is the genuine amount spent by the Company, and that the Training gives the Employee a lasting benefit."),
    ]),
    lockedSection("period", "Period", [
      c1("In return, the Employee agrees to continue in the Company's service for {{input.bond_months|number}} months from the date the Training ends (the \"Bond Period\")."),
      c1("Nothing in this Agreement takes away the Employee's right to resign. It only provides for the Company to recover part of the Training Cost, as set out below, if the Employee leaves before the end of the Bond Period."),
    ]),
    lockedSection("recovery", "Recovery", [
      c1("If the Employee resigns, or the Company ends the employment for the Employee's misconduct, before the Bond Period ends, the Employee shall repay the Company a portion of the Training Cost, reduced in proportion to each full month of the Bond Period that the Employee completed, and no more than the amount actually spent."),
      c1("The Company shall tell the Employee the amount due in writing, with the calculation. The Employee shall pay it within the time stated in that notice, which the Company shall set reasonably, and the Company may adjust it against the Employee's full and final settlement only as far as the law permits."),
      c1("No amount is payable if the Company ends the employment for reasons other than misconduct, or if the Employee leaves because of the Company's serious breach of the Employee's terms of employment."),
      c1("The parties agree that the amount recoverable is a reasonable compensation for the cost the Company incurred and is not a penalty."),
    ]),
    lockedSection("general", "General provisions", [...generalProvisions().slice(2, 8)]),
    lawSection(), executionSection("Employee"),
  ],
});


export const CT_PEOPLE: TemplateDef[] = [employment, consultancy, freelancer, trainingBond];
