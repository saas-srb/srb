import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";
import Link from "next/link";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import { redirect } from "next/navigation";
import {
  Gauge,
  Wrench,
  FileCode2,
  Database,
  KeyRound,
  TrendingUp,
  Trophy,
  Medal,
  Eye,
  MousePointerClick,
  Percent,
  ListOrdered,
  Link2,
  Globe,
  TriangleAlert,
  Siren,
  FilePen,
  ScanSearch,
  PlugZap,
} from "lucide-react";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import KpiLink from "@/components/products/playbook-ai/KpiLink";
import { PageHeader, SectionCard, Notice, TrustBadge } from "@/components/products/rankmax-ai/SeoUi";
import { LineTrend, AreaTrend, ColumnBars, COLORS } from "@/components/products/rankmax-ai/SeoCharts";
import JobButton from "@/components/products/rankmax-ai/JobButton";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { getDashboard } from "@/lib/products/rankmax-ai/analytics";
import { companySiteHost } from "@/lib/platform/tenancy/site-url";
import { formatDateTime } from "@/lib/utils";

export default async function SeoDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const [d, siteHost] = await Promise.all([getDashboard(viewer.userId, { q: sp.q }), companySiteHost()]);
  const sc = d.scores;
  const gsc = d.search.connected;
  const noGsc = <span className="text-sm text-muted-foreground">Connect GSC</span>;

  return (
    <div className="space-y-4">
      <PanelDashboardHeader
        filters={<PanelFilterBar
          fields={[
            { key: "q", label: "Search", type: "search", placeholder: "Filter pages by URL…" },
          ]}
        />}
        title="SEO Performance Overview"
        breadcrumbs={[{ label: "SEO", href: "/rankmax-ai" }, { label: "Dashboard" }]}
        description={
          <>
            Monitor technical health, search visibility and team workload for {siteHost}.
            {d.run && <span className="ml-1">Last audit {formatDateTime(d.run.startedAt)}.</span>}
            {d.search.range && <span className="ml-1">Search data {d.search.range}.</span>}
          </>
        }
        actions={
          can(viewer, "RUN_AUDIT") && (
            <JobButton endpoint="/api/rankmax-ai/audit" label="Run website audit" busyLabel="Auditing… (up to a few minutes)" icon={<ScanSearch className="size-3.5" data-icon="inline-start" />} variant="default" successMessage="Audit complete" />
          )
        }
      />

      {!d.run && (
        <Notice tone="info">
          <strong>No audit yet.</strong> Run the first website audit to populate scores, pages, issues and the internal-link graph.
        </Notice>
      )}
      {!gsc && (
        <Link href={can(viewer, "MANAGE_INTEGRATIONS") ? "/rankmax-ai/settings#integrations" : "/rankmax-ai/overview"} className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm transition-colors hover:bg-amber-500/15">
          <PlugZap className="size-5 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1 text-amber-900 dark:text-amber-200">
            <strong>Google Search Console is not connected</strong>, so impressions, clicks, CTR, average position and organic keywords show “—” rather than a made-up number.
            {!d.integrations.credentials && " Service-account credentials are not configured on the server yet."}
          </span>
        </Link>
      )}

      <KpiGrid>
        <KpiLink href="/rankmax-ai/overview" label="Overall SEO Score" value={sc ? sc.overall : <span className="text-muted-foreground">No audit</span>} accent icon={<Gauge className="size-4" />} tone={sc ? (sc.overall >= 80 ? "up" : sc.overall < 50 ? "down" : undefined) : undefined} />
        <KpiLink href="/rankmax-ai/technical" label="Technical SEO Score" value={sc ? sc.technical : <span className="text-muted-foreground">—</span>} icon={<Wrench className="size-4" />} />
        <KpiLink href="/rankmax-ai/on-page" label="On-Page Score" value={sc ? sc.onPage : <span className="text-muted-foreground">—</span>} icon={<FileCode2 className="size-4" />} />
        <KpiLink href="/rankmax-ai/pages?indexable=yes" label={d.indexed.source === "Search Console URL inspection" ? "Indexed Pages (Google)" : "Indexable Pages (crawl)"} value={d.indexed.value} icon={<Database className="size-4" />} />
        <KpiLink href="/rankmax-ai/rankings#queries" label="Organic Keywords (GSC)" value={d.organicKeywords ?? noGsc} icon={<KeyRound className="size-4" />} />
        <KpiLink href="/rankmax-ai/keywords?position=top100" label="Ranking Keywords" value={<span>{d.keywords.ranking}/{d.keywords.tracked}</span>} icon={<TrendingUp className="size-4" />} />
        <KpiLink href="/rankmax-ai/keywords?position=top3" label="Top 3 Keywords" value={d.keywords.top3} icon={<Trophy className="size-4" />} />
        <KpiLink href="/rankmax-ai/keywords?position=top10" label="Top 10 Keywords" value={d.keywords.top10} icon={<Medal className="size-4" />} />
        <KpiLink href="/rankmax-ai/rankings#search" label="Search Impressions (28d)" value={gsc ? d.search.impressions : noGsc} trend={gsc ? d.search.impressionsTrend : null} icon={<Eye className="size-4" />} />
        <KpiLink href="/rankmax-ai/rankings#search" label="Search Clicks (28d)" value={gsc ? d.search.clicks : noGsc} trend={gsc ? d.search.clicksTrend : null} icon={<MousePointerClick className="size-4" />} />
        <KpiLink href="/rankmax-ai/pages?sortBy=clicks&sortDir=desc" label="CTR (28d)" value={gsc && d.search.ctr !== null ? <span>{d.search.ctr}%</span> : noGsc} icon={<Percent className="size-4" />} />
        <KpiLink href="/rankmax-ai/rankings#search" label="Average Position (28d)" value={gsc && d.search.position !== null ? <span>{d.search.position}</span> : noGsc} icon={<ListOrdered className="size-4" />} />
        <KpiLink href="/rankmax-ai/backlinks" label="Backlinks" value={d.backlinks.total} icon={<Link2 className="size-4" />} />
        <KpiLink href="/rankmax-ai/backlinks?tab=domains" label="Referring Domains" value={d.backlinks.referringDomains} icon={<Globe className="size-4" />} />
        <KpiLink href="/rankmax-ai/issues?status=active" label="SEO Issues" value={d.issues.active} icon={<TriangleAlert className="size-4" />} />
        <KpiLink href="/rankmax-ai/issues?status=active&severity=critical" label="Critical Issues" value={d.issues.bySeverity.critical} tone={d.issues.bySeverity.critical > 0 ? "down" : "up"} icon={<Siren className="size-4" />} />
        <KpiLink href="/rankmax-ai/pages?score=needs" label="Pages Needing Optimization" value={d.needsOptimization} tone={d.needsOptimization > 0 ? "down" : undefined} icon={<FilePen className="size-4" />} />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={<span className="flex items-center gap-2">Organic Traffic Trend <TrustBadge trust="verified" label={d.integrations.trafficConnected ? "GA4" : "GSC clicks"} /></span>}
          description={d.integrations.trafficConnected ? "Organic search sessions & users per day (Google Analytics 4)" : "Search clicks per day — connect GA4 for sessions"}
        >
          {d.integrations.trafficConnected ? (
            <AreaTrend data={d.charts.trafficTrend} series={[{ key: "sessions", label: "Sessions", color: COLORS.primary }, { key: "users", label: "Users", color: COLORS.cyan }]} emptyLabel="No organic traffic recorded yet." />
          ) : (
            <AreaTrend data={d.charts.searchTrend} series={[{ key: "clicks", label: "Clicks", color: COLORS.primary }]} emptyLabel="Connect Google Analytics 4 or Search Console to see organic traffic." />
          )}
        </SectionCard>
        <SectionCard title={<Link href="/rankmax-ai/rankings" className="hover:text-primary">Keyword Ranking Trend</Link>} description="Weekly average position of tracked keywords (lower is better) and how many sit in the top 10">
          <LineTrend data={d.charts.rankTrend} series={[{ key: "avgPosition", label: "Avg position", color: COLORS.primary }, { key: "top10", label: "In top 10", color: COLORS.green, axis: "right" }]} reversed emptyLabel="No positions recorded yet — sync Search Console or record positions in Rankings." />
        </SectionCard>
        <SectionCard title="Search Impressions" description="Per day, Google Search Console">
          <AreaTrend data={d.charts.searchTrend} series={[{ key: "impressions", label: "Impressions", color: COLORS.violet }]} emptyLabel="Connect Search Console to see impressions." />
        </SectionCard>
        <SectionCard title="Search Clicks" description="Per day, Google Search Console">
          <ColumnBars data={d.charts.searchTrend} series={[{ key: "clicks", label: "Clicks", color: COLORS.primary }]} emptyLabel="Connect Search Console to see clicks." />
        </SectionCard>
        <SectionCard title="Average Position" description="Impression-weighted, per day (lower is better)">
          <LineTrend data={d.charts.searchTrend} series={[{ key: "position", label: "Avg position", color: COLORS.amber }]} reversed emptyLabel="Connect Search Console to see average position." />
        </SectionCard>
        <SectionCard title="CTR" description="Click-through rate per day (%)">
          <LineTrend data={d.charts.searchTrend} series={[{ key: "ctr", label: "CTR %", color: COLORS.pink }]} emptyLabel="Connect Search Console to see CTR." />
        </SectionCard>
        <SectionCard title={<Link href="/rankmax-ai/audit" className="hover:text-primary">Indexed Pages</Link>} description="Indexable vs crawled pages per audit run">
          <LineTrend data={d.charts.indexedTrend} series={[{ key: "indexable", label: "Indexable", color: COLORS.green }, { key: "crawled", label: "Crawled", color: COLORS.blue }]} emptyLabel="Run an audit to start tracking indexable pages." />
        </SectionCard>
        <SectionCard title={<Link href="/rankmax-ai/backlinks" className="hover:text-primary">Backlink Growth</Link>} description="Live backlinks over time, with links gained and lost per month">
          <ColumnBars data={d.charts.backlinkTrend} series={[{ key: "added", label: "Gained", color: COLORS.green }, { key: "lost", label: "Lost", color: COLORS.red }]} emptyLabel="No backlinks tracked yet." />
        </SectionCard>
        <SectionCard title={<Link href="/rankmax-ai/backlinks?tab=domains" className="hover:text-primary">Referring Domains</Link>} description="Cumulative unique referring domains">
          <AreaTrend data={d.charts.backlinkTrend} series={[{ key: "domains", label: "Referring domains", color: COLORS.cyan }]} emptyLabel="No backlinks tracked yet." />
        </SectionCard>
        <SectionCard title={<Link href="/rankmax-ai/overview" className="hover:text-primary">SEO Score Trend</Link>} description="Overall, technical, on-page and content scores per audit">
          <LineTrend
            data={d.charts.scoreTrend}
            series={[
              { key: "overall", label: "Overall", color: COLORS.primary },
              { key: "technical", label: "Technical", color: COLORS.blue },
              { key: "onPage", label: "On-page", color: COLORS.green },
              { key: "content", label: "Content", color: COLORS.amber },
            ]}
            emptyLabel="Run an audit to start the score history."
          />
        </SectionCard>
      </div>
    </div>
  );
}
