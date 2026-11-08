import Link from "next/link";
import { redirect } from "next/navigation";
import { RefreshCw, Download } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import SeoFilterBar from "@/components/products/rankmax-ai/SeoFilterBar";
import CsvImportDialog from "@/components/products/rankmax-ai/CsvImportDialog";
import JobButton from "@/components/products/rankmax-ai/JobButton";
import { PageHeader, SectionCard, Position, PositionChange, TrustBadge, EmptyState, Notice, fmtNum, fmtPct } from "@/components/products/rankmax-ai/SeoUi";
import { LineTrend, AreaTrend, COLORS } from "@/components/products/rankmax-ai/SeoCharts";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { listKeywords } from "@/lib/products/rankmax-ai/keywords";
import { BUCKETS, distribution, listHistory, movers, trendSeries, RANK_SOURCE_LABEL } from "@/lib/products/rankmax-ai/rankings";
import { searchDaily, topQueries } from "@/lib/products/rankmax-ai/integrations/gsc";
import { getSettings, integrationEnv } from "@/lib/products/rankmax-ai/settings";
import { addDaysIso, todayIso } from "@/lib/products/rankmax-ai/db";
import { importRankingsAction } from "@/app/(products)/rankmax-ai/(protected)/actions";
import { formatDateTime } from "@/lib/utils";

export const maxDuration = 300;

export default async function RankingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const sp = await searchParams;
  const granularity = sp.granularity === "day" || sp.granularity === "month" ? sp.granularity : "week";
  const period = [7, 30, 90].includes(Number(sp.period)) ? Number(sp.period) : 30;
  const from = sp.from || addDaysIso(todayIso(), granularity === "month" ? -365 : granularity === "week" ? -120 : -30);
  const to = sp.to || todayIso();

  const [settings, { items: keywords }] = await Promise.all([getSettings(), listKeywords({ search: sp.keyword, url: sp.url, country: sp.country, device: sp.device, status: "tracking", page: 1, pageSize: 100000 })]);
  const filtered = sp.engine ? keywords.filter((k) => k.engine === sp.engine) : keywords;
  const [history, move, daily, queries] = await Promise.all([
    listHistory({ keywordIds: filtered.map((k) => k._id), from, to, source: sp.source }, 50000),
    movers(filtered, period),
    searchDaily(90),
    topQueries(100),
  ]);
  const dist = distribution(filtered);
  const trend = trendSeries(history, granularity);
  const byId = new Map(filtered.map((k) => [k._id, k]));
  const engines = Array.from(new Set(keywords.map((k) => k.engine)));
  const countries = Array.from(new Set(keywords.map((k) => k.country)));
  const canManage = can(viewer, "MANAGE_RANKINGS");
  const gscReady = settings.integrations.gsc.enabled && !!(await integrationEnv()).google;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rankings"
        crumbs={[{ label: "Rankings" }]}
        description={<>Keyword positions over time. <TrustBadge trust="verified" label="GSC" /> = Google&apos;s own average position; <TrustBadge trust="manual" label="Manual" /> = checked by a person; <TrustBadge trust="estimated" label="Import" /> = a rank tracker&apos;s export.</>}
        actions={
          canManage && (
            <>
              {gscReady && <JobButton body={{ job: "gsc-sync" }} label="Sync Search Console" busyLabel="Syncing…" icon={<RefreshCw className="size-3.5" data-icon="inline-start" />} successMessage="Synced {days} days, {keywordsUpdated} keywords updated" />}
              <CsvImportDialog
                title="Import rankings"
                description="Positions from any rank tracker's export. Keywords must already be tracked; blank position = not ranking."
                columns="keyword, position, date (YYYY-MM-DD), url, country, device"
                withSource={false}
                onImport={async (csv) => {
                  "use server";
                  return importRankingsAction(csv);
                }}
              />
            </>
          )
        }
      />
      {!gscReady && <Notice tone="warn">Search Console is not connected, so there are no verified positions. Record positions on a keyword&apos;s page, import a rank-tracker CSV, or connect Search Console in Settings.{settings.integrations.gsc.lastError && ` Last error: ${settings.integrations.gsc.lastError}`}</Notice>}
      {gscReady && settings.integrations.gsc.lastSyncAt && <p className="text-xs text-muted-foreground">Search Console last synced {formatDateTime(settings.integrations.gsc.lastSyncAt)}.</p>}

      <SeoFilterBar
        values={{ keyword: sp.keyword ?? "", url: sp.url ?? "", country: sp.country ?? "", device: sp.device ?? "", engine: sp.engine ?? "", source: sp.source ?? "", from: sp.from ?? "", to: sp.to ?? "", granularity, period: String(period) }}
        fields={[
          { key: "keyword", label: "Keyword", type: "search", placeholder: "Contains…" },
          { key: "url", label: "URL", type: "search", placeholder: "/services/…" },
          { key: "country", label: "Country", type: "select", options: countries.map((c) => ({ value: c, label: c })) },
          { key: "device", label: "Device", type: "select", options: [{ value: "desktop", label: "Desktop" }, { value: "mobile", label: "Mobile" }] },
          { key: "engine", label: "Search engine", type: "select", options: engines.map((e) => ({ value: e, label: e })) },
          { key: "source", label: "Source", type: "select", options: Object.entries(RANK_SOURCE_LABEL).map(([value, label]) => ({ value, label })) },
          { key: "from", label: "From", type: "date" },
          { key: "to", label: "To", type: "date" },
          { key: "granularity", label: "Granularity", type: "select", required: true, options: [{ value: "day", label: "Daily" }, { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }] },
          { key: "period", label: "Change period", type: "select", required: true, options: [{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }] },
        ]}
      />

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {BUCKETS.map((b) => (
          <Link key={b.key} href={`/rankmax-ai/keywords?position=${b.key}`} className="rounded-2xl border border-border/40 bg-card/90 p-3 hover:border-primary/40">
            <p className="text-xs text-muted-foreground">{b.label}</p>
            <p className="text-2xl font-black tabular-nums">{dist[b.key]}</p>
          </Link>
        ))}
        <Link href="/rankmax-ai/keywords?position=none" className="rounded-2xl border border-border/40 bg-card/90 p-3 hover:border-primary/40">
          <p className="text-xs text-muted-foreground">Not ranking</p>
          <p className="text-2xl font-black tabular-nums">{dist.notRanking}</p>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Average position" description={`${granularity === "day" ? "Daily" : granularity === "week" ? "Weekly" : "Monthly"} average of ranked keywords (lower is better)`}>
          <LineTrend data={trend.map((t) => ({ label: t.label, avgPosition: t.avgPosition }))} series={[{ key: "avgPosition", label: "Avg position", color: COLORS.primary }]} reversed emptyLabel="No positions in this range." />
        </SectionCard>
        <SectionCard title="Ranking keywords" description="Keywords in the top 3 / top 10 / top 100">
          <LineTrend data={trend.map((t) => ({ label: t.label, top3: t.top3, top10: t.top10, ranking: t.ranking }))} series={[{ key: "top3", label: "Top 3", color: COLORS.green }, { key: "top10", label: "Top 10", color: COLORS.cyan }, { key: "ranking", label: "Top 100", color: COLORS.violet }]} emptyLabel="No positions in this range." />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={`Improved (${move.improved.length})`} description={`Moved up over the last ${period} days`}>
          <MoverTable rows={move.improved} empty="Nothing moved up in this period." />
        </SectionCard>
        <SectionCard title={`Dropped (${move.dropped.length})`} description={`Moved down over the last ${period} days`}>
          <MoverTable rows={move.dropped} empty="Nothing dropped in this period." />
        </SectionCard>
      </div>

      <div id="search" className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={<span className="flex items-center gap-2">Search impressions & clicks <TrustBadge trust="verified" label="GSC" /></span>} description="Whole site, per day">
          <AreaTrend data={daily.map((d) => ({ label: d.date.slice(5), impressions: d.impressions, clicks: d.clicks }))} series={[{ key: "impressions", label: "Impressions", color: COLORS.violet }, { key: "clicks", label: "Clicks", color: COLORS.primary }]} emptyLabel="Connect Search Console to see search performance." />
        </SectionCard>
        <SectionCard title="Average position (site)" description="Impression-weighted, per day">
          <LineTrend data={daily.map((d) => ({ label: d.date.slice(5), position: Math.round(d.position * 10) / 10 }))} series={[{ key: "position", label: "Avg position", color: COLORS.amber }]} reversed emptyLabel="Connect Search Console to see average position." />
        </SectionCard>
      </div>

      <SectionCard title={<span id="queries" className="flex items-center gap-2">Top search queries (28 days) <TrustBadge trust="verified" label="GSC" /></span>} description="Every query Google showed the site for — the organic keyword set. Add the valuable ones to tracked keywords.">
        {queries.length === 0 ? <EmptyState title="No query data yet" /> : (
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Query</TableHead><TableHead className="text-right">Clicks</TableHead><TableHead className="text-right">Impressions</TableHead><TableHead className="text-right">CTR</TableHead><TableHead className="text-right">Position</TableHead><TableHead className="text-right">Pages</TableHead></TableRow></TableHeader>
              <TableBody>
                {queries.map((q) => (
                  <TableRow key={q.query}>
                    <TableCell>{q.query}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(q.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(q.impressions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPct(q.ctr)}</TableCell>
                    <TableCell className="text-right tabular-nums">{q.position.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{q.pages > 1 ? <span className="text-amber-600">{q.pages}</span> : q.pages}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={`Position history (${history.length})`}
        description={`${from} → ${to}`}
        action={can(viewer, "EXPORT_REPORTS") && (
          <a href={`/api/rankmax-ai/export/rankings?format=csv&from=${from}&to=${to}${sp.source ? `&source=${sp.source}` : ""}${sp.keyword ? `&search=${encodeURIComponent(sp.keyword)}` : ""}`} className={buttonVariants({ variant: "outline", size: "xs" })}>
            <Download className="size-3" data-icon="inline-start" />CSV
          </a>
        )}
      >
        {history.length === 0 ? <EmptyState title="No readings in this range" /> : (
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Keyword</TableHead><TableHead>Position</TableHead><TableHead>URL</TableHead><TableHead>Market</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
              <TableBody>
                {history.slice(0, 300).map((r) => {
                  const k = byId.get(r.keywordId);
                  return (
                    <TableRow key={r._id}>
                      <TableCell className="text-xs">{r.date}</TableCell>
                      <TableCell>{k ? <Link href={`/rankmax-ai/keywords/${k._id}`} className="hover:underline">{k.keyword}</Link> : "—"}</TableCell>
                      <TableCell><Position value={r.position} /></TableCell>
                      <TableCell className="text-xs">{r.url ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{k ? `${k.country} · ${k.device} · ${k.engine}` : ""}</TableCell>
                      <TableCell><TrustBadge trust={r.source === "gsc" ? "verified" : r.source === "import" ? "estimated" : "manual"} label={RANK_SOURCE_LABEL[r.source]} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {history.length > 300 && <p className="mt-2 text-xs text-muted-foreground">Showing 300 of {history.length}; export for the full list.</p>}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function MoverTable({ rows, empty }: { rows: { keyword: { _id: string; keyword: string; targetUrl: string }; from: number | null; to: number | null }[]; empty: string }) {
  if (rows.length === 0) return <EmptyState title={empty} />;
  return (
    <div className="max-h-80 overflow-auto">
      <Table>
        <TableHeader><TableRow><TableHead>Keyword</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Change</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.slice(0, 50).map((m) => (
            <TableRow key={m.keyword._id}>
              <TableCell><Link href={`/rankmax-ai/keywords/${m.keyword._id}`} className="hover:underline">{m.keyword.keyword}</Link></TableCell>
              <TableCell><Position value={m.from} /></TableCell>
              <TableCell><Position value={m.to} /></TableCell>
              <TableCell><PositionChange from={m.from} to={m.to} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
