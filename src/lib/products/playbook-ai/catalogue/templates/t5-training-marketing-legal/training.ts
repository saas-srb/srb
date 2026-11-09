/** T5 training (tr.needs to tr.report): ten documents for planning, delivering, assessing and recording training. */
import { ai, aiSection, bullets, callout, col, f, fixedSection, hybridSection, kv, p, table, whenSet } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { CERTIFICATE_LAYOUT, DOC_LAYOUT, FORM_LAYOUT, NEVER_TRAINING, blankLine, listRows, optionalText, trainingHeader, whenUnset } from "@/lib/products/playbook-ai/catalogue/templates/t5-training-marketing-legal/common";

const needs = defineTemplate("tr.needs", {
  title: "Training Needs Analysis: {{input.dept}}",
  layout: DOC_LAYOUT,
  inputs: [
    f.text("dept", "Department or team", { help: "The group whose training needs are being analysed." }),
    f.longtext("evidence_notes", "How the needs were identified", { help: "For example appraisals, manager input, audits, customer feedback or a skills survey.", feedsSections: ["method"] }),
    f.rows("skills", "Skills reviewed", [col("skill", "Skill or topic"), col("current", "Current level"), col("required", "Level required"), col("impact", "Why it matters to the work", "text", false)], { minRows: 1, maxRows: 40 }),
    f.longtext("gap_notes", "Observations on the gaps", { required: false, help: "Facts only: who is affected, what was seen, how it shows up in the work.", feedsSections: ["gaps"] }),
    f.longtext("priority_notes", "What should be trained first, and why", { feedsSections: ["priorities"] }),
    optionalText("next_review", "When the analysis will be reviewed", "For example 'after the next appraisal cycle'."),
  ],
  sections: [
    aiSection("method", "Method", [trainingHeader([["Department", "{{input.dept}}"]]), p("[[input.method_text|Method|How the needs were identified]]")],
      ai("Describe in two or three sentences how the training needs were identified, using only the notes.", ["input.dept", "input.evidence_notes"], NEVER_TRAINING, { tone: "neutral", minWords: 20, maxWords: 100 })),
    hybridSection("gaps", "Gaps", [p("The skills reviewed, the level found and the level the work requires are listed below."), listRows("input.skills", "**{{item.skill}}**: current level {{item.current}}; level required {{item.required}}. {{item.impact|text}}"), p("[[input.gaps_text|Gaps|Summary of the main gaps]]")],
      ai("Summarise the main gaps in a short paragraph, using only the skills table and the notes. Do not add gaps that are not listed.", ["input.dept", "input.skills", "input.gap_notes"], NEVER_TRAINING, { tone: "neutral", minWords: 30, maxWords: 140 })),
    aiSection("priorities", "Priorities", [p("[[input.priorities_text|Priorities|What to train first and why]]")],
      ai("State what should be trained first and the reason, in order of priority, using only the notes.", ["input.dept", "input.skills", "input.priority_notes"], NEVER_TRAINING, { tone: "formal", minWords: 30, maxWords: 150 })),
    fixedSection("next_steps", "Next steps", [p("The priorities above are turned into a training plan with objectives, a schedule, trainers and a budget. Progress is checked against the gaps listed in this analysis."), whenSet("input.next_review", [p("This analysis will be reviewed: {{input.next_review}}.")])]),
  ],
});

const plan = defineTemplate("tr.plan", {
  title: "Training Plan: {{input.programme}}",
  layout: DOC_LAYOUT,
  inputs: [
    f.text("programme", "Programme name"),
    f.text("audience", "Who will be trained", { help: "For example a team, a role or a batch of new joiners." }),
    f.longtext("objective_notes", "What the training must achieve", { help: "Describe the change in knowledge, skill or behaviour expected.", feedsSections: ["objectives"] }),
    f.date("start_date", "Start date"), f.date("end_date", "End date"),
    f.rows("schedule", "Schedule", [col("session", "Session or topic"), col("date", "Date", "date"), col("trainer", "Trainer"), col("mode", "Mode", "text", false)], { minRows: 1, maxRows: 60 }),
    f.rows("trainers", "Trainers", [col("name", "Name"), col("role", "Internal or external, and area of expertise")], { minRows: 1, maxRows: 15 }),
    f.rows("budget", "Budget", [col("item", "Cost item"), col("amount", "Amount", "money")], { minRows: 0, maxRows: 25, required: false }),
    f.money("budget_total", "Total budget", { required: false }),
  ],
  sections: [
    aiSection("objectives", "Objectives", [trainingHeader([["Programme", "{{input.programme}}"], ["Audience", "{{input.audience}}"], ["Dates", "{{input.start_date|date}} to {{input.end_date|date}}"]]), p("[[input.objectives_text|Objectives|What the training must achieve]]")],
      ai("Write the objectives of the training as a short intro and a bullet list, using only the notes. Each objective should say what the learner will be able to do.", ["input.programme", "input.audience", "input.objective_notes"], NEVER_TRAINING, { tone: "instructional", minWords: 30, maxWords: 140 })),
    fixedSection("schedule", "Schedule", [listRows("input.schedule", "{{item.date|date}}: **{{item.session}}** with {{item.trainer}} ({{item.mode|text|mode to be confirmed}})")]),
    fixedSection("trainers", "Trainers", [listRows("input.trainers", "**{{item.name}}**: {{item.role}}")]),
    fixedSection("budget", "Budget", [whenSet("input.budget", [listRows("input.budget", "{{item.item}}: {{item.amount|money}}")]), whenSet("input.budget_total", [p("**Total budget:** {{input.budget_total|money}} ({{input.budget_total|words}}).")]), p("Spending above the approved budget needs the approval of the budget owner before it is incurred.")]),
  ],
});

const curriculum = defineTemplate("tr.curriculum", {
  title: "Curriculum: {{input.course}}",
  layout: DOC_LAYOUT,
  inputs: [
    f.text("course", "Course title"),
    f.select("level", "Level", ["Beginner", "Intermediate", "Advanced"]),
    f.number("hours", "Total hours", { min: 1, max: 2000 }),
    optionalText("prerequisites", "Prerequisites", "What learners should already know or have."),
    f.rows("modules", "Modules", [col("module", "Module title"), col("topics", "Topics covered"), col("hours", "Hours", "number"), col("mode", "Mode of delivery", "text", false)], { minRows: 1, maxRows: 40 }),
    f.longtext("outcome_notes", "What learners will be able to do at the end", { feedsSections: ["outcomes"] }),
  ],
  sections: [
    fixedSection("overview", "Course details", [kv([["Course", "{{input.course}}"], ["Level", "{{input.level}}"], ["Total hours", "{{input.hours|number}}"], ["Provided by", "{{company.name}}"], ["Reference", "{{doc.number||To be assigned on issue}}"]]), whenSet("input.prerequisites", [p("**Prerequisites:** {{input.prerequisites}}")])]),
    fixedSection("modules", "Modules", [p("The course is taught in the modules below, in this order."), listRows("input.modules", "**{{item.module}}** ({{item.hours|number}} hours, {{item.mode|text|mode to be confirmed}}): {{item.topics}}")]),
    aiSection("outcomes", "Outcomes", [p("[[input.outcomes_text|Outcomes|What learners will be able to do]]")],
      ai("List the learning outcomes as a short intro and bullets, using only the notes and the module list.", ["input.course", "input.level", "input.modules", "input.outcome_notes"], NEVER_TRAINING, { tone: "instructional", minWords: 30, maxWords: 140 })),
  ],
});

const lessonPlan = defineTemplate("tr.lesson_plan", {
  title: "Lesson Plan: {{input.topic}}",
  layout: DOC_LAYOUT,
  inputs: [
    f.text("topic", "Topic"), f.number("duration", "Session length (minutes)", { min: 5, max: 960 }), f.text("trainer", "Trainer"),
    f.longtext("objective_notes", "What learners should be able to do after the session", { feedsSections: ["objectives"] }),
    f.rows("activities", "Activities in order", [col("activity", "Activity"), col("minutes", "Minutes", "number"), col("method", "Method (talk, demo, exercise, discussion)"), col("materials", "Materials needed", "text", false)], { minRows: 1, maxRows: 25 }),
    f.longtext("assessment_notes", "How learning will be checked", { feedsSections: ["assessment"] }),
  ],
  sections: [
    aiSection("objectives", "Objectives", [trainingHeader([["Topic", "{{input.topic}}"], ["Trainer", "{{input.trainer}}"], ["Duration", "{{input.duration|number}} minutes"]]), p("[[input.objectives_text|Objectives|What learners should be able to do]]")],
      ai("Write the session objectives as a short bullet list, each starting with a verb, using only the notes.", ["input.topic", "input.objective_notes"], NEVER_TRAINING, { tone: "instructional", minWords: 20, maxWords: 100 })),
    fixedSection("activities", "Activities", [p("Run the activities in this order. Adjust the time of an activity only if the total stays within the session length."), listRows("input.activities", "**{{item.activity}}** ({{item.minutes|number}} minutes, {{item.method}}). Materials: {{item.materials|text|none needed}}")]),
    aiSection("assessment", "Assessment", [p("[[input.assessment_text|Assessment|How learning is checked]]")],
      ai("Describe how the trainer will check that learners met the objectives, using only the notes.", ["input.topic", "input.assessment_notes"], NEVER_TRAINING, { tone: "instructional", minWords: 20, maxWords: 100 })),
  ],
});

const material = defineTemplate("tr.material", {
  title: "{{input.topic}}: Learner Handout",
  layout: DOC_LAYOUT,
  inputs: [
    f.text("topic", "Topic"), f.text("audience", "Who the handout is for"),
    f.longtext("intro_notes", "Why this topic matters to the learner", { feedsSections: ["intro"] }),
    f.longtext("content_notes", "The content to teach", { help: "Paste or type the points, steps, definitions and examples the handout must cover.", feedsSections: ["content"] }),
    f.longtext("exercise_notes", "Exercises or questions for the learner", { required: false, feedsSections: ["exercises"] }),
    f.longtext("summary_notes", "Key points to remember", { required: false, feedsSections: ["summary"] }),
  ],
  sections: [
    aiSection("intro", "Introduction", [kv([["Topic", "{{input.topic}}"], ["For", "{{input.audience}}"], ["Provided by", "{{company.name}}"]]), p("[[input.intro_text|Introduction|Why the topic matters]]")],
      ai("Introduce the topic to the learner in a short paragraph and say what they will learn, using only the notes.", ["input.topic", "input.audience", "input.intro_notes"], NEVER_TRAINING, { tone: "instructional", minWords: 40, maxWords: 140 })),
    aiSection("content", "Content", [p("[[input.content_text|Content|The teaching content, with headings, short paragraphs and lists]]")],
      ai("Organise the notes into clear subheadings, short paragraphs and lists a learner can follow. Explain only what the notes contain; do not add facts, figures, rules or examples that are not in them.", ["input.topic", "input.audience", "input.content_notes"], NEVER_TRAINING, { tone: "instructional", minWords: 150, maxWords: 700 })),
    aiSection("exercises", "Exercises", [p("[[input.exercises_text|Exercises|Questions or tasks for the learner]]")],
      ai("Turn the notes into questions or tasks the learner can attempt. Do not include answers. If no notes were supplied, write nothing.", ["input.topic", "input.exercise_notes"], NEVER_TRAINING, { tone: "instructional", minWords: 5, maxWords: 250 })),
    aiSection("summary", "Summary", [p("[[input.summary_text|Summary|Key points to remember]]")],
      ai("Summarise the key points to remember as a short bullet list, using only the content notes and the key points supplied.", ["input.topic", "input.content_notes", "input.summary_notes"], NEVER_TRAINING, { tone: "instructional", minWords: 20, maxWords: 140 })),
  ],
});

const assessment = defineTemplate("tr.assessment", {
  title: "Assessment: {{input.topic}}",
  layout: FORM_LAYOUT,
  inputs: [
    f.text("topic", "Topic or course"), f.number("marks", "Total marks", { min: 1, max: 1000 }), f.number("time_minutes", "Time allowed (minutes)", { min: 5, max: 600 }),
    f.number("pass_marks", "Pass marks", { required: false, min: 1, max: 1000 }),
    f.rows("questions", "Questions", [col("question", "Question"), col("marks", "Marks", "number"), col("answer", "Correct answer or marking guide")], { minRows: 1, maxRows: 80, help: "Questions are printed in this order. The answers appear only in the key." }),
  ],
  sections: [
    fixedSection("instructions", "Instructions", [
      kv([["Topic", "{{input.topic}}"], ["Total marks", "{{input.marks|number}}"], ["Time allowed", "{{input.time_minutes|number}} minutes"], ["Reference", "{{doc.number||To be assigned on issue}}"]]),
      whenSet("input.pass_marks", [p("**Pass marks:** {{input.pass_marks|number}}")]),
      blankLine("Name"), blankLine("Employee or learner ID"), blankLine("Date"),
      bullets(["Read every question before you begin.", "Answer all questions. The marks for each question are shown against it.", "Write clearly. Do not use notes or discuss answers with others unless the trainer has said you may.", "Return this paper to the trainer when the time is over."]),
    ]),
    fixedSection("questions", "Questions", [listRows("input.questions", "{{item.question}} ({{item.marks|number}} marks)")]),
    fixedSection("key", "Key", [callout("important", "Trainer copy. Remove this page before the paper is given to learners."), listRows("input.questions", "{{item.question}}: {{item.answer}} ({{item.marks|number}} marks)")]),
  ],
  disclaimers: ["The key section is for the trainer only; remove it before the paper is handed out."],
});

const certificate = defineTemplate("tr.certificate", {
  title: "Certificate of Completion",
  layout: CERTIFICATE_LAYOUT,
  inputs: [
    f.text("learner", "Learner's full name"), f.text("course", "Course or programme"), f.date("completed_on", "Date of completion"),
    f.number("hours", "Course length (hours)", { required: false, min: 1, max: 2000 }),
    optionalText("result", "Result or grade", "Only if the course awards one, for example 'with distinction'."),
    optionalText("conducted_by", "Conducted by", "Leave blank to use the company name."),
  ],
  sections: [
    fixedSection("certificate", "Certificate text", [
      p("This is to certify that", "center"),
      p("**{{input.learner}}**", "center"),
      p("has completed the course", "center"),
      p("**{{input.course}}**", "center"),
      whenSet("input.hours", [p("a course of {{input.hours|number}} hours,", "center")]),
      whenSet("input.conducted_by", [p("conducted by {{input.conducted_by}} and completed on {{input.completed_on|date}}.", "center")]),
      whenUnset("input.conducted_by", [p("conducted by {{company.name}} and completed on {{input.completed_on|date}}.", "center")]),
      whenSet("input.result", [p("Result: {{input.result}}", "center")]),
      p("Certificate number: {{doc.number||To be assigned on issue}}", "center"),
      p("Authorised signatory: ______________________________", "center"),
      p("{{company.signatory_name}}, {{company.signatory_designation}}", "center"),
      p("{{company.legal_name}}", "center"),
    ]),
  ],
});

const FEEDBACK_STATEMENTS = [
  "The objectives of the training were clear", "The content was relevant to my work", "The trainer explained the topics well",
  "The exercises and examples helped me learn", "The materials were useful", "The time and pace were right",
  "The venue or online set-up was suitable", "I can apply what I learned in my work",
];
const feedbackRows: string[][] = FEEDBACK_STATEMENTS.map((x) => [x, " ", " ", " ", " "]);

const feedback = defineTemplate("tr.feedback", {
  title: "Training Feedback Form: {{input.course}}",
  layout: FORM_LAYOUT,
  inputs: [
    f.text("course", "Course or session"), optionalText("trainer", "Trainer"), f.date("session_date", "Date", { required: false }),
    f.rows("extra", "Additional rating statements", [col("statement", "Statement")], { required: false, minRows: 0, maxRows: 10, help: "Added after the standard statements, for example about a tool or material used." }),
  ],
  sections: [
    fixedSection("ratings", "Ratings", [
      kv([["Course", "{{input.course}}"], ["Trainer", "{{input.trainer|text|Not stated}}"], ["Date", "{{input.session_date|date|Not stated}}"], ["Name (optional)", "______________________________"]]),
      p("Please tick one box for each statement."),
      table([46, 13.5, 13.5, 13.5, 13.5], ["Statement", "Agree strongly", "Agree", "Disagree", "Disagree strongly"], feedbackRows),
      whenSet("input.extra", [p("Additional statements:"), listRows("input.extra", "{{item.statement}}: Agree strongly [ ], Agree [ ], Disagree [ ], Disagree strongly [ ]")]),
    ]),
    fixedSection("comments", "Comments", [
      p("What was most useful in this training?"), p("______________________________________________________________"),
      p("What should be improved?"), p("______________________________________________________________"),
      p("What other training would help you in your work?"), p("______________________________________________________________"),
      p("Thank you. Your feedback is used to improve future training."),
    ]),
  ],
});

const blankRows: string[][] = Array.from({ length: 8 }, () => [" ", " ", " ", " "]);

const attendance = defineTemplate("tr.attendance", {
  title: "Attendance Sheet: {{input.session}}",
  layout: FORM_LAYOUT,
  inputs: [
    f.text("session", "Session or course"), f.date("session_date", "Date"), optionalText("venue", "Venue or online link"), f.text("trainer", "Trainer"),
    f.rows("learners", "Expected learners", [col("name", "Name"), col("id", "Employee or learner ID", "text", false)], { minRows: 1, maxRows: 150 }),
  ],
  sections: [
    fixedSection("table", "Attendance table", [
      kv([["Session", "{{input.session}}"], ["Date", "{{input.session_date|date}}"], ["Venue", "{{input.venue|text|Not stated}}"], ["Trainer", "{{input.trainer}}"]]),
      p("Each learner signs against their name. Mark absent learners as absent; do not leave the signature blank."),
      listRows("input.learners", "**{{item.name}}** (ID: {{item.id|text|not given}}). Signature: ____________________  In: ________  Out: ________"),
      p("Learners not on the list above sign here:"),
      table([32, 20, 28, 20], ["Name", "ID", "Signature", "Time in"], blankRows),
      p("Trainer's signature: ______________________________    Date: ______________"),
    ]),
  ],
});

const report = defineTemplate("tr.report", {
  title: "Training Completion Report: {{input.course}}",
  layout: DOC_LAYOUT,
  inputs: [
    f.text("course", "Course or programme"), f.date("start_date", "Start date"), f.date("end_date", "End date"), f.text("trainer", "Trainer"),
    f.number("enrolled", "Learners enrolled", { min: 0, max: 5000 }), f.number("completed", "Learners who completed", { min: 0, max: 5000 }),
    f.rows("results", "Results", [col("measure", "Measure"), col("result", "Result")], { minRows: 1, maxRows: 30, help: "For example average assessment score, feedback rating, pass count. Enter the figures as they are recorded." }),
    f.longtext("summary_notes", "How the training went", { feedsSections: ["summary"] }),
    f.longtext("action_notes", "Follow-up actions", { feedsSections: ["actions"] }),
  ],
  sections: [
    aiSection("summary", "Summary", [trainingHeader([["Course", "{{input.course}}"], ["Dates", "{{input.start_date|date}} to {{input.end_date|date}}"], ["Trainer", "{{input.trainer}}"], ["Enrolled", "{{input.enrolled|number}}"], ["Completed", "{{input.completed|number}}"]]), p("[[input.summary_text|Summary|How the training went]]")],
      ai("Summarise how the training went in a short paragraph, using only the notes and the figures supplied.", ["input.course", "input.enrolled", "input.completed", "input.summary_notes"], NEVER_TRAINING, { tone: "neutral", minWords: 40, maxWords: 150 })),
    fixedSection("results", "Results", [listRows("input.results", "**{{item.measure}}**: {{item.result}}")]),
    aiSection("actions", "Actions", [p("[[input.actions_text|Actions|Follow-up actions and who owns them]]")],
      ai("List the follow-up actions as a short bullet list, with owners only if the notes name them.", ["input.course", "input.action_notes"], NEVER_TRAINING, { tone: "instructional", minWords: 20, maxWords: 130 })),
  ],
});

export const TRAINING_TEMPLATES: TemplateDef[] = [needs, plan, curriculum, lessonPlan, material, assessment, certificate, feedback, attendance, report];
