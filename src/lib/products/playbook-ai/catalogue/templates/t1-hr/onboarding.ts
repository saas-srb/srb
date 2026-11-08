/** T1 HR lifecycle, part 2: appointment and onboarding (hr.appointment to hr.asset_issue). */
import { ai, aiSection, bullets, c1, col, each, f, fixedSection, hybridSection, kv, lockedSection, NEVER_HR, p, sig, table, whenSet } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import {
  acknowledgement, candidateInput, candidateLetterHead, companySignOff, confidentialityClauses, employeeInput, employeeLetterHead, ipClauses, typedSignOff,
} from "@/lib/products/playbook-ai/catalogue/templates/t1-hr/common";

const appointment = defineTemplate("hr.appointment", {
  title: "Letter of Appointment",
  layout: { header: "letterhead", footer: "doc_number_page", titleAlign: "center", pageBreakBefore: ["acceptance"] },
  inputs: [
    employeeInput(),
    f.text("designation", "Designation", { bindings: ["employee.designation"] }),
    f.text("department", "Department", { bindings: ["employee.department"] }),
    f.text("location", "Place of work", { bindings: ["employee.work_location"] }),
    f.date("joining_date", "Date of joining", { bindings: ["employee.joining_date"] }),
    f.text("reporting_manager", "Reports to", { bindings: ["employee.reporting_manager"], required: false }),
    f.money("annual_ctc", "Annual cost to company (CTC)", { help: "Gross annual CTC as agreed in the offer." }),
    f.number("probation_months", "Probation (months)", { min: 0, max: 24 }),
    f.number("probation_notice_days", "Notice during probation (days)", { min: 0, max: 365, help: "Use the company's policy." }),
    f.number("notice_days", "Notice after confirmation (days)", { min: 0, max: 365, help: "Use the company's policy." }),
    f.text("working_hours", "Working hours and days", { help: "For example 'Monday to Friday, 9:30 AM to 6:30 PM'. Use the company's attendance policy." }),
    f.longtext("duty_notes", "Main duties", { required: false, feedsSections: ["duties"] }),
  ],
  sections: [
    fixedSection("appointment", "Appointment", [
      ...employeeLetterHead("Letter of appointment as {{input.designation}}"),
      p("With reference to your acceptance of our offer, we are pleased to appoint you as **{{input.designation}}** in the {{input.department}} department of {{company.legal_name}} (the \"Company\"). Your employment will begin on {{input.joining_date|date}} and your place of work will be {{input.location}}. The Company may, depending on business needs, require you to work at any of its other offices or client sites."),
      p("You will report to {{input.reporting_manager|text|the manager named by the Company}}, or to any other person the Company may name."),
    ]),
    aiSection("duties", "Duties and responsibilities", [
      p("You will perform the duties of your role diligently and to the best of your ability. [[input.duty_summary|Duties|Summary of the main duties of the role]]"),
      p("The Company may change your duties or reporting line from time to time in line with business needs and your skills."),
    ], ai("Write a short paragraph on the main duties from the notes. Do not include any promise about future roles.", ["employee.designation", "input.designation", "input.department", "input.duty_notes"], [...NEVER_HR, "targets, KPIs, incentives or duties that were not supplied"], { minWords: 30, maxWords: 110 })),
    fixedSection("compensation", "Compensation", [
      p("Your annual cost to company (CTC) will be **{{input.annual_ctc|money}}** ({{input.annual_ctc|words}}). The break-up of your CTC and the benefits that apply to you are as set out in your compensation annexure and the Company's payroll and benefits policies, as updated from time to time."),
      p("Your salary will be paid on the Company's regular pay date. The Company will deduct tax at source and make all other deductions and contributions that applicable law requires. Your compensation is confidential and must not be disclosed to colleagues."),
    ]),
    lockedSection("probation", "Probation and confirmation", [
      c1("You will be on probation for {{input.probation_months|number}} months from the date of joining. Your performance and conduct will be reviewed during this period."),
      c1("Confirmation will be by a written letter from the Company. Until you receive it, you will continue on probation, and the Company may extend the probation by written notice."),
      c1("During probation, either party may end the employment by giving {{input.probation_notice_days|number}} days' written notice, or salary in lieu of notice."),
    ]),
    lockedSection("hours_leave", "Working hours and leave", [
      c1("Your working hours and days will be: {{input.working_hours}}. The Company may change them as business needs require."),
      c1("You will be entitled to leave and holidays under the Company's Leave Policy and applicable law, as in force from time to time. Leave must be applied for and approved in advance, except in an emergency."),
    ]),
    lockedSection("confidentiality", "Confidentiality and work product", [
      ...confidentialityClauses("You"),
      ...ipClauses("you"),
      c1("**Outside work and conflict of interest.** While employed, you shall not take up any other employment, business or engagement, paid or unpaid, that competes with the Company or affects your work, without the Company's prior written consent, and you shall tell the Company of any conflict of interest."),
    ]),
    lockedSection("termination", "Termination", [
      c1("After confirmation, either party may end the employment by giving {{input.notice_days|number}} days' written notice or salary in lieu of notice."),
      c1("The Company may end your employment without notice or payment in lieu for serious misconduct, fraud, breach of confidentiality, or breach of the Company's policies or the terms of this letter, after following the procedure that the Company's policies and applicable law require."),
      c1("On leaving, you shall return all Company property, records and information, complete a proper handover, and clear all dues. Your full and final settlement will be made after clearance, as per Company policy and applicable law."),
      c1("The Company's Code of Conduct, policies and rules as in force from time to time are part of your terms of employment. This letter is governed by the laws of India."),
    ]),
    lockedSection("acceptance", "Acceptance", [
      ...companySignOff(),
      ...acknowledgement("I have read and understood this letter, and I accept the terms of my appointment.", "Accepted by the Employee"),
    ]),
  ],
});

const internship = defineTemplate("hr.internship_offer", {
  title: "Internship Offer Letter",
  layout: { header: "letterhead", footer: "doc_number_page", titleAlign: "center", pageBreakBefore: ["acceptance"] },
  inputs: [
    candidateInput(),
    f.text("role", "Internship role"),
    f.text("department", "Department or team"),
    f.date("start_date", "Start date"),
    f.date("end_date", "End date"),
    f.money("stipend", "Monthly stipend", { required: false, help: "Leave blank for an unpaid internship." }),
    f.text("location", "Place of internship"),
    f.text("mentor", "Mentor or supervisor"),
    f.text("working_hours", "Working hours"),
  ],
  sections: [
    fixedSection("offer", "Offer", [
      ...candidateLetterHead("Internship offer: {{input.role}}"),
      p("We are pleased to offer you an internship as **{{input.role}}** in the {{input.department}} team of {{company.legal_name}} (the \"Company\"), from {{input.start_date|date}} to {{input.end_date|date}}, at {{input.location}}. Your mentor will be {{input.mentor}}."),
    ]),
    lockedSection("terms", "Terms of the internship", [
      c1("The internship is for learning and contribution to real work. It is not employment, and it does not create any right or promise of employment with the Company after it ends."),
      whenSet("input.stipend", [c1("You will be paid a stipend of {{input.stipend|money}} per month ({{input.stipend|words}}), subject to deduction of tax at source and other deductions required by law.")]),
      c1("Your working hours will be {{input.working_hours}}. You must follow the Company's code of conduct, security and attendance rules while you are with us."),
      c1("Either party may end the internship earlier by giving reasonable written notice. On completion, you will receive a certificate if you have completed the internship satisfactorily."),
    ]),
    lockedSection("confidentiality", "Confidentiality and work product", [...confidentialityClauses("You"), ...ipClauses("you")]),
    lockedSection("acceptance", "Acceptance", [
      ...companySignOff(),
      ...acknowledgement("I accept this internship on the terms stated above.", "Accepted by the Intern"),
    ]),
  ],
});

const welcome = defineTemplate("hr.welcome", {
  title: "Welcome to {{company.name}}",
  inputs: [
    employeeInput(),
    f.date("first_day", "First day", { bindings: ["employee.joining_date"] }),
    f.text("reporting_time", "Reporting time and place", { help: "For example '9:30 AM at the reception, main office'." }),
    f.text("buddy", "Onboarding buddy", { required: false }),
    f.rows("plan", "First-day plan", [col("time", "Time"), col("activity", "Activity")], { minRows: 1, maxRows: 15 }),
    f.longtext("welcome_notes", "Anything personal to add", { required: false, feedsSections: ["letter"] }),
  ],
  sections: [
    hybridSection("letter", "Letter", [
      ...employeeLetterHead("Welcome to the team"),
      p("On behalf of everyone at {{company.name}}, welcome. We are delighted that you are joining us as {{employee.designation}} in the {{employee.department}} team."),
      p("[[input.welcome_paragraph|Welcome message|Two warm sentences]]"),
      ...typedSignOff(),
    ], ai("Write two warm sentences welcoming the person to the team. Keep it genuine and short.", ["employee.first_name", "company.name", "employee.department", "input.welcome_notes"], [...NEVER_HR, "promises, perks, salary or details of the role"], { tone: "warm", minWords: 20, maxWords: 60 })),
    fixedSection("first_day", "Your first day", [
      kv([["First day", "{{input.first_day|date}}"], ["Report at", "{{input.reporting_time}}"], ["Your buddy", "{{input.buddy|text|Your manager will introduce you}}"], ["Reporting manager", "{{employee.reporting_manager|text|To be introduced on the first day}}"]]),
      p("Your plan for the day:"),
      each("input.plan", "item", [bullets(["{{item.time}}: {{item.activity}}"])]),
      p("Please bring the original documents you were asked for during the offer process."),
    ]),
  ],
});

const checklist = defineTemplate("hr.onboarding_checklist", {
  title: "Onboarding Checklist: {{employee.name}}",
  layout: { header: "compact", footer: "page_numbers", titleAlign: "left" },
  inputs: [
    employeeInput(),
    f.date("joining_date", "Joining date", { bindings: ["employee.joining_date"] }),
    f.text("hr_owner", "HR owner"),
    f.text("it_owner", "IT contact", { required: false }),
  ],
  sections: [
    fixedSection("summary", "Employee", [kv([["Employee", "{{employee.name}}"], ["Employee code", "{{employee.code}}"], ["Designation", "{{employee.designation}}"], ["Department", "{{employee.department}}"], ["Joining date", "{{input.joining_date|date}}"], ["HR owner", "{{input.hr_owner}}"], ["IT contact", "{{input.it_owner|text|IT team}}"]])]),
    fixedSection("pre_joining", "Before joining", [table([55, 25, 20], ["Task", "Owner", "Done"], [
      ["Offer accepted and signed copy received", "HR", ""], ["Documents collected: identity, address, education, previous employment", "HR", ""], ["Background verification initiated, where consented", "HR", ""],
      ["Employee record created and employee code issued", "HR", ""], ["Laptop, accounts and email prepared", "IT", ""], ["Desk, access card and seating arranged", "Admin", ""], ["Welcome message sent with first-day plan", "HR", ""],
    ])]),
    fixedSection("day_one", "Day one", [table([55, 25, 20], ["Task", "Owner", "Done"], [
      ["Welcome and introduction to the team", "Manager", ""], ["Issue of laptop and other assets, with acknowledgement", "IT", ""], ["Accounts, email and tool access working", "IT", ""],
      ["Appointment letter issued and signed", "HR", ""], ["Policies shared: code of conduct, leave, attendance, information security, POSH", "HR", ""], ["Bank and statutory details collected for payroll", "HR", ""], ["Office tour, safety briefing and emergency exits", "Admin", ""],
    ])]),
    fixedSection("week_one", "First week", [table([55, 25, 20], ["Task", "Owner", "Done"], [
      ["Role expectations and goals discussed", "Manager", ""], ["Introduction to key stakeholders and clients", "Manager", ""], ["Induction sessions attended", "HR", ""],
      ["Mandatory training assigned: information security and POSH awareness", "HR", ""], ["Probation goals agreed in writing", "Manager", ""], ["Check-in with HR on settling in", "HR", ""],
    ])]),
    fixedSection("first_three_months", "First three months", [table([55, 25, 20], ["Task", "Owner", "Done"], [
      ["End of first month: review of progress against goals", "Manager", ""], ["End of second month: feedback conversation and support needs", "Manager", ""],
      ["End of third month: readiness review and plan for the rest of probation", "Manager and HR", ""], ["Employee feedback on the onboarding experience collected", "HR", ""],
    ])]),
  ],
});

const induction = defineTemplate("hr.induction_plan", {
  title: "Induction Plan: {{employee.name}}",
  layout: { header: "compact", footer: "page_numbers", titleAlign: "left" },
  inputs: [
    employeeInput(),
    f.text("buddy", "Buddy", { help: "A colleague who helps the new joiner settle in." }),
    f.date("start_date", "Induction starts", { bindings: ["employee.joining_date"] }),
    f.rows("sessions", "Sessions", [col("day", "Day or date"), col("time", "Time"), col("session", "Session"), col("owner", "Owner")], { minRows: 1, maxRows: 40 }),
  ],
  sections: [
    fixedSection("overview", "Overview", [
      p("This plan sets out the induction of **{{employee.name}}**, {{employee.designation}}, {{employee.department}}, starting {{input.start_date|date}}. The new joiner's buddy is {{input.buddy}} and the reporting manager is {{employee.reporting_manager|text|to be confirmed}}."),
    ]),
    fixedSection("schedule", "Schedule", [each("input.sessions", "item", [bullets(["{{item.day}}, {{item.time}}: {{item.session}} (owner: {{item.owner}})"])])]),
    fixedSection("owners", "Owners and follow-up", [
      p("Each session owner confirms to HR once the session is delivered. The buddy checks in with the new joiner at the end of each day during the first week. HR reviews completion with the reporting manager at the end of the induction and records any gaps for follow-up."),
    ]),
  ],
});

const bgv = defineTemplate("hr.bgv_consent", {
  title: "Consent for Background Verification",
  layout: { header: "letterhead", footer: "doc_number_page", titleAlign: "center" },
  inputs: [
    employeeInput(),
    f.multiselect("scope", "Checks to be done", ["Identity", "Address", "Education", "Previous employment", "Professional reference", "Criminal record", "Credit or financial check"], { help: "Select only the checks that are needed for this role." }),
    f.text("agency", "Verification agency", { required: false, help: "Name of the agency, if an outside agency does the checks." }),
  ],
  sections: [
    lockedSection("consent", "Consent", [
      p("I, **{{employee.name}}** (employee code {{employee.code}}), am joining or working with {{company.legal_name}} (the \"Company\") as {{employee.designation}}."),
      c1("I consent to the Company, {{input.agency|text|and its authorised agents}}, verifying the information and documents I have given to the Company."),
      c1("I confirm that the information and documents I have given are true, complete and not misleading, and I will tell the Company of any change."),
      c1("I understand that a false statement or a material omission, or an adverse verification result, may lead to action under the Company's policies, including withdrawal of the offer or termination of employment, after I have been given a fair chance to explain."),
    ]),
    lockedSection("scope", "Scope of verification", [
      p("I authorise the following checks only: {{input.scope}}."),
      p("I authorise my previous employers, educational institutions and referees to share information with the Company or its agency for these checks, and I will help by giving any further details they need."),
    ]),
    lockedSection("data_use", "How my data will be used", [
      c1("The Company will use my personal data only for this verification and for my employment, and will share it only with the agency and the persons who need it for that purpose."),
      c1("The Company will keep the data securely, will keep it only as long as the Company's retention policy and applicable law require, and will handle it in line with applicable data protection law."),
      c1("I may ask the Company about the data it holds about me, ask for correction of errors, and withdraw this consent for future use by writing to {{company.email|text|the HR department}}; withdrawal does not affect checks already done."),
      ...acknowledgement("I have read this consent and I give it freely.", "Employee"),
    ]),
  ],
});

const assetIssue = defineTemplate("hr.asset_issue", {
  title: "Asset Issue and Undertaking",
  layout: { header: "compact", footer: "doc_number_page", titleAlign: "left" },
  inputs: [
    employeeInput(),
    f.date("issue_date", "Date of issue"),
    f.rows("assets", "Assets issued", [col("description", "Asset"), col("identifier", "Serial or tag number"), col("condition", "Condition at issue")], { minRows: 1, maxRows: 40 }),
    f.longtext("remarks", "Remarks", { required: false }),
  ],
  sections: [
    fixedSection("assets", "Assets issued", [
      p("The following assets of {{company.legal_name}} (the \"Company\") are issued to **{{employee.name}}**, employee code {{employee.code}}, on {{input.issue_date|date}}:"),
      each("input.assets", "item", [bullets(["{{item.description}}, identifier {{item.identifier}}, condition at issue: {{item.condition}}"])]),
      whenSet("input.remarks", [p("Remarks: {{input.remarks}}")]),
    ]),
    lockedSection("undertaking", "Undertaking", [
      c1("I have received the assets listed above in the condition stated, and I am responsible for their safe custody."),
      c1("I will use them only for the Company's work and in line with its policies, will not lend them to anyone, and will report loss, theft or damage to the Company immediately."),
      c1("I understand that the Company may recover the repair or replacement cost of an asset that is lost or damaged through my negligence or misuse, in line with Company policy and applicable law."),
    ]),
    lockedSection("return", "Return", [
      p("I will return all the assets in good working condition, with accessories, when I leave the Company or when the Company asks, and I will not delete or take away any Company data from them."),
      ...acknowledgement("Received and agreed.", "Employee"),
      sig("Issued by (IT or Admin)", "company_signatory"),
    ]),
  ],
});

export const HR_ONBOARDING: TemplateDef[] = [appointment, internship, welcome, checklist, induction, bgv, assetIssue];
