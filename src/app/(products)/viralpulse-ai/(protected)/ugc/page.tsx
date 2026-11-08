import Link from "next/link";
import { redirect } from "next/navigation";
import { Clapperboard, Film, Loader2, Plus, Settings2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PanelTabs from "@/components/platform/panel/PanelTabs";
import { PageHeader, EmptyState, Notice } from "@/components/products/viralpulse-ai/SmmsUi";
import SmmsFilterBar from "@/components/products/viralpulse-ai/SmmsFilterBar";
import { mediaSrc } from "@/components/products/viralpulse-ai/SmmsBits";
import { CategoryTile, Chip, UgcStatusChip } from "@/components/products/viralpulse-ai/ugc/UgcBits";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import * as api from "@/lib/products/viralpulse-ai/ugc/api";
import { getStyle, STYLE_CATEGORIES } from "@/lib/products/viralpulse-ai/ugc/styles";
import type { UgcStyle } from "@/lib/products/viralpulse-ai/ugc/styles";
import { countsByTab, formatSecs, formatUsd, LIST_TABS, parseTab, tabOfStatus, titleCase } from "@/lib/products/viralpulse-ai/ugc/ui-helpers";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "AI UGC Studio" };

export default async function UgcListPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  if (!can(viewer, "GENERATE_AI_CONTENT")) redirect("/viralpulse-ai");
  const sp = await searchParams;
  const tab = parseTab(sp.status);
  const [ov, list, conn] = await Promise.all([api.overview(), api.listProjects(), api.connections()]);
  const canManage = can(viewer, "MANAGE_INTEGRATIONS");

  const header = (
    <PageHeader
      title="AI UGC Studio"
      crumbs={[{ label: "AI UGC Studio" }]}
      description="Realistic, UGC-style vertical videos from a product brief: pick a style, set the cast, review the script and cost, then generate."
      actions={
        <>
          {canManage && <Button variant="outline" nativeButton={false} render={<Link href="/viralpulse-ai/ugc/settings" />}><Settings2 className="size-4" /> Studio settings</Button>}
          <Button nativeButton={false} render={<Link href="/viralpulse-ai/ugc/new" />}><Plus className="size-4" /> New video</Button>
        </>
      }
    />
  );

  if (!ov.ok || !list.ok) {
    return (
      <div className="space-y-4">
        {header}
        <Notice tone="error">{!ov.ok ? ov.error : !list.ok ? list.error : "Couldn't load the studio."}</Notice>
      </div>
    );
  }

  const { counts, settings, spentMonthUsd, spentTodayUsd } = ov.overview;
  const tabCounts = countsByTab(counts);
  const q = (sp.q ?? "").trim().toLowerCase();
  const cat = sp.category ?? "";
  const items = list.projects.filter((p) => {
    if (tab !== "all" && tabOfStatus(p.status) !== tab) return false;
    if (q && !p.title.toLowerCase().includes(q)) return false;
    if (cat && (getStyle(p.styleId) as UgcStyle | undefined)?.category !== cat) return false;
    return true;
  });
  const href = (status: string | null) => {
    const u = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1] && e[0] !== "status"));
    if (status) u.set("status", status);
    return `/viralpulse-ai/ugc${u.size ? `?${u}` : ""}`;
  };

  return (
    <div className="space-y-4">
      {header}
      {!settings.enabled && <Notice tone="warn">AI UGC Studio is switched off for this workspace. {canManage ? <Link href="/viralpulse-ai/ugc/settings" className="font-semibold underline">Switch it on in Studio settings.</Link> : "Ask an admin to switch it on."}</Notice>}
      {conn.ok && !conn.connections.video && settings.enabled && (
        <Notice tone="warn">
          Google Gemini isn&apos;t connected yet, so videos can&apos;t be generated. You can still plan a video and write its script.{" "}
          {canManage ? <Link href="/viralpulse-ai/settings?tab=integrations" className="font-semibold underline">Connect it in Settings → Integrations.</Link> : "Ask an admin to connect it."}
        </Notice>
      )}

      <SmmsFilterBar
        values={{ q: sp.q ?? "", category: sp.category ?? "" }}
        fields={[
          { key: "q", label: "Search", type: "search", placeholder: "Video name" },
          { key: "category", label: "Style", type: "select", options: STYLE_CATEGORIES.map((c) => ({ value: c, label: titleCase(c) })), allLabel: "All styles" },
        ]}
      />

      <KpiGrid>
        <KpiCard label="Videos" value={ov.overview.total} icon={<Clapperboard className="size-4" />} />
        <KpiCard label="Generating now" value={counts.approved + counts.generating} icon={<Loader2 className="size-4" />} />
        <KpiCard label="Ready videos" value={counts.ready} icon={<Film className="size-4" />} />
        <KpiCard
          label="Spend this month"
          value={<span>{formatUsd(spentMonthUsd)} <span className="text-xs font-normal text-muted-foreground">{`· today ${formatUsd(spentTodayUsd)} of ${formatUsd(settings.dailySpendCapUsd)}/day`}</span></span>}
          icon={<Wallet className="size-4" />}
        />
      </KpiGrid>

      <PanelTabs
        label="Video status"
        active={tab}
        tabs={[
          { key: "all", label: "All", count: ov.overview.total, href: href(null) },
          ...LIST_TABS.map((t) => ({ key: t.key, label: t.label, count: tabCounts[t.key], href: href(t.key) })),
        ]}
      />

      {items.length === 0 ? (
        <GlassCard interactive={false}>
          <CardContent>
            {ov.overview.total === 0 ? (
              <EmptyState icon={<Clapperboard className="size-5" />} title="No videos yet">
                Describe a product, pick one of 43 styles (two friends chatting, a product review, an unboxing...), and the studio writes the script and makes the video.
                <div className="mt-3"><Button nativeButton={false} render={<Link href="/viralpulse-ai/ugc/new" />}><Plus className="size-4" /> Create your first video</Button></div>
              </EmptyState>
            ) : (
              <EmptyState icon={<Film className="size-5" />} title="Nothing matches">Try another tab or clear the search. <Link href="/viralpulse-ai/ugc" className="font-semibold text-primary underline">Show all videos</Link></EmptyState>
            )}
          </CardContent>
        </GlassCard>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((p) => {
            const s = getStyle(p.styleId) as UgcStyle | undefined;
            return (
              <li key={p.id}>
                <Link href={`/viralpulse-ai/ugc/${p.id}`} className="group block h-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                  <GlassCard className="h-full">
                    <CardContent className="flex gap-3">
                      <div className="relative aspect-[9/16] w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                        {p.thumbnailId ? (
                          // eslint-disable-next-line @next/next/no-img-element -- authenticated private media route
                          <img src={mediaSrc(p.thumbnailId)} alt="" className="size-full object-cover" loading="lazy" />
                        ) : (
                          <CategoryTile category={s?.category ?? ""} className="size-full rounded-none" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="line-clamp-2 text-sm font-semibold group-hover:text-primary">{p.title}</p>
                        <div className="flex flex-wrap gap-1.5"><UgcStatusChip status={p.status} pendingApproval={p.pendingApproval} />{s && <Chip>{s.label}</Chip>}</div>
                        <p className="text-[11px] text-muted-foreground">
                          {[p.secs ? formatSecs(p.secs) : null, p.language, p.spendUsd > 0 ? `${formatUsd(p.spendUsd)} spent` : p.estimateUsd ? `~${formatUsd(p.estimateUsd)}` : null].filter(Boolean).join(" · ")}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{`Updated ${formatDateTime(new Date(p.updatedAt))}`}</p>
                      </div>
                    </CardContent>
                  </GlassCard>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
