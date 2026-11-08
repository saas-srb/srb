import "server-only";
import type { Filter } from "mongodb";
import { revalidatePath, revalidateTag } from "next/cache";
import { COLLECTIONS, escapeRegex, newId, seoCollection } from "@/lib/products/rankmax-ai/db";
import { SEO_SITE_TAG, type PageOverride, type SitemapOverride } from "@/lib/products/rankmax-ai/public";
import { SeoInputError } from "@/lib/products/rankmax-ai/viewer";
import { EMPTY_COUNTS, type SeoPage } from "@/lib/products/rankmax-ai/types";

/**
 * Page inventory + the per-page SEO settings the public site reads (metadata
 * overrides, sitemap inclusion/priority, focus keywords). Pages are created
 * by the crawler; staff can also register a path manually so it is audited.
 */

let indexesEnsured = false;
export async function pagesCol() {
  const c = await seoCollection<SeoPage>(COLLECTIONS.pages);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await c.createIndex({ path: 1 }, { unique: true }).catch(() => {});
  }
  return c;
}

/** Makes an edit visible on the live site: the SEO tag for layout/sitemap/robots, plus the page itself. */
export function invalidateSite(path?: string) {
  revalidateTag(SEO_SITE_TAG, "max");
  if (path) revalidatePath(path);
}

export function cleanPath(v: string): string | null {
  const s = v.trim();
  if (!s.startsWith("/") || s.startsWith("//") || /\s/.test(s) || s.length > 500) return null;
  try {
    const u = new URL(s, "https://x.invalid");
    let p = u.pathname;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return `${p}${u.search}`;
  } catch {
    return null;
  }
}

export interface PageListOptions {
  search?: string;
  status?: string;
  indexable?: string;
  sitemap?: string;
  score?: string;
  overridden?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
}

export async function listPages(o: PageListOptions) {
  const c = await pagesCol();
  const f: Filter<SeoPage> = {};
  if (o.search) {
    const rx = new RegExp(escapeRegex(o.search), "i");
    f.$or = [{ path: rx }, { "crawl.title": rx }, { focusKeyword: rx }];
  }
  if (o.status === "ok") f["crawl.status"] = 200;
  else if (o.status === "redirect") f["crawl.redirectChain.0"] = { $exists: true };
  else if (o.status === "error") f["crawl.status"] = { $not: { $in: [200, 301, 302, 307, 308] } };
  if (o.indexable === "yes") f["crawl.indexable"] = true;
  else if (o.indexable === "no") f["crawl.indexable"] = false;
  if (o.sitemap === "in") f.inSitemap = true;
  else if (o.sitemap === "out") f.inSitemap = false;
  else if (o.sitemap === "excluded") f["sitemap.exclude"] = true;
  if (o.score === "poor") f["scores.overall"] = { $lt: 50 };
  else if (o.score === "fair") f["scores.overall"] = { $gte: 50, $lt: 80 };
  else if (o.score === "good") f["scores.overall"] = { $gte: 80 };
  else if (o.score === "needs") f["scores.overall"] = { $lt: 80 };
  if (o.overridden === "yes") f.override = { $ne: null };
  const sortField: Record<string, string> = {
    path: "path",
    score: "scores.overall",
    onPage: "scores.onPage",
    technical: "scores.technical",
    content: "scores.content",
    words: "crawl.wordCount",
    linksIn: "crawl.linksIn",
    responseMs: "crawl.responseMs",
    clicks: "search.clicks",
    crawled: "lastCrawledAt",
  };
  const sortBy = sortField[o.sortBy ?? ""] ?? "path";
  const dir = o.sortDir === "desc" ? -1 : 1;
  const page = Math.max(o.page ?? 1, 1);
  const pageSize = Math.min(Math.max(o.pageSize ?? 30, 1), 500);
  const [items, total] = await Promise.all([
    c.find(f).sort({ [sortBy]: dir, path: 1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    c.countDocuments(f),
  ]);
  return { items, total, page, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function allPages(): Promise<SeoPage[]> {
  return (await pagesCol()).find({}).sort({ path: 1 }).toArray();
}

export async function getPage(id: string): Promise<SeoPage | null> {
  return (await pagesCol()).findOne({ _id: id });
}

export async function getPageByPath(path: string): Promise<SeoPage | null> {
  return (await pagesCol()).findOne({ path });
}

export async function getPageText(path: string): Promise<string> {
  const c = await seoCollection<{ _id: string; text: string }>(COLLECTIONS.pageContent);
  return (await c.findOne({ _id: path }))?.text ?? "";
}

export async function addManualPage(path: string, actorId: string): Promise<SeoPage> {
  const clean = cleanPath(path);
  if (!clean) throw new SeoInputError("Enter a site path starting with “/”, e.g. /services/web-development.");
  const c = await pagesCol();
  if (await c.findOne({ path: clean })) throw new SeoInputError("That page is already in the inventory.");
  const now = new Date();
  const doc: SeoPage = {
    _id: newId(),
    path: clean,
    source: "manual",
    inSitemap: false,
    lastCrawledAt: null,
    crawl: null,
    scores: null,
    issueCounts: { ...EMPTY_COUNTS },
    focusKeyword: "",
    secondaryKeywords: [],
    override: null,
    sitemap: null,
    performance: null,
    indexStatus: null,
    search: null,
    notes: "",
    createdAt: now,
    updatedAt: now,
    createdBy: actorId,
    updatedBy: actorId,
  };
  await c.insertOne(doc);
  return doc;
}

const URLISH = /^(https?:\/\/[^\s]+|\/[^\s]*)$/;

function cleanText(v: unknown, max: number, label: string): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  if (s.length > max) throw new SeoInputError(`${label} is longer than ${max} characters.`);
  return s;
}

function cleanUrlish(v: unknown, label: string): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const s = v.trim();
  if (!URLISH.test(s) || s.length > 1000) throw new SeoInputError(`${label} must be an absolute http(s) URL or a site path starting with “/”.`);
  return s;
}

/** Validates an override from the editor. Empty fields are dropped so the page's own code-defined value applies. */
export function cleanOverride(input: Record<string, unknown>): PageOverride | null {
  const o: PageOverride = {};
  const title = cleanText(input.title, 120, "SEO title");
  const description = cleanText(input.description, 320, "Meta description");
  const canonical = cleanUrlish(input.canonical, "Canonical URL");
  if (title) o.title = title;
  if (description) o.description = description;
  if (canonical) o.canonical = canonical;
  const robots = String(input.robots ?? "");
  if (robots) {
    const [index, follow] = robots.split(",");
    o.robots = { index: index === "index", follow: follow === "follow" };
  }
  const keywords = String(input.keywords ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (keywords.length) o.keywords = keywords;
  const og = {
    title: cleanText(input.ogTitle, 120, "Open Graph title"),
    description: cleanText(input.ogDescription, 320, "Open Graph description"),
    image: cleanUrlish(input.ogImage, "Open Graph image"),
  };
  if (og.title || og.description || og.image) o.og = Object.fromEntries(Object.entries(og).filter(([, v]) => v));
  const tw = {
    title: cleanText(input.twitterTitle, 120, "Twitter title"),
    description: cleanText(input.twitterDescription, 320, "Twitter description"),
    image: cleanUrlish(input.twitterImage, "Twitter image"),
  };
  if (tw.title || tw.description || tw.image) o.twitter = Object.fromEntries(Object.entries(tw).filter(([, v]) => v));
  return Object.keys(o).length ? o : null;
}

export function cleanSitemapOverride(input: Record<string, unknown>): SitemapOverride | null {
  const o: SitemapOverride = {};
  if (input.exclude === true) o.exclude = true;
  const p = input.priority === "" || input.priority === undefined || input.priority === null ? null : Number(input.priority);
  if (p !== null) {
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new SeoInputError("Sitemap priority must be between 0.0 and 1.0.");
    o.priority = Math.round(p * 10) / 10;
  }
  const freq = String(input.changeFrequency ?? "");
  if (freq) {
    if (!["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"].includes(freq)) throw new SeoInputError("Unknown change frequency.");
    o.changeFrequency = freq as SitemapOverride["changeFrequency"];
  }
  return Object.keys(o).length ? o : null;
}

export async function savePageSeo(
  id: string,
  patch: { override?: PageOverride | null; sitemap?: SitemapOverride | null; focusKeyword?: string; secondaryKeywords?: string[]; notes?: string },
  actorId: string
): Promise<{ before: SeoPage; after: SeoPage }> {
  const c = await pagesCol();
  const before = await c.findOne({ _id: id });
  if (!before) throw new SeoInputError("Page not found.");
  const set = { ...patch, updatedAt: new Date(), updatedBy: actorId };
  await c.updateOne({ _id: id }, { $set: set });
  const after = { ...before, ...set };
  if ("override" in patch || "sitemap" in patch) invalidateSite(before.path);
  return { before, after };
}

export async function deletePage(id: string): Promise<SeoPage | null> {
  const c = await pagesCol();
  const page = await c.findOne({ _id: id });
  if (!page) return null;
  await c.deleteOne({ _id: id });
  const content = await seoCollection<{ _id: string }>(COLLECTIONS.pageContent);
  await content.deleteOne({ _id: page.path });
  if (page.override || page.sitemap) invalidateSite(page.path);
  return page;
}
