import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Circle, Clapperboard, Film, Image as ImageIcon, Megaphone, Send, ShieldAlert, Users, Wallet, Wand2, TrendingUp, TrendingDown, Plug, Sparkles } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import EmptyState from "@/components/products/viralpulse-ai/shared/EmptyState";
import SourceBadge from "@/components/products/viralpulse-ai/shared/SourceBadge";
import SyncNowButton from "@/components/products/viralpulse-ai/analytics/SyncNowButton";
import MetricsTrendChart from "@/components/products/viralpulse-ai/analytics/MetricsTrendChart";
import { MediaThumb, PlatformChip } from "@/components/products/viralpulse-ai/SmmsBits";
import { cn, formatCompact, formatCurrency } from "@/lib/utils";
import { BEST_TIME_MIN_POSTS } from "@/lib/products/viralpulse-ai/metrics/compute";
import { SCHEDULE_STATE_LABEL, WEEKDAYS, hourLabel, whenIn, type AttentionItem, type LaunchBucket } from "@/lib/products/viralpulse-ai/dashboard-core";
import { loadAccountsHealth, loadActivity, loadAdsSnapshot, loadAttention, loadHighlights, loadRecentPublished, loadSchedule, loadSetup, loadStats, loadStudios, type DashCtx } from "@/lib/products/viralpulse-ai/dashboard";
import { handoffHref } from "@/lib/products/viralpulse-ai/post-wizard/helpers";

/* Every section is an async server component that reads its own data, so the page streams them independently. A failing read shows an
   honest error in that card only, with a link that reloads the page. */

const ICON = "size-4";

function Panel({ id, title, description, href, hrefLabel, className, children }: { id: string; title: string; description?: ReactNode; href?: string; hrefLabel?: string; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`dash-${id}`} className={cn("min-w-0", className)}>
      <GlassCard interactive={false}>
        <CardContent className="flex h-full flex-col gap-3 px-4 py-4">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={`dash-${id}`} className="text-sm font-bold">{title}</h2>
              {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
            {href && (
              <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                {hrefLabel ?? "View all"} <ArrowRight className="size-3" aria-hidden />
              </Link>
            )}
          </header>
          {children}
        </CardContent>
      </GlassCard>
    </section>
  );
}

export function SectionSkeleton({ title, className, rows = 4 }: { title: string; className?: string; rows?: number }) {
  return (
    <GlassCard interactive={false} className={className} containerClassName={className}>
      <CardContent className="space-y-3 px-4 py-4" aria-busy="true">
        <p className="text-sm font-bold">{title}</p>
        <span className="sr-only">Loading {title}</span>
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </CardContent>
    </GlassCard>
  );
}

function SectionError({ title, className }: { title: string; className?: string }) {
  return (
    <Panel id={title.replace(/\W+/g, "-").toLowerCase()} title={title} className={className}>
      <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
        <p className="text-muted-foreground">This section could not be loaded. The rest of the dashboard is unaffected. <Link href="/viralpulse-ai" className="font-medium text-primary underline">Reload</Link></p>
      </div>
    </Panel>
  );
}

/** Runs a section's loader; any failure becomes that card's error state. */
async function guard<T>(title: string, className: string | undefined, load: () => Promise<T | null>, render: (d: T) => ReactNode): Promise<ReactNode> {
  let data: T | null;
  try {
    data = await load();
  } catch (e) {
    console.error(`[viralpulse dashboard] ${title}:`, e instanceof Error ? e.message : e);
    return <SectionError title={title} className={className} />;
  }
  return data === null ? null : render(data);
}

const delta = (pct: number | null, label: string) =>
  pct === null ? null : (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold", pct > 0 ? "text-emerald-600 dark:text-emerald-400" : pct < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")} title={label}>
      {pct > 0 ? <TrendingUp className="size-3" aria-hidden /> : pct < 0 ? <TrendingDown className="size-3" aria-hidden /> : null}
      {pct > 0 ? "+" : ""}{pct}% <span className="font-normal text-muted-foreground">{label}</span>
    </span>
  );

function Stat({ label, icon, href, children, foot, tone }: { label: string; icon: ReactNode; href?: string; children: ReactNode; foot?: ReactNode; tone?: "warn" | "danger" }) {
  const body = (
    <GlassCard>
      <CardContent className="flex h-full flex-col gap-1 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-brand-accent text-white" aria-hidden>{icon}</span>
          <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
        </div>
        <div className={cn("text-[19px] font-bold leading-tight tracking-tight tabular-nums", tone === "danger" && "text-rose-600 dark:text-rose-400", tone === "warn" && "text-amber-600 dark:text-amber-400")}>{children}</div>
        {foot && <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-[11px] text-muted-foreground">{foot}</div>}
      </CardContent>
    </GlassCard>
  );
  return href ? <Link href={href} className="block h-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : <div className="h-full">{body}</div>;
}

// ── Setup + attention ──────────────────────────────────────────────────────────────────────────────────────────────────────

export async function SetupSection({ ctx }: { ctx: DashCtx }) {
  return guard("Get started", undefined, () => loadSetup(ctx), (s) =>
    s.allDone ? null : (
      <Panel id="setup" title="Get started" description={`${s.done} of ${s.total} steps done. This disappears when everything is set up.`}>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={s.done} aria-valuemin={0} aria-valuemax={s.total} aria-label="Setup progress">
          <div className="h-full rounded-full bg-primary" style={{ width: `${(s.done / s.total) * 100}%` }} />
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {s.items.map((i) => (
            <li key={i.key} className={cn("flex items-start gap-2.5 rounded-xl border border-border/40 bg-background/60 p-3", i.done && "opacity-70")}>
              {i.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Done" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not done" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{i.label}</p>
                <p className="text-xs text-muted-foreground">{i.detail}</p>
              </div>
              {!i.done && <Link href={i.href} className={buttonVariants({ size: "sm", variant: "outline" })}>{i.cta}</Link>}
            </li>
          ))}
        </ul>
      </Panel>
    ));
}

export async function AttentionSection({ ctx }: { ctx: DashCtx }) {
  return guard("Needs attention", undefined, () => loadAttention(ctx), (items: AttentionItem[]) =>
    items.length === 0 ? null : (
      <Panel id="attention" title="Needs attention" description={`${items.length} thing${items.length === 1 ? "" : "s"} to fix, most urgent first.`}>
        <ul className="divide-y divide-border/50">
          {items.slice(0, 8).map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <ShieldAlert className={cn("size-4 shrink-0", i.severity === "critical" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400")} aria-label={i.severity === "critical" ? "Urgent" : "Warning"} />
              <div className="min-w-0 flex-1 basis-60">
                <p className="text-sm font-medium">{i.title}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{i.detail}</p>
              </div>
              {i.href ? <Link href={i.href} className={buttonVariants({ size: "sm", variant: "outline" })}>{i.fixLabel.length > 40 ? "Fix" : i.fixLabel}</Link> : <span className="text-xs text-muted-foreground">{i.fixLabel}</span>}
            </li>
          ))}
        </ul>
        {items.length > 8 && <p className="text-xs text-muted-foreground">{items.length - 8} more. See all under Settings, System health.</p>}
      </Panel>
    ));
}

// ── Stat cards ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function StatsSection({ ctx }: { ctx: DashCtx }) {
  return guard("Key numbers", undefined, () => loadStats(ctx), (s) => {
    const vs = "vs same days last month";
    return (
      <section aria-label="Key numbers">
        <KpiGrid cols={6} className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {s.posts && (
            <Stat label="Published this month" icon={<Send className={ICON} />} href="/viralpulse-ai/posts?tab=published" foot={delta(s.posts.deltaPct, vs)}>{s.posts.publishedMonth}</Stat>
          )}
          {s.posts && (
            <Stat label="Scheduled posts" icon={<CalendarClock className={ICON} />} href="/viralpulse-ai/posts?tab=scheduled" foot={s.posts.awaitingApproval ? <span>{s.posts.awaitingApproval} awaiting approval</span> : undefined}>{s.posts.scheduled}</Stat>
          )}
          {s.ads && (
            <Stat label="Running campaigns" icon={<Megaphone className={ICON} />} href="/viralpulse-ai/campaigns" foot={
              s.ads.spend.byCurrency.length ? (
                <>
                  <span className="font-semibold text-foreground">{s.ads.spend.byCurrency.map((c) => formatCurrency(c.value, c.currency)).join(" + ")}</span>
                  <span>spend this month</span>
                  {delta(s.ads.deltaPct, vs)}
                  <SourceBadge source="synced" at={s.ads.spend.syncedAt} label="Synced" />
                </>
              ) : <span>No ad spend synced this month</span>
            }>{s.ads.running}</Stat>
          )}
          {s.images && <Stat label="AI images this month" icon={<ImageIcon className={ICON} />} href="/viralpulse-ai/image-studio?tab=library" foot={delta(s.images.deltaPct, vs)}>{s.images.month}</Stat>}
          {s.ugc && (
            <Stat label="UGC videos" icon={<Clapperboard className={ICON} />} href="/viralpulse-ai/ugc" foot={<span>{s.ugc.generating} generating</span>}>{s.ugc.ready} <span className="text-xs font-medium text-muted-foreground">ready</span></Stat>
          )}
          {s.accounts && (
            <Stat label="Accounts healthy" icon={<Users className={ICON} />} href="/viralpulse-ai/settings?tab=integrations" tone={s.accounts.needAttention ? "warn" : undefined} foot={s.accounts.total === 0 ? <span>None connected yet</span> : s.accounts.needAttention ? <span>{s.accounts.needAttention} need attention</span> : <span>All working</span>}>{s.accounts.healthy}<span className="text-sm font-medium text-muted-foreground"> / {s.accounts.total}</span></Stat>
          )}
        </KpiGrid>
      </section>
    );
  });
}

// ── Schedule ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function ScheduleSection({ ctx, canCreate }: { ctx: DashCtx; canCreate: boolean }) {
  return guard("Upcoming schedule", undefined, () => loadSchedule(ctx), (d) => (
    <Panel id="schedule" title="Upcoming schedule" description={d.total > d.rows.length ? `Next ${d.rows.length} of ${d.total} scheduled posts` : "Next scheduled posts across platforms"} href="/viralpulse-ai/posts?view=week" hrefLabel="Open calendar">
      {d.rows.length === 0 ? (
        <EmptyState icon={<CalendarClock className="size-5" />} title="Nothing is scheduled" className="py-8" action={canCreate ? <Link href="/viralpulse-ai/posts/new" className={buttonVariants({ size: "sm" })}>Schedule a post</Link> : undefined}>Posts you schedule appear here with the account each one goes to.</EmptyState>
      ) : (
        <ul className="divide-y divide-border/50">
          {d.rows.map((r) => (
            <li key={r.id}>
              <Link href={`/viralpulse-ai/posts/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md py-2 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{whenIn(new Date(r.scheduledAt), d.tz)}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    {r.targets.map((t) => <span key={t.platform} className="inline-flex items-center gap-1"><PlatformChip platform={t.platform} />{t.account ?? <span title="No account chosen yet: the default is used when one exists">no account set</span>}</span>)}
                  </p>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", r.state === "overdue" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : r.state === "awaiting_approval" ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}>{SCHEDULE_STATE_LABEL[r.state]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  ));
}

// ── Recently published ──────────────────────────────────────────────────────────────────────────────────────────────────────

export async function PublishedSection({ ctx }: { ctx: DashCtx }) {
  return guard("Recently published", undefined, () => loadRecentPublished(ctx), (d) => (
    <Panel id="published" title="Recently published" description={d.metrics ? "With the latest results read from each platform" : "Your last published posts"} href="/viralpulse-ai/posts?tab=published">
      {d.rows.length === 0 ? (
        <EmptyState icon={<Send className="size-5" />} title="Nothing published yet" className="py-8">Once a post goes out, it shows here with its reach and engagement.</EmptyState>
      ) : (
        <ul className="divide-y divide-border/50">
          {d.rows.map((r) => (
            <li key={r.id}>
              <Link href={`/viralpulse-ai/posts/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md py-2 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">{whenIn(new Date(r.publishedAt), d.tz)} {r.platforms.map((p) => <PlatformChip key={p} platform={p} />)}</p>
                </div>
                {d.metrics ? (
                  r.reach !== null || r.engagements !== null ? (
                    <div className="text-right text-xs">
                      <p><span className="font-semibold tabular-nums">{r.reach !== null ? formatCompact(r.reach) : "—"}</span> <span className="text-muted-foreground">reach</span> · <span className="font-semibold tabular-nums">{r.engagements !== null ? formatCompact(r.engagements) : "—"}</span> <span className="text-muted-foreground">engaged</span></p>
                      <SourceBadge source="synced" at={r.syncedAt} label="Synced" />
                    </div>
                  ) : <span className="text-xs text-muted-foreground">Results not synced yet</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  ));
}

// ── Campaigns & Ads ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const BUCKET_LABEL: Record<LaunchBucket, string> = { issue: "Rejected", failed: "Launch failed", review: "In review", running: "Running", paused: "Paused", archived: "Archived" };

export async function AdsSection({ ctx }: { ctx: DashCtx }) {
  return guard("Campaigns & Ads", undefined, () => loadAdsSnapshot(ctx), (d) => {
    const launches = d.buckets.running + d.buckets.review + d.buckets.paused + d.buckets.issue + d.buckets.failed;
    const money = d.spend.byCurrency.map((c) => formatCurrency(c.value, c.currency)).join(" + ");
    return (
      <Panel id="ads" title="Campaigns & Ads" description="Launched ads and where they stand" href="/viralpulse-ai/campaigns">
        {d.campaigns === 0 && launches === 0 ? (
          <EmptyState icon={<Megaphone className="size-5" />} title="No campaigns yet" className="py-8" action={ctx.perms.newCampaign ? <Link href="/viralpulse-ai/campaigns/new" className={buttonVariants({ size: "sm" })}>New campaign</Link> : undefined}>Plan a campaign, create its ads and launch them to Meta from here.</EmptyState>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([["running", "Running"], ["review", "In review"], ["paused", "Paused"], ["issue", "Rejected"]] as const).map(([k, label]) => (
                <div key={k} className="rounded-xl border border-border/40 bg-background/60 px-3 py-2">
                  <dt className="text-[11px] text-muted-foreground">{label}</dt>
                  <dd className={cn("text-lg font-bold tabular-nums", k === "issue" && d.buckets.issue > 0 && "text-rose-600 dark:text-rose-400")}>{d.buckets[k]}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {d.spend.rows > 0 ? (
                <>
                  <span><span className="font-semibold text-foreground">{money || "Currency unknown"}</span> spent this month</span>
                  <span><span className="font-semibold tabular-nums text-foreground">{formatCompact(d.spend.impressions)}</span> impressions</span>
                  <span><span className="font-semibold tabular-nums text-foreground">{formatCompact(d.spend.clicks)}</span> clicks</span>
                  <SourceBadge source="synced" at={d.spend.syncedAt} label="Synced" />
                </>
              ) : <span>No results synced this month yet. They appear after a launched campaign has been read from Meta.</span>}
              {d.drafts > 0 && <span>{d.drafts} draft campaign{d.drafts === 1 ? "" : "s"}</span>}
            </div>
            {d.approvals.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Waiting for your approval</p>
                <ul className="mt-1 space-y-1">
                  {d.approvals.map((a) => (
                    <li key={a.launchId} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate">{a.name} <span className="text-muted-foreground">· {formatCurrency(a.dailyMinor / 100, a.currency)}/day</span></span>
                      <Link href={`/viralpulse-ai/campaigns/${a.campaignId}`} className={buttonVariants({ size: "xs", variant: "outline" })}>Review</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.approvalsBlocked > 0 && <p className="text-xs text-muted-foreground">{d.approvalsBlocked} launch{d.approvalsBlocked === 1 ? "" : "es"} you created need{d.approvalsBlocked === 1 ? "s" : ""} someone else to approve.</p>}
            {d.top.length > 0 && (
              <ul className="divide-y divide-border/50">
                {d.top.map((t) => (
                  <li key={t.launchId}>
                    <Link href={`/viralpulse-ai/campaigns/${t.campaignId}`} className="flex items-center justify-between gap-3 rounded-md py-1.5 text-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="min-w-0 truncate">{t.name}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        {t.spend !== null && <span className="tabular-nums">{formatCurrency(t.spend, t.currency)}</span>}
                        <span className={cn("rounded-full px-2 py-0.5 font-medium", t.bucket === "issue" || t.bucket === "failed" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : t.bucket === "running" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted")}>{BUCKET_LABEL[t.bucket]}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Panel>
    );
  });
}

// ── Creative studios ────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function StudiosSection({ ctx }: { ctx: DashCtx }) {
  const p = ctx.perms;
  return guard("Creative studios", undefined, () => loadStudios(ctx), (d) => {
    const act = "inline-flex items-center rounded-md text-[11px] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring";
    const none = (!d.images || d.images.length === 0) && (!d.videos || d.videos.length === 0);
    return (
      <Panel id="studios" title="Creative studios" description="Your latest AI images and UGC videos">
        {none ? (
          <EmptyState icon={<Wand2 className="size-5" />} title="Nothing created yet" className="py-8" action={
            <div className="flex flex-wrap justify-center gap-2">
              {p.createImage && <Link href="/viralpulse-ai/image-studio?tab=create" className={buttonVariants({ size: "sm" })}>Create an image</Link>}
              {p.createUgc && <Link href="/viralpulse-ai/ugc/new" className={buttonVariants({ size: "sm", variant: "outline" })}>Create a UGC video</Link>}
            </div>
          }>Images and videos you generate show up here, ready to drop into a post or an ad.</EmptyState>
        ) : (
          <div className="space-y-4">
            {d.images && d.images.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center justify-between text-xs font-semibold">Images <Link href="/viralpulse-ai/image-studio?tab=library" className="font-medium text-primary hover:underline">Library</Link></p>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {d.images.map((m) => (
                    <li key={m.id} className="space-y-1">
                      <MediaThumb media={{ _id: m.id, kind: "image", name: m.name, thumbnailId: null, hasThumb: m.hasThumb }} className="aspect-square w-full" />
                      <p className="truncate text-[11px] text-muted-foreground" title={m.name}>{m.name}</p>
                      <p className="flex flex-wrap gap-x-2">
                        {p.newPost && <Link className={act} href={handoffHref(m.id, "image_studio")}>Use in post</Link>}
                        {p.createAds && <Link className={act} href={`/viralpulse-ai/campaigns/new?step=ads&media=${encodeURIComponent(m.id)}`}>Use in ad</Link>}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.videos && d.videos.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center justify-between text-xs font-semibold">UGC videos <Link href="/viralpulse-ai/ugc" className="font-medium text-primary hover:underline">All videos</Link></p>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {d.videos.map((v) => (
                    <li key={v.id} className="space-y-1">
                      <Link href={`/viralpulse-ai/ugc/${v.id}`} className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={v.title}>
                        {v.status === "ready" && v.mediaId ? (
                          <MediaThumb media={{ _id: v.mediaId, kind: "video", name: v.title, thumbnailId: v.posterId }} className="aspect-square w-full" />
                        ) : (
                          <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg bg-muted px-2 text-center">
                            <Film className="size-6 text-muted-foreground" aria-hidden />
                            <span className="text-[11px] font-medium">{v.status === "generating" ? "Generating" : v.status === "failed" ? "Failed" : "Approved"}</span>
                            {v.status === "generating" && v.scenesTotal > 0 && (
                              <>
                                <span className="h-1.5 w-full max-w-24 overflow-hidden rounded-full bg-background" role="progressbar" aria-valuenow={v.scenesDone} aria-valuemin={0} aria-valuemax={v.scenesTotal} aria-label="Scenes finished"><span className="block h-full bg-primary" style={{ width: `${Math.min(100, (v.scenesDone / v.scenesTotal) * 100)}%` }} /></span>
                                <span className="text-[10px] text-muted-foreground">{v.scenesDone} of {v.scenesTotal} scenes</span>
                              </>
                            )}
                          </div>
                        )}
                      </Link>
                      <p className="truncate text-[11px] text-muted-foreground" title={v.title}>{v.title}</p>
                      {v.status === "ready" && v.mediaId && (
                        <p className="flex flex-wrap gap-x-2">
                          {p.newPost && <Link className={act} href={handoffHref(v.mediaId, "ugc_studio")}>Use in post</Link>}
                          {p.createAds && <Link className={act} href={`/viralpulse-ai/campaigns/new?step=ads&media=${encodeURIComponent(v.mediaId)}&ugc=${encodeURIComponent(v.id)}`}>Use in ad</Link>}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Panel>
    );
  });
}

// ── Analytics highlights ────────────────────────────────────────────────────────────────────────────────────────────────────

export async function HighlightsSection({ ctx }: { ctx: DashCtx }) {
  return guard("Analytics highlights", "lg:col-span-2", () => loadHighlights(ctx), (a) => {
    const bt = a.bestTime;
    const hasTrend = a.trends.reach.length > 0 || a.trends.interactions.length > 0;
    return (
      <Panel id="analytics" title="Analytics highlights" description={`Last 30 days, ${a.range.from} to ${a.range.to}`} href="/viralpulse-ai/analytics" hrefLabel="Open analytics" className="lg:col-span-2">
        {!a.hasAnyAccount ? (
          <EmptyState icon={<Plug className="size-5" />} title="Connect an account to see results" className="py-8" action={ctx.perms.settings ? <Link href="/viralpulse-ai/settings?tab=integrations" className={buttonVariants({ size: "sm" })}>Connect an account</Link> : undefined}>Reach and engagement are read from your connected platforms. {ctx.perms.settings ? "" : "Ask an admin to connect one."}</EmptyState>
        ) : !hasTrend ? (
          <EmptyState icon={<TrendingUp className="size-5" />} title="No results synced for this period yet" className="py-8" action={<SyncNowButton />}>Results are read from the platforms on a schedule. Press Sync now to read them immediately.</EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {([["Reach", a.trends.reach, a.kpis.reach.syncedAt], ["Engagement (interactions)", a.trends.interactions, a.kpis.engagements.syncedAt]] as const).map(([label, data, at]) => (
              <figure key={label} className="min-w-0 space-y-1">
                <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                  <span>{label}{data.length > 0 && <span className="ml-2 font-bold tabular-nums">{formatCompact(data.reduce((s, d) => s + d.value, 0))}</span>}</span>
                  {data.length > 0 && <SourceBadge source="synced" at={at ?? a.lastSyncAt} label="Synced" />}
                </figcaption>
                <MetricsTrendChart data={data} label={label} empty={`No ${label.toLowerCase()} synced for these days.`} />
              </figure>
            ))}
          </div>
        )}
        <div className="rounded-xl border border-border/40 bg-background/60 p-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-semibold"><Sparkles className="size-3.5 text-primary" aria-hidden /> Best time to post</p>
          {bt.ok ? (
            <>
              <p className="mt-1">{bt.best.map((s) => `${WEEKDAYS[s.weekday]} ${hourLabel(s.hour)}`).join(", ")} <span className="text-xs text-muted-foreground">(India time)</span></p>
              <p className="text-xs text-muted-foreground">Based on {bt.used} published posts with synced results. Posts at those times averaged the highest engagement rate.</p>
            </>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{bt.reason} Best times are only shown from {BEST_TIME_MIN_POSTS} posts with results, so they are never guesses.</p>
          )}
        </div>
      </Panel>
    );
  });
}

// ── Accounts ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const STATUS_LABEL = { healthy: "Healthy", expiring: "Expiring", expired: "Expired", revoked: "Revoked", missing_scope: "Missing permission" } as const;

export async function AccountsSection({ ctx }: { ctx: DashCtx }) {
  return guard("Accounts health", undefined, () => loadAccountsHealth(ctx), (rows) => (
    <Panel id="accounts" title="Accounts health" description="Connected accounts and their login status" href={ctx.perms.settings ? "/viralpulse-ai/settings?tab=integrations" : undefined} hrefLabel="Manage">
      {rows.length === 0 ? (
        <EmptyState icon={<Plug className="size-5" />} title="No accounts connected" className="py-8" action={ctx.perms.settings ? <Link href="/viralpulse-ai/settings?tab=integrations" className={buttonVariants({ size: "sm" })}>Connect an account</Link> : undefined}>{ctx.perms.settings ? "Connect Facebook, Instagram, YouTube, LinkedIn, X or Google Business to publish." : "Ask an admin to connect your social accounts."}</EmptyState>
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.slice(0, 10).map((a) => {
            const bad = a.status !== "healthy" || !!a.lastError;
            return (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <span className={cn("size-2 shrink-0 rounded-full", bad ? (a.status === "expiring" ? "bg-amber-500" : "bg-rose-500") : "bg-emerald-500")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.name}{a.isDefault && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">default</span>}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.provider}{a.lastError ? ` · ${a.lastError}` : ""}</p>
                </div>
                <div className="text-right text-xs">
                  <p className={cn("font-medium", bad ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300")}>{a.status === "healthy" && a.lastError ? "Last call failed" : STATUS_LABEL[a.status]}</p>
                  <p className="text-muted-foreground">{a.autoRenews ? "Renews itself" : a.daysLeft !== null ? (a.daysLeft < 0 ? "Expired" : `${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"} left`) : "No expiry"}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 10 && <p className="text-xs text-muted-foreground">+{rows.length - 10} more accounts</p>}
    </Panel>
  ));
}

// ── Activity ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const ENTITY_HREF: Record<string, (id: string, rec: string | null) => string | null> = {
  campaign: (id, rec) => `/viralpulse-ai/campaigns/${rec ?? id}`,
  ad: (_id, rec) => (rec ? `/viralpulse-ai/campaigns/${rec}` : null),
  post: (id) => `/viralpulse-ai/posts/${id}`,
  ugc: (id) => `/viralpulse-ai/ugc/${id}`,
};

export async function ActivitySection({ ctx }: { ctx: DashCtx }) {
  return guard("Recent activity", undefined, () => loadActivity(ctx), (d) => (
    <Panel id="activity" title="Recent activity" description="Who did what, last 10 actions" href="/workspace/settings/audit-log?source=products&module=smms" hrefLabel="Full log">
      {d.rows.length === 0 ? (
        <EmptyState icon={<Wallet className="size-5" />} title="No activity yet" className="py-8">Creating, approving and publishing are recorded here.</EmptyState>
      ) : (
        <ul className="divide-y divide-border/50">
          {d.rows.map((r) => {
            const href = ENTITY_HREF[r.entity]?.(r.entityId, r.recordId) ?? null;
            const label = r.label ?? r.entity;
            return (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-xs">
                <p className="min-w-0 flex-1 basis-56"><span className="font-medium">{r.who}</span> <span className="text-muted-foreground">{r.what.toLowerCase()}</span> {href ? <Link href={href} className="font-medium text-primary hover:underline">{label}</Link> : <span className="font-medium">{label}</span>}</p>
                <time dateTime={r.at} className="shrink-0 text-muted-foreground">{whenIn(new Date(r.at), d.tz)}</time>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  ));
}
