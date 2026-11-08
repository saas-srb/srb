import { notFound, redirect } from "next/navigation";
import { Pencil, Plus, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import EditDialog from "@/components/products/playbook-ai/EditDialog";
import CsvImportDialog from "@/components/products/rankmax-ai/CsvImportDialog";
import JobButton from "@/components/products/rankmax-ai/JobButton";
import ActionButton from "@/components/products/rankmax-ai/ActionButton";
import { PageHeader, SectionCard, Stat, TrustBadge, EmptyState, Position, PositionChange, fmtNum, Notice } from "@/components/products/rankmax-ai/SeoUi";
import { COMPETITOR_FIELDS, competitorInitial } from "@/components/products/rankmax-ai/competitor-fields";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { compareCompetitor, ourVisibility } from "@/lib/products/rankmax-ai/competitors";
import { todayIso } from "@/lib/products/rankmax-ai/db";
import { saveCompetitorAction, deleteCompetitorAction, importCompetitorRankingsAction, recordCompetitorPositionAction } from "@/app/(products)/rankmax-ai/(protected)/actions";
import { formatDateTime } from "@/lib/utils";

export const maxDuration = 300;

export default async function CompetitorDetail({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const { id } = await params;
  const [x, ourVis] = await Promise.all([compareCompetitor(id), ourVisibility()]);
  if (!x) notFound();
  const c = x.competitor;
  const canManage = can(viewer, "MANAGE_COMPETITORS");

  return (
    <div className="space-y-4">
      <PageHeader
        title={c.name}
        crumbs={[{ label: "Competitors", href: "/rankmax-ai/competitors" }, { label: c.name }]}
        description={<><a href={`https://${c.domain}`} target="_blank" rel="noreferrer nofollow" className="text-primary hover:underline">{c.domain}</a> · metrics <TrustBadge trust="estimated" label={c.metrics.source || "Estimated"} /> {c.metrics.asOf && `as of ${c.metrics.asOf}`}</>}
        actions={
          canManage && (
            <>
              <JobButton body={{ job: "competitor-sitemap", id: c._id }} label="Read their sitemap" busyLabel="Reading…" icon={<MapIcon className="size-3.5" data-icon="inline-start" />} successMessage="{urlCount} URLs found" />
              <CsvImportDialog title="Import competitor positions" description="Their keyword positions from an SEO tool (organic research / ranking export)." columns="keyword, position, url, volume, date" onImport={async (csv, source) => { "use server"; return importCompetitorRankingsAction(c._id, csv, source); }} />
              <EditDialog trigger={<Button size="sm" variant="outline"><Plus className="size-3.5" data-icon="inline-start" />Position</Button>} title="Record a competitor position" fields={[{ key: "keyword", label: "Keyword", type: "text" }, { key: "position", label: "Position (empty = not ranking)", type: "number", min: 1, max: 100 }, { key: "url", label: "Their ranking URL", type: "text" }, { key: "date", label: "Date", type: "date" }]} initial={{ keyword: "", position: "", url: "", date: todayIso() }} onSubmit={async (v) => { "use server"; return recordCompetitorPositionAction(c._id, v); }} />
              <EditDialog trigger={<Button size="sm" variant="outline"><Pencil className="size-3.5" data-icon="inline-start" />Edit</Button>} title="Edit competitor" columns={2} fields={COMPETITOR_FIELDS} initial={competitorInitial(c)} onSubmit={async (v) => { "use server"; return saveCompetitorAction(c._id, v); }} />
              {can(viewer, "DELETE") && <ActionButton action={async () => { "use server"; return deleteCompetitorAction(c._id); }} variant="ghost" redirectTo="/rankmax-ai/competitors" success="Competitor removed" confirm={{ title: `Remove ${c.name}?`, description: "Their recorded positions are deleted too." }}>Delete</ActionButton>}
            </>
          )
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Visibility (them)" value={x.visibility !== null ? `${x.visibility}%` : "—"} hint={ourVis !== null ? `us: ${ourVis}%` : undefined} />
        <Stat label="Shared keywords" value={x.sharedKeywords} />
        <Stat label="Organic keywords" value={fmtNum(c.metrics.organicKeywords)} hint="est." />
        <Stat label="Top-10 keywords" value={fmtNum(c.metrics.rankingKeywords)} hint="est." />
        <Stat label="Organic traffic" value={fmtNum(c.metrics.organicTraffic)} hint="est." />
        <Stat label="Backlinks" value={fmtNum(c.metrics.backlinks)} hint="est." />
        <Stat label="Referring domains" value={fmtNum(c.metrics.referringDomains)} hint="est." />
        <Stat label="Sitemap URLs" value={c.sitemap ? fmtNum(c.sitemap.urlCount) : "—"} hint={c.sitemap ? `measured ${formatDateTime(c.sitemap.checkedAt)}` : "not read yet"} />
      </div>
      {c.sitemap?.error && <Notice tone="warn">Sitemap: {c.sitemap.error}</Notice>}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={`Keyword gaps (${x.gaps.length})`} description="They rank top 20 and we don't, or they're 5+ places ahead">
          {x.gaps.length === 0 ? <EmptyState title="No gaps found">Import or record their positions to compare.</EmptyState> : (
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Keyword</TableHead><TableHead>Them</TableHead><TableHead>Us</TableHead><TableHead className="text-right">Volume</TableHead></TableRow></TableHeader>
                <TableBody>
                  {x.gaps.map((g) => (
                    <TableRow key={g.keyword}>
                      <TableCell>{g.keyword}{!g.tracked && <Badge className="ml-1 h-4 bg-sky-500/15 px-1 text-[9px] text-sky-700">not tracked</Badge>}</TableCell>
                      <TableCell><Position value={g.theirPosition} /></TableCell>
                      <TableCell><Position value={g.ourPosition} /></TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(g.volume)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
        <SectionCard title={`Where we win (${x.wins.length})`} description="Keywords where we outrank them">
          {x.wins.length === 0 ? <EmptyState title="Nothing yet" /> : (
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Keyword</TableHead><TableHead>Us</TableHead><TableHead>Them</TableHead></TableRow></TableHeader>
                <TableBody>{x.wins.map((w) => <TableRow key={w.keyword}><TableCell>{w.keyword}</TableCell><TableCell><Position value={w.ourPosition} /></TableCell><TableCell><Position value={w.theirPosition} /></TableCell></TableRow>)}</TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
        <SectionCard title={`Their ranking changes (${x.changes.length})`} description="Between their two latest recorded positions per keyword">
          {x.changes.length === 0 ? <EmptyState title="No changes recorded" /> : (
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Keyword</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Change</TableHead></TableRow></TableHeader>
                <TableBody>{x.changes.map((ch) => <TableRow key={ch.keyword}><TableCell>{ch.keyword}</TableCell><TableCell><Position value={ch.from} /></TableCell><TableCell><Position value={ch.to} /></TableCell><TableCell><PositionChange from={ch.from} to={ch.to} /></TableCell></TableRow>)}</TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
        <SectionCard title={`Content gaps (${x.contentGaps.length})`} description="Topics in several of their URLs that none of our URLs, titles or H1s cover (from their sitemap)">
          {x.contentGaps.length === 0 ? <EmptyState title={c.sitemap ? "No content gaps found" : "Read their sitemap first"} /> : (
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Topic</TableHead><TableHead>Example URLs</TableHead></TableRow></TableHeader>
                <TableBody>{x.contentGaps.map((g) => <TableRow key={g.topic}><TableCell className="font-medium">{g.topic}</TableCell><TableCell className="text-xs text-muted-foreground">{g.examples.map((e) => <div key={e}>{e}</div>)}</TableCell></TableRow>)}</TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title={<span className="flex items-center gap-2">Top pages <TrustBadge trust="estimated" /></span>}>
        {c.topPages.length === 0 ? <EmptyState title="No top pages recorded" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>URL</TableHead><TableHead className="text-right">Traffic</TableHead><TableHead className="text-right">Keywords</TableHead></TableRow></TableHeader>
            <TableBody>{c.topPages.map((p) => <TableRow key={p.url}><TableCell className="max-w-md truncate">{p.url}</TableCell><TableCell className="text-right tabular-nums">{fmtNum(p.traffic)}</TableCell><TableCell className="text-right tabular-nums">{fmtNum(p.keywords)}</TableCell></TableRow>)}</TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
