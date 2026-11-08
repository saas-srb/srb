import { notFound, redirect } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import EditDialog from "@/components/products/playbook-ai/EditDialog";
import ActionButton from "@/components/products/rankmax-ai/ActionButton";
import { PageHeader, SectionCard, Stat, Position, PositionChange, TrustBadge, EmptyState, fmtNum } from "@/components/products/rankmax-ai/SeoUi";
import { LineTrend, COLORS } from "@/components/products/rankmax-ai/SeoCharts";
import { keywordFields, keywordInitial } from "@/components/products/rankmax-ai/keyword-fields";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { getKeyword, listGroups, isLongTail } from "@/lib/products/rankmax-ai/keywords";
import { listHistory, RANK_SOURCE_LABEL } from "@/lib/products/rankmax-ai/rankings";
import { competitorsCol, competitorRankingsCol } from "@/lib/products/rankmax-ai/competitors";
import { topQueries } from "@/lib/products/rankmax-ai/integrations/gsc";
import { getSettings } from "@/lib/products/rankmax-ai/settings";
import { listSeoUsers } from "@/lib/products/rankmax-ai/people";
import { todayIso } from "@/lib/products/rankmax-ai/db";
import { saveKeywordAction, deleteKeywordAction, recordPositionAction } from "@/app/(products)/rankmax-ai/(protected)/actions";

export default async function KeywordDetail({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const { id } = await params;
  const k = await getKeyword(id);
  if (!k) notFound();
  const [history, settings, groups, users, comps, compRanks, queries] = await Promise.all([
    listHistory({ keywordIds: [k._id] }, 1000),
    getSettings(),
    listGroups(),
    listSeoUsers(),
    (await competitorsCol()).find({}).toArray(),
    (await competitorRankingsCol()).find({ normalized: k.normalized }).sort({ date: -1 }).toArray(),
    topQueries(500),
  ]);
  const gsc = queries.find((q) => q.query.toLowerCase().replace(/\s+/g, " ").trim() === k.normalized);
  const chronological = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const series: Record<string, Record<string, number | null>> = {};
  for (const r of chronological) {
    series[r.date] ??= {};
    series[r.date][r.source] = r.position;
  }
  const chart = Object.entries(series).map(([date, v]) => ({ label: date.slice(5), gsc: v.gsc ?? null, manual: v.manual ?? null, import: v.import ?? null }));
  const latestComp = comps.map((c) => ({ c, r: compRanks.find((r) => r.competitorId === c._id) })).filter((x) => x.r);

  return (
    <div className="space-y-4">
      <PageHeader
        title={k.keyword}
        crumbs={[{ label: "Keywords", href: "/rankmax-ai/keywords" }, { label: k.keyword }]}
        description={<>{k.country} · {k.language} · {k.device} · {k.engine} · {k.type}{isLongTail(k.keyword) ? " · long-tail" : ""} · <span className="capitalize">{k.status}</span></>}
        actions={
          <>
            {can(viewer, "MANAGE_RANKINGS") && (
              <EditDialog
                trigger={<Button size="sm" variant="outline"><Plus className="size-3.5" data-icon="inline-start" />Record position</Button>}
                title="Record a position"
                description="A position you checked (incognito, correct country/device). Leave position empty for “not in the top 100”."
                fields={[
                  { key: "date", label: "Date", type: "date" },
                  { key: "position", label: "Position (1–100)", type: "number", min: 1, max: 100 },
                  { key: "url", label: "Ranking URL", type: "text", placeholder: k.targetUrl || "/" },
                ]}
                initial={{ date: todayIso(), position: "", url: k.targetUrl }}
                onSubmit={async (v) => {
                  "use server";
                  return recordPositionAction(k._id, { date: String(v.date ?? ""), position: String(v.position ?? ""), url: String(v.url ?? "") });
                }}
              />
            )}
            {can(viewer, "MANAGE_KEYWORDS") && (
              <EditDialog
                trigger={<Button size="sm" variant="outline"><Pencil className="size-3.5" data-icon="inline-start" />Edit</Button>}
                title="Edit keyword"
                columns={2}
                fields={keywordFields(groups.map((g) => ({ value: g._id, label: g.name })), users.map((u) => ({ value: u.id, label: u.label })))}
                initial={keywordInitial(k, settings.defaults)}
                onSubmit={async (v) => {
                  "use server";
                  return saveKeywordAction(k._id, v);
                }}
              />
            )}
            {can(viewer, "DELETE") && (
              <ActionButton
                action={async () => {
                  "use server";
                  return deleteKeywordAction(k._id);
                }}
                variant="ghost"
                redirectTo="/rankmax-ai/keywords"
                success="Keyword deleted"
                confirm={{ title: `Delete “${k.keyword}”?`, description: "Its whole ranking history is deleted too. Archive it instead to keep the history." }}
              >
                Delete
              </ActionButton>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Current" value={<Position value={k.currentPosition} />} hint={k.positionSource ? RANK_SOURCE_LABEL[k.positionSource as keyof typeof RANK_SOURCE_LABEL] : undefined} />
        <Stat label="Change" value={<PositionChange from={k.previousPosition} to={k.currentPosition} />} hint={k.previousPosition !== null ? `was ${k.previousPosition}` : undefined} />
        <Stat label="Best" value={k.bestPosition ?? "—"} />
        <Stat label="Target" value={k.targetPosition ?? "—"} />
        <Stat label="Volume (est.)" value={fmtNum(k.volume)} />
        <Stat label="Difficulty (est.)" value={k.difficulty ?? "—"} />
        <Stat label="CPC (est.)" value={k.cpc ?? "—"} />
        <Stat label="Competition (est.)" value={k.competition ?? "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Position history" className="lg:col-span-2" description="Lower is better. Sources plotted separately.">
          <LineTrend
            data={chart}
            reversed
            series={[
              { key: "gsc", label: "Search Console avg", color: COLORS.green },
              { key: "manual", label: "Manual check", color: COLORS.primary },
              { key: "import", label: "Rank tracker import", color: COLORS.amber },
            ]}
            emptyLabel="No positions recorded yet."
          />
        </SectionCard>
        <SectionCard title="Targeting">
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Target URL</dt>
            <dd className="truncate">{k.targetUrl || "—"}</dd>
            <dt className="text-muted-foreground">Ranking URL</dt>
            <dd className="truncate">{k.rankingUrl ?? "—"}</dd>
            <dt className="text-muted-foreground">Intent</dt>
            <dd className="capitalize">{k.intent ?? "—"}</dd>
            <dt className="text-muted-foreground">Priority</dt>
            <dd className="capitalize">{k.priority}</dd>
            <dt className="text-muted-foreground">Group</dt>
            <dd>{groups.find((g) => g._id === k.groupId)?.name ?? "—"}</dd>
            <dt className="text-muted-foreground">Cluster</dt>
            <dd>{k.cluster || "—"}</dd>
            <dt className="text-muted-foreground">Metrics source</dt>
            <dd>{k.metricsSource}</dd>
            <dt className="text-muted-foreground">Owner</dt>
            <dd>{users.find((u) => u.id === k.assigneeId)?.label ?? "—"}</dd>
          </dl>
          {k.relatedKeywords.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {k.relatedKeywords.map((r) => <Badge key={r} variant="outline">{r}</Badge>)}
            </div>
          )}
          {k.notes && <p className="mt-3 text-xs whitespace-pre-wrap text-muted-foreground">{k.notes}</p>}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={<span className="flex items-center gap-2">Search Console <TrustBadge trust="verified" /></span>} description="This exact query over the last 28 days, all our pages">
          {gsc ? (
            <div className="grid grid-cols-4 gap-2">
              <Stat label="Clicks" value={gsc.clicks} />
              <Stat label="Impressions" value={gsc.impressions} />
              <Stat label="CTR" value={`${(gsc.ctr * 100).toFixed(1)}%`} />
              <Stat label="Avg pos." value={gsc.position.toFixed(1)} hint={gsc.pages > 1 ? `${gsc.pages} of our pages appear` : undefined} />
            </div>
          ) : (
            <EmptyState title="No Search Console data for this query" />
          )}
        </SectionCard>
        <SectionCard title={<span className="flex items-center gap-2">Competitors <TrustBadge trust="estimated" /></span>} description="Their latest recorded position for this keyword">
          {latestComp.length === 0 ? <EmptyState title="No competitor positions recorded" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Competitor</TableHead><TableHead>Position</TableHead><TableHead>vs us</TableHead><TableHead>As of</TableHead></TableRow></TableHeader>
              <TableBody>
                {latestComp.map(({ c, r }) => (
                  <TableRow key={c._id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell><Position value={r!.position} /></TableCell>
                    <TableCell><PositionChange from={r!.position} to={k.currentPosition} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r!.date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </div>

      <SectionCard title="History">
        {history.length === 0 ? <EmptyState title="No readings yet" /> : (
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Position</TableHead><TableHead>URL</TableHead><TableHead>Source</TableHead><TableHead className="text-right">Impr.</TableHead><TableHead className="text-right">Clicks</TableHead></TableRow></TableHeader>
              <TableBody>
                {history.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell><Position value={r.position} /></TableCell>
                    <TableCell className="text-xs">{r.url ?? "—"}</TableCell>
                    <TableCell><TrustBadge trust={r.source === "gsc" ? "verified" : r.source === "import" ? "estimated" : "manual"} label={RANK_SOURCE_LABEL[r.source]} /></TableCell>
                    <TableCell className="text-right tabular-nums">{r.impressions ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.clicks ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
