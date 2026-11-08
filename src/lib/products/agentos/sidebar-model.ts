import { GENERAL_BOT_ID, GENERAL_BOT_NAME } from "@/lib/products/agentos/constants";

/** Pure sidebar structure + active-state rules (client-safe, unit-tested). The component only renders what this returns. */

export interface NavFlags {
  createBot: boolean;
  manageBots: boolean;
  allChats: boolean;
  audit: boolean;
  settings: boolean;
}

export type NavIconKey = "dashboard" | "hub" | "create" | "chat" | "manage" | "chats" | "calls" | "settings" | "notifications";

export interface NavItem {
  key: string;
  href: string;
  label: string;
  icon: NavIconKey;
  /** How the item decides it is the current page. */
  match: "exact" | "prefix" | "manage-bots";
  highlight?: boolean;
}

export interface NavGroup {
  id: "top" | "agents" | "manage";
  label: string | null;
  items: NavItem[];
}

/** Dashboard first, then Agents, (recent agents are rendered between), then Manage. Permission flags hide items, never reorder them. */
export function buildNavGroups(flags: NavFlags): { top: NavGroup; agents: NavGroup; recentLead: NavItem; manage: NavGroup } {
  const top: NavGroup = { id: "top", label: null, items: [{ key: "dashboard", href: "/agentos", label: "Dashboard", icon: "dashboard", match: "exact" }] };
  const agents: NavGroup = {
    id: "agents",
    label: "Agents",
    items: [
      { key: "hub", href: "/agentos/hub", label: "Agent Hub", icon: "hub", match: "prefix" },
      ...(flags.createBot ? [{ key: "create", href: "/agentos/bots/new", label: "Create Agent", icon: "create" as const, match: "prefix" as const }] : []),
    ],
  };
  const manage: NavGroup = {
    id: "manage",
    label: "Manage",
    items: [
      ...(flags.manageBots ? [{ key: "bots", href: "/agentos/bots", label: "Manage Agents", icon: "manage" as const, match: "manage-bots" as const }] : []),
      ...(flags.allChats ? [{ key: "chats", href: "/agentos/chats", label: "Chat History", icon: "chats" as const, match: "prefix" as const }] : []),
      // Everyone sees their own calls; people with All Chats oversight see everyone's (the page decides).
      { key: "calls", href: "/agentos/calls", label: "Call History", icon: "calls", match: "prefix" },
      // { key: "notifications", href: "/agentos/notifications", label: "Notifications", icon: "notifications", match: "prefix" },
    ],
  };
  // The general assistant opens the "Your recent agents" section: it is always there, whoever the viewer has used.
  const recentLead: NavItem = { key: "general", href: `/agentos/b/${GENERAL_BOT_ID}`, label: GENERAL_BOT_NAME, icon: "chat", match: "prefix", highlight: true };
  return { top, agents, recentLead, manage };
}

/** Whether `pathname` is inside `href` (the page itself or anything nested under it). */
const within = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function isNavActive(pathname: string | null, item: Pick<NavItem, "href" | "match">): boolean {
  if (!pathname) return false;
  if (item.match === "exact") return pathname === item.href;
  // /agentos/bots/new belongs to "Create Agent"; every other /agentos/bots/* page (edit, knowledge) belongs to "Manage Agents".
  if (item.match === "manage-bots") return within(pathname, item.href) && !within(pathname, "/agentos/bots/new");
  return within(pathname, item.href);
}

/** Agents used this session (newest first) in front of the server list, without duplicates. */
export function mergeRecentAgents<T extends { _id: string }>(fresh: T[], server: T[], limit = 8): T[] {
  return [...fresh, ...server.filter((b) => !fresh.some((f) => f._id === b._id))].slice(0, limit);
}
