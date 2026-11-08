import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/huddle-ai/db";
import { signalNew } from "@/lib/notify/signals";
import { panelOfChatType, MESSENGER_ONLY_TYPE } from "@/lib/notify/panels";
import { logBell, planNotification } from "@/lib/notify/center/store";
import { queuePush } from "@/lib/push/send";
import { categorizeType } from "@/lib/push/categories";

/**
 * Per-recipient Messenger notifications. `recipientUserId` is an `admin_users`
 * `_id` (string). Mirrors `src/lib/spendiq/notifications.ts`. The realtime badge is
 * driven by `chat_events` of kind `notification`; this collection is the
 * durable list behind the bell + `/huddle-ai/notifications`.
 */

export const NOTIFICATIONS_COLLECTION = "chat_notifications";

export type ChatNotificationType =
  | "message"
  | "mention"
  | "channel_invite"
  | "file_shared"
  | "announcement"
  | "project_update"
  | "task_linked";

export interface ChatNotification {
  _id: string;
  recipientUserId: string;
  type: ChatNotificationType | string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  dedupeKey: string | null;
  createdAt: Date;
}

export interface SerializedChatNotification extends Omit<ChatNotification, "createdAt"> {
  createdAt: string;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<ChatNotification>(NOTIFICATIONS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ recipientUserId: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ recipientUserId: 1, read: 1 }).catch(() => {}),
      collection
        .createIndex({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } })
        .catch(() => {}),
      collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 86400 }).catch(() => {}),
    ]);
  }
  return collection;
}

export interface NotifyInput {
  recipientUserId: string;
  type: ChatNotificationType | string;
  title: string;
  body?: string | null;
  link?: string | null;
  dedupeKey?: string | null;
}

/** Best-effort — never throws. Dedupe-key collisions are silently ignored. */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const collection = await getCollection();
    const product = panelOfChatType(String(input.type));
    const plan = await planNotification({ type: String(input.type), title: input.title, body: input.body, link: input.link, product });
    if (plan.inApp.on) await collection.insertOne({
      _id: newId(),
      recipientUserId: input.recipientUserId,
      type: input.type,
      title: plan.inApp.title,
      body: plan.inApp.body,
      link: input.link ?? null,
      read: false,
      dedupeKey: input.dedupeKey ?? null,
      createdAt: new Date(),
    });
    await queuePush("staff", [input.recipientUserId], { category: categorizeType(input.type), title: input.title, body: input.body, url: input.link, tag: input.dedupeKey ?? undefined, event: String(input.type), product });
    if (plan.inApp.on) await signalNew(product, [input.recipientUserId], { type: String(input.type), title: plan.inApp.title, body: plan.inApp.body, link: input.link ?? null });
    await logBell(plan.inApp.on, { type: String(input.type), title: input.title, product, reason: plan.inApp.reason });
  } catch {
    // dup dedupeKey or transient error — ignore.
  }
}

export async function notifyMany(recipientIds: string[], n: Omit<NotifyInput, "recipientUserId">): Promise<void> {
  await Promise.all(
    Array.from(new Set(recipientIds)).map((id) =>
      notify({ ...n, recipientUserId: id, dedupeKey: n.dedupeKey ? `${n.dedupeKey}:${id}` : null })
    )
  );
}

export async function listNotifications(recipientUserId: string, limit = 20): Promise<ChatNotification[]> {
  const collection = await getCollection();
  return collection.find({ recipientUserId, type: MESSENGER_ONLY_TYPE }).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function unreadCount(recipientUserId: string): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments({ recipientUserId, type: MESSENGER_ONLY_TYPE, read: false });
}

export async function markRead(ids: string[], recipientUserId: string): Promise<void> {
  if (ids.length === 0) return;
  const collection = await getCollection();
  await collection.updateMany({ _id: { $in: ids }, recipientUserId, type: MESSENGER_ONLY_TYPE }, { $set: { read: true } });
}

export async function markAllRead(recipientUserId: string): Promise<void> {
  const collection = await getCollection();
  await collection.updateMany({ recipientUserId, type: MESSENGER_ONLY_TYPE, read: false }, { $set: { read: true } });
}

export function serializeNotification(n: ChatNotification): SerializedChatNotification {
  return { ...n, createdAt: n.createdAt.toISOString() };
}

export interface UnreadSummary {
  dms: number;
  channels: number;
  total: number;
}

/** Unread message counts split by conversation kind — drives the sidebar badges. */
export async function unreadSummary(userId: string): Promise<UnreadSummary> {
  const db = await getDb();

  const [memberRows, convRows] = await Promise.all([
    db.collection<{ channelId: string; lastReadSeq: number }>("channel_members").find({ userId, deletedAt: null }).toArray(),
    db
      .collection<{ _id: string; participantIds: string[]; readSeqByUser: Record<string, number> }>("direct_conversations")
      .find({ participantIds: userId })
      .toArray(),
  ]);

  let channels = 0;
  for (const m of memberRows) {
    channels += await db
      .collection("channel_messages")
      .countDocuments({ channelId: m.channelId, seq: { $gt: m.lastReadSeq }, authorId: { $ne: userId }, deletedAt: null });
  }

  let dms = 0;
  for (const c of convRows) {
    dms += await db
      .collection("direct_messages")
      .countDocuments({ conversationId: c._id, seq: { $gt: c.readSeqByUser?.[userId] ?? 0 }, authorId: { $ne: userId }, deletedAt: null });
  }

  return { dms, channels, total: dms + channels };
}

/** Total unread messages across all of a user's conversations + channels (dashboard KPI). */
export async function totalUnreadForUser(userId: string): Promise<number> {
  return (await unreadSummary(userId)).total;
}
