import { can as accessCan, type AccessSubject } from "@/lib/access/can";
import { microByKey } from "@/lib/access/micro";

/**
 * Huddle access from the person's micro features. Pure (no server-only imports) so pages, actions, routes, library functions and the menu all use one rule.
 * The old capability names keep their meaning but answer from the person's access. Channel owner/admin stay per-channel memberships (checked next to this).
 * Anything that passes a "holder" to a library function passes the person's `subject` with it.
 */
export type ChatHolder = { subject: AccessSubject };

const PRODUCT = "huddle-ai";

/** The one check. `key` is `<module>.<feature>` without the product, e.g. "channels.create". An unknown key is never allowed. */
export function chatCan(holder: ChatHolder, key: string): boolean {
  const full = `${PRODUCT}.${key}`;
  const m = microByKey(full);
  return Boolean(m) && accessCan(holder.subject, PRODUCT, full, m!.level);
}

export const canCreateTeamChannel = (h: ChatHolder) => chatCan(h, "channels.create");
export const canPostAnnouncements = (h: ChatHolder) => chatCan(h, "announcements.post");
export const canViewWorkspaceAnalytics = (h: ChatHolder) => chatCan(h, "analytics.workspace");
export const canViewAuditLog = (h: ChatHolder) => chatCan(h, "audit.view");
/** Moderate every channel (the old "chat admin"): the scope feature `moderation.all`. */
export const canModerateAll = (h: ChatHolder) => chatCan(h, "moderation.all");
