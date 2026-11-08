import "server-only";
import type { Filter } from "mongodb";
import * as cheerio from "cheerio";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { COLLECTIONS, cleanIsoDate, createStamp, escapeRegex, newId, num, seoCollection, str, todayIso, updateStamp, type Stamps } from "@/lib/products/rankmax-ai/db";
import { assertPublicUrl, fetchUrl, mapLimit, UnsafeUrlError } from "@/lib/products/rankmax-ai/fetch";
import { getSettings } from "@/lib/products/rankmax-ai/settings";
import { parseCsv } from "@/lib/products/rankmax-ai/csv-parse";
import { SeoInputError } from "@/lib/products/rankmax-ai/viewer";
import type { SeoPage } from "@/lib/products/rankmax-ai/types";

/**
 * Backlinks pointing at the site. The list itself comes from people or from
 * a backlink tool's CSV export (third-party, so `source` + `domainRating` are
 * labelled estimates), but its STATUS is verified by us: `verifyBacklinks`
 * fetches each source page and checks the link is really there, whether it
 * is follow/nofollow, and whether our target page still works.
 *   live        — link found on the source page
 *   lost        — source page gone or the link was removed
 *   broken      — link is there but our target URL returns an error
 *   unverified  — not checked yet (or the source blocks crawlers)
 */

export const BACKLINK_STATUSES = ["live", "lost", "broken", "unverified"] as const;
export type BacklinkStatus = (typeof BACKLINK_STATUSES)[number];
export const RELS = ["follow", "nofollow", "ugc", "sponsored"] as const;
export type Rel = (typeof RELS)[number];

export interface Backlink extends Stamps {
  _id: string;
  sourceUrl: string;
  sourceDomain: string;
  /** Site path on our domain. */
  targetPath: string;
  anchor: string;
  rel: Rel;
  status: BacklinkStatus;
  firstSeen: string;
  lastSeenLiveAt: Date | null;
  lastCheckedAt: Date | null;
  lostAt: Date | null;
  checkNote: string | null;
  /** Third-party authority metric (0–100), when supplied. */
  domainRating: number | null;
  source: string;
  notes: string;
}

const bare = (h: string) => h.toLowerCase().replace(/^www\./, "");

/** The current company's own site — resolved per call (never at import time), since every company has its own. */
interface OurSite {
  siteUrl: string;
  host: string;
}
async function ourSite(): Promise<OurSite> {
  const siteUrl = await companySiteUrl();
  return { siteUrl, host: bare(new URL(siteUrl).host) };
}

let indexesEnsured = false;
export async function backlinksCol() {
  const c = await seoCollection<Backlink>(COLLECTIONS.backlinks);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await c.createIndex({ sourceUrl: 1, targetPath: 1 }, { unique: true }).catch(() => {});
    await c.createIndex({ sourceDomain: 1 }).catch(() => {});
  }
  return c;
}

function toTargetPath(v: string, ours: OurSite): string {
  const s = v.trim();
  if (!s) return "/";
  try {
    const u = new URL(s, ours.siteUrl);
    if (bare(u.host) !== ours.host) throw new SeoInputError(`Target "${s}" is not on ${ours.host}.`);
    const p = u.pathname.length > 1 && u.pathname.endsWith("/") ? u.pathname.slice(0, -1) : u.pathname;
    return p || "/";
  } catch (err) {
    if (err instanceof SeoInputError) throw err;
    throw new SeoInputError(`Target "${s}" is not a valid URL or path.`);
  }
}

function toSource(v: string, ours: OurSite): { url: string; domain: string } {
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    if (bare(u.host) === ours.host) throw new SeoInputError("The source must be another website, not ours.");
    u.hash = "";
    return { url: u.toString(), domain: bare(u.host) };
  } catch (err) {
    if (err instanceof SeoInputError) throw err;
    throw new SeoInputError(`Source "${v}" must be an absolute http(s) URL.`);
  }
}

const relOf = (v: unknown): Rel => {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("sponsored")) return "sponsored";
  if (s.includes("ugc")) return "ugc";
  if (s.includes("nofollow") || s === "false" || s === "no") return "nofollow";
  return "follow";
};

export async function createBacklink(input: { sourceUrl: string; targetUrl: string; anchor?: string; rel?: string; firstSeen?: string; domainRating?: unknown; notes?: string }, actorId: string): Promise<Backlink> {
  const ours = await ourSite();
  const { url, domain } = toSource(input.sourceUrl, ours);
  const targetPath = toTargetPath(input.targetUrl, ours);
  const c = await backlinksCol();
  if (await c.findOne({ sourceUrl: url, targetPath })) throw new SeoInputError("That backlink is already tracked.");
  const doc: Backlink = {
    _id: newId(),
    sourceUrl: url,
    sourceDomain: domain,
    targetPath,
    anchor: str(input.anchor, 300),
    rel: relOf(input.rel),
    status: "unverified",
    firstSeen: cleanIsoDate(input.firstSeen) ?? todayIso(),
    lastSeenLiveAt: null,
    lastCheckedAt: null,
    lostAt: null,
    checkNote: null,
    domainRating: num(input.domainRating, 0, 100),
    source: "manual",
    notes: str(input.notes, 2000),
    ...createStamp(actorId),
  };
  await c.insertOne(doc);
  return doc;
}

export async function updateBacklink(id: string, input: { anchor?: string; rel?: string; domainRating?: unknown; notes?: string; targetUrl?: string }, actorId: string) {
  const c = await backlinksCol();
  const before = await c.findOne({ _id: id });
  if (!before) throw new SeoInputError("Backlink not found.");
  const set = {
    anchor: str(input.anchor, 300),
    rel: relOf(input.rel),
    domainRating: num(input.domainRating, 0, 100),
    notes: str(input.notes, 2000),
    targetPath: input.targetUrl ? toTargetPath(input.targetUrl, await ourSite()) : before.targetPath,
    ...updateStamp(actorId),
  };
  await c.updateOne({ _id: id }, { $set: set });
  return { before, after: { ...before, ...set } };
}

export async function deleteBacklink(id: string): Promise<Backlink | null> {
  const c = await backlinksCol();
  const b = await c.findOne({ _id: id });
  if (b) await c.deleteOne({ _id: id });
  return b;
}

/**
 * CSV import from any backlink tool. Columns: source_url (or referring_page_url),
 * target_url, anchor, rel / nofollow, first_seen, domain_rating (dr / da).
 */
export async function importBacklinks(csv: string, source: string, actorId: string) {
  const { rows } = parseCsv(csv, 10000);
  if (rows.length === 0) throw new SeoInputError("The file has no data rows.");
  const [c, ours] = await Promise.all([backlinksCol(), ourSite()]);
  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  for (const [i, r] of rows.entries()) {
    try {
      const { url, domain } = toSource(r.source_url ?? r.referring_page_url ?? r.source ?? r.from ?? "", ours);
      const targetPath = toTargetPath(r.target_url ?? r.target ?? r.to ?? "/", ours);
      const rel = r.rel ? relOf(r.rel) : r.nofollow ? relOf(["true", "yes", "1"].includes(r.nofollow.toLowerCase()) ? "nofollow" : "follow") : "follow";
      const dr = num(r.domain_rating ?? r.dr ?? r.da ?? r.authority, 0, 100);
      const existing = await c.findOne({ sourceUrl: url, targetPath });
      if (existing) {
        await c.updateOne({ _id: existing._id }, { $set: { anchor: str(r.anchor ?? r.anchor_text, 300) || existing.anchor, rel, domainRating: dr ?? existing.domainRating, ...updateStamp(actorId) } });
        updated++;
      } else {
        await c.insertOne({
          _id: newId(),
          sourceUrl: url,
          sourceDomain: domain,
          targetPath,
          anchor: str(r.anchor ?? r.anchor_text, 300),
          rel,
          status: "unverified",
          firstSeen: cleanIsoDate((r.first_seen ?? "").slice(0, 10)) ?? todayIso(),
          lastSeenLiveAt: null,
          lastCheckedAt: null,
          lostAt: null,
          checkNote: null,
          domainRating: dr,
          source,
          notes: "",
          ...createStamp(actorId),
        });
        created++;
      }
    } catch (err) {
      if (errors.length < 20) errors.push(`Row ${i + 2}: ${err instanceof SeoInputError ? err.message : "could not be imported"}`);
    }
  }
  return { created, updated, failed: rows.length - created - updated, errors };
}

/** Fetches each source page and records whether the link is live, lost or pointing at a broken page of ours. */
export async function verifyBacklinks(ids?: string[]): Promise<{ checked: number; live: number; lost: number; broken: number }> {
  const c = await backlinksCol();
  const list = await c.find(ids ? { _id: { $in: ids } } : {}).limit(500).toArray();
  const [settings, ours] = await Promise.all([getSettings(), ourSite()]);
  const pages = await seoCollection<SeoPage>(COLLECTIONS.pages);
  const pageStatus = new Map((await pages.find({}, { projection: { path: 1, "crawl.status": 1 } }).toArray()).map((p) => [p.path, p.crawl?.status ?? null]));
  const targetStatus = new Map<string, number>();
  const tally = { checked: 0, live: 0, lost: 0, broken: 0 };

  await mapLimit(list, 4, async (b) => {
    const now = new Date();
    let status: BacklinkStatus = "unverified";
    let note: string | null = null;
    let rel = b.rel;
    let anchor = b.anchor;
    try {
      await assertPublicUrl(b.sourceUrl);
      const res = await fetchUrl(b.sourceUrl, { timeoutMs: 15000, guard: true });
      if (res.status === 403 || res.status === 429 || res.status === 999) note = `Source blocks crawlers (HTTP ${res.status}) — check it by hand.`;
      else if (res.status === 0) {
        status = "lost";
        note = res.error ?? "No response";
      } else if (res.status >= 400) {
        status = "lost";
        note = `Source page returns HTTP ${res.status}`;
      } else if (res.body) {
        const $ = cheerio.load(res.body);
        let found: { rel: string; text: string } | null = null;
        let anyToUs = false;
        $("a[href]").each((_, el) => {
          if (found) return;
          try {
            const u = new URL($(el).attr("href") as string, res.finalUrl);
            if (bare(u.host) !== ours.host) return;
            anyToUs = true;
            const p = u.pathname.length > 1 && u.pathname.endsWith("/") ? u.pathname.slice(0, -1) : u.pathname || "/";
            if (p === b.targetPath) found = { rel: ($(el).attr("rel") ?? "").toLowerCase(), text: $(el).text().replace(/\s+/g, " ").trim() };
          } catch {
            // ignore malformed hrefs
          }
        });
        if (found) {
          const f = found as { rel: string; text: string };
          status = "live";
          rel = relOf(f.rel);
          anchor = f.text.slice(0, 300) || anchor;
        } else {
          status = "lost";
          note = anyToUs ? "The page links to us, but no longer to this target URL." : "No link to our site on the source page.";
        }
      }
    } catch (err) {
      note = err instanceof UnsafeUrlError ? `Not checked: ${err.message}` : "Check failed";
    }

    if (status === "live") {
      let ts = pageStatus.get(b.targetPath) ?? targetStatus.get(b.targetPath);
      if (ts === undefined || ts === null) {
        const r = await fetchUrl(`${settings.siteOrigin}${b.targetPath}`, { timeoutMs: 10000, wantBody: false });
        ts = r.status;
        targetStatus.set(b.targetPath, ts);
      }
      if (ts === 0 || ts >= 400) {
        status = "broken";
        note = `Our target ${b.targetPath} returns ${ts || "no response"} — fix the page or 301-redirect it to keep this link's value.`;
      }
    }

    const set: Partial<Backlink> = { status, rel, anchor, lastCheckedAt: now, checkNote: note };
    if (status === "live" || status === "broken") Object.assign(set, { lastSeenLiveAt: now, lostAt: null });
    if (status === "lost" && b.status !== "lost") set.lostAt = now;
    await c.updateOne({ _id: b._id }, { $set: set });
    tally.checked++;
    if (status === "live") tally.live++;
    if (status === "lost") tally.lost++;
    if (status === "broken") tally.broken++;
  });
  return tally;
}

export interface BacklinkListOptions {
  search?: string;
  status?: string;
  rel?: string;
  domain?: string;
  target?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
}

export function backlinkFilter(o: BacklinkListOptions): Filter<Backlink> {
  const f: Filter<Backlink> = {};
  if (o.search) {
    const rx = new RegExp(escapeRegex(o.search), "i");
    f.$or = [{ sourceUrl: rx }, { anchor: rx }, { targetPath: rx }];
  }
  if (o.status === "new") f.firstSeen = { $gte: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10) };
  else if (o.status) f.status = o.status as BacklinkStatus;
  if (o.rel) f.rel = o.rel as Rel;
  if (o.domain) f.sourceDomain = o.domain;
  if (o.target) f.targetPath = o.target;
  return f;
}

export async function listBacklinks(o: BacklinkListOptions) {
  const c = await backlinksCol();
  const sortField: Record<string, string> = { source: "sourceDomain", target: "targetPath", dr: "domainRating", firstSeen: "firstSeen", checked: "lastCheckedAt", status: "status" };
  const sortBy = sortField[o.sortBy ?? ""] ?? "firstSeen";
  const dir = o.sortDir === "asc" ? 1 : -1;
  const f = backlinkFilter(o);
  const page = Math.max(o.page ?? 1, 1);
  const pageSize = Math.min(Math.max(o.pageSize ?? 30, 1), 1000);
  const [items, total] = await Promise.all([c.find(f).sort({ [sortBy]: dir, _id: 1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(), c.countDocuments(f)]);
  return { items, total, page, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function backlinkOverview() {
  const c = await backlinksCol();
  const all = await c.find({}).toArray();
  const active = all.filter((b) => b.status !== "lost");
  const domains = new Map<string, { domain: string; links: number; follow: number; live: number; bestDr: number | null; firstSeen: string }>();
  for (const b of all) {
    const d = domains.get(b.sourceDomain) ?? { domain: b.sourceDomain, links: 0, follow: 0, live: 0, bestDr: null, firstSeen: b.firstSeen };
    d.links++;
    if (b.rel === "follow" && b.status !== "lost") d.follow++;
    if (b.status === "live" || b.status === "broken") d.live++;
    if (b.domainRating !== null && (d.bestDr === null || b.domainRating > d.bestDr)) d.bestDr = b.domainRating;
    if (b.firstSeen < d.firstSeen) d.firstSeen = b.firstSeen;
    domains.set(b.sourceDomain, d);
  }
  const anchors = new Map<string, number>();
  for (const b of active) {
    const a = b.anchor.trim().toLowerCase() || "(no anchor text / image)";
    anchors.set(a, (anchors.get(a) ?? 0) + 1);
  }
  const since30 = new Date(Date.now() - 30 * 86400000);
  // Monthly growth: new (by first seen) and lost (by lost date), plus the running total of non-lost links.
  const months = new Map<string, { month: string; added: number; lost: number }>();
  for (const b of all) {
    const m = b.firstSeen.slice(0, 7);
    const row = months.get(m) ?? { month: m, added: 0, lost: 0 };
    row.added++;
    months.set(m, row);
    if (b.lostAt) {
      const lm = b.lostAt.toISOString().slice(0, 7);
      const lrow = months.get(lm) ?? { month: lm, added: 0, lost: 0 };
      lrow.lost++;
      months.set(lm, lrow);
    }
  }
  let running = 0;
  const domainFirstSeen = Array.from(domains.values()).map((d) => d.firstSeen.slice(0, 7));
  const growth = Array.from(months.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => {
      running += r.added - r.lost;
      return { ...r, total: running, domains: domainFirstSeen.filter((m) => m <= r.month).length };
    });
  return {
    total: active.length,
    live: all.filter((b) => b.status === "live").length,
    lost: all.filter((b) => b.status === "lost").length,
    broken: all.filter((b) => b.status === "broken").length,
    unverified: all.filter((b) => b.status === "unverified").length,
    follow: active.filter((b) => b.rel === "follow").length,
    nofollow: active.filter((b) => b.rel !== "follow").length,
    newLast30: all.filter((b) => new Date(`${b.firstSeen}T00:00:00`) >= since30).length,
    lostLast30: all.filter((b) => b.lostAt && b.lostAt >= since30).length,
    referringDomains: Array.from(domains.values()).filter((d) => d.links > 0 && all.some((b) => b.sourceDomain === d.domain && b.status !== "lost")).length,
    domains: Array.from(domains.values()).sort((a, b) => b.links - a.links),
    anchors: Array.from(anchors.entries()).map(([anchor, count]) => ({ anchor, count })).sort((a, b) => b.count - a.count),
    growth,
    avgDr: (() => {
      const drs = Array.from(domains.values()).map((d) => d.bestDr).filter((x): x is number => x !== null);
      return drs.length ? Math.round(drs.reduce((a, b) => a + b, 0) / drs.length) : null;
    })(),
  };
}
