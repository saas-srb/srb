/**
 * TMS (Training Management System) role model. Like the HRMS and PMS products,
 * TMS access is gated on the shared `admin_users.roles` array — there is no
 * separate TMS user store. An account can sign into `/cohort-ai` only if it carries
 * at least one of these roles (see `verifyTmsCredentials` in `tms-auth.ts`).
 *
 * `super_admin` is the same literal used by the LMS / HRMS / PMS products and
 * implicitly grants full TMS access.
 *
 * The capability predicates below (everything except `hasTmsAccess`,
 * `hasTmsStaffRole` and `isStudentOnly`, the outer tier gates) are Super-Admin-
 * override-aware: each checks `RoleContext.permissionOverrides` before falling
 * back to its role-based default. See `src/lib/permission-overrides.ts`.
 */

import { resolvePermission, type RoleContext } from "@/lib/permission-overrides";

export const TMS_ROLES = ["super_admin", "tms_admin", "tms_manager", "mentor", "training_student"] as const;

export type TmsRole = (typeof TMS_ROLES)[number];

/** Roles that open the full staff product (dashboard, programs, batches, students…). */
export const TMS_STAFF_ROLES: TmsRole[] = ["super_admin", "tms_admin", "tms_manager", "mentor"];

export const TMS_ROLE_META: Record<TmsRole, { label: string; description: string }> = {
  super_admin: {
    label: "Director",
    description: "Full access: programs, batches, students, finance, certificates, settings and the audit log.",
  },
  tms_admin: {
    label: "Cohort AI Admin",
    description: "Run every program and batch, manage students, issue certificates, configure settings and payments.",
  },
  tms_manager: {
    label: "Training Manager",
    description: "Manage programs, batches, applications, students, classes, projects and assignments. No finance or settings.",
  },
  mentor: {
    label: "Mentor",
    description: "Deliver assigned batches — classes, assignments and project reviews. No CRM edits or finance.",
  },
  training_student: {
    label: "Student",
    description: "Self-service portal only — enrolled program, batch, schedule, assignments, certificates and payments.",
  },
};

export function isTmsRole(value: unknown): value is TmsRole {
  return typeof value === "string" && (TMS_ROLES as readonly string[]).includes(value);
}

/** Normalises an arbitrary stored value into a clean, de-duplicated role list. */
export function normalizeTmsRoles(value: unknown): TmsRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isTmsRole)));
}

/** Can open the TMS product at `/cohort-ai/*` (staff product or student portal). */
export function hasTmsAccess(roles: readonly string[] | undefined | null): boolean {
  return normalizeTmsRoles(roles).length > 0;
}

/** Can open the full staff product (dashboard, programs, batches, students, settings). */
export function hasTmsStaffRole(roles: readonly TmsRole[]): boolean {
  return roles.some((r) => TMS_STAFF_ROLES.includes(r));
}

/** Only the `training_student` role — belongs in the `/cohort-ai/me` portal. */
export function isStudentOnly(roles: readonly TmsRole[]): boolean {
  return roles.length > 0 && !hasTmsStaffRole(roles);
}

export function isTmsAdmin(user: RoleContext): boolean {
  return resolvePermission(user, "tms.isTmsAdmin", () => user.roles.includes("tms_admin"));
}

/** Full delivery-operations access: programs, batches, applications, students, classes, projects. */
export function canManageTraining(user: RoleContext): boolean {
  return resolvePermission(user, "tms.canManageTraining", () =>
    user.roles.includes("tms_admin") || user.roles.includes("tms_manager")
  );
}

/** Create / edit / archive any program or batch. */
export function canManageProgramsBatches(user: RoleContext): boolean {
  return resolvePermission(user, "tms.canManageProgramsBatches", () => canManageTraining(user));
}

/** Create / edit students + move applications through the pipeline. */
export function canManageStudents(user: RoleContext): boolean {
  return resolvePermission(user, "tms.canManageStudents", () => canManageTraining(user));
}

/** Issue, reissue and revoke certificates. */
export function canIssueCertificates(user: RoleContext): boolean {
  return resolvePermission(user, "tms.canIssueCertificates", () => isTmsAdmin(user));
}

/** Record payments, edit fee structures and view revenue analytics. */
export function canManagePayments(user: RoleContext): boolean {
  return resolvePermission(user, "tms.canManagePayments", () => isTmsAdmin(user));
}

/** Edit TMS settings (categories, technology suggestions, institute identity). */
export function canManageSettings(user: RoleContext): boolean {
  return resolvePermission(user, "tms.canManageSettings", () => isTmsAdmin(user));
}

/** Read the audit log. */
export function canViewAuditLog(user: RoleContext): boolean {
  return resolvePermission(user, "tms.canViewAuditLog", () => isTmsAdmin(user));
}

export function primaryTmsRoleLabel(roles: readonly TmsRole[]): string {
  if (roles.includes("super_admin")) return TMS_ROLE_META.super_admin.label;
  if (roles.includes("tms_admin")) return TMS_ROLE_META.tms_admin.label;
  if (roles.includes("tms_manager")) return TMS_ROLE_META.tms_manager.label;
  if (roles.includes("mentor")) return TMS_ROLE_META.mentor.label;
  if (roles.includes("training_student")) return TMS_ROLE_META.training_student.label;
  return "No Access";
}
