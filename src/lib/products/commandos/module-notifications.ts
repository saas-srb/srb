import { panelNameMap } from "@/lib/platform/panels/store";
import "server-only";
import { normalizeRoles } from "@/lib/hrms-roles";
import {
  listNotifications as hrmsList,
  unreadCount as hrmsUnread,
  markRead as hrmsMarkRead,
  markAllRead as hrmsMarkAllRead,
  runNotificationSweep as runHrmsSweep,
} from "@/lib/products/talentos/notifications";
import {
  listNotifications as pmsList,
  unreadCount as pmsUnread,
  markRead as pmsMarkRead,
  markAllRead as pmsMarkAllRead,
  runDeadlineSweep as runPmsSweep,
} from "@/lib/products/sprintos/notifications";
import {
  listNotifications as prmsList,
  unreadCount as prmsUnread,
  markRead as prmsMarkRead,
  markAllRead as prmsMarkAllRead,
  runPrmsSweep,
} from "@/lib/products/spendiq/notifications";
import {
  listNotifications as tmsList,
  unreadCount as tmsUnread,
  markRead as tmsMarkRead,
  markAllRead as tmsMarkAllRead,
  runTmsSweep,
} from "@/lib/products/cohort-ai/notifications";
import {
  listNotifications as messengerList,
  unreadCount as messengerUnread,
  markRead as messengerMarkRead,
  markAllRead as messengerMarkAllRead,
} from "@/lib/products/huddle-ai/notifications";

/**
 * Director Command Center — Executive Notifications (Phase 2). Every
 * module already writes real notifications addressed to `admin_users` ids,
 * several already broadcasting to every `super_admin` account (PRMS invoice/
 * budget/stock/renewal alerts, TMS stale-application/fee alerts). This layer
 * fans the admin's own account out across all five stores and merges them
 * into one feed — it never invents notification types that don't already
 * exist, and mark-as-read writes back to the module that owns the row.
 *
 * PMS and Messenger notifications are purely per-recipient (no staff
 * broadcast), so they'll only show up here if the super_admin is personally
 * a project member/manager or was directly messaged — that's correct, not a
 * bug: a real empty feed beats a fabricated one.
 *
 * External Portal notifications are addressed to `external_users`, a
 * completely separate identity space from `admin_users` — not applicable here.
 */

export const NOTIFICATION_MODULES = ["hrms", "pms", "prms", "tms", "messenger"] as const;
export type NotificationModule = (typeof NOTIFICATION_MODULES)[number];

export const MODULE_LABELS: Record<NotificationModule, string> = {
  hrms: "TalentOS",
  pms: "SprintOS",
  prms: "SpendIQ",
  tms: "Cohort AI",
  messenger: "Huddle",
};

export type NotificationPriority = "high" | "medium" | "low";

/**
 * Priority by the real `type` values each module's sweep/event code already
 * emits (see the imports above) — not a fabricated taxonomy. Anything not
 * listed here defaults to "medium" so a new type is never silently buried.
 */
const PRIORITY_BY_TYPE: Record<string, NotificationPriority> = {
  // HRMS
  leave_requested: "high",
  probation_ending: "high",
  document_expiring: "high",
  leave_decided: "medium",
  employee_added: "medium",
  payslip_published: "medium",
  document_uploaded: "medium",
  offer_status: "medium",
  birthday_today: "low",
  // PMS
  deadline_approaching: "high",
  task_assigned: "medium",
  project_status_changed: "medium",
  milestone_completed: "medium",
  timesheet_submitted: "medium",
  task_completed: "low",
  comment_added: "low",
  timesheet_reviewed: "low",
  // PRMS
  invoices_overdue: "high",
  budget_overspent: "high",
  low_stock: "high",
  resource_renewal: "medium",
  recurring_expenses_generated: "medium",
  // TMS
  fees_pending: "medium",
  class_reminder: "low",
  // Messenger
  mention: "medium",
  channel_invite: "medium",
  announcement: "medium",
  project_update: "medium",
  task_linked: "medium",
  message: "low",
  file_shared: "low",
};

export function priorityFor(type: string): NotificationPriority {
  return PRIORITY_BY_TYPE[type] ?? "medium";
}

/** Whose feed: the account id and its roles (HRMS addresses some notifications to a role). */
export interface FeedUser {
  id: string;
  roles: readonly string[];
}

export interface UnifiedNotification {
  id: string;
  module: NotificationModule;
  moduleLabel: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  priority: NotificationPriority;
  createdAt: string;
}

export interface AdminNotificationFeed {
  items: UnifiedNotification[];
  unreadTotal: number;
  unreadByModule: Record<NotificationModule, number>;
}

/** Runs every module's own throttled (once/hour) sweep so the feed is fresh
 * even for a super_admin who never opens the individual products. Each sweep is
 * already internally best-effort/non-throwing; the try/catch here is a second
 * layer so one module's failure can never blank the Command Center. */
export async function runAdminNotificationSweeps(): Promise<void> {
  await Promise.all([
    runHrmsSweep().catch(() => {}),
    runPmsSweep().catch(() => {}),
    runPrmsSweep().catch(() => {}),
    runTmsSweep().catch(() => {}),
  ]);
}

export async function getAdminNotifications(user: FeedUser, limit = 50): Promise<AdminNotificationFeed> {
  const [hrms, hrmsUnreadCount, pms, pmsUnreadCount, prms, prmsUnreadCount, tms, tmsUnreadCount, chat, chatUnreadCount] =
    await Promise.all([
      hrmsList({ id: user.id, roles: normalizeRoles(user.roles) }, { pageSize: limit }),
      hrmsUnread({ id: user.id, roles: normalizeRoles(user.roles) }),
      pmsList(user.id, limit),
      pmsUnread(user.id),
      prmsList(user.id, limit),
      prmsUnread(user.id),
      tmsList(user.id, limit),
      tmsUnread(user.id),
      messengerList(user.id, limit),
      messengerUnread(user.id),
    ]);

  const panelName = await panelNameMap();
  const items: UnifiedNotification[] = [
    ...hrms.items.map((n) => ({
      id: n._id,
      module: "hrms" as const,
      moduleLabel: panelName("hrms", MODULE_LABELS.hrms),
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.read,
      priority: priorityFor(n.type),
      createdAt: n.createdAt,
    })),
    ...pms.map((n) => ({
      id: n._id,
      module: "pms" as const,
      moduleLabel: panelName("pms", MODULE_LABELS.pms),
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.read,
      priority: priorityFor(n.type),
      createdAt: n.createdAt.toISOString(),
    })),
    ...prms.map((n) => ({
      id: n._id,
      module: "prms" as const,
      moduleLabel: panelName("prms", MODULE_LABELS.prms),
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.read,
      priority: priorityFor(n.type),
      createdAt: n.createdAt.toISOString(),
    })),
    ...tms.map((n) => ({
      id: n._id,
      module: "tms" as const,
      moduleLabel: panelName("tms", MODULE_LABELS.tms),
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.read,
      priority: priorityFor(n.type),
      createdAt: n.createdAt.toISOString(),
    })),
    ...chat.map((n) => ({
      id: n._id,
      module: "messenger" as const,
      moduleLabel: panelName("messenger", MODULE_LABELS.messenger),
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.read,
      priority: priorityFor(n.type),
      createdAt: n.createdAt.toISOString(),
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    items: items.slice(0, limit),
    unreadTotal: hrmsUnreadCount + pmsUnreadCount + prmsUnreadCount + tmsUnreadCount + chatUnreadCount,
    unreadByModule: {
      hrms: hrmsUnreadCount,
      pms: pmsUnreadCount,
      prms: prmsUnreadCount,
      tms: tmsUnreadCount,
      messenger: chatUnreadCount,
    },
  };
}

export async function markAdminNotificationRead(module: NotificationModule, id: string, userId: string): Promise<void> {
  switch (module) {
    case "hrms":
      return hrmsMarkRead([id], userId);
    case "pms":
      return pmsMarkRead([id], userId);
    case "prms":
      return prmsMarkRead([id], userId);
    case "tms":
      return tmsMarkRead([id], userId);
    case "messenger":
      return messengerMarkRead([id], userId);
  }
}

export async function markAllAdminNotificationsRead(user: FeedUser): Promise<void> {
  await Promise.all([
    hrmsMarkAllRead({ id: user.id, roles: normalizeRoles(user.roles) }),
    pmsMarkAllRead(user.id),
    prmsMarkAllRead(user.id),
    tmsMarkAllRead(user.id),
    messengerMarkAllRead(user.id),
  ]);
}
