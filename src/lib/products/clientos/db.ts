import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";

/**
 * Shared helpers for the External User Portal data layer. The portal owns only a
 * few identity / notification / document tables — every applicant / student /
 * client record is read **live** from the existing ERP domain collections
 * (`career_applications`, `training_students`, `pms_clients`, …). Mirrors
 * `src/lib/spendiq/db.ts`.
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

export const notDeleted = { deletedAt: null } as const;

export async function portalCollection<T extends { _id: string }>(name: string) {
  const db = await getDb();
  return db.collection<T>(name);
}

/** Normalises a phone for matching — digits only, keep the last 10. */
export function normalizePhone(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

interface CounterDoc {
  _id: string;
  seq: number;
}

/**
 * Atomically increments the named counter and returns the new value. Single
 * server-side op (`findOneAndUpdate` + `$inc` + `upsert`), safe under concurrency.
 */
export async function nextSequence(name: string): Promise<number> {
  const db = await getDb();
  const counters = db.collection<CounterDoc>("portal_counters");
  const result = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return result?.seq ?? 1;
}

/** e.g. formatCode("LEAD-2026", 7) -> "LEAD-2026-0007" */
export function formatCode(prefix: string, seq: number, pad = 4): string {
  return `${prefix}-${String(seq).padStart(pad, "0")}`;
}
