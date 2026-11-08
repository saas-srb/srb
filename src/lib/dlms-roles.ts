/**
 * DLMS (Digi Locker) role + permission model. Like every other product, access
 * is gated on the shared `admin_users.roles` array — there is no separate DLMS
 * user store. A vault holds credentials, so DLMS access is NEVER implied by an
 * HRMS role: it needs an explicit `dlms_*` role (or super_admin).
 *
 * Two independent gates decide what a person can do to a record:
 *   1. the PERMISSION (what kind of action — view / edit / reveal …), and
 *   2. the SCOPE (which records — company, or specific clients). Managers and
 *      admins see every scope; a DLMS Employee only sees the client(s) and/or
 *      the company vault they were explicitly assigned (see `lib/cybervault/access.ts`).
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

export const DLMS_ROLES = ["super_admin", "dlms_admin", "dlms_manager", "dlms_employee"] as const;
export type DlmsRole = (typeof DLMS_ROLES)[number];

export const DLMS_ROLE_META: Record<DlmsRole, { label: string; description: string }> = {
  super_admin: {
    label: "Director",
    description: "Every CyberVault operation across the company vault and all clients, plus settings, access assignment and the activity log.",
  },
  dlms_admin: {
    label: "CyberVault Admin",
    description: "Everything a manager can do, plus CyberVault settings. Sees every company and client record.",
  },
  dlms_manager: {
    label: "CyberVault Manager",
    description: "Manage company and client records, delete, assign employees to clients, and read the activity log. Sees every scope.",
  },
  dlms_employee: {
    label: "CyberVault Employee",
    description: "Work with the client records (and the company vault, if granted) they are assigned to: view, add, edit, reveal credentials, manage and download documents.",
  },
};

export const DLMS_PERMISSIONS = [
  "VIEW",
  "CREATE",
  "EDIT",
  "DELETE",
  "REVEAL",
  "MANAGE_DOCUMENTS",
  "DOWNLOAD",
  "MANAGE_COMPANY",
  "MANAGE_CLIENTS",
  "MANAGE_ACCESS",
  "VIEW_AUDIT",
  "MANAGE_SETTINGS",
] as const;
export type DlmsPermission = (typeof DLMS_PERMISSIONS)[number];

/** Key under which the Director stores an override — matches `permission-catalog.ts`. */
export const DLMS_PERMISSION_KEY: Record<DlmsPermission, string> = {
  VIEW: "dlms.canView",
  CREATE: "dlms.canCreate",
  EDIT: "dlms.canEdit",
  DELETE: "dlms.canDelete",
  REVEAL: "dlms.canRevealCredentials",
  MANAGE_DOCUMENTS: "dlms.canManageDocuments",
  DOWNLOAD: "dlms.canDownloadDocuments",
  MANAGE_COMPANY: "dlms.canManageCompanyRecords",
  MANAGE_CLIENTS: "dlms.canManageClientRecords",
  MANAGE_ACCESS: "dlms.canManageAccess",
  VIEW_AUDIT: "dlms.canViewAudit",
  MANAGE_SETTINGS: "dlms.canManageSettings",
};

export const DLMS_PERMISSION_META: Record<DlmsPermission, { label: string; description: string }> = {
  VIEW: { label: "View", description: "Open the vault and see records (secrets stay masked) within their scope." },
  CREATE: { label: "Create", description: "Add credentials, URLs/accounts, documents and notes." },
  EDIT: { label: "Edit", description: "Edit existing records within their scope." },
  DELETE: { label: "Delete", description: "Delete credentials, URLs/accounts, documents and notes." },
  REVEAL: { label: "Reveal credentials", description: "Show or copy a stored password/secret. Every reveal is logged." },
  MANAGE_DOCUMENTS: { label: "Manage documents", description: "Upload documents, replace them with a new version and edit document details." },
  DOWNLOAD: { label: "Download documents", description: "Preview and download stored documents." },
  MANAGE_COMPANY: { label: "Manage company records", description: "Create, edit and delete records in the Company Vault." },
  MANAGE_CLIENTS: { label: "Manage client records", description: "Create, edit and delete records that belong to a client." },
  MANAGE_ACCESS: { label: "Manage access", description: "Assign CyberVault employees to specific clients and the company vault." },
  VIEW_AUDIT: { label: "View activity log", description: "Read the CyberVault activity log." },
  MANAGE_SETTINGS: { label: "Manage settings", description: "Change CyberVault alert and security settings." },
};

const EMPLOYEE: DlmsPermission[] = ["VIEW", "CREATE", "EDIT", "REVEAL", "MANAGE_DOCUMENTS", "DOWNLOAD", "MANAGE_CLIENTS"];
const MANAGER: DlmsPermission[] = [...EMPLOYEE, "DELETE", "MANAGE_COMPANY", "MANAGE_ACCESS", "VIEW_AUDIT"];
const ADMIN: DlmsPermission[] = [...DLMS_PERMISSIONS];

export const DLMS_ROLE_PERMISSIONS: Record<DlmsRole, readonly DlmsPermission[]> = {
  super_admin: ADMIN,
  dlms_admin: ADMIN,
  dlms_manager: MANAGER,
  dlms_employee: EMPLOYEE,
};

export function isDlmsRole(value: unknown): value is DlmsRole {
  return typeof value === "string" && (DLMS_ROLES as readonly string[]).includes(value);
}

export function normalizeDlmsRoles(value: unknown): DlmsRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isDlmsRole)));
}

/** Can open the DLMS product at `/cybervault/*`. */
export function hasDlmsAccess(roles: readonly string[] | undefined | null): boolean {
  return normalizeDlmsRoles(roles).length > 0;
}

export function isDlmsAdmin(user: RoleContext): boolean {
  return user.roles.includes("super_admin") || user.roles.includes("dlms_admin");
}

/** Manager tier and above see every scope (company + all clients) without an assignment. */
export function isDlmsManagerTier(user: RoleContext): boolean {
  return isDlmsAdmin(user) || user.roles.includes("dlms_manager");
}

/** The single permission check every server action / route / page uses. */
export function dlmsCan(user: RoleContext, permission: DlmsPermission): boolean {
  return resolvePermission(user, DLMS_PERMISSION_KEY[permission], () =>
    normalizeDlmsRoles(user.roles).some((r) => DLMS_ROLE_PERMISSIONS[r].includes(permission))
  );
}

export function primaryDlmsRoleLabel(roles: readonly string[]): string {
  if (roles.includes("super_admin")) return DLMS_ROLE_META.super_admin.label;
  const eff = normalizeDlmsRoles(roles);
  for (const r of ["dlms_admin", "dlms_manager", "dlms_employee"] as const) {
    if (eff.includes(r)) return DLMS_ROLE_META[r].label;
  }
  return "No Access";
}
