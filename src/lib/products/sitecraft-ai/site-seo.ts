import "server-only";
import type { Metadata } from "next";
import { companyCache } from "@/lib/platform/tenancy/cache";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, CMS_SITE_TAG, expireSiteCache, updateStamp } from "@/lib/products/sitecraft-ai/db";

/**
 * Site-wide SEO defaults (CMS → Settings): the root metadata every page
 * inherits (default title/description, keywords, author/publisher, robots,
 * Open Graph/Twitter defaults) and the site-wide JSON-LD blocks
 * (Organization, local business, WebSite). Stored on the `cms_settings` doc
 * as `siteSeo`, seeded from `cms-seed/site-seo.json`. Deployment config — the
 * site URL (`metadataBase`) and the search-console verification token (env) —
 * stays in code.
 */
export interface SiteSeo {
  /** Next.js `Metadata` fields, as JSON. */
  metadata: Record<string, unknown>;
  jsonLd: Record<string, unknown>[];
}

const EMPTY: SiteSeo = { metadata: {}, jsonLd: [] };

export function parseSiteSeo(raw: unknown): SiteSeo {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const metadata = r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata) ? (r.metadata as Record<string, unknown>) : {};
  const jsonLd = Array.isArray(r.jsonLd) ? r.jsonLd.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x)) : [];
  return { metadata, jsonLd };
}

async function col() {
  const db = await getDb();
  return db.collection<{ _id: string; siteSeo?: unknown }>(COLLECTIONS.settings);
}

export async function getSiteSeoForEdit(): Promise<SiteSeo> {
  const doc = await (await col()).findOne({ _id: "default" }, { projection: { siteSeo: 1 } });
  return doc?.siteSeo ? parseSiteSeo(doc.siteSeo) : EMPTY;
}

const cached = companyCache(getSiteSeoForEdit, ["cms-site-seo-v1"], { tags: [CMS_SITE_TAG], revalidate: 300 });

/** Public read. If the CMS is unreachable this throws, and Next.js keeps serving the last good render. */
export async function getSiteSeo(): Promise<SiteSeo> {
  return cached();
}

export async function saveSiteSeo(value: unknown, actorId: string): Promise<SiteSeo> {
  const clean = parseSiteSeo(value);
  await (await col()).updateOne({ _id: "default" }, { $set: { siteSeo: clean, ...updateStamp(actorId) } }, { upsert: true });
  expireSiteCache();
  return clean;
}

/** The root layout's metadata: the CMS defaults plus the deployment config. */
export function siteMetadata(seo: SiteSeo, base: Pick<Metadata, "metadataBase" | "verification">): Metadata {
  return { ...base, ...(seo.metadata as Metadata) };
}
