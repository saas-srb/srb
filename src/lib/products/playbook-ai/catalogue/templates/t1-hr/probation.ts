/** T1 HR lifecycle, part 3: probation, confirmation and career changes (hr.probation_plan to hr.appreciation). */
import { ai, aiSection, bullets, c1, col, each, f, fixedSection, hybridSection, kv, lockedSection, NEVER_HR, p, sig, whenSet, when } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { acknowledgement, companySignOff, employeeInput, employeeLetterHead, typedSignOff } from "@/lib/products/playbook-ai/catalogue/templates/t1-hr/common";

const FORM = { header: "compact", footer: "page_numbers", titleAlign: "left" } as const;

const probationPlan = defineTemplate("hr.probation_plan", {
  title: "Probation Goals: {{employee.name}}",
  layout: FORM,
  inputs: [
    employeeInput(),
    f.date("probation_start", "Probation starts", { bindings: ["employee.joining_date"] }),
    f.date("probation_end", "Probation ends"),
    f.rows("goals", "Goals", [col("goal", "Goal"), col("measure", "How it will be measured"), col("due", "Due date", "date", false)], { minRows: 1, maxRows: 15 }),
    f.rows("reviews", "Review meetings", [col("when", "Date", "date"), col("focus", "Focus", "text", false)], { minRows: 1, maxRows: 12 }),
  ],
  sections: [
    fixedSection("employee", "Employee", [kv([["Employee", "{{employee.name}}"], ["Designation", "{{employee.designation}}"], ["Department", "{{employee.department}}"], ["Reporting manager", "{{employee.reporting_manager|text|To be confirmed}}"], ["Probation period", "{{input.probation_start|date}} to {{input.probation_end|date}}"]])]),
    fixedSection("goals", "Goals", [p("The goals below are agreed between the employee and the reporting manager for the probation period."), each("input.goals", "item", [bullets(["{{item.goal}} (measure: {{item.measure}}; due: {{item.due|date|By the end of probation}})"])])]),
    fixedSection("metrics", "How progress is judged", [
      p("Progress is judged on the quality and timeliness of work, ownership of the goals above, learning and adaptation, teamwork, and adherence to Company policies. The manager will give regular feedback and will raise any concern early, so that there are no surprises at the final review."),
    ]),
    fixedSection("review_dates", "Review dates", [each("input.reviews", "item", [bullets(["{{item.when|date}}: {{item.focus|text|Progress review}}"])]),
      p("Agreed by:"), sig("Reporting manager", "company_signatory"), sig("Employee", "counterparty", { designation: false })]),
  ],
});

const probationReview = defineTemplate("hr.probation_review", {
  title: "Probation Review: {{employee.name}}",
  layout: FORM,
  inputs: [
    employeeInput(),
    f.date("review_date", "Review date"),
    f.rows("ratings", "Ratings by area", [col("area", "Area"), col("rating", "Rating"), col("evidence", "Evidence or example", "text", false)], { minRows: 2, maxRows: 15, help: "Use your own rating words consistently, for example Exceeds, Meets, Needs improvement." }),
    f.longtext("manager_notes", "Manager's notes", { feedsSections: ["summary"] }),
    f.select("recommendation", "Recommendation", [{ value: "confirm", label: "Confirm employment" }, { value: "extend", label: "Extend probation" }, { value: "not_confirm", label: "Do not confirm" }]),
  ],
  sections: [
    fixedSection("employee", "Employee", [kv([["Employee", "{{employee.name}}"], ["Designation", "{{employee.designation}}"], ["Department", "{{employee.department}}"], ["Joined on", "{{employee.joining_date|date}}"], ["Review date", "{{input.review_date|date}}"]])]),
    fixedSection("ratings", "Ratings", [each("input.ratings", "item", [bullets(["**{{item.area}}**: {{item.rating}}. {{item.evidence|text|No specific example recorded.}}"])])]),
    aiSection("summary", "Summary", [p("[[input.review_summary|Summary|Balanced summary of performance during probation]]")],
      ai("Write a balanced, factual summary of the employee's performance during probation from the manager's notes and ratings.", ["employee.name", "employee.designation", "input.manager_notes"], [...NEVER_HR, "performance incidents, ratings or achievements not in the notes"], { minWords: 60, maxWords: 180 })),
    fixedSection("recommendation", "Recommendation", [
      when("input.recommendation", "eq", "confirm", [p("The manager recommends that the employee be **confirmed** in service.")]),
      when("input.recommendation", "eq", "extend", [p("The manager recommends that the probation be **extended**, with clear goals for the extended period.")]),
      when("input.recommendation", "eq", "not_confirm", [p("The manager recommends that the employee **not be confirmed**. HR will advise on the process required by the appointment letter and applicable law.")]),
      sig("Reporting manager", "company_signatory"), sig("HR", "approver"),
    ]),
  ],
});

const probationExt = defineTemplate("hr.probation_ext", {
  title: "Extension of Probation",
  inputs: [
    employeeInput(),
    f.date("old_end", "Current probation end date"),
    f.date("new_end", "New probation end date"),
    f.longtext("reason_notes", "Reason for the extension", { feedsSections: ["letter"] }),
  ],
  sections: [
    hybridSection("letter", "Letter", [
      ...employeeLetterHead("Extension of probation"),
      p("Your probation was due to end on {{input.old_end|date}}. After reviewing your progress, the Company has decided to extend your probation up to **{{input.new_end|date}}**."),
      p("[[input.extension_reason|Reason|Neutral, specific explanation of why and what is expected]]"),
      p("All other terms of your appointment remain unchanged. Your confirmation will be considered at the end of the extended period, based on your performance and conduct. Your manager will meet you regularly to review progress and give you support."),
      ...companySignOff(),
      ...acknowledgement("I have received and understood this letter.", "Employee"),
    ], ai("Explain in two or three neutral sentences why probation is being extended and what improvement is expected, using only the reason notes.", ["employee.first_name", "input.reason_notes"], [...NEVER_HR, "allegations, incidents, comparisons with colleagues or promises of confirmation"], { tone: "formal", minWords: 30, maxWords: 100 })),
  ],
});

const confirmation = defineTemplate("hr.confirmation", {
  title: "Confirmation of Employment",
  inputs: [employeeInput(), f.date("effective_date", "Confirmation effective from")],
  sections: [
    fixedSection("letter", "Letter", [
      ...employeeLetterHead("Confirmation of employment"),
      p("We are pleased to confirm your employment with {{company.legal_name}} as **{{employee.designation}}**, with effect from **{{input.effective_date|date}}**, on successful completion of your probation. Thank you for your contribution so far."),
    ]),
    lockedSection("terms", "Terms unchanged", [
      p("All other terms and conditions of your letter of appointment remain unchanged. From the date of confirmation, the notice period and the other post-confirmation terms in your appointment letter will apply to you."),
      ...companySignOff(),
      ...acknowledgement("I acknowledge receipt of this letter.", "Employee"),
    ]),
  ],
});

const increment = defineTemplate("hr.increment", {
  title: "Revision of Compensation",
  inputs: [
    employeeInput(),
    f.date("effective_date", "Effective from"),
    f.money("new_ctc", "Revised annual CTC"),
    f.money("old_ctc", "Previous annual CTC", { required: false }),
    f.rows("components", "Revised structure", [col("name", "Component"), col("annual_amount", "Annual amount", "money")], { required: false, minRows: 0, help: "Optional. The total should equal the revised CTC." }),
    f.longtext("basis_notes", "Basis of the revision", { required: false, feedsSections: ["letter"] }),
  ],
  sections: [
    hybridSection("letter", "Letter", [
      ...employeeLetterHead("Revision of compensation"),
      p("We are pleased to inform you that your annual cost to company (CTC) is revised to **{{input.new_ctc|money}}** ({{input.new_ctc|words}}), with effect from **{{input.effective_date|date}}**."),
      whenSet("input.old_ctc", [p("Your earlier annual CTC was {{input.old_ctc|money}}.")]),
      p("[[input.increment_note|Recognition|One or two sentences recognising the employee's contribution]]"),
    ], ai("Write one or two sentences recognising the employee's contribution, based only on the basis notes. Do not state percentages.", ["employee.first_name", "input.basis_notes"], [...NEVER_HR, "percentages, ratings or the performance score"], { tone: "warm", minWords: 15, maxWords: 60 })),
    fixedSection("revised_structure", "Revised structure", [
      whenSet("input.components", [p("The break-up of your revised annual CTC is:"), each("input.components", "item", [bullets(["{{item.name}}: {{item.annual_amount|money}}"])])]),
      p("All deductions and contributions will be made as per applicable law and Company policy. Your compensation is confidential. All other terms of your employment remain unchanged."),
      ...companySignOff(),
      ...acknowledgement("I acknowledge receipt of this letter.", "Employee"),
    ]),
  ],
});

const promotion = defineTemplate("hr.promotion", {
  title: "Promotion",
  inputs: [
    employeeInput(),
    f.text("new_designation", "New designation"),
    f.text("new_department", "New department", { required: false }),
    f.date("effective_date", "Effective from"),
    f.text("new_reporting", "Reports to", { required: false }),
    f.money("new_ctc", "Revised annual CTC", { required: false, help: "Leave blank if compensation does not change." }),
    f.longtext("role_notes", "Responsibilities of the new role", { required: false, feedsSections: ["role"] }),
    f.longtext("achievement_notes", "Reason for the promotion", { required: false, feedsSections: ["letter"] }),
  ],
  sections: [
    hybridSection("letter", "Letter", [
      ...employeeLetterHead("Promotion to {{input.new_designation}}"),
      p("We are pleased to promote you from **{{employee.designation}}** to **{{input.new_designation}}**, with effect from **{{input.effective_date|date}}**."),
      p("[[input.promotion_note|Recognition|Two sentences recognising the work behind the promotion]]"),
    ], ai("Write two sentences recognising the work that led to the promotion, based only on the notes supplied.", ["employee.first_name", "input.new_designation", "input.achievement_notes"], [...NEVER_HR, "achievements, targets or ratings not in the notes"], { tone: "warm", minWords: 20, maxWords: 70 })),
    hybridSection("role", "Your new role", [
      whenSet("input.new_department", [p("You will be part of the {{input.new_department}} department.")]),
      p("You will report to {{input.new_reporting|text|the person the Company names}}. [[input.role_summary|Role|Short description of the new responsibilities]]"),
    ], ai("Describe the new responsibilities in a short paragraph using only the notes.", ["input.new_designation", "input.role_notes"], NEVER_HR, { tone: "formal", minWords: 30, maxWords: 100 })),
    fixedSection("compensation", "Compensation and other terms", [
      whenSet("input.new_ctc", [p("With effect from the same date, your annual CTC will be **{{input.new_ctc|money}}** ({{input.new_ctc|words}}), subject to deductions as per applicable law.")]),
      p("All other terms of your employment remain unchanged. The Company wishes you success in your new role."),
      ...companySignOff(),
      ...acknowledgement("I accept the promotion on the terms stated.", "Employee"),
    ]),
  ],
});

const transfer = defineTemplate("hr.transfer", {
  title: "Transfer Order",
  inputs: [
    employeeInput(),
    f.text("from_place", "Transferred from (location or department)", { bindings: ["employee.work_location"] }),
    f.text("to_place", "Transferred to (location or department)"),
    f.date("effective_date", "Effective from"),
    f.date("report_by", "Report to the new place by", { required: false }),
    f.text("new_manager", "New reporting manager", { required: false }),
    f.longtext("reason_notes", "Reason for the transfer", { required: false, feedsSections: ["letter"] }),
    f.longtext("support_terms", "Relocation or travel support, if any", { required: false, help: "Only what the company has approved, stated in its own words." }),
  ],
  sections: [
    hybridSection("letter", "Letter", [
      ...employeeLetterHead("Transfer from {{input.from_place}} to {{input.to_place}}"),
      p("In the interest of the business, the Company has decided to transfer you from **{{input.from_place}}** to **{{input.to_place}}**, with effect from **{{input.effective_date|date}}**. [[input.transfer_reason|Reason|One neutral sentence on the business reason]]"),
      whenSet("input.report_by", [p("Please report at the new place by {{input.report_by|date}}.")]),
    ], ai("Give the business reason for the transfer in one neutral sentence, using only the notes. If there are no notes, say it is in the interest of the business.", ["input.reason_notes", "input.from_place", "input.to_place"], [...NEVER_HR, "performance issues or any reason not in the notes"], { minWords: 10, maxWords: 40 })),
    lockedSection("terms", "Terms", [
      c1("Your designation, compensation and the other terms of your appointment remain unchanged unless this letter says otherwise."),
      whenSet("input.support_terms", [c1("Support on transfer: {{input.support_terms}}")]),
      whenSet("input.new_manager", [c1("From the effective date you will report to {{input.new_manager}}.")]),
      c1("Please complete the handover of your current work to the person your manager names before you move."),
      ...companySignOff(),
      ...acknowledgement("I acknowledge receipt of this order and will comply with it.", "Employee"),
    ]),
  ],
});

const roleChange = defineTemplate("hr.role_change", {
  title: "Change of Role and Responsibilities",
  inputs: [
    employeeInput(),
    f.text("new_role", "New role or title"),
    f.date("effective_date", "Effective from"),
    f.text("new_manager", "Reports to", { required: false }),
    f.longtext("responsibility_notes", "New responsibilities", { feedsSections: ["letter"] }),
    f.yesno("pay_changes", "Does compensation change with the role?", { defaultValue: "no" }),
  ],
  sections: [
    hybridSection("letter", "Letter", [
      ...employeeLetterHead("Change of role"),
      p("With effect from **{{input.effective_date|date}}**, your role will change from {{employee.designation}} to **{{input.new_role}}**. [[input.role_paragraph|New responsibilities|Short description of what changes]]"),
      whenSet("input.new_manager", [p("You will report to {{input.new_manager}}.")]),
      when("input.pay_changes", "eq", "no", [p("There is no change to your compensation, and the other terms of your appointment remain the same.")]),
      when("input.pay_changes", "eq", "yes", [p("Any change to your compensation will be communicated to you separately in writing.")]),
      ...companySignOff(),
      ...acknowledgement("I acknowledge and accept the change of role.", "Employee"),
    ], ai("Describe in a short paragraph what changes in the employee's responsibilities, using only the notes.", ["employee.designation", "input.new_role", "input.responsibility_notes"], [...NEVER_HR, "responsibilities, targets or pay that are not in the notes"], { minWords: 30, maxWords: 110 })),
  ],
});

const bonus = defineTemplate("hr.bonus", {
  title: "Bonus Letter",
  inputs: [
    employeeInput(),
    f.money("amount", "Bonus amount (gross)"),
    f.select("basis", "Basis of the bonus", ["Performance", "Retention", "Referral", "Festival", "Project completion", "Other"]),
    f.text("period", "Period or occasion", { help: "For example the financial year or the project it relates to." }),
    f.date("payout_date", "Expected payout date"),
    f.longtext("conditions", "Conditions, if any", { required: false, help: "For example continued service until a date, or repayment if the employee leaves early. Only what the company has decided." }),
    f.longtext("recognition_notes", "What it recognises", { required: false, feedsSections: ["letter"] }),
  ],
  sections: [
    hybridSection("letter", "Letter", [
      ...employeeLetterHead("Bonus for {{input.period}}"),
      p("We are pleased to award you a {{input.basis}} bonus of **{{input.amount|money}}** ({{input.amount|words}}) gross for {{input.period}}, to be paid on or about {{input.payout_date|date}}."),
      p("[[input.bonus_note|Recognition|One or two sentences of thanks]]"),
    ], ai("Write one or two sentences of thanks, based only on the notes.", ["employee.first_name", "input.basis", "input.period", "input.recognition_notes"], [...NEVER_HR, "other amounts, targets or promises about future bonuses"], { tone: "warm", minWords: 15, maxWords: 55 })),
    lockedSection("terms", "Terms", [
      c1("The bonus is subject to deduction of tax at source and any other deduction required by law."),
      whenSet("input.conditions", [c1("Conditions: {{input.conditions}}")]),
      c1("This bonus is a one-time payment. It does not form part of your regular compensation and does not create a right to a similar payment in future."),
      c1("Please keep this letter confidential."),
      ...companySignOff(),
      ...acknowledgement("I acknowledge receipt of this letter and accept its terms.", "Employee"),
    ]),
  ],
});

const appreciation = defineTemplate("hr.appreciation", {
  title: "Letter of Appreciation",
  inputs: [
    employeeInput(),
    f.longtext("achievement", "What the employee did", { help: "Describe the work, project or behaviour you want to recognise.", feedsSections: ["letter"] }),
    f.text("period", "Project or period", { required: false }),
  ],
  sections: [
    aiSection("letter", "Letter", [
      ...employeeLetterHead("Appreciation for your work"),
      p("[[input.appreciation_body|Appreciation|Specific, sincere recognition of the achievement]]"),
      ...typedSignOff(),
    ], ai("Write a sincere letter body of two short paragraphs recognising the specific work described, and thanking the employee.", ["employee.first_name", "employee.designation", "input.achievement", "input.period", "company.name"], [...NEVER_HR, "achievements, results, figures or client names not in the supplied description", "rewards or bonuses"], { tone: "warm", minWords: 60, maxWords: 160 })),
  ],
});


export const HR_PROBATION: TemplateDef[] = [probationPlan, probationReview, probationExt, confirmation, increment, promotion, transfer, roleChange, bonus, appreciation];
