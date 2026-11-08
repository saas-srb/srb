import { M, type MetricRow } from "../types";
import { addDays, chunk, num, section, startOfUtcDay, ymd, type PullCtx, type PullOutput } from "./common";

/**
 * LinkedIn organisation page (Community Management API, approval-gated). Sources and verification status: SPEC.md.
 *  - GET /rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=<urn>&timeIntervals=(timeRange:(start,end),timeGranularityType:DAY)
 *      organic only, rolling 12 months; fields impressionCount, uniqueImpressionsCount, clickCount, likeCount, commentCount, shareCount, engagement
 *  - same endpoint with shares=List(urn:li:share:..) or ugcPosts[0]=urn:li:ugcPost:..  -> lifetime totals per post (no time ranges);
 *      posts with no activity are NOT returned and are zero per the docs
 *  - GET /rest/networkSizes/urn:li:organization:<id>?edgeType=COMPANY_FOLLOWED_BY_MEMBER -> firstDegreeSize (followers)
 *  - GET /rest/organizationalEntityFollowerStatistics (DAY) -> organic + paid follower gain, up to 2 days ago
 * Headers: Linkedin-Version (see linkedin-version.ts) and X-Restli-Protocol-Version: 2.0.0.
 */

const BASE = "https://api.linkedin.com/rest";
export const LI_ANALYTICS_SCOPES = ["rw_organization_admin", "r_organization_social"];
export const LI_BACKFILL_DAYS = 90;
const POST_BATCH = 10;

const STAT: Record<string, string> = { impressionCount: M.impressions, uniqueImpressionsCount: M.reach, clickCount: M.clicks, likeCount: M.likes, commentCount: M.comments, shareCount: M.shares, engagement: M.engagementRatePlatform };

export const orgUrn = (externalId: string): string => (externalId.startsWith("urn:") ? externalId : `urn:li:organization:${externalId}`);

interface Stats {
  [k: string]: unknown;
}
interface Elements {
  elements?: { timeRange?: { start?: number }; totalShareStatistics?: Stats; share?: string; ugcPost?: string; followerGains?: { organicFollowerGain?: unknown; paidFollowerGain?: unknown } }[];
}

export function parseDaily(body: unknown, c: { accountId: string; orgId: string }): MetricRow[] {
  const out: MetricRow[] = [];
  for (const e of ((body ?? {}) as Elements).elements ?? []) {
    if (!e.timeRange?.start || !e.totalShareStatistics) continue;
    const date = ymd(new Date(e.timeRange.start));
    for (const [k, metric] of Object.entries(STAT)) {
      const v = num(e.totalShareStatistics[k]);
      if (v !== null) out.push({ platform: "linkedin", externalId: c.orgId, level: "account", metric, value: v, date, accountId: c.accountId });
    }
  }
  return out;
}

/** `requested` are the post urns we asked for: those missing from the answer are zero (the documented behaviour), and are stored as zero. */
export function parsePosts(body: unknown, c: { accountId: string; requested: Map<string, string>; date: string }): MetricRow[] {
  const out: MetricRow[] = [];
  const seen = new Set<string>();
  for (const e of ((body ?? {}) as Elements).elements ?? []) {
    const urn = e.share ?? e.ugcPost;
    if (!urn || !e.totalShareStatistics || !c.requested.has(urn)) continue;
    seen.add(urn);
    for (const [k, metric] of Object.entries(STAT)) {
      const v = num(e.totalShareStatistics[k]);
      if (v !== null) out.push({ platform: "linkedin", externalId: urn, level: "post", metric, value: v, date: c.date, accountId: c.accountId, postId: c.requested.get(urn) });
    }
  }
  for (const [urn, postId] of c.requested) {
    if (seen.has(urn)) continue;
    for (const metric of [M.impressions, M.reach, M.clicks, M.likes, M.comments, M.shares]) out.push({ platform: "linkedin", externalId: urn, level: "post", metric, value: 0, date: c.date, accountId: c.accountId, postId });
  }
  return out;
}

export function parseFollowerGains(body: unknown, c: { accountId: string; orgId: string }): MetricRow[] {
  const out: MetricRow[] = [];
  for (const e of ((body ?? {}) as Elements).elements ?? []) {
    if (!e.timeRange?.start || !e.followerGains) continue;
    const o = num(e.followerGains.organicFollowerGain);
    const p = num(e.followerGains.paidFollowerGain);
    if (o === null && p === null) continue;
    out.push({ platform: "linkedin", externalId: c.orgId, level: "account", metric: M.followerGain, value: (o ?? 0) + (p ?? 0), date: ymd(new Date(e.timeRange.start)), accountId: c.accountId });
  }
  return out;
}

const range = (from: Date, to: Date) => `(timeRange:(start:${from.getTime()},end:${to.getTime()}),timeGranularityType:DAY)`;

export async function pullLinkedin(ctx: PullCtx): Promise<PullOutput> {
  const { http, token, account, now } = ctx;
  const org = orgUrn(account.externalId);
  const warnings: string[] = [];
  const rows: MetricRow[] = [];
  const cursor: PullOutput["cursor"] = {};
  const today = ymd(now);
  if (!account.scopes.some((s) => LI_ANALYTICS_SCOPES.includes(s))) {
    return { rows, cursor, warnings: ["LinkedIn page analytics is not available: this login has no analytics permission. It needs the Community Management API approved by LinkedIn for your app, then a reconnect with the organisation option ticked."], read: 0, deferred: 0 };
  }
  const h = { Authorization: `Bearer ${token}`, "Linkedin-Version": ctx.linkedinVersion ?? "202610", "X-Restli-Protocol-Version": "2.0.0" };
  const q = (path: string, extra: string) => `${BASE}${path}${extra}`;

  await section(warnings, "Followers", async () => {
    const r = await http.getJson<{ firstDegreeSize?: unknown }>(q(`/networkSizes/${encodeURIComponent(org)}`, "?edgeType=COMPANY_FOLLOWED_BY_MEMBER"), h);
    const f = num(r.firstDegreeSize);
    if (f !== null) rows.push({ platform: "linkedin", externalId: account.externalId, level: "account", metric: M.followers, value: f, date: today, accountId: account.id });
  });

  if (ctx.full || ctx.state.cursor.accountReadOn !== today) {
    const through = ctx.full ? undefined : ctx.state.cursor.accountThrough;
    const from = startOfUtcDay(through ? addDays(new Date(`${through}T00:00:00Z`), -2) : addDays(now, -LI_BACKFILL_DAYS));
    const to = startOfUtcDay(now);
    let ok = false;
    await section(warnings, "Page statistics", async () => {
      const body = await http.getJson(q("/organizationalEntityShareStatistics", `?q=organizationalEntity&organizationalEntity=${encodeURIComponent(org)}&timeIntervals=${encodeURIComponent(range(from, to))}`), h);
      rows.push(...parseDaily(body, { accountId: account.id, orgId: account.externalId }));
      ok = true;
    });
    await section(warnings, "Follower growth", async () => {
      const end = startOfUtcDay(addDays(now, -2));
      if (end <= from) return;
      rows.push(...parseFollowerGains(await http.getJson(q("/organizationalEntityFollowerStatistics", `?q=organizationalEntity&organizationalEntity=${encodeURIComponent(org)}&timeIntervals=${encodeURIComponent(range(from, end))}`), h), { accountId: account.id, orgId: account.externalId }));
    });
    if (ok) {
      cursor.accountThrough = ymd(addDays(now, -1));
      cursor.accountReadOn = today;
    }
  }

  let read = 0;
  const byKind = (kind: "share" | "ugcPost") => ctx.targets.filter((t) => t.externalId.startsWith(`urn:li:${kind}:`));
  for (const kind of ["share", "ugcPost"] as const) {
    for (const part of chunk(byKind(kind), POST_BATCH)) {
      const requested = new Map(part.map((t) => [t.externalId, t.postId]));
      const list = kind === "share" ? `&shares=List(${part.map((t) => encodeURIComponent(t.externalId)).join(",")})` : part.map((t, i) => `&ugcPosts[${i}]=${encodeURIComponent(t.externalId)}`).join("");
      const ok = await section(warnings, "Post statistics", async () => {
        rows.push(...parsePosts(await http.getJson(q("/organizationalEntityShareStatistics", `?q=organizationalEntity&organizationalEntity=${encodeURIComponent(org)}${list}`), h), { accountId: account.id, requested, date: today }));
        return true;
      });
      if (ok) read += part.length;
    }
  }
  return { rows, cursor, warnings: [...new Set(warnings)], read, deferred: 0 };
}
