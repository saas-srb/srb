import "server-only";
import { getDb } from "@/lib/mongodb";
import { DEFAULT_WEB_PUSH_SETTINGS, normalizeWebPushSettings, WEB_PUSH_TOPICS, type WebPushSettings, type WebPushTopic } from "@/lib/webpush/topics";

export const SUBSCRIBERS_COLLECTION = "web_push_subscribers";
export const BROADCASTS_COLLECTION = "web_push_broadcasts";
export const SETTINGS_COLLECTION = "web_push_settings";

/** A visitor's browser that agreed to notifications from this company's website. Anonymous: no name, email or account. */
export interface WebSubscriber {
  _id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  topics: WebPushTopic[];
  device: string;
  /** Page the visitor subscribed on. */
  source: string;
  createdAt: Date;
  lastSeenAt: Date;
  failures: number;
}

export type BroadcastStatus = "sending" | "sent" | "partial" | "failed" | "skipped";

export interface Broadcast {
  _id: string;
  topic: WebPushTopic;
  title: string;
  body: string;
  url: string;
  /** What caused it: a person in the CMS, or an automation. */
  trigger: "manual" | "offer" | "reward" | "post";
  status: BroadcastStatus;
  note: string | null;
  targeted: number;
  sent: number;
  failed: number;
  clicks: number;
  createdAt: Date;
  createdBy: string | null;
}

let indexed = false;
export async function subscribersCol() {
  const c = (await getDb()).collection<WebSubscriber>(SUBSCRIBERS_COLLECTION);
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ endpoint: 1 }, { unique: true }), c.createIndex({ topics: 1, _id: 1 })]).catch(() => {});
  }
  return c;
}

export async function broadcastsCol() {
  const c = (await getDb()).collection<Broadcast>(BROADCASTS_COLLECTION);
  await c.createIndex({ createdAt: -1 }).catch(() => {});
  return c;
}

export async function getWebPushSettings(): Promise<WebPushSettings> {
  const doc = await (await getDb()).collection<{ _id: string; settings?: unknown }>(SETTINGS_COLLECTION).findOne({ _id: "default" });
  return doc?.settings ? normalizeWebPushSettings(doc.settings) : DEFAULT_WEB_PUSH_SETTINGS;
}

export async function saveWebPushSettings(input: unknown): Promise<WebPushSettings> {
  const settings = normalizeWebPushSettings(input);
  await (await getDb()).collection<{ _id: string; settings?: unknown }>(SETTINGS_COLLECTION).updateOne({ _id: "default" }, { $set: { settings, updatedAt: new Date() } }, { upsert: true });
  return settings;
}

export async function subscriberStats(): Promise<{ total: number; byTopic: Record<WebPushTopic, number>; last7Days: number }> {
  const c = await subscribersCol();
  const since = new Date(Date.now() - 7 * 86400000);
  const [total, last7Days, ...per] = await Promise.all([c.countDocuments({}), c.countDocuments({ createdAt: { $gte: since } }), ...WEB_PUSH_TOPICS.map((t) => c.countDocuments({ topics: t }))]);
  return { total, last7Days, byTopic: Object.fromEntries(WEB_PUSH_TOPICS.map((t, i) => [t, per[i]])) as Record<WebPushTopic, number> };
}

export async function listBroadcasts(limit = 25): Promise<Broadcast[]> {
  return (await broadcastsCol()).find({}).sort({ createdAt: -1 }).limit(limit).toArray();
}
