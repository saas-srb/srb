import "server-only";
import { getCampaignAnalytics, type CampaignRow } from "@/lib/campaigns";
import { notDeleted } from "@/lib/products/viralpulse-ai/db";
import { campaignsCollection } from "@/lib/products/viralpulse-ai/campaigns";
import { adsCollection } from "@/lib/products/viralpulse-ai/ads";
import { postsCollection, METRIC_KEYS, type MetricKey } from "@/lib/products/viralpulse-ai/posts";
import { mediaCollection } from "@/lib/products/viralpulse-ai/media";
import { generationsCollection, recentAiGenerations, type RecentGeneration } from "@/lib/products/viralpulse-ai/generations";
import { CONTENT_STATUSES, POST_PLATFORMS, AD_PLATFORMS, type ContentStatus, type Platform } from "@/lib/products/viralpulse-ai/constants";

/**
 * Dashboard numbers. `postMetricsByPlatform` / `postTotals` sum what the team typed in per platform version (an audited manual override,
 * shown as such). The Analytics page does NOT use them: it reads synced platform snapshots (`metrics/queries.ts`).
 * `paidPerformance` is the legacy LMS CSV-import join (an optional import, used by the campaign page); the Analytics page reads paid
 * results from the ad-platform snapshots (WP6a) instead.
 */

export type MetricTotals = Record<MetricKey, number>;
const zeroMetrics = (): MetricTotals => Object.fromEntries(METRIC_KEYS.map((k) => [k, 0])) as MetricTotals;

export interface PaidTotals {
  linkedCampaigns: number;
  spend: number;
  currency: string;
  impressions: number;
  clicks: number;
  leads: number;
  conversions: number;
  revenue: number;
  ctr: number | null;
  cpl: number | null;
  roas: number | null;
}

export interface PaidRow extends CampaignRow {
  smmsCampaignId: string;
  smmsCampaignName: string;
}

/** LMS performance for every LMS campaign linked to an SMMS campaign (optionally just one SMMS campaign). */
export async function paidPerformance(opts: { campaignId?: string; from?: Date; to?: Date } = {}): Promise<{ totals: PaidTotals; rows: PaidRow[]; hasLmsData: boolean }> {
  const col = await campaignsCollection();
  const linked = await col.find({ ...notDeleted, ...(opts.campaignId ? { _id: opts.campaignId } : {}), "lmsCampaignKeys.0": { $exists: true } }, { projection: { name: 1, lmsCampaignKeys: 1 } }).toArray();
  const owner = new Map<string, { id: string; name: string }>();
  for (const c of linked) for (const k of c.lmsCampaignKeys) owner.set(k, { id: c._id, name: c.name });
  const lms = owner.size > 0 ? await getCampaignAnalytics({ dateFrom: opts.from, dateTo: opts.to }).catch(() => null) : null;
  const rows: PaidRow[] = (lms?.campaigns ?? []).filter((r) => owner.has(r.key)).map((r) => ({ ...r, smmsCampaignId: owner.get(r.key)!.id, smmsCampaignName: owner.get(r.key)!.name }));
  const sum = (f: (r: PaidRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const spend = Math.round(sum((r) => r.spend) * 100) / 100;
  const impressions = sum((r) => r.impressions);
  const clicks = sum((r) => r.clicks);
  const leads = sum((r) => r.leadsAttributed);
  const revenue = sum((r) => r.revenue);
  return {
    hasLmsData: Boolean(lms?.hasData),
    rows,
    totals: {
      linkedCampaigns: linked.length,
      spend,
      currency: lms?.currency ?? "INR",
      impressions,
      clicks,
      leads,
      conversions: sum((r) => r.completed),
      revenue,
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : null,
      cpl: leads > 0 ? Math.round((spend / leads) * 100) / 100 : null,
      roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : null,
    },
  };
}

async function countByStatus(scope: Record<string, unknown>, col: Awaited<ReturnType<typeof postsCollection>> | Awaited<ReturnType<typeof campaignsCollection>> | Awaited<ReturnType<typeof adsCollection>>): Promise<Record<ContentStatus, number>> {
  const rows = await (col as Awaited<ReturnType<typeof postsCollection>>).aggregate<{ _id: ContentStatus; n: number }>([{ $match: scope }, { $group: { _id: "$status", n: { $sum: 1 } } }]).toArray();
  const out = Object.fromEntries(CONTENT_STATUSES.map((s) => [s, 0])) as Record<ContentStatus, number>;
  for (const r of rows) if (r._id in out) out[r._id] = r.n;
  return out;
}

/** Sum of recorded metrics per platform across every post version (optionally only posts published in range). */
export async function postMetricsByPlatform(from?: Date, to?: Date): Promise<{ platform: Platform; posts: number; published: number; metrics: MetricTotals }[]> {
  const posts = await postsCollection();
  const match: Record<string, unknown> = { ...notDeleted };
  const range: Record<string, Date> = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  const rows = await posts
    .aggregate<{ _id: Platform; posts: number; published: number } & Record<MetricKey, number>>([
      { $match: match },
      { $unwind: "$variants" },
      ...(from || to ? [{ $match: { "variants.publish.at": range } }] : []),
      {
        $group: {
          _id: "$variants.platform",
          posts: { $sum: 1 },
          published: { $sum: { $cond: [{ $eq: ["$variants.publish.state", "published"] }, 1, 0] } },
          ...Object.fromEntries(METRIC_KEYS.map((k) => [k, { $sum: { $ifNull: [`$variants.metrics.${k}`, 0] } }])),
        },
      },
    ])
    .toArray();
  return POST_PLATFORMS.map((p) => {
    const r = rows.find((x) => x._id === p);
    const metrics = zeroMetrics();
    if (r) for (const k of METRIC_KEYS) metrics[k] = r[k] ?? 0;
    return { platform: p, posts: r?.posts ?? 0, published: r?.published ?? 0, metrics };
  });
}

export interface DashboardData {
  campaigns: Record<ContentStatus, number>;
  posts: Record<ContentStatus, number>;
  ads: Record<ContentStatus, number>;
  totalAds: number;
  platformContent: { platform: Platform; posts: number; ads: number }[];
  imageVsVideo: { label: string; image: number; video: number }[];
  recentGenerations: RecentGeneration[];
  ai30: { runs: number; images: number; cost: number };
  upcoming: { _id: string; title: string; scheduledAt: string; platforms: string[]; approved: boolean }[];
  postTotals: MetricTotals;
  paid: PaidTotals;
  hasLmsData: boolean;
}

export async function getDashboard(filters: { from?: string; to?: string } = {}): Promise<DashboardData> {
  // From / To limit the content counts and charts to items created in that window.
  const created: { $gte?: Date; $lte?: Date } = {};
  if (filters.from && !Number.isNaN(Date.parse(filters.from))) created.$gte = new Date(`${filters.from}T00:00:00`);
  if (filters.to && !Number.isNaN(Date.parse(filters.to))) created.$lte = new Date(`${filters.to}T23:59:59.999`);
  const scope = created.$gte || created.$lte ? { ...notDeleted, createdAt: created } : notDeleted;
  const [campaigns, ads, posts, media, gens] = await Promise.all([campaignsCollection(), adsCollection(), postsCollection(), mediaCollection(), generationsCollection()]);
  const since = new Date(Date.now() - 30 * 86400000);
  const [cS, pS, aS, postPlat, adPlat, postKinds, adKinds, mediaKinds, recent, ai, upcoming, byPlatform, paid] = await Promise.all([
    countByStatus(scope, campaigns),
    countByStatus(scope, posts),
    countByStatus(scope, ads),
    posts.aggregate<{ _id: string; n: number }>([{ $match: { ...scope, status: { $ne: "archived" } } }, { $unwind: "$platforms" }, { $group: { _id: "$platforms", n: { $sum: 1 } } }]).toArray(),
    ads.aggregate<{ _id: string; n: number }>([{ $match: { ...scope, status: { $ne: "archived" } } }, { $group: { _id: "$platform", n: { $sum: 1 } } }]).toArray(),
    posts.aggregate<{ _id: string; n: number }>([{ $match: { ...scope, status: { $ne: "archived" } } }, { $group: { _id: "$contentType", n: { $sum: 1 } } }]).toArray(),
    ads.aggregate<{ _id: string; n: number }>([{ $match: { ...scope, status: { $ne: "archived" } } }, { $group: { _id: "$format", n: { $sum: 1 } } }]).toArray(),
    media.aggregate<{ _id: string; n: number }>([{ $match: scope }, { $group: { _id: "$kind", n: { $sum: 1 } } }]).toArray(),
    recentAiGenerations(8),
    gens.aggregate<{ runs: number; images: number; cost: number }>([{ $match: { source: "ai", createdAt: { $gte: since } } }, { $group: { _id: null, runs: { $sum: 1 }, images: { $sum: { $cond: [{ $eq: ["$kind", "image"] }, 1, 0] } }, cost: { $sum: "$costUsd" } } }]).toArray(),
    posts.find({ ...notDeleted, status: "scheduled", scheduledAt: { $gte: new Date() } }, { projection: { title: 1, scheduledAt: 1, platforms: 1, approvedBy: 1 } }).sort({ scheduledAt: 1 }).limit(6).toArray(),
    postMetricsByPlatform(),
    paidPerformance(),
  ]);
  const n = (rows: { _id: string; n: number }[], k: string) => rows.find((r) => r._id === k)?.n ?? 0;
  const platforms: Platform[] = [...new Set<Platform>([...POST_PLATFORMS, ...AD_PLATFORMS])];
  const postTotals = zeroMetrics();
  for (const p of byPlatform) for (const k of METRIC_KEYS) postTotals[k] += p.metrics[k];
  return {
    campaigns: cS,
    posts: pS,
    ads: aS,
    totalAds: Object.entries(aS).reduce((s, [k, v]) => (k === "archived" ? s : s + v), 0),
    platformContent: platforms.map((p) => ({ platform: p, posts: n(postPlat, p), ads: n(adPlat, p) })),
    imageVsVideo: [
      { label: "Posts", image: n(postKinds, "image"), video: n(postKinds, "video") },
      { label: "Ads", image: n(adKinds, "image"), video: n(adKinds, "video") },
      { label: "Media library", image: n(mediaKinds, "image"), video: n(mediaKinds, "video") },
    ],
    recentGenerations: recent,
    ai30: { runs: ai[0]?.runs ?? 0, images: ai[0]?.images ?? 0, cost: ai[0]?.cost ?? 0 },
    upcoming: upcoming.map((u) => ({ _id: u._id, title: u.title, scheduledAt: u.scheduledAt!.toISOString(), platforms: u.platforms, approved: Boolean(u.approvedBy) })),
    postTotals,
    paid: paid.totals,
    hasLmsData: paid.hasLmsData,
  };
}

/** The Analytics page's data (synced platform snapshots) lives in `metrics/queries.ts`. */
export { loadAnalytics } from "@/lib/products/viralpulse-ai/metrics/queries";
