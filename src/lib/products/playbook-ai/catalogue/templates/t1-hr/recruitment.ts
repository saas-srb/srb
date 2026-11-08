/** T1 HR lifecycle, part 1: recruitment (hr.jd to hr.offer_regret). */
import { ai, aiSection, bullets, c1, col, each, f, fixedSection, hybridSection, kv, lockedSection, NEVER_HR, p, sig, whenSet, whenYes, FORM_LAYOUT, POLICY_LAYOUT } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { acknowledgement, candidateInput, candidateLetterHead, companySignOff } from "@/lib/products/playbook-ai/catalogue/templates/t1-hr/common";

const EMPLOYMENT_TYPES = ["Full time", "Part time", "Contract", "Internship"];

const jd = defineTemplate("hr.jd", {
  title: "Job Description: {{input.role}}",
  layout: POLICY_LAYOUT,
  inputs: [
    f.text("role", "Role title"),
    f.text("department", "Department"),
    f.select("level", "Level", ["Entry level", "Associate", "Senior", "Lead", "Manager", "Senior manager", "Director"]),
    f.text("location", "Location", { help: "City, or 'Remote' where the role can be done remotely." }),
    f.select("employment_type", "Employment type", EMPLOYMENT_TYPES, { required: false }),
    f.text("reporting_to", "Reports to", { required: false, help: "Designation of the manager this role reports to." }),
    f.longtext("responsibility_notes", "Main responsibilities", { help: "Rough points are enough; the draft turns them into clear duties.", feedsSections: ["responsibilities"] }),
    f.longtext("qualification_notes", "Qualifications and experience required", { feedsSections: ["qualifications"] }),
    f.longtext("skill_notes", "Skills required", { required: false, feedsSections: ["skills"] }),
    f.text("compensation_range", "Compensation range to show", { required: false, help: "Enter it exactly as it should read, for example the band name. Leave blank to omit the section." }),
  ],
  sections: [
    aiSection("summary", "Role summary", [p("The {{input.role}} role sits in the {{input.department}} team at {{company.name}} and is based in {{input.location}}. [[input.role_summary|Role summary|Two or three sentences on why the role exists]]")],
      ai("Write a short summary of why this role exists and what it delivers to its department.", ["company.name", "input.role", "input.department", "input.level", "input.location", "input.responsibility_notes"], NEVER_HR, { minWords: 40, maxWords: 90 })),
    aiSection("responsibilities", "Key responsibilities", [bullets(["[[input.responsibility_notes|Responsibilities|List the main duties]]"])],
      ai("Turn the supplied points into a clear bulleted list of duties, each starting with a verb.", ["input.role", "input.responsibility_notes"], [...NEVER_HR, "duties that are not in the supplied points"], { tone: "instructional", minWords: 60, maxWords: 220 })),
    aiSection("qualifications", "Qualifications and experience", [bullets(["[[input.qualification_notes|Qualifications|Education and experience needed]]"])],
      ai("List the education and experience required, as a bulleted list, using only what was supplied.", ["input.role", "input.level", "input.qualification_notes"], [...NEVER_HR, "degrees, certifications or years of experience that were not supplied"], { tone: "instructional", minWords: 30, maxWords: 140 })),
    aiSection("skills", "Skills and competencies", [bullets(["[[input.skill_notes|Skills|Skills and tools needed]]"])],
      ai("List the technical and behavioural skills for the role, as a bulleted list, using only what was supplied.", ["input.role", "input.skill_notes"], [...NEVER_HR, "tools or technologies that were not supplied"], { tone: "instructional", minWords: 30, maxWords: 140 })),
    fixedSection("reporting", "Reporting and working conditions", [
      kv([["Reports to", "{{input.reporting_to|text|As assigned by the department head}}"], ["Level", "{{input.level}}"], ["Location", "{{input.location}}"], ["Employment type", "{{input.employment_type|text|As stated in the offer}}"]]),
    ]),
    fixedSection("compensation", "Compensation range", [
      whenSet("input.compensation_range", [p("The compensation for this role falls in: {{input.compensation_range}}. The exact offer depends on experience, skills and internal parity, and is stated in the offer letter.")]),
    ]),
  ],
});

const mrf = defineTemplate("hr.mrf", {
  title: "Manpower Requisition Form",
  layout: FORM_LAYOUT,
  inputs: [
    f.text("role", "Role to be hired"),
    f.text("department", "Department"),
    f.number("headcount", "Number of positions", { min: 1, max: 500 }),
    f.select("employment_type", "Employment type", EMPLOYMENT_TYPES),
    f.select("hire_type", "Hire type", ["New position", "Replacement", "Backfill for leave"]),
    f.date("needed_by", "Needed by", { required: false }),
    f.longtext("justification_notes", "Why this hire is needed", { feedsSections: ["justification"] }),
    f.money("budget", "Annual budget per position", { help: "Total annual cost the budget owner has approved for one position." }),
    f.text("cost_centre", "Cost centre or budget head", { required: false }),
  ],
  sections: [
    fixedSection("request", "Request", [kv([["Date", "{{date.today|date}}"], ["Role", "{{input.role}}"], ["Department", "{{input.department}}"], ["Number of positions", "{{input.headcount|number}}"], ["Employment type", "{{input.employment_type}}"], ["Hire type", "{{input.hire_type}}"], ["Needed by", "{{input.needed_by|date|As soon as possible}}"]])]),
    aiSection("justification", "Justification", [p("[[input.justification_notes|Justification|Business reason for the hire]]")],
      ai("Write a short, factual business justification for this hire from the notes supplied.", ["input.role", "input.department", "input.headcount", "input.hire_type", "input.justification_notes"], [...NEVER_HR, "workload figures, revenue or attrition data not supplied"], { minWords: 40, maxWords: 140 })),
    fixedSection("budget", "Budget", [kv([["Budget per position (annual)", "{{input.budget|money}}"], ["In words", "{{input.budget|words}}"], ["Cost centre", "{{input.cost_centre|text|Not specified}}"]])]),
    fixedSection("approvals", "Approvals", [
      p("This requisition is valid only when approved by the persons below."),
      sig("Requesting manager", "company_signatory"),
      sig("Human Resources", "approver"),
      sig("Budget owner or Finance", "approver"),
    ]),
  ],
});

const jobPost = defineTemplate("hr.job_post", {
  title: "Hiring: {{input.role}}",
  layout: { header: "compact", footer: "page_numbers", titleAlign: "left" },
  inputs: [
    f.text("role", "Role title"),
    f.text("location", "Location"),
    f.date("apply_by", "Apply by"),
    f.select("employment_type", "Employment type", EMPLOYMENT_TYPES, { required: false }),
    f.text("experience", "Experience required", { required: false, help: "As it should read, for example 'Freshers welcome' or the range your team expects." }),
    f.longtext("responsibility_notes", "What the person will do", { feedsSections: ["role"] }),
    f.longtext("requirement_notes", "What we are looking for", { feedsSections: ["requirements"] }),
    f.text("apply_email", "Where to send applications", { bindings: ["company.email"], help: "Email address that receives applications." }),
  ],
  sections: [
    aiSection("about", "About us", [p("{{company.name}} is hiring. [[input.about_company|About the company|Two sentences about what the company does]]")],
      ai("Introduce the company in two or three sentences using only the company facts given.", ["company.name", "company.website", "company.city"], [...NEVER_HR, "company size, funding, awards, client names or years in business"], { tone: "warm", minWords: 25, maxWords: 70 })),
    aiSection("role", "The role", [p("We are looking for a {{input.role}} to join us in {{input.location}}."), bullets(["[[input.responsibility_notes|Responsibilities|What the person will do]]"])],
      ai("Describe the role and its duties from the notes, as a short introduction and a bulleted list.", ["input.role", "input.location", "input.employment_type", "input.responsibility_notes"], NEVER_HR, { tone: "warm", minWords: 50, maxWords: 180 })),
    aiSection("requirements", "Requirements", [bullets(["[[input.requirement_notes|Requirements|Skills and experience wanted]]"]), p("Experience: {{input.experience|text|As described above}}")],
      ai("List the requirements as bullets from the notes supplied.", ["input.role", "input.experience", "input.requirement_notes"], [...NEVER_HR, "benefits, salary or perks"], { tone: "instructional", minWords: 30, maxWords: 140 })),
    fixedSection("apply", "How to apply", [
      p("Send your resume to {{input.apply_email}} with the subject line \"{{input.role}}\" on or before {{input.apply_by|date}}."),
      p("{{company.name}} considers every application on merit and does not discriminate on the basis of gender, religion, caste, disability or any other protected ground."),
    ]),
  ],
});

const scorecard = defineTemplate("hr.interview_scorecard", {
  title: "Interview Scorecard",
  layout: FORM_LAYOUT,
  inputs: [
    candidateInput(),
    f.text("role", "Role interviewed for"),
    f.date("interview_date", "Interview date"),
    f.text("interviewer", "Interviewer name"),
    f.select("round", "Round", ["Screening", "Technical", "Managerial", "HR", "Final"]),
    f.rows("criteria", "Evaluation criteria", [col("criterion", "Criterion"), col("guidance", "What good looks like", "text", false)], { minRows: 2, maxRows: 15, help: "One row for each skill or trait you will assess." }),
  ],
  sections: [
    fixedSection("candidate", "Candidate", [kv([["Candidate", "{{candidate.name}}"], ["Role", "{{input.role}}"], ["Round", "{{input.round}}"], ["Interview date", "{{input.interview_date|date}}"], ["Interviewer", "{{input.interviewer}}"]])]),
    fixedSection("criteria_table", "Criteria", [
      p("Rate each criterion as Strong, Adequate, Weak or Not observed, and record the evidence you saw."),
      each("input.criteria", "item", [p("**{{item.criterion}}**\nWhat good looks like: {{item.guidance|text|Interviewer's judgement}}\nRating: ______________    Evidence: ________________________________")]),
    ]),
    fixedSection("recommendation", "Recommendation", [
      p("Overall recommendation (tick one): Hire / Hold / Do not hire"),
      p("Key strengths: ________________________________________________\nConcerns: ____________________________________________________\nInterviewer: {{input.interviewer}}\nDate: {{input.interview_date|date}}"),
    ]),
  ],
});

const invite = defineTemplate("hr.interview_invite", {
  title: "Interview Invitation",
  inputs: [
    candidateInput(),
    f.text("role", "Role"),
    f.date("interview_date", "Interview date"),
    f.text("interview_time", "Time", { help: "For example '10:30 AM'." }),
    f.select("mode", "Mode", ["In person", "Video call", "Phone call"]),
    f.text("venue", "Venue address", { showWhen: { key: "mode", equals: "In person" }, required: false }),
    f.text("meeting_link", "Meeting link", { showWhen: { key: "mode", equals: "Video call" }, required: false }),
    f.longtext("panel", "Interview panel", { help: "Names and designations of the interviewers." }),
    f.longtext("documents", "Documents to bring", { required: false, help: "Leave blank for the standard list." }),
    f.text("contact_person", "Contact person"),
    f.text("contact_phone", "Contact phone or email"),
  ],
  sections: [
    fixedSection("opening", "Invitation", [
      ...candidateLetterHead("Invitation for interview: {{input.role}}"),
      p("Thank you for your interest in the position of {{input.role}} at {{company.name}}. We are pleased to invite you for an interview as per the details below."),
    ]),
    fixedSection("details", "Interview details", [
      kv([["Date", "{{input.interview_date|date}}"], ["Time", "{{input.interview_time}}"], ["Mode", "{{input.mode}}"], ["Panel", "{{input.panel}}"]]),
      whenSet("input.venue", [p("**Venue:** {{input.venue}}")]),
      whenSet("input.meeting_link", [p("**Meeting link:** {{input.meeting_link}}")]),
    ]),
    fixedSection("documents", "Documents to bring", [
      whenSet("input.documents", [p("Please carry the following:"), p("{{input.documents}}")]),
      p("Please also carry a photo identity proof, an updated resume and, if you are employed, be ready to discuss your notice period. If you cannot attend, kindly tell us as early as possible so that we can reschedule."),
    ]),
    fixedSection("contact", "Contact", [p("For any question, contact {{input.contact_person}} at {{input.contact_phone}}."), p("We look forward to meeting you."), p("Regards,\n{{company.signatory_name}}\n{{company.signatory_designation}}\n{{company.legal_name}}")]),
  ],
});

const offer = defineTemplate("hr.offer", {
  title: "Offer of Employment",
  layout: { header: "letterhead", footer: "doc_number_page", titleAlign: "center", pageBreakBefore: ["acceptance"] },
  inputs: [
    candidateInput(),
    f.text("designation", "Designation offered"),
    f.text("department", "Department"),
    f.text("location", "Work location"),
    f.text("reporting_manager", "Reports to", { required: false }),
    f.money("annual_ctc", "Annual cost to company (CTC)", { help: "Gross annual CTC offered. Break-up and statutory deductions follow the company's payroll policy." }),
    f.rows("components", "Compensation components", [col("name", "Component"), col("annual_amount", "Annual amount", "money")], { required: false, minRows: 0, help: "Optional break-up. The total should equal the CTC." }),
    f.date("joining_date", "Date of joining"),
    f.date("valid_until", "Offer valid until"),
    f.number("probation_months", "Probation (months)", { min: 0, max: 24, help: "Use the company's probation policy." }),
    f.number("notice_days", "Notice period after confirmation (days)", { min: 0, max: 365, help: "Use the company's policy. Do not enter a figure the company has not adopted." }),
    f.longtext("welcome_notes", "Anything to add in the welcome note", { required: false, feedsSections: ["offer"] }),
  ],
  sections: [
    hybridSection("offer", "Offer", [
      p("Date: {{date.today|date}}\nReference: {{doc.number||To be assigned on issue}}"),
      p("To,\n**{{candidate.name}}**\n{{candidate.email}}"),
      p("**Subject: Offer of employment as {{input.designation}}**"),
      p("Dear {{candidate.name}},"),
      p("Further to your interviews, we are pleased to offer you the position of **{{input.designation}}** in the {{input.department}} department of {{company.legal_name}} (the \"Company\"), based at {{input.location}}. You will report to {{input.reporting_manager|text|the manager named at joining}}. Your proposed date of joining is {{input.joining_date|date}}."),
      p("[[input.welcome_paragraph|Welcome note|One or two warm sentences welcoming the candidate]]"),
    ], ai("Write one or two warm, professional sentences welcoming the candidate to the team. Do not repeat the terms of the offer.", ["candidate.name", "company.name", "input.designation", "input.department", "input.welcome_notes"], [...NEVER_HR, "promises about growth, promotion, bonus, benefits or job security"], { tone: "warm", minWords: 20, maxWords: 60 })),
    fixedSection("compensation", "Compensation", [
      p("Your annual cost to company (CTC) will be **{{input.annual_ctc|money}}** ({{input.annual_ctc|words}}), subject to deduction of tax at source and other deductions required by law."),
      whenSet("input.components", [p("The break-up of your annual CTC is:"), each("input.components", "item", [bullets(["{{item.name}}: {{item.annual_amount|money}}"])])]),
      p("Your salary will be paid as per the Company's payroll cycle. Statutory contributions and benefits will apply as per applicable law and Company policy."),
    ]),
    lockedSection("conditions", "Conditions of the offer", [
      c1("This offer is conditional on satisfactory verification of your educational, employment and identity documents and, where you have consented, a background verification."),
      c1("You will be on probation for {{input.probation_months|number}} months from the date of joining. After confirmation in writing, either party may end the employment by giving {{input.notice_days|number}} days' notice or salary in lieu, as set out in your appointment letter."),
      c1("You confirm that you are not bound by any agreement, notice period or restriction that prevents you from joining and working for the Company, and that the information you gave us is true and complete. Any misstatement may lead to withdrawal of this offer or termination of employment."),
      c1("Your detailed terms of employment will be set out in your appointment letter, which will be issued on joining and will prevail over this offer letter."),
      c1("This offer will lapse if it is not accepted by {{input.valid_until|date}}."),
    ]),
    lockedSection("acceptance", "Acceptance", [
      ...companySignOff(),
      ...acknowledgement("I have read and understood this offer and I accept it on the terms stated. I will join on {{input.joining_date|date}}.", "Accepted by the Candidate"),
    ]),
  ],
});

const regret = defineTemplate("hr.offer_regret", {
  title: "Application Update",
  inputs: [
    candidateInput(),
    f.text("role", "Role applied for"),
    f.yesno("keep_on_file", "Keep the resume on file for future roles?", { defaultValue: "yes" }),
    f.longtext("note", "Anything specific you want to say", { required: false, help: "For example thanks for time spent on a long process. Do not give detailed reasons for rejection.", feedsSections: ["letter"] }),
  ],
  sections: [
    hybridSection("letter", "Letter", [
      ...candidateLetterHead("Your application for {{input.role}}"),
      p("Thank you for your interest in the position of {{input.role}} at {{company.name}} and for the time you spent with us during the selection process."),
      p("[[input.regret_paragraph|Regret paragraph|A kind, short message that the Company will not move forward]]"),
      whenYes("input.keep_on_file", [p("With your permission, we will keep your resume on file and may contact you if a suitable role opens. If you would rather we delete it, please write to us and we will do so.")]),
      p("We wish you every success in your career."),
      p("Regards,\n{{company.signatory_name}}\n{{company.signatory_designation}}\n{{company.legal_name}}"),
    ], ai("Write two or three kind sentences telling the candidate the Company will not be taking the application forward at this time. Be courteous and brief.", ["candidate.name", "company.name", "input.role", "input.note"], [...NEVER_HR, "reasons for rejection, comparisons with other candidates, feedback on performance or any promise of future employment"], { tone: "warm", minWords: 25, maxWords: 70 })),
  ],
});

export const HR_RECRUITMENT: TemplateDef[] = [jd, mrf, jobPost, scorecard, invite, offer, regret];
