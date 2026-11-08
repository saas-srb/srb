/** T1 HR lifecycle, part 5: separation (hr.resignation_accept to hr.verification). */
import { ai, aiSection, bullets, c1, col, each, f, fixedSection, kv, lockedSection, NEVER_HR, p, table, whenSet, whenYes, when } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { acknowledgement, companySignOff, employeeInput, employeeLetterHead } from "@/lib/products/playbook-ai/catalogue/templates/t1-hr/common";

const FORM = { header: "compact", footer: "page_numbers", titleAlign: "left" } as const;

const resignationAccept = defineTemplate("hr.resignation_accept", {
  title: "Acceptance of Resignation",
  inputs: [
    employeeInput(),
    f.date("resignation_date", "Date of resignation letter"),
    f.date("last_day", "Last working day"),
    f.select("notice_terms", "Notice terms", [{ value: "served", label: "Full notice period served" }, { value: "shortened", label: "Notice shortened by agreement" }, { value: "in_lieu", label: "Pay in lieu of notice" }]),
    f.text("handover_to", "Hand over work to"),
    f.longtext("remarks", "Anything else to record", { required: false }),
  ],
  sections: [
    fixedSection("letter", "Letter", [
      ...employeeLetterHead("Acceptance of your resignation"),
      p("We acknowledge your resignation letter dated {{input.resignation_date|date}}, and the Company accepts your resignation from the post of {{employee.designation}}. Your last working day will be **{{input.last_day|date}}**."),
      p("We thank you for your contribution to {{company.name}} and wish you well."),
    ]),
    fixedSection("notice", "Notice", [
      when("input.notice_terms", "eq", "served", [p("You will serve the notice period required by your terms of appointment, up to the last working day above.")]),
      when("input.notice_terms", "eq", "shortened", [p("The Company has agreed to shorten your notice period so that your last working day is the date above. All other terms of your appointment continue until then.")]),
      when("input.notice_terms", "eq", "in_lieu", [p("The notice period will be settled by pay in lieu of notice as your terms of appointment provide, and your last working day is the date above.")]),
      whenSet("input.remarks", [p("{{input.remarks}}")]),
    ]),
    fixedSection("handover", "Handover and clearance", [
      p("Please hand over your work, documents and passwords to {{input.handover_to}}, return all Company assets, and complete the exit clearance and exit interview before your last working day. Your full and final settlement will be processed after clearance as per Company policy and applicable law. Your relieving and experience letters will be issued after the settlement is complete."),
      ...companySignOff(),
      ...acknowledgement("I acknowledge receipt of this letter.", "Employee"),
    ]),
  ],
});

const noticeWaiver = defineTemplate("hr.notice_waiver", {
  title: "Notice Period Waiver or Buyout",
  inputs: [
    employeeInput(),
    f.select("kind", "Arrangement", [{ value: "company_waives", label: "Company waives part of the notice" }, { value: "employee_buys_out", label: "Employee buys out part of the notice" }]),
    f.number("notice_required", "Notice required under the appointment letter (days)", { min: 0, max: 365 }),
    f.number("days_waived", "Days waived or bought out", { min: 1, max: 365 }),
    f.date("agreed_last_day", "Agreed last working day"),
    f.money("buyout_amount", "Buyout amount payable by the employee", { required: false, showWhen: { key: "kind", equals: "employee_buys_out" }, help: "Compute it as your appointment letter and policy provide. Do not enter a figure the company has not agreed." }),
    f.longtext("other_terms", "Other agreed terms", { required: false }),
  ],
  sections: [
    fixedSection("letter", "Letter", [
      ...employeeLetterHead("Notice period waiver or buyout"),
      p("Your appointment letter requires {{input.notice_required|number}} days' notice. By mutual agreement between you and {{company.legal_name}}, {{input.days_waived|number}} days of that notice are dealt with as set out below, and your last working day will be **{{input.agreed_last_day|date}}**."),
    ]),
    lockedSection("terms", "Terms", [
      when("input.kind", "eq", "company_waives", [c1("The Company waives {{input.days_waived|number}} days of the notice period and will not claim pay in lieu for those days.")]),
      when("input.kind", "eq", "employee_buys_out", [c1("You will pay the Company {{input.buyout_amount|money}} ({{input.buyout_amount|words}}) for the {{input.days_waived|number}} days not served. The Company may adjust it against your full and final settlement as far as the law permits.")]),
      c1("Until the agreed last working day, your terms of employment, including confidentiality, continue to apply, and you will complete the handover the Company asks for."),
      whenSet("input.other_terms", [c1("{{input.other_terms}}")]),
      c1("Apart from this arrangement, all terms of your appointment letter, including the obligations that continue after your employment, remain in force."),
      ...companySignOff(),
      ...acknowledgement("I agree to the arrangement stated above.", "Employee"),
    ]),
  ],
});

const exitChecklist = defineTemplate("hr.exit_checklist", {
  title: "Exit Clearance Checklist: {{employee.name}}",
  layout: FORM,
  inputs: [employeeInput(), f.date("last_day", "Last working day"), f.text("hr_owner", "HR owner")],
  sections: [
    fixedSection("employee", "Employee", [kv([["Employee", "{{employee.name}}"], ["Employee code", "{{employee.code}}"], ["Designation", "{{employee.designation}}"], ["Department", "{{employee.department}}"], ["Last working day", "{{input.last_day|date}}"], ["HR owner", "{{input.hr_owner}}"]])]),
    fixedSection("assets", "Assets", [table([55, 25, 20], ["Item", "Cleared by", "Done"], [["Laptop, phone and accessories returned and checked", "IT", ""], ["Access card, keys and ID card returned", "Admin", ""], ["Other Company property returned", "Admin", ""]])]),
    fixedSection("access", "Access", [table([55, 25, 20], ["Item", "Cleared by", "Done"], [["Email, chat and tool accounts disabled on the last day", "IT", ""], ["Shared passwords and keys rotated", "IT", ""], ["Building and system access removed", "Admin", ""]])]),
    fixedSection("knowledge_transfer", "Knowledge transfer", [table([55, 25, 20], ["Item", "Cleared by", "Done"], [["Handover note prepared and accepted", "Manager", ""], ["Work in progress and open issues transferred", "Manager", ""], ["Client and vendor contacts introduced to the successor", "Manager", ""]])]),
    fixedSection("finance", "Finance", [table([55, 25, 20], ["Item", "Cleared by", "Done"], [["Expense claims and advances settled", "Finance", ""], ["Loans or recoverable amounts reconciled", "Finance", ""], ["Final payroll inputs shared with payroll", "Finance", ""]])]),
    fixedSection("hr", "Human Resources", [table([55, 25, 20], ["Item", "Cleared by", "Done"], [["Resignation accepted in writing", "HR", ""], ["Exit interview held", "HR", ""], ["Full and final settlement prepared", "HR", ""], ["Relieving and experience letters prepared", "HR", ""], ["Statutory exit formalities completed", "HR", ""]])]),
  ],
});

const exitInterview = defineTemplate("hr.exit_interview", {
  title: "Exit Interview",
  layout: FORM,
  inputs: [
    employeeInput(),
    f.date("last_day", "Last working day"),
    f.text("interviewer", "Interviewer"),
    f.longtext("interview_notes", "Notes from the conversation", { required: false, help: "Record what the employee said, in their words where you can.", feedsSections: ["summary"] }),
  ],
  sections: [
    fixedSection("questions", "Questions", [
      kv([["Employee", "{{employee.name}}"], ["Designation", "{{employee.designation}}"], ["Department", "{{employee.department}}"], ["Last working day", "{{input.last_day|date}}"], ["Interviewer", "{{input.interviewer}}"]]),
      p("Please answer as openly as you wish. Your answers help the Company improve."),
      ...[
        "What is your main reason for leaving?",
        "What did you value most about working here?",
        "What could we have done better for you in your role?",
        "How would you describe the support and leadership you received from your manager?",
        "How do you see the culture, communication and growth opportunities here?",
        "Were your role and responsibilities what you expected when you joined?",
        "Did you face any issue related to conduct, safety or fairness that you want us to know about?",
        "Would you recommend the Company to a friend, and would you consider returning in future? Why?",
        "Is there anything else you would like to share?",
      ].map((q) => p(`**${q}**\n______________________________________________________________`)),
    ]),
    aiSection("summary", "Summary", [p("[[input.exit_summary|Summary|Neutral summary of the main themes]]")],
      ai("Summarise the main themes the employee raised, neutrally and without attributing blame, using only the notes.", ["employee.designation", "employee.department", "input.interview_notes"], [...NEVER_HR, "opinions of the interviewer", "claims or accusations that were not in the notes"], { tone: "neutral", minWords: 40, maxWords: 160 })),
  ],
});

const experience = defineTemplate("hr.experience", {
  title: "Experience Certificate",
  inputs: [
    employeeInput(),
    f.date("joining_date", "Date of joining", { bindings: ["employee.joining_date"] }),
    f.date("last_day", "Last working day"),
    f.text("designation_held", "Designation held at leaving", { bindings: ["employee.designation"] }),
    f.longtext("remark", "Remark on work or conduct", { required: false, help: "Only a factual remark the company is happy to stand behind. Leave blank for none." }),
  ],
  sections: [
    fixedSection("letter", "Certificate", [
      p("Date: {{date.today|date}}\nReference: {{doc.number||To be assigned on issue}}"),
      p("**TO WHOM IT MAY CONCERN**", "center"),
      p("This is to certify that **{{employee.name}}** (employee code {{employee.code}}) was employed with {{company.legal_name}} from {{input.joining_date|date}} to {{input.last_day|date}}, and last held the position of **{{input.designation_held}}** in the {{employee.department}} department."),
      whenSet("input.remark", [p("{{input.remark}}")]),
      p("We wish {{employee.first_name}} success in future endeavours."),
      ...companySignOff(),
    ]),
  ],
});

const relieving = defineTemplate("hr.relieving", {
  title: "Relieving Letter",
  inputs: [
    employeeInput(),
    f.date("resignation_date", "Date of resignation", { required: false }),
    f.date("last_day", "Date of relief"),
  ],
  sections: [
    fixedSection("letter", "Letter", [
      ...employeeLetterHead("Relieving letter"),
      whenSet("input.resignation_date", [p("With reference to your resignation dated {{input.resignation_date|date}}, this letter confirms that you stand relieved from your duties as {{employee.designation}} at {{company.legal_name}} with effect from the close of business on **{{input.last_day|date}}**.")]),
      when("input.resignation_date", "not_exists", undefined, [p("This letter confirms that you stand relieved from your duties as {{employee.designation}} at {{company.legal_name}} with effect from the close of business on **{{input.last_day|date}}**.")]),
      p("You have completed the handover and exit clearance formalities, and your full and final settlement is dealt with separately as per Company policy and applicable law. Your obligations of confidentiality continue as provided in your terms of appointment."),
      p("We thank you for your service and wish you success."),
      ...companySignOff(),
    ]),
  ],
});

const fnf = defineTemplate("hr.fnf", {
  title: "Full and Final Settlement Statement",
  layout: { header: "letterhead", footer: "confidential_page", titleAlign: "center" },
  inputs: [
    employeeInput(),
    f.date("last_day", "Last working day"),
    f.text("payroll_reference", "Payroll settlement reference", { required: false, help: "Reference of the payroll settlement run these figures come from." }),
    f.rows("earnings", "Amounts payable to the employee", [col("head", "Head"), col("amount", "Amount", "money")], { minRows: 1, maxRows: 20, help: "Take every figure from the payroll settlement. Do not compute them here." }),
    f.rows("deductions", "Deductions", [col("head", "Head"), col("amount", "Amount", "money")], { required: false, minRows: 0, maxRows: 20, help: "Take every figure from the payroll settlement, including statutory deductions." }),
    f.money("net_payable", "Net amount payable", { help: "As finalised by payroll." }),
    f.date("payment_date", "Date of payment", { required: false }),
  ],
  sections: [
    fixedSection("summary", "Summary", [kv([["Employee", "{{employee.name}}"], ["Employee code", "{{employee.code}}"], ["Designation", "{{employee.designation}}"], ["Date of joining", "{{employee.joining_date|date}}"], ["Last working day", "{{input.last_day|date}}"], ["Payroll reference", "{{input.payroll_reference|text|Not stated}}"]])]),
    fixedSection("earnings", "Amounts payable", [each("input.earnings", "item", [bullets(["{{item.head}}: {{item.amount|money}}"])])]),
    fixedSection("deductions", "Deductions", [whenSet("input.deductions", [each("input.deductions", "item", [bullets(["{{item.head}}: {{item.amount|money}}"])])]), when("input.deductions", "not_exists", undefined, [p("No deductions apply.")])]),
    fixedSection("net", "Net amount payable", [
      kv([["Net payable", "{{input.net_payable|money}}"], ["In words", "{{input.net_payable|words}}"], ["Date of payment", "{{input.payment_date|date|On the payment date advised by Finance}}"]]),
      p("The figures above are taken from the Company's payroll settlement and are subject to tax and statutory deductions as required by applicable law."),
    ]),
    lockedSection("acknowledgement", "Acknowledgement", [
      c1("I have received the amount stated above as full and final settlement of all my dues from {{company.legal_name}} up to the last working day, in respect of salary, leave, allowances and all other amounts, and I have no further claim against the Company for those dues."),
      c1("This acknowledgement does not affect the Company's continuing rights under my terms of appointment, including confidentiality and the return of Company property."),
      ...companySignOff(),
      ...acknowledgement("I acknowledge and accept the settlement.", "Employee"),
    ]),
  ],
});

const salaryCert = defineTemplate("hr.salary_cert", {
  title: "Salary Certificate",
  inputs: [
    employeeInput(),
    f.select("purpose", "Purpose", ["Bank loan", "Credit card", "Visa application", "Rental agreement", "Other"]),
    f.text("addressee", "Addressed to", { required: false, help: "Name of the bank or authority. Leave blank for 'To whom it may concern'." }),
    f.money("annual_ctc", "Annual CTC", { help: "From the current payroll record." }),
    f.money("monthly_gross", "Monthly gross salary", { required: false, help: "From the current payroll record." }),
  ],
  sections: [
    fixedSection("letter", "Certificate", [
      p("Date: {{date.today|date}}\nReference: {{doc.number||To be assigned on issue}}"),
      p("**{{input.addressee|text|TO WHOM IT MAY CONCERN}}**"),
      p("**Subject: Salary certificate for {{employee.name}}**"),
      p("This is to certify that **{{employee.name}}** (employee code {{employee.code}}) is employed with {{company.legal_name}} as **{{employee.designation}}** since {{employee.joining_date|date}}. According to our records, the annual cost to company is {{input.annual_ctc|money}} ({{input.annual_ctc|words}})."),
      whenSet("input.monthly_gross", [p("The monthly gross salary is {{input.monthly_gross|money}} ({{input.monthly_gross|words}}), before tax and other deductions required by law.")]),
      p("This certificate is issued at the request of the employee for the purpose of: {{input.purpose}}. It is issued without any liability on the Company, and does not guarantee future employment or pay."),
      ...companySignOff(),
    ]),
  ],
});

const verification = defineTemplate("hr.verification", {
  title: "Employment Verification",
  inputs: [
    employeeInput(),
    f.text("addressee", "Addressed to"),
    f.select("status", "Status", [{ value: "current", label: "Currently employed" }, { value: "former", label: "Former employee" }]),
    f.date("last_day", "Last working day", { required: false, showWhen: { key: "status", equals: "former" } }),
    f.yesno("include_designation", "State the designation held?", { defaultValue: "yes" }),
  ],
  sections: [
    fixedSection("letter", "Letter", [
      p("Date: {{date.today|date}}\nReference: {{doc.number||To be assigned on issue}}"),
      p("To,\n**{{input.addressee}}**"),
      p("**Subject: Verification of employment of {{employee.name}}**"),
      when("input.status", "eq", "current", [p("This is to confirm that {{employee.name}} (employee code {{employee.code}}) is employed with {{company.legal_name}} and has been since {{employee.joining_date|date}}.")]),
      when("input.status", "eq", "former", [p("This is to confirm that {{employee.name}} (employee code {{employee.code}}) was employed with {{company.legal_name}} from {{employee.joining_date|date}} to {{input.last_day|date}}.")]),
      whenYes("input.include_designation", [p("The position held was {{employee.designation}}.")]),
      p("This confirmation is given on the basis of the Company's records. The Company does not provide details of pay, performance or conduct unless the employee has consented in writing."),
      ...companySignOff(),
    ]),
  ],
});


export const HR_EXIT: TemplateDef[] = [resignationAccept, noticeWaiver, exitChecklist, exitInterview, experience, relieving, fnf, salaryCert, verification];
