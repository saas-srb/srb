/**
 * Website CMS role + permission model. Like every other product, access is
 * gated on the shared `admin_users.roles` array — there is no separate CMS
 * user store. CMS access is never implied by another product's role: it needs
 * an explicit `cms_*` role (or super_admin).
 *
 * Every predicate is Super-Admin-override-aware (`resolvePermission`), so the
 * Director can dial individual capabilities per user at `/commandos/users`
 * (catalog entries are derived from this file in
 * `src/lib/commandos/permission-catalog.ts`).
 *
 * This file is pure (no server-only imports) so client components can use it
 * to hide buttons — hiding a button is never the security boundary; every
 * server action / route re-checks with these same functions.
 */

import { resolvePermission, type RoleContext } from "@/lib/permission-overrides";

export const CMS_ROLES = ["super_admin", "cms_admin", "cms_editor", "cms_viewer"] as const;
export type CmsRole = (typeof CMS_ROLES)[number];

export const CMS_ROLE_META: Record<CmsRole, { label: string; description: string }> = {
  super_admin: {
    label: "Director",
    description: "Every SiteCraft operation, including publish, theme, navigation, media and the audit log.",
  },
  cms_admin: {
    label: "SiteCraft Admin",
    description: "Full control: publish pages, manage navigation/footer, delete media, publish the theme, manage settings and the audit log.",
  },
  cms_editor: {
    label: "SiteCraft Editor",
    description: "Create and edit page content, sections, media uploads, form fields and draft theme tokens — cannot publish.",
  },
  cms_viewer: {
    label: "SiteCraft Viewer",
    description: "Read-only access to every SiteCraft dataset.",
  },
};

export const CMS_PERMISSIONS = [
  "VIEW",
  "PAGES_CREATE",
  "PAGES_EDIT",
  "PAGES_DELETE",
  "PAGES_PUBLISH",
  "PAGES_RESTORE",
  "SECTIONS_EDIT",
  "NAV_MANAGE",
  "FOOTER_MANAGE",
  "MEDIA_UPLOAD",
  "MEDIA_DELETE",
  "FORMS_MANAGE",
  "THEME_UPDATE",
  "THEME_PUBLISH",
  "SETTINGS_MANAGE",
  "VIEW_AUDIT",
  "COLLECTIONS_EDIT",
  "COLLECTIONS_PUBLISH",
] as const;
export type CmsPermission = (typeof CMS_PERMISSIONS)[number];

/** Key under which the Director stores an override — matches `permission-catalog.ts`. */
export const CMS_PERMISSION_KEY: Record<CmsPermission, string> = {
  VIEW: "cms.canView",
  PAGES_CREATE: "cms.canCreatePages",
  PAGES_EDIT: "cms.canEditPages",
  PAGES_DELETE: "cms.canDeletePages",
  PAGES_PUBLISH: "cms.canPublishPages",
  PAGES_RESTORE: "cms.canRestorePages",
  SECTIONS_EDIT: "cms.canEditSections",
  NAV_MANAGE: "cms.canManageNav",
  FOOTER_MANAGE: "cms.canManageFooter",
  MEDIA_UPLOAD: "cms.canUploadMedia",
  MEDIA_DELETE: "cms.canDeleteMedia",
  FORMS_MANAGE: "cms.canManageForms",
  THEME_UPDATE: "cms.canUpdateTheme",
  THEME_PUBLISH: "cms.canPublishTheme",
  SETTINGS_MANAGE: "cms.canManageSettings",
  VIEW_AUDIT: "cms.canViewAudit",
  COLLECTIONS_EDIT: "cms.canEditCollections",
  COLLECTIONS_PUBLISH: "cms.canPublishCollections",
};

export const CMS_PERMISSION_META: Record<CmsPermission, { label: string; description: string }> = {
  VIEW: { label: "View", description: "Open the SiteCraft product and read every SiteCraft dataset." },
  PAGES_CREATE: { label: "Create pages", description: "Add new SiteCraft-managed pages." },
  PAGES_EDIT: { label: "Edit pages", description: "Edit a page's draft sections in the builder." },
  PAGES_DELETE: { label: "Delete pages", description: "Remove a SiteCraft-managed page." },
  PAGES_PUBLISH: { label: "Publish pages", description: "Publish a page's draft to the live site, and restore/re-publish a prior version." },
  PAGES_RESTORE: { label: "Restore versions", description: "Load a prior published version back into draft." },
  SECTIONS_EDIT: { label: "Edit sections", description: "Add, remove, reorder and configure individual page sections." },
  NAV_MANAGE: { label: "Manage navigation", description: "Edit and reorder the header navigation menu." },
  FOOTER_MANAGE: { label: "Manage footer", description: "Edit and reorder footer columns and links." },
  MEDIA_UPLOAD: { label: "Upload media", description: "Upload images to the media library." },
  MEDIA_DELETE: { label: "Delete media", description: "Remove media library items." },
  FORMS_MANAGE: { label: "Manage forms", description: "Edit form field labels, order and visibility." },
  THEME_UPDATE: { label: "Edit theme", description: "Edit draft theme tokens and preview them." },
  THEME_PUBLISH: { label: "Publish theme", description: "Publish draft theme tokens to the live site." },
  SETTINGS_MANAGE: { label: "Manage settings", description: "Edit global SiteCraft settings (maintenance mode, defaults)." },
  VIEW_AUDIT: { label: "View audit", description: "Read the SiteCraft audit trail." },
  COLLECTIONS_EDIT: { label: "Edit collections", description: "Create and edit draft blog posts, jobs, engagement models and products." },
  COLLECTIONS_PUBLISH: { label: "Publish collections", description: "Publish, archive or revert collection records on the live site." },
};

const VIEWER: CmsPermission[] = ["VIEW"];
const EDITOR: CmsPermission[] = [
  ...VIEWER,
  "PAGES_CREATE",
  "PAGES_EDIT",
  "SECTIONS_EDIT",
  "MEDIA_UPLOAD",
  "FORMS_MANAGE",
  "THEME_UPDATE",
  "COLLECTIONS_EDIT",
];
const ADMIN: CmsPermission[] = [...CMS_PERMISSIONS];

export const CMS_ROLE_PERMISSIONS: Record<CmsRole, readonly CmsPermission[]> = {
  super_admin: ADMIN,
  cms_admin: ADMIN,
  cms_editor: EDITOR,
  cms_viewer: VIEWER,
};

export function isCmsRole(value: unknown): value is CmsRole {
  return typeof value === "string" && (CMS_ROLES as readonly string[]).includes(value);
}

export function normalizeCmsRoles(value: unknown): CmsRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isCmsRole)));
}

/** Can open the CMS product at `/sitecraft-ai/*`. */
export function hasCmsAccess(roles: readonly string[] | undefined | null): boolean {
  return normalizeCmsRoles(roles ?? []).length > 0;
}

/** The single permission check every server action / route / page uses. */
export function cmsCan(user: RoleContext, permission: CmsPermission): boolean {
  return resolvePermission(user, CMS_PERMISSION_KEY[permission], () =>
    normalizeCmsRoles(user.roles).some((r) => CMS_ROLE_PERMISSIONS[r].includes(permission))
  );
}

export function primaryCmsRoleLabel(roles: readonly string[]): string {
  for (const r of ["super_admin", "cms_admin", "cms_editor", "cms_viewer"] as const) {
    if (roles.includes(r)) return CMS_ROLE_META[r].label;
  }
  return "No Access";
}
