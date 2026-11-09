/** T3 management, part 2: governance, planning and communication (mg.board_resolution to mg.org_chart). */
import { ai, aiSection, bullets, c1, col, f, fixedSection, hybridSection, kv, lockedSection, p, whenSet } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { DOC_LAYOUT, LETTER_LAYOUT_T3, NEVER_BIZ, approvals, docHeader, listRows, owner } from "@/lib/products/playbook-ai/catalogue/templates/t3-operations/common";

const resolution = defineTemplate("mg.board_resolution", {
  title: "Resolution of the Board of Directors",
  layout: { header: "letterhead", footer: "doc_number_page", titleAlign: "center" },
  inputs: [
    f.text("subject", "Subject of the resolution"),
    f.date("meeting_date", "Date of the meeting or circulation"),
    f.select("form", "How it is passed", ["At a meeting of the Board of Directors", "By circulation"]),
    f.text("venue", "Venue of the meeting", { required: false, showWhen: { key: "form", equals: "At a meeting of the Board of Directors" } }),
    f.rows("directors", "Directors present or signing", [col("name", "Name"), col("designation", "Designation", "text", false)], { minRows: 1, maxRows: 20 }),
    f.longtext("resolution_notes", "What is being resolved", { help: "State the decision exactly: what, from whom or to whom, on what terms.", feedsSections: ["resolution"] }),
    f.text("authorised_person", "Person authorised to act"), f.text("authorised_designation", "Designation of that person"),
  ],
  sections: [
    lockedSection("preamble", "Preamble", [
      p("Resolution of the Board of Directors of **{{company.legal_name}}** (the \"Company\"), having its registered office at {{company.address}}, on the subject: **{{input.subject}}**, passed {{input.form}} on {{input.meeting_date|date}}."),
      whenSet("input.venue", [p("Venue: {{input.venue}}.")]),
      p("Directors present or signing:"), listRows("input.directors", "{{item.name}}, {{item.designation|text|Director}}"),
      p("The Chairperson informed the Board of the matter and, the Directors having considered it and having disclosed any interest they have in it, the following resolution was passed in accordance with the Companies Act, 2013, the rules made under it and the Company's Articles of Association."),
    ]),
    hybridSection("resolution", "Resolution", [
      p("**RESOLVED THAT** [[input.resolution_text|Resolution|The decision, stated precisely]]"),
    ], ai("Draft the operative resolution, starting after 'RESOLVED THAT', stating the decision precisely and only as given in the notes. Use a numbered list for several items.", ["company.name", "input.subject", "input.resolution_notes"], [...NEVER_BIZ, "amounts, approvals, statutory sections or thresholds that were not stated in the notes"], { tone: "formal", minWords: 30, maxWords: 200 })),
    lockedSection("authorisation", "Authorisation", [
      p("**RESOLVED FURTHER THAT** {{input.authorised_person}}, {{input.authorised_designation}} of the Company, be and is hereby authorised to do all such acts, deeds and things, to sign and execute all such documents, and to make all filings and intimations, as may be necessary or expedient to give effect to this resolution, and to delegate any of these powers to any person as the law permits."),
      p("**RESOLVED FURTHER THAT** a copy of this resolution, certified by a director or the company secretary, may be given to any person who asks for it."),
      ...approvals("Chairperson", "Director"),
    ]),
  ],
});

const raci = defineTemplate("mg.raci", {
  title: "RACI Matrix",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("scope", "Project or process covered"),
    f.rows("activities", "Activities", [col("activity", "Activity"), col("responsible", "Responsible"), col("accountable", "Accountable"), col("consulted", "Consulted", "text", false), col("informed", "Informed", "text", false)], { minRows: 1, maxRows: 60 })],
  sections: [
    fixedSection("matrix", "Matrix", [docHeader([["Covers", "{{input.scope}}"]]), listRows("input.activities", "**{{item.activity}}**: responsible {{item.responsible}}; accountable {{item.accountable}}; consulted {{item.consulted|text|none}}; informed {{item.informed|text|none}}")]),
    fixedSection("legend", "How to read it", [bullets(["**Responsible**: does the work.", "**Accountable**: answers for the result and has the final say; there is one accountable person for each activity.", "**Consulted**: gives input before the work is finished.", "**Informed**: is told of the result."])]),
  ],
});

const riskRegister = defineTemplate("mg.risk_register", {
  title: "Risk Register: {{input.project_name}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("project_name", "Project or area"), f.date("review_date", "Last reviewed"),
    f.rows("risks", "Risks", [col("risk", "Risk"), col("likelihood", "Likelihood (low, medium, high)"), col("impact", "Impact (low, medium, high)"), col("owner", "Risk owner"), col("mitigation", "Mitigation"), col("contingency", "Contingency plan", "text", false)], { minRows: 1, maxRows: 60 })],
  sections: [
    fixedSection("risk_table", "Risk table", [docHeader([["Project or area", "{{input.project_name}}"], ["Last reviewed", "{{input.review_date|date}}"]]), listRows("input.risks", "**{{item.risk}}**: likelihood {{item.likelihood}}, impact {{item.impact}}, owner {{item.owner}}")]),
    fixedSection("mitigation", "Mitigation", [listRows("input.risks", "**{{item.risk}}**: {{item.mitigation}}. Contingency: {{item.contingency|text|none defined}}"), p("Each owner reviews their risks regularly, updates likelihood and impact, and tells the document owner when a risk occurs or is closed.")]),
  ],
});

const changeRequest = defineTemplate("mg.change_request", {
  title: "Change Request: {{input.project_name}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("project_name", "Project"), f.person("client", "Client", "client", { required: false }), f.text("reference", "Change reference", { required: false }),
    f.longtext("change_notes", "The change requested", { feedsSections: ["change"] }), f.text("requested_by", "Requested by"),
    f.longtext("impact_notes", "Impact on scope, quality and risk", { feedsSections: ["impact"] }),
    f.money("cost_impact", "Cost impact", { required: false }), f.text("schedule_impact", "Schedule impact", { help: "For example 'adds two weeks' or 'none'." })],
  sections: [
    hybridSection("change", "Change", [docHeader([["Project", "{{input.project_name}}"], ["Client", "{{client.name|text|Internal}}"], ["Change reference", "{{input.reference|text|Not numbered}}"], ["Requested by", "{{input.requested_by}}"]]), p("[[input.change_text|Change|What is being changed and why]]")],
      ai("Describe the requested change and the reason, precisely, using only the notes.", ["input.project_name", "input.change_notes"], NEVER_BIZ, { minWords: 30, maxWords: 150 })),
    hybridSection("impact", "Impact", [kv([["Cost impact", "{{input.cost_impact|money|None stated}}"], ["Schedule impact", "{{input.schedule_impact}}"]]), p("[[input.impact_text|Impact|Effect on scope, quality, risk]]")],
      ai("Describe the impact on scope, quality and risk, using only the notes.", ["input.impact_notes", "input.schedule_impact"], NEVER_BIZ, { minWords: 25, maxWords: 140 })),
    lockedSection("approval", "Approval", [p("The change is not authorised, and work on it does not start, until it is approved below. Approval of this request changes the project's scope, cost and schedule only as stated here."), ...approvals("For the Company", "For the Client or sponsor")]),
  ],
});

const postmortem = defineTemplate("mg.postmortem", {
  title: "Incident Review: {{input.incident}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("incident", "Incident"), f.date("incident_date", "Date of the incident"), f.text("duration", "Duration"),
    f.longtext("impact_notes", "Impact", { feedsSections: ["summary"] }),
    f.rows("timeline", "Timeline", [col("time", "Time"), col("event", "What happened")], { minRows: 1, maxRows: 50 }),
    f.longtext("cause_notes", "Causes found", { feedsSections: ["root_cause"] }),
    f.rows("actions", "Corrective actions", [col("action", "Action"), col("owner", "Owner"), col("due", "Due date", "date", false)], { minRows: 1, maxRows: 20 })],
  sections: [
    aiSection("summary", "Summary", [docHeader([["Incident", "{{input.incident}}"], ["Date", "{{input.incident_date|date}}"], ["Duration", "{{input.duration}}"]]), p("[[input.summary_text|Summary|What happened and who or what was affected]]")], ai("Summarise what happened and its impact in a short paragraph, without blame, using only the notes.", ["input.incident", "input.impact_notes"], [...NEVER_BIZ, "blame or the names of individuals at fault"], { tone: "neutral", minWords: 40, maxWords: 150 })),
    fixedSection("timeline", "Timeline", [listRows("input.timeline", "{{item.time}}: {{item.event}}")]),
    aiSection("root_cause", "Root cause", [p("[[input.cause_text|Root cause|The causes and contributing factors]]")], ai("Explain the root cause and contributing factors without blame, using only the notes.", ["input.cause_notes"], [...NEVER_BIZ, "causes that were not stated"], { tone: "neutral", minWords: 40, maxWords: 180 })),
    fixedSection("actions", "Actions", [listRows("input.actions", "{{item.action}} (owner: {{item.owner}}, due {{item.due|date|as agreed}})"), p("This review looks for how the system failed, not who failed. Owners report progress on each action until it is closed.")]),
  ],
});

const businessPlan = defineTemplate("mg.business_plan", {
  title: "Business Plan: {{company.name}}",
  layout: { header: "compact", footer: "confidential_page", titleAlign: "center" },
  inputs: [owner(),
    f.longtext("vision_notes", "Vision and offer", { feedsSections: ["summary"] }), f.longtext("market_notes", "Market and customers", { feedsSections: ["market"], help: "Only facts you can support. Do not include market figures you cannot source." }),
    f.longtext("strategy_notes", "Strategy and how you will win", { feedsSections: ["strategy"] }), f.longtext("operations_notes", "Operations and team", { feedsSections: ["operations"] }),
    f.rows("financials", "Financial plan", [col("line", "Line item"), col("period", "Period"), col("amount", "Amount", "money")], { minRows: 1, maxRows: 40, help: "Your own forecasts and actuals, exactly as they come from your financial model." }),
    f.longtext("financial_notes", "Assumptions behind the numbers", { feedsSections: ["financials"] })],
  sections: [
    aiSection("summary", "Executive summary", [docHeader(), p("[[input.summary_text|Summary|What the company does and where it is going]]")], ai("Write a clear executive summary using only the notes supplied.", ["company.name", "company.city", "input.vision_notes"], NEVER_BIZ, { tone: "formal", minWords: 80, maxWords: 220 })),
    aiSection("market", "Market", [p("[[input.market_text|Market|Customers, need and competition]]")], ai("Describe the market and customers using only the notes. Do not state market sizes or growth rates.", ["input.market_notes"], [...NEVER_BIZ, "market sizes, growth rates or named competitors"], { minWords: 60, maxWords: 220 })),
    aiSection("strategy", "Strategy", [p("[[input.strategy_text|Strategy|How the business will compete and grow]]")], ai("Describe the strategy using only the notes.", ["input.strategy_notes"], NEVER_BIZ, { minWords: 60, maxWords: 220 })),
    aiSection("operations", "Operations", [p("[[input.operations_text|Operations|How the business runs, and the team]]")], ai("Describe operations and the team using only the notes.", ["input.operations_notes"], NEVER_BIZ, { minWords: 50, maxWords: 200 })),
    hybridSection("financials", "Financials", [listRows("input.financials", "{{item.period}}, {{item.line}}: {{item.amount|money}}"), p("[[input.financial_text|Assumptions|Assumptions behind the numbers]]")], ai("Explain the assumptions behind the numbers using only the notes. Do not restate or change any figure.", ["input.financial_notes"], [...NEVER_BIZ, "any financial figure"], { minWords: 40, maxWords: 180 })),
  ],
});

const strategyMemo = defineTemplate("mg.strategy_memo", {
  title: "Strategy Memo: {{input.topic}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("topic", "Topic"), f.text("audience", "Addressed to"),
    f.longtext("context_notes", "Context", { feedsSections: ["context"] }),
    f.rows("options", "Options", [col("option", "Option"), col("pros", "Advantages"), col("cons", "Disadvantages")], { minRows: 2, maxRows: 8 }),
    f.longtext("recommendation_notes", "Recommendation and reasons", { feedsSections: ["recommendation"] })],
  sections: [
    aiSection("context", "Context", [docHeader([["To", "{{input.audience}}"], ["Topic", "{{input.topic}}"]]), p("[[input.context_text|Context|Why this decision is needed now]]")], ai("Explain the context and why a decision is needed, using only the notes.", ["input.topic", "input.context_notes"], NEVER_BIZ, { minWords: 40, maxWords: 160 })),
    fixedSection("options", "Options", [listRows("input.options", "**{{item.option}}**. For: {{item.pros}}. Against: {{item.cons}}")]),
    aiSection("recommendation", "Recommendation", [p("[[input.recommendation_text|Recommendation|What is recommended and why]]")], ai("State the recommendation and its reasons, using only the notes and the options supplied.", ["input.topic", "input.recommendation_notes"], NEVER_BIZ, { minWords: 40, maxWords: 170 })),
  ],
});

const circular = defineTemplate("mg.circular", {
  title: "Office Order",
  layout: LETTER_LAYOUT_T3,
  inputs: [f.text("subject", "Subject"), f.date("effective_date", "Effective from"), f.text("applies_to", "Applies to", { help: "For example 'all employees' or a department." }),
    f.longtext("notice_notes", "What is being announced", { feedsSections: ["notice"] }), f.text("contact", "Whom to contact with questions")],
  sections: [
    hybridSection("notice", "Notice", [
      p("Date: {{date.today|date}}\nReference: {{doc.number||To be assigned on issue}}"),
      p("**Subject: {{input.subject}}**"),
      p("This order applies to {{input.applies_to}} and takes effect from {{input.effective_date|date}}."),
      p("[[input.notice_text|Notice|The announcement, in clear and brief terms]]"),
      p("Please direct questions to {{input.contact}}."),
      p("By order,\n**{{company.signatory_name}}**\n{{company.signatory_designation}}\n{{company.legal_name}}"),
    ], ai("Write the announcement clearly and briefly, using only the notes. State what changes, who it applies to and what people must do.", ["company.name", "input.subject", "input.applies_to", "input.notice_notes"], NEVER_BIZ, { tone: "formal", minWords: 30, maxWords: 160 })),
  ],
});

const doa = defineTemplate("mg.doa", {
  title: "Delegation of Authority",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.date("effective_date", "Effective from"),
    f.rows("limits", "Authorities", [col("role", "Role"), col("area", "Decision area"), col("limit", "Limit", "money", false), col("conditions", "Conditions or countersignature", "text", false)], { minRows: 1, maxRows: 60, help: "Limits are the company's own. Leave the limit blank where authority is not money-based." })],
  sections: [
    fixedSection("matrix", "Matrix", [docHeader([["Effective from", "{{input.effective_date|date}}"]]), listRows("input.limits", "**{{item.role}}**, {{item.area}}: up to {{item.limit|money|no monetary limit}}. {{item.conditions|text}}")]),
    lockedSection("rules", "Rules", [
      c1("A person may act only within the authority given to them and may not split a transaction to stay within a limit."),
      c1("A person may not approve a transaction in which they, or a relative, have an interest, or their own expense claims; such a matter goes to the next level."),
      c1("Authority is personal to the role holder and lasts while they hold the role. A role holder may delegate in writing for a stated period, and remains responsible for what is done under the delegation."),
      c1("Matters outside this matrix, or above a person's limit, go to the next level of authority and, where the Company's governing documents or the law require it, to the Board."),
      c1("This delegation is reviewed regularly by its owner and may be changed only in writing by the Board or the person the Board names."),
      ...approvals("Managing Director or Chief Executive", "Director"),
    ]),
  ],
});

const orgChart = defineTemplate("mg.org_chart", {
  title: "Organisation Structure: {{company.name}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.date("as_on", "As on"),
    f.rows("departments", "Departments", [col("department", "Department"), col("head", "Head"), col("reports_to", "Reports to"), col("strength", "Number of people", "number", false)], { minRows: 1, maxRows: 40, help: "Take this from the people records so that it matches HR." }),
    f.rows("roles", "Key roles", [col("role", "Role"), col("department", "Department"), col("reports_to", "Reports to"), col("responsibility", "Main responsibility")], { minRows: 1, maxRows: 60 })],
  sections: [
    fixedSection("structure", "Structure", [docHeader([["As on", "{{input.as_on|date}}"]]), listRows("input.departments", "**{{item.department}}**: headed by {{item.head}}, reports to {{item.reports_to}}. People: {{item.strength|number|not stated}}")]),
    fixedSection("roles", "Roles", [listRows("input.roles", "**{{item.role}}** ({{item.department}}): reports to {{item.reports_to}}. {{item.responsibility}}"), p("This structure is maintained by {{input.owner}} and changes only when the Company announces a change in writing.")]),
  ],
});


export const MG_GOVERNANCE: TemplateDef[] = [resolution, raci, riskRegister, changeRequest, postmortem, businessPlan, strategyMemo, circular, doa, orgChart];
