import { M, type MetricRow } from "../types";
import { addDays, num, section, tolerant, unix, ymd, type PullCtx, type PullOutput } from "./common";

/**
 * Facebook Page (Page access token, `read_insights` + `pages_read_engagement`). Sources and verification status: SPEC.md.
 *  - page, daily: GET /{page}/insights?metric=page_media_view,page_total_media_view_unique,page_post_engagements,page_follows,
 *                 page_daily_follows_unique,page_daily_unfollows_unique,page_video_views&period=day&since&until   (<= 90 days per call, 2 years back)
 *  - page followers today: GET /{page}?fields=followers_count,fan_count
 *  - post: GET /{post}?fields=reactions.summary(true).limit(0),comments.summary(true).limit(0),shares  and  GET /{post}/insights
 * Pages with fewer than 100 likes have no Page insights; Meta retires insight metrics on its own schedule, so every metric is optional.
 */

const GRAPH = "https://graph.facebook.com/v23.0";
export const FB_PAGE_METRICS = ["page_media_view", "page_total_media_view_unique", "page_post_engagements", "page_follows", "page_daily_follows_unique", "page_daily_unfollows_unique", "page_video_views"];
const PAGE_METRIC_NAME: Record<string, string> = { page_media_view: M.views, page_total_media_view_unique: M.reach, page_post_engagements: M.interactions, page_follows: M.followers, page_daily_follows_unique: M.follows, page_daily_unfollows_unique: M.unfollows, page_video_views: "video_views" };
/** Candidate post metrics. Which ones still exist changes: each is tried and the missing ones are reported, never invented. */
export const FB_POST_METRICS = ["post_media_view", "post_total_media_view_unique", "post_clicks", "post_video_avg_time_watched", "post_video_view_time"];
const POST_METRIC_NAME: Record<string, string> = { post_media_view: M.views, post_total_media_view_unique: M.reach, post_clicks: M.clicks, post_video_avg_time_watched: M.avgWatchTimeSec, post_video_view_time: M.watchTimeSec };
export const FB_BACKFILL_DAYS = 90;

interface Entry {
  name?: string;
  period?: string;
  values?: { value?: unknown; end_time?: string }[];
}

/** Page insights: one row per day per metric (`end_time` is the end of the day: the metric belongs to the day before it). */
export function parsePageInsights(body: unknown, c: { accountId: string; pageId: string }): MetricRow[] {
  const out: MetricRow[] = [];
  for (const e of ((body ?? {}) as { data?: Entry[] }).data ?? []) {
    const metric = e.name ? PAGE_METRIC_NAME[e.name] : undefined;
    if (!metric) continue;
    for (const v of e.values ?? []) {
      const value = num(v.value);
      if (value === null || !v.end_time) continue;
      const end = new Date(v.end_time);
      if (Number.isNaN(end.getTime())) continue;
      // Daily metrics are stamped with the END of the period; the day they describe is the one before. `page_follows` is a level on that day.
      out.push({ platform: "facebook", externalId: c.pageId, level: "account", metric, value, date: ymd(addDays(end, -1)), accountId: c.accountId });
    }
  }
  return out;
}

export function parsePostInsights(body: unknown, c: { accountId: string; postId: string; fbPostId: string; date: string }): MetricRow[] {
  const out: MetricRow[] = [];
  for (const e of ((body ?? {}) as { data?: Entry[] }).data ?? []) {
    const metric = e.name ? POST_METRIC_NAME[e.name] : undefined;
    const value = num(e.values?.[0]?.value);
    if (metric && value !== null) out.push({ platform: "facebook", externalId: c.fbPostId, level: "post", metric, value: e.name === "post_video_avg_time_watched" || e.name === "post_video_view_time" ? value / 1000 : value, date: c.date, accountId: c.accountId, postId: c.postId });
  }
  return out;
}

export function parsePostPublic(body: unknown, c: { accountId: string; postId: string; fbPostId: string; date: string }): MetricRow[] {
  const b = (body ?? {}) as { reactions?: { summary?: { total_count?: unknown } }; comments?: { summary?: { total_count?: unknown } }; shares?: { count?: unknown } };
  const mk = (metric: string, v: number | null): MetricRow[] => (v === null ? [] : [{ platform: "facebook", externalId: c.fbPostId, level: "post", metric, value: v, date: c.date, accountId: c.accountId, postId: c.postId }]);
  return [...mk(M.likes, num(b.reactions?.summary?.total_count)), ...mk(M.comments, num(b.comments?.summary?.total_count)), ...mk(M.shares, num(b.shares?.count))];
}

export async function pullFacebook(ctx: PullCtx): Promise<PullOutput> {
  const { http, token, account, now } = ctx;
  const pageId = account.externalId;
  const warnings: string[] = [];
  const rows: MetricRow[] = [];
  const cursor: PullOutput["cursor"] = {};
  const today = ymd(now);
  const url = (path: string, q: Record<string, string>) => `${GRAPH}${path}?${new URLSearchParams({ ...q, access_token: token })}`;

  await section(warnings, "Followers", async () => {
    const r = await http.getJson<{ followers_count?: unknown; fan_count?: unknown }>(url(`/${pageId}`, { fields: "followers_count,fan_count" }));
    const f = num(r.followers_count) ?? num(r.fan_count);
    if (f !== null) rows.push({ platform: "facebook", externalId: pageId, level: "account", metric: M.followers, value: f, date: today, accountId: account.id });
  });

  const through = ctx.full ? undefined : ctx.state.cursor.accountThrough;
  const lastDay = ymd(addDays(now, -1));
  const firstDay = through ? ymd(addDays(new Date(`${through}T00:00:00Z`), -1)) : ymd(addDays(now, -FB_BACKFILL_DAYS));
  if (firstDay <= lastDay && (ctx.full || ctx.state.cursor.accountReadOn !== today)) {
    let ok = false;
    await section(warnings, "Page insights", async () => {
      const since = new Date(`${firstDay}T00:00:00Z`);
      const until = addDays(new Date(`${lastDay}T00:00:00Z`), 2); // `until` is exclusive and values are stamped with the period end
      const r = await tolerant(FB_PAGE_METRICS, async (metrics) => [await http.getJson(url(`/${pageId}/insights`, { metric: metrics.join(","), period: "day", since: String(unix(since)), until: String(unix(until)) }))]);
      for (const body of r.data) rows.push(...parsePageInsights(body, { accountId: account.id, pageId }).filter((x) => x.date >= firstDay && x.date <= lastDay));
      if (r.failed.length) warnings.push(`Facebook does not offer these Page metrics for this Page: ${r.failed.map((f) => f.metric).join(", ")}.`);
      ok = true;
    });
    if (ok) {
      cursor.accountThrough = lastDay;
      cursor.accountReadOn = today;
    }
  }

  let read = 0;
  for (const t of ctx.targets) {
    const done = await section(warnings, `Post ${t.externalId}`, async () => {
      const pub = await http.getJson(url(`/${t.externalId}`, { fields: "reactions.summary(true).limit(0),comments.summary(true).limit(0),shares" }));
      rows.push(...parsePostPublic(pub, { accountId: account.id, postId: t.postId, fbPostId: t.externalId, date: today }));
      const edge = t.format === "reel" || t.format === "video" ? "video_insights" : "insights";
      await section(warnings, "Post insights", async () => {
        const ins = await tolerant(FB_POST_METRICS, async (metrics) => [await http.getJson(url(`/${t.externalId}/${edge}`, { metric: metrics.join(",") }))]);
        for (const body of ins.data) rows.push(...parsePostInsights(body, { accountId: account.id, postId: t.postId, fbPostId: t.externalId, date: today }));
      });
      return true;
    });
    if (done) read++;
  }
  return { rows, cursor, warnings: [...new Set(warnings)], read, deferred: 0 };
}

