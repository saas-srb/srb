import "server-only";
import * as cheerio from "cheerio";
import { COLLECTIONS, seoCollection } from "@/lib/products/rankmax-ai/db";
import { fetchUrl } from "@/lib/products/rankmax-ai/fetch";
import { parseRobots } from "@/lib/products/rankmax-ai/robots-parse";

/**
 * Sitemap discovery + validation. Sitemaps are found from robots.txt
 * `Sitemap:` lines, the conventional locations, and recursively through
 * sitemap indexes; each file is checked against the sitemaps.org protocol
 * limits. The crawler reuses the discovered URL list as its seed set.
 */

export interface SitemapRecord {
  _id: string;
  url: string;
  kind: "index" | "urlset" | "invalid";
  parent: string | null;
  discoveredVia: "robots" | "default" | "index" | "manual";
  status: number;
  urlCount: number;
  childCount: number;
  bytes: number;
  errors: string[];
  warnings: string[];
  lastFetchedAt: Date;
  /** From Search Console, when connected. */
  gsc: { lastSubmitted: string | null; lastDownloaded: string | null; isPending: boolean; errors: number; warnings: number; submittedUrls: number | null } | null;
}

export interface SitemapDiscovery {
  records: SitemapRecord[];
  /** Every <loc> across all url sets, absolute. */
  urls: { loc: string; lastmod: string | null; sitemap: string }[];
}

const LASTMOD_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

/** Maps a URL listed on the production host onto the origin being audited (so staging/local audits work). */
export function toOrigin(u: string, origin: string): string {
  try {
    const parsed = new URL(u);
    return `${origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return u;
  }
}

export async function discoverSitemaps(origin: string, opts: { primaryHost: string; extra?: string[]; guard?: boolean } = { primaryHost: "" }): Promise<SitemapDiscovery> {
  const guard = !!opts.guard;
  const queue: { url: string; via: SitemapRecord["discoveredVia"]; parent: string | null }[] = [];
  const robots = await fetchUrl(`${origin}/robots.txt`, { timeoutMs: 10000, guard });
  if (robots.status === 200 && robots.body) {
    for (const s of parseRobots(robots.body).sitemaps) queue.push({ url: toOrigin(s, origin), via: "robots", parent: null });
  }
  for (const extra of opts.extra ?? []) queue.push({ url: toOrigin(extra, origin), via: "manual", parent: null });
  if (!queue.some((q) => new URL(q.url).pathname === "/sitemap.xml")) queue.push({ url: `${origin}/sitemap.xml`, via: "default", parent: null });

  const records: SitemapRecord[] = [];
  const urls: SitemapDiscovery["urls"] = [];
  const seen = new Set<string>();

  while (queue.length > 0 && records.length < 60) {
    const item = queue.shift()!;
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    const res = await fetchUrl(item.url, { timeoutMs: 20000, guard });
    const errors: string[] = [];
    const warnings: string[] = [];
    let kind: SitemapRecord["kind"] = "invalid";
    let urlCount = 0;
    let childCount = 0;

    if (res.error) errors.push(res.error);
    else if (res.status !== 200) errors.push(`HTTP ${res.status}`);
    if (res.chain.length > 0) warnings.push(`Redirects (${res.chain.map((c) => c.status).join(" → ")}) — reference the final sitemap URL directly.`);
    if (res.body && res.status === 200) {
      if (res.contentType && !/xml/.test(res.contentType)) warnings.push(`Served as "${res.contentType}" rather than XML.`);
      if (res.bytes > 50 * 1024 * 1024) errors.push("Larger than the 50 MB uncompressed limit.");
      const $ = cheerio.load(res.body, { xml: true });
      if ($("sitemapindex").length > 0) {
        kind = "index";
        $("sitemapindex > sitemap > loc").each((_, el) => {
          const loc = $(el).text().trim();
          childCount++;
          try {
            new URL(loc);
            queue.push({ url: toOrigin(loc, origin), via: "index", parent: item.url });
          } catch {
            errors.push(`Invalid child sitemap URL: ${loc.slice(0, 120)}`);
          }
        });
        if (childCount === 0) warnings.push("Sitemap index lists no sitemaps.");
      } else if ($("urlset").length > 0) {
        kind = "urlset";
        const locs = new Set<string>();
        let badLastmod = 0;
        let otherHost = 0;
        $("urlset > url").each((_, el) => {
          const loc = $(el).find("loc").first().text().trim();
          const lastmod = $(el).find("lastmod").first().text().trim() || null;
          if (!loc) {
            errors.push("A <url> entry has no <loc>.");
            return;
          }
          try {
            const u = new URL(loc);
            if (opts.primaryHost && u.host !== opts.primaryHost) otherHost++;
          } catch {
            errors.push(`Relative or invalid <loc>: ${loc.slice(0, 120)}`);
            return;
          }
          if (lastmod && !LASTMOD_RE.test(lastmod)) badLastmod++;
          if (locs.has(loc)) warnings.push(`Duplicate URL: ${loc.slice(0, 120)}`);
          locs.add(loc);
          urls.push({ loc, lastmod, sitemap: item.url });
        });
        urlCount = locs.size;
        if (urlCount > 50000) errors.push(`${urlCount} URLs — over the 50,000 per-file limit.`);
        if (urlCount === 0) warnings.push("The sitemap lists no URLs.");
        if (badLastmod > 0) warnings.push(`${badLastmod} <lastmod> value(s) are not W3C datetime format.`);
        if (otherHost > 0) warnings.push(`${otherHost} URL(s) use a host other than "${opts.primaryHost}".`);
      } else {
        errors.push("Not a sitemap: no <urlset> or <sitemapindex> root element.");
      }
    }

    records.push({
      _id: item.url,
      url: item.url,
      kind,
      parent: item.parent,
      discoveredVia: item.via,
      status: res.status,
      urlCount,
      childCount,
      bytes: res.bytes,
      errors: Array.from(new Set(errors)).slice(0, 50),
      warnings: Array.from(new Set(warnings)).slice(0, 50),
      lastFetchedAt: new Date(),
      gsc: null,
    });
  }
  return { records, urls };
}

/** Replaces the stored sitemap records, keeping any Search Console data already attached. */
export async function saveSitemapRecords(records: SitemapRecord[]): Promise<void> {
  const col = await seoCollection<SitemapRecord>(COLLECTIONS.sitemaps);
  const existing = new Map((await col.find({}).toArray()).map((r) => [r._id, r]));
  await col.deleteMany({ _id: { $nin: records.map((r) => r._id) }, discoveredVia: { $ne: "manual" } });
  for (const r of records) {
    await col.replaceOne({ _id: r._id }, { ...r, gsc: existing.get(r._id)?.gsc ?? null }, { upsert: true });
  }
}

export async function listSitemapRecords(): Promise<SitemapRecord[]> {
  const col = await seoCollection<SitemapRecord>(COLLECTIONS.sitemaps);
  return col.find({}).sort({ parent: 1, url: 1 }).toArray();
}
