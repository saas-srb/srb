import { M, type MetricRow, type Target } from "../types";
import { addDays, daysBetween, num, section, startOfUtcDay, tolerant, unix, ymd, type PullCtx, type PullOutput } from "./common";

/**
 * Instagram (professional account, Facebook Login). Sources and verification status: SPEC.md.
 *  - account, daily:  GET /{ig-user}/insights?metric=reach,views,accounts_engaged,total_interactions,likes,comments,shares,saves,profile_links_taps&metric_type=total_value&period=day&since&until
 *  - followers:       GET /{ig-user}?fields=followers_count   (read each run -> the follower history we keep ourselves)
 *  - media, lifetime: GET /{media}/insights?metric=...        (metric set depends on media_product_type)
 */

export const GRAPH = "https://graph.facebook.com/v23.0";
export const IG_ACCOUNT_METRICS = ["reach", "views", "accounts_engaged", "total_interactions", "likes", "comments", "shares", "saves", "profile_links_taps"];
const ACCOUNT_METRIC_NAME: Record<string, string> = { reach: M.reach, views: M.views, accounts_engaged: "accounts_engaged", total_interactions: M.interactions, likes: M.likes, comments: M.comments, shares: M.shares, saves: M.saves, profile_links_taps: "profile_links_taps" };
/** Backfill depth on first connect. The API keeps user metrics for a limited time (30-90 days depending on the metric), so we ask for 30. */
export const IG_BACKFILL_DAYS = 30;

export const MEDIA_METRICS: Record<"REELS" | "FEED" | "STORY", string[]> = {
  REELS: ["reach", "likes", "comments", "saved", "shares", "total_interactions", "views", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"],
  FEED: ["reach", "likes", "comments", "saved", "shares", "total_interactions", "views", "profile_visits", "follows"],
  STORY: ["reach", "views", "shares", "total_interactions", "profile_visits", "follows", "replies"],
};
const MEDIA_METRIC_NAME: Record<string, string> = { reach: M.reach, views: M.views, impressions: M.impressions, likes: M.likes, comments: M.comments, saved: M.saves, shares: M.shares, reposts: M.reposts, total_interactions: M.interactions, profile_visits: M.profileVisits, follows: M.follows, replies: "replies", ig_reels_avg_watch_time: M.avgWatchTimeSec, ig_reels_video_view_total_time: M.watchTimeSec };

interface InsightEntry {
  name?: string;
  period?: string;
  values?: { value?: unknown; end_time?: string }[];
  total_value?: { value?: unknown };
}

/** Reads `data: [{name, values:[{value}]}]` (lifetime) and `data: [{name, total_value:{value}}]` (total_value) the same way. */
export function parseInsightEntries(body: unknown): { name: string; value: number }[] {
  const data = ((body ?? {}) as { data?: InsightEntry[] }).data ?? [];
  const out: { name: string; value: number }[] = [];
  for (const e of data) {
    if (!e.name) continue;
    const v = num(e.total_value?.value ?? e.values?.[0]?.value);
    if (v !== null) out.push({ name: e.name, value: v });
  }
  return out;
}

/** Account insights for one day -> rows. ig reports watch time in milliseconds: converted to seconds. */
export function parseAccountDay(body: unknown, c: { accountId: string; igId: string; date: string }): MetricRow[] {
  return parseInsightEntries(body).flatMap((e) => (ACCOUNT_METRIC_NAME[e.name] ? [{ platform: "instagram" as const, externalId: c.igId, level: "account" as const, metric: ACCOUNT_METRIC_NAME[e.name], value: e.value, date: c.date, accountId: c.accountId }] : []));
}

export function parseMediaInsights(body: unknown, c: { accountId: string; mediaId: string; postId: string; date: string }): MetricRow[] {
  return parseInsightEntries(body).flatMap((e) => {
    const metric = MEDIA_METRIC_NAME[e.name];
    if (!metric) return [];
    const value = e.name.startsWith("ig_reels_") ? e.value / 1000 : e.value; // milliseconds -> seconds (documented unit; UNVERIFIED in SPEC.md)
    return [{ platform: "instagram" as const, externalId: c.mediaId, level: "post" as const, metric, value, date: c.date, accountId: c.accountId, postId: c.postId }];
  });
}

const mediaKind = (t: Target, product: string | undefined): "REELS" | "FEED" | "STORY" => (product === "REELS" || t.format === "reel" ? "REELS" : product === "STORY" || t.format === "story" ? "STORY" : "FEED");

export async function pullInstagram(ctx: PullCtx): Promise<PullOutput> {
  const { http, token, account, now } = ctx;
  const igId = account.externalId;
  const warnings: string[] = [];
  const rows: MetricRow[] = [];
  const cursor: PullOutput["cursor"] = {};
  const today = ymd(now);
  const base = (path: string, q: Record<string, string>) => `${GRAPH}${path}?${new URLSearchParams({ ...q, access_token: token })}`;

  // Followers today (we keep the history ourselves: the API only offers the last 30 days).
  await section(warnings, "Followers", async () => {
    const r = await http.getJson<{ followers_count?: unknown; media_count?: unknown }>(base(`/${igId}`, { fields: "followers_count,media_count" }));
    const f = num(r.followers_count);
    if (f !== null) rows.push({ platform: "instagram", externalId: igId, level: "account", metric: M.followers, value: f, date: today, accountId: account.id });
  });

  // Account insights, once per missing day: yesterday and the day before every day (late data), 30 days on the first read.
  const through = ctx.full ? undefined : ctx.state.cursor.accountThrough;
  const lastDay = ymd(addDays(now, -1));
  const firstDay = through ? ymd(addDays(new Date(`${through}T00:00:00Z`), -1)) : ymd(addDays(now, -IG_BACKFILL_DAYS));
  if (firstDay <= lastDay && (ctx.full || ctx.state.cursor.accountReadOn !== today)) {
    const days = daysBetween(firstDay, lastDay);
    let got = 0;
    await section(warnings, "Account insights", async () => {
      for (const date of days) {
        const since = startOfUtcDay(new Date(`${date}T00:00:00Z`));
        const r = await tolerant(IG_ACCOUNT_METRICS, async (metrics) => [await http.getJson(base(`/${igId}/insights`, { metric: metrics.join(","), metric_type: "total_value", period: "day", since: String(unix(since)), until: String(unix(addDays(since, 1))) }))]);
        for (const body of r.data) rows.push(...parseAccountDay(body, { accountId: account.id, igId, date }));
        if (r.failed.length && date === lastDay) warnings.push(`Instagram does not offer: ${r.failed.map((f) => f.metric).join(", ")} for this account.`);
        got++;
      }
    });
    if (got === days.length) {
      cursor.accountThrough = lastDay;
      cursor.accountReadOn = today;
    }
  }

  // Media insights.
  let read = 0;
  for (const t of ctx.targets) {
    const product = await section(warnings, `Post ${t.externalId}`, async () => {
      const meta = await http.getJson<{ media_product_type?: string; like_count?: unknown; comments_count?: unknown }>(base(`/${t.externalId}`, { fields: "media_product_type,like_count,comments_count" }));
      const kind = mediaKind(t, meta.media_product_type);
      const ins = await tolerant(MEDIA_METRICS[kind], async (metrics) => [await http.getJson(base(`/${t.externalId}/insights`, { metric: metrics.join(",") }))]);
      for (const body of ins.data) rows.push(...parseMediaInsights(body, { accountId: account.id, mediaId: t.externalId, postId: t.postId, date: today }));
      // Public counts come with the media itself, so likes/comments exist even if the insights permission is missing.
      for (const [metric, v] of [[M.likes, num(meta.like_count)], [M.comments, num(meta.comments_count)]] as const) {
        if (v !== null && !rows.some((r) => r.externalId === t.externalId && r.metric === metric && r.date === today)) rows.push({ platform: "instagram", externalId: t.externalId, level: "post", metric, value: v, date: today, accountId: account.id, postId: t.postId });
      }
      return kind;
    });
    if (product) read++;
  }
  return { rows, cursor, warnings: [...new Set(warnings)], read, deferred: 0 };
}

