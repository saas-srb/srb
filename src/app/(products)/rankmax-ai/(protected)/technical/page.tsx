import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Gauge } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader, SectionCard, SeverityBadge, EmptyState, Notice, TrustBadge } from "@/components/products/rankmax-ai/SeoUi";
import { DonutChart, BarsChart } from "@/components/products/rankmax-ai/SeoCharts";
import JobButton from "@/components/products/rankmax-ai/JobButton";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { allPages } from "@/lib/products/rankmax-ai/pages";
import { COLLECTIONS, seoCollection } from "@/lib/products/rankmax-ai/db";
import { CHECKS, type CheckId } from "@/lib/products/rankmax-ai/checks";
import { cwvVerdict } from "@/lib/products/rankmax-ai/integrations/pagespeed";
import { getRobotsDoc } from "@/lib/products/rankmax-ai/robots-store";
import { listSitemapRecords } from "@/lib/products/rankmax-ai/sitemaps";
import type { SeoIssue } from "@/lib/products/rankmax-ai/types";
import { formatDateTime } from "@/lib/utils";

export const maxDuration = 300;

const TILES: { title: string; checks: CheckId[] }[] = [
  { title: "Canonical URLs", checks: ["canonical_missing", "canonical_other", "canonical_host_mismatch"] },
  { title: "Redirects", checks: ["redirect_chain", "temporary_redirect", "redirected_in_sitemap", "links_to_redirects"] },
  { title: "4xx / 5xx pages", checks: ["http_4xx", "http_5xx", "fetch_error"] },
  { title: "Index / Noindex", checks: ["noindex", "sitemap_non_indexable", "not_in_sitemap"] },
  { title: "Follow / Nofollow", checks: ["nofollow_meta"] },
  { title: "Crawlability", checks: ["blocked_by_robots"] },
  { title: "HTTPS", checks: ["not_https"] },
  { title: "URL structure", checks: ["url_structure"] },
  { title: "Duplicate URLs & content", checks: ["duplicate_content", "title_duplicate", "description_duplicate"] },
  { title: "Internal linking", checks: ["broken_internal_links", "orphan_page", "low_internal_links"] },
  { title: "Structured data", checks: ["structured_data_invalid", "structured_data_missing"] },
  { title: "Pagination", checks: ["pagination_canonical"] },
  { title: "Mobile", checks: ["missing_viewport"] },
  { title: "Page performance", checks: ["slow_response", "large_html", "render_blocking_scripts", "images_no_dimensions", "cwv_poor", "cwv_needs_improvement"] },
];

export default async function TechnicalPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const [pages, issues, robots, sitemaps] = await Promise.all([
    allPages(),
    (await seoCollection<SeoIssue>(COLLECTIONS.issues)).find({ status: { $in: ["open", "in_progress"] } }, { projection: { checkId: 1 } }).toArray(),
    getRobotsDoc(),
    listSitemapRecords(),
  ]);
  const crawled = pages.filter((p) => p.crawl);
  const count = (checks: CheckId[]) => issues.filter((i) => checks.includes(i.checkId as CheckId)).length;

  const statusBuckets = [
    { key: "2xx", label: "2xx OK", color: "#10b981", test: (s: number) => s >= 200 && s < 300, href: "/rankmax-ai/pages?status=ok" },
    { key: "3xx", label: "3xx redirect", color: "#0ea5e9", test: (s: number) => s >= 300 && s < 400, href: "/rankmax-ai/pages?status=redirect" },
    { key: "4xx", label: "4xx client error", color: "#f97316", test: (s: number) => s >= 400 && s < 500, href: "/rankmax-ai/pages?status=error" },
    { key: "5xx", label: "5xx server error", color: "#ef4444", test: (s: number) => s >= 500, href: "/rankmax-ai/pages?status=error" },
    { key: "err", label: "No response", color: "#6b7280", test: (s: number) => s === 0, href: "/rankmax-ai/pages?status=error" },
  ];
  const statusData = statusBuckets.map((b) => ({ key: b.key, label: b.label, color: b.color, href: b.href, value: crawled.filter((p) => b.test(p.crawl!.redirectChain.length ? p.crawl!.redirectChain[0].status : p.crawl!.status)).length }));
  const reasons = new Map<string, number>();
  for (const p of crawled) {
    const r = p.crawl!.indexable ? "Indexable" : p.crawl!.indexabilityReason ?? "Not indexable";
    reasons.set(r, (reasons.get(r) ?? 0) + 1);
  }
  const depth = new Map<number, number>();
  for (const p of crawled) depth.set(p.crawl!.depth, (depth.get(p.crawl!.depth) ?? 0) + 1);
  const redirects = crawled.filter((p) => p.crawl!.redirectChain.length > 0);
  const errors = crawled.filter((p) => p.crawl!.status === 0 || p.crawl!.status >= 400);
  const directives = crawled.filter((p) => p.crawl!.noindex || p.crawl!.nofollow || p.crawl!.blockedByRobots);
  const withBreadcrumb = crawled.filter((p) => p.crawl!.jsonLd.some((j) => j.types.includes("BreadcrumbList"))).length;
  const paginated = crawled.filter((p) => p.crawl!.paginationNext || p.crawl!.paginationPrev).length;
  const tested = pages.filter((p) => p.performance).sort((a, b) => (a.performance!.score ?? 101) - (b.performance!.score ?? 101));
  const psiCandidates = pages
    .filter((p) => p.crawl?.indexable)
    .sort((a, b) => (b.search?.clicks ?? 0) - (a.search?.clicks ?? 0) || (a.crawl!.depth - b.crawl!.depth))
    .slice(0, 10)
    .map((p) => p.path);

  return (
    <div className="space-y-4">
      <PageHeader title="Technical SEO" crumbs={[{ label: "Technical SEO" }]} description="Crawlability, indexability, redirects, canonicals, HTTPS, structure and performance — from the latest audit." />
      <PanelListFilters>
{crawled.length === 0 && <Notice>Run a website audit to populate technical SEO data.</Notice>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Link href="/rankmax-ai/sitemap" className="rounded-2xl border border-border/40 bg-card/90 p-4 hover:border-primary/40">
          <p className="text-xs text-muted-foreground">XML Sitemap</p>
          <p className="mt-1 text-lg font-bold">{sitemaps.filter((s) => s.kind !== "invalid").length} file(s)</p>
          <p className="text-[11px] text-muted-foreground">{sitemaps.reduce((s, r) => s + r.errors.length, 0)} errors</p>
        </Link>
        <Link href="/rankmax-ai/robots" className="rounded-2xl border border-border/40 bg-card/90 p-4 hover:border-primary/40">
          <p className="text-xs text-muted-foreground">Robots.txt</p>
          <p className="mt-1 text-lg font-bold">{robots.content ? "Managed" : "Code default"}</p>
          <p className="text-[11px] text-muted-foreground">{robots.publishedAt ? `Published ${formatDateTime(robots.publishedAt)}` : "Never edited in product"}</p>
        </Link>
        <div className="rounded-2xl border border-border/40 bg-card/90 p-4">
          <p className="text-xs text-muted-foreground">Breadcrumbs (schema)</p>
          <p className="mt-1 text-lg font-bold">{withBreadcrumb}/{crawled.length}</p>
          <p className="text-[11px] text-muted-foreground">pages with BreadcrumbList</p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/90 p-4">
          <p className="text-xs text-muted-foreground">Pagination</p>
          <p className="mt-1 text-lg font-bold">{paginated}</p>
          <p className="text-[11px] text-muted-foreground">pages with rel=next/prev</p>
        </div>
        <Link href="/rankmax-ai/pages?indexable=yes" className="rounded-2xl border border-border/40 bg-card/90 p-4 hover:border-primary/40">
          <p className="text-xs text-muted-foreground">Indexable pages</p>
          <p className="mt-1 text-lg font-bold">{crawled.filter((p) => p.crawl!.indexable).length}/{crawled.length}</p>
          <p className="text-[11px] text-muted-foreground">from the crawl</p>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {TILES.map((t) => {
          const n = count(t.checks);
          const worst = t.checks.map((c) => CHECKS[c].severity).sort((a, b) => ["critical", "high", "medium", "low"].indexOf(a) - ["critical", "high", "medium", "low"].indexOf(b))[0];
          return (
            <Link key={t.title} href={`/rankmax-ai/issues?status=active${t.checks.length === 1 ? `&checkId=${t.checks[0]}` : `&category=${CHECKS[t.checks[0]].category}`}`} className="rounded-2xl border border-border/40 bg-card/90 p-3 hover:border-primary/40">
              <p className="truncate text-xs text-muted-foreground">{t.title}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xl font-black tabular-nums">{n}</span>
                {n > 0 ? <SeverityBadge severity={worst} /> : <SeverityBadge severity="passed" />}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="HTTP status" description="First response per crawled URL">
          <DonutChart data={statusData} emptyLabel="No crawl data." />
        </SectionCard>
        <SectionCard title="Indexability" description="Why pages can or can't be indexed">
          <BarsChart data={Array.from(reasons.entries()).map(([label, value]) => ({ key: label, label, value, href: label === "Indexable" ? "/rankmax-ai/pages?indexable=yes" : "/rankmax-ai/pages?indexable=no" }))} emptyLabel="No crawl data." />
        </SectionCard>
        <SectionCard title="Crawl depth" description="Clicks from the home page (sitemap-only pages count as 1)">
          <BarsChart data={Array.from(depth.entries()).sort((a, b) => a[0] - b[0]).map(([d, value]) => ({ key: String(d), label: `Depth ${d}`, value }))} emptyLabel="No crawl data." />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={`Redirects (${redirects.length})`} description="301/302 chains found while crawling">
          {redirects.length === 0 ? <EmptyState title="No redirects" /> : (
            <div className="max-h-80 overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>URL</TableHead><TableHead>Hops</TableHead><TableHead>Final</TableHead></TableRow></TableHeader>
                <TableBody>
                  {redirects.map((p) => (
                    <TableRow key={p._id}>
                      <TableCell><Link href={`/rankmax-ai/pages/${p._id}`} className="hover:underline">{p.path}</Link></TableCell>
                      <TableCell>{p.crawl!.redirectChain.map((c) => <Badge key={c.url} className={c.status === 301 || c.status === 308 ? "mr-1 bg-sky-500/15 text-sky-700" : "mr-1 bg-amber-500/15 text-amber-700"}>{c.status}</Badge>)}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">{p.crawl!.finalUrl}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
        <SectionCard title={`404 / error pages (${errors.length})`} description="URLs that returned an error or no response">
          {errors.length === 0 ? <EmptyState title="No error pages" /> : (
            <div className="max-h-80 overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>URL</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Linked from</TableHead></TableRow></TableHeader>
                <TableBody>
                  {errors.map((p) => (
                    <TableRow key={p._id}>
                      <TableCell><Link href={`/rankmax-ai/pages/${p._id}`} className="hover:underline">{p.path}</Link></TableCell>
                      <TableCell><Badge className="bg-rose-500/15 text-rose-600">{p.crawl!.status || p.crawl!.error}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{p.crawl!.linksIn}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title={`Robots directives (${directives.length})`} description="Pages with noindex, nofollow or blocked by robots.txt">
        {directives.length === 0 ? <EmptyState title="Every crawled page is index, follow and crawlable" /> : (
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>URL</TableHead><TableHead>Meta robots / X-Robots-Tag</TableHead><TableHead>robots.txt</TableHead><TableHead>In sitemap</TableHead></TableRow></TableHeader>
              <TableBody>
                {directives.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell><Link href={`/rankmax-ai/pages/${p._id}`} className="hover:underline">{p.path}</Link></TableCell>
                    <TableCell className="text-xs">{[p.crawl!.robotsMeta, p.crawl!.xRobotsTag].filter(Boolean).join(" · ") || "—"}</TableCell>
                    <TableCell>{p.crawl!.blockedByRobots ? <Badge className="bg-rose-500/15 text-rose-600">Blocked</Badge> : "Allowed"}</TableCell>
                    <TableCell>{p.inSitemap ? "Yes" : "No"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={<span className="flex items-center gap-2">Core Web Vitals <TrustBadge trust="measured" label="PageSpeed Insights" /></span>}
        description="Lab metrics (LCP, CLS, TBT) and Google's real-user category, tested against the public production URL"
        action={can(viewer, "RUN_AUDIT") && psiCandidates.length > 0 && <JobButton body={{ job: "pagespeed", paths: psiCandidates }} label={`Test top ${psiCandidates.length} pages`} busyLabel="Testing… (≈20s per page)" icon={<Gauge className="size-3.5" data-icon="inline-start" />} successMessage="Tested {checked} page(s)" />}
      >
        {tested.length === 0 ? <EmptyState title="No pages tested yet">Test pages here or from a page&apos;s detail view.</EmptyState> : (
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>URL</TableHead><TableHead className="text-right">Score</TableHead><TableHead className="text-right">LCP</TableHead><TableHead className="text-right">CLS</TableHead><TableHead className="text-right">TBT</TableHead><TableHead>Real users</TableHead><TableHead>Verdict</TableHead><TableHead>Tested</TableHead></TableRow></TableHeader>
              <TableBody>
                {tested.map((p) => {
                  const perf = p.performance!;
                  const v = cwvVerdict(perf);
                  return (
                    <TableRow key={p._id}>
                      <TableCell><Link href={`/rankmax-ai/pages/${p._id}`} className="hover:underline">{p.path}</Link></TableCell>
                      <TableCell className="text-right tabular-nums">{perf.score ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{perf.lcpMs !== null ? `${(perf.lcpMs / 1000).toFixed(1)}s` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{perf.cls ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{perf.tbtMs !== null ? `${Math.round(perf.tbtMs)}ms` : "—"}</TableCell>
                      <TableCell className="text-xs">{perf.fieldCategory ?? "—"}</TableCell>
                      <TableCell>{perf.error ? <span className="text-xs text-rose-600">{perf.error}</span> : v.level === "poor" ? <Badge className="bg-rose-500/15 text-rose-600">Poor</Badge> : v.level === "needs" ? <Badge className="bg-amber-500/15 text-amber-700">Needs work</Badge> : <Badge className="bg-emerald-500/15 text-emerald-700">Good</Badge>}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(perf.checkedAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
</PanelListFilters>
    </div>
  );
}
