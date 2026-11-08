import "server-only";
import { getDb } from "@/lib/mongodb";
import { notifyMany, NOTIFICATIONS_COLLECTION, type ChatNotification } from "@/lib/products/huddle-ai/notifications";

/**
 * SOP notifications ride the platform's existing per-user notification store
 * (`chat_notifications`, owned by Messenger) instead of a parallel one: they
 * show in Team Chat's bell for anyone with Messenger access AND in the SOP
 * product's own bell (filtered to `sop_*` types). Delivery is best-effort and
 * never blocks the action that triggered it.
 */

export type SopNotificationType = "sop_assigned" | "sop_updated" | "sop_reminder" | "sop_overdue" | "sop_feedback" | "sop_review_due" | "sop_expiring";

export async function notifySopUsers(
  userIds: string[],
  n: { type: SopNotificationType; title: string; body?: string; link: string; dedupeKey?: string }
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await notifyMany(userIds, { type: n.type, title: n.title, body: n.body ?? null, link: n.link, dedupeKey: n.dedupeKey ?? null });
  } catch {
    // non-fatal
  }
}

export interface SopBellItem {
  _id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export async function listSopNotifications(userId: string, limit = 15): Promise<{ items: SopBellItem[]; unread: number }> {
  const db = await getDb();
  const col = db.collection<ChatNotification>(NOTIFICATIONS_COLLECTION);
  const filter = { recipientUserId: userId, type: { $regex: "^sop_" } };
  const [rows, unread] = await Promise.all([
    col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray(),
    col.countDocuments({ ...filter, read: false }),
  ]);
  return {
    items: rows.map((r) => ({ _id: r._id, type: r.type, title: r.title, body: r.body ?? "", link: r.link, createdAt: r.createdAt.toISOString(), read: r.read })),
    unread,
  };
}

export async function markSopNotificationsRead(userId: string, ids?: string[]): Promise<void> {
  const db = await getDb();
  const col = db.collection<ChatNotification>(NOTIFICATIONS_COLLECTION);
  await col.updateMany(
    { recipientUserId: userId, type: { $regex: "^sop_" }, read: false, ...(ids ? { _id: { $in: ids } } : {}) },
    { $set: { read: true } }
  );
}
