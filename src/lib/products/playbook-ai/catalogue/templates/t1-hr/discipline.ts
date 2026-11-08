/** T1 HR lifecycle, part 4: conduct and performance (hr.show_cause to hr.termination). All are legal-review types. */
import { ai, aiSection, bullets, c1, col, each, f, fixedSection, hybridSection, kv, lockedSection, NEVER_HR, p, whenSet, when } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { acknowledgement, companySignOff, employeeInput, employeeLetterHead } from "@/lib/products/playbook-ai/catalogue/templates/t1-hr/common";

const NEVER_FACTS = [...NEVER_HR, "facts about the incident that are not in the supplied description", "conclusions of guilt, motive or intent", "names of other employees or witnesses unless supplied"];

const showCause = defineTemplate("hr.show_cause", {
  title: "Show-Cause Notice",
  inputs: [
    employeeInput(),
    f.date("incident_date", "Date of the incident", { help: "The date, or the first date if it continued over a period." }),
    f.longtext("incident_description", "What happened", { help: "State facts only: what, when, where. Attach no conclusions.", feedsSections: ["allegation"] }),
    f.text("policy_reference", "Policy or clause concerned", { required: false, help: "For example the clause of the Code of Conduct or the appointment letter." }),
    f.number("response_days", "Days allowed to respond", { min: 1, max: 60, help: "Give reasonable time. Follow the company's disciplinary policy." }),
    f.text("respond_to", "Send the reply to"),
  ],
  sections: [
    fixedSection("notice", "Notice", [
      ...employeeLetterHead("Show-cause notice"),
      p("This notice is issued to seek your written explanation on the matter described below. It is not a finding that you have done anything wrong; it gives you a fair opportunity to explain."),
    ]),
    aiSection("allegation", "Matter on which explanation is sought", [
      p("It has been reported that on {{input.incident_date|date}}: [[input.allegation_text|Allegation|Neutral statement of the facts reported]]"),
      whenSet("input.policy_reference", [p("This relates to: {{input.policy_reference}}.")]),
    ], ai("Restate the reported facts neutrally and precisely, in the third person, starting with what is reported to have happened. Use the description only.", ["employee.name", "input.incident_date", "input.incident_description", "input.policy_reference"], NEVER_FACTS, { tone: "neutral", minWords: 30, maxWords: 140 })),
    lockedSection("response", "Your response", [
      c1("You are required to submit a written explanation, with any documents you rely on, to {{input.respond_to}} within {{input.response_days|number}} days of receiving this notice."),
      c1("If you do not respond within that time, the Company may decide the matter on the information available, in line with its disciplinary policy and applicable law."),
      c1("The Company may also hold a hearing or inquiry, and will give you a fair chance to be heard before any decision."),
      c1("Until the matter is decided, you are expected to continue your duties and to preserve all records relating to it. Please do not discuss this notice with colleagues."),
      ...companySignOff(),
      ...acknowledgement("I acknowledge receipt of this notice. My signature shows receipt only, not agreement with its contents.", "Employee"),
    ]),
  ],
});

const warning = defineTemplate("hr.warning", {
  title: "Warning Letter",
  inputs: [
    employeeInput(),
    f.select("level", "Level of warning", ["First written warning", "Second written warning", "Final written warning"]),
    f.date("incident_date", "Date of the incident"),
    f.longtext("incident_description", "What happened", { help: "State facts only.", feedsSections: ["letter"] }),
    f.longtext("previous_actions", "Earlier warnings or discussions", { required: false, help: "Dates and outcomes, if any." }),
    f.longtext("expected_conduct_notes", "What is expected from now on", { feedsSections: ["expected_conduct"] }),
  ],
  sections: [
    hybridSection("letter", "Letter", [
      ...employeeLetterHead("{{input.level}}"),
      p("This letter records a formal warning arising from the following matter on {{input.incident_date|date}}: [[input.warning_facts|Facts|Neutral statement of the facts]]"),
      whenSet("input.previous_actions", [p("This follows earlier action on record: {{input.previous_actions}}")]),
      p("The matter has been considered under the Company's disciplinary policy, and you have been given an opportunity to explain, which was taken into account."),
    ], ai("State the facts of the incident neutrally and briefly, using only the description.", ["employee.name", "input.incident_date", "input.incident_description", "input.previous_actions"], NEVER_FACTS, { tone: "neutral", minWords: 30, maxWords: 130 })),
    aiSection("expected_conduct", "Expected conduct", [bullets(["[[input.conduct_points|Expected conduct|What the employee must do or stop doing]]"])],
      ai("List clearly, as bullets, the conduct or standard expected from now on, using only the notes.", ["input.expected_conduct_notes", "employee.designation"], NEVER_FACTS, { tone: "firm", minWords: 25, maxWords: 110 })),
    lockedSection("consequences", "Consequences", [
      c1("A repeat of this conduct, or any other breach of the Company's policies, may lead to further disciplinary action, which may include termination of employment, after following the process that the Company's policy and applicable law require."),
      c1("This warning will be placed on your personnel file. You may submit a written response, which will be placed on the file with it."),
      ...companySignOff(),
      ...acknowledgement("I acknowledge receipt of this letter. My signature shows receipt only, not agreement.", "Employee"),
    ]),
  ],
});

const pip = defineTemplate("hr.pip", {
  title: "Performance Improvement Plan",
  layout: { header: "compact", footer: "confidential_page", titleAlign: "left" },
  inputs: [
    employeeInput(),
    f.date("period_start", "Plan starts"),
    f.date("period_end", "Plan ends"),
    f.rows("gaps", "Performance gaps", [col("area", "Area"), col("expected", "Standard expected"), col("observed", "What has been observed")], { minRows: 1, maxRows: 10 }),
    f.rows("goals", "Improvement goals", [col("goal", "Goal"), col("measure", "How it will be measured"), col("due", "Due date", "date")], { minRows: 1, maxRows: 12 }),
    f.longtext("support_notes", "Support the Company will provide", { feedsSections: ["support"], help: "Coaching, training, tools, regular meetings." }),
    f.rows("reviews", "Review meetings", [col("when", "Date", "date"), col("focus", "Focus", "text", false)], { minRows: 1, maxRows: 12 }),
  ],
  sections: [
    fixedSection("purpose", "Purpose", [
      kv([["Employee", "{{employee.name}}"], ["Designation", "{{employee.designation}}"], ["Department", "{{employee.department}}"], ["Manager", "{{employee.reporting_manager|text|To be confirmed}}"], ["Plan period", "{{input.period_start|date}} to {{input.period_end|date}}"]]),
      p("This plan sets out the improvement needed, the support the Company will give and how progress will be reviewed. Its aim is to help you reach the required standard."),
    ]),
    fixedSection("gaps", "Gaps identified", [each("input.gaps", "item", [bullets(["**{{item.area}}**: expected: {{item.expected}}. Observed: {{item.observed}}."])])]),
    fixedSection("goals", "Goals", [each("input.goals", "item", [bullets(["{{item.goal}} (measure: {{item.measure}}; due {{item.due|date}})"])])]),
    aiSection("support", "Support from the Company", [p("[[input.support_text|Support|What the Company will provide to help]]")],
      ai("Describe the support the Company will provide, in a short paragraph, using only the notes.", ["input.support_notes", "employee.reporting_manager"], [...NEVER_HR, "training programmes, budgets or resources not named in the notes"], { tone: "formal", minWords: 30, maxWords: 120 })),
    fixedSection("review", "Review meetings", [each("input.reviews", "item", [bullets(["{{item.when|date}}: {{item.focus|text|Progress review}}"])]), p("Written notes of each review will be shared with the employee.")]),
    lockedSection("outcome", "Outcome", [
      c1("At the end of the plan period the Company will assess progress against the goals and tell you the outcome in writing."),
      c1("If the goals are met, the plan will close. If they are partly met, the Company may extend the plan. If they are not met, the Company may take further action under its policies, which may include termination of employment, after following the process its policy and applicable law require."),
      c1("This plan is not a disciplinary penalty by itself. You may add your own comments in writing."),
      ...companySignOff(),
      ...acknowledgement("I have read this plan and discussed it with my manager. I may add my comments in writing.", "Employee"),
    ]),
  ],
});

const suspension = defineTemplate("hr.suspension", {
  title: "Suspension Order",
  inputs: [
    employeeInput(),
    f.date("start_date", "Suspension starts"),
    f.date("end_date", "Expected to end", { required: false, help: "Leave blank if it lasts until the inquiry ends." }),
    f.longtext("reason_notes", "Reason for the suspension", { help: "State the matter under inquiry in neutral words.", feedsSections: ["letter"] }),
    f.select("pay_terms", "Pay during suspension", [{ value: "full_pay", label: "Full pay" }, { value: "allowance", label: "Subsistence allowance as per policy and applicable law" }]),
    f.text("inquiry_contact", "Inquiry contact", { required: false }),
  ],
  sections: [
    hybridSection("letter", "Letter", [
      ...employeeLetterHead("Suspension pending inquiry"),
      p("The Company is inquiring into the following matter: [[input.suspension_matter|Matter|Neutral description of the matter under inquiry]]"),
      p("In order that the inquiry may be conducted fairly, you are suspended from duty with effect from **{{input.start_date|date}}**, until the inquiry is completed. This suspension is not a punishment and does not mean that any conclusion has been reached."),
      whenSet("input.end_date", [p("The suspension is expected to end on {{input.end_date|date}}, unless the Company extends it in writing.")]),
    ], ai("Describe the matter under inquiry in one or two neutral sentences, using only the notes.", ["employee.name", "input.reason_notes"], NEVER_FACTS, { tone: "neutral", minWords: 15, maxWords: 70 })),
    lockedSection("terms", "Terms during suspension", [
      when("input.pay_terms", "eq", "full_pay", [c1("You will continue to receive your salary during the suspension.")]),
      when("input.pay_terms", "eq", "allowance", [c1("You will receive a subsistence allowance during the suspension as per the Company's policy and applicable law.")]),
      c1("You must not attend the workplace or use Company systems, except to attend the inquiry or if the Company asks you to, and you must return or hand over access cards and devices if asked."),
      c1("You must remain available to attend the inquiry on reasonable notice, and must not influence witnesses or interfere with records."),
      c1("You may not take up other employment during the suspension."),
      whenSet("input.inquiry_contact", [c1("Please direct questions about the inquiry to {{input.inquiry_contact}}.")]),
      ...companySignOff(),
      ...acknowledgement("I acknowledge receipt of this order.", "Employee"),
    ]),
  ],
});

const termination = defineTemplate("hr.termination", {
  title: "Termination of Employment",
  inputs: [
    employeeInput(),
    f.date("last_day", "Last working day"),
    f.select("notice_treatment", "Notice", [{ value: "served", label: "Notice period served" }, { value: "in_lieu", label: "Pay in lieu of notice" }, { value: "none", label: "Without notice (misconduct)" }]),
    f.longtext("reason_notes", "Reason for termination", { help: "State the reason and, where it follows an inquiry or notice, its date and outcome.", feedsSections: ["letter"] }),
    f.text("process_reference", "Reference to inquiry or notice", { required: false, help: "For example the date of the show-cause notice or inquiry report." }),
    f.longtext("dues_notes", "Dues to be settled", { required: false, help: "Any specific items the settlement covers." }),
  ],
  sections: [
    hybridSection("letter", "Letter", [
      ...employeeLetterHead("Termination of employment"),
      p("This letter informs you that your employment with {{company.legal_name}} as {{employee.designation}} ends, and your last working day will be **{{input.last_day|date}}**."),
      p("[[input.termination_reason|Reason|The reason, stated factually, with reference to the process followed]]"),
      whenSet("input.process_reference", [p("Reference: {{input.process_reference}}.")]),
      when("input.notice_treatment", "eq", "served", [p("You will serve the notice period required by your terms of appointment, and the last working day above is the last day of that notice.")]),
      when("input.notice_treatment", "eq", "in_lieu", [p("The Company will pay you salary in lieu of notice as required by your terms of appointment.")]),
      when("input.notice_treatment", "eq", "none", [p("Your employment is ended without notice on the ground of the conduct stated above, as your terms of appointment permit.")]),
    ], ai("State the reason for termination factually in two or three sentences, with the process followed, using only the notes.", ["employee.name", "employee.designation", "input.reason_notes", "input.process_reference"], NEVER_FACTS, { tone: "neutral", minWords: 25, maxWords: 110 })),
    lockedSection("dues", "Dues", [
      c1("Your final settlement, covering salary up to the last working day, leave encashment if applicable under Company policy, and any other amount due under your terms of appointment and applicable law, less lawful deductions, will be processed after clearance and paid within the time the law allows."),
      whenSet("input.dues_notes", [c1("Specific items: {{input.dues_notes}}")]),
      c1("Any amount you owe the Company will be adjusted against the settlement as far as the law permits."),
    ]),
    lockedSection("handover", "Handover and clearance", [
      c1("Before your last working day, please complete the handover of your work, return all Company assets, documents and access, and complete the exit clearance with HR, IT, Admin and Finance."),
      c1("Your confidentiality and other post-employment obligations in your terms of appointment continue after your employment ends."),
      ...companySignOff(),
      ...acknowledgement("I acknowledge receipt of this letter.", "Employee"),
    ]),
  ],
});

export const HR_DISCIPLINE: TemplateDef[] = [showCause, warning, pip, suspension, termination];
