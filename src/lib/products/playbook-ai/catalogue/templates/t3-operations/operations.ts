/** T3 operations (op.sop to op.escalation). */
import { ai, aiSection, c1, col, f, fixedSection, lockedSection, p, whenSet } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { AMEND_POLICY, DOC_LAYOUT, NEVER_BIZ, NEVER_POLICY, POLICY_LAYOUT, docHeader, listRows, owner, policyHeader, policyInputs } from "@/lib/products/playbook-ai/catalogue/templates/t3-operations/common";

const sop = defineTemplate("op.sop", {
  title: "Standard Operating Procedure: {{input.process}}",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.text("process", "Process"), f.text("department", "Department"),
    f.longtext("purpose_notes", "Why the process exists", { feedsSections: ["purpose"] }),
    f.longtext("scope_notes", "What the procedure covers and does not cover", { feedsSections: ["scope"] }),
    f.rows("roles", "Roles", [col("role", "Role"), col("responsibility", "Responsibility")], { minRows: 1, maxRows: 15 }),
    f.rows("steps", "Steps", [col("step", "What is done"), col("who", "Who does it"), col("notes", "Notes or checks", "text", false)], { minRows: 1, maxRows: 60 }),
    f.longtext("exception_notes", "Exceptions and special cases", { required: false, feedsSections: ["exceptions"] }),
    f.text("escalate_to", "Escalate problems to")],
  sections: [
    aiSection("purpose", "Purpose", [policyHeader(), p("[[input.purpose_text|Purpose|Why the process exists]]")], ai("State the purpose of the procedure in two or three sentences, using only the notes.", ["input.process", "input.department", "input.purpose_notes"], NEVER_POLICY, { tone: "instructional", minWords: 20, maxWords: 90 })),
    aiSection("scope", "Scope", [p("[[input.scope_text|Scope|What is and is not covered]]")], ai("State what the procedure covers and does not cover, using only the notes.", ["input.process", "input.scope_notes"], NEVER_POLICY, { tone: "instructional", minWords: 20, maxWords: 100 })),
    fixedSection("responsibilities", "Responsibilities", [listRows("input.roles", "**{{item.role}}**: {{item.responsibility}}")]),
    fixedSection("steps", "Procedure", [p("Follow the steps in order. Record each completed step as the process requires."), listRows("input.steps", "{{item.step}} (by {{item.who}}). {{item.notes|text}}")]),
    aiSection("exceptions", "Exceptions", [p("[[input.exception_text|Exceptions|What to do in special cases]]")], ai("Describe the exceptions and what to do in each, using only the notes. If none were supplied, write nothing.", ["input.exception_notes"], NEVER_POLICY, { tone: "instructional", minWords: 5, maxWords: 110 })),
    fixedSection("escalation", "Escalation", [p("If the procedure cannot be followed, or something goes wrong that the steps do not cover, stop and tell {{input.escalate_to}} at once. {{input.owner}} reviews this procedure regularly and keeps it current.")]),
  ],
});

const workInstruction = defineTemplate("op.work_instruction", {
  title: "Work Instruction: {{input.task}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("task", "Task"), f.longtext("tools", "Tools and materials needed"),
    f.rows("steps", "Instructions", [col("instruction", "Instruction"), col("check", "Check before moving on", "text", false)], { minRows: 1, maxRows: 40 })],
  sections: [
    fixedSection("steps", "Steps", [docHeader([["Task", "{{input.task}}"]]), p("**Tools and materials:** {{input.tools}}"), listRows("input.steps", "{{item.instruction}}")]),
    fixedSection("checks", "Checks", [listRows("input.steps", "{{item.instruction}}: check {{item.check|text|that the step is complete and nothing is left unfinished}}"), p("If a check fails, stop and tell your supervisor before continuing.")]),
  ],
});

const checklist = defineTemplate("op.checklist", {
  title: "Checklist: {{input.process}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("process", "Process"), f.rows("items", "Checklist items", [col("item", "Item"), col("owner", "Who checks it", "text", false)], { minRows: 1, maxRows: 60 })],
  sections: [fixedSection("items", "Items", [docHeader([["Process", "{{input.process}}"]]), p("Tick each item when it is done. Date and name the checklist when complete."), listRows("input.items", "[ ] {{item.item}} ({{item.owner|text|any team member}})"), p("Completed by: ______________________    Date: ______________________")])],
});

const incident = defineTemplate("op.incident_report", {
  title: "Incident Report: {{input.incident}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("incident", "Incident"), f.date("incident_date", "Date"), f.text("location", "Where it happened"), f.text("reported_by", "Reported by"),
    f.longtext("description_notes", "What happened", { help: "Facts only: what, when, who was involved and what was seen.", feedsSections: ["summary"] }),
    f.longtext("impact_notes", "Impact", { feedsSections: ["impact"] }),
    f.rows("actions", "Actions taken and still needed", [col("action", "Action"), col("owner", "Owner"), col("status", "Status")], { minRows: 1, maxRows: 20 })],
  sections: [
    aiSection("summary", "Summary", [docHeader([["Incident", "{{input.incident}}"], ["Date", "{{input.incident_date|date}}"], ["Location", "{{input.location}}"], ["Reported by", "{{input.reported_by}}"]]), p("[[input.summary_text|Summary|Factual account of the incident]]")], ai("Write a factual account of the incident in the order it happened, using only the notes. Do not assign blame.", ["input.incident", "input.description_notes"], [...NEVER_BIZ, "blame, speculation about causes or the names of people not supplied"], { tone: "neutral", minWords: 40, maxWords: 180 })),
    aiSection("impact", "Impact", [p("[[input.impact_text|Impact|Who or what was affected]]")], ai("Describe who or what was affected and how badly, using only the notes.", ["input.impact_notes"], NEVER_BIZ, { tone: "neutral", minWords: 20, maxWords: 120 })),
    fixedSection("actions", "Actions", [listRows("input.actions", "{{item.action}} (owner: {{item.owner}}; status: {{item.status}})"), p("Where the law requires an incident to be reported to an authority, the owner arranges this and records when it was done.")]),
  ],
});

const bcp = defineTemplate("op.bcp", {
  title: "Business Continuity Plan",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.longtext("scope_notes", "Scope of the plan", { feedsSections: ["scope"] }),
    f.longtext("risk_notes", "Disruptions the plan prepares for", { feedsSections: ["risks"] }),
    f.rows("functions", "Critical functions", [col("function", "Function"), col("owner", "Owner"), col("recovery_target", "Time to restore"), col("strategy", "How it is restored")], { minRows: 1, maxRows: 25 }),
    f.rows("contacts", "Key contacts", [col("name", "Name"), col("role", "Role"), col("contact", "Phone or email")], { minRows: 1, maxRows: 30 })],
  sections: [
    aiSection("scope", "Scope", [policyHeader(), p("[[input.scope_text|Scope|What the plan covers]]")], ai("State what the plan covers, using only the notes.", ["company.name", "input.scope_notes"], NEVER_POLICY, { tone: "instructional", minWords: 25, maxWords: 110 })),
    aiSection("risks", "Risks", [p("[[input.risk_text|Risks|Disruptions the plan prepares for]]")], ai("Describe the disruptions the plan prepares for, using only the notes.", ["input.risk_notes"], NEVER_POLICY, { tone: "instructional", minWords: 25, maxWords: 130 })),
    fixedSection("recovery", "Recovery", [listRows("input.functions", "**{{item.function}}** (owner: {{item.owner}}): restore within {{item.recovery_target}}. {{item.strategy}}"), p("When a disruption occurs, the owner of the affected function tells the plan owner, starts the recovery strategy above, and keeps a log of what is done. Staff are told what to do through the contacts listed here.")]),
    fixedSection("contacts", "Contacts", [listRows("input.contacts", "{{item.name}}, {{item.role}}: {{item.contact}}"), p("The contact list is checked regularly and whenever a person changes. The plan is tested through an exercise and updated from what is learned.")]),
  ],
});

const qualityManual = defineTemplate("op.quality_manual", {
  title: "Quality Manual",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.text("standards", "Standards or frameworks followed", { help: "Name them exactly, for example the standard the company is certified to." }),
    f.longtext("scope_notes", "Scope of the quality system", { feedsSections: ["policy"] }), f.longtext("policy_notes", "Quality policy points", { feedsSections: ["policy"] }),
    f.rows("processes", "Core processes", [col("process", "Process"), col("owner", "Owner"), col("records", "Records kept")], { minRows: 1, maxRows: 30 }),
    f.text("audit_cycle", "Internal audit cycle", { help: "For example 'each process audited at least once a year'." })],
  sections: [
    aiSection("policy", "Quality policy", [policyHeader(), p("The Company follows {{input.standards}}. [[input.policy_text|Quality policy|Scope and the Company's quality policy]]")], ai("Write the quality policy and the scope of the quality system, using only the notes. Do not claim any certification.", ["company.name", "input.standards", "input.scope_notes", "input.policy_notes"], [...NEVER_POLICY, "certifications, audits passed or accreditations"], { tone: "formal", minWords: 60, maxWords: 200 })),
    fixedSection("processes", "Processes", [listRows("input.processes", "**{{item.process}}**: owner {{item.owner}}; records: {{item.records}}"), p("Each process owner keeps the process documented, measures it, and records what is needed to show that it was followed.")]),
    fixedSection("audit", "Audit and improvement", [p("The quality system is audited internally: {{input.audit_cycle}}. Audit findings, customer complaints and incidents are recorded, their causes are examined, and corrective actions are tracked to closure by the process owner. Management reviews the results regularly and decides on improvements.")]),
  ],
});

const hse = defineTemplate("op.hse_policy", {
  title: "Health and Safety Policy",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.rows("sites", "Sites covered", [col("site", "Site or office"), col("officer", "Safety officer or responsible person")], { minRows: 1, maxRows: 20 }),
    f.longtext("commitment_notes", "Commitments the company makes", { required: false, feedsSections: ["policy"] }),
    f.longtext("emergency_notes", "Emergency arrangements", { help: "Fire, first aid, evacuation, assembly points and emergency contacts, as they exist at each site.", feedsSections: ["emergency"] })],
  sections: [
    hybridPolicy(),
    lockedSection("duties", "Duties", [
      c1("The Company shall provide a workplace that is safe and without risk to health as far as is reasonably practicable, shall provide information, instruction and training where needed, and shall comply with the health, safety and environmental laws that apply to it."),
      c1("Each person at the workplace shall take reasonable care of their own safety and that of others, follow safety instructions, use protective equipment where it is provided, and not interfere with safety equipment."),
      c1("Everyone shall report accidents, near misses and unsafe conditions promptly to their supervisor or the safety officer. No one will be penalised for reporting in good faith."),
      c1("The safety officer for each site keeps records of accidents and inspections, and the Company reports accidents to the authorities where the law requires."),
    ]),
    aiSection("emergency", "Emergency arrangements", [p("[[input.emergency_text|Emergency|Fire, first aid, evacuation and contacts]]")], ai("Describe the emergency arrangements, using only the notes. Do not invent contact numbers or equipment.", ["input.emergency_notes"], [...NEVER_POLICY, "telephone numbers, equipment or drills not named in the notes"], { tone: "instructional", minWords: 30, maxWords: 180 })),
  ],
});
function hybridPolicy() {
  return aiSection("policy", "Policy", [policyHeader(), p("{{company.legal_name}} is committed to the health, safety and welfare of everyone who works at or visits its premises. This policy applies at the following sites:"), listRows("input.sites", "{{item.site}}: safety officer {{item.officer}}"), p("[[input.commitment_text|Commitment|The Company's commitments on safety]]")],
    ai("State the Company's commitments on health and safety in a short paragraph, using only the notes. If none were supplied, use a plain statement of commitment to a safe workplace and legal compliance.", ["company.name", "input.commitment_notes"], NEVER_POLICY, { tone: "formal", minWords: 30, maxWords: 130 }));
}

const visitor = defineTemplate("op.visitor_policy", {
  title: "Visitor Policy",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.text("reception", "Where visitors report"), f.longtext("rules_notes", "Extra rules for visitors", { required: false, feedsSections: ["policy"] })],
  sections: [
    aiSection("policy", "Policy", [policyHeader(), p("The Company welcomes visitors and also protects its people, information and property. Every visitor must report at {{input.reception}} and may enter only after being received by their host. [[input.rules_text|Rules|Further rules for visitors]]")], ai("Add any further visitor rules in the notes as short sentences. If there are none, write nothing.", ["input.rules_notes"], NEVER_POLICY, { tone: "instructional", minWords: 5, maxWords: 100 })),
    lockedSection("process", "Process", [
      c1("The host tells reception of the visit in advance, with the visitor's name, organisation and purpose."),
      c1("Reception records the visitor's name, organisation, host, time in and time out, and checks identity before issuing a visitor pass, which the visitor wears visibly."),
      c1("The host accompanies the visitor at all times and does not leave the visitor alone in areas where confidential information or equipment is."),
      c1("Visitors may not photograph, record or connect devices to Company systems without the host's permission."),
      c1("The visitor returns the pass when leaving and reception records the time out. Staff who see an unescorted visitor politely ask them to return to reception."),
      c1(AMEND_POLICY),
    ]),
  ],
});

const handover = defineTemplate("op.handover", {
  title: "Handover Note",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("from", "Handing over (name and role)"), f.text("to", "Taking over (name and role)"), f.date("handover_date", "Date of handover"),
    f.longtext("status_notes", "Current status of the work", { feedsSections: ["status"] }),
    f.rows("pending", "Pending items", [col("item", "Item"), col("status", "Status"), col("due", "Due date", "date", false)], { minRows: 1, maxRows: 40 }),
    f.rows("contacts", "Key contacts", [col("name", "Name"), col("role", "Role or organisation"), col("contact", "Phone or email")], { required: false, minRows: 0, maxRows: 20 })],
  sections: [
    aiSection("status", "Status", [docHeader([["From", "{{input.from}}"], ["To", "{{input.to}}"], ["Date", "{{input.handover_date|date}}"]]), p("[[input.status_text|Status|Current state of the work]]")], ai("Summarise the current status of the work in clear short paragraphs, using only the notes.", ["input.status_notes"], NEVER_BIZ, { tone: "instructional", minWords: 40, maxWords: 200 })),
    fixedSection("pending", "Pending", [listRows("input.pending", "{{item.item}}: {{item.status}} (due {{item.due|date|not fixed}})")]),
    fixedSection("contacts", "Contacts", [whenSet("input.contacts", [listRows("input.contacts", "{{item.name}}, {{item.role}}: {{item.contact}}")]), p("The person taking over confirms that they understand the status and pending items, and may ask the person handing over questions for a reasonable period after the handover.")]),
  ],
});

const escalation = defineTemplate("op.escalation", {
  title: "Escalation Matrix",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("area", "Service or process covered"),
    f.rows("levels", "Levels", [col("level", "Level"), col("who", "Who"), col("contact", "Contact"), col("when", "Escalate to this level when")], { minRows: 2, maxRows: 8 })],
  sections: [fixedSection("matrix", "Matrix", [docHeader([["Covers", "{{input.area}}"]]), listRows("input.levels", "**{{item.level}}**: {{item.who}} ({{item.contact}}). Escalate when: {{item.when}}"), p("Start at the first level. Move to the next level when the stated condition is met or the issue is not resolved in the time stated. Record every escalation with the time and the person told.")])],
});


export const OP_DOCS: TemplateDef[] = [sop, workInstruction, checklist, incident, bcp, qualityManual, hse, visitor, handover, escalation];
