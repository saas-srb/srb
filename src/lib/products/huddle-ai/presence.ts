import "server-only";
import { getDb } from "@/lib/mongodb";
import { emit } from "@/lib/products/huddle-ai/events";

/**
 * Presence system. One row per user keyed by `admin_users._id`. The stored
 * `status` is the user's *chosen* state; a user is reported **offline** whenever
 * their last heartbeat is older than `STALE_MS`, regardless of what they chose,
 * so a closed tab always goes dark on its own.
 *
 * Heartbeats arrive from `/api/huddle-ai/presence` (client posts every ~30s and
 * on visibility change) and from the `(protected)` layout on each navigation.
 */

export const PRESENCE_COLLECTION = "user_presence";
const STALE_MS = 60 * 1000;

export type PresenceStatus = "online" | "away" | "busy" | "in_meeting" | "offline";

export const PRESENCE_META: Record<Exclude<PresenceStatus, "offline">, { label: string; dot: string }> = {
  online: { label: "Online", dot: "bg-green-500" },
  away: { label: "Away", dot: "bg-amber-500" },
  busy: { label: "Busy", dot: "bg-destructive" },
  in_meeting: { label: "In a meeting", dot: "bg-purple-500" },
};

interface PresenceDoc {
  _id: string; // userId
  status: Exclude<PresenceStatus, "offline">;
  customStatus: string | null;
  lastActiveAt: Date;
}

export interface Presence {
  userId: string;
  status: PresenceStatus;
  customStatus: string | null;
  lastActiveAt: string;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<PresenceDoc>(PRESENCE_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await collection.createIndex({ lastActiveAt: -1 }).catch(() => {});
  }
  return collection;
}

function resolve(doc: PresenceDoc | null): PresenceStatus {
  if (!doc) return "offline";
  if (Date.now() - doc.lastActiveAt.getTime() > STALE_MS) return "offline";
  return doc.status;
}

/** Record activity + optionally a new chosen status. Emits a `presence` event when the effective status changes. */
export async function heartbeat(
  userId: string,
  status?: Exclude<PresenceStatus, "offline">,
  customStatus?: string | null
): Promise<void> {
  try {
    const collection = await getCollection();
    const before = await collection.findOne({ _id: userId });
    const beforeStatus = resolve(before);

    const set: Partial<PresenceDoc> = { lastActiveAt: new Date() };
    if (status) set.status = status;
    if (customStatus !== undefined) set.customStatus = customStatus;

    await collection.updateOne(
      { _id: userId },
      { $set: set, $setOnInsert: { status: status ?? "online" } },
      { upsert: true }
    );

    const afterStatus: PresenceStatus = status ?? (beforeStatus === "offline" ? "online" : beforeStatus);
    if (afterStatus !== beforeStatus) {
      await emit({ scope: { type: "user", id: userId }, kind: "presence", payload: { userId, status: afterStatus }, actorId: userId });
    }
  } catch {
    // presence is best-effort
  }
}

/** Explicitly mark a user offline (logout). */
export async function goOffline(userId: string): Promise<void> {
  try {
    const collection = await getCollection();
    await collection.updateOne(
      { _id: userId },
      { $set: { lastActiveAt: new Date(0), status: "away" } },
      { upsert: true }
    );
    await emit({ scope: { type: "user", id: userId }, kind: "presence", payload: { userId, status: "offline" }, actorId: userId });
  } catch {
    /* ignore */
  }
}

export async function getPresence(userIds: string[]): Promise<Record<string, PresenceStatus>> {
  const out: Record<string, PresenceStatus> = {};
  if (userIds.length === 0) return out;
  const collection = await getCollection();
  const rows = await collection.find({ _id: { $in: userIds } }).toArray();
  const byId = new Map(rows.map((r) => [r._id, r]));
  for (const id of userIds) out[id] = resolve(byId.get(id) ?? null);
  return out;
}

export async function getPresenceDetail(userIds: string[]): Promise<Record<string, Presence>> {
  const out: Record<string, Presence> = {};
  if (userIds.length === 0) return out;
  const collection = await getCollection();
  const rows = await collection.find({ _id: { $in: userIds } }).toArray();
  const byId = new Map(rows.map((r) => [r._id, r]));
  for (const id of userIds) {
    const doc = byId.get(id) ?? null;
    out[id] = {
      userId: id,
      status: resolve(doc),
      customStatus: doc?.customStatus ?? null,
      lastActiveAt: (doc?.lastActiveAt ?? new Date(0)).toISOString(),
    };
  }
  return out;
}

/** Count of users currently online (or away/busy/in-meeting but active). */
export async function countOnline(): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments({ lastActiveAt: { $gt: new Date(Date.now() - STALE_MS) } });
}

export async function listOnlineUserIds(): Promise<string[]> {
  const collection = await getCollection();
  const rows = await collection
    .find({ lastActiveAt: { $gt: new Date(Date.now() - STALE_MS) } })
    .project<{ _id: string }>({ _id: 1 })
    .toArray();
  return rows.map((r) => r._id);
}
