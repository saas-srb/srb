import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";

/**
 * Shared helpers for the OTS data layer. Mirrors `src/lib/playbook-ai/db.ts`: string
 * UUID `_id`s generated here, audit stamps, soft delete via `deletedAt`, and
 * atomically-incremented counters (`ots_counters`) for human-readable codes.
 *
 * OTS owns ONLY testing data (tests, questions, assignments, attempts,
 * results, certificates). People — employees, applicants, students,
 * departments, designations, batches, programs — are always read live from
 * HRMS / Careers / TMS through `lib/evaliq/people.ts` and referenced by id.
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

export const COLLECTIONS = {
  categories: "ots_categories",
  questions: "ots_questions",
  tests: "ots_tests",
  dispatches: "ots_dispatches",
  assignments: "ots_assignments",
  attempts: "ots_attempts",
  certificates: "ots_certificates",
  settings: "ots_settings",
  counters: "ots_counters",
  audit: "ots_activity_logs",
} as const;

export async function otsCollection<T extends { _id: string }>(name: string) {
  const db = await getDb();
  return db.collection<T>(name);
}

/** Atomically increments the named counter and returns the new value. */
export async function nextSequence(name: string): Promise<number> {
  const db = await getDb();
  const result = await db
    .collection<{ _id: string; seq: number }>(COLLECTIONS.counters)
    .findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  return result?.seq ?? 1;
}

export async function nextCode(prefix: string, counter: string, pad = 4): Promise<string> {
  const seq = await nextSequence(counter);
  return `${prefix}-${String(seq).padStart(pad, "0")}`;
}

let indexesEnsured = false;

/** Creates every OTS index once per server instance. Cheap to call from any entry point. */
export async function ensureOtsIndexes(): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  const db = await getDb();
  const ops: Promise<unknown>[] = [
    db.collection(COLLECTIONS.questions).createIndex({ deletedAt: 1, status: 1, updatedAt: -1 }),
    db.collection(COLLECTIONS.questions).createIndex({ code: 1 }, { unique: true }),
    db.collection(COLLECTIONS.tests).createIndex({ deletedAt: 1, status: 1, updatedAt: -1 }),
    db.collection(COLLECTIONS.tests).createIndex({ code: 1 }, { unique: true }),
    db.collection(COLLECTIONS.tests).createIndex({ "sections.questionIds": 1 }),
    db.collection(COLLECTIONS.assignments).createIndex({ testId: 1, candidateKey: 1 }),
    db.collection(COLLECTIONS.assignments).createIndex({ candidateKey: 1, status: 1 }),
    db.collection(COLLECTIONS.assignments).createIndex({ dispatchId: 1 }),
    db.collection(COLLECTIONS.assignments).createIndex({ status: 1, dueAt: 1 }),
    db.collection(COLLECTIONS.attempts).createIndex({ assignmentId: 1, attemptNo: 1 }, { unique: true }),
    db.collection(COLLECTIONS.attempts).createIndex({ testId: 1, status: 1 }),
    db.collection(COLLECTIONS.attempts).createIndex({ candidateKey: 1, startedAt: -1 }),
    db.collection(COLLECTIONS.attempts).createIndex({ status: 1, deadlineAt: 1 }),
    db.collection(COLLECTIONS.certificates).createIndex({ certificateNumber: 1 }, { unique: true }),
    db.collection(COLLECTIONS.certificates).createIndex({ verificationCode: 1 }, { unique: true }),
    db.collection(COLLECTIONS.certificates).createIndex({ assignmentId: 1 }),
    db.collection(COLLECTIONS.certificates).createIndex({ candidateKey: 1 }),
    db.collection(COLLECTIONS.audit).createIndex({ createdAt: -1 }),
    db.collection(COLLECTIONS.audit).createIndex({ entity: 1, entityId: 1, createdAt: -1 }),
    db.collection(COLLECTIONS.audit).createIndex({ action: 1, createdAt: -1 }),
  ];
  await Promise.all(ops.map((p) => p.catch(() => {})));
}

export function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parses a `datetime-local` / ISO string into a Date, or null. */
export function parseDateTime(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
