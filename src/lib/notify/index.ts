import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { queuePush } from "@/lib/push/send";
import { logBell, planNotification } from "@/lib/notify/center/store";
import { categorizeType, type PushCategory } from "@/lib/push/categories";
import { audienceUserIds, canOpen, userIdsByRoles, type Audience } from "@/lib/notify/audience";
import { signalUsers } from "@/lib/notify/signals";
import type { NotifyPanel, NotifyPriority, SignalItem } from "@/lib/notify/panels";

/**
 * The notification system for every product that has no store of its own (Finance, Leads, Legal, Website, Intelligence, Support,
 * Platform …) and for any new trigger. One row per recipient, each tagged with its product, so:
 *   - a person only ever gets notifications addressed to them, and only inside the product the event belongs to;
 *   - product-wide events go only to people whose role can open that product (see `audience.ts`);
 *   - each one also raises a realtime signal (the bell and toast update at once) and a Web Push (per the person's own preferences).
 * The products that already had their own store (HRMS, Projects, Procurement, Training, Team Chat and the chat-store products, Portal) keep
 * it; they raise the same realtime signal through `signalUsers`.
 */
export const PANEL_NOTIFICATIONS = "panel_notifications";
const TTL_DAYS = 120;

export interface PanelNotification {
  _id: string;
  userId: string;
  panel: NotifyPanel;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  priority: NotifyPriority;
  dedupeKey: string | null;
  read: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export interface NotifyInput {
  type: string;
  title: string;
  body?: string | null;
  /** Same-site path the notification opens. */
  link?: string | null;
  priority?: NotifyPriority;
  /** Same key + same person = only one notification (re-raising it is a no-op). Use for things that can fire repeatedly. */
  dedupeKey?: string | null;
  /** Push category override; by default it is derived from `type`. */
  category?: PushCategory;
  /** Narrows the channels for this one send; never widens what the company allows. */
  channels?: Partial<Record<"inApp" | "push" | "email", boolean>>;
}

let indexed = false;
async function col() {
  const c = (await getDb()).collection<PanelNotification>(PANEL_NOTIFICATIONS);
  if (!indexed) {
    indexed = true;
    await Promise.all([
      c.createIndex({ userId: 1, panel: 1, createdAt: -1 }).catch(() => {}),
      c.createIndex({ userId: 1, panel: 1, read: 1 }).catch(() => {}),
      c.createIndex({ userId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }).catch(() => {}),
      c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {}),
    ]);
  }
  return c;
}

const safeLink = (l: string | null | undefined) => (l && l.startsWith("/") && !l.startsWith("//") && l.length <= 500 ? l : null);
const clip = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * Notify specific people (admin_users ids) inside `product`. People who can no longer open the product are dropped. Never throws:
 * a notification must not fail the action that raised it. Returns how many people were notified.
 */
export async function notifyUsers(panel: NotifyPanel, userIds: string[], n: NotifyInput): Promise<number> {
  try {
    const allowed = await canOpen(panel, [...new Set(userIds.filter(Boolean))]);
    if (allowed.length === 0) return 0;
    const c = await col();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TTL_DAYS * 86_400_000);
    const delivered: string[] = [];
    let last: PanelNotification | null = null;
    // The company's Notification center: which channels carry this event, and any wording it changed.
    const plan = await planNotification({ type: n.type, title: clip(n.title, 160), body: clip(n.body, 400) || null, link: safeLink(n.link), product: panel, only: n.channels });
    for (const userId of allowed) {
      if (!plan.inApp.on) {
        delivered.push(userId); // no bell row, but push and email still follow their own rules
        continue;
      }
      const doc: PanelNotification = { _id: randomUUID(), userId, panel, type: n.type, title: clip(plan.inApp.title, 160), body: clip(plan.inApp.body, 400) || null, link: safeLink(n.link), priority: n.priority ?? "normal", dedupeKey: n.dedupeKey ?? null, read: false, createdAt: now, expiresAt };
      if (doc.dedupeKey) {
        const res = await c.updateOne({ userId, dedupeKey: doc.dedupeKey }, { $setOnInsert: doc }, { upsert: true });
        if (!res.upsertedCount) continue;
      } else {
        await c.insertOne(doc);
      }
      delivered.push(userId);
      last = doc;
    }
    if (delivered.length) {
      if (last) {
        const item: SignalItem = { id: last._id, type: last.type, title: last.title, body: last.body, link: last.link, priority: last.priority, createdAt: now.toISOString() };
        await signalUsers(panel, delivered, item);
      }
      await queuePush("staff", delivered, { category: n.category ?? categorizeType(n.type), title: clip(n.title, 160), body: clip(n.body, 400) || null, url: safeLink(n.link) ?? `/${panel}/notifications`, tag: n.dedupeKey ?? undefined, event: n.type, product: panel, channels: n.channels });
      await logBell(plan.inApp.on, { type: n.type, title: clip(n.title, 160), product: panel, recipients: delivered.length, reason: plan.inApp.reason });
    }
    return delivered.length;
  } catch (err) {
    console.error("[notify] could not notify", err instanceof Error ? err.message : err);
    return 0;
  }
}

/** Notify everyone whose role opens `product` at `level` (default: people who run it), except `exceptUserId` (usually the person who did it). */
export async function notifyPanel(panel: NotifyPanel, n: NotifyInput, opts: { level?: Audience; extraRoles?: string[]; exceptUserId?: string | null } = {}): Promise<number> {
  try {
    const ids = (await audienceUserIds(panel, opts.level ?? "staff", opts.extraRoles)).filter((i) => i !== opts.exceptUserId);
    return await notifyUsers(panel, ids, n);
  } catch (err) {
    console.error("[notify] could not notify product", err instanceof Error ? err.message : err);
    return 0;
  }
}

/** Notify everyone holding one of `roles` (and super admins) — for events owned by a named function, e.g. accounts receivable. */
export async function notifyRoles(panel: NotifyPanel, roles: string[], n: NotifyInput, exceptUserId?: string | null): Promise<number> {
  try {
    const ids = (await userIdsByRoles(roles)).filter((i) => i !== exceptUserId);
    return await notifyUsers(panel, ids, n);
  } catch (err) {
    console.error("[notify] could not notify roles", err instanceof Error ? err.message : err);
    return 0;
  }
}

// ── Reading (the person's own rows only) ─────────────────────────────────────────────────────────────────────────────────────────────

export interface PanelNotificationView { id: string; type: string; title: string; body: string; link: string | null; priority: NotifyPriority; read: boolean; createdAt: string }
const view = (n: PanelNotification): PanelNotificationView => ({ id: n._id, type: n.type, title: n.title, body: n.body ?? "", link: n.link, priority: n.priority, read: n.read, createdAt: n.createdAt.toISOString() });

export async function listPanelNotifications(userId: string, panel: NotifyPanel, limit = 100): Promise<PanelNotificationView[]> {
  return (await (await col()).find({ userId, panel }).sort({ createdAt: -1 }).limit(Math.min(limit, 200)).toArray()).map(view);
}
export async function panelUnread(userId: string, panel: NotifyPanel): Promise<number> {
  return (await col()).countDocuments({ userId, panel, read: false });
}
export async function markPanelRead(userId: string, panel: NotifyPanel, ids?: string[]): Promise<void> {
  await (await col()).updateMany({ userId, panel, read: false, ...(ids ? { _id: { $in: ids } } : {}) }, { $set: { read: true } });
  await signalUsers(panel, [userId], null, "staff", "sync");
}
