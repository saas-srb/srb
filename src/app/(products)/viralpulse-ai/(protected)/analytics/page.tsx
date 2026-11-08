import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Eye, Heart, Percent, Radio, Users, Wallet } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";
import PanelTabs from "@/components/platform/panel/PanelTabs";
import EmptyState from "@/components/products/viralpulse-ai/shared/EmptyState";
import SourceBadge from "@/components/products/viralpulse-ai/shared/SourceBadge";
import { PlatformChip } from "@/components/products/viralpulse-ai/SmmsBits";
import MetricsTrendChart from "@/components/products/viralpulse-ai/analytics/MetricsTrendChart";
import ExportCsvButton from "@/components/products/viralpulse-ai/analytics/ExportCsvButton";
import SyncNowButton from "@/components/products/viralpulse-ai/analytics/SyncNowButton";
import MetricsSettingsForm from "@/components/products/viralpulse-ai/analytics/MetricsSettingsForm";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { loadAnalytics, CONTENT_TYPES, CREATIVE_SOURCES, CREATIVE_SOURCE_LABEL, type AnalyticsData } from "@/lib/products/viralpulse-ai/metrics/queries";
import { getMetricsSettings } from "@/lib/products/viralpulse-ai/metrics/store";
import { RATE_FORMULA, WEEKDAYS, BEST_TIME_MIN_POSTS, BEST_TIME_MIN_PER_CELL } from "@/lib/products/viralpulse-ai/metrics/compute";
import { METRIC_PLATFORMS, PLATFORM_LABEL } from "@/lib/products/viralpulse-ai/metrics/types";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS = [["overview", "Overview"], ["posts", "Posts & Reels"], ["paid", "Campaigns & Ads"], ["creatives", "Creatives"], ["accounts", "Accounts"], ["besttime", "Best time to post"]] as const;
const n = (v: number | null | undefined) => (v === null || v === undefined ? "-" : v.toLocaleString("en-IN"));
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "-" : `${v.toFixed(2)}%`);
const money = (v: number | null, c: string) => (v === null ? "-" : c ? formatCurrency(v, c) : v.toLocaleString("en-IN"));
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const notSynced = (why: string | null) => <span className="text-base font-medium text-muted-foreground" title={why ?? undefined}>Not synced yet</span>;
const CONTENT_LABEL: Record<string, string> = { post: "Post (feed, text, carousel)", reel: "Reel / Short / Story", video: "Video", ad: "Ad (paid)" };
const rowStatus: Record<string, string> = { ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", error: "bg-rose-500/10 text-rose-700 dark:text-rose-300", deferred: "bg-amber-500/10 text-amber-800 dark:text-amber-300", never: "bg-muted text-muted-foreground", skipped: "bg-muted text-muted-foreground" };
const STATUS_LABEL: Record<string, string> = { ok: "Up to date", error: "Failing", deferred: "Waiting for the platform", never: "Not synced yet", skipped: "Switched off" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  if (!can(viewer, "VIEW_ANALYTICS")) redirect("/viralpulse-ai");
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "overview";
  const filters = { from: sp.from, to: sp.to, platform: sp.platform, account: sp.account, campaign: sp.campaign, contentType: sp.contentType, creativeSource: sp.creativeSource };
  const [d, settings] = await Promise.all([loadAnalytics(filters), getMetricsSettings()]);
  const qs = (t: string) => { const p = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => Boolean(e[1]) && e[0] !== "tab")); p.set("tab", t); return `/viralpulse-ai/analytics?${p.toString()}`; };
  const k = d.kpis;
  const syncedLabel = (at: string | null, who: string[]) => (at ? <SourceBadge source="synced" at={at} label={`Synced from ${who.length ? who.map((p) => PLATFORM_LABEL[p as keyof typeof PLATFORM_LABEL] ?? p).join(", ") : "platform"}`} /> : <SourceBadge source="estimate" label="Not synced yet" />);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Analytics" }]}
        title="Analytics"
        description="Real numbers read from Instagram, Facebook, YouTube, LinkedIn, X and your Meta ads. Every figure shows when it was last read from the platform; nothing is estimated."
        actions={<div className="flex flex-wrap items-center gap-2"><SyncNowButton /><ExportCsvButton filters={filters} /></div>}
        filters={
          <PanelFilterBar
            fields={[
              { key: "from", label: "From", type: "date" },
              { key: "to", label: "To", type: "date" },
              { key: "platform", label: "Platform", type: "select", options: [...METRIC_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABEL[p] })), { value: "meta", label: "Meta ads" }], allLabel: "All platforms" },
              { key: "account", label: "Account", type: "select", options: d.filterOptions.accounts.map((a) => ({ value: a.id, label: a.name })), allLabel: "All accounts" },
              { key: "campaign", label: "Campaign", type: "select", options: d.filterOptions.campaigns.map((c) => ({ value: c.id, label: c.name })), allLabel: "All campaigns" },
              { key: "contentType", label: "Content type", type: "select", options: CONTENT_TYPES.map((c) => ({ value: c, label: CONTENT_LABEL[c] })), allLabel: "All types" },
              { key: "creativeSource", label: "Creative source", type: "select", options: CREATIVE_SOURCES.filter((c) => c !== "none").map((c) => ({ value: c, label: CREATIVE_SOURCE_LABEL[c] })), allLabel: "All sources" },
            ]}
          />
        }
      />

      {!d.hasAnyAccount && (
        <GlassCard interactive={false}><CardContent><EmptyState icon={<Radio className="size-5" />} title="No account to read numbers from" action={<Link href="/viralpulse-ai/settings/accounts" className="text-sm font-medium text-primary hover:underline">Connect an account</Link>}>Connect Instagram, Facebook, YouTube, LinkedIn or X in Settings. Numbers appear after the first read, which starts when you connect and then repeats every 3 hours.</EmptyState></CardContent></GlassCard>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Reach (sum of daily)" value={k.reach.value !== null ? n(k.reach.value) : notSynced(k.reach.reason)} icon={<Users className="size-4" />} />
        <KpiCard label="Views (sum of daily)" value={k.views.value !== null ? n(k.views.value) : notSynced(k.views.reason)} icon={<Eye className="size-4" />} />
        <KpiCard label="Engagements" value={k.engagements.value !== null ? n(k.engagements.value) : notSynced(k.engagements.reason)} icon={<Heart className="size-4" />} />
        <KpiCard label="Engagement rate" value={k.engagementRate.value !== null ? pct(k.engagementRate.value) : notSynced(k.engagementRate.reason)} icon={<Percent className="size-4" />} />
        <KpiCard label={k.followers.change !== null ? `Followers (${k.followers.change >= 0 ? "+" : ""}${k.followers.change.toLocaleString("en-IN")} in period)` : "Followers"} value={k.followers.value !== null ? n(k.followers.value) : notSynced(k.followers.reason)} icon={<Users className="size-4" />} />
        <KpiCard label="Ad spend" value={k.spend.byCurrency.length ? k.spend.byCurrency.map((c) => money(c.value, c.currency)).join(" + ") : notSynced(k.spend.reason)} icon={<Wallet className="size-4" />} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {syncedLabel(k.reach.syncedAt ?? k.views.syncedAt, [...new Set([...k.reach.platforms, ...k.views.platforms])])}
        {syncedLabel(k.engagements.syncedAt, k.engagements.platforms)}
        {k.spend.syncedAt && <SourceBadge source="synced" at={k.spend.syncedAt} label="Synced from Meta Ads" />}
        <span>Reach and views are the sum of each day&apos;s figure across accounts and platforms; the same person can be counted on several days or platforms, so they are not unique reach. Rate: {RATE_FORMULA}</span>
      </div>

      <PanelTabs label="Analytics sections" active={tab} tabs={TABS.map(([key, label]) => ({ key, label, href: qs(key) }))} />

      {tab === "overview" && <Overview d={d} />}
      {tab === "posts" && <Posts d={d} />}
      {tab === "paid" && <Paid d={d} />}
      {tab === "creatives" && <Creatives d={d} />}
      {tab === "accounts" && <Accounts d={d} settings={settings} canEdit={can(viewer, "MANAGE_INTEGRATIONS")} />}
      {tab === "besttime" && <BestTime d={d} />}
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <GlassCard interactive={false}><CardHeader><CardTitle>{title}</CardTitle>{description && <p className="text-xs text-muted-foreground">{description}</p>}</CardHeader><CardContent>{children}</CardContent></GlassCard>;
}

function Overview({ d }: { d: AnalyticsData }) {
  const why = d.hasAnyAccount ? "Not synced yet for this period. Daily account numbers appear after the first read." : "Connect an account to see this chart.";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Reach per day" description="Added across the selected accounts"><MetricsTrendChart data={d.trends.reach} label="Reach" empty={why} /></Card>
      <Card title="Views per day" description="Plays and media views (the platforms' current 'views' metric)"><MetricsTrendChart data={d.trends.views} label="Views" empty={why} /></Card>
      <Card title="Interactions per day" description="Likes, comments, shares and saves as the platform totals them (Instagram)"><MetricsTrendChart data={d.trends.interactions} label="Interactions" empty="Daily interactions are available for Instagram accounts. Not synced yet." /></Card>
      <Card title="Followers" description="Our own daily record, one point per day an account was read"><MetricsTrendChart data={d.trends.followers} label="Followers" empty={why} /></Card>
    </div>
  );
}

function Posts({ d }: { d: AnalyticsData }) {
  return (
    <Card title="Posts & Reels" description={`Posts published through ViralPulse in the period, matched to the platform by their own post id. ${d.unmatched ? `${d.unmatched} published post(s) cannot be matched (marked published by hand, or published with an account that is no longer connected).` : ""}`}>
      {d.posts.length === 0 ? <EmptyState icon={<BarChart3 className="size-5" />} title="No posts to show">No post published through ViralPulse in this period matches the filters, or none carries a platform post id.</EmptyState> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Post</TableHead><TableHead>Platform</TableHead><TableHead>Published</TableHead><TableHead className="text-right">Reach</TableHead><TableHead className="text-right">Views</TableHead><TableHead className="text-right">Likes</TableHead><TableHead className="text-right">Comments</TableHead><TableHead className="text-right">Shares</TableHead><TableHead className="text-right">Saves</TableHead><TableHead className="text-right">Engagements</TableHead><TableHead className="text-right" title={RATE_FORMULA}>Eng. rate (?)</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.posts.map((p) => (
                <TableRow key={`${p.postId}-${p.platform}`}>
                  <TableCell className="max-w-xs"><Link href={`/viralpulse-ai/posts/${p.postId}`} className="font-medium hover:text-primary">{p.title}</Link><p className="text-[11px] text-muted-foreground">{p.accountName} · {p.format}{p.url && <> · <a href={p.url} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">View live post</a></>}</p></TableCell>
                  <TableCell><PlatformChip platform={p.platform} /></TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(p.publishedAt)}</TableCell>
                  {(["reach", "views", "likes", "comments", "shares", "saves"] as const).map((m) => <TableCell key={m} className="text-right tabular-nums">{n(p.metrics[m] ?? (m === "views" ? p.metrics.impressions : undefined))}</TableCell>)}
                  <TableCell className="text-right tabular-nums">{n(p.engagements)}</TableCell>
                  <TableCell className="text-right tabular-nums" title={p.rate ? `${n(p.engagements)} ÷ ${n(p.metrics[p.rate.denominator === "reach" ? "reach" : p.rate.denominator])} ${p.rate.denominator}` : "Needs engagements and reach, views or impressions"}>{p.rate ? pct(p.rate.value) : "-"}</TableCell>
                  <TableCell className="space-y-1">{p.syncedAt ? <SourceBadge source="synced" at={p.syncedAt} label="Synced" /> : <SourceBadge source="estimate" label="Not synced yet" />}{p.manual && <SourceBadge source="manual" at={p.manual.at} label={`Entered manually by ${p.manual.by}`} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">Figures typed in by hand (Publishing, Record performance) are never added into the synced numbers above; they appear only as a badge showing who entered them and when.</p>
    </Card>
  );
}

function Paid({ d }: { d: AnalyticsData }) {
  const label = { campaign: "Campaign", adset: "Ad set", ad: "Ad" } as const;
  return (
    <Card title="Campaigns & Ads" description="Read from Meta Ads by the campaign sync (not typed in or imported). CPA is shown only when Meta reports conversions; ROAS only when it reports conversion value.">
      {d.paid.length === 0 ? <EmptyState icon={<Wallet className="size-5" />} title="No ad results synced yet">Results appear after a campaign launched from ViralPulse has been read from Meta. Ads launched elsewhere, and other ad platforms, are not read yet.</EmptyState> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Level</TableHead><TableHead>Name</TableHead><TableHead className="text-right">Spend</TableHead><TableHead className="text-right">Impr.</TableHead><TableHead className="text-right">Link clicks</TableHead><TableHead className="text-right">CTR</TableHead><TableHead className="text-right">CPC</TableHead><TableHead className="text-right">CPM</TableHead><TableHead className="text-right">Conversions</TableHead><TableHead className="text-right">CPA</TableHead><TableHead className="text-right">ROAS</TableHead><TableHead>Read</TableHead></TableRow></TableHeader>
            <TableBody>
              {(["campaign", "adset", "ad"] as const).flatMap((lvl) => d.paid.filter((r) => r.level === lvl)).map((r) => (
                <TableRow key={`${r.level}-${r.id}`}>
                  <TableCell className="text-xs">{label[r.level]}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.campaignId && r.level === "campaign" ? <Link href={`/viralpulse-ai/campaigns/${r.campaignId}`} className="hover:text-primary">{r.name}</Link> : r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.spend, r.currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{n(r.impressions)}</TableCell>
                  <TableCell className="text-right tabular-nums">{n(r.clicks)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(r.math.ctr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.math.cpc, r.currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.math.cpm, r.currency)}</TableCell>
                  <TableCell className="text-right tabular-nums" title={r.conversionAction ?? "Meta reported no conversions"}>{n(r.conversions)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.math.cpa, r.currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.math.roas === null ? "-" : `${r.math.roas}×`}</TableCell>
                  <TableCell>{r.syncedAt && <SourceBadge source="synced" at={r.syncedAt} label="Synced" />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function Creatives({ d }: { d: AnalyticsData }) {
  return (
    <Card title="Creatives" description="Which images and videos performed best, joined through the post's or ad's media. Posts use engagement rate; ads use CTR.">
      {d.creatives.length === 0 ? <EmptyState icon={<BarChart3 className="size-5" />} title="No creative results yet">Creatives appear once a post or ad that uses a media item has synced numbers.</EmptyState> : (
        <Table>
          <TableHeader><TableRow><TableHead>Creative</TableHead><TableHead>Source</TableHead><TableHead className="text-right">Posts</TableHead><TableHead className="text-right">Engagements</TableHead><TableHead className="text-right">Avg. eng. rate</TableHead><TableHead className="text-right">Ads</TableHead><TableHead className="text-right">Ad spend</TableHead><TableHead className="text-right">Ad CTR</TableHead></TableRow></TableHeader>
          <TableBody>
            {d.creatives.map((c) => (
              <TableRow key={c.mediaId}>
                <TableCell className="max-w-xs truncate">{c.name} <span className="text-[11px] text-muted-foreground">({c.kind})</span></TableCell>
                <TableCell className="text-xs">{CREATIVE_SOURCE_LABEL[c.source]}</TableCell>
                <TableCell className="text-right tabular-nums">{c.posts}</TableCell>
                <TableCell className="text-right tabular-nums">{n(c.engagements)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(c.avgRate)}</TableCell>
                <TableCell className="text-right tabular-nums">{c.ads}</TableCell>
                <TableCell className="text-right tabular-nums">{c.ads ? money(c.adSpend, c.currency ?? "") : "-"}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(c.adCtr)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function Accounts({ d, settings, canEdit }: { d: AnalyticsData; settings: Awaited<ReturnType<typeof getMetricsSettings>>; canEdit: boolean }) {
  return (
    <div className="space-y-4">
      <Card title="Accounts" description="Growth and sync state of each connected account. A failing account keeps its last good numbers; the admins are notified after 3 failed reads in a row.">
        {d.accounts.length === 0 ? <EmptyState icon={<Radio className="size-5" />} title="No accounts connected">Connect accounts in Settings &gt; Connected accounts.</EmptyState> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Followers</TableHead><TableHead className="text-right">Change in period</TableHead><TableHead className="text-right">Posts tracked</TableHead><TableHead>Status</TableHead><TableHead>Last synced</TableHead><TableHead>Next sync</TableHead><TableHead>Detail</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {d.accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell><PlatformChip platform={a.platform} /> <span className="ml-1">{a.name}</span></TableCell>
                    <TableCell className="text-right tabular-nums">{a.followers !== null ? n(a.followers) : "Not synced yet"}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.followerChange === null ? "-" : `${a.followerChange >= 0 ? "+" : ""}${a.followerChange.toLocaleString("en-IN")}`}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.postsTracked}</TableCell>
                    <TableCell><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${rowStatus[a.status]}`}>{STATUS_LABEL[a.status]}</span></TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{a.lastOkAt ? formatDateTime(a.lastOkAt) : "Never"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{a.nextSyncAt ? formatDateTime(a.nextSyncAt) : "-"}</TableCell>
                    <TableCell className="max-w-sm text-[11px] text-muted-foreground">{a.error && <p className="text-rose-700 dark:text-rose-300">{a.error}</p>}{a.warnings.map((w) => <p key={w}>{w}</p>)}</TableCell>
                    <TableCell><SyncNowButton accountId={a.id} size="xs" label="Sync" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
      <Card title="Sync settings" description="How much history is kept and how much the platforms are asked for."><MetricsSettingsForm initial={settings} canEdit={canEdit} /></Card>
    </div>
  );
}

function BestTime({ d }: { d: AnalyticsData }) {
  const b = d.bestTime;
  return (
    <Card title="Best time to post" description={`Computed from this company's own posts with synced results (all time, ${BEST_TIME_MIN_POSTS}+ posts needed; each weekday and hour needs ${BEST_TIME_MIN_PER_CELL}+ posts). Times are India time (IST). The Schedule step uses the same result.`}>
      {!b.ok ? <EmptyState icon={<BarChart3 className="size-5" />} title="Not enough data yet">{b.reason}</EmptyState> : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">{b.best.map((s, i) => <span key={`${s.weekday}-${s.hour}`} className="rounded-xl bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">{i + 1}. {WEEKDAYS[s.weekday]} {hh(s.hour)} · {s.avgRate}% avg · {s.posts} posts</span>)}</div>
          <p className="text-xs text-muted-foreground">Based on {b.used} posts. Average engagement rate per weekday and hour; slots with fewer than {BEST_TIME_MIN_PER_CELL} posts are not ranked.</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Weekday</TableHead><TableHead>Hour (IST)</TableHead><TableHead className="text-right">Posts</TableHead><TableHead className="text-right">Avg. engagement rate</TableHead></TableRow></TableHeader>
              <TableBody>{[...b.slots].sort((x, y) => x.weekday - y.weekday || x.hour - y.hour).map((s) => <TableRow key={`${s.weekday}-${s.hour}`}><TableCell>{WEEKDAYS[s.weekday]}</TableCell><TableCell>{hh(s.hour)}</TableCell><TableCell className="text-right tabular-nums">{s.posts}</TableCell><TableCell className="text-right tabular-nums">{s.posts >= BEST_TIME_MIN_PER_CELL ? pct(s.avgRate) : `${pct(s.avgRate)} (too few posts to rank)`}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        </div>
      )}
    </Card>
  );
}
