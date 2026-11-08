/** T1 HR lifecycle, part 6: policies and the acknowledgement form (hr.leave_policy to hr.ack_form). */
import { ai, aiSection, bullets, c1, c2, col, each, f, fixedSection, hybridSection, kv, lockedSection, NEVER_HR, p, sig, whenSet, POLICY_LAYOUT } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { RawBlock, TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { employeeInput } from "@/lib/products/playbook-ai/catalogue/templates/t1-hr/common";

const NEVER_POLICY = [...NEVER_HR, "entitlements, limits, time periods or penalties that are not in the inputs"];
const policyInputs = () => [f.text("policy_owner", "Policy owner", { help: "Designation of the person responsible for this policy, for example Head of HR." }), f.date("effective_date", "Effective from")];
const policyMeta = (): RawBlock => kv([["Policy owner", "{{input.policy_owner}}"], ["Effective from", "{{input.effective_date|date}}"], ["Applies to", "All employees of {{company.legal_name}}"], ["Document reference", "{{doc.number||To be assigned on issue}}"]]);
const AMEND = "The Company may amend this policy from time to time. The amended policy applies from the date the Company states, and employees will be told of the change. Where this policy and applicable law differ, applicable law prevails.";

const leave = defineTemplate("hr.leave_policy", {
  title: "Leave Policy",
  layout: POLICY_LAYOUT,
  inputs: [
    ...policyInputs(),
    f.rows("leave_types", "Leave types offered", [col("name", "Leave type"), col("entitlement", "Entitlement per year (days)", "number"), col("notes", "Notes", "text", false)], { minRows: 1, maxRows: 15, help: "Statutory leave (for example maternity) is covered by applicable law; list company leave and any statutory leave you want shown, with the entitlement the law or your policy gives." }),
    f.longtext("accrual_rule", "How leave accrues", { help: "For example monthly credit, or credited at the start of the year, and how it applies in the first year.", feedsSections: ["accrual"] }),
    f.text("application_notice", "Notice for applying", { help: "For example 'at least one week in advance for planned leave'." }),
    f.text("approver", "Who approves leave", { help: "For example the reporting manager." }),
    f.longtext("holiday_note", "Holidays", { required: false, help: "How the yearly holiday list is published." }),
    f.longtext("encashment_rule", "Encashment and carry forward", { required: false, help: "State the company's rule, or leave blank if there is none.", feedsSections: ["encashment"] }),
  ],
  sections: [
    fixedSection("purpose", "Purpose and scope", [policyMeta(), p("This policy explains the leave that employees of {{company.legal_name}} may take, how it is earned and applied for, and how it is approved. It is meant to be fair to employees and to let the business plan its work.")]),
    fixedSection("types", "Types of leave", [p("Employees are entitled to the following leave, in addition to the public holidays notified by the Company:"), each("input.leave_types", "item", [bullets(["**{{item.name}}**: {{item.entitlement|number}} days per year. {{item.notes|text}}"])]), whenSet("input.holiday_note", [p("{{input.holiday_note}}")])]),
    aiSection("accrual", "How leave accrues", [p("[[input.accrual_text|Accrual|How leave is earned]]")],
      ai("Explain clearly how leave accrues, using only the accrual rule supplied.", ["input.accrual_rule", "input.leave_types"], NEVER_POLICY, { tone: "instructional", minWords: 30, maxWords: 130 })),
    fixedSection("application", "Applying for and approving leave", [
      c1("Employees should apply for leave through the Company's HR system {{input.application_notice}}, and the leave is approved by {{input.approver}}."),
      c1("Leave is not a right on a particular date. The approver may decline or postpone leave when the business needs it, and will give the reason."),
      c1("In an emergency, the employee should tell the approver as early as possible and apply for the leave on return."),
      c1("Absence without approval may be treated as leave without pay, and repeated or unexplained absence may lead to disciplinary action under the Company's policies."),
    ]),
    aiSection("encashment", "Encashment and carry forward", [p("[[input.encashment_text|Encashment|Rules on carry forward and encashment]]")],
      ai("State the rule on carry forward and encashment, using only the rule supplied. If none was supplied, say that unused leave lapses unless applicable law provides otherwise.", ["input.encashment_rule", "input.leave_types"], NEVER_POLICY, { tone: "instructional", minWords: 20, maxWords: 110 })),
    lockedSection("misc", "General", [
      c1("Statutory leave, including maternity benefit and any other leave that applicable law gives, is granted as the law provides, and this policy does not reduce it."),
      c1("Leave records are kept by HR. Employees should check their balance regularly and report any error promptly."),
      c1(AMEND),
    ]),
  ],
});

const attendance = defineTemplate("hr.attendance_policy", {
  title: "Attendance Policy",
  layout: POLICY_LAYOUT,
  inputs: [
    ...policyInputs(),
    f.text("working_days", "Working days", { help: "For example 'Monday to Friday'." }),
    f.text("working_hours", "Working hours", { help: "For example '9:30 AM to 6:30 PM, including a lunch break'." }),
    f.number("grace_minutes", "Grace period (minutes)", { min: 0, max: 120, help: "Minutes after the start time that are not counted as late." }),
    f.longtext("late_rule", "What happens on repeated late arrival", { help: "For example a half-day deduction after a number of late marks. State the company's rule.", feedsSections: ["late"] }),
    f.number("regularise_days", "Days allowed to regularise attendance", { min: 1, max: 60 }),
  ],
  sections: [
    fixedSection("purpose", "Purpose and scope", [policyMeta(), p("This policy sets out the attendance and punctuality expected of employees of {{company.legal_name}}, so that teams can plan work and clients are served on time.")]),
    fixedSection("hours", "Working days and hours", [
      c1("The working days are {{input.working_days}}, and the working hours are {{input.working_hours}}."),
      c1("Employees must record attendance honestly through the Company's attendance system. Recording attendance for another person, or falsifying it, is serious misconduct."),
      c1("Employees who work remotely or at client sites must follow the arrangement approved by their manager and record attendance in the same way."),
    ]),
    aiSection("late", "Late arrival", [p("A grace period of {{input.grace_minutes|number}} minutes applies after the start time. [[input.late_text|Late rule|What counts as late and what follows]]")],
      ai("Explain what counts as late arrival and the consequence of repeated late arrival, using only the rule supplied. Keep the grace period sentence as given.", ["input.grace_minutes", "input.late_rule"], NEVER_POLICY, { tone: "instructional", minWords: 30, maxWords: 120 })),
    lockedSection("regularisation", "Regularisation", [
      c1("If an employee forgets to record attendance or has an exception, the employee should ask for regularisation within {{input.regularise_days|number}} days, with the reason, and the reporting manager will approve or decline it."),
      c1("Unapproved absence is treated as leave without pay, and may lead to disciplinary action if it is repeated."),
      c1(AMEND),
    ]),
  ],
});

const wfh = defineTemplate("hr.wfh_policy", {
  title: "Remote Work Policy",
  layout: POLICY_LAYOUT,
  inputs: [
    ...policyInputs(),
    f.longtext("eligibility_notes", "Who may work remotely", { help: "Roles, tenure or other conditions the company applies.", feedsSections: ["eligibility"] }),
    f.text("remote_days", "How often", { help: "For example 'up to two days a week with manager approval', or 'fully remote for approved roles'." }),
    f.text("core_hours", "Core hours when employees must be reachable"),
    f.longtext("equipment_notes", "Equipment and expenses", { required: false, help: "What the company provides or reimburses, in its own words." }),
    f.longtext("security_notes", "Security rules specific to remote work", { required: false, feedsSections: ["security"] }),
  ],
  sections: [
    fixedSection("purpose", "Purpose and scope", [policyMeta(), p("This policy explains when and how employees of {{company.legal_name}} may work away from the office, so that work, collaboration and security are not affected.")]),
    aiSection("eligibility", "Eligibility", [p("[[input.eligibility_text|Eligibility|Who may work remotely and how approval works]]")],
      ai("Explain who may work remotely and how approval is given, using only the notes supplied.", ["input.eligibility_notes", "input.remote_days"], NEVER_POLICY, { tone: "instructional", minWords: 40, maxWords: 140 })),
    fixedSection("rules", "Rules for working remotely", [
      c1("Remote work is permitted as follows: {{input.remote_days}}. Remote work is a facility the Company may withdraw or change when business needs require, and it is not a right."),
      c1("Employees must be reachable during core hours: {{input.core_hours}}, and must attend meetings and deliver work as if they were in the office."),
      c1("Employees must record attendance and leave in the usual way."),
      whenSet("input.equipment_notes", [c1("Equipment and expenses: {{input.equipment_notes}}")]),
      c1("Employees must work from a safe place where they can keep Company and client information confidential."),
    ]),
    hybridSection("security", "Security", [
      c1("Employees must use only Company-approved devices, accounts and tools for Company work, keep them updated and locked, and never let others use them."),
      c1("Employees must not work on confidential matters in public places or on public networks without the protection the Company's information security policy requires."),
      c1("Employees must report loss or theft of a device, or any suspected data incident, to the IT team immediately."),
      p("[[input.security_extra|Additional rules|Any further security rules for remote work]]"),
      c1(AMEND),
    ], ai("Add any further remote-work security rules that appear in the notes, as short clauses. If there are none, write nothing.", ["input.security_notes"], NEVER_POLICY, { tone: "instructional", minWords: 5, maxWords: 90 })),
  ],
});

const handbook = defineTemplate("hr.handbook", {
  title: "Employee Handbook",
  layout: { header: "compact", footer: "doc_number_page", titleAlign: "center", pageBreakBefore: ["welcome"] },
  inputs: [
    ...policyInputs(),
    f.multiselect("policies", "Policies this handbook covers", ["Code of conduct", "Leave policy", "Attendance policy", "Remote work policy", "Expense and travel policy", "Information security policy", "Prevention of sexual harassment policy", "Grievance redressal policy"], { help: "Pick those that the company has adopted. Each must exist as its own policy." }),
    f.longtext("welcome_notes", "Welcome message points", { required: false, feedsSections: ["welcome"] }),
    f.longtext("values_notes", "Company values and culture", { feedsSections: ["values"] }),
    f.text("pay_day", "Salary payment day", { help: "For example 'the last working day of each month'." }),
    f.text("working_hours", "Working days and hours"),
    f.text("hr_contact", "HR contact", { bindings: ["company.email"] }),
  ],
  sections: [
    aiSection("welcome", "Welcome", [policyMeta(), p("Welcome to {{company.name}}. [[input.welcome_text|Welcome|A short welcome from the company]]")],
      ai("Write a short, warm welcome to new employees, using only the points supplied.", ["company.name", "input.welcome_notes"], [...NEVER_HR, "history, size, awards or achievements of the company"], { tone: "warm", minWords: 40, maxWords: 130 })),
    aiSection("values", "Our values", [p("[[input.values_text|Values|The company's values and what they mean in practice]]")],
      ai("Describe the company's values and culture in a short paragraph and a bulleted list, using only the notes supplied.", ["company.name", "input.values_notes"], [...NEVER_HR, "values, slogans or mission statements not supplied"], { tone: "warm", minWords: 50, maxWords: 180 })),
    fixedSection("employment", "Your employment", [
      p("Your terms of employment are set out in your letter of appointment. This handbook summarises Company policies and does not replace that letter, and where they differ the appointment letter and applicable law prevail."),
      c1("Working days and hours: {{input.working_hours}}."),
      c1("Probation, confirmation and notice are as stated in your appointment letter."),
      c1("The Company is an equal opportunity employer and decides on recruitment, pay and promotion on merit, without discrimination."),
    ]),
    fixedSection("conduct", "Conduct and ethics", [
      p("Employees are expected to act with honesty, respect and professionalism, to protect confidential information, to avoid conflicts of interest, and to follow the Company's Code of Conduct and all policies in this handbook. Harassment, discrimination, bullying, theft, fraud and misuse of Company property are not tolerated and may lead to disciplinary action."),
      p("Policies covered by this handbook: {{input.policies}}."),
    ]),
    fixedSection("leave", "Leave and attendance", [p("Leave, holidays and attendance are governed by the Company's Leave Policy and Attendance Policy, as in force from time to time. Employees should apply for leave in advance through the HR system and record attendance honestly. Statutory leave is granted as applicable law provides.")]),
    fixedSection("pay", "Pay and benefits", [p("Salary is paid on {{input.pay_day}}, after deduction of tax at source and the other deductions and contributions that applicable law requires. A payslip is made available each month. Benefits are as stated in your appointment letter and the Company's benefit policies. Queries about pay should be raised with HR at {{input.hr_contact}}.")]),
    fixedSection("safety", "Health, safety and workplace conduct", [
      p("The Company is committed to a safe and respectful workplace. Employees must follow safety instructions, report accidents, unsafe conditions and any incident of harassment promptly, and cooperate in emergency drills. Complaints of sexual harassment are dealt with under the Company's Prevention of Sexual Harassment Policy and the law, and other grievances under the Grievance Redressal Policy."),
    ]),
    fixedSection("exit", "Leaving the Company", [
      p("An employee who wishes to resign should give written notice as the appointment letter requires. The Company asks that handover and clearance be completed before the last working day. Full and final settlement is made after clearance, as per Company policy and applicable law, and experience and relieving letters follow."),
    ]),
    lockedSection("acknowledgement", "Acknowledgement", [
      p("Every employee is asked to sign the policy acknowledgement form to confirm that the employee has received, read and understood this handbook. The Company may amend this handbook from time to time and will tell employees of important changes. Questions may be sent to {{input.hr_contact}}."),
    ]),
  ],
});

const codeOfConduct = defineTemplate("hr.code_of_conduct", {
  title: "Code of Conduct",
  layout: POLICY_LAYOUT,
  inputs: [
    ...policyInputs(),
    f.longtext("principles_notes", "Principles the company wants to stress", { required: false, feedsSections: ["principles"] }),
    f.text("report_to", "Whom to report concerns to", { bindings: ["company.email"] }),
  ],
  sections: [
    fixedSection("purpose", "Purpose and scope", [policyMeta(), p("This Code sets out the standards of behaviour expected from everyone who works for {{company.legal_name}}, including employees, interns, trainees and contractors. It helps us treat each other, our clients and our partners fairly.")]),
    hybridSection("principles", "Our principles", [
      bullets([
        "**Integrity**: act honestly, keep promises and never misrepresent facts to colleagues, clients or authorities.",
        "**Respect**: treat everyone with dignity; harassment, discrimination, bullying and abusive language are not acceptable.",
        "**Compliance**: follow the law and Company policies that apply to your work.",
        "**Confidentiality**: protect Company, client and personal information, and use it only for your work.",
        "**Care for property**: use Company assets and funds only for Company purposes.",
      ]),
      p("[[input.principles_extra|Additional principles|Any further principle the company stresses]]"),
    ], ai("Add short bullets for any further principle in the notes. If there are none, write nothing.", ["input.principles_notes"], NEVER_POLICY, { tone: "instructional", minWords: 5, maxWords: 90 })),
    lockedSection("conflicts", "Conflicts of interest and gifts", [
      c1("Employees must tell the Company, in writing, of any personal, financial or family interest that may conflict with their duties, and must not take decisions on matters in which they have such an interest."),
      c1("Employees must not accept or give gifts, hospitality or favours that could influence a business decision, or that exceed what the Company's policy allows, and must declare any offer they are unsure of."),
      c1("Employees must not take up outside work that competes with the Company or affects their duties without written approval."),
    ]),
    lockedSection("reporting", "Raising concerns", [
      c1("Anyone who sees or suspects a breach of this Code should report it to {{input.report_to}} or to their manager. Reports of sexual harassment follow the Company's Prevention of Sexual Harassment Policy."),
      c1("The Company will look into reports fairly and keep them confidential as far as possible, and will not allow retaliation against anyone who reports a concern in good faith."),
    ]),
    lockedSection("consequences", "Consequences of a breach", [
      c1("A breach of this Code may lead to disciplinary action, which may include a warning, suspension or termination of employment, after the Company has followed a fair process, and may be reported to the authorities where the law requires."),
      c1(AMEND),
    ]),
  ],
});

const posh = defineTemplate("hr.posh", {
  title: "Policy on Prevention of Sexual Harassment at the Workplace",
  layout: POLICY_LAYOUT,
  inputs: [
    ...policyInputs(),
    f.rows("icc_members", "Internal Committee members", [col("name", "Name"), col("designation", "Designation or affiliation"), col("role", "Role on the Committee (Presiding Officer, Member, External Member)")], { minRows: 2, maxRows: 12, help: "Enter the members as constituted under the Act. The company is responsible for the committee's composition." }),
    f.text("complaint_email", "Email for complaints to the Committee"),
    f.text("complaint_address", "Address for written complaints", { required: false }),
  ],
  sections: [
    lockedSection("policy", "Policy statement", [
      policyMeta(),
      p("{{company.legal_name}} (the \"Company\") is committed to a workplace free from sexual harassment. This policy is made under the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013 (the \"Act\") and applies to all employees, interns, trainees and contractors, and to a workplace as the Act defines it, including places visited in the course of work and work-related travel and events."),
      p("The Company has zero tolerance for sexual harassment. Every complaint will be dealt with fairly, promptly and in confidence, and no one will be victimised for making a complaint in good faith or for taking part in an inquiry."),
    ]),
    lockedSection("definitions", "What is sexual harassment", [
      p("Sexual harassment includes any one or more of the following unwelcome acts or behaviour, whether direct or by implication:"),
      bullets(["physical contact and advances;", "a demand or request for sexual favours;", "sexually coloured remarks;", "showing pornography; or", "any other unwelcome physical, verbal or non-verbal conduct of a sexual nature."]),
      p("Circumstances that may amount to sexual harassment under the Act include an implied or explicit promise of preferential treatment, an implied or explicit threat of detrimental treatment, an implied or explicit threat about present or future employment status, interference with work or creation of an intimidating or hostile work environment, and humiliating treatment likely to affect health or safety."),
    ]),
    lockedSection("icc", "Internal Committee", [
      p("The Company has constituted an Internal Committee in the manner the Act requires. Its members are:"),
      each("input.icc_members", "item", [bullets(["{{item.name}}, {{item.designation}}: {{item.role}}"])]),
      p("Complaints may be sent to the Committee at {{input.complaint_email}}."),
      whenSet("input.complaint_address", [p("Written complaints may also be delivered to: {{input.complaint_address}}.")]),
      p("The Company will give the Committee the facilities it needs for an inquiry, will make the Committee's members known to employees, and will hold awareness programmes and orientation as the Act requires."),
    ]),
    lockedSection("complaint", "How to make a complaint", [
      c1("An aggrieved woman may make a written complaint of sexual harassment to the Internal Committee, within the time the Act allows. If she cannot put it in writing, a member of the Committee will help her to do so."),
      c1("Where the aggrieved woman is unable to complain herself, the Act allows others to do so on her behalf, as it provides."),
      c1("Before an inquiry, and at the aggrieved woman's request, the Committee may try to settle the matter through conciliation as the Act permits, but no monetary settlement may be the basis of conciliation."),
    ]),
    lockedSection("inquiry", "Inquiry and action", [
      c1("The Committee will inquire into the complaint following the procedure the Act and the rules under it require, will follow the principles of natural justice, and will complete the inquiry and report within the time the Act allows."),
      c1("During the inquiry, the Committee may recommend interim relief to the aggrieved woman as the Act allows."),
      c1("If the allegation is proved, the Company will act on the Committee's recommendation as the Act and its service rules provide, which may include disciplinary action up to termination, and deductions or payments as the Act provides."),
      c1("A false or malicious complaint, or false evidence, may attract action as the Act provides, but a complaint that cannot be proved is not by itself a false complaint."),
      c1("Appeals lie as the Act provides."),
    ]),
    lockedSection("confidentiality", "Confidentiality", [
      c1("The contents of a complaint, the identity and address of the aggrieved woman, the respondent and witnesses, the inquiry proceedings, recommendations and action taken must not be published, communicated or made known to the public, the press or colleagues, except as the Act allows."),
      c1("Anyone who breaches confidentiality will be liable to action under the Act and the Company's policies."),
      c1(AMEND),
    ]),
  ],
});

const grievance = defineTemplate("hr.grievance", {
  title: "Grievance Redressal Policy",
  layout: POLICY_LAYOUT,
  inputs: [
    ...policyInputs(),
    f.rows("levels", "Escalation levels", [col("level", "Level"), col("officer", "Who handles it"), col("timeline", "Time to respond")], { minRows: 1, maxRows: 6, help: "Time to respond is the company's own commitment, in its own words, for example 'within five working days'." }),
    f.text("raise_via", "How a grievance is raised", { help: "For example 'in writing or by email to the HR team'." }),
  ],
  sections: [
    fixedSection("policy", "Policy", [policyMeta(), p("{{company.legal_name}} wants employees to raise work-related concerns openly and have them looked into fairly and promptly. This policy gives a simple way to do so. It covers concerns about work, working conditions, treatment by colleagues or managers, pay and policies. Complaints of sexual harassment follow the Company's separate Prevention of Sexual Harassment Policy."), c1("A grievance may be raised {{input.raise_via}}."), c1("No employee will be penalised for raising a grievance in good faith.")]),
    fixedSection("levels", "Levels of escalation", [p("A grievance is first taken to the first level. If the employee is not satisfied with the response, it may be escalated to the next level."), each("input.levels", "item", [bullets(["**{{item.level}}**: handled by {{item.officer}}"])])]),
    fixedSection("timelines", "Timelines and records", [
      each("input.levels", "item", [bullets(["{{item.level}}: response {{item.timeline}}"])]),
      c1("Each grievance is recorded, acknowledged in writing, looked into with the people concerned, and answered with the outcome and the reasons."),
      c1("Grievances are handled confidentially, and only those who need to know are told."),
      c1("An employee may be accompanied by a colleague at any meeting if the employee wishes."),
      c1(AMEND),
    ]),
  ],
});

const referral = defineTemplate("hr.referral", {
  title: "Employee Referral Policy",
  layout: POLICY_LAYOUT,
  inputs: [
    ...policyInputs(),
    f.rows("rewards", "Rewards", [col("applies_to", "Applies to (role level or group)"), col("reward", "Reward", "money"), col("payable_when", "Payable when")], { minRows: 1, maxRows: 10, help: "The company's own reward amounts and the point at which they become payable." }),
    f.longtext("eligible_notes", "Who is eligible to refer", { feedsSections: ["eligibility"] }),
    f.longtext("exclusions", "Exclusions", { required: false, help: "For example roles or relatives the policy does not cover." }),
  ],
  sections: [
    fixedSection("policy", "Policy", [policyMeta(), p("{{company.legal_name}} encourages employees to refer people they know for open positions, because good people often come through trusted networks. This policy sets out who can refer, how a referral works and how a reward is paid.")]),
    aiSection("eligibility", "Eligibility", [p("[[input.eligible_text|Eligibility|Who can refer and which referrals qualify]]"), whenSet("input.exclusions", [p("Exclusions: {{input.exclusions}}")])],
      ai("Explain who may refer and which referrals qualify, using only the notes supplied.", ["input.eligible_notes", "input.exclusions"], NEVER_POLICY, { tone: "instructional", minWords: 30, maxWords: 120 })),
    fixedSection("payout", "Rewards and payout", [
      each("input.rewards", "item", [bullets(["{{item.applies_to}}: reward of {{item.reward|money}}, payable {{item.payable_when}}"])]),
      c1("The reward is paid with the salary of the month after the stated condition is met, subject to deduction of tax at source and other deductions required by law."),
      c1("A referral is valid only if the candidate's resume is sent through the Company's referral channel before the candidate applies by any other route."),
      c1("The Company decides all hiring on merit. A referral does not guarantee an interview or an offer, and the Company's decision is final."),
      c1("Any attempt to misuse this policy may lead to loss of the reward and to disciplinary action."),
      c1(AMEND),
    ]),
  ],
});

const ackForm = defineTemplate("hr.ack_form", {
  title: "Policy Acknowledgement",
  layout: { header: "compact", footer: "doc_number_page", titleAlign: "left" },
  inputs: [
    employeeInput(),
    f.text("policy_name", "Policy or document acknowledged"),
    f.text("policy_version", "Version or reference", { required: false }),
    f.date("policy_date", "Policy effective date", { required: false }),
  ],
  sections: [
    lockedSection("statement", "Statement", [
      kv([["Employee", "{{employee.name}}"], ["Employee code", "{{employee.code}}"], ["Designation", "{{employee.designation}}"], ["Policy", "{{input.policy_name}}"], ["Version or reference", "{{input.policy_version|text|Current version}}"], ["Effective", "{{input.policy_date|date|As issued}}"]]),
      c1("I confirm that I have received the policy named above, that I have read it and that I understand it."),
      c1("I agree to follow it, and I understand that a breach may lead to disciplinary action under the Company's policies."),
      c1("I know whom to ask if I have a question about the policy, and I understand that the Company may change it and will tell me of important changes."),
      c2("This acknowledgement is not a contract of employment and does not change the terms of my appointment letter."),
    ]),
    lockedSection("signature", "Signature", [sig("Employee", "counterparty", { designation: false }), sig("For the Company (HR)", "company_signatory")]),
  ],
});

export const HR_POLICIES: TemplateDef[] = [leave, attendance, wfh, handbook, codeOfConduct, posh, grievance, referral, ackForm];
