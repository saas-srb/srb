import type { MicroFeature } from "./types";

const P = "cohort-ai";
type Row = [short: string, module: string, kind: MicroFeature["kind"], label: string, description: string, level: "read" | "write", legacy: string[], scope?: "all" | "team"];

/** What everybody given CohortAI gets: their own dashboard. */
const BASELINE = new Set(["dashboard.view"]);

const ANY = ["tms.hasTmsAccess"];
const STAFF = ["tms.hasTmsStaffRole"];
const TRAIN = ["tms.canManageTraining"];

const rows: Row[] = [
  ["dashboard.view", "Dashboard", "page", "Open the dashboard", "Open the CohortAI dashboard with the person's own program, batch and progress.", "read", ANY],
  ["dashboard.all", "Dashboard", "section", "See the training dashboard", "Enrolment, batch and revenue numbers across the institute.", "read", STAFF, "all"],
];
/** A module a student sees their OWN of ("view", every person given the product) and staff see everyone's ("all", the staff tier); changing it is its own feature. */
const own = (mod: string, short: string, label: string, ownLabel: string, manage: [string, string[], string]) => {
  rows.push([`${short}.view`, mod, "page", `Open ${ownLabel}`, `Open ${ownLabel}.`, "read", ANY]);
  rows.push([`${short}.all`, mod, "page", `Open every ${label}`, `Open every ${label}, not only the person's own.`, "read", STAFF, "all"]);
  rows.push([`${short}.manage`, mod, "button", manage[0], manage[2], "write", manage[1]]);
};
own("Programs", "programs", "program", "my program", ["Manage programs", ["tms.canManageProgramsBatches"], "Create, edit and archive programs."]);
own("Batches", "batches", "batch", "my batch", ["Manage batches", ["tms.canManageProgramsBatches"], "Create, edit and archive batches and their calendar."]);
own("Classes", "classes", "class", "my schedule", ["Manage classes", TRAIN, "Schedule, edit and delete classes and record attendance."]);
own("Assignments", "assignments", "assignment", "my assignments", ["Manage assignments", TRAIN, "Create, edit, grade and delete assignments."]);
rows.push(["assignments.submit", "Assignments", "action", "Submit my assignments", "Submit the person's own assignment work.", "write", ANY]);
own("Live projects", "projects", "live project", "my live projects", ["Manage live projects", TRAIN, "Create, edit and review live projects and milestones."]);
rows.push(["projects.update", "Live projects", "action", "Update my live-project milestones", "Tick and untick the milestones of a live project the person works on.", "write", ANY]);
own("Certificates", "certificates", "certificate", "my certificates", ["Issue and revoke certificates", ["tms.canIssueCertificates"], "Issue, reissue and revoke certificates."]);
own("Payments", "payments", "payment plan", "my payments", ["Manage payments", ["tms.canManagePayments"], "Record payments and edit fee structures."]);
own("Students", "students", "student record", "my profile", ["Manage students", ["tms.canManageStudents"], "Create and edit students and move applications through the pipeline."]);
rows.push(["students.edit", "Students", "action", "Edit my contact details", "Change the person's own contact details.", "write", ANY]);
rows.push(
  ["placements.view", "Placements", "page", "Open placements", "Open the placement pipeline.", "read", STAFF],
  ["placements.manage", "Placements", "button", "Manage placements", "Create and edit placement records.", "write", TRAIN],
  ["reports.view", "Reports", "page", "Open reports", "Open the training reports.", "read", TRAIN],
  ["reports.export", "Reports", "export", "Download reports", "Download training reports.", "read", TRAIN],
  ["settings.view", "Settings", "page", "Open settings", "Open the CohortAI settings.", "read", STAFF],
  ["settings.manage", "Settings", "button", "Manage settings", "Edit categories, technology suggestions and the institute identity.", "write", ["tms.canManageSettings"]],
  ["audit.view", "Settings", "page", "Read the activity log", "Read the CohortAI audit log.", "read", ["tms.canViewAuditLog"]],
);

export const COHORTAI_MICRO: MicroFeature[] = rows.map(([short, module, kind, label, description, level, legacy, scope]) => ({
  key: `${P}.${short}`, product: P, module, kind, label, description, level, legacy, ...(scope ? { scope } : {}), ...(BASELINE.has(short) ? { baseline: true } : {}),
}));
