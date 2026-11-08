import "server-only";
import { COLLECTIONS, cleanIsoDate, num, seoCollection, todayIso, addDaysIso } from "@/lib/products/rankmax-ai/db";
import { keywordsCol, normalizeKeyword, type Keyword } from "@/lib/products/rankmax-ai/keywords";
import { cleanPath } from "@/lib/products/rankmax-ai/pages";
import { parseCsv } from "@/lib/products/rankmax-ai/csv-parse";
import { SeoInputError } from "@/lib/products/rankmax-ai/viewer";

/**
 * Keyword position history. One row per keyword per day per source:
 *   - "gsc"     Google Search Console average position (VERIFIED, Google's own data)
 *   - "manual"  a position someone checked and entered
 *   - "import"  a CSV export from a rank-tracking tool (third-party measurement)
 * A null position means "checked, not ranking in the top 100".
 * The keyword's current / previous / best position is always recomputed from
 * this history, preferring manual/import (exact SERP positions) over GSC
 * averages when both exist for the same day.
 */

export type RankSource = "gsc" | "manual" | "import";

export interface RankRecord {
  _id: string;
  keywordId: string;
  date: string;
  position: number | null;
  url: string | null;
  source: RankSource;
  impressions: number | null;
  clicks: number | null;
  createdAt: Date;
}

export const RANK_SOURCE_LABEL: Record<RankSource, string> = {
  gsc: "Search Console (verified)",
  manual: "Manual check",
  import: "Imported (rank tracker)",
};

const SOURCE_PREF: Record<RankSource, number> = { manual: 0, import: 1, gsc: 2 };

let indexesEnsured = false;
export async function historyCol() {
  const c = await seoCollection<RankRecord>(COLLECTIONS.rankHistory);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([c.createIndex({ keywordId: 1, date: -1 }).catch(() => {}), c.createIndex({ date: -1 }).catch(() => {})]);
  }
  return c;
}

/** One position per day for a keyword, picking the preferred source. */
function dailySeries(rows: RankRecord[]): RankRecord[] {
  const byDate = new Map<string, RankRecord>();
  for (const r of rows) {
    const prev = byDate.get(r.date);
    if (!prev || SOURCE_PREF[r.source] < SOURCE_PREF[prev.source]) byDate.set(r.date, r);
  }
  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
}

export async function recomputeKeywordPositions(keywordIds: string[]): Promise<void> {
  if (keywordIds.length === 0) return;
  const hist = await historyCol();
  const kws = await keywordsCol();
  const rows = await hist.find({ keywordId: { $in: keywordIds } }).toArray();
  const byKw = new Map<string, RankRecord[]>();
  for (const r of rows) byKw.set(r.keywordId, [...(byKw.get(r.keywordId) ?? []), r]);
  for (const id of keywordIds) {
    const series = dailySeries(byKw.get(id) ?? []);
    const latest = series[0];
    const previous = series[1];
    const ranked = series.map((s) => s.position).filter((p): p is number => p !== null);
    await kws.updateOne(
      { _id: id },
      {
        $set: {
          currentPosition: latest?.position ?? null,
          previousPosition: previous?.position ?? null,
          bestPosition: ranked.length ? Math.min(...ranked) : null,
          rankingUrl: latest?.url ?? null,
          lastCheckedAt: latest ? new Date(`${latest.date}T12:00:00`) : null,
          positionSource: latest?.source ?? null,
        },
      }
    );
  }
}

export async function upsertRank(entry: { keywordId: string; date: string; position: number | null; url: string | null; source: RankSource; impressions?: number | null; clicks?: number | null }): Promise<void> {
  const hist = await historyCol();
  const _id = `${entry.keywordId}|${entry.date}|${entry.source}`;
  await hist.replaceOne(
    { _id },
    { keywordId: entry.keywordId, date: entry.date, position: entry.position, url: entry.url, source: entry.source, impressions: entry.impressions ?? null, clicks: entry.clicks ?? null, createdAt: new Date() },
    { upsert: true }
  );
}

export async function recordManualPosition(keywordId: string, input: { date: string; position: string; url: string }): Promise<Keyword> {
  const kw = await (await keywordsCol()).findOne({ _id: keywordId });
  if (!kw) throw new SeoInputError("Keyword not found.");
  const date = cleanIsoDate(input.date) ?? todayIso();
  if (date > todayIso()) throw new SeoInputError("The date can't be in the future.");
  const raw = input.position.trim().toLowerCase();
  const position = raw === "" || raw === "-" || raw === "none" || raw === "not ranking" ? null : num(raw, 1, 100);
  if (raw && position === null && !["-", "none", "not ranking"].includes(raw)) throw new SeoInputError("Position must be 1–100, or leave it empty for “not ranking”.");
  const url = input.url.trim() ? cleanPath(input.url.trim().replace(/^https?:\/\/[^/]+/i, "") || "/") : null;
  await upsertRank({ keywordId, date, position: position === null ? null : Math.round(position), url, source: "manual" });
  await recomputeKeywordPositions([keywordId]);
  return kw;
}

/**
 * Rank CSV import (from any rank tracker's export). Columns: keyword, position
 * (blank = not ranking), date (YYYY-MM-DD, default today), url, and optional
 * country / device to disambiguate a keyword tracked in several markets.
 */
export async function importRankings(csv: string) {
  const { rows } = parseCsv(csv, 20000);
  if (rows.length === 0) throw new SeoInputError("The file has no data rows.");
  if (!("keyword" in rows[0]) || !(("position" in rows[0]) || ("rank" in rows[0]))) throw new SeoInputError('The file needs "keyword" and "position" columns.');
  const keywords = await (await keywordsCol()).find({ status: { $ne: "archived" } }).toArray();
  const touched = new Set<string>();
  let imported = 0;
  const errors: string[] = [];
  const today = todayIso();
  for (const [i, r] of rows.entries()) {
    const norm = normalizeKeyword(r.keyword ?? "");
    const matches = keywords.filter(
      (k) => k.normalized === norm && (!r.country || k.country === r.country.toUpperCase()) && (!r.device || k.device === r.device.toLowerCase())
    );
    if (matches.length === 0) {
      if (errors.length < 20) errors.push(`Row ${i + 2}: "${r.keyword}" is not a tracked keyword — add it first.`);
      continue;
    }
    const date = r.date ? cleanIsoDate(r.date) : today;
    if (!date || date > today) {
      if (errors.length < 20) errors.push(`Row ${i + 2}: invalid date "${r.date}".`);
      continue;
    }
    const rawPos = (r.position ?? r.rank ?? "").trim();
    const position = rawPos === "" || rawPos === "-" ? null : num(rawPos, 1, 100);
    if (rawPos && rawPos !== "-" && position === null) {
      if (errors.length < 20) errors.push(`Row ${i + 2}: position "${rawPos}" is not 1–100.`);
      continue;
    }
    const url = r.url ? cleanPath(r.url.replace(/^https?:\/\/[^/]+/i, "") || "/") : null;
    for (const k of matches) {
      await upsertRank({ keywordId: k._id, date, position: position === null ? null : Math.round(position), url, source: "import" });
      touched.add(k._id);
    }
    imported++;
  }
  await recomputeKeywordPositions(Array.from(touched));
  return { imported, failed: rows.length - imported, keywords: touched.size, errors };
}

export const BUCKETS = [
  { key: "top3", label: "Top 3", min: 1, max: 3 },
  { key: "top10", label: "Top 10", min: 1, max: 10 },
  { key: "top20", label: "Top 20", min: 1, max: 20 },
  { key: "top50", label: "Top 50", min: 1, max: 50 },
  { key: "top100", label: "Top 100", min: 1, max: 100 },
] as const;

export function distribution(keywords: Pick<Keyword, "currentPosition">[]) {
  const counts = Object.fromEntries(BUCKETS.map((b) => [b.key, keywords.filter((k) => k.currentPosition !== null && k.currentPosition >= b.min && k.currentPosition <= b.max).length])) as Record<(typeof BUCKETS)[number]["key"], number>;
  return { ...counts, notRanking: keywords.filter((k) => k.currentPosition === null).length, total: keywords.length };
}

export interface Mover {
  keyword: Keyword;
  from: number | null;
  to: number | null;
  change: number;
}

/**
 * Position changes between `days` ago and now. "Improved" = moved up (or
 * entered the top 100), "dropped" = moved down (or fell out).
 */
export async function movers(keywords: Keyword[], days: number): Promise<{ improved: Mover[]; dropped: Mover[] }> {
  if (keywords.length === 0) return { improved: [], dropped: [] };
  const hist = await historyCol();
  const since = addDaysIso(todayIso(), -days);
  const rows = await hist.find({ keywordId: { $in: keywords.map((k) => k._id) } }).toArray();
  const byKw = new Map<string, RankRecord[]>();
  for (const r of rows) byKw.set(r.keywordId, [...(byKw.get(r.keywordId) ?? []), r]);
  const improved: Mover[] = [];
  const dropped: Mover[] = [];
  for (const k of keywords) {
    const series = dailySeries(byKw.get(k._id) ?? []);
    if (series.length < 2) continue;
    const now = series[0];
    const then = series.find((s) => s.date <= since) ?? series[series.length - 1];
    if (then === now) continue;
    const from = then.position;
    const to = now.position;
    const a = from ?? 101;
    const b = to ?? 101;
    if (a === b) continue;
    const m = { keyword: k, from, to, change: a - b };
    (m.change > 0 ? improved : dropped).push(m);
  }
  improved.sort((x, y) => y.change - x.change);
  dropped.sort((x, y) => x.change - y.change);
  return { improved, dropped };
}

export interface HistoryFilters {
  keywordIds?: string[];
  from?: string;
  to?: string;
  source?: string;
}

export async function listHistory(f: HistoryFilters, limit = 2000): Promise<RankRecord[]> {
  const hist = await historyCol();
  const q: Record<string, unknown> = {};
  if (f.keywordIds) q.keywordId = { $in: f.keywordIds };
  if (f.from || f.to) q.date = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lte: f.to } : {}) };
  if (f.source) q.source = f.source;
  return hist.find(q).sort({ date: -1 }).limit(limit).toArray();
}

/** Day/week/month series: average position of ranked keywords and how many sit in the top 10. */
export function trendSeries(rows: RankRecord[], granularity: "day" | "week" | "month") {
  const bucketOf = (d: string) => {
    if (granularity === "month") return d.slice(0, 7);
    if (granularity === "week") {
      const dt = new Date(`${d}T00:00:00`);
      dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
      return todayIso(dt);
    }
    return d;
  };
  // Latest preferred reading per keyword per bucket.
  const perKw = new Map<string, Map<string, RankRecord>>();
  for (const r of rows) {
    const b = bucketOf(r.date);
    if (!perKw.has(b)) perKw.set(b, new Map());
    const m = perKw.get(b)!;
    const prev = m.get(r.keywordId);
    if (!prev || r.date > prev.date || (r.date === prev.date && SOURCE_PREF[r.source] < SOURCE_PREF[prev.source])) m.set(r.keywordId, r);
  }
  return Array.from(perKw.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, m]) => {
      const positions = Array.from(m.values()).map((r) => r.position).filter((p): p is number => p !== null);
      return {
        label: bucket,
        avgPosition: positions.length ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10 : null,
        top10: positions.filter((p) => p <= 10).length,
        top3: positions.filter((p) => p <= 3).length,
        ranking: positions.length,
      };
    });
}
