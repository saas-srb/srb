/**
 * The `super_admin` role (formerly the separate admin product's role model). Access is gated on the shared
 * `admin_users.roles` array — the same store every other product (HRMS/PMS/
 * PRMS/TMS/LMS/Messenger) uses. Unlike every other product, this one grants
 * access to `super_admin` ONLY: no module-scoped admin/manager role opens it,
 * since it aggregates financial and cross-module data every other product
 * deliberately keeps siloed.
 */

export const ADMIN_ROLES = ["super_admin"] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

/** Normalises an arbitrary stored value into a clean, de-duplicated role list. */
export function normalizeAdminRoles(value: unknown): AdminRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isAdminRole)));
}

/** Holds `super_admin` — the default holder of every Workspace management permission. */
export function hasAdminAccess(roles: readonly string[] | undefined | null): boolean {
  return normalizeAdminRoles(roles).length > 0;
}

export const ADMIN_ROLE_META: Record<AdminRole, { label: string; description: string }> = {
  super_admin: {
    label: "Director",
    description: "Full cross-module executive visibility: financials, operations, and every module's live KPIs.",
  },
};

export function primaryAdminRoleLabel(roles: readonly AdminRole[]): string {
  return roles.includes("super_admin") ? ADMIN_ROLE_META.super_admin.label : "No Access";
}
