/** Every place a notification can belong to. Pure data — safe for client components. */
export const NOTIFY_PANELS = ["pms", "hrms", "fms", "lms", "tms", "prms", "smms", "sop", "dlms", "seo", "ots", "lpms", "aibots", "messenger", "intelligence", "cms", "support", "workspace", "platform", "portal"] as const;
export type NotifyPanel = (typeof NOTIFY_PANELS)[number];

export const isNotifyPanel = (v: unknown): v is NotifyPanel => typeof v === "string" && (NOTIFY_PANELS as readonly string[]).includes(v);

/** `/talentos/notifications` → "hrms"; `/commandos/notifications` → "workspace"; anything else → null. */
export function panelFromHref(href: string): NotifyPanel | null {
  const seg = href.split("?")[0].split("/")[1] ?? "";
  return isNotifyPanel(seg) ? seg : null;
}

/** Chat-store notification types carry their product as a prefix (`sop_overdue`); everything else there is Messenger's own. */
export const CHAT_STORE_PREFIXES = ["sop", "dlms", "aibots", "smms", "ots", "seo"] as const;
export function panelOfChatType(type: string): NotifyPanel {
  const p = type.split("_")[0];
  return (CHAT_STORE_PREFIXES as readonly string[]).includes(p) ? (p as NotifyPanel) : "messenger";
}
/** Mongo filter for the Messenger's own rows in the shared chat store (so other products' rows never reach the Messenger bell). */
export const MESSENGER_ONLY_TYPE = { $not: new RegExp(`^(${CHAT_STORE_PREFIXES.join("|")})_`) };

export type NotifyPriority = "high" | "normal" | "low";

/** What a push category means for a notification type (kept in one place; the push module has the full table). */
export interface SignalItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  priority: NotifyPriority;
  createdAt: string;
}
