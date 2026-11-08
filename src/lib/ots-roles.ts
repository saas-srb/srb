/**
 * Online Test System (OTS) role + permission model. Like every other product,
 * staff access is gated on the shared `admin_users.roles` array — there is no
 * separate OTS user store. HRMS/TMS stay the source of truth for who a person
 * is, so an account's *effective* OTS roles are its explicit `ots_*` roles PLUS
 * the ones implied by its HRMS / TMS roles (see `impliedRoles`):
 *
 *   - HRMS `employee` / TMS `training_student`  → test taker (`ots_candidate`)
 *   - HRMS `hr`, TMS `tms_admin` / `tms_manager` → `ots_manager` (recruitment
 *     screening, employee assessments, batch exams)
 *   - TMS `mentor`                               → `ots_evaluator`
 *
 * Applicants and students ALSO take tests through the External Portal
 * (`external_users`) — that side never touches these roles; the portal role
 * itself (job_applicant / intern / trainee) is what lets them take tests.
 *
 * Every predicate is Super-Admin-override-aware (`resolvePermission`), so the
 * Director can dial individual capabilities per user at `/commandos/users`
 * (catalog entries are derived from this file in `permission-catalog.ts`).
 *
 * Pure file (no server-only imports) so client components can hide buttons —
 * hiding a button is never the security boundary; every action / route
 * re-checks with these same functions.
 */

import { resolvePermission, type RoleContext } from "@/lib/permission-overrides";

export const OTS_ROLES = ["super_admin", "ots_admin", "ots_manager", "ots_author", "ots_evaluator", "ots_candidate"] as const;
export type OtsRole = (typeof OTS_ROLES)[number];

export const OTS_ROLE_META: Record<OtsRole, { label: string; description: string }> = {
  super_admin: {
    label: "Director",
    description: "Every Online Test System operation, including settings, certificate revocation and the activity log.",
  },
  ots_admin: {
    label: "EvalIQ Admin",
    description: "Everything a manager can do, plus deleting tests, revoking certificates and editing EvalIQ settings.",
  },
  ots_manager: {
    label: "EvalIQ Manager",
    description: "Publishes and archives tests, assigns them to departments, roles, applicants and batches, overrides marks, publishes results and exports reports.",
  },
  ots_author: {
    label: "EvalIQ Author",
    description: "Builds tests and the question bank (create, edit, import, export). Cannot publish, assign or delete.",
  },
  ots_evaluator: {
    label: "EvalIQ Evaluator",
    description: "Reads tests and questions, marks subjective answers and reads reports.",
  },
  ots_candidate: {
    label: "Test Taker",
    description: "Takes assigned tests and sees their own results and certificates.",
  },
};

export const OTS_PERMISSIONS = [
  "VIEW_TESTS",
  "CREATE_TEST",
  "EDIT_TEST",
  "DELETE_TEST",
  "PUBLISH_TEST",
  "ARCHIVE_TEST",
  "VIEW_QUESTIONS",
  "CREATE_QUESTION",
  "EDIT_QUESTION",
  "DELETE_QUESTION",
  "IMPORT_QUESTIONS",
  "EXPORT_QUESTIONS",
  "ASSIGN_TEST",
  "EDIT_ASSIGNMENT",
  "CANCEL_ASSIGNMENT",
  "VIEW_ASSIGNMENTS",
  "EVALUATE_ANSWERS",
  "OVERRIDE_MARKS",
  "PUBLISH_RESULTS",
  "VIEW_REPORTS",
  "EXPORT_REPORTS",
  "GENERATE_CERTIFICATE",
  "REVOKE_CERTIFICATE",
  "VERIFY_CERTIFICATE",
  "TAKE_TEST",
  "VIEW_RESULTS",
  "VIEW_CERTIFICATES",
  "VIEW_AUDIT_LOG",
  "MANAGE_SETTINGS",
] as const;
export type OtsPermission = (typeof OTS_PERMISSIONS)[number];

/** Key under which the Director stores an override — matches `permission-catalog.ts`. */
export const OTS_PERMISSION_KEY: Record<OtsPermission, string> = {
  VIEW_TESTS: "ots.canViewTests",
  CREATE_TEST: "ots.canCreateTest",
  EDIT_TEST: "ots.canEditTest",
  DELETE_TEST: "ots.canDeleteTest",
  PUBLISH_TEST: "ots.canPublishTest",
  ARCHIVE_TEST: "ots.canArchiveTest",
  VIEW_QUESTIONS: "ots.canViewQuestions",
  CREATE_QUESTION: "ots.canCreateQuestion",
  EDIT_QUESTION: "ots.canEditQuestion",
  DELETE_QUESTION: "ots.canDeleteQuestion",
  IMPORT_QUESTIONS: "ots.canImportQuestions",
  EXPORT_QUESTIONS: "ots.canExportQuestions",
  ASSIGN_TEST: "ots.canAssignTest",
  EDIT_ASSIGNMENT: "ots.canEditAssignment",
  CANCEL_ASSIGNMENT: "ots.canCancelAssignment",
  VIEW_ASSIGNMENTS: "ots.canViewAssignments",
  EVALUATE_ANSWERS: "ots.canEvaluateAnswers",
  OVERRIDE_MARKS: "ots.canOverrideMarks",
  PUBLISH_RESULTS: "ots.canPublishResults",
  VIEW_REPORTS: "ots.canViewReports",
  EXPORT_REPORTS: "ots.canExportReports",
  GENERATE_CERTIFICATE: "ots.canGenerateCertificate",
  REVOKE_CERTIFICATE: "ots.canRevokeCertificate",
  VERIFY_CERTIFICATE: "ots.canVerifyCertificate",
  TAKE_TEST: "ots.canTakeTest",
  VIEW_RESULTS: "ots.canViewOwnResults",
  VIEW_CERTIFICATES: "ots.canViewOwnCertificates",
  VIEW_AUDIT_LOG: "ots.canViewAuditLog",
  MANAGE_SETTINGS: "ots.canManageSettings",
};

export const OTS_PERMISSION_META: Record<OtsPermission, { label: string; description: string }> = {
  VIEW_TESTS: { label: "View tests", description: "Open the test list, test details and previews." },
  CREATE_TEST: { label: "Create tests", description: "Create new tests and duplicate existing ones." },
  EDIT_TEST: { label: "Edit tests", description: "Edit a test's information, configuration, sections and question selection." },
  DELETE_TEST: { label: "Delete tests", description: "Delete draft tests that have never been attempted." },
  PUBLISH_TEST: { label: "Publish tests", description: "Publish a draft so it can be assigned, and close a published test." },
  ARCHIVE_TEST: { label: "Archive tests", description: "Archive and restore tests." },
  VIEW_QUESTIONS: { label: "View questions", description: "Browse and preview the question bank." },
  CREATE_QUESTION: { label: "Create questions", description: "Create, duplicate and bulk-create questions." },
  EDIT_QUESTION: { label: "Edit questions", description: "Edit and archive questions." },
  DELETE_QUESTION: { label: "Delete questions", description: "Delete questions that no test uses." },
  IMPORT_QUESTIONS: { label: "Import questions", description: "Import questions from CSV / Excel." },
  EXPORT_QUESTIONS: { label: "Export questions", description: "Export the question bank to CSV / Excel (includes answer keys)." },
  ASSIGN_TEST: { label: "Assign tests", description: "Assign published tests to departments, roles, employees, applicants, students, batches and courses." },
  EDIT_ASSIGNMENT: { label: "Edit assignments", description: "Change an assignment's dates, attempt limit, priority and instructions; grant extra attempts." },
  CANCEL_ASSIGNMENT: { label: "Cancel assignments", description: "Cancel assignments that have not been completed." },
  VIEW_ASSIGNMENTS: { label: "View assignments", description: "See who has been assigned which test and their progress." },
  EVALUATE_ANSWERS: { label: "Evaluate answers", description: "Mark subjective answers (short/long answer, coding, SQL, debugging)." },
  OVERRIDE_MARKS: { label: "Override marks", description: "Change the marks of any answer, including auto-graded ones." },
  PUBLISH_RESULTS: { label: "Publish results", description: "Release results to candidates when the test does not release them automatically." },
  VIEW_REPORTS: { label: "View reports & analytics", description: "Open the dashboard analytics, reports and every candidate's results." },
  EXPORT_REPORTS: { label: "Export reports", description: "Download reports and results as CSV / Excel." },
  GENERATE_CERTIFICATE: { label: "Generate certificates", description: "Issue a certificate manually for a passed certification attempt." },
  REVOKE_CERTIFICATE: { label: "Revoke certificates", description: "Revoke and restore issued certificates." },
  VERIFY_CERTIFICATE: { label: "Verify certificates", description: "Look up any certificate by number or verification code." },
  TAKE_TEST: { label: "Take tests", description: "Start and submit tests assigned to them." },
  VIEW_RESULTS: { label: "View own results", description: "See their own results, as far as each test's result visibility allows." },
  VIEW_CERTIFICATES: { label: "View own certificates", description: "View and download their own certificates." },
  VIEW_AUDIT_LOG: { label: "View activity log", description: "Read the EvalIQ activity log, including exam security events." },
  MANAGE_SETTINGS: { label: "Manage settings & categories", description: "Edit EvalIQ settings and the test / question categories." },
};

const CANDIDATE: OtsPermission[] = ["TAKE_TEST", "VIEW_RESULTS", "VIEW_CERTIFICATES", "VERIFY_CERTIFICATE"];
const EVALUATOR: OtsPermission[] = [...CANDIDATE, "VIEW_TESTS", "VIEW_QUESTIONS", "VIEW_ASSIGNMENTS", "EVALUATE_ANSWERS", "VIEW_REPORTS"];
const AUTHOR: OtsPermission[] = [...EVALUATOR, "CREATE_TEST", "EDIT_TEST", "CREATE_QUESTION", "EDIT_QUESTION", "IMPORT_QUESTIONS", "EXPORT_QUESTIONS"];
const MANAGER: OtsPermission[] = [
  ...AUTHOR,
  "PUBLISH_TEST",
  "ARCHIVE_TEST",
  "DELETE_QUESTION",
  "ASSIGN_TEST",
  "EDIT_ASSIGNMENT",
  "CANCEL_ASSIGNMENT",
  "OVERRIDE_MARKS",
  "PUBLISH_RESULTS",
  "EXPORT_REPORTS",
  "GENERATE_CERTIFICATE",
  "VIEW_AUDIT_LOG",
];
const ADMIN: OtsPermission[] = [...OTS_PERMISSIONS];

export const OTS_ROLE_PERMISSIONS: Record<OtsRole, readonly OtsPermission[]> = {
  super_admin: ADMIN,
  ots_admin: ADMIN,
  ots_manager: MANAGER,
  ots_author: AUTHOR,
  ots_evaluator: EVALUATOR,
  ots_candidate: CANDIDATE,
};

export function isOtsRole(value: unknown): value is OtsRole {
  return typeof value === "string" && (OTS_ROLES as readonly string[]).includes(value);
}

/** Explicit OTS roles only. */
export function normalizeOtsRoles(value: unknown): OtsRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isOtsRole)));
}

/** HRMS / TMS remain the source of truth for who someone is: their roles imply an OTS tier. */
function impliedRoles(roles: readonly string[]): OtsRole[] {
  const out: OtsRole[] = [];
  if (roles.includes("employee") || roles.includes("training_student")) out.push("ots_candidate");
  if (roles.includes("hr") || roles.includes("tms_admin") || roles.includes("tms_manager")) out.push("ots_manager");
  if (roles.includes("mentor")) out.push("ots_evaluator");
  return out;
}

/** Explicit `ots_*` roles plus what the account's HRMS / TMS roles imply. */
export function effectiveOtsRoles(roles: readonly string[] | undefined | null): OtsRole[] {
  const raw = roles ?? [];
  return Array.from(new Set([...normalizeOtsRoles(raw), ...impliedRoles(raw)]));
}

/** Can open the OTS product at `/evaliq/*`. */
export function hasOtsAccess(roles: readonly string[] | undefined | null): boolean {
  return effectiveOtsRoles(roles).length > 0;
}

/** The single permission check every server action / route / page uses. */
export function otsCan(user: RoleContext, permission: OtsPermission): boolean {
  return resolvePermission(user, OTS_PERMISSION_KEY[permission], () =>
    effectiveOtsRoles(user.roles).some((r) => OTS_ROLE_PERMISSIONS[r].includes(permission))
  );
}

/** True when the account can do anything beyond taking tests (drives the simplified candidate sidebar). */
export function isOtsStaff(user: RoleContext): boolean {
  return (["VIEW_TESTS", "VIEW_QUESTIONS", "VIEW_ASSIGNMENTS", "VIEW_REPORTS", "EVALUATE_ANSWERS", "MANAGE_SETTINGS"] as const).some((p) => otsCan(user, p));
}

export function primaryOtsRoleLabel(roles: readonly string[]): string {
  if (roles.includes("super_admin")) return OTS_ROLE_META.super_admin.label;
  const eff = effectiveOtsRoles(roles);
  for (const r of ["ots_admin", "ots_manager", "ots_author", "ots_evaluator", "ots_candidate"] as const) {
    if (eff.includes(r)) return OTS_ROLE_META[r].label;
  }
  return "No Access";
}
