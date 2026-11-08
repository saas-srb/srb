import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";

/**
 * Shared helpers for the Social Media (SMMS) data layer (mirrors
 * `lib/agentos/db.ts`): string UUID `_id`s, audit stamps, soft delete via
 * `deletedAt`.
 *
 * SMMS owns only social-media CONTENT: campaigns' creative briefs, ads, posts,
 * the media library, AI generations and platform connections. Company details,
 * services, offers, clients and ad-spend performance are read live from the
 * products that own them (HRMS, the site catalogue, Festival Offers, PMS, LMS
 * campaigns) and never copied here. Nine collections — the Atlas cluster has a
 * 500 collection ceiling.
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
  campaigns: "smms_campaigns",
  ads: "smms_ads",
  posts: "smms_posts",
  media: "smms_media",
  /** Every AI output and every saved edit, per record — the version history and the AI usage ledger in one. */
  generations: "smms_generations",
  settings: "smms_settings",
  integrations: "smms_integrations",
  audit: "smms_activity_logs",
} as const;

export async function smmsCollection<T extends { _id: string }>(name: string) {
  const db = await getDb();
  return db.collection<T>(name);
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const str = (v: unknown, max = 300): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const strOrNull = (v: unknown, max = 300): string | null => str(v, max) || null;

/** Trimmed, de-duplicated, non-empty strings. Accepts an array or a newline/comma separated string. */
export function strList(v: unknown, maxItems = 30, maxLen = 200): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/\n|,/) : [];
  const out: string[] = [];
  for (const item of raw) {
    const s = str(item, maxLen);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function dateOrNull(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
