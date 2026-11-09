/** T3 IT and security (it.security_policy to it.srs). Every limit, period and threshold comes from an input. */
import { ai, aiSection, bullets, c1, col, f, fixedSection, hybridSection, lockedSection, p, sig, whenSet } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { AMEND_POLICY, DOC_LAYOUT, NEVER_BIZ, NEVER_POLICY, POLICY_LAYOUT, approvals, docHeader, listRows, owner, policyHeader, policyInputs } from "@/lib/products/playbook-ai/catalogue/templates/t3-operations/common";

const empInput = () => f.person("employee", "Employee", "employee", { help: "The employee who receives and acknowledges the policy." });
const ackBlock = (text: string) => [p(text), sig("Employee", "counterparty", { designation: false }), sig("For the Company (IT)", "company_signatory")];

const securityPolicy = defineTemplate("it.security_policy", {
  title: "Information Security Policy",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.longtext("scope_notes", "Systems and information covered", { feedsSections: ["scope"] }),
    f.rows("roles", "Security roles", [col("role", "Role"), col("responsibility", "Responsibility")], { minRows: 1, maxRows: 12 }),
    f.longtext("control_notes", "Additional controls the company applies", { required: false, feedsSections: ["controls"] }),
    f.text("report_to", "Where security incidents are reported")],
  sections: [
    lockedSection("purpose", "Purpose", [policyHeader(), p("{{company.legal_name}} depends on information and systems. This policy sets out how the Company protects the confidentiality, integrity and availability of its information and that of its clients, and how everyone who uses its systems is expected to behave.")]),
    aiSection("scope", "Scope", [p("[[input.scope_text|Scope|Systems, information and people covered]]")], ai("State the systems, information and people covered, using only the notes.", ["input.scope_notes"], NEVER_POLICY, { tone: "instructional", minWords: 20, maxWords: 100 })),
    hybridSection("controls", "Controls", [
      c1("Access to systems and information is given on a need-to-know basis, to named individuals, and is removed when no longer needed."),
      c1("Devices and accounts used for Company work are protected by strong authentication, are kept updated, and are protected against malware."),
      c1("Information is classified and handled as the data classification policy requires, and is encrypted where it is sent or stored in a way that creates risk."),
      c1("Important data is backed up and the ability to restore it is tested."),
      c1("Changes to systems follow the change management policy, and software is developed and obtained securely."),
      c1("Everyone who uses the Company's systems receives security awareness training appropriate to their role."),
      p("[[input.controls_extra|Additional controls|Further controls the Company applies]]"),
    ], ai("Add short clauses for any additional controls in the notes. If there are none, write nothing.", ["input.control_notes"], NEVER_POLICY, { tone: "instructional", minWords: 5, maxWords: 110 })),
    fixedSection("roles", "Roles", [listRows("input.roles", "**{{item.role}}**: {{item.responsibility}}"), p("Everyone is responsible for following this policy and for reporting incidents and weaknesses they notice to {{input.report_to}}.")]),
    lockedSection("violations", "Violations", [c1("A breach of this policy may lead to disciplinary action under the Company's policies, up to termination of employment or contract, and to legal action where the law allows."), c1(AMEND_POLICY)]),
  ],
});

const aup = defineTemplate("it.aup", {
  title: "IT Acceptable Use Policy",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), empInput(), f.longtext("extra_rules", "Additional rules", { required: false, feedsSections: ["policy"] }), f.longtext("monitoring_notes", "What the company monitors", { help: "State what the company actually monitors, so the policy is honest and lawful.", feedsSections: ["monitoring"] })],
  sections: [
    hybridSection("policy", "Policy", [policyHeader(), p("Company IT resources, including computers, phones, networks, email, accounts and software, are provided for the Company's business. Limited personal use is allowed if it does not affect work, security or the Company's reputation, and breaks no rule in this policy."), p("[[input.rules_text|Additional rules|Further rules for using IT resources]]")],
      ai("Add short clauses for any additional rules in the notes. If there are none, write nothing.", ["input.extra_rules"], NEVER_POLICY, { tone: "instructional", minWords: 5, maxWords: 100 })),
    lockedSection("rules", "Do and do not", [
      p("**Do:**"), bullets(["keep your passwords and devices secure and lock your screen when away;", "use only approved software and services for Company information;", "report lost devices, suspicious messages and incidents at once;", "treat Company and client information as confidential."]),
      p("**Do not:**"), bullets(["share your account or password;", "install unlicensed or unapproved software, or disable security tools;", "access, store or send unlawful, offensive or discriminatory material;", "use Company resources for personal gain, to harass anyone, or to infringe copyright;", "send Company information to personal accounts or unapproved services."]),
    ]),
    aiSection("monitoring", "Monitoring", [p("[[input.monitoring_text|Monitoring|What is monitored and why]]")], ai("State clearly, in a short paragraph, what the Company monitors and why, using only the notes. Add that monitoring is done as the law permits.", ["input.monitoring_notes"], [...NEVER_POLICY, "monitoring practices that are not in the notes"], { tone: "formal", minWords: 30, maxWords: 130 })),
    lockedSection("acknowledgement", "Acknowledgement", [c1("Misuse of IT resources may lead to withdrawal of access and disciplinary action."), c1(AMEND_POLICY), ...ackBlock("I, {{employee.name}}, have read and understood this policy and agree to follow it.")]),
  ],
});

const password = defineTemplate("it.password", {
  title: "Password Policy",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.number("min_length", "Minimum password length (characters)", { min: 8, max: 128 }),
    f.select("mfa", "Multi-factor authentication", ["Required for all accounts", "Required for email, remote access and administrator accounts", "Recommended"]),
    f.number("rotation_days", "Days before a password must change", { required: false, min: 1, max: 730, help: "Leave blank if passwords change only when compromised." })],
  sections: [fixedSection("policy", "Policy", [policyHeader(),
    c1("Passwords must be at least {{input.min_length|number}} characters long, must not be easily guessed, and must not be reused across the Company's systems and personal services."),
    whenSet("input.rotation_days", [c1("Passwords must be changed every {{input.rotation_days|number}} days, and whenever there is any sign that they may be compromised.")]),
    c1("Multi-factor authentication: {{input.mfa}}."),
    c1("Passwords must never be shared, written where others can see them, or sent by email or chat. Use the Company's approved password manager to store them."),
    c1("Default passwords must be changed before a system is used. Accounts are locked after repeated failed attempts, as the system allows, and locked accounts are unlocked only after the user's identity is verified."),
    c1("A user who suspects a password has been exposed must change it at once and report it to IT."), c1(AMEND_POLICY)])],
});

const access = defineTemplate("it.access", {
  title: "Access Control Policy",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.rows("roles", "Access roles", [col("role", "Role"), col("access", "Systems and level of access")], { minRows: 1, maxRows: 25 }),
    f.number("review_months", "Access reviews are done every (months)", { min: 1, max: 36 })],
  sections: [
    fixedSection("policy", "Policy", [policyHeader(), c1("Access to systems and information is granted on the principle of least privilege: each person receives only the access their role needs."), c1("Access is granted to named individuals on the approval of their manager and the system owner, and is recorded. Shared accounts are not allowed except where a system cannot work otherwise, and then use is logged."), c1("Privileged and administrator access needs separate approval, is used only for administration, and is reviewed more closely."), c1("The standard roles and their access are:"), listRows("input.roles", "**{{item.role}}**: {{item.access}}"), c1("Access is reviewed by system owners every {{input.review_months|number}} months, and unneeded access is removed."), c1(AMEND_POLICY)]),
    fixedSection("lifecycle", "Joiner, mover and leaver", [c1("**Joiners** receive access only after HR confirms their joining and the manager requests it."), c1("**Movers** have access changed to match the new role on the date of the move, and access that is no longer needed is removed."), c1("**Leavers** lose all access on their last working day, or earlier where the Company decides. HR tells IT of every leaver in advance, and IT confirms the removal and recovers devices and credentials.")]),
  ],
});

const byod = defineTemplate("it.byod", {
  title: "Bring Your Own Device Policy",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), empInput(), f.longtext("allowed_notes", "Devices and uses that are allowed", { feedsSections: ["policy"] }), f.longtext("control_notes", "Controls the employee must keep on the device", { feedsSections: ["controls"] })],
  sections: [
    aiSection("policy", "Policy", [policyHeader(), p("[[input.policy_text|Policy|Which personal devices may be used for work and for what]]")], ai("State which personal devices may be used for work and for what purposes, using only the notes.", ["input.allowed_notes"], NEVER_POLICY, { tone: "instructional", minWords: 30, maxWords: 130 })),
    hybridSection("controls", "Controls", [
      c1("The device must be protected with a passcode or biometric lock, kept up to date with security updates, and protected against malware."),
      c1("Company information on the device must be kept in the approved applications and must not be copied to personal storage or accounts."),
      c1("The Company may remove Company information and applications from the device, remotely where necessary, if the device is lost, if the employee leaves, or if there is a security risk. The Company does not intend to access personal content, and will limit any action to Company information as far as it can."),
      c1("A lost or stolen device must be reported to IT at once."),
      p("[[input.controls_extra|Additional controls|Further controls the employee must keep]]"),
    ], ai("Add short clauses for any further controls in the notes. If there are none, write nothing.", ["input.control_notes"], NEVER_POLICY, { tone: "instructional", minWords: 5, maxWords: 100 })),
    lockedSection("acknowledgement", "Acknowledgement", [c1("The employee owns and is responsible for the device and its costs, unless the Company has agreed otherwise in writing."), c1(AMEND_POLICY), ...ackBlock("I, {{employee.name}}, agree to use my personal device for work only on the terms of this policy.")]),
  ],
});

const backupDr = defineTemplate("it.backup_dr", {
  title: "Backup and Disaster Recovery Plan",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.rows("systems", "Systems", [col("system", "System"), col("backup", "Backup frequency and method"), col("rpo", "Recovery point objective"), col("rto", "Recovery time objective"), col("location", "Where backups are kept")], { minRows: 1, maxRows: 30 }),
    f.longtext("recovery_notes", "How recovery is carried out", { feedsSections: ["recovery"] }), f.text("test_cycle", "How often recovery is tested")],
  sections: [
    fixedSection("backups", "Backups", [policyHeader(), listRows("input.systems", "**{{item.system}}**: {{item.backup}}. Kept at {{item.location}}"), p("Backups are encrypted where reasonably possible, stored separately from the systems they protect, and monitored; failures are fixed promptly.")]),
    aiSection("recovery", "Recovery", [listRows("input.systems", "**{{item.system}}**: recovery point {{item.rpo}}; recovery time {{item.rto}}"), p("[[input.recovery_text|Recovery|How recovery is carried out and who leads it]]")], ai("Describe how recovery is carried out and who leads it, using only the notes.", ["input.recovery_notes"], NEVER_POLICY, { tone: "instructional", minWords: 40, maxWords: 180 })),
    fixedSection("tests", "Tests", [p("Recovery is tested {{input.test_cycle}}. Each test records what was restored, how long it took against the targets above, and what failed. Failures lead to fixes that are tracked to closure, and the plan is updated.")]),
  ],
});

const incidentResponse = defineTemplate("it.incident_response", {
  title: "Security Incident Response Plan",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.rows("team", "Response team", [col("role", "Role"), col("name", "Name"), col("contact", "Phone or email")], { minRows: 1, maxRows: 15 }),
    f.longtext("detect_notes", "How incidents are detected and reported", { feedsSections: ["detect"] }),
    f.longtext("notify_notes", "Who must be notified", { help: "Clients, authorities and others, with any deadlines your contracts or the law set. Enter the deadlines exactly.", feedsSections: ["notify"] })],
  sections: [
    aiSection("detect", "Detect and report", [policyHeader(), p("The response team is:"), listRows("input.team", "{{item.role}}: {{item.name}} ({{item.contact}})"), p("[[input.detect_text|Detection|How incidents are detected and reported]]")], ai("Describe how security incidents are detected and reported, using only the notes.", ["input.detect_notes"], NEVER_POLICY, { tone: "instructional", minWords: 30, maxWords: 150 })),
    lockedSection("contain", "Contain", [c1("The incident lead decides the severity and starts a log with the time of each action."), c1("The team contains the incident first: isolating affected systems, disabling compromised accounts and stopping further loss, while preserving evidence."), c1("The team then removes the cause, restores affected systems from clean backups, and checks that the threat is gone before returning to normal service.")]),
    aiSection("notify", "Notify", [p("[[input.notify_text|Notification|Who is notified, by whom and by when]]"), p("Where the law requires an incident to be reported to a regulator or authority, including CERT-In or the Data Protection Board of India, or to people whose data was affected, the incident lead arranges this within the time the law requires.")], ai("State who must be notified, by whom, and by when, using only the notes. Never invent deadlines.", ["input.notify_notes"], [...NEVER_POLICY, "deadlines or authorities that are not in the notes"], { tone: "instructional", minWords: 30, maxWords: 150 })),
    lockedSection("review", "Review", [c1("After every incident the team holds a review without blame, records what happened, the cause, how well the response worked and the actions needed, and tracks those actions to closure."), c1(AMEND_POLICY)]),
  ],
});

const changeMgmt = defineTemplate("it.change_mgmt", {
  title: "IT Change Management Policy",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.longtext("process_notes", "How changes are requested, tested and scheduled", { feedsSections: ["policy"] }), f.rows("approvers", "Approvers", [col("kind", "Kind of change"), col("approver", "Who approves")], { minRows: 1, maxRows: 10 })],
  sections: [
    aiSection("policy", "Policy", [policyHeader(), p("Every change to production systems is requested, assessed, approved, tested, scheduled and recorded. [[input.process_text|Process|How changes are handled]]")], ai("Describe how changes are requested, tested and scheduled, using only the notes.", ["input.process_notes"], NEVER_POLICY, { tone: "instructional", minWords: 40, maxWords: 170 })),
    fixedSection("approvals", "Approvals", [listRows("input.approvers", "**{{item.kind}}**: approved by {{item.approver}}"), c1("Each change has a back-out plan. Emergency changes may be made to restore service or stop harm, with approval after the fact and a review within a short time."), c1("Changes are recorded, and their results and any problems are reviewed. A person may not approve their own change."), c1(AMEND_POLICY)]),
  ],
});

const classification = defineTemplate("it.data_classification", {
  title: "Data Classification Policy",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.rows("levels", "Classification levels", [col("level", "Level"), col("meaning", "What it covers"), col("handling", "How it must be handled")], { minRows: 2, maxRows: 6 })],
  sections: [
    fixedSection("policy", "Policy", [policyHeader(), p("Information is classified by how much harm its loss, leak or alteration would cause, so that it is protected in proportion. The owner of the information chooses the classification, and unclassified information is treated as the second-highest level until classified."), listRows("input.levels", "**{{item.level}}**: {{item.meaning}}")]),
    fixedSection("handling", "Handling", [listRows("input.levels", "**{{item.level}}**: {{item.handling}}"), p("Information is labelled with its classification where practical. Personal data is handled under the Company's privacy and data protection policies and the law, whatever its classification. Sharing outside the Company follows the handling rule for its level. {{input.owner}} reviews the levels regularly.")]),
  ],
});

const assetPolicy = defineTemplate("it.asset_policy", {
  title: "IT Asset Policy",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.longtext("rules_notes", "Rules for issue and use of assets", { feedsSections: ["policy"] }), f.text("return_within", "Time to return assets after leaving", { help: "For example 'on the last working day'." })],
  sections: [
    aiSection("policy", "Policy", [policyHeader(), p("IT assets, including computers, phones, storage and accessories, are the Company's property and are recorded in an asset register. [[input.rules_text|Rules|Issue, use and care of assets]]")], ai("Describe the rules for issuing and using IT assets, using only the notes.", ["input.rules_notes"], NEVER_POLICY, { tone: "instructional", minWords: 30, maxWords: 150 })),
    lockedSection("return", "Return and disposal", [c1("Each asset is issued to a named person who acknowledges it and is responsible for its safe custody. Loss, theft or damage is reported to IT at once."), c1("Assets are returned {{input.return_within}}, or when the Company asks, in working condition with their accessories. IT checks them and removes personal and Company data before reuse."), c1("Retired assets are wiped using an approved method and disposed of or recycled through authorised channels, and the register is updated."), c1(AMEND_POLICY)]),
  ],
});

const sdlc = defineTemplate("it.sdlc", {
  title: "Secure Development Policy",
  layout: POLICY_LAYOUT,
  inputs: [...policyInputs(), f.longtext("practice_notes", "Practices the engineering team follows", { feedsSections: ["policy"] }), f.text("review_rule", "Code review rule", { help: "For example 'every change is reviewed by a second engineer before release'." })],
  sections: [
    aiSection("policy", "Policy", [policyHeader(), p("Software built or modified by the Company is designed, written, tested and released with security in mind. [[input.practice_text|Practices|The secure development practices followed]]")], ai("Describe the secure development practices, using only the notes.", ["input.practice_notes"], NEVER_POLICY, { tone: "instructional", minWords: 40, maxWords: 170 })),
    lockedSection("review", "Review and release", [c1("Code review: {{input.review_rule}}."), c1("Secrets such as keys and passwords are never stored in source code and are kept in an approved secrets store."), c1("Third-party components are chosen carefully, kept up to date, and checked for known vulnerabilities, and their licences are respected."), c1("Test data does not contain real personal data unless it is protected like production data."), c1("Security issues found before or after release are recorded and fixed in order of risk."), c1(AMEND_POLICY)]),
  ],
});

const vendorSecurity = defineTemplate("it.vendor_security", {
  title: "Vendor Security Questionnaire",
  layout: { header: "compact", footer: "page_numbers", titleAlign: "left" },
  inputs: [f.person("vendor", "Vendor", "vendor"), f.date("sent_on", "Sent on"), f.text("contact", "Reply to"), owner()],
  sections: [fixedSection("questions", "Questions", [
    docHeader([["Vendor", "{{vendor.name}}"], ["Sent on", "{{input.sent_on|date}}"], ["Reply to", "{{input.contact}}"]]),
    p("Please answer every question. Where an answer is no or not applicable, explain. Attach supporting policies or reports where they exist."),
    ...["Does the vendor have a written information security policy, approved by management and reviewed regularly? Please attach it.", "Which security certifications or independent audits does the vendor hold, and when were they last completed?", "How is access to our data restricted, and how are staff access rights reviewed?", "Is our data encrypted in transit and at rest? Describe the methods.", "Where will our data be stored and processed, and does the vendor use sub-processors? Name them.", "How are security incidents detected, handled and reported to customers? State how quickly customers are told.", "How are backups taken, protected and tested, and what are the recovery targets?", "How does the vendor vet, train and supervise staff who can access our data?", "How are vulnerabilities found, prioritised and fixed, and is independent security testing done?", "What happens to our data at the end of the contract, and how is its deletion confirmed?", "Has the vendor had a security incident affecting customer data in the recent past? Please describe it and what was done."].map((q) => p(`**${q}**\nAnswer: ________________________________________________`)),
    p("I confirm that these answers are true and complete to the best of my knowledge.\nName and designation: ______________________    Date: ______________"),
  ])],
});

const runbook = defineTemplate("it.runbook", {
  title: "Runbook: {{input.system}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.text("system", "System"), f.longtext("overview_notes", "What the system does and how it is built", { feedsSections: ["overview"] }),
    f.rows("procedures", "Procedures", [col("name", "Procedure"), col("steps", "Steps"), col("when", "When to use it", "text", false)], { minRows: 1, maxRows: 30 }),
    f.longtext("rollback_notes", "How to roll back", { feedsSections: ["rollback"] })],
  sections: [
    aiSection("overview", "Overview", [docHeader([["System", "{{input.system}}"]]), p("[[input.overview_text|Overview|What the system does and its main parts]]")], ai("Describe what the system does and its main components, using only the notes.", ["input.system", "input.overview_notes"], NEVER_POLICY, { tone: "instructional", minWords: 30, maxWords: 150 })),
    fixedSection("procedures", "Procedures", [listRows("input.procedures", "**{{item.name}}** (use when: {{item.when|text|needed}}): {{item.steps}}")]),
    aiSection("rollback", "Rollback", [p("[[input.rollback_text|Rollback|Steps to undo a failed change]]")], ai("Describe the steps to roll back a failed change, as a numbered list, using only the notes.", ["input.system", "input.rollback_notes"], [...NEVER_POLICY, "commands or steps not in the notes"], { tone: "instructional", minWords: 25, maxWords: 150 })),
  ],
});

const releaseNotes = defineTemplate("it.release_notes", {
  title: "{{input.product}} {{input.version}}: Release Notes",
  layout: { header: "compact", footer: "page_numbers", titleAlign: "left" },
  inputs: [f.text("product", "Product"), f.text("version", "Version"), f.date("release_date", "Release date"),
    f.longtext("highlight_notes", "Highlights", { feedsSections: ["highlights"] }),
    f.rows("changes", "Changes", [col("kind", "Type (new, improved, fixed)"), col("description", "Description")], { minRows: 1, maxRows: 60 }),
    f.rows("issues", "Known issues", [col("issue", "Issue"), col("workaround", "Workaround", "text", false)], { required: false, minRows: 0, maxRows: 20 })],
  sections: [
    aiSection("highlights", "Highlights", [p("Released {{input.release_date|date}}."), p("[[input.highlight_text|Highlights|What matters most in this release]]")], ai("Summarise the highlights of the release in two or three sentences, using only the notes and the change list.", ["input.product", "input.version", "input.highlight_notes"], [...NEVER_BIZ, "features or fixes that are not in the change list"], { tone: "warm", minWords: 25, maxWords: 100 })),
    fixedSection("changes", "Changes", [listRows("input.changes", "**{{item.kind}}**: {{item.description}}")]),
    fixedSection("issues", "Known issues", [whenSet("input.issues", [listRows("input.issues", "{{item.issue}}. Workaround: {{item.workaround|text|none yet}}")]), p("Tell us about any problem you find. We will fix issues in order of their impact.")]),
  ],
});

const srs = defineTemplate("it.srs", {
  title: "Software Requirements Specification: {{input.product}}",
  layout: DOC_LAYOUT,
  inputs: [owner(), f.person("client", "Client", "client", { required: false }), f.text("product", "Product or system"),
    f.longtext("intro_notes", "Purpose and context", { feedsSections: ["intro"] }),
    f.rows("requirements", "Requirements", [col("id", "Reference"), col("requirement", "Requirement"), col("priority", "Priority (must, should, could)")], { minRows: 1, maxRows: 100 }),
    f.longtext("constraint_notes", "Constraints and assumptions", { feedsSections: ["constraints"] })],
  sections: [
    aiSection("intro", "Introduction", [docHeader([["Product", "{{input.product}}"], ["Client", "{{client.name|text|Internal}}"]]), p("[[input.intro_text|Introduction|Purpose and context of the specification]]")], ai("Describe the purpose and context of the specification, using only the notes.", ["input.product", "input.intro_notes"], NEVER_BIZ, { minWords: 40, maxWords: 150 })),
    fixedSection("requirements", "Requirements", [p("Each requirement is stated as something the software must do or be. Priority is must, should or could."), listRows("input.requirements", "**{{item.id}}** ({{item.priority}}): {{item.requirement}}")]),
    aiSection("constraints", "Constraints", [p("[[input.constraint_text|Constraints|Constraints and assumptions]]"), ...approvals("For the Company", "For the Client")], ai("List the constraints and assumptions as short bullets, using only the notes.", ["input.constraint_notes"], NEVER_BIZ, { tone: "instructional", minWords: 15, maxWords: 130 })),
  ],
});


export const IT_DOCS: TemplateDef[] = [securityPolicy, aup, password, access, byod, backupDr, incidentResponse, changeMgmt, classification, assetPolicy, sdlc, vendorSecurity, runbook, releaseNotes, srs];
