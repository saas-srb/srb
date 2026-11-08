/**
 * PMS (Project Management System) role model. Like the HRMS product, PMS access
 * is gated on the shared `admin_users.roles` array — there is no separate PMS
 * user store. An account can sign into `/sprintos` only if it carries at least one
 * of these roles (see `verifyPmsCredentials` in `pms-auth.ts`).
 *
 * `super_admin` is the same literal used by the HRMS/LMS products and implicitly
 * grants full PMS access.
 *
 * The capability predicates below (everything except `hasPmsAccess`,
 * `hasPmsStaffRole` and `isPmsEmployeeOnly`, the outer tier gates) are Super-
 * Admin-override-aware: each checks `RoleContext.permissionOverrides` before
 * falling back to its role-based default. See `src/lib/permission-overrides.ts`.
 */

import { resolvePermission, type RoleContext } from "@/lib/permission-overrides";

export const PMS_ROLES = ["super_admin", "pms_admin", "pms_manager", "pms_employee"] as const;

export type PmsRole = (typeof PMS_ROLES)[number];

/** Roles that open the full staff product (dashboard, clients, projects, costing…). */
export const PMS_STAFF_ROLES: PmsRole[] = ["super_admin", "pms_admin", "pms_manager"];

export const PMS_ROLE_META: Record<PmsRole, { label: string; description: string }> = {
  super_admin: {
    label: "Director",
    description: "Full access: clients, projects, teams, costing, settings and the activity log.",
  },
  pms_admin: {
    label: "SprintOS Admin",
    description: "Manage every client and project, costing, configure settings, read the activity log.",
  },
  pms_manager: {
    label: "Project Manager",
    description: "Create and run projects, assign tasks, review timesheets and monitor project costing.",
  },
  pms_employee: {
    label: "Employee",
    description: "Self-service portal only — assigned projects, assigned tasks and timesheets.",
  },
};

export function isPmsRole(value: unknown): value is PmsRole {
  return typeof value === "string" && (PMS_ROLES as readonly string[]).includes(value);
}

/** Normalises an arbitrary stored value into a clean, de-duplicated role list. */
export function normalizePmsRoles(value: unknown): PmsRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isPmsRole)));
}

/** Can open the PMS product at `/sprintos/*` (staff product or employee portal). */
export function hasPmsAccess(roles: readonly string[] | undefined | null): boolean {
  return normalizePmsRoles(roles).length > 0;
}

/** Can open the full staff product (dashboard, clients, projects, costing, settings). */
export function hasPmsStaffRole(roles: readonly PmsRole[]): boolean {
  return roles.some((r) => PMS_STAFF_ROLES.includes(r));
}

/** Only the `pms_employee` role — belongs in the `/sprintos/me` portal. */
export function isPmsEmployeeOnly(roles: readonly PmsRole[]): boolean {
  return roles.length > 0 && !hasPmsStaffRole(roles);
}

export function isPmsAdmin(user: RoleContext): boolean {
  return resolvePermission(user, "pms.isPmsAdmin", () => user.roles.includes("pms_admin"));
}

/** View the project-costing / financial dashboards + project reports. */
export function canViewCosting(user: RoleContext): boolean {
  return resolvePermission(user, "pms.canViewCosting", () => hasPmsStaffRole(user.roles as readonly PmsRole[]));
}

/** Review, approve and reject submitted timesheets. */
export function canReviewTimesheets(user: RoleContext): boolean {
  return resolvePermission(user, "pms.canReviewTimesheets", () => hasPmsStaffRole(user.roles as readonly PmsRole[]));
}

/** Create / edit / archive any client. */
export function canManageClients(user: RoleContext): boolean {
  return resolvePermission(user, "pms.canManageClients", () => hasPmsStaffRole(user.roles as readonly PmsRole[]));
}

/** Create / edit / delete any project, task and milestone + manage any project's team. */
export function canManageProjects(user: RoleContext): boolean {
  return resolvePermission(user, "pms.canManageProjects", () => hasPmsStaffRole(user.roles as readonly PmsRole[]));
}

/** See every project vs. only projects the user manages / is a member of. */
export function canViewAllProjects(user: RoleContext): boolean {
  return resolvePermission(user, "pms.canViewAllProjects", () => isPmsAdmin(user));
}

/** Edit PMS settings (categories, default currency, technology suggestions). */
export function canManageSettings(user: RoleContext): boolean {
  return resolvePermission(user, "pms.canManageSettings", () => isPmsAdmin(user));
}

/** Read the activity log. */
export function canViewActivityLog(user: RoleContext): boolean {
  return resolvePermission(user, "pms.canViewActivityLog", () => isPmsAdmin(user));
}

export function primaryPmsRoleLabel(roles: readonly PmsRole[]): string {
  if (roles.includes("super_admin")) return PMS_ROLE_META.super_admin.label;
  if (roles.includes("pms_admin")) return PMS_ROLE_META.pms_admin.label;
  if (roles.includes("pms_manager")) return PMS_ROLE_META.pms_manager.label;
  if (roles.includes("pms_employee")) return PMS_ROLE_META.pms_employee.label;
  return "No Access";
}
