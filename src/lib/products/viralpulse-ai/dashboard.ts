import "server-only";
import { COLLECTIONS, smmsCollection, notDeleted } from "@/lib/products/viralpulse-ai/db";
import { postsCollection } from "@/lib/products/viralpulse-ai/posts";
import { campaignsCollection } from "@/lib/products/viralpulse-ai/campaigns";
import { adsCollection } from "@/lib/products/viralpulse-ai/ads";
import { mediaCollection } from "@/lib/products/viralpulse-ai/media";
import { launchesCollection, approvalCovers, type LaunchDoc } from "@/lib/products/viralpulse-ai/ads-platforms/launches";
import { snapshotsCollection } from "@/lib/products/viralpulse-ai/ads-platforms/snapshots";
import { INSIGHTS_SOURCE } from "@/lib/products/viralpulse-ai/ads-platforms/ads-sync";
import { getGuard } from "@/lib/products/viralpulse-ai/ads-platforms/guard";
import { projectsCollection as ugcProjects, NOT_SAMPLE } from "@/lib/products/viralpulse-ai/ugc/store";
import { getBrandKit } from "@/lib/products/viralpulse-ai/images/store";
import { listAccounts } from "@/lib/products/viralpulse-ai/accounts/service";
import { accountHealthItems } from "@/lib/products/viralpulse-ai/accounts/health";
import { ACCOUNT_INFO, type AccountProvider, type AccountView } from "@/lib/products/viralpulse-ai/accounts/types";
import { getPublishSettings } from "@/lib/products/viralpulse-ai/publishers/publish-settings";
import { getViralPulseHealth, type ViralPulseHealth } from "@/lib/products/viralpulse-ai/health";
import { loadAnalytics, type AnalyticsData } from "@/lib/products/viralpulse-ai/metrics/queries";
import { recentActivity, AUDIT_ACTION_LABEL, type AuditLog } from "@/lib/products/viralpulse-ai/audit";
import { buildSetup, fromHealth, rankAttention, launchBucket, lastDays, pctChange, periodsFor, scheduleState, type AttentionItem, type DashPerms, type LaunchBucket, type Periods, type ScheduleState, type SetupFacts } from "./dashboard-core";

/**
 * Data for the ViralPulse Dashboard. One loader per section so each streams on its own. Everything is read from the company's own records
 * (posts, launches, snapshots, media, UGC projects, accounts, audit); nothing is estimated and a missing number stays missing. A loader
 * returns null when the viewer's permissions do not include that section, so the page can leave it out instead of showing a lock.
 */

export interface DashCtx {
  now: Date;
  perms: DashPerms;
  viewerId: string;
  /** The analytics read shared by several sections (the page memoises it per request). */
  analytics?: () => Promise<AnalyticsData>;
  health?: () => Promise<ViralPulseHealth | null>;
}

const MIN = 60_000;

/** Never let a slow probe hold the page: after `ms` the answer is `fallback`. */
export function within<T>(ms: number, p: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

export async function companyTz(): Promise<string> {
  return (await getPublishSettings()).timezone;
}

export const last30 = (ctx: Pick<DashCtx, "now">, tz: string) => lastDays(ctx.now, tz, 30);

async function analyticsOf(ctx: DashCtx, tz: string): Promise<AnalyticsData> {
  if (ctx.analytics) return ctx.analytics();
  const r = last30(ctx, tz);
  return loadAnalytics({ from: r.from, to: r.to }, ctx.now);
}

// ── accounts ────────────────────────────────────────────────────────────────────────────────────────────

const SOCIAL_LABEL: Partial<Record<AccountProvider, string>> = {
  instagram_business: "Instagram", facebook_page: "Facebook", youtube_channel: "YouTube", linkedin_organization: "LinkedIn", linkedin_member: "LinkedIn", x_account: "X", gbp_location: "Google Business",
};
export const SOCIAL_PLATFORM_ORDER = ["Instagram", "Facebook", "YouTube", "LinkedIn", "X", "Google Business"] as const;

const PLATFORM_PROVIDERS: Record<string, AccountProvider[]> = {
  instagram: ["instagram_business"], facebook: ["facebook_page"], youtube: ["youtube_channel"], linkedin: ["linkedin_organization", "linkedin_member"], x: ["x_account"], google_business: ["gbp_location"],
};

const liveAccounts = (views: AccountView[]) => views.filter((a) => a.enabled && !a.disconnected);

export function platformCounts(views: AccountView[]): { label: string; count: number }[] {
  return SOCIAL_PLATFORM_ORDER.map((label) => ({ label, count: liveAccounts(views).filter((a) => SOCIAL_LABEL[a.provider] === label).length }));
}

// ── setup checklist + attention ──────────────────────────────────────────────────────────────────────

const exists = async (name: string, id: string) => Boolean(await (await smmsCollection<{ _id: string }>(name)).findOne({ _id: id }, { projection: { _id: 1 } }));

export async function loadSetup(ctx: DashCtx) {
  const p = ctx.perms;
  const [accounts, brandKit, publishingSaved, guard, postCount, campaignCount, health] = await Promise.all([
    p.settings ? listAccounts({}, ctx.now) : Promise.resolve([] as AccountView[]),
    getBrandKit().catch(() => null),
    exists(COLLECTIONS.settings, "publishing"),
    getGuard().catch(() => null),
    p.newPost ? postsCollection().then((c) => c.countDocuments({ ...notDeleted }, { limit: 1 })) : Promise.resolve(0),
    p.newCampaign ? campaignsCollection().then((c) => c.countDocuments({ ...notDeleted }, { limit: 1 })) : Promise.resolve(0),
    p.settings ? within(9000, ctx.health ? ctx.health() : getViralPulseHealth(), null) : Promise.resolve(null),
  ]);
  const ai = health?.groups.find((g) => g.id === "ai");
  const aiBad = ai?.items.find((i) => i.status === "attention");
  const facts: SetupFacts = {
    platforms: platformCounts(accounts),
    brandKitSet: Boolean(brandKit && (brandKit.logoMediaId || brandKit.colours.primary || brandKit.voice.trim())),
    aiModels: !ai ? { state: "unknown", detail: "The model check did not answer in time. Open System health to run it." } : aiBad ? { state: "attention", detail: aiBad.detail } : { state: "ok", detail: "The text and image models are available." },
    publishingSaved,
    limitsSet: Boolean(guard && Object.values(guard.perCurrency).some((c) => Object.values(c).some((v) => typeof v === "number" && v > 0))),
    postCount,
    campaignCount,
  };
  return buildSetup(facts, p);
}

/** Findings the checklist already covers (a provider that was never set up is a setup step, not a fault). */
const SETUP_STATE = /aren't set up yet|no account is connected/i;

export async function loadAttention(ctx: DashCtx): Promise<AttentionItem[]> {
  const p = ctx.perms;
  const out: AttentionItem[] = [];
  const posts = p.viewPosts ? await postsCollection() : null;
  const [failed, overdue, launches, dueAds, guard, views, health] = await Promise.all([
    posts ? posts.countDocuments({ ...notDeleted, status: "failed" }) : 0,
    posts ? posts.countDocuments({ ...notDeleted, status: "scheduled", approvedBy: { $ne: null }, publishQueuedAt: null, scheduledAt: { $lt: new Date(ctx.now.getTime() - 15 * MIN) } }) : 0,
    p.viewCampaigns ? launchesCollection().then((c) => c.find({ active: true }, { projection: { campaignId: 1, campaignName: 1, state: 1, delivery: 1, review: 1, lastError: 1 } }).limit(100).toArray()) : [],
    p.viewCampaigns ? adsCollection().then((c) => c.countDocuments({ ...notDeleted, status: "scheduled", scheduledAt: { $lte: ctx.now } })) : 0,
    p.viewCampaigns ? getGuard().catch(() => null) : null,
    p.viewPosts || p.settings || p.viewCampaigns ? listAccounts({}, ctx.now).catch(() => [] as AccountView[]) : [],
    p.settings ? within(9000, ctx.health ? ctx.health() : getViralPulseHealth(), null) : null,
  ]);
  if (failed) out.push({ id: "posts.failed", severity: "critical", title: `${failed} post${failed === 1 ? "" : "s"} failed to publish`, detail: "These did not go out. The reason is on each post.", fixLabel: "Review failed posts", href: "/viralpulse-ai/posts?tab=failed" });
  if (overdue) out.push({ id: "posts.overdue", severity: "warning", title: `${overdue} scheduled post${overdue === 1 ? " is" : "s are"} overdue`, detail: "Approved, past their time and not yet published.", fixLabel: "Open scheduled posts", href: "/viralpulse-ai/posts?tab=scheduled" });
  if (guard?.killSwitch) out.push({ id: "ads.killswitch", severity: "critical", title: "Ad kill switch is on", detail: "All ad delivery is stopped until it is turned off.", fixLabel: p.manageLimits ? "Open limits" : "Ask a manager to turn it off", href: p.manageLimits ? "/viralpulse-ai/campaigns/limits" : null });
  for (const l of launches) {
    const b = launchBucket(l as unknown as LaunchDoc);
    if (b === "issue") out.push({ id: `ads.issue.${l._id}`, severity: "critical", title: `Meta rejected an ad in ${l.campaignName}`, detail: "An ad is disapproved or has issues, so it is not delivering.", fixLabel: "Fix the ad", href: `/viralpulse-ai/campaigns/${l.campaignId}` });
    else if (b === "failed") out.push({ id: `ads.failed.${l._id}`, severity: "critical", title: `${l.campaignName} did not finish launching`, detail: l.lastError?.message ?? "The launch stopped part-way.", fixLabel: "Open the campaign", href: `/viralpulse-ai/campaigns/${l.campaignId}` });
  }
  if (dueAds) out.push({ id: "ads.due", severity: "warning", title: `${dueAds} ad${dueAds === 1 ? "" : "s"} due to launch`, detail: "Their launch time has passed and nobody marked them live.", fixLabel: "Open campaigns", href: "/viralpulse-ai/campaigns" });
  if (health) {
    out.push(...fromHealth(health.groups.flatMap((g) => g.items).filter((i) => !SETUP_STATE.test(i.detail)), true));
  } else {
    out.push(...fromHealth(accountHealthItems(views), p.settings));
  }
  return rankAttention(out);
}

// ── stat cards ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PaidTotals {
  /** Snapshot rows found (0 = nothing synced for the period). */
  rows: number;
  byCurrency: { currency: string; value: number }[];
  byLaunch: Map<string, { spend: number; impressions: number; clicks: number }>;
  impressions: number;
  clicks: number;
  syncedAt: string | null;
  skippedUnknownCurrency: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Meta campaign-level results synced between two day keys (inclusive). Spend is grouped by the launch's currency; no currency, no total. */
export async function paidTotals(fromDay: string, toDay: string): Promise<PaidTotals> {
  const snaps = await (await snapshotsCollection())
    .find({ platform: "meta", source: INSIGHTS_SOURCE, level: "campaign", date: { $gte: fromDay, $lte: toDay }, metric: { $in: ["spend", "impressions", "clicks", "inline_link_clicks"] } }, { projection: { metric: 1, value: 1, launchId: 1, capturedAt: 1 } })
    .toArray();
  const empty: PaidTotals = { rows: 0, byCurrency: [], byLaunch: new Map(), impressions: 0, clicks: 0, syncedAt: null, skippedUnknownCurrency: 0 };
  if (!snaps.length) return empty;
  const ids = [...new Set(snaps.map((s) => s.launchId).filter((x): x is string => !!x))];
  const launches = ids.length ? await (await launchesCollection()).find({ _id: { $in: ids } }, { projection: { currency: 1 } }).toArray() : [];
  const currencyOf = new Map(launches.map((l) => [l._id, l.currency]));
  const per = new Map<string, { spend: number; impressions: number; clicks: number; link: number; hasLink: boolean }>();
  let syncedAt: Date | null = null;
  for (const s of snaps) {
    const k = s.launchId ?? "";
    const e = per.get(k) ?? { spend: 0, impressions: 0, clicks: 0, link: 0, hasLink: false };
    if (s.metric === "spend") e.spend += s.value;
    else if (s.metric === "impressions") e.impressions += s.value;
    else if (s.metric === "clicks") e.clicks += s.value;
    else { e.link += s.value; e.hasLink = true; }
    per.set(k, e);
    if (!syncedAt || s.capturedAt > syncedAt) syncedAt = s.capturedAt;
  }
  const byLaunch = new Map<string, { spend: number; impressions: number; clicks: number }>();
  const cur = new Map<string, number>();
  let skipped = 0, impressions = 0, clicks = 0;
  for (const [id, e] of per) {
    const c = e.hasLink ? e.link : e.clicks;
    byLaunch.set(id, { spend: r2(e.spend), impressions: e.impressions, clicks: c });
    impressions += e.impressions;
    clicks += c;
    const currency = currencyOf.get(id);
    if (currency) cur.set(currency, (cur.get(currency) ?? 0) + e.spend);
    else if (e.spend > 0) skipped++;
  }
  return { rows: snaps.length, byCurrency: [...cur].map(([currency, value]) => ({ currency, value: r2(value) })).sort((a, b) => a.currency.localeCompare(b.currency)), byLaunch, impressions, clicks, syncedAt: syncedAt ? (syncedAt as Date).toISOString() : null, skippedUnknownCurrency: skipped };
}

/** Spend change vs the same days last month: only when both periods have synced rows and exactly one currency is in play on both sides. */
export function spendDelta(cur: PaidTotals, prev: PaidTotals): number | null {
  if (!cur.rows || !prev.rows || cur.byCurrency.length !== 1 || prev.byCurrency.length !== 1 || cur.byCurrency[0].currency !== prev.byCurrency[0].currency) return null;
  return pctChange(cur.byCurrency[0].value, prev.byCurrency[0].value);
}

export interface DashStats {
  periods: Periods;
  posts: { publishedMonth: number; deltaPct: number | null; scheduled: number; awaitingApproval: number } | null;
  ads: { running: number; spend: PaidTotals; deltaPct: number | null } | null;
  images: { month: number; deltaPct: number | null } | null;
  ugc: { ready: number; generating: number } | null;
  accounts: { healthy: number; total: number; needAttention: number } | null;
}

export async function loadStats(ctx: DashCtx): Promise<DashStats> {
  const p = ctx.perms;
  const tz = await companyTz();
  const per = periodsFor(ctx.now, tz);
  const between = (field: string, from: Date, to: Date) => ({ [field]: { $gte: from, $lt: to } });
  const [posts, ads, images, ugc, accounts] = await Promise.all([
    p.viewPosts ? (async () => {
      const c = await postsCollection();
      const published = (from: Date, to: Date) => c.countDocuments({ ...notDeleted, status: "published", ...between("publishedAt", from, to) });
      const [cur, prev, scheduled, awaitingApproval] = await Promise.all([published(per.start, per.end), published(per.prevStart, per.prevEnd), c.countDocuments({ ...notDeleted, status: "scheduled" }), c.countDocuments({ ...notDeleted, status: "scheduled", approvedBy: null })]);
      return { publishedMonth: cur, deltaPct: pctChange(cur, prev), scheduled, awaitingApproval };
    })() : null,
    p.viewCampaigns ? (async () => {
      const [running, spend, prev] = await Promise.all([(await launchesCollection()).countDocuments({ active: true, delivery: "active" }), paidTotals(per.fromDay, per.toDay), paidTotals(per.prevFromDay, per.prevToDay)]);
      return { running, spend, deltaPct: spendDelta(spend, prev) };
    })() : null,
    p.viewStudios ? (async () => {
      const c = await mediaCollection();
      const n = (from: Date, to: Date) => c.countDocuments({ ...notDeleted, kind: "image", source: "ai", ...between("createdAt", from, to) });
      const [cur, prev] = await Promise.all([n(per.start, per.end), n(per.prevStart, per.prevEnd)]);
      return { month: cur, deltaPct: pctChange(cur, prev) };
    })() : null,
    p.viewUgc ? (async () => {
      const c = await ugcProjects();
      const [ready, generating] = await Promise.all([c.countDocuments({ ...notDeleted, ...NOT_SAMPLE, status: "ready" }), c.countDocuments({ ...notDeleted, ...NOT_SAMPLE, status: "generating" })]);
      return { ready, generating };
    })() : null,
    p.viewPosts || p.settings ? listAccounts({}, ctx.now).then((v) => {
      const live = liveAccounts(v);
      const healthy = live.filter((a) => a.status === "healthy" && !a.lastError).length;
      return { healthy, total: live.length, needAttention: live.length - healthy };
    }) : null,
  ]);
  return { periods: per, posts, ads, images, ugc, accounts };
}

// ── upcoming schedule ─────────────────────────────────────────────────────────────────────────────────────────────

export interface ScheduleRow {
  id: string;
  title: string;
  scheduledAt: string;
  tz: string;
  state: ScheduleState;
  targets: { platform: string; account: string | null }[];
}

export async function loadSchedule(ctx: DashCtx): Promise<{ rows: ScheduleRow[]; total: number; tz: string } | null> {
  if (!ctx.perms.viewPosts) return null;
  const tz = await companyTz();
  const col = await postsCollection();
  const q = { ...notDeleted, status: "scheduled" as const, scheduledAt: { $ne: null } };
  const [docs, total, views] = await Promise.all([
    col.find(q, { projection: { title: 1, scheduledAt: 1, approvedBy: 1, publishQueuedAt: 1, variants: 1, publishOptions: 1 } }).sort({ scheduledAt: 1 }).limit(7).toArray(),
    col.countDocuments(q),
    listAccounts({}, ctx.now).catch(() => [] as AccountView[]),
  ]);
  const byId = new Map(views.map((a) => [a.id, a]));
  const accountFor = (platform: string, chosen: string | undefined): string | null => {
    if (chosen && byId.get(chosen)) return byId.get(chosen)!.name;
    const prov = PLATFORM_PROVIDERS[platform] ?? [];
    const pool = liveAccounts(views).filter((a) => prov.includes(a.provider));
    return (pool.find((a) => a.isDefault) ?? (pool.length === 1 ? pool[0] : null))?.name ?? null;
  };
  const rows = docs.map((d) => {
    const at = new Date(d.scheduledAt!);
    return {
      id: d._id, title: d.title || "Untitled post", scheduledAt: at.toISOString(), tz,
      state: scheduleState({ scheduledAt: at, approvedBy: d.approvedBy ?? null, publishQueuedAt: d.publishQueuedAt }, ctx.now),
      targets: (d.variants ?? []).map((v) => ({ platform: v.platform, account: accountFor(v.platform, d.publishOptions?.accountIds?.[v.platform]) })),
    };
  });
  return { rows, total, tz };
}

// ── recently published, with live results ────────────────────────────────────────────────────────────────────────

export interface PublishedRow {
  id: string;
  title: string;
  publishedAt: string;
  platforms: string[];
  /** Sum over the post's platform versions that have synced numbers; null = nothing synced for it. */
  reach: number | null;
  engagements: number | null;
  syncedAt: string | null;
  url: string | null;
}

export async function loadRecentPublished(ctx: DashCtx): Promise<{ rows: PublishedRow[]; tz: string; metrics: boolean } | null> {
  if (!ctx.perms.viewPosts) return null;
  const tz = await companyTz();
  const docs = await (await postsCollection())
    .find({ ...notDeleted, status: "published", publishedAt: { $ne: null } }, { projection: { title: 1, publishedAt: 1, variants: 1 } })
    .sort({ publishedAt: -1 })
    .limit(5)
    .toArray();
  const an = ctx.perms.viewAnalytics ? await analyticsOf(ctx, tz).catch(() => null) : null;
  const rows = docs.map((d) => {
    const mine = an?.posts.filter((r) => r.postId === d._id) ?? [];
    const reach = mine.filter((r) => typeof r.metrics.reach === "number");
    const eng = mine.filter((r) => r.engagements !== null);
    const synced = mine.map((r) => r.syncedAt).filter((x): x is string => !!x).sort().at(-1) ?? null;
    const pub = (d.variants ?? []).filter((v) => v.publish?.state === "published");
    return {
      id: d._id, title: d.title || "Untitled post", publishedAt: new Date(d.publishedAt!).toISOString(),
      platforms: pub.map((v) => v.platform),
      reach: reach.length ? reach.reduce((s, r) => s + (r.metrics.reach ?? 0), 0) : null,
      engagements: eng.length ? eng.reduce((s, r) => s + (r.engagements ?? 0), 0) : null,
      syncedAt: synced, url: pub.find((v) => v.publish.url)?.publish.url ?? null,
    };
  });
  return { rows, tz, metrics: Boolean(an) };
}

// ── campaigns & ads ───────────────────────────────────────────────────────────────────────────────────────────

export interface AdsSnapshot {
  tz: string;
  buckets: Record<LaunchBucket, number>;
  drafts: number;
  campaigns: number;
  spend: PaidTotals;
  top: { launchId: string; campaignId: string; name: string; bucket: LaunchBucket; spend: number | null; currency: string }[];
  approvals: { launchId: string; campaignId: string; name: string; currency: string; dailyMinor: number; by: string | null; mine: boolean }[];
  approvalsBlocked: number;
}

export async function loadAdsSnapshot(ctx: DashCtx): Promise<AdsSnapshot | null> {
  if (!ctx.perms.viewCampaigns) return null;
  const tz = await companyTz();
  const per = periodsFor(ctx.now, tz);
  const [launches, camp, spend, guard] = await Promise.all([
    launchesCollection().then((c) => c.find({ active: true }).sort({ updatedAt: -1 }).limit(200).toArray()),
    campaignsCollection().then((c) => c.aggregate<{ _id: string; n: number }>([{ $match: { ...notDeleted } }, { $group: { _id: "$status", n: { $sum: 1 } } }]).toArray()),
    paidTotals(per.fromDay, per.toDay),
    getGuard().catch(() => null),
  ]);
  const buckets: Record<LaunchBucket, number> = { issue: 0, failed: 0, review: 0, running: 0, paused: 0, archived: 0 };
  for (const l of launches) buckets[launchBucket(l)]++;
  const approvals: AdsSnapshot["approvals"] = [];
  let blocked = 0;
  if (ctx.perms.approveSpend) {
    for (const l of launches) {
      if (l.state !== "ready" || l.delivery === "archived" || approvalCovers(l)) continue;
      const mine = l.createdBy === ctx.viewerId;
      if (mine && guard?.requireSecondApprover) { blocked++; continue; }
      approvals.push({ launchId: l._id, campaignId: l.campaignId, name: l.campaignName, currency: l.currency, dailyMinor: l.commitment.dailyMinor, by: l.createdBy, mine });
    }
  }
  const top = launches
    .filter((l) => launchBucket(l) !== "archived")
    .slice(0, 5)
    .map((l) => ({ launchId: l._id, campaignId: l.campaignId, name: l.campaignName, bucket: launchBucket(l), spend: spend.byLaunch.get(l._id)?.spend ?? null, currency: l.currency }));
  const count = (...s: string[]) => camp.filter((c) => s.includes(c._id)).reduce((a, c) => a + c.n, 0);
  return { tz, buckets, drafts: count("draft", "generated", "edited"), campaigns: camp.reduce((a, c) => a + c.n, 0), spend, top, approvals: approvals.slice(0, 5), approvalsBlocked: blocked };
}

// ── creative studios ──────────────────────────────────────────────────────────────────────────────────────────────

export interface StudioData {
  images: { id: string; name: string; hasThumb: boolean; at: string }[] | null;
  videos: { id: string; title: string; status: "ready" | "generating" | "approved" | "failed"; mediaId: string | null; posterId: string | null; scenesDone: number; scenesTotal: number; at: string }[] | null;
  tz: string;
}

export async function loadStudios(ctx: DashCtx): Promise<StudioData | null> {
  const p = ctx.perms;
  if (!p.viewStudios && !p.viewUgc) return null;
  const tz = await companyTz();
  const [images, videos] = await Promise.all([
    p.viewStudios
      ? mediaCollection().then((c) => c.find({ ...notDeleted, kind: "image", source: "ai" }, { projection: { name: 1, thumbKey: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(6).toArray())
      : null,
    p.viewUgc
      ? ugcProjects().then((c) => c.find({ ...notDeleted, ...NOT_SAMPLE, status: { $in: ["ready", "generating", "approved", "failed"] } }, { projection: { title: 1, status: 1, render: 1, plan: 1, sceneMedia: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(6).toArray())
      : null,
  ]);
  return {
    tz,
    images: images ? images.map((m) => ({ id: m._id, name: m.name, hasThumb: Boolean(m.thumbKey), at: new Date(m.createdAt).toISOString() })) : null,
    videos: videos ? videos.map((v) => ({
      id: v._id, title: v.title || "Untitled video", status: v.status as "ready", mediaId: v.render?.mediaId ?? null, posterId: v.render?.thumbnailId ?? null,
      scenesDone: Object.keys(v.sceneMedia ?? {}).length, scenesTotal: v.plan?.scenes?.length ?? 0, at: new Date(v.updatedAt).toISOString(),
    })) : null,
  };
}

// ── analytics highlights ────────────────────────────────────────────────────────────────────────────────────────────

export async function loadHighlights(ctx: DashCtx): Promise<AnalyticsData | null> {
  if (!ctx.perms.viewAnalytics) return null;
  return analyticsOf(ctx, await companyTz());
}

// ── account health ──────────────────────────────────────────────────────────────────────────────────────────────

export interface AccountRowView {
  id: string;
  name: string;
  provider: string;
  status: AccountView["status"];
  daysLeft: number | null;
  expiresAt: string | null;
  autoRenews: boolean;
  lastError: string | null;
  isDefault: boolean;
}

export async function loadAccountsHealth(ctx: DashCtx): Promise<AccountRowView[] | null> {
  if (!ctx.perms.viewPosts && !ctx.perms.settings) return null;
  const views = liveAccounts(await listAccounts({}, ctx.now));
  return views.map((a) => ({ id: a.id, name: a.name, provider: ACCOUNT_INFO[a.provider].label, status: a.status, daysLeft: a.daysLeft, expiresAt: a.expiresAt, autoRenews: a.autoRenews, lastError: a.lastError, isDefault: a.isDefault }));
}

// ── activity ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ActivityRow {
  id: string;
  who: string;
  what: string;
  label: string | null;
  entity: string;
  entityId: string;
  recordId: string | null;
  at: string;
}

export async function loadActivity(ctx: DashCtx): Promise<{ rows: ActivityRow[]; tz: string } | null> {
  if (!ctx.perms.audit) return null;
  const [rows, tz] = await Promise.all([recentActivity({ limit: 10 }), companyTz()]);
  return { tz, rows: rows.map((r: AuditLog) => ({ id: r._id, who: r.actorEmail ?? "A team member", what: AUDIT_ACTION_LABEL[r.action] ?? r.action, label: r.entityLabel, entity: r.entity, entityId: r.entityId, recordId: r.recordId, at: new Date(r.createdAt).toISOString() })) };
}
