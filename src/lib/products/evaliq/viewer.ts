import "server-only";
import { cache } from "react";
import { getCurrentOtsUser } from "@/lib/ots-auth";
import { can as accessCan, type AccessSubject } from "@/lib/access/can";
import { loadAccessSubject } from "@/lib/access/server";
import { microByKey } from "@/lib/access/micro";
import type { Level } from "@/lib/access/types";
import type { RoleContext } from "@/lib/permission-overrides";

const PRODUCT = "evaliq";

/** The old permission names the data layer still passes, translated to micro features in this one place. New code passes the micro key (`<module>.<feature>`). */
export type OtsPermission = "VIEW_TESTS" | "CREATE_TEST" | "EDIT_TEST" | "DELETE_TEST" | "PUBLISH_TEST" | "ARCHIVE_TEST" | "VIEW_QUESTIONS" | "CREATE_QUESTION" | "EDIT_QUESTION" | "DELETE_QUESTION" | "IMPORT_QUESTIONS" | "EXPORT_QUESTIONS" | "ASSIGN_TEST" | "EDIT_ASSIGNMENT" | "CANCEL_ASSIGNMENT" | "VIEW_ASSIGNMENTS" | "EVALUATE_ANSWERS" | "OVERRIDE_MARKS" | "PUBLISH_RESULTS" | "VIEW_REPORTS" | "EXPORT_REPORTS" | "GENERATE_CERTIFICATE" | "REVOKE_CERTIFICATE" | "VERIFY_CERTIFICATE" | "TAKE_TEST" | "VIEW_RESULTS" | "VIEW_CERTIFICATES" | "VIEW_AUDIT_LOG" | "MANAGE_SETTINGS";
export const PERMISSION_FEATURE: Record<OtsPermission, string> = {
  VIEW_TESTS: "tests.view", CREATE_TEST: "tests.create", EDIT_TEST: "tests.edit", DELETE_TEST: "tests.delete", PUBLISH_TEST: "tests.publish", ARCHIVE_TEST: "tests.archive",
  VIEW_QUESTIONS: "questions.view", CREATE_QUESTION: "questions.create", EDIT_QUESTION: "questions.edit", DELETE_QUESTION: "questions.delete", IMPORT_QUESTIONS: "questions.import", EXPORT_QUESTIONS: "questions.export",
  ASSIGN_TEST: "assignments.assign", EDIT_ASSIGNMENT: "assignments.edit", CANCEL_ASSIGNMENT: "assignments.cancel", VIEW_ASSIGNMENTS: "assignments.all",
  EVALUATE_ANSWERS: "answers.evaluate", OVERRIDE_MARKS: "answers.override", PUBLISH_RESULTS: "results.publish", VIEW_REPORTS: "reports.view", EXPORT_REPORTS: "reports.export",
  GENERATE_CERTIFICATE: "certificates.generate", REVOKE_CERTIFICATE: "certificates.revoke", VERIFY_CERTIFICATE: "certificates.verify", TAKE_TEST: "assignments.take", VIEW_RESULTS: "results.own", VIEW_CERTIFICATES: "certificates.own",
  VIEW_AUDIT_LOG: "activity.view", MANAGE_SETTINGS: "settings.manage",
};
import { staffCandidateRefs } from "@/lib/products/evaliq/people";
import type { CandidateRef } from "@/lib/products/evaliq/constants";

export interface OtsViewer {
  userId: string;
  email: string;
  name: string;
  roles: string[];
  ctx: RoleContext;
  /** The person's access (micro features of EvalIQ). */
  subject: AccessSubject;
  employeeId: string | null;
  /** Every candidate identity this login takes tests as (employee / staff user / TMS student). */
  candidates: CandidateRef[];
  isStaff: boolean;
}

/** Request-scoped current viewer (null when signed out). Pages, layouts and components share one resolution. */
export const getViewer = cache(async (): Promise<OtsViewer | null> => {
  const user = await getCurrentOtsUser();
  if (!user) return null;
  const ctx = { roles: user.roles, permissionOverrides: user.permissionOverrides };
  const subject = (await loadAccessSubject(user.id)) ?? { isDirector: false, access: {} };
  const who = await staffCandidateRefs({ id: user.id, email: user.email, employeeId: user.employeeId, studentId: user.studentId });
  return {
    userId: user.id,
    email: user.email,
    name: who.name,
    roles: user.roles,
    ctx,
    subject,
    employeeId: who.employeeId,
    candidates: who.refs,
    isStaff: STAFF_FEATURES.some((f) => can({ subject }, f)),
  };
});

/** Anything beyond taking tests (drives the simplified candidate menu): the same rule the old roles used. */
const STAFF_FEATURES = ["tests.view", "questions.view", "assignments.all", "reports.view", "answers.evaluate", "settings.manage"];

/** The one check. `key` is a micro key (`<module>.<feature>`, no product) or one of the old permission names (translated). An unknown key is never allowed. */
export function can(viewer: Pick<OtsViewer, "subject">, key: string, level?: Level): boolean {
  const short = (PERMISSION_FEATURE as Record<string, string>)[key] ?? key;
  const full = `${PRODUCT}.${short}`;
  const m = microByKey(full);
  if (!m) return false;
  return accessCan(viewer.subject, PRODUCT, full, level ?? m.level);
}

/** For server actions / route handlers: throws `Unauthorized` when signed out. */
export async function requireViewer(): Promise<OtsViewer> {
  const v = await getViewer();
  if (!v) throw new Error("Unauthorized");
  return v;
}

export class ForbiddenError extends Error {
  constructor(public permission?: string) {
    super("Forbidden");
  }
}

export class NotFoundError extends Error {
  constructor() {
    super("Not found");
  }
}

/** A user-facing validation failure: its message is safe to show as-is. */
export class OtsInputError extends Error {}
