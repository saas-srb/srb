import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";

/**
 * Shared helpers for the FMS (Finance Management System) data layer. Every
 * FMS collection:
 *  - uses a string UUID `_id` (generated here, never derived from user input)
 *  - carries `createdAt` / `updatedAt` / `createdBy` / `updatedBy` audit fields
 *  - is soft-deleted via a `deletedAt` timestamp (never hard-removed by default)
 *  - has its indexes ensured lazily on first access via a module guard flag
 *
 * Mirrors `src/lib/spendiq/db.ts` / `src/lib/cohort-ai/db.ts` / `src/lib/sprintos/db.ts`.
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

export async function fmsCollection<T extends { _id: string }>(name: string) {
  const db = await getDb();
  return db.collection<T>(name);
}

// ---------------------------------------------------------------------------
// Sequential code generator (Transaction / Invoice / Receipt / Payment codes)
// backed by `fms_counters`.
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
  const counters = db.collection<CounterDoc>("fms_counters");
  const result = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return result?.seq ?? 1;
}

/** e.g. formatCode("VEN", 7) -> "VEN-0007" */
export function formatCode(prefix: string, seq: number, pad = 4): string {
  return `${prefix}-${String(seq).padStart(pad, "0")}`;
}

/**
 * Year-scoped numbering per §40 of the FMS spec, e.g.
 * formatYearCode("TXN", 2026, 7) -> "TXN-2026-000007". The counter name is
 * scoped by prefix+year so numbering resets each calendar year without a
 * separate fiscal-year migration.
 */
export async function nextYearSequence(prefix: string, year: number): Promise<number> {
  return nextSequence(`${prefix}_${year}`);
}

export function formatYearCode(prefix: string, year: number, seq: number, pad = 6): string {
  return `${prefix}-${year}-${String(seq).padStart(pad, "0")}`;
}
