import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import { PageHeader, ScoreBadge, Notice } from "@/components/products/rankmax-ai/SeoUi";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { listPages } from "@/lib/products/rankmax-ai/pages";
import { getSettings } from "@/lib/products/rankmax-ai/settings";
import { COLLECTIONS, seoCollection } from "@/lib/products/rankmax-ai/db";
import type { CheckId } from "@/lib/products/rankmax-ai/checks";
import type { SeoIssue } from "@/lib/products/rankmax-ai/types";

const TILES: { label: string; check: CheckId }[] = [
  { label: "Missing titles", check: "title_missing" },
  { label: "Titles too long", check: "title_too_long" },
  { label: "Duplicate titles", check: "title_duplicate" },
  { label: "Missing descriptions", check: "description_missing" },
  { label: "Duplicate descriptions", check: "description_duplicate" },
  { label: "Missing H1", check: "h1_missing" },
  { label: "Multiple H1", check: "h1_multiple" },
  { label: "Images without alt", check: "img_alt_missing" },
  { label: "Open Graph gaps", check: "og_missing" },
  { label: "Focus keyword gaps", check: "focus_keyword_placement" },
];

function Len({ n, min, max }: { n: number; min: number; max: number }) {
  const cls = n === 0 ? "text-rose-600" : n > max ? "text-amber-600" : n < min ? "text-amber-600" : "text-emerald-600";
  return <span className={`text-[11px] tabular-nums ${cls}`}>{n}</span>;
}

export default async function OnPagePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const [settings, list, issues] = await Promise.all([
    getSettings(),
    listPages({ search: sp.search, score: sp.score, overridden: sp.overridden, indexable: sp.indexable ?? "yes", sortBy: sp.sortBy ?? "onPage", sortDir: sp.sortDir ?? "asc", page, pageSize: 30 }),
    (await seoCollection<SeoIssue>(COLLECTIONS.issues)).find({ status: { $in: ["open", "in_progress"] }, category: "on_page" }, { projection: { checkId: 1 } }).toArray(),
  ]);
  const t = settings.thresholds;
  const canEdit = can(viewer, "MANAGE_ON_PAGE_SEO");

  return (
    <div className="space-y-4">
      <PageHeader
        title="On-Page SEO"
        crumbs={[{ label: "On-Page SEO" }]}
        description={<>Titles, descriptions, headings, image alt text, social tags and focus keywords per page. {canEdit ? "Open a page to edit its live metadata — changes go live on the website without a deploy." : "Only SEO specialists and managers can edit live metadata."}</>}
      />
      <Notice>
        Length targets: title {t.titleMin}–{t.titleMax} characters, description {t.descriptionMin}–{t.descriptionMax}. Green is in range, amber is outside it, red is missing.
      </Notice>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {TILES.map((tile) => (
          <Link key={tile.check} href={`/rankmax-ai/issues?status=active&checkId=${tile.check}`} className="rounded-2xl border border-border/40 bg-card/90 p-3 hover:border-primary/40">
            <p className="truncate text-xs text-muted-foreground">{tile.label}</p>
            <p className="text-xl font-black tabular-nums">{issues.filter((i) => i.checkId === tile.check).length}</p>
          </Link>
        ))}
      </div>
      <FmsDataTable
        columns={[
          { key: "path", header: "Page", sortable: true },
          { key: "onPage", header: "Score", sortable: true },
          { key: "title", header: "Title" },
          { key: "description", header: "Meta description" },
          { key: "h1", header: "H1" },
          { key: "alt", header: "Alt missing", align: "right" },
          { key: "social", header: "Social" },
          { key: "focus", header: "Focus keyword" },
        ]}
        rows={list.items.map((p) => ({
          id: p._id,
          href: `/rankmax-ai/pages/${p._id}?tab=on-page`,
          cells: {
            path: (
              <span className="flex items-center gap-1.5">
                {p.path}
                {p.override && <Badge className="h-4 bg-primary/10 px-1 text-[9px] text-primary">managed</Badge>}
              </span>
            ),
            onPage: <ScoreBadge score={p.scores?.onPage} />,
            title: (
              <span className="flex max-w-[260px] items-center gap-1.5">
                <Len n={p.crawl?.title.length ?? 0} min={t.titleMin} max={t.titleMax} />
                <span className="truncate text-xs">{p.crawl?.title || "—"}</span>
              </span>
            ),
            description: (
              <span className="flex max-w-[260px] items-center gap-1.5">
                <Len n={p.crawl?.description.length ?? 0} min={t.descriptionMin} max={t.descriptionMax} />
                <span className="truncate text-xs text-muted-foreground">{p.crawl?.description || "—"}</span>
              </span>
            ),
            h1: <span className="block max-w-[200px] truncate text-xs">{p.crawl?.h1.length === 1 ? p.crawl.h1[0] : p.crawl?.h1.length ? <Badge className="bg-amber-500/15 text-amber-700">{p.crawl.h1.length} H1s</Badge> : <Badge className="bg-rose-500/15 text-rose-600">None</Badge>}</span>,
            alt: p.crawl?.imagesMissingAlt ? <span className="text-amber-600">{p.crawl.imagesMissingAlt}</span> : 0,
            social: p.crawl ? (p.crawl.og.title && p.crawl.og.image && p.crawl.twitter.card ? <Badge className="bg-emerald-500/15 text-emerald-700">Complete</Badge> : <Badge className="bg-amber-500/15 text-amber-700">Gaps</Badge>) : "—",
            focus: <span className="text-xs">{p.focusKeyword || <span className="text-muted-foreground">Not set</span>}</span>,
          },
        }))}
        filters={[
          { key: "score", label: "Score", value: sp.score ?? "", options: [{ value: "poor", label: "Poor (<50)" }, { value: "fair", label: "Fair (50–79)" }, { value: "good", label: "Good (80+)" }] },
          { key: "overridden", label: "Metadata", value: sp.overridden ?? "", options: [{ value: "yes", label: "Managed in product" }] },
          { key: "indexable", label: "Indexable", value: sp.indexable ?? "yes", options: [{ value: "yes", label: "Indexable" }, { value: "no", label: "Not indexable" }] },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="Path, title or keyword"
        sortBy={sp.sortBy ?? "onPage"}
        sortDir={sp.sortDir ?? "asc"}
        page={list.page}
        totalPages={list.totalPages}
        total={list.total}
        exportBase={can(viewer, "EXPORT_REPORTS") ? "/api/rankmax-ai/export/on_page" : undefined}
      />
    </div>
  );
}
