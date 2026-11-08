import "server-only";
import type { Metadata } from "next";
import { companyCache } from "@/lib/platform/tenancy/cache";
import { getDb } from "@/lib/mongodb";
import { unstable_rethrow } from "next/navigation";

/**
 * The public website's read path into the SEO product. Everything the site
 * needs (per-page metadata overrides, sitemap inclusion/priority, the managed
 * robots.txt, published JSON-LD) is loaded in ONE cached query tagged
 * `SEO_SITE_TAG`, so pages stay statically rendered and a product edit only
 * has to `revalidateTag(SEO_SITE_TAG)` to reach the live site.
 *
 * Every reader fails soft: if the database is unreachable the site renders
 * exactly what its own code defines, as it did before the SEO product existed.
 */

export const SEO_SITE_TAG = "seo-site";

export interface PageOverride {
  title?: string;
  description?: string;
  canonical?: string;
  robots?: { index: boolean; follow: boolean };
  keywords?: string[];
  og?: { title?: string; description?: string; image?: string };
  twitter?: { title?: string; description?: string; image?: string };
}

export interface SitemapOverride {
  exclude?: boolean;
  priority?: number;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
}

export interface PublishedSchema {
  /** Site path, or "*" for every public page. */
  path: string;
  json: string;
}

export interface SeoSiteState {
  overrides: Record<string, PageOverride>;
  sitemap: Record<string, SitemapOverride>;
  robotsTxt: string | null;
  schemas: PublishedSchema[];
}

const EMPTY: SeoSiteState = { overrides: {}, sitemap: {}, robotsTxt: null, schemas: [] };

async function loadSiteState(): Promise<SeoSiteState> {
  const db = await getDb();
  const [pages, robots, schemas] = await Promise.all([
    db
      .collection<{ _id: string; path: string; override?: PageOverride | null; sitemap?: SitemapOverride | null }>("seo_pages")
      .find({ $or: [{ override: { $ne: null } }, { sitemap: { $ne: null } }] }, { projection: { path: 1, override: 1, sitemap: 1 } })
      .toArray(),
    db.collection<{ _id: string; content?: string | null }>("seo_settings").findOne({ _id: "robots" }),
    db
      .collection<{ _id: string; path: string; jsonld: string; status: string }>("seo_schemas")
      .find({ status: "published" }, { projection: { path: 1, jsonld: 1 } })
      .toArray(),
  ]);
  const state: SeoSiteState = { overrides: {}, sitemap: {}, robotsTxt: robots?.content ?? null, schemas: [] };
  for (const p of pages) {
    if (p.override && Object.keys(p.override).length > 0) state.overrides[p.path] = p.override;
    if (p.sitemap && Object.keys(p.sitemap).length > 0) state.sitemap[p.path] = p.sitemap;
  }
  state.schemas = schemas.map((s) => ({ path: s.path, json: s.jsonld }));
  return state;
}

const cachedSiteState = companyCache(loadSiteState, ["seo-site-state-v1"], { tags: [SEO_SITE_TAG], revalidate: 3600 });

export async function getSeoSiteState(): Promise<SeoSiteState> {
  try {
    return await cachedSiteState();
  } catch (err) {
    unstable_rethrow(err);
    console.error("[seo] site state unavailable, using code-defined SEO", err);
    return EMPTY;
  }
}

/**
 * Wraps a page's code-defined metadata with any override managed in the SEO
 * product. Each public page exports
 *   `export const generateMetadata = () => withSeoOverrides("/path", baseMetadata);`
 * so the page's own metadata stays the default and the product only replaces
 * the fields it sets.
 */
export async function withSeoOverrides(path: string, base: Metadata): Promise<Metadata> {
  const { overrides } = await getSeoSiteState();
  const o = overrides[path];
  return o ? applyOverride(base, o) : base;
}

export function applyOverride(base: Metadata, o: PageOverride): Metadata {
  const out: Metadata = { ...base };
  if (o.title) out.title = { absolute: o.title };
  if (o.description) out.description = o.description;
  if (o.keywords && o.keywords.length > 0) out.keywords = o.keywords;
  if (o.canonical) out.alternates = { ...(base.alternates ?? {}), canonical: o.canonical };
  if (o.robots) {
    out.robots = {
      index: o.robots.index,
      follow: o.robots.follow,
      googleBot: { index: o.robots.index, follow: o.robots.follow },
    };
  }
  const ogTitle = o.og?.title || o.title;
  const ogDescription = o.og?.description || o.description;
  if (ogTitle || ogDescription || o.og?.image) {
    out.openGraph = {
      ...(base.openGraph ?? {}),
      ...(ogTitle ? { title: ogTitle } : {}),
      ...(ogDescription ? { description: ogDescription } : {}),
      ...(o.og?.image ? { images: [{ url: o.og.image, alt: ogTitle ?? undefined }] } : {}),
    };
  }
  const twTitle = o.twitter?.title || ogTitle;
  const twDescription = o.twitter?.description || ogDescription;
  const twImage = o.twitter?.image || o.og?.image;
  if (twTitle || twDescription || twImage) {
    out.twitter = {
      ...(base.twitter ?? {}),
      ...(twTitle ? { title: twTitle } : {}),
      ...(twDescription ? { description: twDescription } : {}),
      ...(twImage ? { images: [twImage] } : {}),
    };
  }
  return out;
}
