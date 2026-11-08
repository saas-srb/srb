import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, BookOpen, BarChart3, Eye, Copy, Trash2, Globe, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState, SectionCard } from "@/components/products/viralpulse-ai/SmmsUi";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { listBrochures } from "@/lib/products/viralpulse-ai/brochure/store";
import { BROCHURE_CATEGORY_META } from "@/lib/products/viralpulse-ai/brochure/types";
import SmmsFilterBar from "@/components/products/viralpulse-ai/SmmsFilterBar";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import BrochureCardActions from "@/components/products/viralpulse-ai/brochure/BrochureCardActions";

export const metadata = { title: "Brochure Builder" };
export const dynamic = "force-dynamic";

export default async function BrochureListPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  if (!can(viewer, "MANAGE_POSTS") && !can(viewer, "MANAGE_MEDIA") && !can(viewer, "GENERATE_AI_CONTENT")) redirect("/viralpulse-ai");

  const sp = await searchParams;
  const { items, total } = await listBrochures({
    q: sp.q,
    category: sp.category,
    status: sp.status,
    page: sp.page ? Number(sp.page) : 1,
  });

  const published = items.filter((b) => b.status === "published").length;
  const totalViews = items.reduce((s, b) => s + b.analytics.views, 0);
  const totalClicks = items.reduce((s, b) => s + b.analytics.ctaClicks, 0);

  const categoryOptions = Object.entries(BROCHURE_CATEGORY_META).map(([k, v]) => ({ value: k, label: v.label }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Brochure Builder"
        crumbs={[{ label: "Brochure Builder" }]}
        description="Create professional, interactive digital brochures for any industry. Publish with a shareable link."
        actions={
          <Button nativeButton={false} render={<Link href="/viralpulse-ai/brochures/new" />}>
            <Plus className="size-4" /> New Brochure
          </Button>
        }
      />

      <KpiGrid>
        <KpiCard label="Total Brochures" value={total} icon={<BookOpen className="size-4" />} />
        <KpiCard label="Published" value={published} icon={<Globe className="size-4" />} />
        <KpiCard label="Total Views" value={totalViews} icon={<Eye className="size-4" />} />
        <KpiCard label="CTA Clicks" value={totalClicks} icon={<BarChart3 className="size-4" />} />
      </KpiGrid>

      <SmmsFilterBar
        values={{ q: sp.q ?? "", category: sp.category ?? "", status: sp.status ?? "" }}
        fields={[
          { key: "q", label: "Search", type: "search", placeholder: "Brochure name" },
          { key: "category", label: "Category", type: "select", options: categoryOptions, allLabel: "All categories" },
          { key: "status", label: "Status", type: "select", options: [{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }], allLabel: "All statuses" },
        ]}
      />

      {items.length === 0 ? (
        <GlassCard interactive={false}>
          <CardContent>
            <EmptyState
              icon={<BookOpen className="size-5" />}
              title={total === 0 ? "No brochures yet" : "Nothing matches"}
            >
              {total === 0 ? (
                <>
                  Create your first professional digital brochure — choose a category, pick a template and start building.
                  <div className="mt-3">
                    <Button nativeButton={false} render={<Link href="/viralpulse-ai/brochures/new" />}>
                      <Plus className="size-4" /> Create your first brochure
                    </Button>
                  </div>
                </>
              ) : (
                <>Try a different category or search term. <Link href="/viralpulse-ai/brochures" className="font-semibold text-primary underline">Show all brochures</Link></>
              )}
            </EmptyState>
          </CardContent>
        </GlassCard>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((b) => {
            const catMeta = BROCHURE_CATEGORY_META[b.category];
            return (
              <li key={b._id}>
                <GlassCard className="group h-full">
                  <CardContent className="flex h-full flex-col gap-3 p-4">
                    {/* Category + status row */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-2.5 py-1 text-[11px] font-semibold text-primary">
                        {catMeta.label}
                      </span>
                      <Badge variant={b.status === "published" ? "default" : "outline"} className="text-[11px]">
                        {b.status === "published" ? "Published" : "Draft"}
                      </Badge>
                    </div>

                    {/* Title */}
                    <Link href={`/viralpulse-ai/brochures/${b._id}`} className="group-hover:text-primary">
                      <h3 className="line-clamp-2 text-sm font-bold">{b.title}</h3>
                    </Link>

                    {/* Stats */}
                    <div className="mt-auto flex gap-4 border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Eye className="size-3" /> {b.analytics.views} views</span>
                      <span className="flex items-center gap-1"><BarChart3 className="size-3" /> {b.analytics.ctaClicks} clicks</span>
                      <span className="ml-auto">{formatDateTime(new Date(b.updatedAt))}</span>
                    </div>

                    {/* Actions */}
                    <div className="pt-1 border-t border-border/40">
                      <BrochureCardActions
                        id={b._id}
                        title={b.title}
                        slug={b.slug}
                        status={b.status}
                      />
                    </div>
                  </CardContent>
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
