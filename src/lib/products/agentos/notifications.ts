import "server-only";
import { getDb } from "@/lib/mongodb";
import { notifyMany, NOTIFICATIONS_COLLECTION, type ChatNotification } from "@/lib/products/huddle-ai/notifications";

/**
 * AI Bots notifications ride the platform's per-user notification store
 * (`chat_notifications`, owned by Messenger), exactly like SOP, SEO and DLMS:
 * they show in Team Chat's bell and in the AI Bots bell (filtered to `aibots_*`).
 * Delivery is best-effort and never blocks the action that triggered it.
 */

export type AibotsNotificationType = "aibots_bot_access" | "aibots_bot_created" | "aibots_bot_status" | "aibots_bot_deleted" | "aibots_file_ready" | "aibots_file_failed";

export async function notifyAibotsUsers(userIds: string[], n: { type: AibotsNotificationType; title: string; body?: string; link: string; dedupeKey?: string }): Promise<void> {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return;
  try {
    await notifyMany(ids, { type: n.type, title: n.title, body: n.body ?? null, link: n.link, dedupeKey: n.dedupeKey ?? null });
  } catch {
    // non-fatal
  }
}

export interface AibotsBellItem {
  _id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export async function listAibotsNotifications(userId: string, limit = 15): Promise<{ items: AibotsBellItem[]; unread: number }> {
  const db = await getDb();
  const col = db.collection<ChatNotification>(NOTIFICATIONS_COLLECTION);
  const filter = { recipientUserId: userId, type: { $regex: "^aibots_" } };
  const [rows, unread] = await Promise.all([col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray(), col.countDocuments({ ...filter, read: false })]);
  return {
    items: rows.map((r) => ({ _id: r._id, type: r.type, title: r.title, body: r.body ?? "", link: r.link, createdAt: r.createdAt.toISOString(), read: r.read })),
    unread,
  };
}

export async function markAibotsNotificationsRead(userId: string, ids?: string[]): Promise<void> {
  const db = await getDb();
  await db
    .collection<ChatNotification>(NOTIFICATIONS_COLLECTION)
    .updateMany({ recipientUserId: userId, type: { $regex: "^aibots_" }, read: false, ...(ids ? { _id: { $in: ids } } : {}) }, { $set: { read: true } });
}
