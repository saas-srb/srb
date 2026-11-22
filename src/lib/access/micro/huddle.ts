import type { MicroFeature } from "./types";

const P = "huddle-ai";
type Row = [short: string, module: string, kind: MicroFeature["kind"], label: string, description: string, level: "read" | "write", legacy: string[], scope?: "all"];

/** What everybody given Huddle gets: the dashboard, their notifications and their own profile settings. */
const BASELINE = new Set(["dashboard.view", "notifications.view", "settings.view"]);
const TIER = ["messenger.hasMessengerAccess"];

/**
 * Huddle: every person given the product could use the conversations (direct, group, channels they may join, meetings, files), so those are the tier features;
 * the old capabilities are the specific ones. Each conversation still enforces its own membership (channel owner/admin are per-channel roles, not features here).
 */
const ROWS: Row[] = [
  ["dashboard.view", "Dashboard", "page", "Open the dashboard", "Open the Huddle dashboard: upcoming meetings and your own unread messages.", "read", TIER],
  ["analytics.workspace", "Dashboard", "section", "See workspace analytics", "See the workspace-wide numbers and charts on the dashboard (without it the dashboard shows only the person's own summary).", "read", ["messenger.canViewWorkspaceAnalytics"]],
  ["notifications.view", "Notifications", "page", "Open notifications", "Open the person's notifications and mark them read.", "read", TIER],
  ["search.view", "Search", "page", "Search messages and files", "Search the conversations, people and files the person may see.", "read", TIER],
  ["dm.view", "Direct messages", "page", "Open direct messages", "Open one-to-one conversations the person is part of.", "read", TIER],
  ["channels.view", "Channels", "page", "Open team channels", "Open public team channels and the private ones the person belongs to.", "read", TIER],
  ["projects.view", "Channels", "page", "Open project channels", "Open project channels the person belongs to.", "read", TIER],
  ["groups.view", "Group chats", "page", "Open group chats", "Open the group chats the person belongs to.", "read", TIER],
  ["announcements.view", "Announcements", "page", "Read announcements", "Read published announcements addressed to the person.", "read", TIER],
  ["files.view", "Files", "page", "Open shared files", "Open the files shared in the conversations the person can see.", "read", TIER],
  ["meetings.view", "Meetings", "page", "See meetings", "See meetings the person hosts or is invited to.", "read", TIER],
  ["settings.view", "Settings", "page", "Open personal settings", "Open the person's own Huddle profile and notification settings.", "read", TIER],
  ["messages.send", "Messages", "action", "Send messages", "Send messages, react, pin, star, forward, upload files, join and manage channels, start direct chats and confirm announcements in conversations the person may use.", "write", TIER],
  ["groups.create", "Group chats", "action", "Create group chats", "Start private group chats with chosen people.", "write", TIER],
  ["meetings.manage", "Meetings", "action", "Schedule meetings", "Schedule, edit, cancel and end meetings and invite people.", "write", TIER],
  ["calls.use", "Meetings", "action", "Join meetings and calls", "Start and join voice or video calls and meetings, and answer RSVPs.", "write", TIER],
  ["channels.create", "Channels", "button", "Create team channels", "Create organization-wide team channels.", "write", ["messenger.canCreateTeamChannel"]],
  ["announcements.post", "Announcements", "button", "Write and publish announcements", "Write, schedule, publish, archive and delete announcements.", "write", ["messenger.canPostAnnouncements"]],
  ["audit.view", "Activity log", "page", "Read the activity log", "Read the Huddle audit trail (who changed what).", "read", ["messenger.canViewAuditLog"]],
  ["moderation.all", "Moderation", "scope", "Moderate every channel", "Open every channel including private ones, moderate any message, change member roles and archive channels, whether or not the person is a member (without it moderation is limited to channels they own or administer).", "write", ["messenger.isChatAdmin"], "all"],
];

export const HUDDLE_MICRO: MicroFeature[] = ROWS.map(([short, module, kind, label, description, level, legacy, scope]) => ({
  key: `${P}.${short}`, product: P, module, kind, label, description, level, legacy, ...(scope ? { scope } : {}), ...(BASELINE.has(short) ? { baseline: true } : {}),
}));
