/** T3 management, part 1: projects and requirements (mg.project_charter to mg.agenda). */
import { ai, aiSection, bullets, col, f, fixedSection, kv, p, whenSet } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { DOC_LAYOUT, NEVER_BIZ, approvals, docHeader, listRows, owner } from "@/lib/products/playbook-ai/catalogue/templates/t3-operations/common";

const charter = defineTemplate("mg.project_charter", {
  title: "Project Charter: {{input.project_name}}",
  layout: DOC_LAYOUT,
  inputs: [
    owner(), f.text("project_name", "Project name"), f.text("sponsor", "Sponsor"), f.text("manager", "Project manager"),
    f.longtext("background_notes", "Why the project is needed", { feedsSections: ["background"] }),
    f.longtext("goal_notes", "Goals and expected outcomes", { feedsSections: ["objectives"] }),
    f.longtext("scope_notes", "In scope and out of scope", { feedsSections: ["scope"] }),
    f.rows("stakeholders", "Stakeholders", [col("name", "Name or group"), col("role", "Role in the project"), col("interest", "Interest or expectation", "text", false)], { minRows: 1, maxRows: 20 }),
    f.rows("risks", "Known risks", [col("risk", "Risk"), col("response", "Planned response", "text", false)], { required: false, minRows: 0, maxRows: 15 }),
    f.money("budget", "Approved budget"), f.date("start_date", "Planned start"), f.date("end_date", "Planned end"),
  ],
  sections: [
    fixedSection("overview", "Overview", [docHeader([["Project", "{{input.project_name}}"], ["Sponsor", "{{input.sponsor}}"], ["Project manager", "{{input.manager}}"], ["Planned period", "{{input.start_date|date}} to {{input.end_date|date}}"]])]),
    aiSection("background", "Background", [p("[[input.background_text|Background|Why the project is needed]]")], ai("Explain why the project is needed in a short paragraph, using only the notes.", ["input.project_name", "input.background_notes", "company.name"], NEVER_BIZ, { minWords: 40, maxWords: 150 })),
    aiSection("objectives", "Objectives", [bullets(["[[input.objective_list|Objectives|Measurable goals]]"])], ai("List the objectives as short, measurable bullets, using only the notes.", ["input.project_name", "input.goal_notes"], NEVER_BIZ, { tone: "instructional", minWords: 30, maxWords: 140 })),
    aiSection("scope", "Scope", [p("[[input.scope_text|Scope|What is in scope and what is not]]")], ai("State what is in scope and what is out of scope, as two short lists, using only the notes.", ["input.project_name", "input.scope_notes"], NEVER_BIZ, { tone: "instructional", minWords: 30, maxWords: 160 })),
    fixedSection("stakeholders", "Stakeholders", [listRows("input.stakeholders", "**{{item.name}}**: {{item.role}}. {{item.interest|text}}")]),
    fixedSection("risks", "Risks", [whenSet("input.risks", [listRows("input.risks", "{{item.risk}}. Response: {{item.response|text|To be planned}}")]), p("The project manager keeps a risk register and reports significant risks to the sponsor.")]),
    fixedSection("budget", "Budget", [kv([["Approved budget", "{{input.budget|money}} ({{input.budget|words}})"]]), p("Spending beyond the approved budget needs the sponsor's written approval before it is committed.")]),
    fixedSection("approval", "Authorisation", [p("This charter authorises the project manager to use the approved budget and resources to deliver the project within the scope above."), ...approvals("Sponsor", "Project manager")]),
  ],
});

const plan = defineTemplate("mg.project_plan", {
  title: "Project Plan: {{input.project_name}}",
  layout: DOC_LAYOUT,
  inputs: [
    owner(), f.text("project_name", "Project name"), f.text("manager", "Project manager"),
    f.longtext("scope_notes", "Scope of the project", { feedsSections: ["scope"] }),
    f.rows("wbs", "Work breakdown", [col("package", "Work package"), col("owner", "Owner"), col("outputs", "Outputs", "text", false)], { minRows: 1, maxRows: 40 }),
    f.rows("milestones", "Milestones", [col("name", "Milestone"), col("date", "Planned date", "date"), col("owner", "Owner", "text", false)], { minRows: 1, maxRows: 30 }),
    f.rows("team", "Team", [col("name", "Name"), col("role", "Role"), col("allocation", "Time commitment", "text", false)], { minRows: 1, maxRows: 40 }),
    f.rows("risks", "Risks", [col("risk", "Risk"), col("response", "Response")], { minRows: 1, maxRows: 15 }),
    f.longtext("communication_notes", "How progress is communicated", { feedsSections: ["communication"] }),
  ],
  sections: [
    aiSection("scope", "Scope", [docHeader([["Project", "{{input.project_name}}"], ["Project manager", "{{input.manager}}"]]), p("[[input.scope_text|Scope|Scope of the project]]")], ai("Write a short scope statement using only the notes.", ["input.project_name", "input.scope_notes"], NEVER_BIZ, { minWords: 30, maxWords: 130 })),
    fixedSection("wbs", "Work breakdown", [listRows("input.wbs", "**{{item.package}}** (owner: {{item.owner}}): {{item.outputs|text|Outputs as defined by the owner}}")]),
    fixedSection("timeline", "Timeline", [listRows("input.milestones", "{{item.date|date}}: {{item.name}} ({{item.owner|text|Project manager}})")]),
    fixedSection("resources", "Resources", [listRows("input.team", "**{{item.name}}**, {{item.role}}. {{item.allocation|text}}")]),
    fixedSection("risks", "Risks", [listRows("input.risks", "{{item.risk}}. Response: {{item.response}}")]),
    aiSection("communication", "Communication", [p("[[input.communication_text|Communication|Meetings, reports and escalation]]")], ai("Describe how progress is communicated (meetings, reports, escalation), using only the notes.", ["input.manager", "input.communication_notes"], NEVER_BIZ, { minWords: 30, maxWords: 130 })),
  ],
});

const brd = defineTemplate("mg.brd", {
  title: "Business Requirements Document: {{input.project_name}}",
  layout: DOC_LAYOUT,
  inputs: [
    owner(), f.text("project_name", "Project name"),
    f.longtext("overview_notes", "Business problem and context", { feedsSections: ["overview"] }),
    f.longtext("objective_notes", "Business objectives", { feedsSections: ["objectives"] }),
    f.rows("stakeholders", "Stakeholders", [col("name", "Name or group"), col("role", "Role")], { minRows: 1, maxRows: 20 }),
    f.rows("requirements", "Requirements", [col("id", "Reference"), col("requirement", "Requirement"), col("priority", "Priority (must, should, could)")], { minRows: 1, maxRows: 80 }),
    f.longtext("assumption_notes", "Assumptions and constraints", { required: false, feedsSections: ["assumptions"] }),
    f.longtext("acceptance_notes", "How the requirements will be accepted", { feedsSections: ["acceptance"] }),
  ],
  sections: [
    aiSection("overview", "Overview", [docHeader([["Project", "{{input.project_name}}"]]), p("[[input.overview_text|Overview|Business problem and context]]")], ai("Describe the business problem and context in a short paragraph, using only the notes.", ["input.project_name", "input.overview_notes"], NEVER_BIZ, { minWords: 40, maxWords: 160 })),
    aiSection("objectives", "Objectives", [bullets(["[[input.objective_list|Objectives|Business objectives]]"])], ai("List the business objectives as bullets, using only the notes.", ["input.objective_notes"], NEVER_BIZ, { tone: "instructional", minWords: 20, maxWords: 120 })),
    fixedSection("stakeholders", "Stakeholders", [listRows("input.stakeholders", "**{{item.name}}**: {{item.role}}")]),
    fixedSection("requirements", "Requirements", [p("Each requirement is stated as something the solution must do or be. Priority is must, should or could."), listRows("input.requirements", "**{{item.id}}** ({{item.priority}}): {{item.requirement}}")]),
    aiSection("assumptions", "Assumptions and constraints", [p("[[input.assumption_text|Assumptions|Assumptions and constraints]]")], ai("List the assumptions and constraints as short bullets, using only the notes. If none were supplied, write nothing.", ["input.assumption_notes"], NEVER_BIZ, { tone: "instructional", minWords: 5, maxWords: 110 })),
    aiSection("acceptance", "Acceptance", [p("[[input.acceptance_text|Acceptance|How requirements are accepted]]"), ...approvals("For the Company", "For the business owner")], ai("Describe how the requirements will be reviewed and accepted, using only the notes.", ["input.acceptance_notes"], NEVER_BIZ, { minWords: 25, maxWords: 110 })),
  ],
});

const prd = defineTemplate("mg.prd", {
  title: "Product Requirements: {{input.product}}",
  layout: DOC_LAYOUT,
  inputs: [
    owner(), f.text("product", "Product or feature"),
    f.longtext("problem_notes", "The problem to solve", { feedsSections: ["problem"] }),
    f.longtext("user_notes", "Who the users are", { feedsSections: ["users"] }),
    f.rows("features", "Features", [col("name", "Feature"), col("description", "What it does"), col("priority", "Priority (must, should, could)")], { minRows: 1, maxRows: 40 }),
    f.longtext("nonfunctional_notes", "Non-functional requirements", { feedsSections: ["nonfunctional"], help: "Performance, security, accessibility and similar, with the targets the team has agreed." }),
    f.longtext("metric_notes", "How success will be measured", { feedsSections: ["metrics"] }),
    f.text("release_plan", "Release plan", { help: "Target release and any phases, in your words." }),
  ],
  sections: [
    aiSection("problem", "Problem", [docHeader([["Product", "{{input.product}}"]]), p("[[input.problem_text|Problem|The problem and why it matters]]")], ai("State the problem and why it matters, using only the notes.", ["input.product", "input.problem_notes"], NEVER_BIZ, { minWords: 40, maxWords: 150 })),
    aiSection("users", "Users", [p("[[input.users_text|Users|Who the users are and what they need]]")], ai("Describe the users and their needs, using only the notes.", ["input.product", "input.user_notes"], NEVER_BIZ, { minWords: 30, maxWords: 130 })),
    fixedSection("features", "Features", [listRows("input.features", "**{{item.name}}** ({{item.priority}}): {{item.description}}")]),
    aiSection("nonfunctional", "Non-functional requirements", [bullets(["[[input.nonfunctional_list|Non-functional|Performance, security, accessibility, reliability]]"])], ai("List the non-functional requirements as bullets, using only the notes and without adding targets that were not supplied.", ["input.nonfunctional_notes"], NEVER_BIZ, { tone: "instructional", minWords: 20, maxWords: 130 })),
    aiSection("metrics", "Success metrics", [bullets(["[[input.metric_list|Metrics|How success is measured]]"])], ai("List the success metrics as bullets, using only the notes.", ["input.metric_notes"], NEVER_BIZ, { tone: "instructional", minWords: 15, maxWords: 100 })),
    fixedSection("release", "Release", [p("Release plan: {{input.release_plan}}.")]),
  ],
});

const status = defineTemplate("mg.status_report", {
  title: "Project Status Report: {{input.project_name}}",
  layout: DOC_LAYOUT,
  inputs: [
    owner(), f.text("project_name", "Project name"), f.person("client", "Client", "client", { required: false }),
    f.text("period", "Reporting period"), f.select("health", "Overall status", ["On track", "At risk", "Off track"]),
    f.longtext("progress_notes", "Progress this period", { feedsSections: ["progress"] }),
    f.rows("risks", "Risks and issues", [col("item", "Risk or issue"), col("action", "Action or owner")], { required: false, minRows: 0, maxRows: 15 }),
    f.longtext("next_notes", "Planned for the next period", { feedsSections: ["next_steps"] }),
  ],
  sections: [
    fixedSection("summary", "Summary", [docHeader([["Project", "{{input.project_name}}"], ["Client", "{{client.name|text|Internal}}"], ["Period", "{{input.period}}"], ["Overall status", "{{input.health}}"]])]),
    aiSection("progress", "Progress", [p("[[input.progress_text|Progress|What was done this period]]")], ai("Summarise progress this period in a short paragraph and bullets, using only the notes.", ["input.project_name", "input.period", "input.progress_notes"], NEVER_BIZ, { minWords: 40, maxWords: 200 })),
    fixedSection("risks", "Risks and issues", [whenSet("input.risks", [listRows("input.risks", "{{item.item}}. Action: {{item.action}}")]), p("Risks and issues are reviewed at each status meeting.")]),
    aiSection("next_steps", "Next steps", [bullets(["[[input.next_list|Next steps|Planned for the next period]]"])], ai("List the planned next steps as bullets, using only the notes.", ["input.next_notes"], NEVER_BIZ, { tone: "instructional", minWords: 15, maxWords: 120 })),
  ],
});

const weekly = defineTemplate("mg.weekly_report", {
  title: "Weekly Report: {{input.team}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("team", "Team"), f.text("week", "Week", { help: "For example the dates the week covers." }),
    f.longtext("done_notes", "What was completed", { feedsSections: ["done"] }), f.longtext("planned_notes", "What is planned next week", { feedsSections: ["planned"] }), f.longtext("blocker_notes", "Blockers", { required: false, feedsSections: ["blockers"] })],
  sections: [
    aiSection("done", "Done this week", [docHeader([["Team", "{{input.team}}"], ["Week", "{{input.week}}"]]), bullets(["[[input.done_list|Done|Completed work]]"])], ai("List what was completed as short bullets, using only the notes.", ["input.team", "input.done_notes"], NEVER_BIZ, { tone: "instructional", minWords: 15, maxWords: 150 })),
    aiSection("planned", "Planned next week", [bullets(["[[input.planned_list|Planned|Next week's work]]"])], ai("List what is planned for next week as short bullets, using only the notes.", ["input.planned_notes"], NEVER_BIZ, { tone: "instructional", minWords: 10, maxWords: 130 })),
    aiSection("blockers", "Blockers", [p("[[input.blocker_text|Blockers|Anything slowing the team down]]")], ai("List the blockers and who can help, using only the notes. If there are none, write that there are no blockers.", ["input.blocker_notes"], NEVER_BIZ, { tone: "instructional", minWords: 5, maxWords: 100 })),
  ],
});

const board = defineTemplate("mg.board_report", {
  title: "Report to the Board: {{input.period}}",
  layout: { header: "compact", footer: "confidential_page", titleAlign: "left" },
  inputs: [owner(), f.text("period", "Reporting period"),
    f.longtext("highlight_notes", "Highlights", { feedsSections: ["highlights"] }),
    f.rows("kpis", "Key figures", [col("name", "Measure"), col("value", "Value"), col("comment", "Comment", "text", false)], { minRows: 1, maxRows: 30, help: "Figures come from your books and systems. Enter them exactly." }),
    f.longtext("financial_notes", "Financial commentary", { feedsSections: ["financials"] }),
    f.longtext("operations_notes", "Operations", { feedsSections: ["operations"] }),
    f.rows("risks", "Principal risks", [col("risk", "Risk"), col("response", "Response")], { minRows: 1, maxRows: 15 }),
    f.longtext("resolution_notes", "Matters on which the Board's decision is sought", { required: false, feedsSections: ["resolutions"] })],
  sections: [
    aiSection("highlights", "Highlights", [docHeader([["Period", "{{input.period}}"]]), bullets(["[[input.highlight_list|Highlights|Key events of the period]]"])], ai("Summarise the highlights as short bullets, using only the notes.", ["company.name", "input.period", "input.highlight_notes"], NEVER_BIZ, { minWords: 30, maxWords: 150 })),
    fixedSection("figures", "Key figures", [listRows("input.kpis", "**{{item.name}}**: {{item.value}}. {{item.comment|text}}")]),
    aiSection("financials", "Financials", [p("[[input.financial_text|Financials|Commentary on the financial position]]")], ai("Write brief financial commentary using only the notes and the key figures supplied.", ["input.financial_notes"], [...NEVER_BIZ, "any financial figure not in the key figures or notes"], { minWords: 40, maxWords: 180 })),
    aiSection("operations", "Operations", [p("[[input.operations_text|Operations|Operational commentary]]")], ai("Write brief operational commentary using only the notes.", ["input.operations_notes"], NEVER_BIZ, { minWords: 30, maxWords: 160 })),
    fixedSection("risks", "Risks", [listRows("input.risks", "{{item.risk}}. Response: {{item.response}}")]),
    aiSection("resolutions", "Resolutions sought", [p("[[input.resolution_text|Resolutions|What the Board is asked to decide]]")], ai("State what the Board is asked to decide, as short numbered items, using only the notes. If none, write that no decision is sought.", ["input.resolution_notes"], NEVER_BIZ, { minWords: 5, maxWords: 120 })),
  ],
});

const mis = defineTemplate("mg.mis_report", {
  title: "Management Report: {{input.period}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("period", "Period"),
    f.rows("kpis", "KPIs", [col("name", "KPI"), col("actual", "Actual"), col("target", "Target"), col("note", "Note", "text", false)], { minRows: 1, maxRows: 40, help: "Enter figures exactly as they come from your reports." }),
    f.longtext("summary_notes", "Summary points", { feedsSections: ["summary"] }),
    f.longtext("variance_notes", "Reasons for variances", { required: false, feedsSections: ["variances"] }),
    f.rows("actions", "Actions", [col("action", "Action"), col("owner", "Owner"), col("due", "Due date", "date", false)], { minRows: 0, required: false, maxRows: 20 })],
  sections: [
    aiSection("summary", "Summary", [docHeader([["Period", "{{input.period}}"]]), p("[[input.summary_text|Summary|Overall summary of the period]]")], ai("Summarise the period in a short paragraph, using only the notes and KPI figures supplied.", ["input.period", "input.summary_notes"], NEVER_BIZ, { minWords: 40, maxWords: 150 })),
    fixedSection("kpis", "KPIs", [listRows("input.kpis", "**{{item.name}}**: actual {{item.actual}}, target {{item.target}}. {{item.note|text}}")]),
    aiSection("variances", "Variances", [p("[[input.variance_text|Variances|Reasons for the variances against target]]")], ai("Explain the main variances against target, using only the notes supplied.", ["input.variance_notes"], NEVER_BIZ, { minWords: 30, maxWords: 150 })),
    fixedSection("actions", "Actions", [whenSet("input.actions", [listRows("input.actions", "{{item.action}} (owner: {{item.owner}}, due {{item.due|date|as agreed}})")]), p("Owners report progress on these actions in the next report.")]),
  ],
});

const kpi = defineTemplate("mg.kpi", {
  title: "KPI Framework: {{input.department}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("department", "Department or function"),
    f.longtext("objective_notes", "Objectives the KPIs support", { feedsSections: ["objectives"] }),
    f.rows("metrics", "KPIs", [col("name", "KPI"), col("definition", "How it is calculated"), col("target", "Target"), col("frequency", "Reviewed")], { minRows: 1, maxRows: 30 }),
    f.text("review_cycle", "Review cycle", { help: "For example 'monthly review meeting and a yearly reset'." })],
  sections: [
    aiSection("objectives", "Objectives", [docHeader([["Department", "{{input.department}}"]]), p("[[input.objective_text|Objectives|What the KPIs are meant to achieve]]")], ai("State the objectives the KPIs support, using only the notes.", ["input.department", "input.objective_notes"], NEVER_BIZ, { minWords: 25, maxWords: 110 })),
    fixedSection("kpis", "KPI table", [listRows("input.metrics", "**{{item.name}}**: {{item.definition}}. Target: {{item.target}}. Reviewed: {{item.frequency}}")]),
    fixedSection("owners", "Owners", [p("Each KPI has a named owner in the {{input.department}} team who reports it, explains movements and proposes action. The document owner is {{input.owner}}.")]),
    fixedSection("review", "Review", [p("KPIs are reviewed through {{input.review_cycle}}. A KPI is changed or retired only with the approval of the document owner, and the reason is recorded.")]),
  ],
});

const okr = defineTemplate("mg.okr", {
  title: "OKRs: {{input.team}}, {{input.quarter}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("team", "Team"), f.text("quarter", "Quarter"),
    f.rows("objectives", "Objectives", [col("objective", "Objective"), col("owner", "Owner")], { minRows: 1, maxRows: 8 }),
    f.rows("results", "Key results", [col("objective", "Objective it supports"), col("result", "Key result (measurable)"), col("owner", "Owner", "text", false)], { minRows: 1, maxRows: 40 })],
  sections: [
    fixedSection("objectives", "Objectives", [docHeader([["Team", "{{input.team}}"], ["Quarter", "{{input.quarter}}"]]), listRows("input.objectives", "**{{item.objective}}** (owner: {{item.owner}})")]),
    fixedSection("results", "Key results", [listRows("input.results", "{{item.objective}}: {{item.result}} ({{item.owner|text|objective owner}})")]),
    fixedSection("owners", "Owners and review", [p("Each key result has an owner who updates progress regularly. The team reviews progress at its regular meetings and closes the quarter by scoring each key result honestly and recording what was learned.")]),
  ],
});

const minutes = defineTemplate("mg.minutes", {
  title: "Minutes of Meeting: {{input.meeting}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("meeting", "Meeting"), f.date("meeting_date", "Date"), f.text("venue", "Venue or link", { required: false }),
    f.longtext("attendees", "Attendees", { help: "Names and roles, one per line. Mention apologies for absence." }),
    f.longtext("agenda_items", "Agenda"), f.longtext("discussion_notes", "Notes of the discussion", { feedsSections: ["discussion"] }),
    f.longtext("decision_notes", "Decisions taken", { feedsSections: ["decisions"] }),
    f.rows("actions", "Action items", [col("action", "Action"), col("owner", "Owner"), col("due", "Due date", "date", false)], { required: false, minRows: 0, maxRows: 30 })],
  sections: [
    fixedSection("attendees", "Attendees", [docHeader([["Meeting", "{{input.meeting}}"], ["Date", "{{input.meeting_date|date}}"], ["Venue", "{{input.venue|text|Not recorded}}"]]), p("{{input.attendees}}")]),
    fixedSection("agenda", "Agenda", [p("{{input.agenda_items}}")]),
    aiSection("discussion", "Discussion", [p("[[input.discussion_text|Discussion|Summary of the discussion]]")], ai("Summarise the discussion, topic by topic, in neutral language, using only the notes.", ["input.meeting", "input.discussion_notes"], [...NEVER_BIZ, "statements attributed to people that are not in the notes"], { tone: "neutral", minWords: 40, maxWords: 250 })),
    aiSection("decisions", "Decisions", [bullets(["[[input.decision_list|Decisions|Decisions taken]]"])], ai("List the decisions taken as short bullets, using only the notes.", ["input.decision_notes"], NEVER_BIZ, { tone: "neutral", minWords: 10, maxWords: 130 })),
    fixedSection("actions", "Action items", [whenSet("input.actions", [listRows("input.actions", "{{item.action}}: {{item.owner}}, by {{item.due|date|the next meeting}}")]), p("Minutes recorded by {{input.owner}}. Corrections to these minutes should be sent to the recorder before the next meeting."), ...approvals("Chair", "Secretary")]),
  ],
});

const agenda = defineTemplate("mg.agenda", {
  title: "Meeting Agenda: {{input.meeting}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("meeting", "Meeting"), f.date("meeting_date", "Date"), f.text("time", "Time and place"), f.text("chair", "Chair"),
    f.rows("topics", "Topics", [col("topic", "Topic"), col("lead", "Lead"), col("time", "Time allowed", "text", false)], { minRows: 1, maxRows: 25 })],
  sections: [
    fixedSection("agenda_table", "Agenda", [docHeader([["Meeting", "{{input.meeting}}"], ["Date", "{{input.meeting_date|date}}"], ["Time and place", "{{input.time}}"], ["Chair", "{{input.chair}}"]]), listRows("input.topics", "**{{item.topic}}** (lead: {{item.lead}}; time: {{item.time|text|as needed}})"), p("Please read any circulated papers before the meeting. Items not finished in the time allowed are carried to the next meeting or taken up by the chair.")]),
  ],
});


export const MG_PROJECTS: TemplateDef[] = [charter, plan, brd, prd, status, weekly, board, mis, kpi, okr, minutes, agenda];
