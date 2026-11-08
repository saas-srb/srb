import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import EditDialog from "@/components/products/playbook-ai/EditDialog";
import { PageHeader, ScoreBadge, fmtNum, fmtPct } from "@/components/products/rankmax-ai/SeoUi";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { listPages } from "@/lib/products/rankmax-ai/pages";
import { addPageAction } from "@/app/(products)/rankmax-ai/(protected)/actions";
import { formatDateTime } from "@/lib/utils";

export default async function PagesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const sp = await searchParams;
  const list = await listPages({ ...sp, page: Math.max(Number(sp.page) || 1, 1), pageSize: 40 });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pages"
        crumbs={[{ label: "Pages" }]}
        description="Every URL the audit found (or that you registered), with status, scores, content size, links and search performance."
        actions={
          can(viewer, "CREATE") && (
            <EditDialog
              trigger={<Button size="sm"><Plus className="size-3.5" data-icon="inline-start" />Add page</Button>}
              title="Add a page"
              description="Register a path so the next audit crawls it even if nothing links to it yet."
              fields={[{ key: "path", label: "Path", type: "text", placeholder: "/services/new-service" }]}
              initial={{ path: "" }}
              onSubmit={async (v) => {
                "use server";
                return addPageAction(String(v.path ?? ""));
              }}
            />
          )
        }
      />
      <FmsDataTable
        columns={[
          { key: "path", header: "Page", sortable: true },
          { key: "status", header: "HTTP" },
          { key: "indexable", header: "Indexable" },
          { key: "score", header: "SEO", sortable: true },
          { key: "words", header: "Words", sortable: true, align: "right" },
          { key: "linksIn", header: "Links in", sortable: true, align: "right" },
          { key: "clicks", header: "Clicks 28d", sortable: true, align: "right" },
          { key: "impressions", header: "Impr. 28d", align: "right" },
          { key: "ctr", header: "CTR", align: "right" },
          { key: "sitemap", header: "Sitemap" },
          { key: "crawled", header: "Crawled", sortable: true },
        ]}
        rows={list.items.map((p) => ({
          id: p._id,
          href: `/rankmax-ai/pages/${p._id}`,
          cells: {
            path: (
              <span className="block max-w-[320px]">
                <span className="block truncate">{p.path}</span>
                <span className="block truncate text-[11px] font-normal text-muted-foreground">{p.crawl?.title}</span>
              </span>
            ),
            status: p.crawl ? <Badge className={p.crawl.status === 200 && !p.crawl.redirectChain.length ? "bg-emerald-500/15 text-emerald-700" : p.crawl.redirectChain.length ? "bg-sky-500/15 text-sky-700" : "bg-rose-500/15 text-rose-600"}>{p.crawl.redirectChain.length ? p.crawl.redirectChain[0].status : p.crawl.status || "ERR"}</Badge> : <span className="text-xs text-muted-foreground">Not crawled</span>,
            indexable: p.crawl ? (p.crawl.indexable ? "Yes" : <span className="text-xs text-amber-600">{p.crawl.indexabilityReason}</span>) : "—",
            score: <ScoreBadge score={p.scores?.overall} />,
            words: p.crawl ? fmtNum(p.crawl.wordCount) : "—",
            linksIn: p.crawl?.linksIn ?? "—",
            clicks: p.search ? fmtNum(p.search.clicks) : "—",
            impressions: p.search ? fmtNum(p.search.impressions) : "—",
            ctr: p.search ? fmtPct(p.search.ctr) : "—",
            sitemap: p.sitemap?.exclude ? <Badge className="bg-muted text-muted-foreground">Excluded</Badge> : p.inSitemap ? "Yes" : "No",
            crawled: <span className="text-xs text-muted-foreground">{p.lastCrawledAt ? formatDateTime(p.lastCrawledAt) : "—"}</span>,
          },
        }))}
        filters={[
          { key: "status", label: "HTTP", value: sp.status ?? "", options: [{ value: "ok", label: "200 OK" }, { value: "redirect", label: "Redirects" }, { value: "error", label: "Errors" }] },
          { key: "indexable", label: "Indexable", value: sp.indexable ?? "", options: [{ value: "yes", label: "Indexable" }, { value: "no", label: "Not indexable" }] },
          { key: "sitemap", label: "Sitemap", value: sp.sitemap ?? "", options: [{ value: "in", label: "In sitemap" }, { value: "out", label: "Not in sitemap" }, { value: "excluded", label: "Excluded in product" }] },
          { key: "score", label: "SEO score", value: sp.score ?? "", options: [{ value: "needs", label: "Needs optimization (<80)" }, { value: "poor", label: "Poor (<50)" }, { value: "fair", label: "Fair (50–79)" }, { value: "good", label: "Good (80+)" }] },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="Path, title or focus keyword"
        sortBy={sp.sortBy}
        sortDir={sp.sortDir}
        page={list.page}
        totalPages={list.totalPages}
        total={list.total}
        exportBase={can(viewer, "EXPORT_REPORTS") ? "/api/rankmax-ai/export/pages" : undefined}
      />
    </div>
  );
}
