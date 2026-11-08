import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";

/**
 * Shared helpers for the SOP data layer. Mirrors `src/lib/cashflow-ai/db.ts`: string
 * UUID `_id`s generated here, audit stamps, soft delete via `deletedAt`, and
 * atomically-incremented counters (`sop_counters`) for human-readable SOP IDs.
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
  sops: "sops",
  versions: "sop_versions",
  departments: "sop_departments",
  functions: "sop_functions",
  processes: "sop_processes",
  categories: "sop_categories",
  templates: "sop_templates",
  assignments: "sop_assignments",
  files: "sop_files",
  feedback: "sop_feedback",
  settings: "sop_settings",
  counters: "sop_counters",
  audit: "sop_activity_logs",
} as const;

export async function sopCollection<T extends { _id: string }>(name: string) {
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

/** `YYYY-MM-DD` for "today" in the server's local time — SOP dates are calendar dates, not instants. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayIso(d);
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Returns the input if it is a real calendar date, else null. */
export function cleanIsoDate(v: unknown): string | null {
  if (typeof v !== "string" || !ISO_RE.test(v)) return null;
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) || todayIso(d) !== v ? null : v;
}
