import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import { PageHeader, SectionCard, EmptyState, Notice, Stat } from "@/components/products/rankmax-ai/SeoUi";
import { getViewer } from "@/lib/products/rankmax-ai/viewer";
import { listPages, allPages } from "@/lib/products/rankmax-ai/pages";
import { brokenLinks, redirectingLinks, linkOpportunities, importantLowLinked } from "@/lib/products/rankmax-ai/links";
import { COLLECTIONS, seoCollection } from "@/lib/products/rankmax-ai/db";
import type { SeoLink } from "@/lib/products/rankmax-ai/types";

export default async function InternalLinksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const sp = await searchParams;
  const [pages, list, broken, brokenExt, redirecting, opportunities, lowLinked, totalLinks] = await Promise.all([
    allPages(),
    listPages({ search: sp.search, indexable: "yes", sortBy: sp.sortBy ?? "linksIn", sortDir: sp.sortDir ?? "asc", page: Math.max(Number(sp.page) || 1, 1), pageSize: 25 }),
    brokenLinks(true),
    brokenLinks(false, 200),
    redirectingLinks(),
    linkOpportunities(100),
    importantLowLinked(),
    (await seoCollection<SeoLink>(COLLECTIONS.links)).countDocuments({ internal: true }),
  ]);
  const idByPath = new Map(pages.map((p) => [p.path, p._id]));
  const indexable = pages.filter((p) => p.crawl?.indexable);
  const orphans = indexable.filter((p) => p.path !== "/" && (p.crawl?.linksIn ?? 0) === 0);
  const avgIn = indexable.length ? Math.round((indexable.reduce((s, p) => s + (p.crawl?.linksIn ?? 0), 0) / indexable.length) * 10) / 10 : 0;
  const pageLink = (path: string) => (idByPath.has(path) ? <Link href={`/rankmax-ai/pages/${idByPath.get(path)}?tab=links`} className="hover:underline">{path}</Link> : path);

  return (
    <div className="space-y-4">
      <PageHeader title="Internal Links" crumbs={[{ label: "Internal Links" }]} description="The site's internal link graph from the latest audit: who links to whom, what's broken, what's orphaned, and where a link would help most." />
      {pages.length === 0 && <Notice>Run a website audit to build the link graph.</Notice>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Internal links" value={totalLinks} />
        <Stat label="Avg incoming / page" value={avgIn} />
        <Stat label="Orphan pages" value={orphans.length} />
        <Stat label="Broken internal links" value={broken.length} />
        <Stat label="Links to redirects" value={redirecting.length} />
        <Stat label="Link opportunities" value={opportunities.length} />
      </div>

      <SectionCard title={`Link opportunities (${opportunities.length})`} description="Pages whose text already mentions another page's focus/target keyword but doesn't link to it — add a contextual link with that phrase as anchor text.">
        {opportunities.length === 0 ? <EmptyState title="No opportunities found">Set focus keywords on pages (or target URLs on tracked keywords) to generate suggestions.</EmptyState> : (
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Add a link on</TableHead><TableHead>Pointing to</TableHead><TableHead>Anchor</TableHead><TableHead>Context</TableHead></TableRow></TableHeader>
              <TableBody>
                {opportunities.map((o) => (
                  <TableRow key={`${o.from}-${o.to}`}>
                    <TableCell>{pageLink(o.from)}</TableCell>
                    <TableCell>{pageLink(o.to)}</TableCell>
                    <TableCell><Badge className="bg-primary/10 text-primary">{o.phrase}</Badge></TableCell>
                    <TableCell className="max-w-md whitespace-normal text-xs text-muted-foreground">{o.context}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={`Broken internal links (${broken.length})`} description="Links to our own URLs that return an error">
          {broken.length === 0 ? <EmptyState title="No broken internal links" /> : (
            <div className="max-h-80 overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>On page</TableHead><TableHead>Links to</TableHead><TableHead>Status</TableHead><TableHead>Anchor</TableHead></TableRow></TableHeader>
                <TableBody>{broken.map((l) => <TableRow key={l._id}><TableCell>{pageLink(l.from)}</TableCell><TableCell>{l.to}</TableCell><TableCell><Badge className="bg-rose-500/15 text-rose-600">{l.status || "ERR"}</Badge></TableCell><TableCell className="max-w-[160px] truncate text-xs">{l.anchor}</TableCell></TableRow>)}</TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
        <SectionCard title={`Important pages with few links (${lowLinked.length})`} description="Pages that target tracked keywords, earn search clicks or have high sitemap priority, but receive few internal links">
          {lowLinked.length === 0 ? <EmptyState title="None" /> : (
            <div className="max-h-80 overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Page</TableHead><TableHead className="text-right">Links in</TableHead><TableHead>Why it matters</TableHead></TableRow></TableHeader>
                <TableBody>{lowLinked.map(({ page, why }) => <TableRow key={page._id}><TableCell>{pageLink(page.path)}</TableCell><TableCell className="text-right tabular-nums">{page.crawl?.linksIn ?? 0}</TableCell><TableCell className="text-xs text-muted-foreground">{why}</TableCell></TableRow>)}</TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
        <SectionCard title={`Orphan pages (${orphans.length})`} description="Indexable pages no crawled page links to">
          {orphans.length === 0 ? <EmptyState title="No orphan pages" /> : (
            <ul className="max-h-80 divide-y divide-border/40 overflow-auto text-sm">
              {orphans.map((p) => <li key={p._id} className="flex items-center justify-between py-1.5">{pageLink(p.path)}<span className="text-xs text-muted-foreground">{p.inSitemap ? "sitemap only" : "not linked"}</span></li>)}
            </ul>
          )}
        </SectionCard>
        <SectionCard title={`Links to redirecting URLs (${redirecting.length})`} description="Update these to the final URL to skip a hop">
          {redirecting.length === 0 ? <EmptyState title="None" /> : (
            <div className="max-h-80 overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>On page</TableHead><TableHead>Links to</TableHead></TableRow></TableHeader>
                <TableBody>{redirecting.map((l) => <TableRow key={l._id}><TableCell>{pageLink(l.from)}</TableCell><TableCell>{l.to}</TableCell></TableRow>)}</TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title={`Broken external links (${brokenExt.length})`} description="Outbound links returning 404/410/5xx or no response (hosts that block bots are not counted)">
        {brokenExt.length === 0 ? <EmptyState title="No broken external links" /> : (
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>On page</TableHead><TableHead>Links to</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{brokenExt.map((l) => <TableRow key={l._id}><TableCell>{pageLink(l.from)}</TableCell><TableCell className="max-w-[360px] truncate text-xs">{l.to}</TableCell><TableCell><Badge className="bg-rose-500/15 text-rose-600">{l.status || "ERR"}</Badge></TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <FmsDataTable
        columns={[
          { key: "path", header: "Page", sortable: true },
          { key: "linksIn", header: "Incoming", sortable: true, align: "right" },
          { key: "out", header: "Outgoing", align: "right" },
          { key: "ext", header: "External", align: "right" },
          { key: "broken", header: "Broken out", align: "right" },
          { key: "depth", header: "Depth", align: "right" },
        ]}
        rows={list.items.map((p) => ({
          id: p._id,
          href: `/rankmax-ai/pages/${p._id}?tab=links`,
          cells: {
            path: p.path,
            linksIn: (p.crawl?.linksIn ?? 0) === 0 ? <span className="text-rose-600">0</span> : p.crawl?.linksIn,
            out: p.crawl?.linksOut ?? 0,
            ext: p.crawl?.externalOut ?? 0,
            broken: p.crawl?.brokenLinksOut ? <span className="text-rose-600">{p.crawl.brokenLinksOut}</span> : 0,
            depth: p.crawl?.depth ?? "—",
          },
        }))}
        search={sp.search ?? ""}
        searchPlaceholder="Path"
        sortBy={sp.sortBy ?? "linksIn"}
        sortDir={sp.sortDir ?? "asc"}
        page={list.page}
        totalPages={list.totalPages}
        total={list.total}
      />
    </div>
  );
}
