import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import type { NotifyPanel, SignalItem } from "@/lib/notify/panels";

/**
 * The realtime side of notifications. Every notification written anywhere (any product's own store or the shared one) also appends a small
 * "signal" per recipient here; the stream route (`/api/notifications/stream`) tails them and pushes them to that person's open tabs.
 * The notification itself stays in its own store — a lost signal costs nothing but a delay, because every bell also recounts on
 * reconnect, on focus and once a minute.
 */
export const SIGNALS_COLLECTION = "notify_signals";

export type SignalActor = "staff" | "portal";
export interface Signal {
  _id: string;
  userId: string;
  actor: SignalActor;
  panel: NotifyPanel;
  /** "new" = a notification arrived; "sync" = counts changed (marked read elsewhere) and the bell should recount. */
  kind: "new" | "sync";
  item?: SignalItem;
  createdAt: Date;
}

let indexed = false;
async function col() {
  const c = (await getDb()).collection<Signal>(SIGNALS_COLLECTION);
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ userId: 1, createdAt: 1 }).catch(() => {}), c.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2 * 86400 }).catch(() => {})]);
  }
  return c;
}

/** Best-effort, never throws, never delays the write that raised it. */
export async function signalUsers(panel: NotifyPanel, userIds: string[], item: SignalItem | null, actor: SignalActor = "staff", kind: "new" | "sync" = "new"): Promise<void> {
  try {
    const ids = [...new Set(userIds.filter(Boolean))].slice(0, 500);
    if (ids.length === 0) return;
    const now = new Date();
    await (await col()).insertMany(ids.map((userId) => ({ _id: randomUUID(), userId, actor, panel, kind, ...(item ? { item } : {}), createdAt: now })), { ordered: false });
  } catch (err) {
    console.error("[notify] signal failed", err instanceof Error ? err.message : err);
  }
}

/** Signals newer than `since` (with a small overlap the caller dedupes by id) for one person. */
export async function pullSignals(userId: string, actor: SignalActor, since: Date, limit = 100): Promise<Signal[]> {
  return (await col()).find({ userId, actor, createdAt: { $gte: since } }).sort({ createdAt: 1 }).limit(limit).toArray();
}

/** Convenience for the products' own stores: "someone just got this" in one call. */
export async function signalNew(panel: NotifyPanel, userIds: string[], n: { type: string; title: string; body?: string | null; link?: string | null }, actor: SignalActor = "staff"): Promise<void> {
  const link = n.link && n.link.startsWith("/") && !n.link.startsWith("//") ? n.link : null;
  await signalUsers(panel, userIds, { id: randomUUID(), type: n.type, title: n.title, body: n.body ?? null, link, priority: "normal", createdAt: new Date().toISOString() }, actor, "new");
}
