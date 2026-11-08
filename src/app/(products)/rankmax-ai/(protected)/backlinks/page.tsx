import PanelTabs from "@/components/platform/panel/PanelTabs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Pencil, ShieldCheck, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import EditDialog, { type FieldDef } from "@/components/products/playbook-ai/EditDialog";
import ConfirmDelete from "@/components/products/playbook-ai/ConfirmDelete";
import CsvImportDialog from "@/components/products/rankmax-ai/CsvImportDialog";
import JobButton from "@/components/products/rankmax-ai/JobButton";
import { PageHeader, SectionCard, Stat, TrustBadge, EmptyState } from "@/components/products/rankmax-ai/SeoUi";
import { ColumnBars, AreaTrend, COLORS } from "@/components/products/rankmax-ai/SeoCharts";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { listBacklinks, backlinkOverview, type Backlink } from "@/lib/products/rankmax-ai/backlinks";
import { todayIso } from "@/lib/products/rankmax-ai/db";
import { companySiteHost } from "@/lib/platform/tenancy/site-url";
import { saveBacklinkAction, deleteBacklinkAction, importBacklinksAction } from "@/app/(products)/rankmax-ai/(protected)/actions";
import { cn, formatDateTime } from "@/lib/utils";

export const maxDuration = 300;

const STATUS_CLASS: Record<Backlink["status"], string> = {
  live: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  lost: "bg-rose-500/15 text-rose-600",
  broken: "bg-orange-500/15 text-orange-600",
  unverified: "bg-muted text-muted-foreground",
};

const REL_OPTS = [{ value: "follow", label: "follow" }, { value: "nofollow", label: "nofollow" }, { value: "ugc", label: "ugc" }, { value: "sponsored", label: "sponsored" }];

export default async function BacklinksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const sp = await searchParams;
  const tab = sp.tab === "domains" || sp.tab === "anchors" ? sp.tab : "links";
  const [o, list, siteHost] = await Promise.all([backlinkOverview(), listBacklinks({ ...sp, page: Math.max(Number(sp.page) || 1, 1), pageSize: 30 }), companySiteHost()]);
  const canManage = can(viewer, "MANAGE_BACKLINKS");
  const canDelete = can(viewer, "DELETE");
  const addFields: FieldDef[] = [
    { key: "sourceUrl", label: "Source page URL (the page that links to us)", type: "text", placeholder: "https://example.com/article" },
    { key: "targetUrl", label: "Target on our site", type: "text", placeholder: "/services/web-development" },
    { key: "anchor", label: "Anchor text", type: "text" },
    { key: "rel", label: "Rel", type: "select", options: REL_OPTS },
    { key: "firstSeen", label: "First seen", type: "date" },
    { key: "domainRating", label: "Domain rating 0–100 (third-party, optional)", type: "number", min: 0, max: 100 },
    { key: "notes", label: "Notes", type: "textarea" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Backlinks"
        crumbs={[{ label: "Backlinks" }]}
        description={<>Links from other sites to {siteHost}. Lists come from people or backlink-tool exports (<TrustBadge trust="estimated" />); link <strong>status</strong> is <TrustBadge trust="verified" /> by fetching each source page.</>}
        actions={
          canManage && (
            <>
              <JobButton body={{ job: "verify-backlinks" }} label="Verify all" busyLabel="Checking source pages…" icon={<ShieldCheck className="size-3.5" data-icon="inline-start" />} successMessage="{checked} checked: {live} live, {lost} lost, {broken} broken" />
              <CsvImportDialog
                title="Import backlinks"
                description="From Ahrefs, Semrush, Moz, Search Console “Links” export, etc. Re-importing updates existing rows."
                columns="source_url, target_url, anchor, rel (or nofollow=true/false), first_seen, domain_rating"
                onImport={async (csv, source) => {
                  "use server";
                  return importBacklinksAction(csv, source);
                }}
              />
              <EditDialog trigger={<Button size="sm"><Plus className="size-3.5" data-icon="inline-start" />Add backlink</Button>} title="Add a backlink" fields={addFields} initial={{ sourceUrl: "", targetUrl: "/", anchor: "", rel: "follow", firstSeen: todayIso(), domainRating: "", notes: "" }} onSubmit={async (v) => { "use server"; return saveBacklinkAction(null, v); }} />
            </>
          )
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">
        <Link href="/rankmax-ai/backlinks"><Stat label="Backlinks" value={o.total} /></Link>
        <Link href="/rankmax-ai/backlinks?tab=domains"><Stat label="Referring domains" value={o.referringDomains} /></Link>
        <Link href="/rankmax-ai/backlinks?status=live"><Stat label="Live" value={o.live} /></Link>
        <Link href="/rankmax-ai/backlinks?status=new"><Stat label="New (30d)" value={o.newLast30} /></Link>
        <Link href="/rankmax-ai/backlinks?status=lost"><Stat label="Lost" value={o.lost} hint={`${o.lostLast30} in 30d`} /></Link>
        <Link href="/rankmax-ai/backlinks?status=broken"><Stat label="Broken" value={o.broken} /></Link>
        <Link href="/rankmax-ai/backlinks?status=unverified"><Stat label="Unverified" value={o.unverified} /></Link>
        <Link href="/rankmax-ai/backlinks?rel=follow"><Stat label="Follow" value={o.follow} /></Link>
        <Link href="/rankmax-ai/backlinks?rel=nofollow"><Stat label="Nofollow etc." value={o.nofollow} /></Link>
        <Stat label="Avg domain rating" value={o.avgDr ?? "—"} hint="third-party" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Backlink growth" description="Links gained (by first seen) and lost per month">
          <ColumnBars data={o.growth.map((g) => ({ label: g.month, added: g.added, lost: g.lost }))} series={[{ key: "added", label: "Gained", color: COLORS.green }, { key: "lost", label: "Lost", color: COLORS.red }]} emptyLabel="No backlinks tracked yet." />
        </SectionCard>
        <SectionCard title="Totals over time" description="Live backlinks and cumulative referring domains">
          <AreaTrend data={o.growth.map((g) => ({ label: g.month, backlinks: g.total, domains: g.domains }))} series={[{ key: "backlinks", label: "Backlinks", color: COLORS.primary }, { key: "domains", label: "Referring domains", color: COLORS.cyan }]} emptyLabel="No backlinks tracked yet." />
        </SectionCard>
      </div>

      <PanelTabs active={tab} tabs={([["links", "Backlinks"], ["domains", "Referring domains"], ["anchors", "Anchor text"]] as const).map(([k, label]) => ({ key: k, label, href: `/rankmax-ai/backlinks?tab=${k}` }))} />

      {tab === "links" && (
        <FmsDataTable
          columns={[
            { key: "source", header: "Source", sortable: true },
            { key: "target", header: "Target", sortable: true },
            { key: "anchor", header: "Anchor" },
            { key: "rel", header: "Rel" },
            { key: "status", header: "Status", sortable: true },
            { key: "dr", header: "DR (est.)", sortable: true, align: "right" },
            { key: "firstSeen", header: "First seen", sortable: true },
            { key: "checked", header: "Verified", sortable: true },
            { key: "actions", header: "" },
          ]}
          rows={list.items.map((b) => ({
            id: b._id,
            cells: {
              source: (
                <span className="block max-w-[280px]">
                  <a href={b.sourceUrl} target="_blank" rel="noreferrer nofollow" className="flex items-center gap-1 truncate font-medium hover:underline">{b.sourceDomain}<ExternalLink className="size-3 shrink-0" /></a>
                  <span className="block truncate text-[11px] text-muted-foreground">{b.sourceUrl}</span>
                </span>
              ),
              target: <span className="text-xs">{b.targetPath}</span>,
              anchor: <span className="block max-w-[180px] truncate text-xs">{b.anchor || <em className="text-muted-foreground">none</em>}</span>,
              rel: <Badge variant="outline">{b.rel}</Badge>,
              status: <span title={b.checkNote ?? undefined}><Badge className={STATUS_CLASS[b.status]}>{b.status}</Badge></span>,
              dr: b.domainRating ?? "—",
              firstSeen: <span className="text-xs">{b.firstSeen}</span>,
              checked: <span className="text-xs text-muted-foreground" title={b.checkNote ?? undefined}>{b.lastCheckedAt ? formatDateTime(b.lastCheckedAt) : "never"}</span>,
              actions: (
                <span className="flex justify-end gap-0.5">
                  {canManage && <JobButton body={{ job: "verify-backlinks", ids: [b._id] }} label="Verify" busyLabel="…" size="xs" variant="ghost" successMessage="Checked" />}
                  {canManage && <EditDialog trigger={<Button size="icon-xs" variant="ghost" aria-label="Edit backlink"><Pencil /></Button>} title="Edit backlink" fields={addFields.filter((f) => f.key !== "sourceUrl" && f.key !== "firstSeen")} initial={{ targetUrl: b.targetPath, anchor: b.anchor, rel: b.rel, domainRating: b.domainRating === null ? "" : String(b.domainRating), notes: b.notes }} onSubmit={async (v) => { "use server"; return saveBacklinkAction(b._id, v); }} />}
                  {canDelete && <ConfirmDelete label="Delete backlink" what="this backlink" action={async () => { "use server"; return deleteBacklinkAction(b._id); }} />}
                </span>
              ),
            },
          }))}
          filters={[
            { key: "status", label: "Status", value: sp.status ?? "", options: [{ value: "live", label: "Live" }, { value: "new", label: "New (30 days)" }, { value: "lost", label: "Lost" }, { value: "broken", label: "Broken target" }, { value: "unverified", label: "Unverified" }] },
            { key: "rel", label: "Rel", value: sp.rel ?? "", options: REL_OPTS },
          ]}
          search={sp.search ?? ""}
          searchPlaceholder="Source, anchor or target"
          sortBy={sp.sortBy}
          sortDir={sp.sortDir}
          page={list.page}
          totalPages={list.totalPages}
          total={list.total}
          exportBase={can(viewer, "EXPORT_REPORTS") ? "/api/rankmax-ai/export/backlinks" : undefined}
        />
      )}
      {tab === "domains" && (
        <SectionCard title={`Referring domains (${o.domains.length})`}>
          {o.domains.length === 0 ? <EmptyState title="No referring domains yet" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Domain</TableHead><TableHead className="text-right">Links</TableHead><TableHead className="text-right">Live</TableHead><TableHead className="text-right">Follow</TableHead><TableHead className="text-right">DR (est.)</TableHead><TableHead>First seen</TableHead></TableRow></TableHeader>
              <TableBody>
                {o.domains.map((d) => (
                  <TableRow key={d.domain}>
                    <TableCell><Link href={`/rankmax-ai/backlinks?tab=links&domain=${encodeURIComponent(d.domain)}`} className="font-medium hover:underline">{d.domain}</Link></TableCell>
                    <TableCell className="text-right tabular-nums">{d.links}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.live}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.follow}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.bestDr ?? "—"}</TableCell>
                    <TableCell className="text-xs">{d.firstSeen}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      )}
      {tab === "anchors" && (
        <SectionCard title="Anchor text distribution" description="Across backlinks that are not lost. A natural profile is dominated by brand and URL anchors, not exact-match keywords.">
          {o.anchors.length === 0 ? <EmptyState title="No anchors yet" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Anchor</TableHead><TableHead className="text-right">Links</TableHead><TableHead className="text-right">Share</TableHead></TableRow></TableHeader>
              <TableBody>
                {o.anchors.map((a) => (
                  <TableRow key={a.anchor}>
                    <TableCell>{a.anchor}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{o.total ? `${Math.round((a.count / o.total) * 100)}%` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      )}
    </div>
  );
}
