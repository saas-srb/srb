// SOP product demo data: a small HRMS org (only when none exists), SOP-role logins, and ~10 SOPs that exercise every lifecycle state,
// confidentiality level, version history, assignment/acknowledgement state, checklist, feedback item and audit entry.
// Idempotent: everything it creates has a `demo-sop-` id (or the demo email) and is replaced on each run.
import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";
import { hashPassword, ago, dayAgo, dayAhead, audit } from "./lib.mjs";

const PASSWORD = "Demo@12345";
const D = "demo-sop-";

export const SOP_DEMO_ACCOUNTS = [
  { email: "demo.sop.admin@example.com", label: "SOP Admin (all departments)", roles: ["sop_admin"], dept: null },
  { email: "demo.sop.manager@example.com", label: "SOP Manager — Engineering head", roles: ["sop_manager"], dept: "Engineering", head: true },
  { email: "demo.sop.author@example.com", label: "SOP Author — Engineering", roles: ["sop_author"], dept: "Engineering" },
  { email: "demo.sop.employee@example.com", label: "Employee — Engineering (reader)", roles: ["employee"], dept: "Engineering" },
  { email: "demo.sop.hr@example.com", label: "Employee — HR (reader)", roles: ["employee"], dept: "HR" },
  { email: "demo.sop.finance@example.com", label: "Employee — Finance (reader)", roles: ["employee"], dept: "Finance" },
];

const DEFAULT_DEPTS = [["Management", "MGT"], ["HR", "HR"], ["Recruitment", "REC"], ["Finance", "FIN"], ["Accounts", "ACC"], ["Sales", "SAL"], ["Business Development", "BD"], ["Marketing", "MKT"], ["Customer Support", "CS"], ["Project Management", "PM"], ["Product", "PRD"], ["Engineering", "ENG"], ["Frontend", "FE"], ["Backend", "BE"], ["Mobile", "MOB"], ["QA", "QA"], ["DevOps", "DEV"], ["Cloud", "CLD"], ["AI/ML", "AI"], ["IT", "IT"], ["Security", "SEC"], ["Procurement", "PRC"], ["Operations", "OPS"], ["Administration", "ADM"], ["Training", "TRN"], ["TMS", "TMS"], ["LMS", "LMS"], ["Legal", "LEG"], ["Compliance", "CMP"], ["Facilities", "FAC"], ["Internal Audit", "IA"], ["Risk Management", "RSK"]];

const id = () => randomUUID();
const blk = {
  p: (text) => ({ id: id(), type: "paragraph", text }),
  steps: (items) => ({ id: id(), type: "steps", items }),
  bullets: (items) => ({ id: id(), type: "bullets", items }),
  warn: (text) => ({ id: id(), type: "warning", text }),
  note: (text) => ({ id: id(), type: "note", text }),
  table: (header, rows) => ({ id: id(), type: "table", header, rows }),
  check: (title, items) => ({ id: id(), type: "checklist", title, items: items.map((text) => ({ id: id(), text })) }),
  link: (label, url, description = "") => ({ id: id(), type: "link", label, url, description }),
};
const sec = (key, title, blocks) => ({ id: id(), key, title, blocks });

export async function seedSop(db) {
  const now = new Date();
  const passwordHash = hashPassword(PASSWORD);

  // ------------------------------------------------------------------ wipe previous demo rows
  for (const c of ["sops", "sop_versions", "sop_assignments", "sop_feedback", "sop_files"]) await db.collection(c).deleteMany({ _id: new RegExp(`^${D}`) });
  await db.collection("sop_activity_logs").deleteMany({ _id: new RegExp(`^${D}`) });
  await db.collection("sop_counters").deleteMany({});

  // ------------------------------------------------------------------ HRMS org (only if the demo seeder hasn't created one)
  let hrmsDepts = await db.collection("hrms_departments").find({ deletedAt: null }).toArray();
  const designations = [];
  if (hrmsDepts.length === 0) {
    hrmsDepts = ["Engineering", "HR", "Finance", "Sales"].map((name) => ({ _id: `${D}hd-${name.toLowerCase()}`, name, code: name.slice(0, 3).toUpperCase(), description: null, headEmployeeId: null, ...audit() }));
    await db.collection("hrms_departments").insertMany(hrmsDepts);
    const des = [["Software Engineer", "Engineering"], ["Engineering Manager", "Engineering"], ["HR Executive", "HR"], ["Accountant", "Finance"], ["Account Executive", "Sales"]];
    for (const [title, dept] of des) designations.push({ _id: `${D}ds-${title.toLowerCase().replace(/\W+/g, "-")}`, title, departmentId: hrmsDepts.find((d) => d.name === dept)._id, level: null, ...audit() });
    await db.collection("hrms_designations").insertMany(designations);
  }
  const hd = (name) => hrmsDepts.find((d) => d.name.toLowerCase() === name.toLowerCase()) ?? hrmsDepts[0];

  // ------------------------------------------------------------------ logins + their HRMS employees
  const users = {};
  for (const [i, a] of SOP_DEMO_ACCOUNTS.entries()) {
    const email = a.email;
    const local = email.split("@")[0].replace("demo.sop.", "");
    const dept = a.dept ? hd(a.dept) : null;
    let userId = (await db.collection("admin_users").findOne({ email }, { projection: { _id: 1 } }))?._id;
    if (!userId) userId = new ObjectId();
    let empId = null;
    if (dept) {
      empId = `${D}emp-${local}`;
      await db.collection("hrms_employees").deleteMany({ $or: [{ _id: empId }, { email }, { workEmail: email }] });
      await db.collection("hrms_employees").insertOne({
        _id: empId, employeeCode: `DSOP-${String(i + 1).padStart(3, "0")}`, firstName: local[0].toUpperCase() + local.slice(1), lastName: "Demo", workEmail: email, email, /* legacy unique `email` index exists on some databases */ status: "active",
        personal: { dateOfBirth: null, gender: null, maritalStatus: null, personalEmail: null, phone: null, addressLine: null, city: null, state: null, postalCode: null, photoKey: null },
        professional: { departmentId: dept._id, designationId: null, teamId: null, reportingManagerId: null, employmentType: "full_time", workLocation: null, joiningDate: dayAgo(300), probationEndDate: null, relievingDate: null },
        emergencyContacts: [], recruitment: null, adminUserId: userId.toString(), ...audit(),
      });
      if (a.head) await db.collection("hrms_departments").updateOne({ _id: dept._id }, { $set: { headEmployeeId: empId } });
    }
    await db.collection("admin_users").updateOne(
      { email },
      { $set: { email, passwordHash, roles: a.roles, permissionOverrides: {}, userType: "employee", employeeId: empId, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: null }, $setOnInsert: { _id: userId, createdAt: now } },
      { upsert: true }
    );
    users[local] = { id: userId.toString(), name: `${local[0].toUpperCase()}${local.slice(1)} Demo`, empId, deptId: dept?._id ?? null };
  }

  // ------------------------------------------------------------------ SOP taxonomy (departments only — the app seeds functions, categories, templates on first load)
  const sd = db.collection("sop_departments");
  if ((await sd.countDocuments({})) === 0) {
    await sd.insertMany(DEFAULT_DEPTS.map(([name, code]) => ({ _id: `${D}sd-${code}`, name, code, description: "", hrmsDepartmentId: null, active: true, ...audit() })));
  }
  for (const h of hrmsDepts) {
    const match = await sd.findOne({ name: new RegExp(`^${h.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), deletedAt: null });
    if (match && !match.hrmsDepartmentId) await sd.updateOne({ _id: match._id }, { $set: { hrmsDepartmentId: h._id } });
  }
  const sopDept = async (name) => (await sd.findOne({ name, deletedAt: null }));

  // ------------------------------------------------------------------ SOPs
  const S = [];
  const V = [];
  const counters = {};
  const nextCode = (dept) => {
    counters[dept.code] = (counters[dept.code] ?? 0) + 1;
    return `SOP-${dept.code}-${String(counters[dept.code]).padStart(4, "0")}`;
  };

  const eng = await sopDept("Engineering");
  const hr = await sopDept("HR");
  const fin = await sopDept("Finance");
  const sales = await sopDept("Sales");
  const mgr = users.manager;
  const author = users.author;
  const adminUser = users.admin;

  const contentDeploy = (v) => ({
    title: "Production Deployment Procedure",
    description: "How every change reaches production safely: build, verify, release, monitor.",
    purpose: "Ensure every production release is repeatable, reviewed and reversible.",
    scope: "All engineers who deploy to production. Excludes hot-fixes handled by the Incident Response Runbook.",
    sections: [
      sec("responsibilities", "Responsibilities", [blk.bullets(["**Release owner** — runs the deployment and owns the rollback decision.", "**Reviewer** — confirms the change is ready.", "**On-call engineer** — watches dashboards for 30 minutes after release."])]),
      sec("prerequisites", "Prerequisites", [blk.check("Before you start", ["Change is merged to `main` and CI is green", "Release notes drafted", "On-call engineer informed", ...(v >= 2 ? ["Feature flags reviewed"] : [])])]),
      sec("step_by_step", "Step-by-Step Instructions", [blk.steps(["Tag the release commit (`vX.Y.Z`).", "Trigger the **deploy** pipeline and select the tag.", "Wait for the smoke tests to pass.", "Promote traffic gradually: 10% → 50% → 100%.", ...(v >= 2 ? ["Post the deployment summary in #releases."] : [])]), blk.warn("Never deploy on a Friday after 15:00 unless the release owner and on-call both agree.")]),
      sec("validation", "Validation", [blk.table(["Check", "Where", "Expected"], [["Error rate", "Grafana › API", "< 0.5%"], ["p95 latency", "Grafana › API", "< 400 ms"], ["Login flow", "Smoke test", "Pass"]])]),
      sec("escalation", "Escalation", [blk.p("If any check fails, **roll back first**, then investigate. Page the on-call lead if rollback fails."), blk.link("Incident Response Runbook", "/playbook-ai/library", "Internal")]),
    ],
    relatedSopIds: [],
    relatedPolicies: [{ title: "Change Management Policy", url: "" }],
    moduleLinks: [{ module: "pms", label: "Project releases", url: "/sprintos" }],
  });

  function add({ dept, title, status, version = null, conf = "internal", mandatory = false, priority = "medium", owner = mgr, authorU = mgr, content, effective = dayAgo(60), review = dayAhead(120), expiry = null, tags = [], versions = [], unpublished = false, access = [], download = true, created = 90, archived = false }) {
    const code = nextCode(dept);
    const _id = `${D}${code.toLowerCase()}`;
    const body = content;
    const live = version ? body : null;
    S.push({
      _id, code, title: body.title, departmentId: dept._id, functionId: null, processId: null, subProcessId: null, categoryId: null,
      ownerId: owner.id, authorId: authorU.id, applicableRoleIds: [], effectiveDate: effective, reviewDate: review, expiryDate: expiry,
      priority, confidentiality: conf, mandatory, allowDownload: download, tags, accessUserIds: access, templateId: null, templateName: null,
      status, version, publishedAt: version ? ago(30) : null, lastPublishedBy: version ? owner.id : null, live,
      draft: unpublished ? { ...body, description: `${body.description} (revised draft)`, purpose: `${body.purpose} Updated for the new tooling.` } : body,
      hasUnpublishedChanges: !version || unpublished, archivedAt: archived ? ago(10) : null, archivedBy: archived ? adminUser.id : null, statusBeforeArchive: archived ? "active" : null,
      createdAt: ago(created), updatedAt: ago(unpublished ? 1 : 5), createdBy: authorU.id, updatedBy: owner.id, deletedAt: null,
    });
    versions.forEach((v, i) => V.push({
      _id: `${D}v-${code.toLowerCase()}-${v.version}`, sopId: _id, code, version: v.version, previousVersion: versions[i - 1]?.version ?? null, changeType: i === 0 ? "initial" : v.type, changeSummary: v.summary,
      authorId: owner.id, authorName: owner.name, publishedAt: ago(v.daysAgo), content: v.content,
      meta: { departmentId: dept._id, functionId: null, processId: null, categoryId: null, ownerId: owner.id, confidentiality: conf, priority, mandatory, tags, effectiveDate: effective, reviewDate: review, expiryDate: expiry },
    }));
    return { _id, code };
  }

  const deploy = add({
    dept: eng, title: "Production Deployment Procedure", status: "active", version: "1.2", mandatory: true, priority: "high", tags: ["release", "deployment", "production"], review: dayAgo(12), // review overdue
    content: contentDeploy(2),
    versions: [
      { version: "1.0", type: "initial", summary: "Initial release", daysAgo: 120, content: contentDeploy(1) },
      { version: "1.1", type: "minor", summary: "Added the validation table", daysAgo: 70, content: { ...contentDeploy(1), description: "How every change reaches production safely." } },
      { version: "1.2", type: "minor", summary: "Added feature-flag review and release announcement", daysAgo: 30, content: contentDeploy(2) },
    ],
  });
  const review = add({
    dept: eng, title: "Code Review Guidelines", status: "active", version: "1.0", conf: "department_only", tags: ["review", "quality"], expiry: dayAhead(20),
    content: { title: "Code Review Guidelines", description: "What a good review looks like.", purpose: "Keep code quality consistent and reviews fast.", scope: "All pull requests to company repositories.", sections: [sec("procedure", "Procedure", [blk.steps(["Author opens a PR with a clear description.", "Reviewer responds within one working day.", "Author addresses comments; reviewer re-checks.", "Squash-merge when approved and CI is green."]), blk.note("Small PRs (under 400 lines) are reviewed fastest.")])], relatedSopIds: [], relatedPolicies: [], moduleLinks: [] },
    versions: [{ version: "1.0", type: "initial", summary: "Initial release", daysAgo: 45, content: null }],
  });
  V[V.length - 1].content = S[S.length - 1].live;
  const incident = add({
    dept: eng, title: "Incident Response Runbook", status: "active", version: "2.0", conf: "confidential", mandatory: false, priority: "critical", unpublished: true, tags: ["incident", "on-call"], owner: adminUser, authorU: mgr,
    content: { title: "Incident Response Runbook", description: "Detect, triage, resolve and review production incidents.", purpose: "Restore service quickly and learn from every incident.", scope: "Everyone on the on-call rota.", sections: [sec("step_by_step", "Step-by-Step Instructions", [blk.steps(["Acknowledge the page within 5 minutes.", "Open an incident channel and assign an incident commander.", "Mitigate first, diagnose second.", "Write the post-incident review within 3 working days."]), blk.check("During an incident", ["Status page updated", "Stakeholders informed every 30 minutes", "Timeline being recorded"])])], relatedSopIds: [], relatedPolicies: [], moduleLinks: [] },
    versions: [
      { version: "1.0", type: "initial", summary: "Initial release", daysAgo: 200, content: { title: "Incident Response Runbook", description: "Handle production incidents.", purpose: "Restore service quickly.", scope: "On-call engineers.", sections: [sec("step_by_step", "Step-by-Step Instructions", [blk.steps(["Acknowledge the page.", "Mitigate.", "Write a review."])])], relatedSopIds: [], relatedPolicies: [], moduleLinks: [] } },
      { version: "2.0", type: "major", summary: "Rewritten around incident commander roles", daysAgo: 25, content: null },
    ],
  });
  V[V.length - 1].content = S[S.length - 1].live;
  add({
    dept: eng, title: "Release Rollback Plan", status: "draft", version: null, priority: "medium", owner: author, authorU: author, created: 3,
    content: { title: "Release Rollback Plan", description: "", purpose: "", scope: "", sections: [sec("procedure", "Procedure", [blk.p("")])], relatedSopIds: [], relatedPolicies: [], moduleLinks: [] },
  });
  add({
    dept: eng, title: "Legacy Deploy Script Usage", status: "archived", version: "1.0", tags: ["legacy"], archived: true, created: 400,
    content: { title: "Legacy Deploy Script Usage", description: "Superseded by the Production Deployment Procedure.", purpose: "Historical reference.", scope: "Nobody — retired.", sections: [sec("procedure", "Procedure", [blk.p("Retired. See the Production Deployment Procedure.")])], relatedSopIds: [], relatedPolicies: [], moduleLinks: [] },
    versions: [{ version: "1.0", type: "initial", summary: "Initial release", daysAgo: 400, content: null }],
  });
  V[V.length - 1].content = S[S.length - 1].live;

  add({
    dept: hr, title: "Employee Onboarding", status: "active", version: "1.0", mandatory: true, tags: ["onboarding", "hr"], owner: adminUser, authorU: adminUser,
    content: { title: "Employee Onboarding", description: "Everything that happens between offer acceptance and day 30.", purpose: "Give every new joiner a consistent, welcoming start.", scope: "All new employees and their managers.", sections: [sec("step_by_step", "Step-by-Step Instructions", [blk.steps(["HR sends the welcome email and document checklist.", "IT provisions laptop, email and tool access.", "Manager schedules the first-week plan.", "Buddy is assigned."]), blk.check("Day-one checklist", ["ID card issued", "Laptop handed over", "Introduced to the team", "Policies shared"])])], relatedSopIds: [], relatedPolicies: [{ title: "Code of Conduct", url: "" }], moduleLinks: [{ module: "hrms", label: "HRMS onboarding", url: "/talentos" }] },
    versions: [{ version: "1.0", type: "initial", summary: "Initial release", daysAgo: 60, content: null }],
  });
  V[V.length - 1].content = S[S.length - 1].live;
  add({
    dept: hr, title: "Payroll Data Handling", status: "active", version: "1.0", conf: "highly_confidential", priority: "critical", download: false, tags: ["payroll", "privacy"], owner: adminUser, authorU: adminUser,
    content: { title: "Payroll Data Handling", description: "Who may see salary data and how it is protected.", purpose: "Protect employee compensation data.", scope: "HR and Finance staff with payroll access.", sections: [sec("security", "Security", [blk.bullets(["Salary files are never emailed.", "Access is reviewed quarterly."]), blk.warn("Payroll exports are logged and audited.")])], relatedSopIds: [], relatedPolicies: [], moduleLinks: [{ module: "fms", label: "Payroll payments", url: "/cashflow-ai" }] },
    versions: [{ version: "1.0", type: "initial", summary: "Initial release", daysAgo: 80, content: null }],
  });
  V[V.length - 1].content = S[S.length - 1].live;

  add({
    dept: fin, title: "Vendor Payment Procedure", status: "active", version: "1.1", conf: "department_only", tags: ["payments", "vendors"], owner: adminUser, authorU: adminUser,
    content: { title: "Vendor Payment Procedure", description: "From verified invoice to released payment.", purpose: "Pay vendors accurately and on time.", scope: "Accounts payable team.", sections: [sec("step_by_step", "Step-by-Step Instructions", [blk.steps(["Match the invoice to the PO and goods receipt.", "Record the bill in FMS.", "Schedule payment on the due date.", "Release payment and file the confirmation."])])], relatedSopIds: [], relatedPolicies: [], moduleLinks: [{ module: "fms", label: "Payables", url: "/cashflow-ai/payables" }, { module: "prms", label: "Vendors", url: "/spendiq/vendors" }] },
    versions: [
      { version: "1.0", type: "initial", summary: "Initial release", daysAgo: 100, content: null },
      { version: "1.1", type: "minor", summary: "Added the three-way match step", daysAgo: 40, content: null },
    ],
  });
  V[V.length - 2].content = { ...S[S.length - 1].live, sections: [sec("step_by_step", "Step-by-Step Instructions", [blk.steps(["Record the bill in FMS.", "Schedule payment on the due date.", "Release payment."])])] };
  V[V.length - 1].content = S[S.length - 1].live;
  add({
    dept: fin, title: "Expense Reimbursement", status: "published", version: "1.0", effective: dayAhead(10), tags: ["expenses"], owner: adminUser, authorU: adminUser,
    content: { title: "Expense Reimbursement", description: "How to claim work expenses.", purpose: "Reimburse valid expenses quickly.", scope: "All employees.", sections: [sec("step_by_step", "Step-by-Step Instructions", [blk.steps(["Submit the claim with receipts within 30 days.", "Your manager confirms the expense.", "Finance pays it with the next payroll."])])], relatedSopIds: [], relatedPolicies: [], moduleLinks: [{ module: "prms", label: "Expense claims", url: "/spendiq" }] },
    versions: [{ version: "1.0", type: "initial", summary: "Initial release", daysAgo: 2, content: null }],
  });
  V[V.length - 1].content = S[S.length - 1].live;
  add({
    dept: sales, title: "Lead Qualification", status: "expired", version: "1.0", expiry: dayAgo(15), tags: ["sales", "leads"], owner: adminUser, authorU: adminUser,
    content: { title: "Lead Qualification", description: "Decide which leads deserve a proposal.", purpose: "Focus the team on winnable deals.", scope: "Sales team.", sections: [sec("procedure", "Procedure", [blk.steps(["Confirm budget, authority, need and timeline.", "Log the outcome in the CRM."])])], relatedSopIds: [], relatedPolicies: [], moduleLinks: [{ module: "lms", label: "CRM", url: "/dealflow-ai" }] },
    versions: [{ version: "1.0", type: "initial", summary: "Initial release", daysAgo: 200, content: null }],
  });
  V[V.length - 1].content = S[S.length - 1].live;

  // Related SOP link: deployment ↔ incident runbook
  S.find((s) => s._id === deploy._id).live.relatedSopIds = [incident._id];
  S.find((s) => s._id === deploy._id).draft.relatedSopIds = [incident._id];

  await db.collection("sops").insertMany(S);
  await db.collection("sop_versions").insertMany(V);
  const codeCounters = Object.entries(counters).map(([code, seq]) => ({ _id: `sop_${code}`, seq }));
  if (codeCounters.length) await db.collection("sop_counters").insertMany(codeCounters);

  // ------------------------------------------------------------------ assignments (deployment SOP: mixed states; onboarding: HR staff)
  const A = [];
  const assign = (sop, u, { due, ack = false, viewed = true, version, checklist = {}, by = mgr }) => A.push({
    _id: `${D}a-${sop._id.slice(D.length)}-${u.id.slice(-6)}`, sopId: sop._id, sopCode: sop.code, userId: u.id, employeeId: u.empId, userName: u.name, departmentId: sop.departmentId,
    source: { type: "user", id: u.id, label: u.name }, dueDate: due, assignedBy: by.id, assignedByName: by.name, assignedAt: ago(20), viewedAt: viewed ? ago(15) : null,
    acknowledgedAt: ack ? ago(10) : null, acknowledgedVersion: ack ? version : null, requiredVersion: version, ackHistory: ack ? [{ version, at: ago(10) }] : [], checklist,
    checklistUpdatedAt: null, lastReminderAt: null,
  });
  const dep = S.find((s) => s._id === deploy._id);
  assign({ ...dep }, users.employee, { due: dayAgo(5), ack: false, viewed: true, version: "1.2" }); // overdue
  assign({ ...dep }, users.author, { due: dayAhead(6), ack: true, version: "1.2" });
  assign({ ...dep }, users.manager, { due: dayAhead(6), ack: true, version: "1.2" });
  const onb = S.find((s) => s.code === "SOP-HR-0001");
  assign(onb, users.hr, { due: dayAhead(9), ack: false, viewed: false, version: "1.0", by: adminUser });
  await db.collection("sop_assignments").insertMany(A);

  // ------------------------------------------------------------------ feedback + audit trail
  await db.collection("sop_feedback").insertMany([
    { _id: `${D}fb-1`, sopId: deploy._id, sopCode: deploy.code, sopTitle: "Production Deployment Procedure", kind: "change_request", message: "Step 4 should mention the canary dashboard link.", userId: users.employee.id, userName: users.employee.name, version: "1.2", status: "open", resolvedBy: null, resolvedAt: null, resolutionNote: null, createdAt: ago(3) },
    { _id: `${D}fb-2`, sopId: deploy._id, sopCode: deploy.code, sopTitle: "Production Deployment Procedure", kind: "feedback", message: "The validation table is really helpful.", userId: users.author.id, userName: users.author.name, version: "1.1", status: "resolved", resolvedBy: mgr.id, resolvedAt: ago(20), resolutionNote: "Thanks!", createdAt: ago(25) },
  ]);
  const log = (n, actor, action, entity, sop, summary, days) => ({ _id: `${D}al-${n}`, actorId: actor.id, actorEmail: Object.entries(users).find(([, u]) => u.id === actor.id) ? `demo.sop.${Object.entries(users).find(([, u]) => u.id === actor.id)[0]}@example.com` : actor.id, action, entity, entityId: sop._id, entityLabel: `${sop.code}`, sopId: sop._id, summary, metadata: null, createdAt: ago(days) });
  await db.collection("sop_activity_logs").insertMany([
    log(1, mgr, "create", "sop", deploy, "Created draft in Engineering", 120),
    log(2, mgr, "publish", "sop", deploy, "Published v1.0 — Initial release", 120),
    log(3, mgr, "update", "sop", deploy, "New version v1.1 (from v1.0) — Added the validation table", 70),
    log(4, mgr, "update", "sop", deploy, "New version v1.2 (from v1.1) — Added feature-flag review", 30),
    log(5, mgr, "assign", "assignment", deploy, "Assigned to 3 employees: 3 new, 0 already assigned, due in 6 days", 20),
    log(6, users.author, "acknowledge", "assignment", deploy, "Acknowledged v1.2", 10),
    log(7, users.employee, "view", "sop", deploy, "Viewed v1.2", 15),
    log(8, adminUser, "archive", "sop", { _id: S.find((s) => s.status === "archived")._id, code: S.find((s) => s.status === "archived").code }, "Archived", 10),
  ]);

  return { sops: S.length, versions: V.length, assignments: A.length };
}
