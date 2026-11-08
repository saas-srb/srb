/**
 * Messenger (Team Communication Platform) role model. Like the HRMS, PMS, TMS
 * and PRMS products, Messenger access is gated on the shared `admin_users.roles`
 * array — there is no separate Messenger user store. An account can sign into
 * `/huddle-ai` only if it carries at least one of these roles (see
 * `verifyChatCredentials` in `messenger-auth.ts`).
 *
 * `super_admin` is the same literal used by every other product and implicitly
 * grants full Messenger access.
 *
 * Product access is only the outer gate. Every channel / DM / group still enforces
 * its own per-conversation membership — see `src/lib/huddle-ai/channels.ts` and
 * `src/lib/huddle-ai/conversations.ts`.
 *
 * The capability predicates below (everything except `hasMessengerAccess`, the
 * outer product-access tier gate) are Super-Admin-override-aware: each checks
 * `RoleContext.permissionOverrides` before falling back to its role-based
 * default. See `src/lib/permission-overrides.ts`.
 */

import { resolvePermission, type RoleContext } from "@/lib/permission-overrides";

export const CHAT_ROLES = ["super_admin", "chat_admin", "chat_pm", "chat_hr", "chat_employee"] as const;

export type ChatRole = (typeof CHAT_ROLES)[number];

/** Roles with elevated reach — can create org-wide team channels, moderate, see the dashboard analytics in full. */
export const CHAT_STAFF_ROLES: ChatRole[] = ["super_admin", "chat_admin", "chat_pm", "chat_hr"];

export const CHAT_ROLE_META: Record<ChatRole, { label: string; description: string }> = {
  super_admin: {
    label: "Director",
    description: "Full access: every channel, workspace analytics, member management, announcements and the audit log.",
  },
  chat_admin: {
    label: "Huddle Admin",
    description: "Manage channels and members, post announcements, moderate messages, view workspace analytics.",
  },
  chat_pm: {
    label: "Project Manager",
    description: "Own project channels, run team channels, coordinate delivery conversations.",
  },
  chat_hr: {
    label: "HR",
    description: "Run HR / department channels, post company announcements, reach every employee.",
  },
  chat_employee: {
    label: "Employee",
    description: "Direct messages, join public channels, participate in the channels and groups they are added to.",
  },
};

export function isChatRole(value: unknown): value is ChatRole {
  return typeof value === "string" && (CHAT_ROLES as readonly string[]).includes(value);
}

/** Normalises an arbitrary stored value into a clean, de-duplicated role list. */
export function normalizeChatRoles(value: unknown): ChatRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isChatRole)));
}

/** Can open the Messenger product at `/huddle-ai/*`. */
export function hasMessengerAccess(roles: readonly string[] | undefined | null): boolean {
  return normalizeChatRoles(roles).length > 0;
}

/** Elevated reach — org-wide channel creation, moderation, full analytics. */
export function hasChatStaffRole(user: RoleContext): boolean {
  return resolvePermission(user, "messenger.hasChatStaffRole", () =>
    user.roles.some((r) => (CHAT_STAFF_ROLES as readonly string[]).includes(r))
  );
}

export function isChatAdmin(user: RoleContext): boolean {
  return resolvePermission(user, "messenger.isChatAdmin", () => user.roles.includes("chat_admin"));
}

/** Create organization-wide team channels + group chats. */
export function canCreateTeamChannel(user: RoleContext): boolean {
  return resolvePermission(user, "messenger.canCreateTeamChannel", () => hasChatStaffRole(user));
}

/** Post broadcast announcements (deferred module, gate defined now). */
export function canPostAnnouncements(user: RoleContext): boolean {
  return resolvePermission(user, "messenger.canPostAnnouncements", () =>
    user.roles.includes("chat_admin") || user.roles.includes("chat_hr")
  );
}

/** See the full workspace dashboard analytics (vs. a personal summary). */
export function canViewWorkspaceAnalytics(user: RoleContext): boolean {
  return resolvePermission(user, "messenger.canViewWorkspaceAnalytics", () => hasChatStaffRole(user));
}

/** Read the audit log. */
export function canViewAuditLog(user: RoleContext): boolean {
  return resolvePermission(user, "messenger.canViewAuditLog", () => isChatAdmin(user));
}

export function primaryChatRoleLabel(roles: readonly ChatRole[]): string {
  if (roles.includes("super_admin")) return CHAT_ROLE_META.super_admin.label;
  if (roles.includes("chat_admin")) return CHAT_ROLE_META.chat_admin.label;
  if (roles.includes("chat_pm")) return CHAT_ROLE_META.chat_pm.label;
  if (roles.includes("chat_hr")) return CHAT_ROLE_META.chat_hr.label;
  if (roles.includes("chat_employee")) return CHAT_ROLE_META.chat_employee.label;
  return "No Access";
}
