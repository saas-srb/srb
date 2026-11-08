import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";

/**
 * Shared helpers for the DLMS data layer (mirrors `lib/seo-product/db.ts`):
 * string UUID `_id`s, audit stamps, soft delete via `deletedAt`, calendar-date
 * helpers. DLMS keeps to six collections — the Atlas cluster has a 500
 * collection ceiling.
 */

export type Id = string;

export function newId(): Id {
  return randomUUID();
}

export interface Stamps {
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
}

export function createStamp(actorId: string | null): Stamps {
  const now = new Date();
  return { createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId, deletedAt: null };
}

export function updateStamp(actorId: string | null): { updatedAt: Date; updatedBy: string | null } {
  return { updatedAt: new Date(), updatedBy: actorId };
}

export const notDeleted = { deletedAt: null } as const;

export const COLLECTIONS = {
  credentials: "dlms_credentials",
  documents: "dlms_documents",
  links: "dlms_links",
  notes: "dlms_notes",
  access: "dlms_access",
  settings: "dlms_settings",
  audit: "dlms_activity_logs",
} as const;

export async function dlmsCollection<T extends { _id: string }>(name: string) {
  const db = await getDb();
  return db.collection<T>(name);
}

/** `YYYY-MM-DD` in the server's local time — DLMS dates are calendar dates, not instants. */
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

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const str = (v: unknown, max = 300): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const strOrNull = (v: unknown, max = 300): string | null => str(v, max) || null;
