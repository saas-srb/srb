import "server-only";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { getServiceAccountToken } from "@/lib/google-service-account";
import { COLLECTIONS, addDaysIso, seoCollection, todayIso } from "@/lib/products/rankmax-ai/db";
import { getSettings, integrationEnv, markIntegrationSync } from "@/lib/products/rankmax-ai/settings";
import { keywordsCol, normalizeKeyword } from "@/lib/products/rankmax-ai/keywords";
import { recomputeKeywordPositions, upsertRank } from "@/lib/products/rankmax-ai/rankings";
import { mapLimit } from "@/lib/products/rankmax-ai/fetch";
import type { SitemapRecord } from "@/lib/products/rankmax-ai/sitemaps";
import type { SeoPage } from "@/lib/products/rankmax-ai/types";

/**
 * Google Search Console adapter (service account). Everything it stores is
 * VERIFIED first-party Google data: clicks, impressions, CTR and average
 * position per day / query / page, sitemap submission status and URL
 * Inspection index verdicts. The service account's email must be added as a
 * user on the Search Console property (Settings → Integrations shows it).
 */

const READ_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const WRITE_SCOPE = "https://www.googleapis.com/auth/webmasters";
const API = "https://www.googleapis.com/webmasters/v3";

/** Search Console reports countries as ISO 3166-1 alpha-3. */
const ALPHA3: Record<string, string> = { IN: "ind", US: "usa", GB: "gbr", AE: "are", CA: "can", AU: "aus", SG: "sgp", DE: "deu", FR: "fra", NL: "nld", SA: "sau", NZ: "nzl", IE: "irl", ZA: "zaf" };

export interface SearchDaily {
  _id: string;
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  fetchedAt: Date;
}

export interface SearchRow {
  _id: string;
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  from: string;
  to: string;
}

class GscError extends Error {}

async function token(write = false) {
  const env = await integrationEnv();
  if (!env.google) throw new GscError("Google service-account credentials are not configured (GOOGLE_SEO_CLIENT_EMAIL / GOOGLE_SEO_PRIVATE_KEY).");
  return getServiceAccountToken(env.google, [write ? WRITE_SCOPE : READ_SCOPE]);
}

async function gscFetch<T>(url: string, init: RequestInit = {}, write = false): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await token(write)}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    let msg = body.slice(0, 300);
    try {
      msg = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? msg;
    } catch {
      // not JSON
    }
    if (res.status === 403) msg += " — add the service account as a user on this Search Console property.";
    throw new GscError(`Search Console ${res.status}: ${msg}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

interface QueryRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

async function query(property: string, body: Record<string, unknown>): Promise<QueryRow[]> {
  const out: QueryRow[] = [];
  const pageSize = 25000;
  for (let startRow = 0; startRow < 100000; startRow += pageSize) {
    const res = await gscFetch<{ rows?: QueryRow[] }>(`${API}/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
      method: "POST",
      body: JSON.stringify({ ...body, rowLimit: pageSize, startRow }),
    });
    out.push(...(res.rows ?? []));
    if ((res.rows?.length ?? 0) < pageSize) break;
  }
  return out;
}

const pathOf = (u: string) => {
  try {
    const p = new URL(u).pathname || "/";
    return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
  } catch {
    return u;
  }
};

/** Tests access to the configured property. */
export async function testSearchConsole(): Promise<{ ok: boolean; message: string }> {
  try {
    const settings = await getSettings();
    const res = await gscFetch<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(`${API}/sites`);
    const entry = res.siteEntry?.find((s) => s.siteUrl === settings.integrations.gsc.property);
    if (!entry) {
      const available = (res.siteEntry ?? []).map((s) => s.siteUrl).join(", ") || "none";
      return { ok: false, message: `The service account can't see "${settings.integrations.gsc.property}". Properties it can access: ${available}.` };
    }
    return { ok: true, message: `Connected to ${entry.siteUrl} (${entry.permissionLevel}).` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
  }
}

/**
 * Full sync: 90 days of daily totals, 28 days of query×page rows, 30 days of
 * positions for tracked keywords, page-level 28-day metrics and sitemap
 * status. Search Console data lags ~2 days, so the window ends 2 days ago.
 */
export async function syncSearchConsole(): Promise<{ days: number; rows: number; keywordsUpdated: number; sitemaps: number }> {
  const settings = await getSettings();
  const property = settings.integrations.gsc.property;
  try {
    const end = addDaysIso(todayIso(), -2);
    const start90 = addDaysIso(end, -89);
    const start28 = addDaysIso(end, -27);

    // 1. Daily totals
    const daily = await query(property, { startDate: start90, endDate: end, dimensions: ["date"] });
    const dailyCol = await seoCollection<SearchDaily>(COLLECTIONS.searchDaily);
    for (const r of daily) {
      const date = r.keys[0];
      await dailyCol.replaceOne({ _id: date }, { date, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position, fetchedAt: new Date() }, { upsert: true });
    }

    // 2. Query × page (28 days) — powers content, cannibalization and page metrics
    const qp = await query(property, { startDate: start28, endDate: end, dimensions: ["query", "page"] });
    const rowsCol = await seoCollection<SearchRow>(COLLECTIONS.searchRows);
    await rowsCol.deleteMany({});
    const docs = qp.map((r, i) => ({ _id: String(i), query: r.keys[0], page: pathOf(r.keys[1]), clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position, from: start28, to: end }));
    for (let i = 0; i < docs.length; i += 5000) await rowsCol.insertMany(docs.slice(i, i + 5000));

    // 3. Page-level metrics (impression-weighted position)
    const pages = await seoCollection<SeoPage>(COLLECTIONS.pages);
    const byPage = new Map<string, { clicks: number; impressions: number; posW: number }>();
    for (const d of docs) {
      const agg = byPage.get(d.page) ?? { clicks: 0, impressions: 0, posW: 0 };
      agg.clicks += d.clicks;
      agg.impressions += d.impressions;
      agg.posW += d.position * d.impressions;
      byPage.set(d.page, agg);
    }
    await pages.updateMany({}, { $set: { search: null } });
    for (const [path, a] of byPage) {
      await pages.updateOne(
        { path },
        { $set: { search: { clicks: a.clicks, impressions: a.impressions, ctr: a.impressions ? a.clicks / a.impressions : 0, position: a.impressions ? a.posW / a.impressions : 0, from: start28, to: end } } }
      );
    }

    // 4. Tracked keyword positions per day (verified averages)
    const keywords = await (await keywordsCol()).find({ status: "tracking" }).toArray();
    const start30 = addDaysIso(end, -29);
    const kwRows = await query(property, { startDate: start30, endDate: end, dimensions: ["date", "query", "device", "country", "page"] });
    const touched = new Set<string>();
    for (const k of keywords) {
      const country = ALPHA3[k.country];
      const matching = kwRows.filter((r) => normalizeKeyword(r.keys[1]) === k.normalized && r.keys[2].toLowerCase() === (k.device === "mobile" ? "mobile" : "desktop") && (!country || r.keys[3] === country));
      const byDate = new Map<string, { impressions: number; clicks: number; posW: number; topPage: { page: string; impressions: number } }>();
      for (const r of matching) {
        const d = byDate.get(r.keys[0]) ?? { impressions: 0, clicks: 0, posW: 0, topPage: { page: "", impressions: -1 } };
        d.impressions += r.impressions;
        d.clicks += r.clicks;
        d.posW += r.position * r.impressions;
        if (r.impressions > d.topPage.impressions) d.topPage = { page: pathOf(r.keys[4]), impressions: r.impressions };
        byDate.set(r.keys[0], d);
      }
      for (const [date, d] of byDate) {
        await upsertRank({ keywordId: k._id, date, position: d.impressions ? Math.round((d.posW / d.impressions) * 10) / 10 : null, url: d.topPage.page || null, source: "gsc", impressions: d.impressions, clicks: d.clicks });
      }
      if (byDate.size > 0) touched.add(k._id);
    }
    await recomputeKeywordPositions(Array.from(touched));

    // 5. Sitemaps as Search Console knows them
    const sm = await gscFetch<{ sitemap?: { path: string; lastSubmitted?: string; lastDownloaded?: string; isPending?: boolean; errors?: string; warnings?: string; contents?: { submitted?: string }[] }[] }>(
      `${API}/sites/${encodeURIComponent(property)}/sitemaps`
    );
    const smCol = await seoCollection<SitemapRecord>(COLLECTIONS.sitemaps);
    const local = await smCol.find({}).toArray();
    for (const s of sm.sitemap ?? []) {
      const match = local.find((l) => pathOf(l.url) === pathOf(s.path));
      const gsc = {
        lastSubmitted: s.lastSubmitted ?? null,
        lastDownloaded: s.lastDownloaded ?? null,
        isPending: !!s.isPending,
        errors: Number(s.errors ?? 0),
        warnings: Number(s.warnings ?? 0),
        submittedUrls: s.contents?.[0]?.submitted ? Number(s.contents[0].submitted) : null,
      };
      if (match) await smCol.updateOne({ _id: match._id }, { $set: { gsc } });
    }

    await markIntegrationSync("gsc", null);
    return { days: daily.length, rows: docs.length, keywordsUpdated: touched.size, sitemaps: sm.sitemap?.length ?? 0 };
  } catch (err) {
    await markIntegrationSync("gsc", err instanceof Error ? err.message : "Sync failed");
    throw err;
  }
}

/** URL Inspection API: Google's own index verdict for each page (quota 2,000/day per property). */
export async function inspectIndexStatus(paths: string[]): Promise<{ checked: number; indexed: number; errors: string[] }> {
  const [settings, siteUrl] = await Promise.all([getSettings(), companySiteUrl()]);
  const property = settings.integrations.gsc.property;
  const pages = await seoCollection<SeoPage>(COLLECTIONS.pages);
  const errors: string[] = [];
  let indexed = 0;
  const results = await mapLimit(paths.slice(0, 200), 3, async (path) => {
    try {
      const res = await gscFetch<{ inspectionResult?: { indexStatusResult?: { verdict?: string; coverageState?: string; lastCrawlTime?: string } } }>(
        "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
        { method: "POST", body: JSON.stringify({ inspectionUrl: `${siteUrl}${path === "/" ? "/" : path}`, siteUrl: property }) }
      );
      const r = res.inspectionResult?.indexStatusResult;
      const status = { verdict: r?.verdict ?? "VERDICT_UNSPECIFIED", coverageState: r?.coverageState ?? null, lastCrawlTime: r?.lastCrawlTime ?? null, checkedAt: new Date() };
      if (status.verdict === "PASS") indexed++;
      await pages.updateOne({ path }, { $set: { indexStatus: status } });
      return true;
    } catch (err) {
      if (errors.length < 5) errors.push(`${path}: ${err instanceof Error ? err.message : "failed"}`);
      return false;
    }
  });
  return { checked: results.filter(Boolean).length, indexed, errors };
}

/** Submits (or re-submits) a sitemap to Search Console. Needs the full webmasters scope. */
export async function submitSitemap(sitemapUrl: string): Promise<void> {
  const [settings, siteUrl] = await Promise.all([getSettings(), companySiteUrl()]);
  const property = settings.integrations.gsc.property;
  const prod = `${siteUrl}${new URL(sitemapUrl).pathname}`;
  await gscFetch(`${API}/sites/${encodeURIComponent(property)}/sitemaps/${encodeURIComponent(prod)}`, { method: "PUT" }, true);
}

export async function searchDaily(days = 90): Promise<SearchDaily[]> {
  const col = await seoCollection<SearchDaily>(COLLECTIONS.searchDaily);
  return col.find({ date: { $gte: addDaysIso(todayIso(), -days - 2) } }).sort({ date: 1 }).toArray();
}

export async function topQueries(limit = 50, path?: string): Promise<{ query: string; clicks: number; impressions: number; ctr: number; position: number; pages: number }[]> {
  const col = await seoCollection<SearchRow>(COLLECTIONS.searchRows);
  return col
    .aggregate<{ query: string; clicks: number; impressions: number; ctr: number; position: number; pages: number }>([
      ...(path ? [{ $match: { page: path } }] : []),
      { $group: { _id: "$query", clicks: { $sum: "$clicks" }, impressions: { $sum: "$impressions" }, posW: { $sum: { $multiply: ["$position", "$impressions"] } }, pages: { $addToSet: "$page" } } },
      { $project: { _id: 0, query: "$_id", clicks: 1, impressions: 1, ctr: { $cond: [{ $gt: ["$impressions", 0] }, { $divide: ["$clicks", "$impressions"] }, 0] }, position: { $cond: [{ $gt: ["$impressions", 0] }, { $divide: ["$posW", "$impressions"] }, 0] }, pages: { $size: "$pages" } } },
      { $sort: { impressions: -1 } },
      { $limit: limit },
    ])
    .toArray();
}
