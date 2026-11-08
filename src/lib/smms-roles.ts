/**
 * Social Media Marketing System (SMMS) role + permission model. Like every
 * other product, access is gated on the shared `admin_users.roles` array — there
 * is no separate user store. SMMS access needs an explicit `smms_*` role (or
 * super_admin); it is never implied by another product's role.
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

export const SMMS_ROLES = ["super_admin", "smms_admin", "smms_manager", "smms_specialist", "smms_employee"] as const;
export type SmmsRole = (typeof SMMS_ROLES)[number];

export const SMMS_ROLE_META: Record<SmmsRole, { label: string; description: string }> = {
  super_admin: {
    label: "Director",
    description: "Every Social Media operation, including platform integrations, brand context and the activity log.",
  },
  smms_admin: {
    label: "ViralPulse Admin",
    description: "Everything a manager can do, plus connecting platform accounts and editing the brand context and AI settings.",
  },
  smms_manager: {
    label: "ViralPulse Manager",
    description: "Runs the team: deletes campaigns, publishes and approves scheduled content, reads analytics and the activity log.",
  },
  smms_specialist: {
    label: "ViralPulse Specialist",
    description: "Creates and edits campaigns and ads, schedules posts and reads analytics. Cannot publish.",
  },
  smms_employee: {
    label: "ViralPulse Employee",
    description: "Drafts social posts with AI, manages the media library and views campaigns.",
  },
};

export const SMMS_PERMISSIONS = [
  "VIEW_CAMPAIGNS",
  "CREATE_CAMPAIGNS",
  "EDIT_CAMPAIGNS",
  "DELETE_CAMPAIGNS",
  "CREATE_ADS",
  "MANAGE_POSTS",
  "GENERATE_AI_CONTENT",
  "MANAGE_MEDIA",
  "SCHEDULE_POSTS",
  "PUBLISH_CONTENT",
  "VIEW_ANALYTICS",
  "MANAGE_INTEGRATIONS",
  "VIEW_AUDIT_LOG",
  "APPROVE_AD_SPEND",
  "MANAGE_AD_LIMITS",
] as const;
export type SmmsPermission = (typeof SMMS_PERMISSIONS)[number];

/** Key under which the Director stores an override — matches `permission-catalog.ts`. */
export const SMMS_PERMISSION_KEY: Record<SmmsPermission, string> = {
  VIEW_CAMPAIGNS: "smms.canViewCampaigns",
  CREATE_CAMPAIGNS: "smms.canCreateCampaigns",
  EDIT_CAMPAIGNS: "smms.canEditCampaigns",
  DELETE_CAMPAIGNS: "smms.canDeleteCampaigns",
  CREATE_ADS: "smms.canCreateAds",
  MANAGE_POSTS: "smms.canManagePosts",
  GENERATE_AI_CONTENT: "smms.canGenerateAiContent",
  MANAGE_MEDIA: "smms.canManageMedia",
  SCHEDULE_POSTS: "smms.canSchedulePosts",
  PUBLISH_CONTENT: "smms.canPublishContent",
  VIEW_ANALYTICS: "smms.canViewAnalytics",
  MANAGE_INTEGRATIONS: "smms.canManageIntegrations",
  VIEW_AUDIT_LOG: "smms.canViewAuditLog",
  APPROVE_AD_SPEND: "smms.canApproveAdSpend",
  MANAGE_AD_LIMITS: "smms.canManageAdLimits",
};

export const SMMS_PERMISSION_META: Record<SmmsPermission, { label: string; description: string }> = {
  VIEW_CAMPAIGNS: { label: "View campaigns", description: "Open campaigns, their ads and their performance." },
  CREATE_CAMPAIGNS: { label: "Create campaigns", description: "Create new campaigns and duplicate existing ones." },
  EDIT_CAMPAIGNS: { label: "Edit campaigns", description: "Edit a campaign's brief and AI strategy, change its status and archive it." },
  DELETE_CAMPAIGNS: { label: "Delete campaigns", description: "Delete campaigns and ads." },
  CREATE_ADS: { label: "Create ads", description: "Create, edit and duplicate image and video ads inside a campaign." },
  MANAGE_POSTS: { label: "Manage posts", description: "Create, edit, duplicate and archive social media posts." },
  GENERATE_AI_CONTENT: { label: "Generate AI content", description: "Run OpenAI generation: campaign strategy, ad copy, posts, scripts, images." },
  MANAGE_MEDIA: { label: "Manage media", description: "Upload, replace, edit and delete images and videos in the media library." },
  SCHEDULE_POSTS: { label: "Schedule content", description: "Put posts and ads on the calendar. Scheduled items publish only once someone with Publish approves them." },
  PUBLISH_CONTENT: { label: "Publish content", description: "Publish to connected platforms, mark content as published, and approve scheduled items for automatic publishing." },
  VIEW_ANALYTICS: { label: "View analytics", description: "Read the analytics page and enter post performance numbers." },
  MANAGE_INTEGRATIONS: { label: "Manage integrations & settings", description: "Connect or disconnect platform accounts, and edit brand context and AI settings." },
  VIEW_AUDIT_LOG: { label: "View activity log", description: "Read the Social Media activity log." },
  APPROVE_AD_SPEND: { label: "Approve ad spend", description: "Approve the budget of a paid ad launch before it can start spending, and use the kill switch." },
  MANAGE_AD_LIMITS: { label: "Manage ad spending limits", description: "Change the company spending limits, the approval rules and allow uncapped launches, and turn the kill switch off again. Kept apart from approving spend so one person cannot lift a limit and approve a launch that needed it." },
};

const EMPLOYEE: SmmsPermission[] = ["VIEW_CAMPAIGNS", "MANAGE_POSTS", "GENERATE_AI_CONTENT", "MANAGE_MEDIA"];
const SPECIALIST: SmmsPermission[] = [...EMPLOYEE, "CREATE_CAMPAIGNS", "EDIT_CAMPAIGNS", "CREATE_ADS", "SCHEDULE_POSTS", "VIEW_ANALYTICS"];
const MANAGER: SmmsPermission[] = [...SPECIALIST, "DELETE_CAMPAIGNS", "PUBLISH_CONTENT", "VIEW_AUDIT_LOG", "APPROVE_AD_SPEND"];
const ADMIN: SmmsPermission[] = [...SMMS_PERMISSIONS];

export const SMMS_ROLE_PERMISSIONS: Record<SmmsRole, readonly SmmsPermission[]> = {
  super_admin: ADMIN,
  smms_admin: ADMIN,
  smms_manager: MANAGER,
  smms_specialist: SPECIALIST,
  smms_employee: EMPLOYEE,
};

export function isSmmsRole(value: unknown): value is SmmsRole {
  return typeof value === "string" && (SMMS_ROLES as readonly string[]).includes(value);
}

export function normalizeSmmsRoles(value: unknown): SmmsRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isSmmsRole)));
}

/** Can open the Social Media product at `/viralpulse-ai/*`. */
export function hasSmmsAccess(roles: readonly string[] | undefined | null): boolean {
  return normalizeSmmsRoles(roles).length > 0;
}

/** The single permission check every server action / route / page uses. */
export function smmsCan(user: RoleContext, permission: SmmsPermission): boolean {
  return resolvePermission(user, SMMS_PERMISSION_KEY[permission], () =>
    normalizeSmmsRoles(user.roles).some((r) => SMMS_ROLE_PERMISSIONS[r].includes(permission))
  );
}

export function primarySmmsRoleLabel(roles: readonly string[]): string {
  if (roles.includes("super_admin")) return SMMS_ROLE_META.super_admin.label;
  const eff = normalizeSmmsRoles(roles);
  for (const r of ["smms_admin", "smms_manager", "smms_specialist", "smms_employee"] as const) {
    if (eff.includes(r)) return SMMS_ROLE_META[r].label;
  }
  return "No Access";
}
