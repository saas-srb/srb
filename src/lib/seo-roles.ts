/**
 * SEO Product role + permission model. Like every other product, access is gated
 * on the shared `admin_users.roles` array — there is no separate SEO user
 * store. Unlike SOP, SEO access is never implied by an HRMS role: SEO is a
 * specialist function, so it needs an explicit `seo_*` role (or super_admin).
 *
 * Permissions are the eighteen granular capabilities from the SEO spec. Every
 * predicate is Super-Admin-override-aware (`resolvePermission`), so the Super
 * Admin can dial individual capabilities per user at `/commandos/users` (catalog
 * entries are derived from this file in `src/lib/commandos/permission-catalog.ts`).
 *
 * This file is pure (no server-only imports) so client components can use it
 * to hide buttons — hiding a button is never the security boundary; every
 * server action / route re-checks with these same functions.
 */

import { resolvePermission, type RoleContext } from "@/lib/permission-overrides";

export const SEO_ROLES = ["super_admin", "seo_admin", "seo_manager", "seo_specialist", "seo_employee"] as const;
export type SeoRole = (typeof SEO_ROLES)[number];

export const SEO_ROLE_META: Record<SeoRole, { label: string; description: string }> = {
  super_admin: {
    label: "Director",
    description: "Every SEO operation, plus integrations, permissions and the audit log.",
  },
  seo_admin: {
    label: "RankMax Admin",
    description: "Global SEO configuration, integrations, reports and the audit log, plus everything a manager can do.",
  },
  seo_manager: {
    label: "RankMax Manager",
    description: "Run SEO operations: website SEO, robots.txt, competitors, reports, deletions and the whole team's tasks.",
  },
  seo_specialist: {
    label: "RankMax Specialist",
    description: "Technical SEO, on-page SEO, rankings, backlinks, sitemap and schema, plus audits and keywords.",
  },
  seo_employee: {
    label: "RankMax Executive",
    description: "View SEO data, run audits, manage keywords, update issues and work on their assigned tasks.",
  },
};

export const SEO_PERMISSIONS = [
  "VIEW",
  "CREATE",
  "EDIT",
  "DELETE",
  "RUN_AUDIT",
  "MANAGE_KEYWORDS",
  "MANAGE_RANKINGS",
  "MANAGE_ON_PAGE_SEO",
  "MANAGE_TECHNICAL_SEO",
  "MANAGE_BACKLINKS",
  "MANAGE_SITEMAP",
  "MANAGE_ROBOTS",
  "MANAGE_SCHEMA",
  "MANAGE_COMPETITORS",
  "MANAGE_TASKS",
  "EXPORT_REPORTS",
  "MANAGE_INTEGRATIONS",
  "VIEW_AUDIT",
] as const;
export type SeoPermission = (typeof SEO_PERMISSIONS)[number];

/** Key under which the Director stores an override — matches `permission-catalog.ts`. */
export const SEO_PERMISSION_KEY: Record<SeoPermission, string> = {
  VIEW: "seo.canView",
  CREATE: "seo.canCreate",
  EDIT: "seo.canEdit",
  DELETE: "seo.canDelete",
  RUN_AUDIT: "seo.canRunAudit",
  MANAGE_KEYWORDS: "seo.canManageKeywords",
  MANAGE_RANKINGS: "seo.canManageRankings",
  MANAGE_ON_PAGE_SEO: "seo.canManageOnPage",
  MANAGE_TECHNICAL_SEO: "seo.canManageTechnical",
  MANAGE_BACKLINKS: "seo.canManageBacklinks",
  MANAGE_SITEMAP: "seo.canManageSitemap",
  MANAGE_ROBOTS: "seo.canManageRobots",
  MANAGE_SCHEMA: "seo.canManageSchema",
  MANAGE_COMPETITORS: "seo.canManageCompetitors",
  MANAGE_TASKS: "seo.canManageTasks",
  EXPORT_REPORTS: "seo.canExportReports",
  MANAGE_INTEGRATIONS: "seo.canManageIntegrations",
  VIEW_AUDIT: "seo.canViewAudit",
};

export const SEO_PERMISSION_META: Record<SeoPermission, { label: string; description: string }> = {
  VIEW: { label: "View", description: "Open the SEO product and read every SEO dataset." },
  CREATE: { label: "Create", description: "Add SEO records such as manual issues and pages." },
  EDIT: { label: "Edit", description: "Update SEO issues and recommendations (status, assignee, notes)." },
  DELETE: { label: "Delete", description: "Delete SEO records (keywords, backlinks, competitors, schema, tasks)." },
  RUN_AUDIT: { label: "Run audits", description: "Start website crawls/audits and page-speed checks." },
  MANAGE_KEYWORDS: { label: "Manage keywords", description: "Add, edit, group and import tracked keywords." },
  MANAGE_RANKINGS: { label: "Manage rankings", description: "Record, import and sync keyword positions." },
  MANAGE_ON_PAGE_SEO: { label: "Manage on-page SEO", description: "Edit live page titles, descriptions, canonicals, social and robots meta." },
  MANAGE_TECHNICAL_SEO: { label: "Manage technical SEO", description: "Change technical settings such as crawl scope and URL indexing notices." },
  MANAGE_BACKLINKS: { label: "Manage backlinks", description: "Add, import and verify backlinks." },
  MANAGE_SITEMAP: { label: "Manage sitemap", description: "Discover/validate sitemaps and change sitemap inclusion and priority." },
  MANAGE_ROBOTS: { label: "Manage robots.txt", description: "Edit and publish the live robots.txt." },
  MANAGE_SCHEMA: { label: "Manage schema", description: "Create, validate and publish JSON-LD structured data." },
  MANAGE_COMPETITORS: { label: "Manage competitors", description: "Add competitors and record their estimated SEO data." },
  MANAGE_TASKS: { label: "Manage tasks", description: "Create SEO tasks and work on assigned ones (managers: the whole team's)." },
  EXPORT_REPORTS: { label: "Export reports", description: "Download SEO reports as CSV / Excel." },
  MANAGE_INTEGRATIONS: { label: "Manage integrations & settings", description: "Configure Search Console, Analytics, PageSpeed and product settings." },
  VIEW_AUDIT: { label: "View audit", description: "Read the SEO audit trail." },
};

const EMPLOYEE: SeoPermission[] = ["VIEW", "CREATE", "EDIT", "RUN_AUDIT", "MANAGE_KEYWORDS", "MANAGE_TASKS"];
const SPECIALIST: SeoPermission[] = [
  ...EMPLOYEE,
  "MANAGE_RANKINGS",
  "MANAGE_ON_PAGE_SEO",
  "MANAGE_TECHNICAL_SEO",
  "MANAGE_BACKLINKS",
  "MANAGE_SITEMAP",
  "MANAGE_SCHEMA",
];
const MANAGER: SeoPermission[] = [...SPECIALIST, "DELETE", "MANAGE_ROBOTS", "MANAGE_COMPETITORS", "EXPORT_REPORTS", "VIEW_AUDIT"];
const ADMIN: SeoPermission[] = [...SEO_PERMISSIONS];

export const SEO_ROLE_PERMISSIONS: Record<SeoRole, readonly SeoPermission[]> = {
  super_admin: ADMIN,
  seo_admin: ADMIN,
  seo_manager: MANAGER,
  seo_specialist: SPECIALIST,
  seo_employee: EMPLOYEE,
};

export function isSeoRole(value: unknown): value is SeoRole {
  return typeof value === "string" && (SEO_ROLES as readonly string[]).includes(value);
}

export function normalizeSeoRoles(value: unknown): SeoRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isSeoRole)));
}

/** Can open the SEO product at `/rankmax-ai/*`. */
export function hasSeoAccess(roles: readonly string[] | undefined | null): boolean {
  return normalizeSeoRoles(roles ?? []).length > 0;
}

/** Manager tier: manages the whole team's tasks (not just their own). */
export function isSeoManagerTier(user: RoleContext): boolean {
  return ["super_admin", "seo_admin", "seo_manager"].some((r) => user.roles.includes(r));
}

/** The single permission check every server action / route / page uses. */
export function seoCan(user: RoleContext, permission: SeoPermission): boolean {
  return resolvePermission(user, SEO_PERMISSION_KEY[permission], () =>
    normalizeSeoRoles(user.roles).some((r) => SEO_ROLE_PERMISSIONS[r].includes(permission))
  );
}

export function primarySeoRoleLabel(roles: readonly string[]): string {
  for (const r of ["super_admin", "seo_admin", "seo_manager", "seo_specialist", "seo_employee"] as const) {
    if (roles.includes(r)) return SEO_ROLE_META[r].label;
  }
  return "No Access";
}
