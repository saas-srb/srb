import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";

/**
 * Shared helpers for the HRMS data layer. Every HRMS collection:
 *  - uses a string UUID `_id` (generated here, never derived from user input)
 *  - carries `createdAt` / `updatedAt` / `createdBy` / `updatedBy` audit fields
 *  - is soft-deleted via a `deletedAt` timestamp (never hard-removed by default)
 *  - has its indexes ensured lazily on first access via a module guard flag
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

/** Audit stamp for a freshly-created document. */
export function createStamp(actorId: string | null): AuditFields {
  const now = new Date();
  return { createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId, deletedAt: null };
}

/** Partial audit stamp for an update — spread into a `$set`. */
export function updateStamp(actorId: string | null): { updatedAt: Date; updatedBy: string | null } {
  return { updatedAt: new Date(), updatedBy: actorId };
}

/** Excludes soft-deleted rows. Spread into any find filter. */
export const notDeleted = { deletedAt: null } as const;

export async function hrmsCollection<T extends { _id: string }>(name: string) {
  const db = await getDb();
  return db.collection<T>(name);
}

// ---------------------------------------------------------------------------
// Sequential code generator (Employee IDs, etc.) backed by `hrms_counters`.
// ---------------------------------------------------------------------------

interface CounterDoc {
  _id: string;
  seq: number;
}

/**
 * Atomically increments the named counter and returns the new value. Safe
 * under concurrency — `findOneAndUpdate` with `$inc` + `upsert` is a single
 * server-side operation.
 */
export async function nextSequence(name: string): Promise<number> {
  const db = await getDb();
  const counters = db.collection<CounterDoc>("hrms_counters");
  const result = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return result?.seq ?? 1;
}

/** e.g. formatCode("YO", 7) -> "YO-0007" */
export function formatCode(prefix: string, seq: number, pad = 4): string {
  return `${prefix}-${String(seq).padStart(pad, "0")}`;
}
