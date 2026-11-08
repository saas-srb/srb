import "server-only";
import { COLLECTIONS, seoCollection } from "@/lib/products/rankmax-ai/db";
import { CATEGORY_LABEL, ISSUE_STATUS_LABEL, SEVERITY_META } from "@/lib/products/rankmax-ai/checks";
import { listIssues } from "@/lib/products/rankmax-ai/issues";
import { listKeywords, groupsCol, isLongTail } from "@/lib/products/rankmax-ai/keywords";
import { listHistory, RANK_SOURCE_LABEL } from "@/lib/products/rankmax-ai/rankings";
import { listBacklinks } from "@/lib/products/rankmax-ai/backlinks";
import { competitorsCol, competitorRankingsCol } from "@/lib/products/rankmax-ai/competitors";
import { listSitemapRecords } from "@/lib/products/rankmax-ai/sitemaps";
import { listTasks, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from "@/lib/products/rankmax-ai/tasks";
import { exportAudit, AUDIT_ACTION_LABEL } from "@/lib/products/rankmax-ai/audit";
import { userNames } from "@/lib/products/rankmax-ai/people";
import type { SeoViewer } from "@/lib/products/rankmax-ai/viewer";
import type { CrawlRun, SeoPage } from "@/lib/products/rankmax-ai/types";
import type { SheetColumn } from "@/lib/products/rankmax-ai/xlsx";

/**
 * Report + list exports (CSV / Excel through the shared export route, the
 * same pattern as SOP/FMS). Each builder returns rows plus column
 * definitions; list exports honour the list page's current filters.
 */

export const REPORTS = {
  technical: { title: "Technical SEO Report", description: "Status codes, redirects, indexability, canonicals, robots directives, HTTPS and response times for every crawled page." },
  on_page: { title: "On-Page SEO Report", description: "Titles, descriptions, headings, image alt text, social tags, focus keywords and on-page scores." },
  keywords: { title: "Keyword Report", description: "Every tracked keyword with intent, estimated metrics, positions, targets, groups and clusters." },
  rankings: { title: "Ranking Report", description: "Position history per keyword and date, with the data source of each reading." },
  backlinks: { title: "Backlink Report", description: "Backlinks with source, target, anchor, follow status, verification status and authority." },
  competitors: { title: "Competitor Report", description: "Competitor metrics (estimated) and their positions against our tracked keywords." },
  sitemap: { title: "Sitemap Report", description: "Discovered sitemaps with validation results, plus sitemap inclusion for every page." },
  indexing: { title: "Indexing Report", description: "Indexability per page from the crawl, plus Google's URL Inspection verdict when connected." },
  issues: { title: "SEO Issue Report", description: "All SEO issues with severity, category, status, assignee and recommendation." },
  health: { title: "SEO Health Report", description: "Audit history: scores, pages, indexable pages and issues by severity for every run." },
} as const;

export const LIST_EXPORTS = ["pages", "tasks", "audit"] as const;
export const EXPORT_TYPES = [...(Object.keys(REPORTS) as (keyof typeof REPORTS)[]), ...LIST_EXPORTS] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export interface ExportSet {
  title: string;
  columns: SheetColumn[];
  rows: Record<string, unknown>[];
}

const col = (key: string, header: string, width = 18): SheetColumn => ({ key, header, width });
const dt = (d: Date | null | undefined) => (d ? d.toISOString().replace("T", " ").slice(0, 16) : "");
const pctFmt = (n: number | null | undefined) => (n === null || n === undefined ? "" : `${Math.round(n * 1000) / 10}%`);

async function allPages(): Promise<SeoPage[]> {
  return (await seoCollection<SeoPage>(COLLECTIONS.pages)).find({}).sort({ path: 1 }).toArray();
}

export async function buildExport(viewer: SeoViewer, kind: ExportType, sp: Record<string, string | undefined>): Promise<ExportSet> {
  switch (kind) {
    case "technical": {
      const pages = await allPages();
      return {
        title: REPORTS.technical.title,
        columns: [col("path", "Path", 40), col("status", "HTTP"), col("indexable", "Indexable"), col("reason", "Not indexable because", 24), col("canonical", "Canonical", 40), col("robots", "Robots meta", 20), col("blocked", "Blocked by robots.txt"), col("redirects", "Redirect chain", 40), col("https", "HTTPS"), col("ms", "Response ms"), col("kb", "HTML KB"), col("depth", "Click depth"), col("inSitemap", "In sitemap"), col("linksIn", "Internal links in"), col("score", "Technical score"), col("critical", "Critical"), col("high", "High"), col("crawled", "Crawled")],
        rows: pages.map((p) => ({
          path: p.path,
          status: p.crawl?.status ?? "",
          indexable: p.crawl ? (p.crawl.indexable ? "Yes" : "No") : "",
          reason: p.crawl?.indexabilityReason ?? "",
          canonical: p.crawl?.canonical ?? "",
          robots: p.crawl?.robotsMeta ?? "",
          blocked: p.crawl?.blockedByRobots ? "Yes" : "No",
          redirects: p.crawl?.redirectChain.map((r) => `${r.url} (${r.status})`).join(" → ") ?? "",
          https: p.crawl ? (p.crawl.https ? "Yes" : "No") : "",
          ms: p.crawl?.responseMs ?? "",
          kb: p.crawl ? Math.round(p.crawl.htmlBytes / 1024) : "",
          depth: p.crawl?.depth ?? "",
          inSitemap: p.inSitemap ? "Yes" : "No",
          linksIn: p.crawl?.linksIn ?? "",
          score: p.scores?.technical ?? "",
          critical: p.issueCounts.critical,
          high: p.issueCounts.high,
          crawled: dt(p.lastCrawledAt),
        })),
      };
    }
    case "on_page": {
      const pages = await allPages();
      return {
        title: REPORTS.on_page.title,
        columns: [col("path", "Path", 40), col("title", "Title", 50), col("titleLen", "Title length"), col("description", "Meta description", 60), col("descLen", "Description length"), col("h1Count", "H1 count"), col("h1", "H1", 40), col("h2", "H2 count"), col("images", "Images"), col("noAlt", "Missing alt"), col("og", "Open Graph"), col("twitter", "Twitter card"), col("jsonld", "Schema types", 30), col("focus", "Focus keyword", 24), col("override", "Managed override"), col("score", "On-page score")],
        rows: pages.map((p) => ({
          path: p.path,
          title: p.crawl?.title ?? "",
          titleLen: p.crawl?.title.length ?? "",
          description: p.crawl?.description ?? "",
          descLen: p.crawl?.description.length ?? "",
          h1Count: p.crawl?.h1.length ?? "",
          h1: p.crawl?.h1.join(" | ") ?? "",
          h2: p.crawl?.h2.length ?? "",
          images: p.crawl?.images ?? "",
          noAlt: p.crawl?.imagesMissingAlt ?? "",
          og: p.crawl ? (p.crawl.og.title && p.crawl.og.image ? "Yes" : "Incomplete") : "",
          twitter: p.crawl?.twitter.card ?? "",
          jsonld: p.crawl?.jsonLd.flatMap((j) => j.types).join(", ") ?? "",
          focus: p.focusKeyword,
          override: p.override ? "Yes" : "No",
          score: p.scores?.onPage ?? "",
        })),
      };
    }
    case "keywords": {
      const [{ items }, groups] = await Promise.all([listKeywords({ ...sp, page: 1, pageSize: 100000 }), (await groupsCol()).find({}).toArray()]);
      const gName = new Map(groups.map((g) => [g._id, g.name]));
      const names = await userNames(items.map((k) => k.assigneeId).filter((x): x is string => !!x));
      return {
        title: REPORTS.keywords.title,
        columns: [col("keyword", "Keyword", 32), col("type", "Type"), col("longTail", "Long-tail"), col("intent", "Intent"), col("volume", "Search volume (est.)"), col("difficulty", "Difficulty (est.)"), col("cpc", "CPC (est.)"), col("competition", "Competition (est.)"), col("current", "Current position"), col("previous", "Previous position"), col("best", "Best position"), col("target", "Target position"), col("targetUrl", "Target URL", 30), col("rankingUrl", "Ranking URL", 30), col("positionSource", "Position source", 22), col("country", "Country"), col("language", "Language"), col("device", "Device"), col("engine", "Engine"), col("priority", "Priority"), col("status", "Status"), col("group", "Group"), col("cluster", "Cluster"), col("related", "Related keywords", 30), col("assignee", "Assigned to", 22), col("metricsSource", "Metrics source")],
        rows: items.map((k) => ({
          keyword: k.keyword,
          type: k.type,
          longTail: isLongTail(k.keyword) ? "Yes" : "No",
          intent: k.intent ?? "",
          volume: k.volume ?? "",
          difficulty: k.difficulty ?? "",
          cpc: k.cpc ?? "",
          competition: k.competition ?? "",
          current: k.currentPosition ?? "Not ranking",
          previous: k.previousPosition ?? "",
          best: k.bestPosition ?? "",
          target: k.targetPosition ?? "",
          targetUrl: k.targetUrl,
          rankingUrl: k.rankingUrl ?? "",
          positionSource: k.positionSource ? RANK_SOURCE_LABEL[k.positionSource as keyof typeof RANK_SOURCE_LABEL] ?? k.positionSource : "",
          country: k.country,
          language: k.language,
          device: k.device,
          engine: k.engine,
          priority: k.priority,
          status: k.status,
          group: k.groupId ? gName.get(k.groupId) ?? "" : "",
          cluster: k.cluster,
          related: k.relatedKeywords.join(", "),
          assignee: k.assigneeId ? names.get(k.assigneeId) ?? "" : "",
          metricsSource: k.metricsSource,
        })),
      };
    }
    case "rankings": {
      const { items: kws } = await listKeywords({ ...sp, page: 1, pageSize: 100000 });
      const byId = new Map(kws.map((k) => [k._id, k]));
      const rows = await listHistory({ keywordIds: kws.map((k) => k._id), from: sp.from, to: sp.to, source: sp.source }, 50000);
      return {
        title: REPORTS.rankings.title,
        columns: [col("date", "Date", 12), col("keyword", "Keyword", 32), col("position", "Position"), col("url", "Ranking URL", 30), col("source", "Source", 24), col("impressions", "Impressions"), col("clicks", "Clicks"), col("country", "Country"), col("device", "Device"), col("engine", "Engine")],
        rows: rows.map((r) => {
          const k = byId.get(r.keywordId);
          return { date: r.date, keyword: k?.keyword ?? "", position: r.position ?? "Not ranking", url: r.url ?? "", source: RANK_SOURCE_LABEL[r.source], impressions: r.impressions ?? "", clicks: r.clicks ?? "", country: k?.country ?? "", device: k?.device ?? "", engine: k?.engine ?? "" };
        }),
      };
    }
    case "backlinks": {
      const { items } = await listBacklinks({ ...sp, page: 1, pageSize: 100000 });
      return {
        title: REPORTS.backlinks.title,
        columns: [col("source", "Source URL", 50), col("domain", "Referring domain", 24), col("target", "Target", 30), col("anchor", "Anchor text", 30), col("rel", "Rel"), col("status", "Status"), col("dr", "Domain rating (est.)"), col("firstSeen", "First seen"), col("checked", "Last verified"), col("lost", "Lost at"), col("note", "Check note", 40), col("origin", "Data source")],
        rows: items.map((b) => ({ source: b.sourceUrl, domain: b.sourceDomain, target: b.targetPath, anchor: b.anchor, rel: b.rel, status: b.status, dr: b.domainRating ?? "", firstSeen: b.firstSeen, checked: dt(b.lastCheckedAt), lost: dt(b.lostAt), note: b.checkNote ?? "", origin: b.source })),
      };
    }
    case "competitors": {
      const [comps, ranks, { items: kws }] = await Promise.all([(await competitorsCol()).find({}).toArray(), (await competitorRankingsCol()).find({}).sort({ date: -1 }).toArray(), listKeywords({ page: 1, pageSize: 100000 })]);
      const latest = new Map<string, number | null>();
      for (const r of ranks) if (!latest.has(`${r.competitorId}|${r.normalized}`)) latest.set(`${r.competitorId}|${r.normalized}`, r.position);
      const rows: Record<string, unknown>[] = [];
      for (const c of comps) {
        rows.push({ competitor: c.name, domain: c.domain, keyword: "(summary — estimated)", ours: "", theirs: "", organicKeywords: c.metrics.organicKeywords ?? "", traffic: c.metrics.organicTraffic ?? "", backlinks: c.metrics.backlinks ?? "", domains: c.metrics.referringDomains ?? "", dr: c.metrics.domainRating ?? "", source: c.metrics.source, asOf: c.metrics.asOf ?? "" });
        for (const k of kws) {
          const theirs = latest.get(`${c._id}|${k.normalized}`);
          if (theirs === undefined) continue;
          rows.push({ competitor: c.name, domain: c.domain, keyword: k.keyword, ours: k.currentPosition ?? "Not ranking", theirs: theirs ?? "Not ranking", source: "Competitor positions: estimated · ours: verified" });
        }
      }
      return {
        title: REPORTS.competitors.title,
        columns: [col("competitor", "Competitor", 20), col("domain", "Domain", 22), col("keyword", "Keyword", 30), col("ours", "Our position"), col("theirs", "Their position"), col("organicKeywords", "Organic keywords (est.)"), col("traffic", "Organic traffic (est.)"), col("backlinks", "Backlinks (est.)"), col("domains", "Referring domains (est.)"), col("dr", "Domain rating (est.)"), col("source", "Source", 30), col("asOf", "As of")],
        rows,
      };
    }
    case "sitemap": {
      const [records, pages] = await Promise.all([listSitemapRecords(), allPages()]);
      const rows: Record<string, unknown>[] = records.map((r) => ({ item: r.url, kind: r.kind === "index" ? "Sitemap index" : r.kind === "urlset" ? "Sitemap" : "Invalid", status: r.status, urls: r.urlCount || r.childCount, errors: r.errors.join("; "), warnings: r.warnings.join("; "), checked: dt(r.lastFetchedAt), submitted: r.gsc?.lastSubmitted ?? "", downloaded: r.gsc?.lastDownloaded ?? "" }));
      for (const p of pages) rows.push({ item: p.path, kind: "Page", status: p.crawl?.status ?? "", urls: "", errors: p.inSitemap && p.crawl && !p.crawl.indexable ? `In sitemap but not indexable (${p.crawl.indexabilityReason})` : "", warnings: !p.inSitemap && p.crawl?.indexable ? "Indexable but not in sitemap" : "", inSitemap: p.inSitemap ? "Yes" : "No", excluded: p.sitemap?.exclude ? "Yes" : "No", priority: p.sitemap?.priority ?? "", changefreq: p.sitemap?.changeFrequency ?? "" });
      return {
        title: REPORTS.sitemap.title,
        columns: [col("item", "Sitemap / page", 50), col("kind", "Type"), col("status", "HTTP"), col("urls", "URLs"), col("inSitemap", "In sitemap"), col("excluded", "Excluded in product"), col("priority", "Priority override"), col("changefreq", "Change freq override"), col("errors", "Errors", 50), col("warnings", "Warnings", 50), col("checked", "Checked"), col("submitted", "GSC last submitted"), col("downloaded", "GSC last downloaded")],
        rows,
      };
    }
    case "indexing": {
      const pages = await allPages();
      return {
        title: REPORTS.indexing.title,
        columns: [col("path", "Path", 40), col("status", "HTTP"), col("indexable", "Indexable (crawl)"), col("reason", "Reason", 24), col("inSitemap", "In sitemap"), col("gscVerdict", "Google verdict"), col("coverage", "Google coverage state", 36), col("lastCrawl", "Google last crawl", 20), col("inspected", "Inspected"), col("impressions", "Impressions (28d)"), col("clicks", "Clicks (28d)")],
        rows: pages.map((p) => ({ path: p.path, status: p.crawl?.status ?? "", indexable: p.crawl ? (p.crawl.indexable ? "Yes" : "No") : "", reason: p.crawl?.indexabilityReason ?? "", inSitemap: p.inSitemap ? "Yes" : "No", gscVerdict: p.indexStatus?.verdict ?? "", coverage: p.indexStatus?.coverageState ?? "", lastCrawl: p.indexStatus?.lastCrawlTime ?? "", inspected: dt(p.indexStatus?.checkedAt), impressions: p.search?.impressions ?? "", clicks: p.search?.clicks ?? "" })),
      };
    }
    case "issues": {
      const { items } = await listIssues({ ...sp, page: 1, pageSize: 100000 });
      const names = await userNames(items.map((i) => i.assigneeId).filter((x): x is string => !!x));
      return {
        title: REPORTS.issues.title,
        columns: [col("title", "Issue", 32), col("path", "URL", 36), col("severity", "Severity"), col("category", "Category"), col("status", "Status"), col("assignee", "Assigned to", 22), col("details", "Details", 50), col("description", "Description", 50), col("recommendation", "Recommendation", 50), col("source", "Source"), col("created", "Created"), col("lastSeen", "Last seen"), col("resolved", "Resolved"), col("resolvedBy", "Resolved by")],
        rows: items.map((i) => ({ title: i.title, path: i.path, severity: SEVERITY_META[i.severity].label, category: CATEGORY_LABEL[i.category], status: ISSUE_STATUS_LABEL[i.status], assignee: i.assigneeId ? names.get(i.assigneeId) ?? "" : "", details: i.details.join("; "), description: i.description, recommendation: i.recommendation, source: i.source, created: dt(i.createdAt), lastSeen: dt(i.lastSeenAt), resolved: dt(i.resolvedAt), resolvedBy: i.resolvedBy === "audit" ? "Verified by audit" : i.resolvedBy ? names.get(i.resolvedBy) ?? i.resolvedBy : "" })),
      };
    }
    case "health": {
      const runs = await (await seoCollection<CrawlRun>(COLLECTIONS.runs)).find({}).sort({ startedAt: -1 }).limit(500).toArray();
      return {
        title: REPORTS.health.title,
        columns: [col("started", "Started"), col("status", "Status"), col("origin", "Origin", 26), col("pages", "Pages crawled"), col("indexable", "Indexable"), col("overall", "Overall score"), col("technical", "Technical"), col("onPage", "On-page"), col("content", "Content"), col("critical", "Critical"), col("high", "High"), col("medium", "Medium"), col("low", "Low"), col("passed", "Checks passed"), col("newIssues", "New issues"), col("resolved", "Resolved issues"), col("by", "Run by", 24)],
        rows: runs.map((r) => ({ started: dt(r.startedAt), status: r.status, origin: r.origin, pages: r.pagesCrawled, indexable: r.indexablePages, overall: r.scores?.overall ?? "", technical: r.scores?.technical ?? "", onPage: r.scores?.onPage ?? "", content: r.scores?.content ?? "", critical: r.issueCounts.critical, high: r.issueCounts.high, medium: r.issueCounts.medium, low: r.issueCounts.low, passed: `${r.passedChecks}/${r.totalChecks}`, newIssues: r.newIssues, resolved: r.resolvedIssues, by: r.actorEmail ?? (r.trigger === "schedule" ? "Schedule" : "") })),
      };
    }
    case "pages": {
      const pages = await allPages();
      return {
        title: "Pages",
        columns: [col("path", "Path", 40), col("title", "Title", 40), col("status", "HTTP"), col("indexable", "Indexable"), col("score", "SEO score"), col("words", "Words"), col("clicks", "Clicks (28d)"), col("impressions", "Impressions (28d)"), col("ctr", "CTR"), col("position", "Avg position"), col("focus", "Focus keyword", 24), col("perf", "Performance score")],
        rows: pages.map((p) => ({ path: p.path, title: p.crawl?.title ?? "", status: p.crawl?.status ?? "", indexable: p.crawl ? (p.crawl.indexable ? "Yes" : "No") : "", score: p.scores?.overall ?? "", words: p.crawl?.wordCount ?? "", clicks: p.search?.clicks ?? "", impressions: p.search?.impressions ?? "", ctr: pctFmt(p.search?.ctr), position: p.search ? Math.round(p.search.position * 10) / 10 : "", focus: p.focusKeyword, perf: p.performance?.score ?? "" })),
      };
    }
    case "tasks": {
      const { items } = await listTasks({ ...sp, page: 1, pageSize: 100000 }, viewer);
      const names = await userNames(items.flatMap((t) => [t.assigneeId, t.createdBy]).filter((x): x is string => !!x));
      return {
        title: "SEO Tasks",
        columns: [col("code", "Task"), col("title", "Title", 40), col("type", "Type", 22), col("priority", "Priority"), col("status", "Status"), col("assignee", "Assignee", 22), col("due", "Due"), col("url", "URL", 30), col("created", "Created"), col("createdBy", "Created by", 22), col("completed", "Completed")],
        rows: items.map((t) => ({ code: t.code, title: t.title, type: TASK_TYPES[t.type], priority: TASK_PRIORITIES[t.priority], status: TASK_STATUSES[t.status], assignee: t.assigneeId ? names.get(t.assigneeId) ?? "" : "", due: t.dueDate ?? "", url: t.url ?? "", created: dt(t.createdAt), createdBy: t.createdBy ? names.get(t.createdBy) ?? "" : "", completed: dt(t.completedAt) })),
      };
    }
    case "audit": {
      const items = await exportAudit({ action: sp.action, entity: sp.entity, from: sp.from, to: sp.to, q: sp.search });
      return {
        title: "SEO Audit Log",
        columns: [col("when", "When"), col("actor", "Actor", 28), col("action", "Action"), col("entity", "Entity"), col("subject", "Subject", 36), col("path", "Path", 30), col("summary", "Details", 60)],
        rows: items.map((a) => ({ when: dt(a.createdAt), actor: a.actorEmail ?? a.actorId, action: AUDIT_ACTION_LABEL[a.action] ?? a.action, entity: a.entity, subject: a.entityLabel ?? a.entityId, path: a.path ?? "", summary: a.summary ?? "" })),
      };
    }
  }
}
