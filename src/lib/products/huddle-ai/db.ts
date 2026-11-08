import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";

/**
 * Shared helpers for the Messenger (Team Communication Platform) data layer.
 * Every Messenger collection:
 *  - uses a string UUID `_id` (generated here, never derived from user input)
 *  - carries `createdAt` / `updatedAt` / `createdBy` / `updatedBy` audit fields
 *  - is soft-deleted via a `deletedAt` timestamp (never hard-removed by default)
 *  - has its indexes ensured lazily on first access via a module guard flag
 *
 * Mirrors `src/lib/spendiq/db.ts` and `src/lib/sprintos/db.ts`. Collection names follow
 * the spec's `chat_*` naming (`chat_users`, `chat_channels`, `channel_members`,
 * `direct_conversations`, `direct_messages`, `channel_messages`, …).
 */

export type Id = string;

export function newId(): Id {
  return randomUUID();
}

export interface AuditFields {
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
}

export function createStamp(actorId: string | null): AuditFields {
  const now = new Date();
  return { createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId, deletedAt: null };
}

export function updateStamp(actorId: string | null): { updatedAt: Date; updatedBy: string | null } {
  return { updatedAt: new Date(), updatedBy: actorId };
}

/** Excludes soft-deleted rows. Spread into any find filter. */
export const notDeleted = { deletedAt: null } as const;

export async function messengerCollection<T extends { _id: string }>(name: string) {
  const db = await getDb();
  return db.collection<T>(name);
}

// ---------------------------------------------------------------------------
// Monotonic sequence generator, backed by `chat_counters`. Drives the global
// event log ordering (`chat_event`) and any future per-conversation sequences.
// `findOneAndUpdate` with `$inc` + `upsert` is a single atomic server-side op,
// safe under concurrency.
// ---------------------------------------------------------------------------

interface CounterDoc {
  _id: string;
  seq: number;
}

export async function nextSequence(name: string): Promise<number> {
  const db = await getDb();
  const counters = db.collection<CounterDoc>("chat_counters");
  const result = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return result?.seq ?? 1;
}

/** Reserves `n` consecutive sequence values, returning the first. */
export async function nextSequenceBlock(name: string, n: number): Promise<number> {
  if (n <= 1) return nextSequence(name);
  const db = await getDb();
  const counters = db.collection<CounterDoc>("chat_counters");
  const result = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: n } },
    { upsert: true, returnDocument: "after" }
  );
  const end = result?.seq ?? n;
  return end - n + 1;
}

/** A URL-safe channel slug from a display name. Uniqueness is enforced by caller. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "channel";
}
