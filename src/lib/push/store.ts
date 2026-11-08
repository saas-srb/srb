import "server-only";
import { getDb } from "@/lib/mongodb";
import { DEFAULT_PREFERENCES, normalizePreferences, type PushPreferences } from "@/lib/push/categories";

/** Who a push goes to: a staff/employee account (`admin_users`) or an external portal account (`external_users`). */
export type PushActor = "staff" | "portal";

export interface PushSubscriptionDoc {
  _id: string;
  actor: PushActor;
  userId: string;
  /** The push service URL; one browser install = one endpoint. */
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Short, human description of the device ("Chrome on Android"). */
  device: string;
  userAgent: string;
  createdAt: Date;
  lastSeenAt: Date;
  lastSuccessAt: Date | null;
  /** Consecutive failed deliveries; the subscription is dropped after a few. */
  failures: number;
}

interface PreferencesDoc {
  _id: string;
  actor: PushActor;
  userId: string;
  prefs: PushPreferences;
  updatedAt: Date;
}

export const SUBSCRIPTIONS_COLLECTION = "push_subscriptions";
export const PREFERENCES_COLLECTION = "push_preferences";

let indexed = false;
export async function subscriptionsCol() {
  const c = (await getDb()).collection<PushSubscriptionDoc>(SUBSCRIPTIONS_COLLECTION);
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ endpoint: 1 }, { unique: true }), c.createIndex({ actor: 1, userId: 1 })]).catch(() => {});
  }
  return c;
}

async function prefsCol() {
  return (await getDb()).collection<PreferencesDoc>(PREFERENCES_COLLECTION);
}

const prefsId = (actor: PushActor, userId: string) => `${actor}:${userId}`;

export async function getPreferences(actor: PushActor, userId: string): Promise<PushPreferences> {
  const doc = await (await prefsCol()).findOne({ _id: prefsId(actor, userId) });
  return doc ? normalizePreferences(doc.prefs) : DEFAULT_PREFERENCES;
}

export async function getPreferencesMany(actor: PushActor, userIds: string[]): Promise<Map<string, PushPreferences>> {
  const rows = await (await prefsCol()).find({ _id: { $in: userIds.map((id) => prefsId(actor, id)) } }).toArray();
  return new Map(rows.map((r) => [r.userId, normalizePreferences(r.prefs)]));
}

export async function savePreferences(actor: PushActor, userId: string, input: unknown): Promise<PushPreferences> {
  const prefs = normalizePreferences(input);
  await (await prefsCol()).updateOne(
    { _id: prefsId(actor, userId) },
    { $set: { actor, userId, prefs, updatedAt: new Date() } },
    { upsert: true },
  );
  return prefs;
}

export interface DeviceView {
  id: string;
  device: string;
  createdAt: string;
  lastSuccessAt: string | null;
}

export async function listDevices(actor: PushActor, userId: string): Promise<DeviceView[]> {
  const rows = await (await subscriptionsCol()).find({ actor, userId }).sort({ createdAt: -1 }).limit(20).toArray();
  return rows.map((r) => ({ id: r._id, device: r.device, createdAt: r.createdAt.toISOString(), lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null }));
}

export async function removeDevice(actor: PushActor, userId: string, id: string): Promise<boolean> {
  return ((await (await subscriptionsCol()).deleteOne({ _id: id, actor, userId })).deletedCount ?? 0) > 0;
}
