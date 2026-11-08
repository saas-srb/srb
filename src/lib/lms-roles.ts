/**
 * LMS (Lead & Learning Management System) role model.
 * Access is gated on the shared `admin_users.roles` array.
 */

import { resolvePermission, type RoleContext } from "@/lib/permission-overrides";

export const LMS_ROLES = ["super_admin", "lms_admin", "lms_manager", "lms_agent"] as const;

export type LmsRole = (typeof LMS_ROLES)[number];

export const LMS_ROLE_META: Record<LmsRole, { label: string; description: string }> = {
  super_admin: {
    label: "Director",
    description: "Full access to leads, campaigns, courses, and CRM analytics.",
  },
  lms_admin: {
    label: "DealFlow Admin",
    description: "Full control over leads, marketing campaigns, courses, and sales analytics.",
  },
  lms_manager: {
    label: "DealFlow Manager",
    description: "Manage lead assignments, sales stages, student enrollments, and reports.",
  },
  lms_agent: {
    label: "DealFlow Executive / Counselor",
    description: "Manage assigned leads, track call activities, and update status.",
  },
};

export function isLmsRole(value: unknown): value is LmsRole {
  return typeof value === "string" && (LMS_ROLES as readonly string[]).includes(value);
}

export function normalizeLmsRoles(value: unknown): LmsRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isLmsRole)));
}

export function hasLmsAccess(roles: readonly string[] | undefined | null): boolean {
  return normalizeLmsRoles(roles).length > 0;
}

export const LMS_PERMISSIONS = [
  "VIEW_LEADS",
  "CREATE_LEADS",
  "EDIT_LEADS",
  "MESSAGE_LEADS",
  "DELETE_LEADS",
  "EXPORT_DATA",
  "IMPERSONATE",
  "VIEW_CAREERS",
  "MANAGE_CAREERS",
  "MANAGE_CAMPAIGNS",
  "VIEW_ANALYTICS",
  "VIEW_CHATBOT",
  "MANAGE_CHATBOT",
  "MANAGE_OFFERS",
  "MANAGE_WALLET",
] as const;
export type LmsPermission = (typeof LMS_PERMISSIONS)[number];

/** Key under which the Director stores an override — matches `permission-catalog.ts`. */
export const LMS_PERMISSION_KEY: Record<LmsPermission, string> = {
  VIEW_LEADS: "lms.canViewLeads",
  CREATE_LEADS: "lms.canCreateLeads",
  EDIT_LEADS: "lms.canEditLeads",
  MESSAGE_LEADS: "lms.canMessageLeads",
  DELETE_LEADS: "lms.canDeleteLeads",
  EXPORT_DATA: "lms.canExportData",
  IMPERSONATE: "lms.canLoginAsPortalUser",
  VIEW_CAREERS: "lms.canViewCareers",
  MANAGE_CAREERS: "lms.canManageCareers",
  MANAGE_CAMPAIGNS: "lms.canManageCampaigns",
  VIEW_ANALYTICS: "lms.canViewAnalytics",
  VIEW_CHATBOT: "lms.canViewChatbot",
  MANAGE_CHATBOT: "lms.canManageChatbot",
  MANAGE_OFFERS: "lms.canManageOffers",
  MANAGE_WALLET: "lms.canManageWallet",
};

export const LMS_PERMISSION_META: Record<LmsPermission, { label: string; description: string }> = {
  VIEW_LEADS: { label: "View leads & enquiries", description: "Open the CRM and read leads, enquiries and their timelines." },
  CREATE_LEADS: { label: "Create leads", description: "Add a lead or enquiry by hand." },
  EDIT_LEADS: { label: "Edit leads & move the pipeline", description: "Change a lead's status, stage, notes and deal value." },
  MESSAGE_LEADS: { label: "Message leads", description: "Send messages and attachments to leads in the lead inbox." },
  DELETE_LEADS: { label: "Delete leads", description: "Permanently delete leads and enquiries." },
  EXPORT_DATA: { label: "Export data", description: "Download CSV / Excel exports of leads, campaigns, applicants, chatbot conversations and wallets." },
  IMPERSONATE: { label: "Log in as a portal user", description: "Open a lead's external-portal account to see what they see. Logged." },
  VIEW_CAREERS: { label: "View job applications", description: "Read job applications and applicant records." },
  MANAGE_CAREERS: { label: "Manage job applications", description: "Change application status, schedule interviews, edit notes, delete applicants and manage open positions." },
  MANAGE_CAMPAIGNS: { label: "Manage marketing campaigns", description: "Create, edit and import campaigns and attribute leads to them." },
  VIEW_ANALYTICS: { label: "View sales & lead analytics", description: "Conversion rates, pipeline numbers and campaign performance." },
  VIEW_CHATBOT: { label: "View chatbot conversations", description: "Read website chatbot and voice conversations (they contain visitor details)." },
  MANAGE_CHATBOT: { label: "Manage the chatbot", description: "Edit the chatbot's knowledge base, voice, settings and re-index it." },
  MANAGE_OFFERS: { label: "Manage offers & coupons", description: "Create and edit offers, coupons and subscriber lists." },
  MANAGE_WALLET: { label: "Manage wallets & rewards", description: "Adjust, freeze, reverse and refund wallet balances; manage reward and referral rules." },
};

const AGENT: LmsPermission[] = ["VIEW_LEADS", "CREATE_LEADS", "EDIT_LEADS", "MESSAGE_LEADS"];
const MANAGER: LmsPermission[] = [...AGENT, "EXPORT_DATA", "VIEW_CAREERS", "MANAGE_CAREERS", "MANAGE_CAMPAIGNS", "VIEW_ANALYTICS", "VIEW_CHATBOT"];
const ADMIN: LmsPermission[] = [...LMS_PERMISSIONS];

export const LMS_ROLE_PERMISSIONS: Record<LmsRole, readonly LmsPermission[]> = {
  super_admin: ADMIN,
  lms_admin: ADMIN,
  lms_manager: MANAGER,
  lms_agent: AGENT,
};

/** The single permission check every LMS (CRM) server action / route / page uses. */
export function lmsCan(user: RoleContext, permission: LmsPermission): boolean {
  return resolvePermission(user, LMS_PERMISSION_KEY[permission], () =>
    normalizeLmsRoles(user.roles).some((r) => LMS_ROLE_PERMISSIONS[r].includes(permission))
  );
}

export function isLmsAdmin(user: RoleContext): boolean {
  return user.roles.includes("super_admin") || user.roles.includes("lms_admin") || resolvePermission(user, "lms.isLmsAdmin", () => false);
}

export function canManageLeads(user: RoleContext): boolean {
  return lmsCan(user, "EDIT_LEADS");
}

export function canManageCampaigns(user: RoleContext): boolean {
  return lmsCan(user, "MANAGE_CAMPAIGNS");
}

export function canViewLmsAnalytics(user: RoleContext): boolean {
  return lmsCan(user, "VIEW_ANALYTICS");
}

export function primaryLmsRoleLabel(roles: readonly string[]): string {
  for (const r of ["super_admin", "lms_admin", "lms_manager", "lms_agent"] as const) {
    if (roles.includes(r)) return LMS_ROLE_META[r].label;
  }
  return "No Access";
}
