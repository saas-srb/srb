import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RefreshCw, Send, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import JobButton from "@/components/products/rankmax-ai/JobButton";
import ActionButton from "@/components/products/rankmax-ai/ActionButton";
import { PageHeader, SectionCard, EmptyState, Stat, Notice, TrustBadge } from "@/components/products/rankmax-ai/SeoUi";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { listSitemapRecords } from "@/lib/products/rankmax-ai/sitemaps";
import { allPages } from "@/lib/products/rankmax-ai/pages";
import { getSettings, integrationEnv } from "@/lib/products/rankmax-ai/settings";
import { submitSitemapAction } from "@/app/(products)/rankmax-ai/(protected)/actions";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { formatDateTime } from "@/lib/utils";

export const maxDuration = 300;

export default async function SitemapPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const [records, pages, settings, siteUrl] = await Promise.all([listSitemapRecords(), allPages(), getSettings(), companySiteUrl()]);
  const canManage = can(viewer, "MANAGE_SITEMAP");
  const gscReady = settings.integrations.gsc.enabled && !!(await integrationEnv()).google;
  const inSitemap = pages.filter((p) => p.inSitemap);
  const nonIndexableListed = inSitemap.filter((p) => p.crawl && !p.crawl.indexable);
  const missing = pages.filter((p) => !p.inSitemap && p.crawl?.indexable && !p.sitemap?.exclude);
  const overridden = pages.filter((p) => p.sitemap);
  const urlTotal = records.filter((r) => r.kind === "urlset").reduce((s, r) => s + r.urlCount, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sitemap"
        crumbs={[{ label: "Sitemap" }]}
        description={<>The live <a href={`${siteUrl}/sitemap.xml`} target="_blank" rel="noreferrer" className="text-primary hover:underline">/sitemap.xml</a> is generated from every public route in the site&apos;s code, with the exclusions and priorities set here applied on top (pages set to noindex are dropped automatically).</>}
        actions={canManage && <JobButton body={{ job: "sitemap-discover" }} label="Discover & validate" busyLabel="Reading sitemaps…" icon={<RefreshCw className="size-3.5" data-icon="inline-start" />} successMessage="{sitemaps} sitemap(s), {urls} URLs" />}
      />

      <PanelListFilters>
<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Sitemap files" value={records.length} />
        <Stat label="URLs listed" value={urlTotal} />
        <Stat label="Errors" value={records.reduce((s, r) => s + r.errors.length, 0)} />
        <Link href="/rankmax-ai/issues?status=active&checkId=sitemap_non_indexable"><Stat label="Non-indexable listed" value={nonIndexableListed.length} /></Link>
        <Link href="/rankmax-ai/issues?status=active&checkId=not_in_sitemap"><Stat label="Indexable, not listed" value={missing.length} /></Link>
        <Stat label="Page overrides" value={overridden.length} />
      </div>

      <SectionCard title="Sitemap files" description={`Discovered from ${settings.siteOrigin}/robots.txt, /sitemap.xml and sitemap indexes. Last checked ${records[0] ? formatDateTime(records[0].lastFetchedAt) : "never"}.`}>
        {records.length === 0 ? <EmptyState title="No sitemaps checked yet">Run “Discover & validate” or a website audit.</EmptyState> : (
          <div className="overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Sitemap</TableHead><TableHead>Type</TableHead><TableHead>HTTP</TableHead><TableHead className="text-right">URLs</TableHead><TableHead>Validation</TableHead><TableHead>Search Console <TrustBadge trust="verified" /></TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell className="max-w-[280px]"><a href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate hover:underline">{r.url.replace(/^https?:\/\/[^/]+/, "")}<ExternalLink className="size-3 shrink-0" /></a><span className="text-[11px] text-muted-foreground">via {r.discoveredVia}{r.parent ? ` (${r.parent.replace(/^https?:\/\/[^/]+/, "")})` : ""}</span></TableCell>
                    <TableCell><Badge variant="outline">{r.kind === "index" ? "Sitemap index" : r.kind === "urlset" ? "URL set" : "Invalid"}</Badge></TableCell>
                    <TableCell><Badge className={r.status === 200 ? "bg-emerald-500/15 text-emerald-700" : "bg-rose-500/15 text-rose-600"}>{r.status || "ERR"}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{r.kind === "index" ? `${r.childCount} files` : r.urlCount}</TableCell>
                    <TableCell className="max-w-sm whitespace-normal text-xs">
                      {r.errors.length === 0 && r.warnings.length === 0 && <span className="text-emerald-600">Valid</span>}
                      {r.errors.map((e) => <div key={e} className="text-rose-600">✗ {e}</div>)}
                      {r.warnings.slice(0, 5).map((w) => <div key={w} className="text-amber-600">! {w}</div>)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.gsc ? (
                        <>
                          <div>Submitted {r.gsc.lastSubmitted ? formatDateTime(r.gsc.lastSubmitted) : "—"}</div>
                          <div className="text-muted-foreground">Read {r.gsc.lastDownloaded ? formatDateTime(r.gsc.lastDownloaded) : "—"}{r.gsc.isPending ? " · pending" : ""}</div>
                          {(r.gsc.errors > 0 || r.gsc.warnings > 0) && <div className="text-amber-600">{r.gsc.errors} errors · {r.gsc.warnings} warnings</div>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">{gscReady ? "Not submitted / not synced" : "Not connected"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canManage && gscReady && r.parent === null && r.kind !== "invalid" && (
                        <ActionButton action={async () => { "use server"; return submitSitemapAction(r.url); }} success="Submitted to Search Console" size="xs">
                          <Send className="size-3" data-icon="inline-start" />Submit
                        </ActionButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      {nonIndexableListed.length > 0 && (
        <Notice tone="warn">
          <strong>{nonIndexableListed.length} listed URL(s) are not indexable</strong> — exclude them here or fix them: {nonIndexableListed.slice(0, 5).map((p) => `${p.path} (${p.crawl?.indexabilityReason})`).join(", ")}
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={`Per-page overrides (${overridden.length})`} description="Exclusions, priorities and change frequencies applied to the live sitemap. Edit them on a page's Overview tab.">
          {overridden.length === 0 ? <EmptyState title="No overrides — every discovered route is listed with its default priority" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Page</TableHead><TableHead>Listed</TableHead><TableHead>Priority</TableHead><TableHead>Change freq.</TableHead></TableRow></TableHeader>
              <TableBody>
                {overridden.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell><Link href={`/rankmax-ai/pages/${p._id}`} className="hover:underline">{p.path}</Link></TableCell>
                    <TableCell>{p.sitemap?.exclude ? <Badge className="bg-muted text-muted-foreground">Excluded</Badge> : "Yes"}</TableCell>
                    <TableCell>{p.sitemap?.priority ?? "default"}</TableCell>
                    <TableCell>{p.sitemap?.changeFrequency ?? "default"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
        <SectionCard title={`Indexable pages not in the sitemap (${missing.length})`}>
          {missing.length === 0 ? <EmptyState title="Every indexable page is listed" /> : (
            <ul className="max-h-80 divide-y divide-border/40 overflow-auto text-sm">
              {missing.map((p) => <li key={p._id} className="py-1.5"><Link href={`/rankmax-ai/pages/${p._id}`} className="hover:underline">{p.path}</Link></li>)}
            </ul>
          )}
        </SectionCard>
      </div>
</PanelListFilters>
    </div>
  );
}
