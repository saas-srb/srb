/** T4 pre-sale documents (ps.proposal to ps.demo_plan). Prices and figures are inputs; the AI never states a result or capability that was not supplied. */
import { ai, aiSection, bullets, c1, col, f, fixedSection, hybridSection, kv, lockedSection, p, sig, whenSet, whenYes } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { docHeader, listRows, owner } from "@/lib/products/playbook-ai/catalogue/templates/t3-operations/common";
import { CONTRACT_LAYOUT, I, executionSection, lawSection, parties } from "@/lib/products/playbook-ai/catalogue/templates/t2-contracts/common";
import { companySignOff } from "@/lib/products/playbook-ai/catalogue/templates/t1-hr/common";
import { NEVER_COMMERCIAL, clientInput, letterHead } from "@/lib/products/playbook-ai/catalogue/templates/t4-vendor-presale-finance/common";

const PRESALE = { header: "compact", footer: "doc_number_page", titleAlign: "left" } as const;

const proposal = defineTemplate("ps.proposal", {
  title: "Proposal for {{client.name}}",
  layout: { header: "letterhead", footer: "doc_number_page", titleAlign: "center" },
  inputs: [clientInput(), f.date("valid_until", "Proposal valid until"),
    f.longtext("need_notes", "The client's need, in their words", { feedsSections: ["understanding", "summary"] }),
    f.longtext("solution_notes", "Our proposed solution", { feedsSections: ["solution", "summary"] }),
    f.rows("plan", "Delivery plan", [col("phase", "Phase"), col("duration", "Duration"), col("outcome", "Outcome")], { minRows: 1, maxRows: 15 }),
    f.rows("team", "Team", [col("name", "Name"), col("role", "Role")], { minRows: 1, maxRows: 20 }),
    f.rows("pricing", "Pricing", [col("item", "Item"), col("amount", "Amount", "money")], { minRows: 1, maxRows: 30 }), f.money("total", "Total (before tax)")],
  sections: [
    aiSection("summary", "Summary", [p("Prepared for **{{client.name}}** by {{company.legal_name}}, {{date.today|date}}."), p("[[input.summary_text|Summary|A short executive summary of the proposal]]")], ai("Write a short executive summary of the proposal from the client's need and our solution. Do not state any price or result.", ["company.name", "client.name", "input.need_notes", "input.solution_notes"], NEVER_COMMERCIAL, { minWords: 50, maxWords: 130 })),
    aiSection("understanding", "Our understanding", [p("[[input.understanding_text|Understanding|The client's situation and need]]")], ai("Restate the client's situation and need in the client's own terms, using only the notes.", ["client.name", "input.need_notes"], NEVER_COMMERCIAL, { minWords: 50, maxWords: 180 })),
    aiSection("solution", "Proposed solution", [p("[[input.solution_text|Solution|What we propose to deliver and how it meets the need]]")], ai("Describe the proposed solution and how it meets the need, using only the notes. Do not promise results or claim capabilities not in the notes.", ["client.name", "input.solution_notes"], NEVER_COMMERCIAL, { minWords: 60, maxWords: 250 })),
    fixedSection("plan", "Delivery plan", [listRows("input.plan", "**{{item.phase}}** ({{item.duration}}): {{item.outcome}}")]),
    fixedSection("team", "Team", [listRows("input.team", "**{{item.name}}**, {{item.role}}")]),
    fixedSection("pricing", "Pricing", [listRows("input.pricing", "{{item.item}}: {{item.amount|money}}"), kv([["Total, exclusive of taxes", "{{input.total|money}} ({{input.total|words}})"]])]),
    lockedSection("terms", "Terms", [
      c1("This proposal is valid until {{input.valid_until|date}}. Prices are exclusive of applicable taxes, which are charged in addition as the law requires."),
      c1("This proposal is confidential to {{client.name}} and is not an offer capable of acceptance by signature alone. The work will start under a written agreement or statement of work signed by both parties."),
      c1("The plan and prices rest on the information the client has given us. If the scope changes, we will tell you the effect on price and timetable before we proceed."),
    ]),
  ],
});

const quotation = defineTemplate("ps.quotation", {
  title: "Quotation",
  layout: { header: "letterhead", footer: "doc_number_page", titleAlign: "center" },
  inputs: [clientInput(), f.date("quote_date", "Quotation date"), f.date("valid_until", "Valid until"),
    f.rows("items", "Items", [col("description", "Description"), col("quantity", "Quantity", "number"), col("rate", "Rate", "money"), col("amount", "Amount", "money")], { minRows: 1, maxRows: 60, help: "From the price list or approved costing." }),
    f.money("subtotal", "Total before tax"), f.rows("taxes", "Taxes", [col("tax", "Tax"), col("rate", "Rate"), col("amount", "Amount", "money")], { required: false, minRows: 0, maxRows: 6, help: "From the tax calculation; never typed from memory." }),
    f.money("total", "Total"), f.longtext("terms_notes", "Delivery and payment terms", { help: "As the company has agreed to offer them." })],
  sections: [
    fixedSection("items", "Items", [p("Date: {{input.quote_date|date}}\nQuotation number: {{doc.number||To be assigned on issue}}"), p("To,\n**{{client.name}}**\n{{client.address}}\nGSTIN: {{client.gstin|upper|not provided}}"), listRows("input.items", "{{item.description}}: {{item.quantity|number}} at {{item.rate|money}} = {{item.amount|money}}")]),
    fixedSection("taxes", "Taxes and total", [kv([["Total before tax", "{{input.subtotal|money}}"]]), whenSet("input.taxes", [listRows("input.taxes", "{{item.tax}} ({{item.rate}}): {{item.amount|money}}")]), kv([["Total", "{{input.total|money}} ({{input.total|words}})"]])]),
    lockedSection("terms", "Terms", [c1("{{input.terms_notes}}"), c1("This quotation does not bind the Company until the client accepts it in writing within the validity period. Prices are firm for that period, and the Company may revise them after it."), c1("Goods and services are supplied on the Company's standard terms of supply, as provided to the client.")]),
    lockedSection("validity", "Validity and acceptance", [p("This quotation is valid until {{input.valid_until|date}}."), ...companySignOff(), sig("Accepted by the client", "counterparty")]),
  ],
});

const estimate = defineTemplate("ps.estimate", {
  title: "Estimate: {{input.title}}",
  layout: PRESALE,
  inputs: [clientInput(false), owner(), f.text("title", "What is being estimated"),
    f.longtext("scope_notes", "Scope being estimated", { feedsSections: ["scope"] }),
    f.rows("effort", "Effort", [col("task", "Task"), col("role", "Role"), col("hours", "Estimated hours", "number")], { minRows: 1, maxRows: 60 }), f.number("total_hours", "Total estimated hours", { min: 0, max: 1000000 }),
    f.longtext("assumption_notes", "Assumptions", { feedsSections: ["assumptions"] })],
  sections: [
    aiSection("scope", "Scope", [docHeader([["For", "{{client.name|text|Internal}}"], ["Estimate", "{{input.title}}"]]), p("[[input.scope_text|Scope|What the estimate covers]]")], ai("State what the estimate covers and does not cover, using only the notes.", ["input.title", "input.scope_notes"], NEVER_COMMERCIAL, { tone: "instructional", minWords: 25, maxWords: 130 })),
    fixedSection("effort", "Effort", [listRows("input.effort", "{{item.task}} ({{item.role}}): {{item.hours|number}} hours"), kv([["Total estimated effort", "{{input.total_hours|number}} hours"]])]),
    aiSection("assumptions", "Assumptions", [bullets(["[[input.assumption_list|Assumptions|What the estimate assumes]]"]), p("This is an estimate, not a fixed price or a commitment. It changes if the assumptions or scope change.")], ai("List the assumptions the estimate rests on as bullets, using only the notes.", ["input.assumption_notes"], NEVER_COMMERCIAL, { tone: "instructional", minWords: 15, maxWords: 130 })),
  ],
});

const pitch = defineTemplate("ps.pitch_outline", {
  title: "Pitch Outline: {{input.goal}}",
  layout: PRESALE,
  inputs: [owner(), f.text("audience", "Audience"), f.text("goal", "Goal of the pitch"), f.text("length", "Time available", { help: "For example 'twenty minutes with questions'." }),
    f.longtext("message_notes", "Key messages and proof you have", { feedsSections: ["outline"], help: "Only facts and results you can support." })],
  sections: [aiSection("outline", "Slide-by-slide outline", [docHeader([["Audience", "{{input.audience}}"], ["Goal", "{{input.goal}}"], ["Time", "{{input.length}}"]]), p("[[input.outline_text|Outline|Slide-by-slide outline]]")], ai("Propose a slide-by-slide outline as a numbered list. For each slide give a title, the one point it makes and the evidence to show, using only the messages supplied. Fit the time available.", ["company.name", "input.audience", "input.goal", "input.length", "input.message_notes"], [...NEVER_COMMERCIAL, "statistics, customer names or results not in the notes"], { tone: "instructional", minWords: 120, maxWords: 450 }))],
});

const capability = defineTemplate("ps.capability", {
  title: "Capability Statement: {{company.name}}",
  layout: { header: "letterhead", footer: "page_numbers", titleAlign: "center" },
  inputs: [f.longtext("overview_notes", "What the company does and for whom", { feedsSections: ["overview"] }),
    f.rows("services", "Services", [col("service", "Service"), col("description", "What it covers")], { minRows: 1, maxRows: 15 }),
    f.rows("credentials", "Credentials", [col("name", "Certification, registration or recognition"), col("detail", "Issuer or year", "text", false)], { required: false, minRows: 0, maxRows: 15, help: "Only credentials the company holds and can prove." }),
    f.text("contact_person", "Contact person", { required: false })],
  sections: [
    aiSection("overview", "Overview", [p("[[input.overview_text|Overview|What the company does and who it serves]]")], ai("Write a clear overview of what the company does and for whom, using only the notes.", ["company.name", "company.city", "input.overview_notes"], NEVER_COMMERCIAL, { minWords: 50, maxWords: 150 })),
    fixedSection("services", "Services", [listRows("input.services", "**{{item.service}}**: {{item.description}}")]),
    fixedSection("credentials", "Credentials", [whenSet("input.credentials", [listRows("input.credentials", "{{item.name}} {{item.detail|text}}")]), p("Registered name: {{company.legal_name}}. Registered office: {{company.address}}.")]),
    fixedSection("contact", "Contact", [kv([["Company", "{{company.legal_name}}"], ["Contact person", "{{input.contact_person|text|Business development team}}"], ["Email", "{{company.email}}"], ["Phone", "{{company.phone}}"], ["Website", "{{company.website}}"]])]),
  ],
});

const caseStudy = defineTemplate("ps.case_study", {
  title: "Case Study: {{input.client_name}}",
  layout: { header: "compact", footer: "page_numbers", titleAlign: "left" },
  inputs: [f.text("client_name", "Client name (as the client allows it to be shown)"), f.text("industry", "Client's field", { required: false }),
    f.yesno("approved", "Has the client approved publication of this case study?", { defaultValue: "no", help: "Do not publish a client's name, facts or results without its written approval." }),
    f.longtext("problem_notes", "The client's challenge", { feedsSections: ["challenge"] }), f.longtext("solution_notes", "What we did", { feedsSections: ["solution"] }),
    f.rows("results", "Results (approved by the client)", [col("measure", "Measure"), col("result", "Result")], { minRows: 1, maxRows: 10 })],
  sections: [
    aiSection("challenge", "The challenge", [p("[[input.challenge_text|Challenge|The client's problem]]")], ai("Describe the client's challenge using only the notes.", ["input.client_name", "input.industry", "input.problem_notes"], NEVER_COMMERCIAL, { minWords: 40, maxWords: 140 })),
    aiSection("solution", "Our solution", [p("[[input.solution_text|Solution|What the company did]]")], ai("Describe what the company did using only the notes.", ["input.client_name", "input.solution_notes"], NEVER_COMMERCIAL, { minWords: 50, maxWords: 180 })),
    fixedSection("results", "Results", [listRows("input.results", "**{{item.measure}}**: {{item.result}}"), whenYes("input.approved", [p("This case study is published with the written approval of {{input.client_name}}.")]), p("Results are as reported by the client and relate to this engagement only.")]),
  ],
});

const discovery = defineTemplate("ps.discovery", {
  title: "Discovery Notes: {{client.name}}",
  layout: PRESALE,
  inputs: [clientInput(), owner(), f.date("meeting_date", "Date of discovery"), f.longtext("attendees", "Who took part"),
    f.longtext("context_notes", "Context", { feedsSections: ["context"] }), f.longtext("need_notes", "Needs expressed", { feedsSections: ["needs"] }), f.longtext("constraint_notes", "Constraints", { feedsSections: ["constraints"] }),
    f.rows("next_steps", "Next steps", [col("step", "Step"), col("owner", "Owner"), col("due", "By", "date", false)], { minRows: 1, maxRows: 15 })],
  sections: [
    aiSection("context", "Context", [docHeader([["Client", "{{client.name}}"], ["Date", "{{input.meeting_date|date}}"], ["Present", "{{input.attendees}}"]]), p("[[input.context_text|Context|The client's business and situation]]")], ai("Summarise the client's business and situation from the notes.", ["client.name", "input.context_notes"], NEVER_COMMERCIAL, { tone: "neutral", minWords: 40, maxWords: 150 })),
    aiSection("needs", "Needs", [bullets(["[[input.need_list|Needs|What the client needs]]"])], ai("List the needs the client expressed as bullets, in their own terms, using only the notes.", ["input.need_notes"], NEVER_COMMERCIAL, { tone: "neutral", minWords: 20, maxWords: 150 })),
    aiSection("constraints", "Constraints", [p("[[input.constraint_text|Constraints|Budget, time, technology and other limits stated by the client]]")], ai("List the constraints the client stated, using only the notes. If none, write that none were stated.", ["input.constraint_notes"], NEVER_COMMERCIAL, { tone: "neutral", minWords: 5, maxWords: 110 })),
    fixedSection("next_steps", "Next steps", [listRows("input.next_steps", "{{item.step}} (owner: {{item.owner}}, by {{item.due|date|to be agreed}})")]),
  ],
});

const rfpResponse = defineTemplate("ps.rfp_response", {
  title: "Response to {{input.rfp_title}}",
  layout: { header: "letterhead", footer: "doc_number_page", titleAlign: "center" },
  inputs: [clientInput(), f.text("rfp_title", "Title of the RFP"), f.text("rfp_ref", "RFP reference"), f.date("submit_by", "Submission date"),
    f.longtext("cover_notes", "Points for the cover letter", { feedsSections: ["cover"] }),
    f.rows("answers", "Responses", [col("ref", "RFP clause or question"), col("requirement", "Requirement"), col("response", "Our response")], { minRows: 1, maxRows: 120 }),
    f.rows("pricing", "Pricing", [col("item", "Item"), col("amount", "Amount", "money")], { minRows: 1, maxRows: 30 }), f.money("total", "Total (before tax)"), f.number("validity_days", "Days the response remains valid", { min: 1, max: 365 })],
  sections: [
    aiSection("cover", "Cover letter", [p("Date: {{date.today|date}}\nTo: {{client.name}}\nReference: {{input.rfp_ref}}"), p("[[input.cover_text|Cover letter|A short cover letter]]")], ai("Write a short, formal cover letter submitting the response, using only the notes.", ["company.name", "client.name", "input.rfp_title", "input.cover_notes"], NEVER_COMMERCIAL, { minWords: 50, maxWords: 150 })),
    fixedSection("responses", "Responses", [listRows("input.answers", "**{{item.ref}}** {{item.requirement}}\nResponse: {{item.response}}")]),
    fixedSection("pricing", "Pricing", [listRows("input.pricing", "{{item.item}}: {{item.amount|money}}"), kv([["Total, exclusive of taxes", "{{input.total|money}} ({{input.total|words}})"]]), p("This response is valid for {{input.validity_days|number}} days from {{input.submit_by|date}}. Prices exclude applicable taxes, which are payable in addition as the law requires.")]),
  ],
});

const solutionBrief = defineTemplate("ps.solution_brief", {
  title: "Solution Brief: {{input.solution}}",
  layout: PRESALE,
  inputs: [clientInput(), owner(), f.text("solution", "Solution"),
    f.longtext("problem_notes", "The problem", { feedsSections: ["problem"] }), f.longtext("solution_notes", "How the solution works", { feedsSections: ["solution_body"] }), f.longtext("benefit_notes", "Benefits", { feedsSections: ["benefits"], help: "Only benefits you can support." })],
  sections: [
    aiSection("problem", "The problem", [docHeader([["Prepared for", "{{client.name}}"], ["Solution", "{{input.solution}}"]]), p("[[input.problem_text|Problem|The problem the solution addresses]]")], ai("Describe the problem using only the notes.", ["client.name", "input.problem_notes"], NEVER_COMMERCIAL, { minWords: 30, maxWords: 120 })),
    aiSection("solution_body", "The solution", [p("[[input.solution_text|Solution|How the solution works]]")], ai("Describe how the solution works using only the notes.", ["input.solution", "input.solution_notes"], NEVER_COMMERCIAL, { minWords: 50, maxWords: 200 })),
    aiSection("benefits", "Benefits", [bullets(["[[input.benefit_list|Benefits|Benefits to the client]]"])], ai("List the benefits as bullets, using only the notes. Do not state numbers.", ["input.benefit_notes"], NEVER_COMMERCIAL, { minWords: 20, maxWords: 130 })),
  ],
});

const followup = defineTemplate("ps.followup", {
  title: "Follow-up Letter",
  inputs: [clientInput(), f.text("contact", "Contact person at the client"), f.date("meeting_date", "Date of the meeting"), f.longtext("discussion_notes", "What was discussed", { feedsSections: ["letter"] }),
    f.rows("next_steps", "Agreed next steps", [col("step", "Step"), col("owner", "Owner"), col("by", "By", "date", false)], { minRows: 1, maxRows: 10 })],
  sections: [hybridSection("letter", "Letter", [
    ...letterHead("client", "Following our meeting on {{input.meeting_date|date}}", "{{input.contact}}"),
    p("Thank you for meeting us on {{input.meeting_date|date}}. [[input.followup_text|Summary|A short recap of what was discussed]]"),
    p("As agreed, the next steps are:"), listRows("input.next_steps", "{{item.step}} (owner: {{item.owner}}, by {{item.by|date|to be agreed}})"),
    p("Please let me know if I have recorded anything incorrectly. We look forward to working with you."), p("Regards,\n{{company.signatory_name}}\n{{company.signatory_designation}}\n{{company.legal_name}}"),
  ], ai("Recap what was discussed in two or three sentences, using only the notes. Do not make new commitments.", ["client.name", "input.discussion_notes"], NEVER_COMMERCIAL, { tone: "warm", minWords: 25, maxWords: 90 }))],
});

const loi = defineTemplate("ps.loi", {
  title: "Letter of Intent",
  layout: CONTRACT_LAYOUT,
  inputs: [clientInput(), I.effective(), f.text("subject", "Subject of the intended arrangement"),
    f.longtext("intent_notes", "What the parties intend", { feedsSections: ["intent"] }),
    f.rows("next_steps", "Next steps", [col("step", "Step"), col("owner", "Owner"), col("by", "By", "date", false)], { minRows: 1, maxRows: 10 }),
    f.date("expires_on", "This letter lapses on"), I.city(), I.stamp(), I.witnesses()],
  sections: [
    lockedSection("parties", "Parties", parties("client", "Other Party", "This letter of intent (the \"Letter\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:")),
    hybridSection("intent", "Intent", [c1("**Subject.** {{input.subject}}."), c1("**Intent.** The parties record their present intentions: [[input.intent_text|Intent|What the parties intend to do]]")], ai("State what the parties intend, in clear neutral language, using only the notes. Use 'intend' and never 'shall'.", ["client.name", "input.subject", "input.intent_notes"], [...NEVER_COMMERCIAL, "binding obligations, prices or exclusivity"], { minWords: 30, maxWords: 150 })),
    lockedSection("nonbinding", "Non-binding nature", [
      c1("This Letter records intentions only. Except for the clauses on confidentiality, governing law and disputes, and costs, it creates no legally binding obligation, and neither party is bound to enter into any agreement."),
      c1("A binding commitment, including on price, exclusivity or intellectual property, will arise only from a definitive written agreement signed by both parties."),
      c1("Each party bears its own costs. Information shared in connection with this Letter is confidential and shall be used only to consider the arrangement."),
      c1("This Letter lapses on {{input.expires_on|date}} unless the parties extend it in writing, and either party may end discussions at any time. Stamp duty, if payable, shall be borne by {{input.stamp_borne_by}}."),
    ]),
    fixedSection("next_steps", "Next steps", [listRows("input.next_steps", "{{item.step}} (owner: {{item.owner}}, by {{item.by|date|to be agreed}})")]),
    lawSection(), executionSection("Other Party"),
  ],
});

const demoPlan = defineTemplate("ps.demo_plan", {
  title: "Demo Plan: {{client.name}}",
  layout: PRESALE,
  inputs: [clientInput(), owner(), f.date("demo_date", "Demo date"), f.text("duration", "Duration"), f.longtext("attendees", "Who will attend"),
    f.longtext("goal_notes", "Goals of the demo", { feedsSections: ["goals"] }),
    f.rows("scenarios", "Scenarios", [col("scenario", "Scenario"), col("steps", "What will be shown"), col("expected", "What the client should see")], { minRows: 1, maxRows: 15 }),
    f.longtext("success_notes", "How success is judged", { feedsSections: ["success"] })],
  sections: [
    aiSection("goals", "Goals", [docHeader([["Client", "{{client.name}}"], ["Date", "{{input.demo_date|date}}"], ["Duration", "{{input.duration}}"], ["Attendees", "{{input.attendees}}"]]), p("[[input.goals_text|Goals|What the demo is meant to show]]")], ai("State the goals of the demo, using only the notes.", ["client.name", "input.goal_notes"], NEVER_COMMERCIAL, { tone: "instructional", minWords: 20, maxWords: 100 })),
    fixedSection("scenarios", "Scenarios", [listRows("input.scenarios", "**{{item.scenario}}**: {{item.steps}}. Expected: {{item.expected}}")]),
    aiSection("success", "Success criteria", [p("[[input.success_text|Success|How the client will judge the demo]]")], ai("State how success will be judged, using only the notes.", ["input.success_notes"], NEVER_COMMERCIAL, { tone: "instructional", minWords: 20, maxWords: 100 })),
  ],
});

export const PS_DOCS: TemplateDef[] = [proposal, quotation, estimate, pitch, capability, caseStudy, discovery, rfpResponse, solutionBrief, followup, loi, demoPlan];
