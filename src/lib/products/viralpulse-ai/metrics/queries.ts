import "server-only";
import { notDeleted } from "@/lib/products/viralpulse-ai/db";
import { postsCollection } from "@/lib/products/viralpulse-ai/posts";
import { adsCollection } from "@/lib/products/viralpulse-ai/ads";
import { campaignsCollection } from "@/lib/products/viralpulse-ai/campaigns";
import { mediaCollection, type MediaDoc } from "@/lib/products/viralpulse-ai/media";
import { snapshotsCollection } from "@/lib/products/viralpulse-ai/ads-platforms/snapshots";
import { launchesCollection } from "@/lib/products/viralpulse-ai/ads-platforms/launches";
import { INSIGHTS_SOURCE } from "@/lib/products/viralpulse-ai/ads-platforms/ads-sync";
import { userNames } from "@/lib/products/playbook-ai/people";
import { defaultMetricsDeps } from "./deps";
import type { MetricsDeps } from "./sync";
import type { ContentFilter, CreativeSource, PostRow } from "./queries-types";
export type { PostRow } from "./queries-types";
import { matchTargets, type AccountLite } from "./match";
import { syncCol } from "./store";
import { BEST_TIME_MIN_POSTS, bestTimeSlots, engagementRate, engagementsOf, paidMath, pickConversions, round, safeDiv, type BestTimeResult, type MetricMap, type PaidMath } from "./compute";
import { M, METRIC_PLATFORMS, ORGANIC_SOURCES, PLATFORM_LABEL, type AccountSyncState, type MetricPlatform, type Target } from "./types";

/** Everything the Analytics page shows, read from synced snapshots. Nothing here is estimated: a missing number stays missing. */

import { CONTENT_TYPES, CREATIVE_SOURCES, CREATIVE_SOURCE_LABEL } from "./queries-types";
export { CONTENT_TYPES, CREATIVE_SOURCES, CREATIVE_SOURCE_LABEL };

export interface AnalyticsFilters {
  from?: string;
  to?: string;
  platform?: string;
  account?: string;
  campaign?: string;
  contentType?: string;
  creativeSource?: string;
}

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const day = (d: Date) => d.toISOString().slice(0, 10);

export function resolveRange(f: AnalyticsFilters, now: Date): { from: string; to: string } {
  const to = isDay(f.to) ? f.to : day(now);
  const from = isDay(f.from) ? f.from : day(new Date(Date.parse(`${to}T00:00:00Z`) - 27 * 86_400_000));
  return from <= to ? { from, to } : { from: to, to: from };
}

export interface KpiValue {
  value: number | null;
  syncedAt: string | null;
  platforms: MetricPlatform[];
  /** Why there is no number. */
  reason: string | null;
}

export interface AccountRow {
  id: string;
  name: string;
  platform: MetricPlatform;
  providerLabel: string;
  status: AccountSyncState["status"];
  lastOkAt: string | null;
  nextSyncAt: string | null;
  error: string | null;
  warnings: string[];
  followers: number | null;
  followersAt: string | null;
  followerChange: number | null;
  series: { date: string; followers: number }[];
  postsTracked: number;
}

export interface PaidRow {
  level: "campaign" | "adset" | "ad";
  id: string;
  name: string;
  campaignId: string | null;
  currency: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number | null;
  conversionAction: string | null;
  math: PaidMath;
  syncedAt: string | null;
  mediaId: string | null;
  creativeSource: CreativeSource;
}

export interface CreativeRow {
  mediaId: string;
  name: string;
  kind: "image" | "video";
  source: CreativeSource;
  posts: number;
  engagements: number;
  avgRate: number | null;
  ads: number;
  adSpend: number;
  adClicks: number;
  adCtr: number | null;
  currency: string | null;
}

export interface AnalyticsData {
  range: { from: string; to: string };
  kpis: { reach: KpiValue; views: KpiValue; engagements: KpiValue; engagementRate: KpiValue & { denominators: string[]; excluded: number }; followers: KpiValue & { change: number | null }; spend: { byCurrency: { currency: string; value: number }[]; syncedAt: string | null; reason: string | null; skippedUnknownCurrency: number } };
  trends: { reach: { date: string; value: number }[]; views: { date: string; value: number }[]; interactions: { date: string; value: number }[]; followers: { date: string; value: number }[] };
  posts: PostRow[];
  unmatched: number;
  accounts: AccountRow[];
  paid: PaidRow[];
  creatives: CreativeRow[];
  bestTime: BestTimeResult;
  filterOptions: { accounts: { id: string; name: string; platform: MetricPlatform }[]; campaigns: { id: string; name: string }[] };
  hasAnyAccount: boolean;
  lastSyncAt: string | null;
}

interface Snap {
  platform: string;
  externalId: string;
  level: string;
  metric: string;
  value: number;
  date: string;
  capturedAt: Date;
  accountId?: string;
  campaignId?: string;
  adId?: string;
  launchId?: string;
  source: string;
}

export function mediaSource(m: Pick<MediaDoc, "kind" | "studio" | "ai" | "source"> | null | undefined): CreativeSource {
  if (!m) return "none";
  if (m.studio) return "image_studio";
  if (m.source === "ai" || m.ai?.aiGenerated) return m.kind === "video" ? "ugc" : "ai_other";
  return "uploaded";
}

function contentTypeOf(t: Target["format"]): ContentFilter {
  return t === "reel" || t === "short" || t === "story" ? "reel" : t === "video" ? "video" : "post";
}

/** Platforms hand out their own ids, so two platforms can share one: always key by both. */
export const snapKey = (platform: string, externalId: string) => `${platform}:${externalId}`;

/** Latest value per (platform + externalId, metric) at or before `to`. */
export function latestByKey(snaps: Snap[], to: string): Map<string, { metrics: MetricMap; syncedAt: Date | null }> {
  const best = new Map<string, Map<string, { date: string; value: number; at: Date }>>();
  for (const s of snaps) {
    if (s.date > to) continue;
    const key = snapKey(s.platform, s.externalId);
    const m = best.get(key) ?? new Map();
    const cur = m.get(s.metric);
    if (!cur || s.date > cur.date || (s.date === cur.date && s.capturedAt > cur.at)) m.set(s.metric, { date: s.date, value: s.value, at: s.capturedAt });
    best.set(key, m);
  }
  const out = new Map<string, { metrics: MetricMap; syncedAt: Date | null }>();
  for (const [id, m] of best) {
    let at: Date | null = null;
    const metrics: MetricMap = {};
    for (const [k, v] of m) {
      metrics[k] = v.value;
      if (!at || v.at > at) at = v.at;
    }
    out.set(id, { metrics, syncedAt: at });
  }
  return out;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function loadAnalytics(filters: AnalyticsFilters, now: Date = new Date(), deps: Pick<MetricsDeps, "listAccounts" | "loadAttempts"> = defaultMetricsDeps): Promise<AnalyticsData> {
  const range = resolveRange(filters, now);
  const [syncAccounts, states, postsRaw, attempts] = await Promise.all([deps.listAccounts(), syncCol().then((c) => c.find({ accountId: { $not: /^__/ } }).toArray()), (await postsCollection()).find({ ...notDeleted, "variants.publish.state": "published" }).toArray(), deps.loadAttempts()]);
  const stateById = new Map(states.map((s) => [s._id, s]));
  const accountById = new Map(syncAccounts.map((a) => [a.id, a]));
  const accountLites: AccountLite[] = syncAccounts.map((a) => ({ id: a.id, platform: a.platform, provider: a.provider, isDefault: a.isDefault, enabled: a.enabled }));
  const match = matchTargets(postsRaw as never, attempts, accountLites);
  const allTargets = [...match.byAccount.values()].flat();
  const targetByKey = new Map(allTargets.map((t) => [`${t.postId}:${t.platform}`, t]));
  const targetByPostPlatform = (postId: string, platform: string) => targetByKey.get(`${postId}:${platform === "twitter" ? "x" : platform}`);

  // Media for provenance.
  const firstMedia = new Map<string, string>();
  const mediaIds = new Set<string>();
  for (const p of postsRaw) if (p.mediaIds?.[0]) { firstMedia.set(p._id, p.mediaIds[0]); mediaIds.add(p.mediaIds[0]); }
  const adsRaw = await (await adsCollection()).find({ ...notDeleted }, { projection: { mediaIds: 1, name: 1, title: 1 } }).toArray().catch(() => []);
  const adFirstMedia = new Map<string, string>();
  for (const a of adsRaw) if (a.mediaIds?.[0]) { adFirstMedia.set(a._id, a.mediaIds[0]); mediaIds.add(a.mediaIds[0]); }
  const mediaDocs = mediaIds.size ? await (await mediaCollection()).find({ _id: { $in: [...mediaIds] } }, { projection: { kind: 1, name: 1, studio: 1, ai: 1, source: 1 } }).toArray() : [];
  const mediaById = new Map(mediaDocs.map((m) => [m._id, m]));

  // Which posts pass the filters.
  const wantAd = filters.contentType === "ad";
  const inRange = (d: Date | null) => !!d && day(d) >= range.from && day(d) <= range.to;
  const candidates: { post: (typeof postsRaw)[number]; variant: (typeof postsRaw)[number]["variants"][number]; target: Target }[] = [];
  for (const p of postsRaw) {
    for (const v of p.variants) {
      if (v.publish.state !== "published") continue;
      const t = targetByPostPlatform(p._id, v.platform);
      if (!t || !inRange(v.publish.at)) continue;
      if (filters.platform && filters.platform !== t.platform) continue;
      if (filters.account && filters.account !== t.accountId) continue;
      if (filters.campaign && filters.campaign !== p.campaignId) continue;
      if (filters.contentType && CONTENT_TYPES.includes(filters.contentType as ContentFilter) && !wantAd && filters.contentType !== contentTypeOf(t.format)) continue;
      const src = mediaSource(mediaById.get(firstMedia.get(p._id) ?? "") ?? null);
      if (filters.creativeSource && filters.creativeSource !== src) continue;
      candidates.push({ post: p, variant: v, target: t });
    }
  }

  const snapCol = await snapshotsCollection();
  const postSnaps = candidates.length || allTargets.length
    ? ((await snapCol.find({ source: { $in: ORGANIC_SOURCES }, level: "post", externalId: { $in: allTargets.map((t) => t.externalId) }, date: { $lte: range.to } }).toArray()) as unknown as Snap[])
    : [];
  const postLatest = latestByKey(postSnaps, range.to);

  const manualUsers = new Set<string>();
  for (const c of candidates) if (c.variant.metrics?.updatedBy) manualUsers.add(c.variant.metrics.updatedBy);
  const names = await userNames([...manualUsers]).catch(() => new Map<string, string>());

  const posts: PostRow[] = candidates.map(({ post, variant, target }) => {
    const l = postLatest.get(snapKey(target.platform, target.externalId));
    const metrics = l?.metrics ?? {};
    const mid = firstMedia.get(post._id) ?? null;
    const man = variant.metrics;
    return {
      postId: post._id, title: post.title, platform: target.platform, externalId: target.externalId, accountId: target.accountId, accountName: accountById.get(target.accountId)?.name ?? "Unknown account",
      publishedAt: (variant.publish.at ?? target.publishedAt).toISOString(), format: target.format, contentType: contentTypeOf(target.format), url: variant.publish.url, campaignId: post.campaignId, mediaId: mid,
      creativeSource: mediaSource(mediaById.get(mid ?? "") ?? null), metrics, engagements: engagementsOf(metrics), rate: engagementRate(metrics), syncedAt: iso(l?.syncedAt ?? null),
      manual: man?.updatedAt ? { by: man.updatedBy ? (names.get(man.updatedBy) ?? "a team member") : "a team member", at: new Date(man.updatedAt).toISOString(), values: { impressions: man.impressions, reach: man.reach, engagements: man.engagements, likes: man.likes, comments: man.comments, shares: man.shares, saves: man.saves, clicks: man.clicks, videoViews: man.videoViews, conversions: man.conversions } } : null,
    };
  }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  // Account level.
  const accSel = syncAccounts.filter((a) => a.enabled && (!filters.platform || filters.platform === a.platform) && (!filters.account || filters.account === a.id));
  const accSnaps = !wantAd && accSel.length
    ? ((await snapCol.find({ source: { $in: ORGANIC_SOURCES }, level: "account", accountId: { $in: accSel.map((a) => a.id) }, date: { $lte: range.to } }).toArray()) as unknown as Snap[])
    : [];
  const sumDaily = (metric: string) => {
    const by = new Map<string, number>();
    for (const s of accSnaps) if (s.metric === metric && s.date >= range.from && s.date <= range.to) by.set(s.date, (by.get(s.date) ?? 0) + s.value);
    return [...by].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
  };
  const kpi = (metric: string, why: string): KpiValue => {
    const rows = accSnaps.filter((s) => s.metric === metric && s.date >= range.from && s.date <= range.to);
    if (!rows.length) return { value: null, syncedAt: null, platforms: [], reason: why };
    return { value: rows.reduce((s, r) => s + r.value, 0), syncedAt: iso(rows.reduce((m, r) => (r.capturedAt > m ? r.capturedAt : m), rows[0].capturedAt)), platforms: [...new Set(rows.map((r) => r.platform as MetricPlatform))], reason: null };
  };
  const noAccountWhy = !accSel.length ? "No connected account to read from. Connect one in Settings > Connected accounts." : "Not synced yet for this period. Press Sync now, or wait for the next scheduled read.";
  const reach = kpi(M.reach, noAccountWhy);
  const views = kpi(M.views, noAccountWhy);

  // Followers: per account, carried-forward daily series.
  const accountsRows: AccountRow[] = METRIC_PLATFORMS.flatMap((pl) => syncAccounts.filter((a) => a.platform === pl)).map((a) => {
    const st = stateById.get(a.id);
    const own = accSnaps.filter((s) => s.accountId === a.id && s.metric === M.followers).sort((x, y) => x.date.localeCompare(y.date));
    const inR = own.filter((s) => s.date >= range.from);
    const last = own[own.length - 1];
    const firstIn = inR[0];
    return {
      id: a.id, name: a.name, platform: a.platform, providerLabel: PLATFORM_LABEL[a.platform], status: st?.status ?? "never", lastOkAt: iso(st?.lastOkAt ?? null), nextSyncAt: iso(st?.nextSyncAt ?? null), error: st?.error ?? null, warnings: st?.warnings ?? [],
      followers: last?.value ?? null, followersAt: last ? iso(last.capturedAt) : null, followerChange: last && firstIn && inR.length > 1 ? last.value - firstIn.value : null,
      series: inR.map((s) => ({ date: s.date, followers: s.value })), postsTracked: allTargets.filter((t) => t.accountId === a.id).length,
    } satisfies AccountRow;
  });
  const selectedRows = accountsRows.filter((r) => accSel.some((a) => a.id === r.id));
  const withF = selectedRows.filter((r) => r.followers !== null);
  const followerDates = [...new Set(selectedRows.flatMap((r) => r.series.map((s) => s.date)))].sort();
  const followersTrend = followerDates.map((d) => ({ date: d, value: selectedRows.reduce((sum, r) => { const p = [...r.series].reverse().find((s) => s.date <= d); return sum + (p?.followers ?? 0); }, 0) }));
  const changeRows = selectedRows.filter((r) => r.followerChange !== null);

  // Posts totals.
  const withEng = posts.filter((p) => p.engagements !== null);
  const engSum = withEng.reduce((s, p) => s + (p.engagements ?? 0), 0);
  const synced = posts.map((p) => p.syncedAt).filter((x): x is string => !!x).sort();
  const postWhy = !posts.length ? "No post published through ViralPulse in this period matches the filters." : "Published posts found, but their numbers are not synced yet.";
  // One declared denominator for the headline rate: reach. A post whose platform reports no reach keeps its own per-row rate (labelled with
  // what it used) but is left out of the headline, and the number left out is shown - nothing is silently mixed.
  const rateParts = posts.filter((p) => p.rate?.denominator === "reach");
  const rateExcluded = posts.filter((p) => p.rate && p.rate.denominator !== "reach").length;
  const rateDenoms = rateParts.length ? ["reach"] : [];
  const rateNum = rateParts.reduce((s, p) => s + (p.engagements ?? 0), 0);
  const rateDen = rateParts.reduce((s, p) => s + (p.metrics[M.reach] ?? 0), 0);

  // Paid (WP6a snapshots; synced from the ad platform, never typed in).
  const { paid, paidSyncedAt, spendByCurrency, spendSkipped } = filters.contentType && filters.contentType !== "ad" ? { paid: [] as PaidRow[], paidSyncedAt: null as string | null, spendByCurrency: [] as { currency: string; value: number }[], spendSkipped: 0 } : await loadPaid(snapCol, range, filters, mediaById, adFirstMedia);

  const creatives = buildCreatives(posts, paid, mediaById);

  // Best time uses ALL synced posts (not just this range) so it has enough history.
  const bestTime = await loadBestTime(filters.platform, now, { targets: allTargets, posts: postsRaw as never, accountById });

  const lastSyncAt = states.map((s) => s.lastOkAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const campaigns = await (await campaignsCollection()).find({ ...notDeleted }, { projection: { name: 1 } }).sort({ updatedAt: -1 }).limit(200).toArray();

  return {
    range,
    kpis: {
      reach, views,
      engagements: wantAd ? { value: null, syncedAt: null, platforms: [], reason: "Ads are shown on the Campaigns & Ads tab." } : withEng.length ? { value: engSum, syncedAt: synced.at(-1) ?? null, platforms: [...new Set(withEng.map((p) => p.platform))], reason: null } : { value: null, syncedAt: null, platforms: [], reason: postWhy },
      engagementRate: { value: rateParts.length && rateDen > 0 ? round((rateNum / rateDen) * 100) : null, syncedAt: synced.at(-1) ?? null, platforms: [...new Set(rateParts.map((p) => p.platform))], reason: rateParts.length ? null : posts.some((p) => p.rate) ? "None of these posts has a reach figure, so there is no rate on the reach basis. Each post still shows its own rate with the figure it used." : postWhy, denominators: rateDenoms, excluded: rateExcluded },
      followers: { value: withF.length ? withF.reduce((s, r) => s + (r.followers ?? 0), 0) : null, syncedAt: withF.length ? withF.map((r) => r.followersAt!).sort().at(-1)! : null, platforms: withF.map((r) => r.platform), reason: withF.length ? null : noAccountWhy, change: changeRows.length ? changeRows.reduce((s, r) => s + (r.followerChange ?? 0), 0) : null },
      spend: { byCurrency: spendByCurrency, syncedAt: paidSyncedAt, reason: spendByCurrency.length ? null : spendSkipped ? "Ad results exist but their currency is unknown (the launch record is gone), so no total is shown." : "No ad results synced yet. They appear after a launched Meta campaign has been read.", skippedUnknownCurrency: spendSkipped },
    },
    trends: { reach: sumDaily(M.reach), views: sumDaily(M.views), interactions: sumDaily(M.interactions), followers: followersTrend },
    posts, unmatched: match.unmatched.length, accounts: accountsRows, paid, creatives, bestTime,
    filterOptions: { accounts: syncAccounts.filter((a) => a.enabled).map((a) => ({ id: a.id, name: `${a.name} (${PLATFORM_LABEL[a.platform]})`, platform: a.platform })), campaigns: campaigns.map((c) => ({ id: c._id, name: c.name })) },
    hasAnyAccount: syncAccounts.some((a) => a.enabled), lastSyncAt: iso(lastSyncAt),
  };
}

async function loadPaid(snapCol: Awaited<ReturnType<typeof snapshotsCollection>>, range: { from: string; to: string }, f: AnalyticsFilters, mediaById: Map<string, Pick<MediaDoc, "kind" | "studio" | "ai" | "source">>, adFirstMedia: Map<string, string>) {
  const empty = { paid: [] as PaidRow[], paidSyncedAt: null as string | null, spendByCurrency: [] as { currency: string; value: number }[], spendSkipped: 0 };
  if (f.platform && f.platform !== "meta" && f.platform !== "instagram" && f.platform !== "facebook") return empty;
  if (f.account) return empty; // organic account filter: ad accounts are different accounts
  const q: Record<string, unknown> = { platform: "meta", source: INSIGHTS_SOURCE, date: { $gte: range.from, $lte: range.to } };
  if (f.campaign) q.campaignId = f.campaign;
  const snaps = (await snapCol.find(q).toArray()) as unknown as Snap[];
  if (!snaps.length) return empty;
  const launches = await (await launchesCollection()).find({ _id: { $in: [...new Set(snaps.map((s) => s.launchId).filter((x): x is string => !!x))] } }, { projection: { currency: 1, campaignName: 1, campaign: 1, ads: 1, objects: 1 } }).toArray();
  const launchById = new Map(launches.map((l) => [l._id, l]));
  const names = new Map<string, string>();
  for (const l of launches) {
    names.set(l.objects.campaign ?? "", l.campaignName);
    for (const [local, ext] of Object.entries(l.objects.adSets)) names.set(ext, l.campaign.adSets.find((s) => s.key === local)?.name ?? "Ad set");
    for (const [local, ext] of Object.entries(l.objects.ads)) names.set(ext, l.ads.find((a) => a.id === local)?.name ?? "Ad");
  }
  const groups = new Map<string, { level: PaidRow["level"]; id: string; campaignId: string | null; adId: string | null; currency: string; rows: Snap[] }>();
  for (const s of snaps) {
    const lvl = s.level as PaidRow["level"];
    if (lvl !== "campaign" && lvl !== "adset" && lvl !== "ad") continue;
    const k = `${lvl}:${s.platform}:${s.externalId}`;
    const g = groups.get(k) ?? { level: lvl, id: s.externalId, campaignId: s.campaignId ?? null, adId: s.adId ?? null, currency: launchById.get(s.launchId ?? "")?.currency ?? "", rows: [] };
    g.rows.push(s);
    groups.set(k, g);
  }
  const out: PaidRow[] = [];
  for (const g of groups.values()) {
    const sum = (m: string) => g.rows.filter((r) => r.metric === m).reduce((s, r) => s + r.value, 0);
    const has = (m: string) => g.rows.some((r) => r.metric === m);
    const spend = sum("spend");
    const clicks = has("inline_link_clicks") ? sum("inline_link_clicks") : sum("clicks");
    // Conversions: per day pick the first overlapping action type, then add the days up.
    const byDay = new Map<string, Record<string, number>>();
    for (const r of g.rows) if (r.metric.startsWith("action:")) { const d = byDay.get(r.date) ?? {}; d[r.metric.slice(7)] = r.value; byDay.set(r.date, d); }
    let conv: number | null = null;
    let action: string | null = null;
    for (const d of byDay.values()) { const p = pickConversions(d); if (p) { conv = (conv ?? 0) + p.value; action ??= p.action; } }
    let roasValue = 0, roasSpend = 0;
    const roasByDay = new Map<string, number>();
    for (const r of g.rows) if (r.metric.startsWith("roas:")) roasByDay.set(r.date, r.value);
    for (const [d, r] of roasByDay) { const sp = g.rows.find((x) => x.date === d && x.metric === "spend")?.value ?? 0; roasValue += r * sp; roasSpend += sp; }
    const impressions = sum("impressions");
    const mid = g.adId ? (adFirstMedia.get(g.adId) ?? null) : null;
    out.push({
      level: g.level, id: g.id, name: names.get(g.id) ?? g.id, campaignId: g.campaignId, currency: g.currency, spend: round(spend) ?? 0, impressions, clicks, conversions: conv, conversionAction: action,
      math: paidMath({ spend, impressions, clicks, conversions: conv, roasValue, roasSpend }), syncedAt: iso(g.rows.reduce((m, r) => (r.capturedAt > m ? r.capturedAt : m), g.rows[0].capturedAt)), mediaId: mid, creativeSource: mediaSource(mediaById.get(mid ?? "") ?? null),
    });
  }
  const filtered = out.filter((r) => !f.creativeSource || r.level !== "ad" || r.creativeSource === f.creativeSource);
  const camp = filtered.filter((r) => r.level === "campaign");
  const cur = new Map<string, number>();
  // A campaign whose currency is unknown (its launch record is gone) is never added to a currency total: it would be a number in no currency.
  for (const r of camp) if (r.currency) cur.set(r.currency, (cur.get(r.currency) ?? 0) + r.spend);
  return { paid: filtered, paidSyncedAt: filtered.map((r) => r.syncedAt!).sort().at(-1) ?? null, spendByCurrency: [...cur].map(([currency, value]) => ({ currency, value: round(value) ?? 0 })), spendSkipped: camp.filter((r) => !r.currency).length };
}

export function buildCreatives(posts: PostRow[], paid: PaidRow[], media: Map<string, Pick<MediaDoc, "kind" | "name" | "studio" | "ai" | "source">>): CreativeRow[] {
  const by = new Map<string, CreativeRow & { rateSum: number; rateN: number }>();
  const get = (id: string) => {
    const m = media.get(id);
    const r = by.get(id) ?? { mediaId: id, name: m?.name ?? "Media removed", kind: (m?.kind as "image" | "video") ?? "image", source: mediaSource(m ?? null), posts: 0, engagements: 0, avgRate: null, ads: 0, adSpend: 0, adClicks: 0, adCtr: null, currency: null, rateSum: 0, rateN: 0 };
    by.set(id, r);
    return r;
  };
  for (const p of posts) {
    if (!p.mediaId) continue;
    const r = get(p.mediaId);
    r.posts++;
    r.engagements += p.engagements ?? 0;
    if (p.rate) { r.rateSum += p.rate.value; r.rateN++; }
  }
  const adImp = new Map<string, number>();
  for (const a of paid) {
    if (a.level !== "ad" || !a.mediaId) continue;
    const r = get(a.mediaId);
    r.ads++;
    if (r.currency && r.currency !== a.currency) continue; // never add different currencies
    r.currency = a.currency;
    r.adSpend += a.spend;
    r.adClicks += a.clicks;
    adImp.set(a.mediaId, (adImp.get(a.mediaId) ?? 0) + a.impressions);
  }
  return [...by.values()].map(({ rateSum, rateN, ...r }) => ({ ...r, avgRate: rateN ? round(rateSum / rateN) : null, adCtr: round(safeDiv(r.adClicks * 100, adImp.get(r.mediaId) ?? 0)), adSpend: round(r.adSpend) ?? 0 })).sort((a, b) => (b.avgRate ?? -1) - (a.avgRate ?? -1) || b.engagements - a.engagements);
}

/** Best time from every published post that has synced numbers (not only this period's), in IST. Feeds the AI best-time field too. */
export async function loadBestTime(platform: string | undefined, now: Date, pre?: { targets: Target[]; posts: { _id: string; variants: { platform: string; publish: { at: Date | null } }[] }[]; accountById: Map<string, unknown> }): Promise<BestTimeResult> {
  void now;
  let targets = pre?.targets;
  let posts = pre?.posts;
  if (!targets || !posts) {
    const deps = defaultMetricsDeps;
    const [accs, raw, attempts] = await Promise.all([deps.listAccounts(), (await postsCollection()).find({ ...notDeleted, "variants.publish.state": "published" }).toArray(), deps.loadAttempts()]);
    targets = [...matchTargets(raw as never, attempts, accs.map((a) => ({ id: a.id, platform: a.platform, provider: a.provider, isDefault: a.isDefault, enabled: a.enabled }))).byAccount.values()].flat();
    posts = raw as never;
  }
  const sel = targets.filter((t) => !platform || t.platform === platform);
  if (!sel.length) return { ok: false, used: 0, reason: "Not enough data yet: no published post has synced results." };
  const snaps = (await (await snapshotsCollection()).find({ source: { $in: ORGANIC_SOURCES }, level: "post", externalId: { $in: sel.map((t) => t.externalId) } }).toArray()) as unknown as Snap[];
  const latest = latestByKey(snaps, "9999-12-31");
  return bestTimeSlots(sel.map((t) => ({ publishedAt: t.publishedAt, rate: engagementRate(latest.get(snapKey(t.platform, t.externalId))?.metrics ?? {}, "reach")?.value ?? null })));
}

export { BEST_TIME_MIN_POSTS };

/** One sample per published post that has synced numbers: when it went out (UTC instant) and its engagements. Used by the AI best-time helper. */
export async function loadSyncedPostSamples(): Promise<{ publishedAt: Date; engagement: number }[]> {
  const deps = defaultMetricsDeps;
  const [accs, raw, attempts] = await Promise.all([deps.listAccounts(), (await postsCollection()).find({ ...notDeleted, "variants.publish.state": "published" }).toArray(), deps.loadAttempts()]);
  const targets = [...matchTargets(raw as never, attempts, accs.map((a) => ({ id: a.id, platform: a.platform, provider: a.provider, isDefault: a.isDefault, enabled: a.enabled }))).byAccount.values()].flat();
  if (!targets.length) return [];
  const snaps = (await (await snapshotsCollection()).find({ source: { $in: ORGANIC_SOURCES }, level: "post", externalId: { $in: targets.map((t) => t.externalId) } }).toArray()) as unknown as Snap[];
  const latest = latestByKey(snaps, "9999-12-31");
  const out: { publishedAt: Date; engagement: number }[] = [];
  for (const t of targets) {
    const e = engagementsOf(latest.get(snapKey(t.platform, t.externalId))?.metrics ?? {});
    if (e !== null) out.push({ publishedAt: t.publishedAt, engagement: e });
  }
  return out;
}
