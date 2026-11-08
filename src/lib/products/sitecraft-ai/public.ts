import "server-only";
import { companyCache } from "@/lib/platform/tenancy/cache";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, CMS_SITE_TAG } from "@/lib/products/sitecraft-ai/db";
import type { PageSection } from "@/lib/products/sitecraft-ai/section-registry";
import { parsePageFrame, type PageSeo, type PageJsonLd, type PageFrame } from "@/lib/products/sitecraft-ai/page-seo";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { getRenderThemeKey } from "@/lib/products/sitecraft-ai/theme-preview";

/**
 * The public website's read path into the CMS — the ONLY source of page
 * content. One cached query tagged `CMS_SITE_TAG`, so pages stay statically
 * rendered and a publish only needs `expireSiteCache()` (db.ts) to reach the
 * live site.
 *
 * There is no code fallback: a path that isn't published in the CMS is a 404.
 * If the database is unreachable the read throws, and Next.js keeps serving
 * the last successfully rendered version of the page (ISR) rather than
 * rendering empty or stale built-in content.
 */

interface CmsPageDoc {
  _id: string;
  path: string;
  title: string;
  status: "draft" | "published" | "archived";
  live: { sections: PageSection[]; seo?: PageSeo | null; jsonLd?: PageJsonLd[]; frame?: PageFrame } | null;
  themeVariants?: Record<string, { sections: PageSection[] }>;
}

interface PublishedPage {
  title: string;
  sections: PageSection[];
  seo: PageSeo | null;
  jsonLd: PageJsonLd[];
  frame: PageFrame;
  themeVariants: Record<string, PageSection[]>;
}

async function loadPublishedPages(): Promise<Record<string, PublishedPage>> {
  const db = await getDb();
  const pages = await db
    .collection<CmsPageDoc>(COLLECTIONS.pages)
    .find({ status: "published", live: { $ne: null } }, { projection: { path: 1, title: 1, live: 1, themeVariants: 1 } })
    .toArray();
  const out: Record<string, PublishedPage> = {};
  for (const p of pages) {
    if (!p.live?.sections) continue;
    out[p.path] = {
      title: p.title,
      sections: p.live.sections,
      seo: p.live.seo ?? null,
      jsonLd: p.live.jsonLd ?? [],
      frame: parsePageFrame(p.live.frame),
      themeVariants: Object.fromEntries(Object.entries(p.themeVariants ?? {}).map(([key, v]) => [key, v.sections])),
    };
  }
  return out;
}

const cachedPublishedPages = companyCache(loadPublishedPages, ["cms-published-pages-v3"], { tags: [CMS_SITE_TAG], revalidate: 3600 });

export interface PublicPage {
  path: string;
  title: string;
  sections: PageSection[];
  seo: PageSeo | null;
  jsonLd: PageJsonLd[];
  frame: PageFrame;
  themeKey: string;
}

/**
 * The published page at `path`, or null if there is none. When the active
 * theme defines its own arrangement for this page, those sections are
 * returned instead (the page's SEO is the same in every theme).
 */
export async function getPublicPage(path: string): Promise<PublicPage | null> {
  const [pages, themeKey, owner] = await Promise.all([cachedPublishedPages(), getRenderThemeKey(), isPlatformOwnerContext()]);
  const page = pages[path];
  if (!page) return null;
  // A company's content is the same in every theme: switching theme changes colours and layout only. Per-theme page
  // arrangements (`themeVariants`) are the platform operator's own site feature.
  const variant = owner && themeKey !== "default" ? page.themeVariants[themeKey] : undefined;
  return {
    path,
    title: page.title,
    sections: variant?.length ? variant : page.sections,
    seo: page.seo,
    jsonLd: page.jsonLd,
    frame: page.frame,
    themeKey,
  };
}

/** Every published page path (sitemap, static generation, knowledge-base crawl list). */
export async function listPublishedPaths(): Promise<string[]> {
  return Object.keys(await cachedPublishedPages()).sort();
}
