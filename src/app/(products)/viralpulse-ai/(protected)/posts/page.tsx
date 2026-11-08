import PanelTabs from "@/components/platform/panel/PanelTabs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Share2, Sparkles, ChevronLeft, ChevronRight, List, CalendarDays, CalendarRange, CalendarClock, CheckCircle2, AlertTriangle, FilePen } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import { PageHeader } from "@/components/products/viralpulse-ai/SmmsUi";
import EmptyState from "@/components/products/viralpulse-ai/shared/EmptyState";
import SmmsFilterBar from "@/components/products/viralpulse-ai/SmmsFilterBar";
import PostsTable, { type PostRow } from "@/components/products/viralpulse-ai/PostsTable";
import { PlatformChip } from "@/components/products/viralpulse-ai/SmmsBits";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { listPosts, calendarPosts, postStats, type PostDoc } from "@/lib/products/viralpulse-ai/posts";
import { listCampaignOptions } from "@/lib/products/viralpulse-ai/campaigns";
import { POST_PLATFORMS, PLATFORM_META, STATUS_META } from "@/lib/products/viralpulse-ai/constants";
import { getPublishSettings } from "@/lib/products/viralpulse-ai/publishers/publish-settings";
import { zonedToUtc } from "@/lib/products/viralpulse-ai/publishers/schedule";
import { wizardAccounts } from "@/lib/products/viralpulse-ai/post-wizard/server";
import { addDays, dayKeyIn, isDayKey, isMonthKey, monthDays, monthOf, rangeOf, shiftMonth, timeIn, weekDays, weekStart } from "@/lib/products/viralpulse-ai/post-wizard/calendar";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "All", status: undefined },
  { key: "drafts", label: "Drafts", status: "draft,generated,edited" },
  { key: "scheduled", label: "Scheduled", status: "scheduled" },
  { key: "published", label: "Published", status: "published" },
  { key: "failed", label: "Failed", status: "failed" },
] as const;

const when = (p: PostDoc): Date | null => p.publishedAt ?? p.scheduledAt ?? p.plannedAt ?? null;
const dot = (p: PostDoc) => (p.status === "published" ? "bg-emerald-500" : p.status === "scheduled" ? "bg-amber-500" : p.status === "failed" ? "bg-rose-500" : "bg-slate-400");

export default async function PostsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  if (!can(viewer, "MANAGE_POSTS") && !can(viewer, "VIEW_CAMPAIGNS")) redirect("/viralpulse-ai");
  const sp = await searchParams;
  const view = sp.view === "week" || sp.view === "month" ? sp.view : "list";
  const page = Math.max(Number(sp.page) || 1, 1);
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const settings = await getPublishSettings();
  const tz = settings.timezone;
  const nowKey = dayKeyIn(new Date(), tz);
  const monthStart = zonedToUtc(`${nowKey.slice(0, 7)}-01T00:00`, tz);
  const [campaigns, stats, accounts] = await Promise.all([listCampaignOptions(), postStats(monthStart), wizardAccounts()]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const canManage = can(viewer, "MANAGE_POSTS");

  const qs = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1]));
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    return `/viralpulse-ai/posts${s ? `?${s}` : ""}`;
  };

  let body: React.ReactNode;
  if (view !== "list") {
    const anchor = isDayKey(sp.day) ? sp.day : nowKey;
    const month = isMonthKey(sp.month) ? sp.month : monthOf(anchor);
    const days = view === "week" ? weekDays(anchor) : monthDays(month);
    const { from, to } = rangeOf(days, tz);
    const posts = await calendarPosts(from, to);
    const byDay = new Map<string, PostDoc[]>();
    for (const p of posts) {
      const d = when(p);
      if (!d) continue;
      if (sp.platform && !p.platforms.includes(sp.platform as never)) continue;
      if (sp.campaign && p.campaignId !== sp.campaign) continue;
      const k = dayKeyIn(d, tz);
      byDay.set(k, [...(byDay.get(k) ?? []), p]);
    }
    const title = view === "week" ? `${days[0]} to ${days[6]}` : new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
    const prev = view === "week" ? qs({ day: addDays(weekStart(anchor), -7) }) : qs({ month: shiftMonth(month, -1) });
    const next = view === "week" ? qs({ day: addDays(weekStart(anchor), 7) }) : qs({ month: shiftMonth(month, 1) });
    const today = qs({ day: null, month: null });
    const cell = (k: string, tall: boolean) => {
      const items = (byDay.get(k) ?? []).sort((a, b) => (when(a)!.getTime() - when(b)!.getTime()));
      const inMonth = view === "week" || k.startsWith(month);
      return (
        <div key={k} className={cn("rounded-lg border p-1", tall ? "min-h-48" : "min-h-24", k === nowKey ? "border-primary/60" : "border-border/40", inMonth ? "bg-background/60" : "bg-muted/30 text-muted-foreground")}>
          <p className="mb-0.5 px-0.5 font-semibold">{view === "week" ? new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${k}T00:00:00Z`)) : Number(k.slice(8))}</p>
          <ul className="space-y-0.5">
            {items.slice(0, tall ? 12 : 4).map((p) => (
              <li key={p._id}>
                <Link href={`/viralpulse-ai/posts/${p._id}`} className="block rounded px-1 py-0.5 hover:bg-primary/10" title={`${p.title} · ${STATUS_META[p.status].label}${p.status !== "scheduled" && !p.publishedAt ? " (planned)" : ""}`}>
                  <span className="flex items-center gap-1 truncate"><span aria-hidden className={cn("inline-block size-1.5 shrink-0 rounded-full", dot(p))} /><span className="shrink-0 tabular-nums">{timeIn(when(p)!, tz)}</span><span className="truncate">{p.title}</span></span>
                  {tall && <span className="mt-0.5 flex flex-wrap gap-0.5">{p.platforms.map((pl) => <PlatformChip key={pl} platform={pl} />)}</span>}
                </Link>
              </li>
            ))}
            {items.length > (tall ? 12 : 4) && <li className="px-1 text-muted-foreground">{`+${items.length - (tall ? 12 : 4)} more`}</li>}
          </ul>
        </div>
      );
    };
    body = (
      <GlassCard interactive={false}>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Link href={prev} aria-label="Previous" className={buttonVariants({ variant: "outline", size: "sm" })}><ChevronLeft className="size-3.5" /></Link>
            <div className="text-center"><p className="text-sm font-semibold">{title}</p><Link href={today} className="text-[11px] text-primary hover:underline">Today</Link></div>
            <Link href={next} aria-label="Next" className={buttonVariants({ variant: "outline", size: "sm" })}><ChevronRight className="size-3.5" /></Link>
          </div>
          {posts.length === 0 && <EmptyState icon={<CalendarDays className="size-5" />} title={view === "week" ? "Nothing scheduled this week" : "Nothing scheduled this month"}>{canManage ? "Posts you schedule or plan show up here." : "Posts your team schedules show up here."}</EmptyState>}
          <div className={cn("grid gap-1 text-[11px]", view === "week" ? "grid-cols-1 sm:grid-cols-7" : "grid-cols-7")}>
            {view === "month" && ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-1 font-semibold text-muted-foreground">{d}</div>)}
            {days.map((k) => cell(k, view === "week"))}
          </div>
          <p className="text-[11px] text-muted-foreground">{`Times are in ${tz}. Dots: green published, amber scheduled, red failed, grey planned (date from the brief, not scheduled).`}</p>
        </CardContent>
      </GlassCard>
    );
  } else {
    const r = await listPosts({ q: sp.q, status: sp.archived ? "archived" : tab.status, platform: sp.platform, contentType: sp.type, campaignId: sp.campaign, page });
    const rows: PostRow[] = r.items.map((p) => {
      const w = p.publishedAt ?? p.scheduledAt ?? p.plannedAt;
      return {
        id: p._id, title: p.title, subtitle: p.idea || p.topic, status: p.status, needsApproval: p.status === "scheduled" && !p.approvedBy, contentType: p.contentType,
        platforms: p.variants.map((v) => ({ platform: v.platform, account: accountName.get(p.publishOptions?.accountIds?.[v.platform] ?? "") ?? null, state: v.publish.state })),
        when: w ? `${p.publishedAt ? "Published " : p.scheduledAt ? "" : "Planned "}${new Intl.DateTimeFormat("en-IN", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(w)}` : "—",
        updated: new Intl.DateTimeFormat("en-IN", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(p.updatedAt),
      };
    });
    body = (
      <>
        <GlassCard interactive={false}>
          <CardContent>
            {rows.length === 0 ? (
              <EmptyState icon={<Share2 className="size-5" />} title={sp.q || sp.platform || sp.campaign || sp.type || tab.status ? "No posts match" : "No posts yet"} action={canManage ? <Button nativeButton={false} render={<Link href="/viralpulse-ai/posts/new" />}><Plus className="size-4" /> New post</Button> : undefined}>
                {canManage ? "Create a post: choose the platforms, write or generate the text, add media and schedule it." : "Posts your team creates will appear here."}
              </EmptyState>
            ) : <PostsTable rows={rows} canManage={canManage} />}
          </CardContent>
        </GlassCard>
        {r.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{`Page ${page} of ${r.totalPages} · ${r.total} posts`}</span>
            <div className="flex gap-2">
              <Link href={qs({ page: String(Math.max(page - 1, 1)) })} className={buttonVariants({ variant: "outline", size: "sm" })}><ChevronLeft className="size-3.5" />Previous</Link>
              <Link href={qs({ page: String(Math.min(page + 1, r.totalPages)) })} className={buttonVariants({ variant: "outline", size: "sm" })}>Next<ChevronRight className="size-3.5" /></Link>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Social Media Reels/Posts"
        crumbs={[{ label: "Social Media Reels/Posts" }]}
        description="Plan, write, schedule and publish posts, Reels and videos for Instagram, Facebook, YouTube, LinkedIn, X and Google Business Profile."
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href={qs({ view: view === "list" ? "month" : null, page: null })} />}>{view === "list" ? <CalendarDays className="size-4" /> : <List className="size-4" />} {view === "list" ? "Calendar" : "List"}</Button>
            {can(viewer, "GENERATE_AI_CONTENT") && <Button variant="outline" nativeButton={false} render={<Link href="/viralpulse-ai/posts/generator" />}><Sparkles className="size-4" /> Copy generator</Button>}
            {canManage && <Button nativeButton={false} render={<Link href="/viralpulse-ai/posts/new" />}><Plus className="size-4" /> New post</Button>}
          </>
        }
      />
      <SmmsFilterBar
        values={{ q: sp.q ?? "", platform: sp.platform ?? "", type: sp.type ?? "", campaign: sp.campaign ?? "" }}
        fields={[
          ...(view === "list" ? [{ key: "q", label: "Search", type: "search" as const, placeholder: "Title, topic, idea" }] : []),
          { key: "platform", label: "Platform", type: "select", options: POST_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_META[p].label })) },
          ...(view === "list" ? [{ key: "type", label: "Media", type: "select" as const, options: [{ value: "image", label: "Image" }, { value: "video", label: "Video" }] }] : []),
          { key: "campaign", label: "Campaign", type: "select", options: campaigns.map((c) => ({ value: c._id, label: c.name })) },
          ...(view === "list" ? [{ key: "archived", label: "Archive", type: "select" as const, options: [{ value: "1", label: "Archived only" }], allLabel: "Hide archived" }] : []),
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Scheduled" value={stats.scheduled} accent icon={<CalendarClock className="size-4" />} />
        <KpiCard label="Published this month" value={stats.publishedThisMonth} icon={<CheckCircle2 className="size-4" />} />
        <KpiCard label="Failed" value={stats.failed} tone={stats.failed > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
        <KpiCard label="Drafts" value={stats.drafts} icon={<FilePen className="size-4" />} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {view === "list" ? (
          <PanelTabs label="Post status" active={sp.archived ? "" : tab.key} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: qs({ tab: t.key === "all" ? null : t.key, archived: null, page: null }) }))} />
        ) : <span />}
        <PanelTabs label="Posts view" active={view} tabs={[
          { key: "list", label: "List", icon: <List className="size-3.5" />, href: qs({ view: null, page: null }) },
          { key: "week", label: "Week", icon: <CalendarRange className="size-3.5" />, href: qs({ view: "week", page: null }) },
          { key: "month", label: "Month", icon: <CalendarDays className="size-3.5" />, href: qs({ view: "month", page: null }) },
        ]} />
      </div>
      {stats.awaitingApproval > 0 && can(viewer, "PUBLISH_CONTENT") && <p className="text-xs text-amber-700 dark:text-amber-300">{`${stats.awaitingApproval} scheduled post${stats.awaitingApproval === 1 ? " is" : "s are"} waiting for approval.`}</p>}
      {body}
    </div>
  );
}

