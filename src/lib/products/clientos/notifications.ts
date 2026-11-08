import "server-only";
import { signalNew } from "@/lib/notify/signals";
import { logBell, planNotification } from "@/lib/notify/center/store";
import { queuePush } from "@/lib/push/send";
import { categorizeType } from "@/lib/push/categories";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/clientos/db";

/** Per-recipient portal notifications. Mirrors `src/lib/spendiq/notifications.ts`. */

export const NOTIFICATIONS_COLLECTION = "external_notifications";

export interface ExternalNotification {
  _id: string;
  recipientUserId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  dedupeKey: string | null;
  createdAt: Date;
}

export interface SerializedExternalNotification extends Omit<ExternalNotification, "createdAt"> {
  createdAt: string;
}

let idx = false;

async function collection() {
  const db = await getDb();
  const c = db.collection<ExternalNotification>(NOTIFICATIONS_COLLECTION);
  if (!idx) {
    idx = true;
    await Promise.all([
      c.createIndex({ recipientUserId: 1, createdAt: -1 }).catch(() => {}),
      c.createIndex({ recipientUserId: 1, read: 1 }).catch(() => {}),
      c
        .createIndex({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } })
        .catch(() => {}),
    ]);
  }
  return c;
}

export async function notifyPortalUser(input: {
  recipientUserId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  dedupeKey?: string | null;
}): Promise<void> {
  try {
    const c = await collection();
    const plan = await planNotification({ type: input.type, title: input.title, body: input.body, link: input.link, product: "portal" });
    if (plan.inApp.on) await c.insertOne({
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
    await queuePush("portal", [input.recipientUserId], { category: categorizeType(input.type), title: input.title, body: input.body, url: input.link, tag: input.dedupeKey ?? undefined, event: input.type, product: "portal" });
    if (plan.inApp.on) await signalNew("portal", [input.recipientUserId], { type: input.type, title: plan.inApp.title, body: plan.inApp.body, link: input.link ?? null }, "portal");
    await logBell(plan.inApp.on, { type: input.type, title: input.title, product: "portal", reason: plan.inApp.reason });
  } catch {
    /* dup dedupeKey / transient — ignore */
  }
}

export async function listPortalNotifications(recipientUserId: string, limit = 30): Promise<ExternalNotification[]> {
  const c = await collection();
  return c.find({ recipientUserId }).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function portalUnreadCount(recipientUserId: string): Promise<number> {
  const c = await collection();
  return c.countDocuments({ recipientUserId, read: false });
}

export async function markPortalRead(ids: string[], recipientUserId: string): Promise<void> {
  if (ids.length === 0) return;
  const c = await collection();
  await c.updateMany({ _id: { $in: ids }, recipientUserId }, { $set: { read: true } });
}

export async function markAllPortalRead(recipientUserId: string): Promise<void> {
  const c = await collection();
  await c.updateMany({ recipientUserId, read: false }, { $set: { read: true } });
}

export function serializeNotification(n: ExternalNotification): SerializedExternalNotification {
  return { ...n, createdAt: n.createdAt.toISOString() };
}
