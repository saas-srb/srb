import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { redirect } from "next/navigation";
import { Download, FileBarChart } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { PageHeader, Notice } from "@/components/products/rankmax-ai/SeoUi";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { REPORTS } from "@/lib/products/rankmax-ai/exports";
import { getDashboard } from "@/lib/products/rankmax-ai/analytics";
import { listSitemapRecords } from "@/lib/products/rankmax-ai/sitemaps";
import { competitorsCol } from "@/lib/products/rankmax-ai/competitors";

export default async function ReportsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const canExport = can(viewer, "EXPORT_REPORTS");
  const [d, sitemaps, competitors] = await Promise.all([getDashboard(viewer.userId), listSitemapRecords(), (await competitorsCol()).countDocuments({})]);
  const summary: Record<keyof typeof REPORTS, string> = {
    technical: d.scores ? `Technical score ${d.scores.technical} · ${d.run?.pagesCrawled ?? 0} pages` : "No audit yet",
    on_page: d.scores ? `On-page score ${d.scores.onPage}` : "No audit yet",
    keywords: `${d.keywords.tracked} tracked · ${d.keywords.top10} in top 10`,
    rankings: `${d.keywords.ranking} ranking · ${d.keywords.dist.notRanking} not ranking`,
    backlinks: `${d.backlinks.total} backlinks · ${d.backlinks.referringDomains} domains`,
    competitors: `${competitors} competitor(s)`,
    sitemap: `${sitemaps.length} sitemap file(s) · ${sitemaps.reduce((s, r) => s + r.errors.length, 0)} errors`,
    indexing: `${d.indexed.value} ${d.indexed.source === "Search Console URL inspection" ? "indexed (Google)" : "indexable (crawl)"}`,
    issues: `${d.issues.active} open · ${d.issues.bySeverity.critical} critical`,
    health: d.scores ? `Overall score ${d.scores.overall}` : "No audit yet",
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" crumbs={[{ label: "Reports" }]} description="SEO reports as CSV or formatted Excel, built from the same data as the product. Every export is recorded in the audit log." />
      <PanelListFilters>
{!canExport && <Notice tone="info">Downloading reports needs the “Export reports” permission (SEO managers and admins).</Notice>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(REPORTS) as (keyof typeof REPORTS)[]).map((k) => (
          <GlassCard key={k} interactive={false}>
            <CardContent className="flex h-full flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-brand-accent text-white"><FileBarChart className="size-4" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-bold">{REPORTS[k].title}</p>
                  <p className="text-xs text-muted-foreground">{REPORTS[k].description}</p>
                </div>
              </div>
              <p className="text-xs font-medium text-primary">{summary[k]}</p>
              {canExport && (
                <div className="mt-auto flex gap-2">
                  <a href={`/api/rankmax-ai/export/${k}?format=xlsx`} className={buttonVariants({ size: "sm" })}><Download className="size-3.5" data-icon="inline-start" />Excel</a>
                  <a href={`/api/rankmax-ai/export/${k}?format=csv`} className={buttonVariants({ size: "sm", variant: "outline" })}>CSV</a>
                </div>
              )}
            </CardContent>
          </GlassCard>
        ))}
      </div>
</PanelListFilters>
    </div>
  );
}
