/**
 * SOP Product role + permission model. Like every other product, access is gated
 * on the shared `admin_users.roles` array — there is no separate SOP user
 * store. HRMS stays the source of truth for who an employee is, so an
 * account's *effective* SOP roles are its explicit `sop_*` roles PLUS the
 * ones implied by its HRMS role (see `impliedFromHrms`): every HRMS
 * `employee` can read/acknowledge SOPs without a second role grant.
 *
 * Permissions are the twelve granular capabilities from the SOP spec. There
 * is deliberately NO review / approve / reject permission: publishing is a
 * direct action for anyone holding `PUBLISH`.
 *
 * Every predicate is Super-Admin-override-aware (`resolvePermission`), so the
 * Director can dial individual capabilities per user at `/commandos/users`
 * (catalog entries live in `src/lib/commandos/permission-catalog.ts`).
 *
 * This file is pure (no server-only imports) so client components can use it
 * to hide buttons — but hiding a button is never the security boundary; every
 * server action / route re-checks with these same functions.
 */

import { resolvePermission, type RoleContext } from "@/lib/permission-overrides";

export const SOP_ROLES = ["super_admin", "sop_admin", "sop_manager", "sop_author", "sop_employee"] as const;
export type SopRole = (typeof SOP_ROLES)[number];

export const SOP_ROLE_META: Record<SopRole, { label: string; description: string }> = {
  super_admin: {
    label: "Director",
    description: "Everything in Playbook across all departments, plus templates, structure, settings and audit.",
  },
  sop_admin: {
    label: "Playbook Admin",
    description: "Manage every procedure in every department, templates, categories, structure, settings, reports and the audit log.",
  },
  sop_manager: {
    label: "Playbook Manager",
    description: "Create, edit, publish, assign and archive procedures for their own department(s); monitor acknowledgements and compliance.",
  },
  sop_author: {
    label: "Playbook Author",
    description: "Create procedures in their department and edit the procedures they own or author. Cannot publish unless granted.",
  },
  sop_employee: {
    label: "Playbook Reader",
    description: "Read permitted procedures, acknowledge assignments, complete checklists and submit feedback.",
  },
};

export const SOP_PERMISSIONS = [
  "VIEW",
  "CREATE",
  "EDIT",
  "PUBLISH",
  "ASSIGN",
  "ACKNOWLEDGE",
  "ARCHIVE",
  "DOWNLOAD",
  "EXPORT",
  "MANAGE_TEMPLATES",
  "MANAGE_PERMISSIONS",
  "VIEW_AUDIT",
] as const;
export type SopPermission = (typeof SOP_PERMISSIONS)[number];

/** Key under which the Director stores an override — matches `permission-catalog.ts`. */
export const SOP_PERMISSION_KEY: Record<SopPermission, string> = {
  VIEW: "sop.canView",
  CREATE: "sop.canCreate",
  EDIT: "sop.canEdit",
  PUBLISH: "sop.canPublish",
  ASSIGN: "sop.canAssign",
  ACKNOWLEDGE: "sop.canAcknowledge",
  ARCHIVE: "sop.canArchive",
  DOWNLOAD: "sop.canDownload",
  EXPORT: "sop.canExport",
  MANAGE_TEMPLATES: "sop.canManageTemplates",
  MANAGE_PERMISSIONS: "sop.canManagePermissions",
  VIEW_AUDIT: "sop.canViewAudit",
};

export const SOP_PERMISSION_META: Record<SopPermission, { label: string; description: string }> = {
  VIEW: { label: "View", description: "Open and search the procedures their confidentiality level allows." },
  CREATE: { label: "Create", description: "Start new procedure drafts in their department." },
  EDIT: { label: "Edit", description: "Edit procedure drafts and metadata within their scope." },
  PUBLISH: { label: "Publish", description: "Publish a draft or a new version directly — there is no approval step." },
  ASSIGN: { label: "Assign", description: "Assign procedures to employees, teams, departments and roles." },
  ACKNOWLEDGE: { label: "Acknowledge", description: "Acknowledge procedures and complete assigned checklists." },
  ARCHIVE: { label: "Archive", description: "Archive and restore procedures." },
  DOWNLOAD: { label: "Download", description: "Download attachments and print/save procedures that allow it." },
  EXPORT: { label: "Export", description: "Export procedure lists and compliance reports as CSV." },
  MANAGE_TEMPLATES: { label: "Manage templates & structure", description: "Edit templates, categories, departments, functions and processes." },
  MANAGE_PERMISSIONS: { label: "Manage permissions", description: "Change procedure settings and grant explicit access to restricted procedures." },
  VIEW_AUDIT: { label: "View audit", description: "Read the procedure audit trail." },
};

const READER: SopPermission[] = ["VIEW", "ACKNOWLEDGE", "DOWNLOAD"];
const AUTHOR: SopPermission[] = [...READER, "CREATE", "EDIT"];
const MANAGER: SopPermission[] = [...AUTHOR, "PUBLISH", "ASSIGN", "ARCHIVE", "EXPORT"];
const ADMIN: SopPermission[] = [...SOP_PERMISSIONS];

export const SOP_ROLE_PERMISSIONS: Record<SopRole, readonly SopPermission[]> = {
  super_admin: ADMIN,
  sop_admin: ADMIN,
  sop_manager: MANAGER,
  sop_author: AUTHOR,
  sop_employee: READER,
};

export function isSopRole(value: unknown): value is SopRole {
  return typeof value === "string" && (SOP_ROLES as readonly string[]).includes(value);
}

/** Explicit SOP roles only. */
export function normalizeSopRoles(value: unknown): SopRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isSopRole)));
}

/** HRMS remains the source of truth for reporting structure: its roles imply an SOP tier. */
function impliedFromHrms(roles: readonly string[]): SopRole[] {
  const out: SopRole[] = [];
  if (roles.includes("employee")) out.push("sop_employee");
  if (roles.includes("manager") || roles.includes("hr")) out.push("sop_manager");
  return out;
}

/** Explicit `sop_*` roles plus what the account's HRMS role implies. */
export function effectiveSopRoles(roles: readonly string[] | undefined | null): SopRole[] {
  const raw = roles ?? [];
  return Array.from(new Set([...normalizeSopRoles(raw), ...impliedFromHrms(raw)]));
}

/** Can open the SOP product at `/playbook-ai/*`. */
export function hasSopAccess(roles: readonly string[] | undefined | null): boolean {
  return effectiveSopRoles(roles).length > 0;
}

export function isSopAdmin(user: RoleContext): boolean {
  return user.roles.includes("super_admin") || user.roles.includes("sop_admin");
}

/** True when this account is a manager-tier SOP user (explicit or via HRMS manager/hr). */
export function isSopManagerTier(user: RoleContext): boolean {
  return isSopAdmin(user) || effectiveSopRoles(user.roles).includes("sop_manager");
}

/** The single permission check every server action / route / page uses. */
export function sopCan(user: RoleContext, permission: SopPermission): boolean {
  return resolvePermission(user, SOP_PERMISSION_KEY[permission], () =>
    effectiveSopRoles(user.roles).some((r) => SOP_ROLE_PERMISSIONS[r].includes(permission))
  );
}

export function primarySopRoleLabel(roles: readonly string[]): string {
  if (roles.includes("super_admin")) return SOP_ROLE_META.super_admin.label;
  const eff = effectiveSopRoles(roles);
  for (const r of ["sop_admin", "sop_manager", "sop_author", "sop_employee"] as const) {
    if (eff.includes(r)) return SOP_ROLE_META[r].label;
  }
  return "No Access";
}
