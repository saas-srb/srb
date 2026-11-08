import { M, type MetricRow } from "../types";
import { chunk, num, section, ymd, type PullCtx, type PullOutput } from "./common";

/**
 * X (API v2, pay per use: every post read is billed, so this is OFF until the company switches it on, capped per run, and spaced out).
 *  - GET https://api.x.com/2/tweets?ids=<=100&tweet.fields=public_metrics[,organic_metrics]   user-context token of the post's owner
 *      public_metrics: retweet_count, reply_count, like_count, quote_count, bookmark_count, impression_count
 *      organic_metrics (owner only, posts from the last 30 days): impression_count, like_count, reply_count, retweet_count, url_link_clicks, user_profile_clicks
 *  - GET https://api.x.com/2/users/me?user.fields=public_metrics -> followers_count
 * Sources and verification status: SPEC.md.
 */

const API = "https://api.x.com/2";
export const X_ORGANIC_WINDOW_DAYS = 30;

interface Tweet {
  id?: string;
  public_metrics?: Record<string, unknown>;
  organic_metrics?: Record<string, unknown>;
}

export function parseTweets(body: unknown, c: { accountId: string; date: string; postIds: Map<string, string> }): MetricRow[] {
  const out: MetricRow[] = [];
  for (const t of ((body ?? {}) as { data?: Tweet[] }).data ?? []) {
    if (!t.id || !c.postIds.has(t.id)) continue;
    const mk = (metric: string, v: number | null) => {
      if (v !== null) out.push({ platform: "x", externalId: t.id!, level: "post", metric, value: v, date: c.date, accountId: c.accountId, postId: c.postIds.get(t.id!) });
    };
    const p = t.public_metrics ?? {};
    const o = t.organic_metrics ?? {};
    // Organic impressions (owner view) win over the public figure when both exist.
    mk(M.impressions, num(o.impression_count) ?? num(p.impression_count));
    mk(M.likes, num(p.like_count));
    mk(M.comments, num(p.reply_count));
    mk(M.reposts, num(p.retweet_count));
    mk(M.quotes, num(p.quote_count));
    mk(M.bookmarks, num(p.bookmark_count));
    mk("link_clicks", num(o.url_link_clicks));
    mk(M.profileVisits, num(o.user_profile_clicks));
  }
  return out;
}

export async function pullX(ctx: PullCtx): Promise<PullOutput> {
  const { http, token, account, now, settings } = ctx;
  const warnings: string[] = [];
  const rows: MetricRow[] = [];
  const today = ymd(now);
  if (!settings.x.enabled) return { rows, cursor: {}, warnings: ["X metrics are switched off: X bills every post read. Turn them on in the Accounts tab if the cost is acceptable."], read: 0, deferred: 0 };
  const h = { Authorization: `Bearer ${token}` };
  const sorted = [...ctx.targets].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const picked = sorted.slice(0, settings.x.maxPostsPerRun);
  const deferred = sorted.length - picked.length;
  if (deferred > 0) warnings.push(`${deferred} older post${deferred === 1 ? "" : "s"} not read: the cap is ${settings.x.maxPostsPerRun} posts per run (Accounts tab).`);
  const postIds = new Map(picked.map((t) => [t.externalId, t.postId]));
  const cutoff = now.getTime() - X_ORGANIC_WINDOW_DAYS * 86_400_000;
  let read = 0;
  for (const [fields, group] of [["public_metrics,organic_metrics", picked.filter((t) => t.publishedAt.getTime() >= cutoff)], ["public_metrics", picked.filter((t) => t.publishedAt.getTime() < cutoff)]] as const) {
    for (const part of chunk(group, 100)) {
      const ok = await section(warnings, "Post metrics", async () => {
        rows.push(...parseTweets(await http.getJson(`${API}/tweets?${new URLSearchParams({ ids: part.map((t) => t.externalId).join(","), "tweet.fields": fields })}`, h), { accountId: account.id, date: today, postIds }));
        return true;
      });
      if (ok) read += part.length;
    }
  }
  if (ctx.state.cursor.accountReadOn !== today || ctx.full) {
    await section(warnings, "Followers", async () => {
      const r = await http.getJson<{ data?: { public_metrics?: { followers_count?: unknown } } }>(`${API}/users/me?user.fields=public_metrics`, h);
      const f = num(r.data?.public_metrics?.followers_count);
      if (f !== null) rows.push({ platform: "x", externalId: account.externalId, level: "account", metric: M.followers, value: f, date: today, accountId: account.id });
    });
  }
  return { rows, cursor: { accountReadOn: today }, warnings: [...new Set(warnings)], read, deferred };
}
