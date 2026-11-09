/**
 * Default content pass for the library (the "completeness" audit, `scripts/audit-pb-library.ts`).
 *
 * Several AI and hybrid sections were authored with a one-line placeholder body ("[Scope]"). That is fine for the AI, which writes the section,
 * but a person who opens the template or previews it must see a finished document. This file supplies, per section, a professionally worded
 * LEAD paragraph; `enrich` puts it in front of the section's existing body, turns the AI placeholders that stand for a declared input into the
 * variable itself (so the text reads as finished once the input is filled, and shows a highlighted blank while it is not), and adds the longtext
 * inputs the section is fed from. The AI instructions are untouched, so "Use" can still regenerate the section from the company's own facts.
 * Wording rules: full sentences, no figures, no statutory claims; every number comes from an input.
 */
import { p } from "@/lib/products/playbook-ai/catalogue/build";
import { applyExpand } from "@/lib/products/playbook-ai/catalogue/templates/expand";
import type { RawBlock, TemplateDef, TemplateSection } from "@/lib/products/playbook-ai/catalogue/types";

/** "<template id>#<section key>" to the lead paragraph (inline syntax: {{variables}}, **bold**). */
const LEADS: Record<string, string> = {
  "hr.jd#summary": "This role exists to deliver the work of the {{input.department}} team at {{company.name}} reliably and to a high standard. The summary below explains why the position is needed, what the person in it is accountable for, and how it supports the people and teams around it.",
  "hr.jd#responsibilities": "The {{input.role}} is accountable for the duties below. Each duty is a day-to-day expectation of the role; the reporting manager will agree priorities and how performance is judged with the person who joins.",
  "hr.jd#qualifications": "The education and experience below describe what a successful {{input.role}} brings to the role. They are the standard the hiring panel will assess every candidate against, so that selection stays fair and consistent.",
  "hr.jd#skills": "These are the technical and behavioural skills a {{input.role}} needs in order to perform well from the first months in the role. Candidates are assessed on them in the interview and, where the role requires, through a practical exercise.",
  "hr.mrf#justification": "This section records why the position of {{input.role}} in {{input.department}} is needed, so that the budget owner and the HR head can approve the request on the business case and not on urgency alone.",
  "hr.job_post#about": "{{company.name}} is growing its team and is looking for people who take pride in careful, dependable work. We offer a respectful workplace, clear expectations and the chance to build a career with us.",
  "hr.job_post#role": "As our {{input.role}} you will join us in {{input.location}} on a {{input.employment_type|text|full-time}} basis. You will own the work described below from start to finish and work closely with the colleagues around you.",
  "hr.job_post#requirements": "To be considered for this position you should be able to show the experience and capabilities listed below. Applications that do not meet the essential requirements cannot be taken forward.",
  "hr.probation_review#summary": "This summary records, in the manager's own words and from evidence, how the employee has performed during the probation period against the expectations set when the employee joined. It is the basis of the recommendation that follows.",
  "hr.appreciation#letter": "On behalf of {{company.name}}, we write to thank you for your work during {{input.period}}. Your contribution made a real difference to the team and to the people who depend on it, and we want that to be recorded.",
  "hr.warning#expected_conduct": "From the date of this letter, the Company expects the following standard of conduct from you. These expectations are consistent with the Company's policies and with what is required of every employee in your position.",
  "hr.pip#support": "The Company wants you to succeed in this plan. To help you meet the goals, the Company will give you the support described below, and your manager will check at each review that the support has actually been provided.",
  "hr.exit_interview#summary": "This summary records the main themes the employee raised in the exit interview. It is written neutrally and without attributing blame, and it is used by HR to find ways to improve the workplace and the way people leave it.",
  "hr.leave_policy#accrual": "This section explains how leave is earned, from when it can be used, and how it is recorded, so that every employee and every manager applies the same rule in the same way.",
  "hr.leave_policy#encashment": "This section sets out what happens to unused leave at the end of the leave year and at separation. The rule applies equally to all employees covered by this policy.",
  "hr.attendance_policy#late": "Arriving on time is part of working as a team. This section explains what counts as a late arrival, how late marks are recorded, and what follows when late arrival becomes a pattern.",
  "hr.wfh_policy#eligibility": "Remote work is a facility the Company offers where the role and the person suit it. This section says who may work remotely and how the approval is given and recorded.",
  "hr.handbook#values": "The values below describe how we work with each other, with our customers and with the people who supply us. They guide decisions where no rule applies, and we expect every employee to live by them.",
  "hr.referral#eligibility": "This section sets out who may refer a candidate and which referrals qualify for a reward, so that the programme is applied fairly to everyone who takes part.",
  "ct.sow#scope": "This Statement of Work describes the work the Company will carry out for the Client under the Master Agreement. The scope below states what is included, so that both parties share the same understanding of what will be delivered.",
  "ct.partnership#purpose": "The parties wish to combine their strengths for the purpose set out below. This section records that purpose in neutral terms, so that every later decision under the Alliance can be tested against it.",
  "ct.mou#purpose": "The parties record below the objectives they share and the cooperation they intend to pursue. This section explains why the parties are entering into this Memorandum and what they hope to achieve through it.",
  "mg.project_charter#background": "This section explains why the project is needed and what has led to it, so that everyone who reads the charter understands the problem the project exists to solve before reading how it will be solved.",
  "mg.project_charter#objectives": "The project is successful when it achieves the objectives below. Each objective is written so that the sponsor and the team can tell, at the end, whether it has been met.",
  "mg.project_charter#scope": "This section draws the boundary of the project. Work that is in scope is planned and funded; work that is out of scope needs a change request and the sponsor's approval before it is started.",
  "mg.project_plan#communication": "Good communication keeps the project on course. This section sets out how progress is shared, how often, with whom, and how issues are escalated when they cannot be solved within the team.",
  "mg.brd#objectives": "The business objectives below are the reasons the requirements in this document exist. Every requirement should trace back to at least one of them, and anything that does not should be questioned.",
  "mg.brd#assumptions": "The requirements in this document rest on the assumptions and constraints below. If any of them proves wrong, the affected requirements must be reviewed with the business owner before work continues.",
  "mg.prd#users": "This section describes the people who will use the product and what each of them needs from it. Product decisions are tested against these needs, and not against the preferences of the team.",
  "mg.prd#nonfunctional": "Beyond what the product does, it must also meet the standards below for performance, reliability, security and usability. These requirements apply to every feature, and they are tested before release.",
  "mg.prd#metrics": "Success is measured by the indicators below. They are agreed before building starts so that, after release, the team can see honestly whether the product has delivered what it promised.",
  "mg.prd#release": "The release plan below shows how and when the product reaches its users. Dates may move if scope or dependencies change, and any change is communicated to the stakeholders at the earliest.",
  "mg.status_report#progress": "This section reports what the team achieved in {{input.period}} against the plan, so that the reader can see at a glance how the work is moving and where attention is needed.",
  "mg.status_report#next_steps": "The work planned for the next period is listed below, in the order the team intends to do it. The project manager will confirm any change to this plan at the next status meeting.",
  "mg.weekly_report#planned": "The team plans to carry out the work listed below next week. Priorities may change if a blocker is raised or if a request with higher urgency arrives, and any such change will be reported here.",
  "mg.weekly_report#blockers": "The items below are slowing the team down or may do so soon. Each is listed with the support needed, so that the people who can remove the obstacle know what is being asked of them.",
  "mg.board_report#financials": "This section gives the Board a short commentary on the financial position for {{input.period}}, based on the accounts and the key figures reported above. It highlights what changed and why it matters.",
  "mg.board_report#operations": "This section summarises how operations performed in {{input.period}}, including the main achievements and the areas that need the Board's attention or support.",
  "mg.board_report#resolutions": "The Board is asked to consider and decide the matters below. Each item is stated so that it can be taken as a resolution at the meeting, with the supporting papers available on request.",
  "mg.mis_report#variances": "This section explains the main differences between the results reported above and the targets set for {{input.period}}, so that management can decide where to act.",
  "mg.minutes#agenda": "The meeting took up the items listed below, in the order they were taken. Items that were deferred or added during the meeting are recorded in the discussion that follows.",
  "mg.minutes#discussion": "The discussion on each agenda item is summarised below in neutral terms. The record shows what was said and agreed, and does not attribute views to individuals unless they asked for this to be minuted.",
  "mg.minutes#decisions": "The meeting reached the decisions below. Each decision is final unless it is brought back to the group for review, and the actions that follow from it are recorded against an owner.",
  "mg.board_resolution#resolution": "The Board of the Company, having considered the matter placed before it, passes the following resolution.",
  "mg.postmortem#root_cause": "The investigation found the root cause and the contributing factors described below. The purpose of this section is to understand how the failure became possible, and not to find someone to blame.",
  "mg.business_plan#market": "This section describes the market the business serves and the customers it intends to win. It sets out what the business has learned about their needs and why they would choose us.",
  "mg.business_plan#strategy": "The strategy below explains how the business intends to win in the market described above: where it will focus, what it will do differently, and what it will deliberately not do.",
  "mg.business_plan#operations": "This section explains how the business will deliver on its strategy day to day: the people, processes and resources it needs, and how they are organised to work together.",
  "mg.strategy_memo#recommendation": "After weighing the options in this memo, the author makes the recommendation below. The reasons are stated so that the reader can test the reasoning and, if needed, reach a different view.",
  "mg.circular#notice": "This circular is issued by {{company.name}} for the information and compliance of everyone it applies to. Please read it carefully and follow it with effect from the date stated.",
  "op.sop#scope": "This procedure applies to the people, teams and situations described below. It does not apply to anything outside this scope, for which the relevant policy or the department head should be consulted.",
  "op.sop#exceptions": "Occasionally the procedure cannot be followed exactly. The situations below are recognised exceptions; in each case the owner of the procedure must be informed and the exception recorded.",
  "op.incident_report#impact": "This section records who or what was affected by the incident and how seriously, so that the right people can decide on follow-up and on any communication that is needed.",
  "op.bcp#risks": "This plan prepares {{company.name}} for the disruptions described below. They were chosen because they are the most likely to interrupt critical work, or the most damaging if they occurred.",
  "op.hse_policy#emergency": "In an emergency, everyone on our sites follows the arrangements below. Managers are responsible for making sure their teams know them, and for taking part in drills so that they work when needed.",
  "it.security_policy#scope": "This policy applies to the systems, information and people described below. Anyone with access to {{company.name}} information, whether an employee, contractor or visitor, is expected to follow it.",
  "it.aup#monitoring": "To protect the Company, its customers and its people, the Company monitors the use of its systems as described below. Monitoring is carried out only for the purposes stated and in line with applicable law.",
  "it.runbook#rollback": "If a change to {{input.system}} fails or causes harm, restore the previous state using the steps below, in order, and inform the system owner as soon as the system is stable.",
  "it.release_notes#highlights": "This release of {{input.product}} brings the improvements described below. Please read the list of changes and the known issues that follow before you upgrade.",
  "vn.rfp#scope": "{{company.name}} invites proposals for the work described below. Bidders should read this section with care, because the proposal must address everything that is in scope and state clearly anything it excludes.",
  "vn.evaluation#recommendation": "Having scored each vendor against the agreed criteria, the evaluators make the recommendation below. It follows the scores recorded above and the conclusions the panel reached while discussing them.",
  "vn.sla#services": "The Vendor will provide the services described below to the Company throughout the term of this agreement, to the service levels set out in the sections that follow.",
  "vn.performance#issues": "This section records the issues that arose with the vendor during {{input.period}}, stated factually, together with how each was raised and resolved, so that the review rests on evidence.",
  "ps.proposal#summary": "This proposal has been prepared for {{client.name}} by {{company.legal_name}}. It summarises what we understand of your need, the solution we propose, how we would deliver it and what it would cost.",
  "ps.proposal#understanding": "We understand your situation and need as set out below. We have restated it in your own terms so that you can tell us at once if we have misunderstood anything.",
  "ps.proposal#solution": "To meet the need described above, we propose the solution below. It explains what we would deliver, how it works, and how it answers each point you raised.",
  "ps.estimate#assumptions": "The estimate above rests on the assumptions below. If any of them proves wrong the effort may change, and we will tell you before doing work that goes beyond this estimate.",
  "ps.capability#overview": "{{company.name}} is a company that serves the customers described below with the services listed in this statement. This overview explains who we are, what we do and what sets our work apart.",
  "ps.case_study#challenge": "Every project starts with a problem. This section describes the challenge {{input.client_name}} faced before working with us, and why it mattered to their business.",
  "ps.case_study#solution": "This section describes what {{company.name}} did to address the challenge: the approach we took, the work we delivered and how we worked with the client's team.",
  "ps.discovery#needs": "The client expressed the needs below in the discovery meeting. They are recorded in the client's own terms, so that the proposal that follows answers what was actually said.",
  "ps.discovery#constraints": "The client mentioned the constraints below that will affect how the work can be done. They must be respected in any proposal, and confirmed with the client where they are unclear.",
  "ps.rfp_response#cover": "We thank you for the opportunity to respond to your request for proposal. This letter submits our response, which addresses each of the requirements in your document.",
  "ps.solution_brief#solution_body": "This section explains how the solution works and how it is delivered, in plain terms, so that a decision maker can see what is being proposed without reading a technical document.",
  "ps.solution_brief#benefits": "If the solution is adopted, the client can expect the benefits below. They follow directly from the problem described earlier and from how the solution addresses it.",
  "ps.loi#intent": "The parties record below their present intention in relation to the subject matter of this letter. It is a statement of intent, and does not by itself create the obligations of a final agreement.",
  "ps.demo_plan#success": "The demonstration will be considered successful if the criteria below are met. They have been agreed with the client in advance so that the outcome is judged fairly by both sides.",
  "fn.budget_proposal#justification": "This section explains why the budget is needed, what it will be spent on, and what the organisation will gain from it, so that the approver can decide on the merits of the request.",
  "tr.needs#priorities": "Not every gap can be closed at once. The priorities below show which training should happen first and why, so that the training budget is spent where it will matter most.",
  "tr.curriculum#outcomes": "By the end of the course, learners will be able to do the things listed below. These outcomes are what the modules are designed to achieve and what assessments are designed to test.",
  "tr.lesson_plan#assessment": "At the end of the session the trainer checks that learners have met the objectives in the way described below, and notes anyone who needs more support.",
  "tr.material#content": "The content below is organised so that a learner can follow it from beginning to end, with each part building on the one before it. Read it through once, then use the exercises to practise.",
  "tr.material#exercises": "The exercises below let you practise what you have learned. Try each one without looking back at the content, then check your work against the material.",
  "tr.material#summary": "These are the key points to take away from this material. If any of them is unclear, go back to the relevant part of the content or ask your trainer.",
  "tr.report#actions": "Following the training, the actions below are recommended to build on what was learned and to deal with anything the results showed. Each action has an owner who will report back on progress.",
  "mk.service_brochure#overview": "{{company.name}} helps its customers with the services described in this brochure. This overview explains what we offer, who we offer it to, and the difference it makes.",
  "mk.service_brochure#why_us": "There are many places a customer could go. These are the reasons customers choose {{company.name}} and the reasons they stay with us.",
  "mk.datasheet#use_cases": "The product is used in the situations below. Each use case shows how it solves a real problem, so that you can judge how it would work for you.",
  "mk.flyer#headline": "{{input.offer_title}}",
  "mk.press_release#headline": "{{company.name}} announces news from {{input.city}}",
  "mk.press_release#about": "About {{company.name}}: the description below is the standard company boilerplate and may be used in any coverage of this announcement. It is kept short, factual and free of claims that cannot be checked.",
  "mk.media_kit#overview": "This media kit gives journalists and partners what they need to write accurately about {{company.name}}. It starts with a short overview of the company, followed by facts, logos and contact details.",
  "mk.brand_guide#voice": "Our voice is how {{company.name}} sounds in everything it writes. Consistency in voice builds trust, so everyone who writes for the company should follow the guidance below.",
  "mk.campaign_brief#audience": "The campaign is aimed at the audience described below. Every message, image and channel decision should be tested against what matters to these people.",
  "mk.campaign_brief#channels": "The campaign will run on the channels selected below. For each, the plan describes the message and the way it will be used, so that the channels work together and not separately.",
  "ct.reseller#territory": "The Distributor is appointed to sell the Products only in the area described below and may not actively promote or sell them outside it without the Company's written consent.",
  "lg.legal_notice#demand": "On the basis of the facts stated above, the Sender calls upon the Recipient to do the following.",
};

const FIELD_LABELS = new Map<string, string>();
void FIELD_LABELS;

type Raw = Record<string, unknown>;
function convert(n: unknown, declared: Set<string>): unknown {
  if (Array.isArray(n)) return n.map((x) => convert(x, declared));
  if (typeof n !== "object" || n === null) return n;
  const o = n as Raw;
  if (o.type === "placeholder" && typeof o.key === "string" && declared.has(o.key)) return { type: "var", key: o.key };
  const out: Raw = {};
  for (const [k, v] of Object.entries(o)) out[k] = typeof v === "object" ? convert(v, declared) : v;
  return out;
}

function enrichSection(def: TemplateDef, s: TemplateSection, lead: string): TemplateSection {
  const declared = new Set(def.inputs.map((i) => `input.${i.key}`));
  const body = convert(s.body, declared) as RawBlock[];
  const used = JSON.stringify(body);
  const feeds = (s.ai?.allowedFacts ?? []).filter((k) => def.inputs.some((i) => `input.${i.key}` === k && i.type === "longtext") && !used.includes(`"${k}"`));
  return { ...s, body: [p(lead), ...body, ...feeds.map((k) => p(`{{${k}}}`))] };
}

/** Extra sections (a purpose, notes or follow-up) for short documents; inserted before the signature section when there is one. */
const EXTRA: Record<string, { at: "start" | "end"; key: string; title: string; body: string[] }[]> = {};


Object.assign(EXTRA, {
  "hr.experience": [{ at: "end", key: "verification", title: "Verification", body: ["This certificate is issued at the request of the employee, on the basis of the Company's records. {{company.legal_name}} will confirm its authenticity on a written request sent to {{company.email|text|the Company's HR department}}."] }],
  "ct.amendment": [{ at: "end", key: "effect", title: "Effect of this Amendment", body: ["This Amendment forms part of the agreement titled {{input.original_title}} dated {{input.original_date|date}} (the \"Agreement\"). Except as expressly amended here, every term of the Agreement continues in full force and effect.", "If there is any conflict between this Amendment and the Agreement, this Amendment prevails to the extent of the conflict. No other change to the Agreement is made unless it is in writing and signed by both parties."] }],
  "ct.renewal": [{ at: "end", key: "effect", title: "Effect of this renewal", body: ["This document renews the agreement titled {{input.original_title}} dated {{input.original_date|date}} (the \"Agreement\"). Except for the changes recorded above, every term of the Agreement continues in full force and effect during the renewed term.", "Any right or liability that arose under the Agreement before the date of this renewal is not affected by it."] }],
  "mg.agenda": [
    { at: "start", key: "purpose", title: "Purpose", body: ["This agenda sets out what {{input.meeting}} will cover on {{input.meeting_date|date}} at {{input.time}}, chaired by {{input.chair}}. Please read any papers beforehand and come prepared to decide the items marked for decision."] },
    { at: "end", key: "notes", title: "Before and after the meeting", body: ["Items are taken in the order shown. If an item is not finished it is carried to the next meeting and noted in the minutes. Apologies should be sent to {{input.owner}} before the meeting."] },
  ],
  "mg.raci": [{ at: "start", key: "how", title: "How to read this matrix", body: ["This matrix shows who is Responsible, Accountable, Consulted and Informed for each activity in {{input.scope}}. Each activity has exactly one Accountable person. Where roles are unclear, {{input.owner}} decides and updates the matrix."] }],
  "mg.risk_register": [
    { at: "start", key: "purpose", title: "Purpose", body: ["This register records the risks to {{input.project_name}}, how likely each is, how serious it would be, and what is being done about it. It is owned by {{input.owner}} and was last reviewed on {{input.review_date|date}}."] },
    { at: "end", key: "use", title: "How the register is used", body: ["Risks are reviewed at every project review meeting. A risk is closed only when its owner confirms in writing that it can no longer affect the project. New risks are added as soon as they are identified."] },
  ],
  "mg.org_chart": [{ at: "start", key: "about", title: "About this document", body: ["This document shows how {{company.name}} is organised as on {{input.as_on|date}}: the departments, who leads each, and who reports to whom. It is maintained by {{input.owner}} and updated whenever the structure changes."] }],
  "op.work_instruction": [
    { at: "start", key: "purpose", title: "Purpose and tools", body: ["This work instruction explains, step by step, how to carry out {{input.task}} correctly and safely. It is intended for anyone who performs this task at {{company.name}} and is owned by {{input.owner}}.", "You will need the following tools and materials: {{input.tools}}"] },
  ],
  "op.checklist": [
    { at: "start", key: "purpose", title: "Purpose", body: ["Use this checklist each time {{input.process}} is carried out, so that no step is missed. Tick each item only when it is complete, and report anything that cannot be completed to {{input.owner}}."] },
    { at: "end", key: "signoff", title: "Sign-off", body: ["The person completing the checklist signs and dates it below. Completed checklists are kept as a record of the work.", "Completed by: ______________________    Date: ______________"] },
  ],
  "op.escalation": [
    { at: "start", key: "purpose", title: "Purpose", body: ["This matrix shows who to contact, and in what order, when an issue in {{input.area}} cannot be resolved at the first level. It is owned by {{input.owner}}."] },
    { at: "end", key: "use", title: "Using the matrix", body: ["Start at the first level and move up only when the issue is not resolved within the time shown. Record every escalation with the date, the person contacted and the outcome."] },
  ],
  "vn.rejection": [{ at: "end", key: "feedback", title: "Feedback", body: ["If you would like feedback on your submission, reference {{input.reference}}, please reply to this letter and we will arrange a short conversation. We value the time and effort you put into your response."] }],
  "ps.pitch_outline": [
    { at: "start", key: "purpose", title: "Purpose", body: ["This outline plans the pitch for {{input.audience}} so that every slide supports one goal: {{input.goal}}. The presentation should take about {{input.length}}. It is prepared by {{input.owner}}."] },
    { at: "end", key: "prepare", title: "Preparing to present", body: ["Keep to one message per slide, test the story with someone outside the team, and prepare answers to the questions the audience is most likely to ask. {{input.message_notes}}"] },
  ],
  "fn.receipt": [{ at: "end", key: "note", title: "Note", body: ["This receipt acknowledges the payment shown above and is issued by {{company.legal_name}}. Please keep it for your records. For any query about this receipt, write to {{company.email|text|our accounts team}}, quoting receipt number {{input.number}}."] }],
  "tr.certificate": [{ at: "end", key: "verification", title: "Verification", body: ["This certificate confirms that the learner named above completed the course on the date shown. {{company.name}} can confirm its authenticity on request."] }],
  "tr.attendance": [{ at: "start", key: "session", title: "Session details", body: ["Attendance for {{input.session}} held on {{input.session_date|date}} at {{input.venue}}, conducted by {{input.trainer}}. Each learner must sign against their own name; signing for another person is not permitted."] }],
  "mk.profile": [{ at: "start", key: "intro", title: "Introduction", body: ["{{company.name}}: {{input.tagline}}. This profile presents who we are, what we do and the customers we serve, in one place for partners and prospects."] }],
  "mk.product_brochure": [{ at: "start", key: "intro", title: "Introduction", body: ["{{input.product}}: {{input.tagline}}. This brochure explains what the product does, its main features and its specifications, so that you can decide whether it fits your needs."] }],
  "mk.one_pager": [{ at: "start", key: "intro", title: "Introduction", body: ["This one-page summary introduces {{input.offering}} from {{company.name}}: what it is, who it is for and the main reasons to choose it. Read this page first; the sections below give the detail."] }, { at: "end", key: "brief", title: "In brief", body: ["{{company.name}} offers {{input.offering}}. {{input.offering_notes}}"] }],
  "mk.flyer": [{ at: "end", key: "details_more", title: "Details", body: ["{{input.offer_title}} runs from {{input.start_date|date}} to {{input.end_date|date}} at {{input.venue}}, {{input.time}}. {{input.offer_notes}}"] }],
  "mk.content_calendar": [{ at: "start", key: "purpose", title: "Purpose", body: ["This calendar plans what {{company.name}} will publish during {{input.period}}, on which channels and by whom, so that content is regular, consistent and reviewed before it goes out."] }],
  "lg.declaration": [{ at: "start", key: "declarant", title: "Declarant", body: ["This declaration is made by {{party.name}}, {{party.address}}, for the purpose of {{input.purpose}}."] }],
});

export function addExtra(id: string, sections: { at: "start" | "end"; key: string; title: string; body: string[] }[]): void { EXTRA[id] = sections; }

const GENERIC_STARTS = ["This policy is reviewed regularly by its owner", "The Company may amend this policy from time to time.", "This delegation is reviewed regularly by its owner"];

/** The closing "amendment and review" sentence was shared by many policies; each policy now states it for itself, naming the document. */
function tailorBoilerplate(def: TemplateDef, sections: TemplateSection[]): TemplateSection[] {
  const nm = def.name.toLowerCase();
  const owner = def.inputs.some((i) => i.key === "owner") ? "{{input.owner}}" : def.inputs.some((i) => i.key === "policy_owner") ? "{{input.policy_owner}}" : "the owner of this document";
  const text = `The ${nm} is owned by ${owner}, who reviews it at regular intervals and whenever the law, the business or the way people work changes. A change to the ${nm} is approved by the owner, communicated to the people it affects before it applies, and recorded with its date. Where it differs from applicable law, the law prevails, and an exception to it needs the owner's written approval with the reason recorded.`;
  const walk = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(walk);
    if (typeof n !== "object" || n === null) return n;
    const o = n as Raw;
    if (o.type === "text" && typeof o.text === "string" && GENERIC_STARTS.some((g) => (o.text as string).startsWith(g))) return { ...o, text };
    const out: Raw = {};
    for (const [k, v] of Object.entries(o)) out[k] = typeof v === "object" ? walk(v) : v;
    return out;
  };
  return sections.map((s) => (JSON.stringify(s.body).includes("reviewed regularly by its owner") || JSON.stringify(s.body).includes("may amend this policy") ? { ...s, body: walk(s.body) as RawBlock[] } : s));
}

export function enrich(def: TemplateDef): TemplateDef {
  let sections = def.sections.map((s) => { const lead = LEADS[`${def.id}#${s.key}`]; return lead ? enrichSection(def, s, lead) : s; });
  const extra = EXTRA[def.id];
  if (extra) {
    const mk = (e: (typeof extra)[number]): TemplateSection => ({ key: e.key, title: e.title, aiMode: "fixed", locked: false, body: e.body.map((t) => p(t)) });
    const start = extra.filter((e) => e.at === "start").map(mk);
    const end = extra.filter((e) => e.at === "end").map(mk);
    const sigAt = sections.findIndex((s) => JSON.stringify(s.body).includes('"signatureBlock"'));
    sections = [...sections.filter((s) => s.draftOnly), ...start, ...sections.filter((s) => !s.draftOnly)];
    if (end.length) { const i = sigAt >= 0 ? sections.findIndex((s) => JSON.stringify(s.body).includes('"signatureBlock"')) : -1; sections = i >= 0 ? [...sections.slice(0, i), ...end, ...sections.slice(i)] : [...sections, ...end]; }
  }
  sections = tailorBoilerplate(def, sections);
  const done = sections === def.sections ? def : { ...def, sections };
  return applyExpand(done);
}
