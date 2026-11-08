/**
 * PRMS (Procurement & Expense Management System) role model. Like the HRMS,
 * PMS and TMS products, PRMS access is gated on the shared `admin_users.roles`
 * array — there is no separate PRMS user store. An account can sign into
 * `/spendiq` only if it carries at least one of these roles (see
 * `verifyPrmsCredentials` in `prms-auth.ts`).
 *
 * `super_admin` is the same literal used by the LMS / HRMS / PMS / TMS products
 * and implicitly grants full PRMS access.
 *
 * The capability predicates below (everything except `hasPrmsAccess`,
 * `hasPrmsStaffRole` and `isEmployeeOnly`, the outer tier gates) are Super-
 * Admin-override-aware: each checks `RoleContext.permissionOverrides` before
 * falling back to its role-based default. See `src/lib/permission-overrides.ts`.
 */

import { resolvePermission, type RoleContext } from "@/lib/permission-overrides";

export const PRMS_ROLES = [
  "super_admin",
  "prms_admin",
  "procurement_manager",
  "finance",
  "dept_manager",
  "prms_employee",
] as const;

export type PrmsRole = (typeof PRMS_ROLES)[number];

/** Roles that open the full staff product (dashboard, vendors, requisitions…). */
export const PRMS_STAFF_ROLES: PrmsRole[] = [
  "super_admin",
  "prms_admin",
  "procurement_manager",
  "finance",
  "dept_manager",
];

export const PRMS_ROLE_META: Record<PrmsRole, { label: string; description: string }> = {
  super_admin: {
    label: "Director",
    description: "Full access: procurement, expenses, assets, finance, budgets, reports, settings and the audit log.",
  },
  prms_admin: {
    label: "SpendIQ Admin",
    description: "Run the whole procure-to-pay pipeline, expenses, assets, finance, budgets, settings and reports.",
  },
  procurement_manager: {
    label: "Procurement Manager",
    description: "Vendors, requisitions, RFQ, purchase orders, goods receipt, assets, inventory, subscriptions and contracts.",
  },
  finance: {
    label: "Finance",
    description: "Invoices, payments, budgets, expense approvals and financial reports. No vendor / PO edits.",
  },
  dept_manager: {
    label: "Department Manager",
    description: "Raise requisitions, approve department requests and view department expenses and budget.",
  },
  prms_employee: {
    label: "Employee",
    description: "Self-service portal only — raise purchase requisitions and expense claims, track own approvals.",
  },
};

export function isPrmsRole(value: unknown): value is PrmsRole {
  return typeof value === "string" && (PRMS_ROLES as readonly string[]).includes(value);
}

/** Normalises an arbitrary stored value into a clean, de-duplicated role list. */
export function normalizePrmsRoles(value: unknown): PrmsRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isPrmsRole)));
}

/** Can open the PRMS product at `/spendiq/*` (staff product or employee portal). */
export function hasPrmsAccess(roles: readonly string[] | undefined | null): boolean {
  return normalizePrmsRoles(roles).length > 0;
}

/** Can open the full staff product (dashboard, vendors, requisitions, settings). */
export function hasPrmsStaffRole(roles: readonly PrmsRole[]): boolean {
  return roles.some((r) => PRMS_STAFF_ROLES.includes(r));
}

/** Only the `prms_employee` role — belongs in the `/spendiq/me` portal. */
export function isEmployeeOnly(roles: readonly PrmsRole[]): boolean {
  return roles.length > 0 && !hasPrmsStaffRole(roles);
}

export function isPrmsAdmin(user: RoleContext): boolean {
  return resolvePermission(user, "prms.isPrmsAdmin", () => user.roles.includes("prms_admin"));
}

/** Vendors, PR, RFQ, PO, GRN, assets, inventory, subscriptions, contracts. */
export function canManageProcurement(user: RoleContext): boolean {
  return resolvePermission(user, "prms.canManageProcurement", () =>
    isPrmsAdmin(user) || user.roles.includes("procurement_manager")
  );
}

/** Invoices, payments, budgets, expense approvals, reports. */
export function canManageFinance(user: RoleContext): boolean {
  return resolvePermission(user, "prms.canManageFinance", () => isPrmsAdmin(user) || user.roles.includes("finance"));
}

/** Approve requisitions (dept managers are scoped to their own department by the caller). */
export function canApproveRequisitions(user: RoleContext): boolean {
  return resolvePermission(user, "prms.canApproveRequisitions", () =>
    isPrmsAdmin(user) || user.roles.includes("procurement_manager") || user.roles.includes("dept_manager")
  );
}

/** Create / approve operational expenses. */
export function canManageExpenses(user: RoleContext): boolean {
  return resolvePermission(user, "prms.canManageExpenses", () =>
    isPrmsAdmin(user) || user.roles.includes("procurement_manager") || user.roles.includes("finance")
  );
}

/** Edit PRMS settings (company identity, approval thresholds, category suggestions). */
export function canManageSettings(user: RoleContext): boolean {
  return resolvePermission(user, "prms.canManageSettings", () => isPrmsAdmin(user));
}

/** Read the audit log. */
export function canViewAuditLog(user: RoleContext): boolean {
  return resolvePermission(user, "prms.canViewAuditLog", () => isPrmsAdmin(user));
}

/** View reports & analytics. */
export function canViewReports(user: RoleContext): boolean {
  return resolvePermission(user, "prms.canViewReports", () =>
    isPrmsAdmin(user) ||
    user.roles.includes("procurement_manager") ||
    user.roles.includes("finance") ||
    user.roles.includes("dept_manager")
  );
}

export function primaryPrmsRoleLabel(roles: readonly PrmsRole[]): string {
  if (roles.includes("super_admin")) return PRMS_ROLE_META.super_admin.label;
  if (roles.includes("prms_admin")) return PRMS_ROLE_META.prms_admin.label;
  if (roles.includes("procurement_manager")) return PRMS_ROLE_META.procurement_manager.label;
  if (roles.includes("finance")) return PRMS_ROLE_META.finance.label;
  if (roles.includes("dept_manager")) return PRMS_ROLE_META.dept_manager.label;
  if (roles.includes("prms_employee")) return PRMS_ROLE_META.prms_employee.label;
  return "No Access";
}
