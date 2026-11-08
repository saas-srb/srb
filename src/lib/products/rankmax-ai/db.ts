import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";

/**
 * Shared helpers for the SEO data layer. Mirrors `src/lib/playbook-ai/db.ts`: string
 * UUID `_id`s, audit stamps, and atomically-incremented counters for
 * human-readable task codes.
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
}

export function createStamp(actorId: string | null): Stamps {
  const now = new Date();
  return { createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId };
}

export function updateStamp(actorId: string | null): { updatedAt: Date; updatedBy: string | null } {
  return { updatedAt: new Date(), updatedBy: actorId };
}

export const COLLECTIONS = {
  settings: "seo_settings",
  pages: "seo_pages",
  pageContent: "seo_page_content",
  links: "seo_links",
  runs: "seo_crawl_runs",
  issues: "seo_issues",
  tasks: "seo_tasks",
  keywords: "seo_keywords",
  keywordGroups: "seo_keyword_groups",
  rankHistory: "seo_rank_history",
  backlinks: "seo_backlinks",
  competitors: "seo_competitors",
  competitorRankings: "seo_competitor_rankings",
  schemas: "seo_schemas",
  sitemaps: "seo_sitemaps",
  searchDaily: "seo_search_daily",
  searchRows: "seo_search_rows",
  trafficDaily: "seo_traffic_daily",
  counters: "seo_counters",
  audit: "seo_activity_logs",
} as const;

export async function seoCollection<T extends { _id: string }>(name: string) {
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

/** `YYYY-MM-DD` in the server's local time. */
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

/** Finite number in [min, max] or null. */
export function num(v: unknown, min = -Infinity, max = Infinity): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, min), max);
}

export const str = (v: unknown, max = 300): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
