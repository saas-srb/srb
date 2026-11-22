import type { MicroFeature } from "./types";

const P = "evaliq";
type Row = [short: string, module: string, kind: MicroFeature["kind"], label: string, description: string, level: "read" | "write", legacy: string[], scope?: "all"];

/** What everybody given EvalIQ gets: the dashboard and their own assigned tests, results and certificates (the old test-taker level, shown in Preview). */
const BASELINE = new Set(["dashboard.view", "assignments.own", "assignments.take", "results.own", "certificates.own"]);

const ROWS: Row[] = [
  ["dashboard.view", "Dashboard", "page", "Open the dashboard", "Open the EvalIQ dashboard: the person's own tests, and the numbers they may see.", "read", ["ots.VIEW_RESULTS"]],
  ["tests.view", "Tests", "page", "See tests", "Open the test list, a test's details and previews.", "read", ["ots.VIEW_TESTS", "ots.isOtsStaff"]],
  ["tests.create", "Tests", "button", "Create and duplicate tests", "Create new tests and duplicate existing ones.", "write", ["ots.CREATE_TEST"]],
  ["tests.edit", "Tests", "button", "Edit tests", "Edit a test's information, configuration, sections and question selection.", "write", ["ots.EDIT_TEST"]],
  ["tests.publish", "Tests", "button", "Publish and close tests", "Publish a draft so it can be assigned, and close a published test.", "write", ["ots.PUBLISH_TEST"]],
  ["tests.archive", "Tests", "button", "Archive and restore tests", "Archive a test or bring it back.", "write", ["ots.ARCHIVE_TEST"]],
  ["tests.delete", "Tests", "button", "Delete tests", "Delete draft tests that have never been attempted.", "write", ["ots.DELETE_TEST"]],
  ["questions.view", "Question bank", "page", "See questions", "Browse and preview the question bank.", "read", ["ots.VIEW_QUESTIONS", "ots.isOtsStaff"]],
  ["questions.create", "Question bank", "button", "Create questions", "Create, duplicate and bulk-create questions.", "write", ["ots.CREATE_QUESTION"]],
  ["questions.edit", "Question bank", "button", "Edit and archive questions", "Edit a question and archive or restore it.", "write", ["ots.EDIT_QUESTION"]],
  ["questions.delete", "Question bank", "button", "Delete questions", "Delete questions that no test uses.", "write", ["ots.DELETE_QUESTION"]],
  ["questions.import", "Question bank", "button", "Import questions", "Import questions from CSV or Excel.", "write", ["ots.IMPORT_QUESTIONS"]],
  ["questions.export", "Question bank", "export", "Export the question bank", "Export the question bank to CSV or Excel (this includes the answer keys, so it is not read only).", "write", ["ots.EXPORT_QUESTIONS"]],
  ["assignments.own", "Assigned tests", "page", "See the tests assigned to me", "See the person's own assigned tests: pending, in progress, completed and expired.", "read", ["ots.TAKE_TEST"]],
  ["assignments.take", "Assigned tests", "button", "Start and submit my tests", "Start, answer and submit the tests assigned to the person (this creates attempts, so it is not read only).", "write", ["ots.TAKE_TEST"]],
  ["assignments.all", "Assigned tests", "scope", "See everyone's assignments and progress", "Without this a person sees only their own assigned tests. With it they see who has been assigned which test and their progress.", "read", ["ots.VIEW_ASSIGNMENTS", "ots.isOtsStaff"], "all"],
  ["assignments.assign", "Assigned tests", "button", "Assign tests", "Assign published tests to departments, roles, people, applicants, students, batches and courses.", "write", ["ots.ASSIGN_TEST"]],
  ["assignments.edit", "Assigned tests", "button", "Edit assignments", "Change an assignment's dates, attempt limit, priority and instructions, and grant extra attempts.", "write", ["ots.EDIT_ASSIGNMENT"]],
  ["assignments.cancel", "Assigned tests", "button", "Cancel assignments", "Cancel assignments that have not been completed.", "write", ["ots.CANCEL_ASSIGNMENT"]],
  ["results.own", "Results", "page", "See my results", "See the person's own results and attempts, as far as each test's result visibility allows.", "read", ["ots.VIEW_RESULTS"]],
  ["results.all", "Results", "scope", "See everyone's results", "Without this a person sees only their own results. With it they see every candidate's results and attempts.", "read", ["ots.VIEW_REPORTS", "ots.isOtsStaff"], "all"],
  ["answers.evaluate", "Results", "button", "Mark subjective answers", "Mark short, long, coding, SQL and debugging answers (this also lets the person open the results list).", "write", ["ots.EVALUATE_ANSWERS", "ots.isOtsStaff"]],
  ["answers.override", "Results", "button", "Override marks", "Change the marks of any answer, including auto-graded ones.", "write", ["ots.OVERRIDE_MARKS"]],
  ["results.publish", "Results", "button", "Publish results", "Release results to candidates when a test does not release them automatically.", "write", ["ots.PUBLISH_RESULTS"]],
  ["reports.view", "Reports & analytics", "page", "Open reports and analytics", "Open the analytics, the reports and the dashboard analytics.", "read", ["ots.VIEW_REPORTS", "ots.isOtsStaff"]],
  ["reports.export", "Reports & analytics", "export", "Export reports and results", "Download reports and results as CSV or Excel.", "write", ["ots.EXPORT_REPORTS"]],
  ["certificates.own", "Certificates", "page", "See my certificates", "View and download the person's own certificates.", "read", ["ots.VIEW_CERTIFICATES"]],
  ["certificates.verify", "Certificates", "section", "Verify any certificate", "Look up any certificate by number or verification code.", "read", ["ots.VERIFY_CERTIFICATE"]],
  ["certificates.generate", "Certificates", "button", "Issue certificates", "Issue a certificate by hand for a passed certification attempt.", "write", ["ots.GENERATE_CERTIFICATE"]],
  ["certificates.revoke", "Certificates", "button", "Revoke and restore certificates", "Revoke an issued certificate or restore it.", "write", ["ots.REVOKE_CERTIFICATE"]],
  ["activity.view", "Activity log", "page", "Read the activity log", "Read the EvalIQ activity log, including exam security events.", "read", ["ots.VIEW_AUDIT_LOG"]],
  ["settings.manage", "Settings", "section", "Change EvalIQ settings", "Change EvalIQ settings and the test and question categories.", "write", ["ots.MANAGE_SETTINGS", "ots.isOtsStaff"]],
];

export const EVALIQ_MICRO: MicroFeature[] = ROWS.map(([short, module, kind, label, description, level, legacy, scope]) => ({
  key: `${P}.${short}`, product: P, module, kind, label, description, level, legacy, ...(scope ? { scope } : {}), ...(BASELINE.has(short) ? { baseline: true } : {}),
}));
