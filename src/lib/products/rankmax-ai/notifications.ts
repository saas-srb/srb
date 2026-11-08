import "server-only";
import { getDb } from "@/lib/mongodb";
import { notifyMany, NOTIFICATIONS_COLLECTION, type ChatNotification } from "@/lib/products/huddle-ai/notifications";

/**
 * SEO notifications ride the platform's per-user notification store
 * (`chat_notifications`, owned by Messenger), exactly like SOP: they show in
 * Team Chat's bell and in the SEO product's own bell (filtered to `seo_*`).
 * Delivery is best-effort and never blocks the action that triggered it.
 */

export type SeoNotificationType = "seo_task_assigned" | "seo_task_updated" | "seo_issue_assigned" | "seo_audit_completed" | "seo_audit_failed" | "seo_ranking_drop";

export async function notifySeoUsers(userIds: string[], n: { type: SeoNotificationType; title: string; body?: string; link: string; dedupeKey?: string }): Promise<void> {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return;
  try {
    await notifyMany(ids, { type: n.type, title: n.title, body: n.body ?? null, link: n.link, dedupeKey: n.dedupeKey ?? null });
  } catch {
    // non-fatal
  }
}

export interface SeoBellItem {
  _id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export async function listSeoNotifications(userId: string, limit = 15): Promise<{ items: SeoBellItem[]; unread: number }> {
  const db = await getDb();
  const col = db.collection<ChatNotification>(NOTIFICATIONS_COLLECTION);
  const filter = { recipientUserId: userId, type: { $regex: "^seo_" } };
  const [rows, unread] = await Promise.all([col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray(), col.countDocuments({ ...filter, read: false })]);
  return {
    items: rows.map((r) => ({ _id: r._id, type: r.type, title: r.title, body: r.body ?? "", link: r.link, createdAt: r.createdAt.toISOString(), read: r.read })),
    unread,
  };
}

export async function markSeoNotificationsRead(userId: string, ids?: string[]): Promise<void> {
  const db = await getDb();
  await db
    .collection<ChatNotification>(NOTIFICATIONS_COLLECTION)
    .updateMany({ recipientUserId: userId, type: { $regex: "^seo_" }, read: false, ...(ids ? { _id: { $in: ids } } : {}) }, { $set: { read: true } });
}
