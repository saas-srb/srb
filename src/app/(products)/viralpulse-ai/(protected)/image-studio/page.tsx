import Link from "next/link";
import { permanentRedirect, redirect } from "next/navigation";
import { FolderKanban, Images, Loader2, Plus, Sparkles, Wallet, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PanelTabs from "@/components/platform/panel/PanelTabs";
import { PageHeader, EmptyState, Notice } from "@/components/products/viralpulse-ai/SmmsUi";
import SmmsFilterBar from "@/components/products/viralpulse-ai/SmmsFilterBar";
import { Chip } from "@/components/products/viralpulse-ai/ugc/UgcBits";
import ImageWizard from "@/components/products/viralpulse-ai/studio/ImageWizard";
import ConnectionGate from "@/components/products/viralpulse-ai/shared/ConnectionGate";
import FormatIllustration from "@/components/products/viralpulse-ai/studio/FormatIllustration";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { getProject, getImageSettings, listProjects, projectOverview, spentToday } from "@/lib/products/viralpulse-ai/images/store";
import { toProjectView, variantUrl } from "@/lib/products/viralpulse-ai/images/view";
import { goalById, GOALS, specByKey } from "@/lib/products/viralpulse-ai/images/specs";
import { countsByTab, LIST_TABS, parseTab, statusMeta, tabOfStatus } from "@/lib/products/viralpulse-ai/images/state";
import { formatUsd } from "@/lib/products/viralpulse-ai/ugc/ui-helpers";
import { formatDateTime } from "@/lib/utils";
import { canGenerateImages, loadStudioConfig } from "../studio-context";

export const maxDuration = 300;
export const metadata = { title: "AI Image Studio" };

/**
 * AI Image Studio. Create: the five-step guided flow. Projects: every image project, drafts included, to resume. Quick generate,
 * the Media Library and the Brand Kit are their own sidebar items.
 */
export default async function ImageStudioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  const canLibrary = can(viewer, "MANAGE_MEDIA") || can(viewer, "MANAGE_POSTS") || can(viewer, "CREATE_ADS");
  const canGenerate = canGenerateImages(viewer);
  const sp = await searchParams;

  // Old tabs moved out of the studio; old links and notifications keep working.
  if (sp.tab === "library") permanentRedirect(`/viralpulse-ai/library${sp.open ? `?open=${encodeURIComponent(sp.open)}` : ""}`);
  if (sp.tab === "brand" || sp.tab === "kit") permanentRedirect("/viralpulse-ai/brand-kit");
  if (sp.tab === "quick" || sp.tab === "generate") permanentRedirect("/viralpulse-ai/generate-image");
  if (!canLibrary && !canGenerate) redirect("/viralpulse-ai");
  if (!canGenerate && can(viewer, "MANAGE_MEDIA") === false) redirect("/viralpulse-ai/library");

  const tab = sp.tab === "projects" || !canGenerate ? "projects" : "create";
  const tabs = [
    ...(canGenerate ? [{ key: "create", label: "Create", icon: <Wand2 className="size-4" />, href: "/viralpulse-ai/image-studio?tab=create" }] : []),
    { key: "projects", label: "Projects", icon: <FolderKanban className="size-4" />, href: "/viralpulse-ai/image-studio?tab=projects" },
  ];
  const header = (
    <PageHeader
      title="AI Image Studio"
      crumbs={[{ label: "AI Image Studio" }]}
      description="Make images for posts and ads at the exact sizes each platform wants, with your brand kit. Every project is saved so you can leave and come back."
      actions={
        <>
          {canGenerate && <Button variant="outline" nativeButton={false} render={<Link href="/viralpulse-ai/generate-image" />}><Sparkles className="size-4" /> Generate Image</Button>}
          {canGenerate && tab === "projects" && <Button nativeButton={false} render={<Link href="/viralpulse-ai/image-studio?tab=create" />}><Plus className="size-4" /> New image project</Button>}
        </>
      }
    />
  );

  if (tab === "create") {
    const config = await loadStudioConfig(viewer);
    const doc = sp.project ? await getProject(sp.project) : null;
    if (doc && (doc.status === "generating" || doc.status === "finished")) redirect(`/viralpulse-ai/image-studio/${doc._id}`);
    return (
      <div className="space-y-4">
        {header}
        <PanelTabs label="Image Studio" active="create" tabs={tabs} />
        <ConnectionGate requires={[{ name: "OpenAI or Gemini", connected: config.providers.openai || config.providers.gemini, why: "to generate images" }]} canManage={can(viewer, "MANAGE_INTEGRATIONS")}>
          <ImageWizard key={doc?._id ?? "new"} mode="create" config={config} initialProject={doc ? toProjectView(doc) : null} canGenerate />
        </ConnectionGate>
      </div>
    );
  }

  const [ov, list, settings, spentTodayUsd] = await Promise.all([projectOverview(new Date()), listProjects(200), getImageSettings(), spentToday(new Date())]);
  const tabCounts = countsByTab(ov.counts);
  const status = parseTab(sp.status);
  const q = (sp.q ?? "").trim().toLowerCase();
  const items = list.filter((p) => {
    if (status !== "all" && tabOfStatus(p.status) !== status) return false;
    if (sp.goal && p.brief.goalId !== sp.goal) return false;
    if (q && !`${p.brief.name} ${p.brief.subject} ${p.brief.product}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const href = (s: string | null) => {
    const u = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1] && e[0] !== "status"));
    u.set("tab", "projects");
    if (s) u.set("status", s);
    return `/viralpulse-ai/image-studio?${u}`;
  };

  return (
    <div className="space-y-4">
      {header}
      <PanelTabs label="Image Studio" active="projects" tabs={tabs} />
      {!settings.enabled && <Notice tone="warn">Image generation is switched off for this workspace.</Notice>}
      <SmmsFilterBar
        values={{ tab: "projects", q: sp.q ?? "", goal: sp.goal ?? "" }}
        fields={[
          { key: "q", label: "Search", type: "search", placeholder: "Project name or subject" },
          { key: "goal", label: "Format", type: "select", options: GOALS.filter((g) => g.id !== "custom").map((g) => ({ value: g.id, label: g.label })), allLabel: "All formats" },
        ]}
      />
      <KpiGrid>
        <KpiCard label="Projects" value={ov.total} icon={<FolderKanban className="size-4" />} />
        <KpiCard label="Generating now" value={(ov.counts.generating ?? 0) + (ov.counts.awaiting_approval ?? 0)} icon={<Loader2 className="size-4" />} />
        <KpiCard label="Images this month" value={ov.imagesMonth} icon={<Images className="size-4" />} />
        <KpiCard label="Spend this month" value={<span>{formatUsd(ov.spendMonthUsd)} <span className="text-xs font-normal text-muted-foreground">{`· today ${formatUsd(spentTodayUsd)} of ${formatUsd(settings.dailySpendCapUsd)}/day`}</span></span>} icon={<Wallet className="size-4" />} />
      </KpiGrid>
      <PanelTabs label="Project status" active={status} tabs={[{ key: "all", label: "All", count: ov.total, href: href(null) }, ...LIST_TABS.map((t) => ({ key: t.key, label: t.label, count: tabCounts[t.key], href: href(t.key) }))]} />
      {items.length === 0 ? (
        <GlassCard interactive={false}>
          <CardContent>
            {ov.total === 0 ? (
              <EmptyState icon={<Images className="size-5" />} title="No image projects yet">
                Pick what the picture is for, describe it, and the studio draws options at the exact sizes each platform wants. Drafts are saved, so you can stop and carry on later.
                {canGenerate && <div className="mt-3"><Button nativeButton={false} render={<Link href="/viralpulse-ai/image-studio?tab=create" />}><Plus className="size-4" /> Start your first project</Button></div>}
              </EmptyState>
            ) : (
              <EmptyState icon={<Images className="size-5" />} title="Nothing matches">Try another tab or clear the search. <Link href="/viralpulse-ai/image-studio?tab=projects" className="font-semibold text-primary underline">Show all projects</Link></EmptyState>
            )}
          </CardContent>
        </GlassCard>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((p) => {
            const goal = goalById(p.brief.goalId);
            const m = statusMeta(p.status);
            const lead = specByKey(p.brief.specKeys[0] ?? "");
            const cover = p.chosenIds[0] ?? p.variants[p.variants.length - 1]?.id ?? null;
            const open = p.status === "draft" || p.status === "briefed" ? `/viralpulse-ai/image-studio?tab=create&project=${p._id}` : `/viralpulse-ai/image-studio/${p._id}`;
            return (
              <li key={p._id}>
                <Link href={open} className="group block h-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                  <GlassCard className="h-full">
                    <CardContent className="flex gap-3">
                      <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element -- authenticated private route
                          <img src={variantUrl(p._id, cover)} alt="" className="size-full object-cover" loading="lazy" />
                        ) : lead ? <div className="w-full p-2"><FormatIllustration spec={lead} showText={false} className="max-h-16" /></div> : null}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="line-clamp-2 text-sm font-semibold group-hover:text-primary">{p.brief.name || p.brief.subject.slice(0, 60) || goal?.label || "Untitled project"}</p>
                        <div className="flex flex-wrap gap-1.5"><Chip tone={m.tone}>{m.busy && <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />}{m.label}</Chip>{goal && <Chip>{goal.label}</Chip>}</div>
                        <p className="text-[11px] text-muted-foreground">{[`${p.variants.length} picture${p.variants.length === 1 ? "" : "s"}`, p.totalCostUsd > 0 ? `${formatUsd(p.totalCostUsd)} spent` : null].filter(Boolean).join(" · ")}</p>
                        <p className="text-[11px] text-muted-foreground">{`Updated ${formatDateTime(p.updatedAt)}`}</p>
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
