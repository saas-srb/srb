import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS as DB, expireSiteCache, updateStamp } from "@/lib/products/sitecraft-ai/db";
import { COLLECTIONS } from "@/lib/products/sitecraft-ai/collections/registry";
import type { CollectionKey } from "@/lib/products/sitecraft-ai/collections/types";
import { createPage, publishPage, type CmsPageDoc, type PageContent } from "@/lib/products/sitecraft-ai/pages";
import type { PageSection } from "@/lib/products/sitecraft-ai/section-registry";

/**
 * Records with their own page (blog posts, jobs, engagement models): the
 * page is an ordinary CMS page at the record's path. These keep the two in
 * step — without any template in code.
 */

async function pagesCol() {
  const db = await getDb();
  return db.collection<CmsPageDoc>(DB.pages);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces string values equal to `from` with `to`, and occurrences of `fromTitle` inside strings with `toTitle`. */
function rebind(value: unknown, from: string, to: string, fromTitle: string, toTitle: string): unknown {
  if (typeof value === "string") {
    if (value === from) return to;
    return fromTitle ? value.split(fromTitle).join(toTitle) : value;
  }
  if (Array.isArray(value)) return value.map((v) => rebind(v, from, to, fromTitle, toTitle));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rebind(v, from, to, fromTitle, toTitle)]));
  }
  return value;
}

/**
 * Makes sure a published record has a published page. A new record's page is
 * cloned from the most recently published sibling page (same collection):
 * its layout, page text, SEO and structured data, with the sibling's slug and
 * title swapped for the new record's and any article body emptied. Returns
 * true when a page was created (the editor should then review its SEO).
 */
export async function ensureRecordPage(key: CollectionKey, slug: string, title: string, actorId: string): Promise<boolean> {
  const def = COLLECTIONS[key];
  if (!def.pathOf) return false;
  const path = def.pathOf(slug);
  const pages = await pagesCol();
  if (await pages.findOne({ path })) return false;

  const base = def.pathOf("__slug__").replace("__slug__", "");
  const sibling = await pages.findOne(
    { path: { $regex: `^${escape(base)}[^/]+$` }, status: "published", live: { $ne: null } },
    { sort: { publishedAt: -1 } }
  );
  let content: PageContent = { sections: [], seo: null, jsonLd: [], frame: "default" };
  if (sibling?.live) {
    const siblingSlug = sibling.path.slice(base.length);
    const db = await getDb();
    const siblingRecord = await db.collection<{ collection: string; slug: string; live: Record<string, unknown> | null }>("cms_records").findOne({ collection: key, slug: siblingSlug });
    const parsed = siblingRecord?.live ? def.parse(siblingRecord.live) : null;
    const siblingTitle = parsed ? def.titleOf(parsed) : "";
    content = rebind(sibling.live, siblingSlug, slug, siblingTitle, title) as PageContent;
    content.sections = content.sections.map((s: PageSection) => (s.type === "article-body" ? { ...s, config: { ...s.config, blocks: [] } } : s));
  }
  if (!content.sections.length) return false; // nothing to model the page on — the editor creates it in Pages

  const created = await createPage({ path, title, templateKey: `record:${key}`, ...content }, actorId);
  if (!created.ok) return false;
  const published = await publishPage(created.id, actorId, `Created with ${def.singular.toLowerCase()} "${title}"`);
  return published.ok;
}

/** Archives (or restores) the page at `path` along with its record. */
export async function setPageArchived(path: string, archived: boolean, actorId: string): Promise<void> {
  const pages = await pagesCol();
  const page = await pages.findOne({ path });
  if (!page) return;
  const status = archived ? "archived" : page.live ? "published" : "draft";
  await pages.updateOne({ _id: page._id }, { $set: { status, ...updateStamp(actorId) } });
  expireSiteCache();
}
