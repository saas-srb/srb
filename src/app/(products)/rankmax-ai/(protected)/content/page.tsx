import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import { PageHeader, ScoreBadge, Notice } from "@/components/products/rankmax-ai/SeoUi";
import { getViewer } from "@/lib/products/rankmax-ai/viewer";
import { contentOverview } from "@/lib/products/rankmax-ai/content";
import { allPages } from "@/lib/products/rankmax-ai/pages";

export default async function ContentSeoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const sp = await searchParams;
  const [analyses, pages] = await Promise.all([contentOverview(), allPages()]);
  const idByPath = new Map(pages.map((p) => [p.path, p._id]));
  let rows = analyses;
  if (sp.search) rows = rows.filter((a) => a.path.includes(sp.search!) || a.focusKeyword.toLowerCase().includes(sp.search!.toLowerCase()));
  if (sp.focus === "missing") rows = rows.filter((a) => !a.focusKeyword);
  if (sp.focus === "set") rows = rows.filter((a) => a.focusKeyword);
  if (sp.flag === "thin") rows = rows.filter((a) => a.recommendations.some((r) => r.startsWith("Only ") && r.includes("words")));
  if (sp.flag === "stale") rows = rows.filter((a) => a.freshness.stale);
  if (sp.flag === "snippet") rows = rows.filter((a) => a.snippetOpportunities.length > 0);
  if (sp.flag === "duplicate") rows = rows.filter((a) => a.duplicate);
  const key = sp.sortBy ?? "score";
  const dir = sp.sortDir === "desc" ? -1 : 1;
  rows = [...rows].sort((a, b) => {
    const v = (x: typeof a) => (key === "words" ? x.wordCount : key === "readability" ? x.readability ?? -1 : key === "path" ? 0 : x.score);
    return key === "path" ? a.path.localeCompare(b.path) * dir : (v(a) - v(b)) * dir;
  });
  const page = Math.max(Number(sp.page) || 1, 1);
  const pageRows = rows.slice((page - 1) * 30, page * 30);

  return (
    <div className="space-y-4">
      <PageHeader title="Content SEO" crumbs={[{ label: "Content SEO" }]} description="How well each indexable page's text serves its target keywords: placement, coverage, structure, length, readability, freshness, duplication and featured-snippet potential." />
      {analyses.length === 0 && <Notice>Run a website audit first — content analysis uses the crawled page text.</Notice>}
      <FmsDataTable
        columns={[
          { key: "path", header: "Page", sortable: true },
          { key: "score", header: "Content", sortable: true },
          { key: "focus", header: "Focus keyword" },
          { key: "placement", header: "Placement" },
          { key: "coverage", header: "Coverage" },
          { key: "words", header: "Words", sortable: true, align: "right" },
          { key: "readability", header: "Readability", sortable: true },
          { key: "fresh", header: "Updated" },
          { key: "flags", header: "Signals" },
          { key: "next", header: "Top recommendation" },
        ]}
        rows={pageRows.map((a) => {
          const ok = a.placements.filter((p) => p.ok).length;
          const covered = a.coverage.filter((c) => c.present).length;
          return {
            id: a.path,
            href: idByPath.has(a.path) ? `/rankmax-ai/pages/${idByPath.get(a.path)}?tab=content` : undefined,
            cells: {
              path: a.path,
              score: <ScoreBadge score={a.score} />,
              focus: a.focusKeyword ? <span className="text-xs">{a.focusKeyword}</span> : <span className="text-xs text-amber-600">Not set</span>,
              placement: a.placements.length ? <span className={ok === a.placements.length ? "text-emerald-600" : "text-amber-600"}>{ok}/{a.placements.length}</span> : "—",
              coverage: a.coverage.length ? `${covered}/${a.coverage.length}` : "—",
              words: a.wordCount,
              readability: <span className="text-xs">{a.readability ?? "—"} <span className="text-muted-foreground">{a.readabilityLabel}</span></span>,
              fresh: a.freshness.days !== null ? <span className={a.freshness.stale ? "text-xs text-amber-600" : "text-xs"}>{a.freshness.days}d ago</span> : <span className="text-xs text-muted-foreground">—</span>,
              flags: (
                <span className="flex flex-wrap gap-1">
                  {a.duplicate && <Badge className="bg-rose-500/15 text-rose-600">duplicate</Badge>}
                  {a.snippetOpportunities.length > 0 && <Badge className="bg-sky-500/15 text-sky-700">snippet</Badge>}
                  {a.freshness.stale && <Badge className="bg-amber-500/15 text-amber-700">stale</Badge>}
                </span>
              ),
              next: <span className="block max-w-[280px] truncate text-xs text-muted-foreground" title={a.recommendations[0]}>{a.recommendations[0] ?? "—"}</span>,
            },
          };
        })}
        filters={[
          { key: "focus", label: "Focus keyword", value: sp.focus ?? "", options: [{ value: "set", label: "Set" }, { value: "missing", label: "Missing" }] },
          { key: "flag", label: "Signal", value: sp.flag ?? "", options: [{ value: "thin", label: "Thin content" }, { value: "stale", label: "Stale" }, { value: "duplicate", label: "Duplicate" }, { value: "snippet", label: "Snippet opportunity" }] },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="Path or focus keyword"
        sortBy={key}
        sortDir={sp.sortDir ?? "asc"}
        page={page}
        totalPages={Math.max(Math.ceil(rows.length / 30), 1)}
        total={rows.length}
      />
    </div>
  );
}
