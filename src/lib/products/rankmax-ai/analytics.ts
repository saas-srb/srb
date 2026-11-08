import "server-only";
import { COLLECTIONS, addDaysIso, seoCollection, todayIso } from "@/lib/products/rankmax-ai/db";
import { latestCompletedRun } from "@/lib/products/rankmax-ai/crawler";
import { issueStats } from "@/lib/products/rankmax-ai/issues";
import { allActiveKeywords } from "@/lib/products/rankmax-ai/keywords";
import { distribution, listHistory, trendSeries } from "@/lib/products/rankmax-ai/rankings";
import { backlinkOverview } from "@/lib/products/rankmax-ai/backlinks";
import { searchDaily } from "@/lib/products/rankmax-ai/integrations/gsc";
import { trafficDaily } from "@/lib/products/rankmax-ai/integrations/ga4";
import { getSettings, integrationEnv } from "@/lib/products/rankmax-ai/settings";
import { taskStats } from "@/lib/products/rankmax-ai/tasks";
import type { CrawlRun, SeoPage } from "@/lib/products/rankmax-ai/types";

/**
 * Everything the SEO dashboard and overview show, computed from stored
 * data only (no live API calls on page load). Each figure carries whether it
 * is available, so the UI can say "connect Search Console" instead of 0.
 */

export interface Point {
  label: string;
  [series: string]: string | number | null;
}

const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);

export async function getDashboard(viewerId: string, filters: { q?: string } = {}) {
  const [run, issues, keywords, backlinks, daily, settings, allPagesDocs, runs, tasks] = await Promise.all([
    latestCompletedRun(),
    issueStats(),
    allActiveKeywords(),
    backlinkOverview(),
    searchDaily(120),
    getSettings(),
    (await seoCollection<SeoPage>(COLLECTIONS.pages)).find({}, { projection: { path: 1, scores: 1, "crawl.indexable": 1, indexStatus: 1, lastCrawledAt: 1 } }).toArray(),
    (await seoCollection<CrawlRun>(COLLECTIONS.runs)).find({ status: "completed" }).sort({ startedAt: 1 }).limit(60).toArray(),
    taskStats(viewerId),
  ]);
  // The search box narrows the page-level numbers (indexing, scores) to URLs containing the text.
  const needle = filters.q?.trim().toLowerCase();
  const pagesDocs = needle ? allPagesDocs.filter((p) => p.path.toLowerCase().includes(needle)) : allPagesDocs;
  const traffic = await trafficDaily(addDaysIso(todayIso(), -120));

  // Search Console: last 28 days vs the 28 before.
  const end = daily.length ? daily[daily.length - 1].date : null;
  const cur = end ? daily.filter((d) => d.date > addDaysIso(end, -28)) : [];
  const prev = end ? daily.filter((d) => d.date <= addDaysIso(end, -28) && d.date > addDaysIso(end, -56)) : [];
  const sum = (rows: typeof daily, k: "clicks" | "impressions") => rows.reduce((s, r) => s + r[k], 0);
  const avgPos = (rows: typeof daily) => {
    const imp = sum(rows, "impressions");
    return imp ? Math.round((rows.reduce((s, r) => s + r.position * r.impressions, 0) / imp) * 10) / 10 : null;
  };
  const search = {
    connected: daily.length > 0,
    clicks: sum(cur, "clicks"),
    impressions: sum(cur, "impressions"),
    ctr: sum(cur, "impressions") ? Math.round((sum(cur, "clicks") / sum(cur, "impressions")) * 1000) / 10 : null,
    position: avgPos(cur),
    clicksTrend: pct(sum(cur, "clicks"), sum(prev, "clicks")),
    impressionsTrend: pct(sum(cur, "impressions"), sum(prev, "impressions")),
    range: end ? `${addDaysIso(end, -27)} → ${end}` : null,
  };

  const rowsCol = await seoCollection<{ _id: string; query: string }>(COLLECTIONS.searchRows);
  const organicKeywords = search.connected ? (await rowsCol.distinct("query")).length : null;

  const dist = distribution(keywords);
  const inspected = pagesDocs.filter((p) => p.indexStatus);
  const indexed = inspected.length ? { value: inspected.filter((p) => p.indexStatus?.verdict === "PASS").length, source: "Search Console URL inspection" as const } : { value: run?.indexablePages ?? 0, source: "Indexable per latest crawl" as const };
  const needsOptimization = pagesDocs.filter((p) => p.scores && p.scores.overall < 80).length;

  // Charts
  const hist = await listHistory({ from: addDaysIso(todayIso(), -120) }, 20000);
  const rankTrend = trendSeries(hist, "week").map((r) => ({ label: r.label.slice(5), avgPosition: r.avgPosition, top10: r.top10, top3: r.top3 }));
  const searchTrend: Point[] = daily.slice(-90).map((d) => ({ label: d.date.slice(5), clicks: d.clicks, impressions: d.impressions, ctr: Math.round(d.ctr * 1000) / 10, position: Math.round(d.position * 10) / 10 }));
  const trafficTrend: Point[] = traffic.slice(-90).map((t) => ({ label: t.date.slice(5), sessions: t.sessions, users: t.users }));
  const scoreTrend: Point[] = runs.map((r) => ({ label: r.startedAt.toISOString().slice(5, 10), overall: r.scores?.overall ?? null, technical: r.scores?.technical ?? null, onPage: r.scores?.onPage ?? null, content: r.scores?.content ?? null }));
  const indexedTrend: Point[] = runs.map((r) => ({ label: r.startedAt.toISOString().slice(5, 10), indexable: r.indexablePages, crawled: r.pagesCrawled }));
  const backlinkTrend: Point[] = backlinks.growth.map((g) => ({ label: g.month, backlinks: g.total, domains: g.domains, added: g.added, lost: g.lost }));

  const env = await integrationEnv();
  return {
    run,
    scores: run?.scores ?? null,
    issues,
    keywords: { tracked: keywords.length, ranking: keywords.length - dist.notRanking, top3: dist.top3, top10: dist.top10, dist },
    organicKeywords,
    search,
    indexed,
    needsOptimization,
    backlinks,
    tasks,
    charts: { rankTrend, searchTrend, trafficTrend, scoreTrend, indexedTrend, backlinkTrend },
    integrations: {
      credentials: !!env.google,
      gsc: settings.integrations.gsc,
      ga4: settings.integrations.ga4,
      trafficConnected: traffic.length > 0,
    },
  };
}
