/**
 * HRMS role model. Roles live on the shared `admin_users` document as a
 * `roles: string[]` array — there is no separate HRMS user store. An admin
 * account can only sign into the HRMS product if it carries at least one of
 * these roles (see `verifyHrmsCredentials` in `hrms-auth.ts`).
 *
 * The capability predicates below (everything except `hasAnyHrmsRole`,
 * `hasStaffRole`, `isEmployeeOnly` and `isSuperAdmin`, the outer tier/identity
 * gates) are Super-Admin-override-aware: each checks
 * `RoleContext.permissionOverrides` before falling back to its role-based
 * default. See `src/lib/permission-overrides.ts`.
 */

import { resolvePermission, type RoleContext } from "@/lib/permission-overrides";

export const HRMS_ROLES = ["super_admin", "hr", "manager", "employee"] as const;

export type HrmsRole = (typeof HRMS_ROLES)[number];

/** Roles that grant access to the staff product (`/talentos/*`). `employee` does not. */
export const STAFF_ROLES: HrmsRole[] = ["super_admin", "hr", "manager"];

export const HRMS_ROLE_META: Record<HrmsRole, { label: string; description: string }> = {
  super_admin: {
    label: "Director",
    description: "Full access: employees, masters, payroll, audit logs, and settings.",
  },
  hr: {
    label: "HR",
    description: "Manage employees, departments, designations, teams and payroll.",
  },
  manager: {
    label: "Manager",
    description: "View and update only their own reporting line. No payroll or master data.",
  },
  employee: {
    label: "Employee",
    description: "Self-service portal only — own attendance, leave, documents and payslips.",
  },
};

export function isHrmsRole(value: unknown): value is HrmsRole {
  return typeof value === "string" && (HRMS_ROLES as readonly string[]).includes(value);
}

/** Normalises an arbitrary stored value into a clean, de-duplicated role list. */
export function normalizeRoles(value: unknown): HrmsRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isHrmsRole)));
}

export function hasAnyHrmsRole(roles: readonly string[] | undefined | null): boolean {
  return normalizeRoles(roles).length > 0;
}

export function isSuperAdmin(roles: readonly HrmsRole[]): boolean {
  return roles.includes("super_admin");
}

/** Can open the staff product at `/talentos/*` (dashboard, employees, payroll, …). */
export function hasStaffRole(roles: readonly HrmsRole[]): boolean {
  return roles.some((r) => STAFF_ROLES.includes(r));
}

/** Only has the `employee` role — belongs in the `/talentos/me` portal. */
export function isEmployeeOnly(roles: readonly HrmsRole[]): boolean {
  return roles.length > 0 && !hasStaffRole(roles);
}

/** Run payroll, approve runs, pay salaries through Razorpay. */
export function canRunPayroll(user: RoleContext): boolean {
  return resolvePermission(user, "hrms.canRunPayroll", () => user.roles.includes("hr"));
}

/** Upload / replace / delete documents on any employee. */
export function canManageEmployeeDocuments(user: RoleContext): boolean {
  return resolvePermission(user, "hrms.canManageEmployeeDocuments", () => user.roles.includes("hr"));
}

/** Edit statutory payroll rates + tax config. */
export function canManagePayrollConfig(user: RoleContext): boolean {
  return resolvePermission(user, "hrms.canManagePayrollConfig", () => false);
}

/** Create / edit / delete employees, change employment status. */
export function canManageEmployees(user: RoleContext): boolean {
  return resolvePermission(user, "hrms.canManageEmployees", () => user.roles.includes("hr"));
}

/** Create / edit / delete departments, designations and teams. */
export function canManageMasters(user: RoleContext): boolean {
  return resolvePermission(user, "hrms.canManageMasters", () => user.roles.includes("hr"));
}

/** View and edit salary structure and bank details. */
export function canManagePayroll(user: RoleContext): boolean {
  return resolvePermission(user, "hrms.canManagePayroll", () => user.roles.includes("hr"));
}

/** See every employee vs. only the signed-in manager's reporting line. */
export function canViewAllEmployees(user: RoleContext): boolean {
  return resolvePermission(user, "hrms.canViewAllEmployees", () => user.roles.includes("hr"));
}

/** Read the audit trail. */
export function canViewAuditLog(user: RoleContext): boolean {
  return resolvePermission(user, "hrms.canViewAuditLog", () => false);
}

/** Record / correct attendance. Managers are scoped to their reporting line. */
export function canManageAttendance(user: RoleContext): boolean {
  return resolvePermission(user, "hrms.canManageAttendance", () =>
    user.roles.includes("hr") || user.roles.includes("manager")
  );
}

/** File and decide leave requests. Managers are scoped to their reporting line. */
export function canApproveLeave(user: RoleContext): boolean {
  return resolvePermission(user, "hrms.canApproveLeave", () =>
    user.roles.includes("hr") || user.roles.includes("manager")
  );
}

/** Create / edit / delete holidays. */
export function canManageHolidays(user: RoleContext): boolean {
  return resolvePermission(user, "hrms.canManageHolidays", () => user.roles.includes("hr"));
}

/** Edit the org-wide work schedule and leave-type configuration. */
export function canManageSettings(user: RoleContext): boolean {
  return resolvePermission(user, "hrms.canManageSettings", () => false);
}

export function primaryRoleLabel(roles: readonly HrmsRole[]): string {
  if (roles.includes("super_admin")) return HRMS_ROLE_META.super_admin.label;
  if (roles.includes("hr")) return HRMS_ROLE_META.hr.label;
  if (roles.includes("manager")) return HRMS_ROLE_META.manager.label;
  if (roles.includes("employee")) return HRMS_ROLE_META.employee.label;
  return "No Access";
}
