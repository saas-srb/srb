import "server-only";
import { randomUUID } from "node:crypto";
import { revalidateTag } from "next/cache";
import { getDb } from "@/lib/mongodb";

/**
 * Shared helpers for the CMS data layer. Mirrors `src/lib/seo-product/db.ts` /
 * `src/lib/playbook-ai/db.ts`: string UUID `_id`s, audit stamps, and atomically
 * incremented counters.
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

/**
 * Cache tag for every public-site CMS read (pages, nav, footer, theme,
 * forms, settings) — lives here (not in `public.ts`) so both `public.ts`
 * and `theme.ts` can import it without a circular dependency between them
 * (`public.ts` needs `theme.ts`'s `getActiveThemeKey`; `theme.ts` needs this
 * tag for its own `revalidateTag`/`unstable_cache` calls).
 */
export const CMS_SITE_TAG = "cms-site";

/**
 * Expire every public-site CMS read immediately after a write. Not
 * `revalidateTag(tag, "max")`: that is stale-while-revalidate, so the first
 * visitor after a publish/activate would still get the old site (verified —
 * the live page lagged exactly one write behind). `{ expire: 0 }` rather than
 * `updateTag` because it also works outside Server Actions.
 */
export function expireSiteCache(): void {
  revalidateTag(CMS_SITE_TAG, { expire: 0 });
}

export const COLLECTIONS = {
  pages: "cms_pages",
  pageVersions: "cms_page_versions",
  media: "cms_media",
  nav: "cms_nav",
  footer: "cms_footer",
  forms: "cms_forms",
  theme: "cms_theme",
  settings: "cms_settings",
  sessions: "cms_sessions",
  audit: "cms_audit",
  counters: "cms_counters",
} as const;

export async function cmsCollection<T extends { _id: string }>(name: string) {
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

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "1.0" -> "1.1" | "2.0" depending on bump kind. Mirrors `src/lib/playbook-ai/content.ts`'s `nextVersion`. */
export function nextVersion(current: string | null, kind: "major" | "minor" = "minor"): string {
  const [maj, min] = (current ?? "0.0").split(".").map((n) => Number(n) || 0);
  if (kind === "major") return `${maj + 1}.0`;
  return current ? `${maj}.${min + 1}` : "1.0";
}
