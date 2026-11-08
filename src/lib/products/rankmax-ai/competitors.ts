import "server-only";
import { COLLECTIONS, cleanIsoDate, createStamp, newId, num, seoCollection, str, todayIso, updateStamp, type Stamps } from "@/lib/products/rankmax-ai/db";
import { discoverSitemaps } from "@/lib/products/rankmax-ai/sitemaps";
import { assertPublicUrl, UnsafeUrlError } from "@/lib/products/rankmax-ai/fetch";
import { keywordsCol, normalizeKeyword, type Keyword } from "@/lib/products/rankmax-ai/keywords";
import { parseCsv } from "@/lib/products/rankmax-ai/csv-parse";
import { SeoInputError } from "@/lib/products/rankmax-ai/viewer";
import type { SeoPage } from "@/lib/products/rankmax-ai/types";

/**
 * Competitor SEO. Everything about a competitor is EXTERNAL data and is
 * labelled that way in the UI:
 *   - metrics / top pages / keyword positions → ESTIMATED (entered or imported
 *     from a third-party SEO tool; `source` records which);
 *   - their sitemap snapshot → MEASURED by our own fetcher (public files only).
 * Our side of every comparison comes from verified company data (tracked
 * keywords + Search Console). Visibility is computed the same way for us and
 * for each competitor over the SAME tracked keyword set, so it's comparable.
 */

export interface Competitor extends Stamps {
  _id: string;
  name: string;
  domain: string;
  color: string;
  notes: string;
  metrics: {
    organicKeywords: number | null;
    rankingKeywords: number | null;
    organicTraffic: number | null;
    backlinks: number | null;
    referringDomains: number | null;
    domainRating: number | null;
    source: string;
    asOf: string | null;
  };
  topPages: { url: string; traffic: number | null; keywords: number | null }[];
  sitemap: { urlCount: number; paths: string[]; checkedAt: Date; error: string | null } | null;
}

export interface CompetitorRanking {
  _id: string;
  competitorId: string;
  keyword: string;
  normalized: string;
  position: number | null;
  url: string | null;
  volume: number | null;
  date: string;
  source: string;
}

const EMPTY_METRICS: Competitor["metrics"] = { organicKeywords: null, rankingKeywords: null, organicTraffic: null, backlinks: null, referringDomains: null, domainRating: null, source: "manual", asOf: null };

export async function competitorsCol() {
  return seoCollection<Competitor>(COLLECTIONS.competitors);
}
export async function competitorRankingsCol() {
  const c = await seoCollection<CompetitorRanking>(COLLECTIONS.competitorRankings);
  await c.createIndex({ competitorId: 1, normalized: 1, date: -1 }).catch(() => {});
  return c;
}

export function cleanDomain(v: string): string | null {
  const s = v.trim().toLowerCase();
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    if (!u.hostname.includes(".")) return null;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function upsertCompetitor(
  id: string | null,
  input: { name: string; domain: string; color?: string; notes?: string; metrics?: Record<string, unknown>; topPages?: string },
  actorId: string
): Promise<{ before: Competitor | null; after: Competitor }> {
  const name = str(input.name, 100);
  const domain = cleanDomain(input.domain);
  if (!name) throw new SeoInputError("Name is required.");
  if (!domain) throw new SeoInputError("Enter the competitor's domain, e.g. example.com.");
  const c = await competitorsCol();
  const clash = await c.findOne({ domain, ...(id ? { _id: { $ne: id } } : {}) });
  if (clash) throw new SeoInputError(`${domain} is already a competitor.`);
  const m = input.metrics ?? {};
  const metrics: Competitor["metrics"] = {
    organicKeywords: num(m.organicKeywords, 0),
    rankingKeywords: num(m.rankingKeywords, 0),
    organicTraffic: num(m.organicTraffic, 0),
    backlinks: num(m.backlinks, 0),
    referringDomains: num(m.referringDomains, 0),
    domainRating: num(m.domainRating, 0, 100),
    source: str(m.source, 60) || "manual",
    asOf: cleanIsoDate(m.asOf) ?? todayIso(),
  };
  // Top pages: one per line, "url, traffic, keywords".
  const topPages = String(input.topPages ?? "")
    .split(/\r?\n/)
    .map((l) => l.split(",").map((x) => x.trim()))
    .filter((p) => p[0])
    .slice(0, 50)
    .map((p) => ({ url: p[0].slice(0, 500), traffic: num(p[1], 0), keywords: num(p[2], 0) }));
  const color = /^#[0-9a-f]{6}$/i.test(input.color ?? "") ? (input.color as string) : "#f59e0b";
  if (id) {
    const before = await c.findOne({ _id: id });
    if (!before) throw new SeoInputError("Competitor not found.");
    const set = { name, domain, color, notes: str(input.notes, 2000), metrics, topPages, ...updateStamp(actorId) };
    await c.updateOne({ _id: id }, { $set: set });
    return { before, after: { ...before, ...set } };
  }
  const doc: Competitor = { _id: newId(), name, domain, color, notes: str(input.notes, 2000), metrics: input.metrics ? metrics : { ...EMPTY_METRICS }, topPages, sitemap: null, ...createStamp(actorId) };
  await c.insertOne(doc);
  return { before: null, after: doc };
}

export async function deleteCompetitor(id: string): Promise<Competitor | null> {
  const c = await competitorsCol();
  const comp = await c.findOne({ _id: id });
  if (!comp) return null;
  await c.deleteOne({ _id: id });
  await (await competitorRankingsCol()).deleteMany({ competitorId: id });
  return comp;
}

/** Reads the competitor's public sitemap(s) — our own measurement of their indexable page inventory. */
export async function snapshotCompetitorSitemap(id: string): Promise<Competitor["sitemap"]> {
  const c = await competitorsCol();
  const comp = await c.findOne({ _id: id });
  if (!comp) throw new SeoInputError("Competitor not found.");
  let snapshot: Competitor["sitemap"];
  try {
    const origin = `https://${comp.domain}`;
    await assertPublicUrl(origin);
    const d = await discoverSitemaps(origin, { primaryHost: comp.domain, guard: true });
    const paths = Array.from(
      new Set(
        d.urls.map((u) => {
          try {
            return new URL(u.loc).pathname;
          } catch {
            return "";
          }
        })
      )
    ).filter(Boolean);
    const err = d.records.every((r) => r.errors.length > 0) ? d.records.flatMap((r) => r.errors).slice(0, 2).join("; ") : null;
    snapshot = { urlCount: paths.length, paths: paths.slice(0, 3000), checkedAt: new Date(), error: paths.length === 0 ? err ?? "No sitemap URLs found" : null };
  } catch (err) {
    snapshot = { urlCount: 0, paths: [], checkedAt: new Date(), error: err instanceof UnsafeUrlError ? err.message : "Could not read the sitemap" };
  }
  await c.updateOne({ _id: id }, { $set: { sitemap: snapshot } });
  return snapshot;
}

/** CSV of the competitor's keyword positions from an SEO tool: keyword, position, url, volume, date. */
export async function importCompetitorRankings(id: string, csv: string, source: string) {
  const comp = await (await competitorsCol()).findOne({ _id: id });
  if (!comp) throw new SeoInputError("Competitor not found.");
  const { rows } = parseCsv(csv, 20000);
  if (rows.length === 0 || !("keyword" in rows[0])) throw new SeoInputError('The file needs a "keyword" column (plus position, url, volume, date).');
  const col = await competitorRankingsCol();
  const today = todayIso();
  let imported = 0;
  const errors: string[] = [];
  for (const [i, r] of rows.entries()) {
    const keyword = str(r.keyword, 200);
    if (!keyword) continue;
    const date = r.date ? cleanIsoDate(r.date.slice(0, 10)) : today;
    if (!date) {
      if (errors.length < 20) errors.push(`Row ${i + 2}: invalid date.`);
      continue;
    }
    const posRaw = (r.position ?? r.rank ?? "").trim();
    const position = posRaw ? num(posRaw, 1, 100) : null;
    const normalized = normalizeKeyword(keyword);
    const _id = `${id}|${normalized}|${date}`;
    await col.replaceOne(
      { _id },
      { competitorId: id, keyword, normalized, position: position === null ? null : Math.round(position), url: str(r.url, 500) || null, volume: num(r.volume ?? r.search_volume, 0), date, source },
      { upsert: true }
    );
    imported++;
  }
  return { imported, errors };
}

export async function recordCompetitorPosition(id: string, input: { keyword: string; position: string; url?: string; date?: string }) {
  const keyword = str(input.keyword, 200);
  if (!keyword) throw new SeoInputError("Keyword is required.");
  const position = input.position.trim() ? num(input.position, 1, 100) : null;
  if (input.position.trim() && position === null) throw new SeoInputError("Position must be 1–100 (empty = not ranking).");
  const date = cleanIsoDate(input.date) ?? todayIso();
  const normalized = normalizeKeyword(keyword);
  const col = await competitorRankingsCol();
  const _id = `${id}|${normalized}|${date}`;
  await col.replaceOne({ _id }, { competitorId: id, keyword, normalized, position: position === null ? null : Math.round(position), url: str(input.url, 500) || null, volume: null, date, source: "manual" }, { upsert: true });
}

/** Approximate organic CTR by position — the usual industry curve; used only to weight visibility. */
function ctrAt(pos: number | null): number {
  if (pos === null || pos > 100) return 0;
  const table = [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
  if (pos <= 10) return table[Math.max(Math.round(pos), 1) - 1];
  if (pos <= 20) return 0.01;
  return 0.002;
}

export function visibility(positions: { position: number | null; volume: number | null }[]): number | null {
  const withVol = positions.filter((p) => (p.volume ?? 0) > 0);
  const base = withVol.length ? withVol : positions.map((p) => ({ ...p, volume: 1 }));
  if (base.length === 0) return null;
  const max = base.reduce((s, p) => s + ctrAt(1) * (p.volume ?? 1), 0);
  const got = base.reduce((s, p) => s + ctrAt(p.position) * (p.volume ?? 1), 0);
  return max ? Math.round((got / max) * 1000) / 10 : null;
}

export interface CompetitorComparison {
  competitor: Competitor;
  latest: Map<string, CompetitorRanking>;
  previous: Map<string, CompetitorRanking>;
  visibility: number | null;
  sharedKeywords: number;
  gaps: { keyword: string; theirPosition: number; ourPosition: number | null; volume: number | null; url: string | null; tracked: boolean }[];
  wins: { keyword: string; theirPosition: number | null; ourPosition: number }[];
  changes: { keyword: string; from: number | null; to: number | null; change: number }[];
  contentGaps: { topic: string; examples: string[] }[];
}

/** Topic words from a URL path, e.g. "/services/ai-chatbot-development" → ["ai", "chatbot", "development"]. */
const STOP = new Set(["the", "and", "for", "with", "your", "you", "our", "how", "what", "why", "a", "an", "of", "to", "in", "on", "is", "are", "vs", "blog", "page", "services", "service", "index", "html", "php", "www", "en", "us", "category", "tag", "author"]);
function topicWords(path: string): string[] {
  return decodeURIComponent(path)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

export async function compareCompetitor(id: string): Promise<CompetitorComparison | null> {
  const comp = await (await competitorsCol()).findOne({ _id: id });
  if (!comp) return null;
  const [rankings, keywords, pages] = await Promise.all([
    (await competitorRankingsCol()).find({ competitorId: id }).sort({ date: -1 }).toArray(),
    (await keywordsCol()).find({ status: { $ne: "archived" } }).toArray(),
    (await seoCollection<SeoPage>(COLLECTIONS.pages)).find({}, { projection: { path: 1, "crawl.title": 1, "crawl.h1": 1 } }).toArray(),
  ]);
  const latest = new Map<string, CompetitorRanking>();
  const previous = new Map<string, CompetitorRanking>();
  for (const r of rankings) {
    if (!latest.has(r.normalized)) latest.set(r.normalized, r);
    else if (!previous.has(r.normalized) && r.date < latest.get(r.normalized)!.date) previous.set(r.normalized, r);
  }
  const ours = new Map<string, Keyword>();
  for (const k of keywords) {
    const prev = ours.get(k.normalized);
    if (!prev || (k.currentPosition ?? 999) < (prev.currentPosition ?? 999)) ours.set(k.normalized, k);
  }

  const gaps: CompetitorComparison["gaps"] = [];
  const wins: CompetitorComparison["wins"] = [];
  for (const [norm, r] of latest) {
    const mine = ours.get(norm);
    const ourPos = mine?.currentPosition ?? null;
    if (r.position !== null && r.position <= 20 && (ourPos === null || ourPos > r.position + 5)) {
      gaps.push({ keyword: r.keyword, theirPosition: r.position, ourPosition: ourPos, volume: r.volume ?? mine?.volume ?? null, url: r.url, tracked: !!mine });
    }
    if (ourPos !== null && (r.position === null || ourPos < r.position)) wins.push({ keyword: r.keyword, theirPosition: r.position, ourPosition: ourPos });
  }
  gaps.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0) || a.theirPosition - b.theirPosition);

  const changes: CompetitorComparison["changes"] = [];
  for (const [norm, r] of latest) {
    const p = previous.get(norm);
    if (!p) continue;
    const change = (p.position ?? 101) - (r.position ?? 101);
    if (change !== 0) changes.push({ keyword: r.keyword, from: p.position, to: r.position, change });
  }
  changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  // Visibility over OUR tracked keyword set, for them — comparable with our own figure.
  const vis = visibility(keywords.map((k) => ({ position: latest.get(k.normalized)?.position ?? null, volume: k.volume })));

  // Content gaps: topics that appear in several of their URLs but in none of our paths/titles/H1s.
  const ourText = new Set(pages.flatMap((p) => [...topicWords(p.path), ...topicWords(p.crawl?.title ?? ""), ...(p.crawl?.h1 ?? []).flatMap((h) => topicWords(h))]));
  const examples = new Map<string, string[]>();
  const counts = new Map<string, number>();
  for (const path of comp.sitemap?.paths ?? []) {
    for (const w of new Set(topicWords(path))) {
      if (ourText.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
      const list = examples.get(w) ?? [];
      if (list.length < 3) list.push(path);
      examples.set(w, list);
    }
  }
  const contentGaps = Array.from(counts.entries())
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([topic, n]) => ({ topic: `${topic} (${n} pages)`, examples: examples.get(topic) ?? [] }));

  return {
    competitor: comp,
    latest,
    previous,
    visibility: vis,
    sharedKeywords: keywords.filter((k) => latest.has(k.normalized)).length,
    gaps: gaps.slice(0, 200),
    wins: wins.slice(0, 200),
    changes: changes.slice(0, 100),
    contentGaps,
  };
}

/** Our own visibility over the tracked keyword set (verified positions). */
export async function ourVisibility(): Promise<number | null> {
  const keywords = await (await keywordsCol()).find({ status: "tracking" }).toArray();
  return visibility(keywords.map((k) => ({ position: k.currentPosition, volume: k.volume })));
}
