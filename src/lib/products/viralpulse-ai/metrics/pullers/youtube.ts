import { M, type MetricRow } from "../types";
import { MetricsApiError } from "../http";
import { addDays, chunk, num, section, ymd, type PullCtx, type PullOutput } from "./common";

/**
 * YouTube. Sources and verification status: SPEC.md.
 *  - Data API v3 (quota units, default 10,000/day per project, reset at midnight Pacific):
 *      channels.list?part=statistics&mine=true            1 unit  -> subscribers, channel views, video count
 *      videos.list?part=statistics&id=<=50 ids            1 unit  -> viewCount, likeCount, commentCount per video (lifetime)
 *  - YouTube Analytics API (scope yt-analytics.readonly): GET https://youtubeanalytics.googleapis.com/v2/reports
 *      channel by day:  dimensions=day, metrics=views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,comments,shares
 *      per video:       dimensions=video, filters=video==id1,id2..., same metrics, startDate = first publish date
 * We count Data API units ourselves and stop at the company's cap; Analytics calls are capped per day too.
 */

const DATA = "https://www.googleapis.com/youtube/v3";
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";
export const YT_ANALYTICS_SCOPE = "yt-analytics.readonly";
export const YT_BACKFILL_DAYS = 90;
export const YT_ANALYTICS_DAILY_CALL_CAP = 200;
const METRICS = "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,comments,shares";
const COL: Record<string, string> = { views: M.views, estimatedMinutesWatched: M.watchTimeSec, averageViewDuration: M.avgWatchTimeSec, subscribersGained: M.subscribersGained, subscribersLost: M.subscribersLost, likes: M.likes, comments: M.comments, shares: M.shares };

export function parseChannel(body: unknown, c: { accountId: string; channelId: string; date: string }): MetricRow[] {
  const s = ((body ?? {}) as { items?: { statistics?: { subscriberCount?: unknown; viewCount?: unknown; videoCount?: unknown; hiddenSubscriberCount?: boolean } }[] }).items?.[0]?.statistics;
  if (!s) return [];
  const mk = (metric: string, v: number | null): MetricRow[] => (v === null ? [] : [{ platform: "youtube", externalId: c.channelId, level: "account", metric, value: v, date: c.date, accountId: c.accountId }]);
  // A channel can hide its subscriber count: then the API's number is not the real one and is not stored.
  return [...(s.hiddenSubscriberCount ? [] : mk(M.followers, num(s.subscriberCount))), ...mk("channel_views_total", num(s.viewCount)), ...mk(M.videos, num(s.videoCount))];
}

export function parseVideos(body: unknown, c: { accountId: string; date: string; postIds: Map<string, string> }): MetricRow[] {
  const out: MetricRow[] = [];
  for (const it of ((body ?? {}) as { items?: { id?: string; statistics?: Record<string, unknown> }[] }).items ?? []) {
    if (!it.id || !it.statistics) continue;
    const mk = (metric: string, v: number | null) => {
      if (v !== null) out.push({ platform: "youtube", externalId: it.id!, level: "post", metric, value: v, date: c.date, accountId: c.accountId, postId: c.postIds.get(it.id!) });
    };
    mk(M.views, num(it.statistics.viewCount));
    mk(M.likes, num(it.statistics.likeCount));
    mk(M.comments, num(it.statistics.commentCount));
  }
  return out;
}

interface Report {
  columnHeaders?: { name: string }[];
  rows?: (string | number)[][];
}

/** Analytics report -> rows. `estimatedMinutesWatched` is minutes: stored as seconds. */
export function parseReport(body: unknown, c: { accountId: string; channelId: string; by: "day" | "video"; date: string; postIds?: Map<string, string> }): MetricRow[] {
  const r = (body ?? {}) as Report;
  const names = (r.columnHeaders ?? []).map((h) => h.name);
  const out: MetricRow[] = [];
  for (const row of r.rows ?? []) {
    const key = String(row[names.indexOf(c.by)]);
    names.forEach((n, i) => {
      const metric = COL[n];
      const raw = num(row[i]);
      if (!metric || raw === null) return;
      const value = n === "estimatedMinutesWatched" ? raw * 60 : raw;
      if (c.by === "day") out.push({ platform: "youtube", externalId: c.channelId, level: "account", metric, value, date: key, accountId: c.accountId });
      else out.push({ platform: "youtube", externalId: key, level: "post", metric: metric === M.views ? "analytics_views" : metric, value, date: c.date, accountId: c.accountId, postId: c.postIds?.get(key) });
    });
  }
  return out;
}

export async function pullYoutube(ctx: PullCtx): Promise<PullOutput> {
  const { http, token, account, now, settings } = ctx;
  const channelId = account.externalId;
  const warnings: string[] = [];
  const rows: MetricRow[] = [];
  const cursor: PullOutput["cursor"] = {};
  const today = ymd(now);
  const hdr = { Authorization: `Bearer ${token}` };
  const sameDay = ctx.state.quota.day === today;
  let units = sameDay ? ctx.state.quota.youtubeUnits : 0;
  let acalls = sameDay ? ctx.state.quota.youtubeAnalyticsCalls : 0;
  const spendUnit = () => {
    if (units >= settings.youtubeDailyUnitCap) throw new MetricsApiError(`The daily YouTube quota allowance you set (${settings.youtubeDailyUnitCap} units) is used up. Reading resumes tomorrow.`, "quota", 0, "own_cap", 6 * 3_600_000);
    units++;
  };
  const hasAnalytics = account.scopes.some((s) => s.endsWith(YT_ANALYTICS_SCOPE));

  await section(warnings, "Channel statistics", async () => {
    spendUnit();
    rows.push(...parseChannel(await http.getJson(`${DATA}/channels?${new URLSearchParams({ part: "statistics", id: channelId })}`, hdr), { accountId: account.id, channelId, date: today }));
  });

  const postIds = new Map(ctx.targets.map((t) => [t.externalId, t.postId]));
  let read = 0;
  let deferred = 0;
  const ids = ctx.targets.map((t) => t.externalId);
  for (const part of chunk(ids, 50)) {
    try {
      spendUnit();
    } catch (e) {
      deferred += part.length;
      if (!(e instanceof MetricsApiError)) throw e;
      warnings.push(e.message);
      continue;
    }
    await section(warnings, "Video statistics", async () => {
      rows.push(...parseVideos(await http.getJson(`${DATA}/videos?${new URLSearchParams({ part: "statistics", id: part.join(",") })}`, hdr), { accountId: account.id, date: today, postIds }));
      read += part.length;
    });
  }

  if (!hasAnalytics) {
    warnings.push("YouTube Analytics (watch time, average view duration, subscribers gained) needs the yt-analytics.readonly permission. Reconnect Google with 'YouTube analytics' ticked.");
  } else {
    const through = ctx.full ? undefined : ctx.state.cursor.accountThrough;
    const lastDay = ymd(addDays(now, -1));
    const firstDay = through ? ymd(addDays(new Date(`${through}T00:00:00Z`), -3)) : ymd(addDays(now, -YT_BACKFILL_DAYS));
    const analytics = async (q: Record<string, string>): Promise<unknown> => {
      if (acalls >= YT_ANALYTICS_DAILY_CALL_CAP) throw new MetricsApiError("The daily YouTube Analytics call allowance of this app is used up.", "quota", 0, "own_cap", 6 * 3_600_000);
      acalls++;
      return http.getJson(`${ANALYTICS}?${new URLSearchParams({ ids: "channel==MINE", ...q })}`, hdr);
    };
    if (ctx.full || ctx.state.cursor.accountReadOn !== today) {
      let ok = false;
      await section(warnings, "YouTube Analytics (channel)", async () => {
        rows.push(...parseReport(await analytics({ startDate: firstDay, endDate: lastDay, dimensions: "day", metrics: METRICS, sort: "day" }), { accountId: account.id, channelId, by: "day", date: today }));
        ok = true;
      });
      if (ok) {
        cursor.accountThrough = lastDay;
        cursor.accountReadOn = today;
      }
    }
    if (ctx.targets.length) {
      const first = ymd(new Date(Math.min(...ctx.targets.map((t) => t.publishedAt.getTime()))));
      for (const part of chunk(ids, 100)) {
        await section(warnings, "YouTube Analytics (videos)", async () => {
          rows.push(...parseReport(await analytics({ startDate: first, endDate: today, dimensions: "video", filters: `video==${part.join(",")}`, metrics: METRICS, sort: "-views", maxResults: "200" }), { accountId: account.id, channelId, by: "video", date: today, postIds }));
        });
      }
    }
  }
  return { rows, cursor, quota: { day: today, youtubeUnits: units, youtubeAnalyticsCalls: acalls }, warnings: [...new Set(warnings)], read, deferred };
}
