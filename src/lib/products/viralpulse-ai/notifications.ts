import "server-only";
import { getDb } from "@/lib/mongodb";
import { notifyMany, NOTIFICATIONS_COLLECTION, type ChatNotification } from "@/lib/products/huddle-ai/notifications";

/**
 * Social Media notifications ride the platform's per-user notification store
 * (`chat_notifications`, owned by Messenger), exactly like SOP, SEO and DLMS:
 * they show in Team Chat's bell and in the Social Media bell (filtered to `smms_*`).
 * Delivery is best-effort and never blocks the action that triggered it.
 */

export type SmmsNotificationType = "smms_publish_due" | "smms_publish_failed" | "smms_published" | "smms_approval_needed" | "smms_post_approved" | "smms_approval_withdrawn" | "smms_integration_disconnected" | "smms_integration_error" | "smms_ugc_ready" | "smms_ugc_failed" | "smms_ugc_approval";

export async function notifySmmsUsers(userIds: string[], n: { type: SmmsNotificationType; title: string; body?: string; link: string; dedupeKey?: string }): Promise<void> {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return;
  try {
    await notifyMany(ids, { type: n.type, title: n.title, body: n.body ?? null, link: n.link, dedupeKey: n.dedupeKey ?? null });
  } catch {
    // non-fatal
  }
}

export interface SmmsBellItem {
  _id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export async function listSmmsNotifications(userId: string, limit = 15): Promise<{ items: SmmsBellItem[]; unread: number }> {
  const db = await getDb();
  const col = db.collection<ChatNotification>(NOTIFICATIONS_COLLECTION);
  const filter = { recipientUserId: userId, type: { $regex: "^smms_" } };
  const [rows, unread] = await Promise.all([col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray(), col.countDocuments({ ...filter, read: false })]);
  return {
    items: rows.map((r) => ({ _id: r._id, type: r.type, title: r.title, body: r.body ?? "", link: r.link, createdAt: r.createdAt.toISOString(), read: r.read })),
    unread,
  };
}

export async function markSmmsNotificationsRead(userId: string, ids?: string[]): Promise<void> {
  const db = await getDb();
  await db
    .collection<ChatNotification>(NOTIFICATIONS_COLLECTION)
    .updateMany({ recipientUserId: userId, type: { $regex: "^smms_" }, read: false, ...(ids ? { _id: { $in: ids } } : {}) }, { $set: { read: true } });
}
