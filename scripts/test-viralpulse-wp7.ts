/**
 * ViralPulse WP7 tests: real analytics. A FAKE platform server (in-memory fetch) answers every call: no provider is contacted.
 * Covers parsers per platform from fixtures written from the official docs (SPEC.md), HTTP error classification (auth / rate limit /
 * quota / transient), metric math with zero denominators, best-time thresholds, matching posts by platform id, snapshot idempotency,
 * cursor + backfill, rate-limit deferral, persistent-failure notification, YouTube quota caps, manual cooldown, retention,
 * paid results from WP6a snapshots, manual override labelling and tenancy. Database: a THROWAWAY MongoDB only (asserted, then dropped).
 * Run: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_vpwp7 npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-viralpulse-wp7.ts
 */
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "";
const dbName = uri.split("?")[0].split("/").pop() ?? "";
assert.ok(/zz_throwaway/.test(dbName), "refusing to run: MONGODB_URI must be a zz_throwaway_* database");
assert.ok(!/\.env\.local/.test(uri));

import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { classify, makeHttp, MetricsApiError, msUntilPacificMidnight } from "../src/lib/products/viralpulse-ai/metrics/http";
import { parseAccountDay, parseMediaInsights } from "../src/lib/products/viralpulse-ai/metrics/pullers/instagram";
import { parsePageInsights, parsePostPublic } from "../src/lib/products/viralpulse-ai/metrics/pullers/facebook";
import { parseChannel, parseReport, parseVideos } from "../src/lib/products/viralpulse-ai/metrics/pullers/youtube";
import { parseDaily, parseFollowerGains, parsePosts } from "../src/lib/products/viralpulse-ai/metrics/pullers/linkedin";
import { parseTweets } from "../src/lib/products/viralpulse-ai/metrics/pullers/x";
import { bestTimeSlots, engagementRate, engagementsOf, paidMath, pickConversions, safeDiv } from "../src/lib/products/viralpulse-ai/metrics/compute";
import { matchTargets, pickTargets } from "../src/lib/products/viralpulse-ai/metrics/match";
import { getMetricsSettings, purgeOld, saveMetricsSettings, syncCol, writeRows } from "../src/lib/products/viralpulse-ai/metrics/store";
import { runMetricsSync, syncAccount, syncNow, type MetricsDeps, type SyncAccount } from "../src/lib/products/viralpulse-ai/metrics/sync";
import { loadAnalytics } from "../src/lib/products/viralpulse-ai/metrics/queries";
import { postsToCsv } from "../src/lib/products/viralpulse-ai/metrics/csv";
import { DEFAULT_SETTINGS, type MetricRow } from "../src/lib/products/viralpulse-ai/metrics/types";
import { snapshotsCollection, resetSnapshotIndexCacheForTests, upsertSnapshots } from "../src/lib/products/viralpulse-ai/ads-platforms/snapshots";
import { postsCollection, EMPTY_PUBLISH } from "../src/lib/products/viralpulse-ai/posts";
import { attemptsCol } from "../src/lib/products/viralpulse-ai/publishers/attempts";

let pass = 0;
let fail = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    pass++;
  } catch (e) {
    fail++;
    console.log("FAIL", name, "\n   ", e instanceof Error ? e.message.split("\n").slice(0, 8).join("\n    ") : e);
  }
};

const CO = "co_wp7";
const NOW = new Date("2026-11-10T09:00:00Z");
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

// ── pure: parsers (fixtures follow the documented response shapes) ──────────────────────────────────────
void (async () => {
  await t("instagram: account day + media insights parse; reels watch time ms -> s; unknown metrics ignored", () => {
    const day = parseAccountDay({ data: [{ name: "reach", period: "day", total_value: { value: 500 } }, { name: "views", period: "day", total_value: { value: 900 } }, { name: "total_interactions", total_value: { value: 70 } }, { name: "mystery", total_value: { value: 1 } }] }, { accountId: "a", igId: "IG1", date: "2026-11-09" });
    assert.deepEqual(day.map((r) => [r.metric, r.value, r.level, r.date]), [["reach", 500, "account", "2026-11-09"], ["views", 900, "account", "2026-11-09"], ["interactions", 70, "account", "2026-11-09"]]);
    const m = parseMediaInsights({ data: [{ name: "reach", period: "lifetime", values: [{ value: 300 }] }, { name: "saved", values: [{ value: 9 }] }, { name: "ig_reels_avg_watch_time", values: [{ value: 4500 }] }, { name: "total_interactions", values: [{ value: 40 }] }] }, { accountId: "a", mediaId: "M1", postId: "p1", date: "2026-11-10" });
    assert.equal(m.find((r) => r.metric === "saves")!.value, 9);
    assert.equal(m.find((r) => r.metric === "avg_watch_time_sec")!.value, 4.5);
    assert.ok(m.every((r) => r.postId === "p1" && r.externalId === "M1"));
  });
  await t("facebook: page insights are dated by the day BEFORE end_time; post public counts parse", () => {
    const rows = parsePageInsights({ data: [{ name: "page_media_view", period: "day", values: [{ value: 120, end_time: "2026-11-09T08:00:00+0000" }, { value: null, end_time: "2026-11-10T08:00:00+0000" }] }, { name: "page_follows", values: [{ value: 3400, end_time: "2026-11-09T08:00:00+0000" }] }] }, { accountId: "a", pageId: "PG1" });
    assert.deepEqual(rows.map((r) => [r.metric, r.value, r.date]), [["views", 120, "2026-11-08"], ["followers", 3400, "2026-11-08"]]);
    const pub = parsePostPublic({ reactions: { summary: { total_count: 15 } }, comments: { summary: { total_count: 3 } }, shares: { count: 2 } }, { accountId: "a", postId: "p", fbPostId: "PG1_1", date: "2026-11-10" });
    assert.deepEqual(pub.map((r) => [r.metric, r.value]), [["likes", 15], ["comments", 3], ["shares", 2]]);
    assert.equal(parsePostPublic({}, { accountId: "a", postId: "p", fbPostId: "x", date: "d" }).length, 0);
  });
  await t("youtube: channel (hidden subscribers not stored), videos, analytics report minutes -> seconds", () => {
    assert.deepEqual(parseChannel({ items: [{ statistics: { subscriberCount: "1500", viewCount: "90000", videoCount: "42" } }] }, { accountId: "a", channelId: "C1", date: "d" }).map((r) => [r.metric, r.value]), [["followers", 1500], ["channel_views_total", 90000], ["videos", 42]]);
    assert.ok(!parseChannel({ items: [{ statistics: { hiddenSubscriberCount: true, subscriberCount: "0", viewCount: "5" } }] }, { accountId: "a", channelId: "C1", date: "d" }).some((r) => r.metric === "followers"));
    const v = parseVideos({ items: [{ id: "V1", statistics: { viewCount: "100", likeCount: "7" } }, { id: "V2" }] }, { accountId: "a", date: "d", postIds: new Map([["V1", "p1"]]) });
    assert.deepEqual(v.map((r) => [r.externalId, r.metric, r.value, r.postId]), [["V1", "views", 100, "p1"], ["V1", "likes", 7, "p1"]]);
    const rep = { columnHeaders: [{ name: "day" }, { name: "views" }, { name: "estimatedMinutesWatched" }, { name: "subscribersGained" }], rows: [["2026-11-08", 50, 12, 3]] };
    const d = parseReport(rep, { accountId: "a", channelId: "C1", by: "day", date: "t" });
    assert.equal(d.find((r) => r.metric === "watch_time_sec")!.value, 720);
    assert.equal(d.find((r) => r.metric === "subscribers_gained")!.value, 3);
    const byVideo = parseReport({ columnHeaders: [{ name: "video" }, { name: "views" }], rows: [["V1", 77]] }, { accountId: "a", channelId: "C1", by: "video", date: "2026-11-10", postIds: new Map([["V1", "p1"]]) });
    assert.equal(byVideo[0].metric, "analytics_views");
  });
  await t("linkedin: daily stats, follower gains, and posts missing from the answer are stored as zero (documented)", () => {
    const start = Date.parse("2026-11-08T00:00:00Z");
    const daily = parseDaily({ elements: [{ timeRange: { start, end: start + 86400000 }, totalShareStatistics: { clickCount: 4, commentCount: 1, engagement: 0.05, likeCount: 9, shareCount: 2, impressionCount: 800, uniqueImpressionsCount: 500 }, organizationalEntity: "urn:li:organization:1" }] }, { accountId: "a", orgId: "1" });
    assert.equal(daily.find((r) => r.metric === "impressions")!.value, 800);
    assert.equal(daily.find((r) => r.metric === "reach")!.value, 500);
    assert.equal(daily.find((r) => r.metric === "engagement_rate_platform")!.value, 0.05);
    assert.equal(daily[0].date, "2026-11-08");
    assert.equal(parseFollowerGains({ elements: [{ timeRange: { start }, followerGains: { organicFollowerGain: 5, paidFollowerGain: 2 } }] }, { accountId: "a", orgId: "1" })[0].value, 7);
    const posts = parsePosts({ elements: [{ ugcPost: "urn:li:ugcPost:1", totalShareStatistics: { clickCount: 78, commentCount: 24, engagement: 0.02, impressionCount: 5287, likeCount: 14, shareCount: 5 } }] }, { accountId: "a", requested: new Map([["urn:li:ugcPost:1", "p1"], ["urn:li:ugcPost:2", "p2"]]), date: "d" });
    assert.equal(posts.find((r) => r.externalId === "urn:li:ugcPost:1" && r.metric === "impressions")!.value, 5287);
    assert.ok(posts.filter((r) => r.externalId === "urn:li:ugcPost:2").every((r) => r.value === 0 && r.postId === "p2"));
    assert.ok(!posts.some((r) => r.externalId === "urn:li:ugcPost:9"));
  });
  await t("x: public + organic metrics; organic impressions win; ids we did not ask for are dropped", () => {
    const rows = parseTweets({ data: [{ id: "T1", public_metrics: { like_count: 4, reply_count: 1, retweet_count: 2, quote_count: 0, bookmark_count: 3, impression_count: 100 }, organic_metrics: { impression_count: 90, url_link_clicks: 6, user_profile_clicks: 2 } }, { id: "OTHER", public_metrics: { like_count: 1 } }] }, { accountId: "a", date: "d", postIds: new Map([["T1", "p1"]]) });
    assert.equal(rows.find((r) => r.metric === "impressions")!.value, 90);
    assert.equal(rows.find((r) => r.metric === "link_clicks")!.value, 6);
    assert.ok(!rows.some((r) => r.externalId === "OTHER"));
  });

  // ── pure: http classification ──────────────────────────────────────────────────────────────────────
  await t("http: errors are classified (auth, rate limit with Retry-After, quota until Pacific midnight, scope, transient)", () => {
    const h = (o: Record<string, string> = {}) => new Headers(o);
    assert.equal(classify(400, { error: { code: 190, message: "Invalid OAuth access token" } }, h(), NOW).kind, "auth");
    assert.equal(classify(401, {}, h(), NOW).status, 401);
    const rl = classify(429, { error: { message: "slow" } }, h({ "retry-after": "120" }), NOW);
    assert.equal(rl.kind, "rate_limit");
    assert.equal(rl.retryAfterMs, 120000);
    assert.equal(classify(400, { error: { code: 17, message: "User request limit reached" } }, h(), NOW).kind, "rate_limit");
    const q = classify(403, { error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded" }] } }, h(), NOW);
    assert.equal(q.kind, "quota");
    assert.ok(q.retryAfterMs! > 0 && q.retryAfterMs! <= 86400000);
    assert.equal(classify(403, { error: { code: 10, message: "perm" } }, h(), NOW).kind, "scope");
    assert.equal(classify(400, { error: { code: 100, message: "invalid metric" } }, h(), NOW).kind, "bad_request");
    assert.equal(classify(503, {}, h(), NOW).kind, "transient");
    const x = classify(429, {}, h({ "x-rate-limit-reset": String(Math.floor(NOW.getTime() / 1000) + 600) }), NOW);
    assert.equal(x.retryAfterMs, 600000);
    assert.ok(!classify(400, { error: { message: "bad access_token=SECRET123 here" } }, h(), NOW).message.includes("SECRET123"));
    assert.ok(msUntilPacificMidnight(NOW) > 0);
  });
  await t("http: 5xx is retried with backoff then succeeds; Meta usage over 90% stops the run; 4xx is not retried", async () => {
    let calls = 0;
    const slept: number[] = [];
    const http = makeHttp({ fetch: (async () => (++calls < 3 ? json({}, 502) : json({ ok: 1 }))) as typeof fetch, sleep: async (ms) => void slept.push(ms), now: () => NOW });
    assert.deepEqual(await http.getJson("https://x.test/a"), { ok: 1 });
    assert.equal(calls, 3);
    assert.equal(slept.length, 2);
    const hot = makeHttp({ fetch: (async () => json({ ok: 1 }, 200, { "x-app-usage": JSON.stringify({ call_count: 95, total_time: 10, total_cputime: 5 }) })) as typeof fetch, sleep: async () => {}, now: () => NOW });
    await assert.rejects(() => hot.getJson("https://x.test/b"), (e) => e instanceof MetricsApiError && e.kind === "rate_limit");
    let c2 = 0;
    const bad = makeHttp({ fetch: (async () => (c2++, json({ error: { message: "nope" } }, 404))) as typeof fetch, sleep: async () => {}, now: () => NOW });
    await assert.rejects(() => bad.getJson("https://x.test/c"));
    assert.equal(c2, 1);
  });

  // ── pure: metric math ──────────────────────────────────────────────────────────────────────────────
  await t("math: rates with zero or missing denominators are null, never 0 or NaN", () => {
    assert.equal(safeDiv(5, 0), null);
    assert.equal(engagementRate({ likes: 5 }), null);
    assert.equal(engagementRate({}), null);
    assert.equal(engagementRate({ likes: 5, reach: 0, views: 0 }), null);
    assert.deepEqual(engagementRate({ likes: 5, comments: 5, reach: 200 }), { value: 5, denominator: "reach" });
    assert.equal(engagementRate({ interactions: 30, likes: 1, views: 600 })!.value, 5);
    assert.equal(engagementRate({ interactions: 30, likes: 1, views: 600 })!.denominator, "views");
    assert.equal(engagementsOf({ reach: 10 }), null);
    assert.equal(engagementsOf({ likes: 1, comments: 2, shares: 3, saves: 4 }), 10);
    assert.deepEqual(paidMath({ spend: 100, impressions: 10000, clicks: 200, conversions: null, roasValue: 0, roasSpend: 0 }), { ctr: 2, cpc: 0.5, cpm: 10, cpa: null, roas: null });
    assert.equal(paidMath({ spend: 100, impressions: 0, clicks: 0, conversions: 0, roasValue: 0, roasSpend: 0 }).ctr, null);
    assert.equal(paidMath({ spend: 100, impressions: 1, clicks: 1, conversions: 0, roasValue: 0, roasSpend: 0 }).cpa, null);
    assert.equal(paidMath({ spend: 100, impressions: 1000, clicks: 10, conversions: 4, roasValue: 300, roasSpend: 100 }).roas, 3);
    assert.equal(paidMath({ spend: 100, impressions: 1000, clicks: 10, conversions: 4, roasValue: 300, roasSpend: 100 }).cpa, 25);
    assert.deepEqual(pickConversions({ lead: 3, "offsite_conversion.fb_pixel_lead": 3 }), { action: "lead", value: 3 });
    assert.equal(pickConversions({ link_click: 9 }), null);
  });
  await t("best time: honest 'not enough data' below the thresholds; ranks reliable slots only", () => {
    const mk = (n: number, rate: number | null, hourUtc = 4): { publishedAt: Date; rate: number | null }[] => Array.from({ length: n }, (_, i) => ({ publishedAt: new Date(Date.UTC(2026, 9, 1 + (i % 28), hourUtc, 0)), rate }));
    const few = bestTimeSlots(mk(9, 5));
    assert.equal(few.ok, false);
    assert.equal(bestTimeSlots(mk(20, null)).ok, false);
    const spread = bestTimeSlots(Array.from({ length: 12 }, (_, i) => ({ publishedAt: new Date(Date.UTC(2026, 9, 1 + i, i, 0)), rate: 3 })));
    assert.equal(spread.ok, false);
    const mixed = bestTimeSlots([...Array.from({ length: 4 }, (_, i) => ({ publishedAt: new Date(Date.UTC(2026, 9, 5 + 7 * i, 4, 30)), rate: 8 })), ...Array.from({ length: 5 }, (_, i) => ({ publishedAt: new Date(Date.UTC(2026, 9, 6 + 7 * i, 14, 0)), rate: 2 })), { publishedAt: new Date(Date.UTC(2026, 9, 7, 9, 0)), rate: 99 }, ...Array.from({ length: 3 }, () => ({ publishedAt: new Date(Date.UTC(2026, 9, 8, 0, 0)), rate: null }))]);
    assert.ok(mixed.ok);
    if (mixed.ok) {
      assert.equal(mixed.best[0].avgRate, 8);
      assert.equal(mixed.best[0].hour, 10); // 04:30 UTC = 10:00 IST
      assert.ok(!mixed.best.some((s) => s.avgRate === 99), "a single post never makes a slot");
    }
  });

  // ── pure: matching by external id ──────────────────────────────────────────────────────────────────
  await t("match: posts are joined by platform post id, never by title; unmatched are reported with a reason", () => {
    const acc = [{ id: "a1", platform: "instagram" as const, provider: "instagram_business", isDefault: true, enabled: true }, { id: "a2", platform: "instagram" as const, provider: "instagram_business", isDefault: false, enabled: true }];
    const v = (platform: string, externalId: string | null) => ({ platform, publish: { state: "published", externalId, at: NOW } });
    const posts = [
      { _id: "p1", contentType: "image" as const, variants: [v("instagram", null)] },
      { _id: "p2", contentType: "image" as const, variants: [v("instagram", "M2")] },
      { _id: "p3", contentType: "video" as const, publishOptions: { accountIds: { instagram: "a2" } }, variants: [v("instagram", "M3")] },
      { _id: "p4", contentType: "image" as const, variants: [{ platform: "instagram", publish: { state: "pending", externalId: null, at: null } }] },
    ];
    const r = matchTargets(posts, [{ postId: "p2", platform: "instagram", accountId: "a2", externalId: "M2-FROM-ATTEMPT", finishedAt: NOW }], acc);
    assert.equal(r.byAccount.get("a2")!.map((x) => x.externalId).sort().join(), "M2-FROM-ATTEMPT,M3");
    assert.equal(r.byAccount.get("a2")!.find((x) => x.postId === "p3")!.format, "reel");
    assert.equal(r.unmatched.length, 1);
    assert.equal(r.unmatched[0].postId, "p1");
    const old = { ...r.byAccount.get("a2")![0], publishedAt: new Date(NOW.getTime() - 100 * 86400000) };
    assert.equal(pickTargets([old], NOW, DEFAULT_SETTINGS, false).length, 0);
    assert.equal(pickTargets([old], NOW, DEFAULT_SETTINGS, true).length, 1);
  });

  // ── database-backed ────────────────────────────────────────────────────────────────────────────────
  const igAccount: SyncAccount = { id: "acc_ig", externalId: "IG1", name: "Brand IG", provider: "instagram_business", meta: {}, scopes: ["instagram_basic", "instagram_manage_insights"], platform: "instagram", enabled: true, isDefault: true, status: "healthy" };
  const ytAccount: SyncAccount = { id: "acc_yt", externalId: "C1", name: "Brand channel", provider: "youtube_channel", meta: {}, scopes: ["youtube.readonly"], platform: "youtube", enabled: true, isDefault: true, status: "healthy" };

  class FakeNet {
    calls: string[] = [];
    mode: "ok" | "rate" | "down" = "ok";
    ytQuota = false;
    handler(url: string): Response {
      this.calls.push(url);
      if (this.mode === "rate") return json({ error: { message: "Too many" } }, 429, { "retry-after": "900" });
      if (this.mode === "down") return json({ error: { message: "boom" } }, 500);
      const u = new URL(url);
      const p = u.pathname;
      if (u.host === "graph.facebook.com") {
        if (p.endsWith("/IG1")) return json({ followers_count: 1200 });
        if (p.endsWith("/IG1/insights")) return json({ data: [{ name: "reach", period: "day", total_value: { value: 500 } }, { name: "views", period: "day", total_value: { value: 900 } }] });
        if (p.endsWith("/MEDIA1")) return json({ media_product_type: "REELS", like_count: 10, comments_count: 2 });
        if (p.endsWith("/MEDIA1/insights")) return json({ data: [{ name: "reach", values: [{ value: 400 }] }, { name: "total_interactions", values: [{ value: 40 }] }, { name: "saved", values: [{ value: 5 }] }] });
        if (p.endsWith("/MEDIA2")) return json({ media_product_type: "FEED", like_count: 1, comments_count: 0 });
        if (p.endsWith("/MEDIA2/insights")) return json({ data: [{ name: "reach", values: [{ value: 100 }] }] });
      }
      if (u.host === "www.googleapis.com") {
        if (this.ytQuota) return json({ error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded" }] } }, 403);
        if (p.endsWith("/channels")) return json({ items: [{ statistics: { subscriberCount: "900", viewCount: "5000", videoCount: "3" } }] });
        if (p.endsWith("/videos")) return json({ items: [{ id: "V1", statistics: { viewCount: "300", likeCount: "20", commentCount: "4" } }] });
      }
      return json({ error: { message: `unexpected ${url.split("?")[0]}` } }, 404);
    }
  }

  const makeDeps = (net: FakeNet, accounts: SyncAccount[], clock: { now: Date }, notes: { title: string; dedupeKey: string }[] = []): MetricsDeps => ({
    now: () => clock.now,
    sleep: async () => {},
    fetch: (async (url: string | URL | Request) => net.handler(String(url))) as typeof fetch,
    listAccounts: async () => accounts,
    withToken: async (_id, fn) => fn("TOKEN"),
    loadPosts: async () => (await (await postsCollection()).find({}).toArray()) as never,
    loadAttempts: async () => (await (await attemptsCol()).find({ state: "published" }).toArray()) as never,
    notify: async (n) => void notes.push(n),
    linkedinVersion: async () => "202610",
  });
  const post = (id: string, title: string, platform: string, externalId: string | null, at: Date, extra: Record<string, unknown> = {}) => ({ _id: id, title, status: "published", contentType: "video", platforms: [platform], mediaIds: [], deletedAt: null, variants: [{ platform, publish: { ...EMPTY_PUBLISH, state: "published", externalId, at, url: externalId ? `https://x.test/${externalId}` : null }, metrics: null }], ...extra });

  await runAsCompany(CO, async () => {
    resetSnapshotIndexCacheForTests();
    const posts = await postsCollection();
    await posts.insertMany([
      post("pA", "Same title", "instagram", "MEDIA1", new Date("2026-11-08T05:00:00Z")),
      post("pB", "Same title", "instagram", "MEDIA2", new Date("2026-11-09T05:00:00Z"), { contentType: "image" }),
      post("pC", "By hand", "instagram", null, new Date("2026-11-09T05:00:00Z")),
    ] as never);

    await t("snapshot writes are idempotent and respect retention; purge leaves paid rows alone", async () => {
      const row: MetricRow = { platform: "instagram", externalId: "M9", level: "post", metric: "reach", value: 1, date: "2026-11-09", accountId: "acc_ig" };
      assert.equal(await writeRows([row, { ...row, value: 2 }], NOW, 730), 1);
      await writeRows([{ ...row, value: 3 }], NOW, 730);
      const col = await snapshotsCollection();
      const found = await col.find({ externalId: "M9" }).toArray();
      assert.equal(found.length, 1);
      assert.equal(found[0].value, 3);
      assert.equal((found[0] as unknown as { accountId: string }).accountId, "acc_ig");
      assert.equal(await writeRows([{ ...row, date: "2020-01-01" }], NOW, 730), 0);
      await upsertSnapshots([{ platform: "meta", externalId: "c1", level: "campaign", metric: "spend", value: 5, date: "2020-01-01", source: "meta_ads_insights" }]);
      await writeRows([{ ...row, externalId: "OLD", date: "2025-01-01" }], new Date("2025-01-02T00:00:00Z"), 730);
      assert.equal(await purgeOld(NOW, 365), 1);
      assert.equal(await col.countDocuments({ platform: "meta" }), 1);
      await col.deleteMany({});
    });

    await t("sync: first read backfills 30 days, stores rows, records state; second read the same day does not repeat the account backfill", async () => {
      const net = new FakeNet();
      const clock = { now: NOW };
      const deps = makeDeps(net, [igAccount], clock);
      const r1 = await syncAccount(deps, igAccount);
      assert.equal(r1.state.status, "ok");
      assert.equal(net.calls.filter((u) => u.includes("/IG1/insights")).length, 30);
      assert.ok(r1.state.cursor.accountThrough === "2026-11-09" && r1.state.cursor.backfilledAt);
      const col = await snapshotsCollection();
      const n1 = await col.countDocuments({});
      assert.ok(n1 > 60);
      assert.equal(await col.countDocuments({ externalId: "MEDIA1", metric: "saves", value: 5 }), 1);
      assert.equal(await col.countDocuments({ externalId: "MEDIA1", metric: "likes", value: 10 }), 1);
      net.calls.length = 0;
      const r2 = await syncAccount(deps, igAccount);
      assert.equal(r2.state.status, "ok");
      assert.equal(net.calls.filter((u) => u.includes("/IG1/insights")).length, 0, "no repeat account backfill");
      assert.equal(await col.countDocuments({}), n1, "same data, same rows");
      clock.now = new Date(NOW.getTime() + 86400000);
      net.calls.length = 0;
      await syncAccount(deps, igAccount);
      const again = net.calls.filter((u) => u.includes("/IG1/insights")).length;
      assert.ok(again > 0 && again <= 3, `incremental days only (${again})`);
      assert.ok(await col.countDocuments({ date: "2026-11-11", metric: "followers" }) === 1, "a follower point per day");
      assert.equal(r1.state.nextSyncAt!.getTime(), NOW.getTime() + 180 * 60000);
      assert.ok(r2.state.warnings.some((w) => /could not be matched/.test(w)), "the hand-published post is reported");
    });

    await t("sync: rate limit defers the account (no failure counted); a manual sync respects it", async () => {
      const net = new FakeNet();
      net.mode = "rate";
      const clock = { now: NOW };
      const deps = makeDeps(net, [igAccount], clock);
      const r = await syncAccount(deps, igAccount);
      assert.equal(r.state.status, "deferred");
      assert.equal(r.state.consecutiveFailures, 0);
      assert.ok(r.state.nextSyncAt!.getTime() >= NOW.getTime() + 15 * 60000);
      assert.match(r.state.error!, /Rate limited/);
      const now = await syncNow(deps, igAccount.id);
      assert.equal(now.ok, false);
    });

    await t("sync: persistent failure is recorded plainly and the admins are told once per day", async () => {
      const net = new FakeNet();
      net.mode = "down";
      const clock = { now: NOW };
      const notes: { title: string; dedupeKey: string }[] = [];
      const deps = makeDeps(net, [igAccount], clock, notes);
      for (let i = 0; i < 4; i++) {
        clock.now = new Date(NOW.getTime() + (i + 1) * 25 * 3600_000 * 0 + i * 3600_000);
        await syncAccount(deps, igAccount);
      }
      const st = (await (await import("../src/lib/products/viralpulse-ai/metrics/sync")).getSyncState(igAccount.id))!;
      assert.equal(st.status, "error");
      assert.ok(st.consecutiveFailures >= 3);
      assert.ok(st.error && !/TOKEN/.test(st.error));
      assert.equal(notes.length, 1, "notified once, not on every failure");
      assert.match(notes[0].title, /not updating/);
    });

    await t("sync: manual 'Sync now' has a cooldown", async () => {
      const net = new FakeNet();
      const clock = { now: new Date(NOW.getTime() + 3 * 86400000) };
      const deps = makeDeps(net, [igAccount], clock);
      const first = await syncNow(deps, igAccount.id);
      assert.equal(first.ok, true);
      clock.now = new Date(clock.now.getTime() + 2 * 60000);
      const second = await syncNow(deps, igAccount.id);
      assert.equal(second.ok, false);
      assert.match((second as { error: string }).error, /try again in/);
      clock.now = new Date(clock.now.getTime() + 11 * 60000);
      assert.equal((await syncNow(deps, igAccount.id)).ok, true);
      assert.equal((await syncNow(deps, "missing")).ok, false);
    });

    await t("cron run: only due accounts are read; summary counts", async () => {
      const net = new FakeNet();
      const clock = { now: new Date(NOW.getTime() + 10 * 86400000) };
      const deps = makeDeps(net, [igAccount], clock);
      const s1 = await runMetricsSync(deps);
      assert.equal(s1.accounts, 1);
      assert.equal(s1.synced + s1.failed + s1.deferred, 1);
      const s2 = await runMetricsSync(deps);
      assert.equal(s2.skipped, 1, "not due again yet");
    });

    await t("youtube: own daily quota cap defers video reads and is reported; quotaExceeded defers until Pacific midnight; missing analytics scope is a warning", async () => {
      const col = await postsCollection();
      await col.insertOne(post("pY", "Video", "youtube", "V1", new Date("2026-11-08T05:00:00Z")) as never);
      await saveMetricsSettings({ youtubeDailyUnitCap: 100 }, "u");
      const net = new FakeNet();
      const deps = makeDeps(net, [ytAccount], { now: NOW });
      const ok = await syncAccount(deps, ytAccount);
      assert.equal(ok.state.status, "ok");
      assert.equal(ok.state.quota.youtubeUnits, 2, "channels.list + videos.list = 2 units");
      assert.ok(ok.state.warnings.some((w) => /yt-analytics/.test(w)));
      const col2 = await snapshotsCollection();
      assert.equal(await col2.countDocuments({ externalId: "V1", metric: "views", value: 300 }), 1);
      // The company caps itself at 1 unit.
      // The cap clamps to >= 100 units, so pretend 99 are already used today.
      const sc = await syncCol();
      await sc.deleteOne({ _id: ytAccount.id });
      await sc.insertOne({ _id: ytAccount.id, accountId: ytAccount.id, platform: "youtube", accountName: "x", status: "ok", lastAttemptAt: null, lastOkAt: null, nextSyncAt: null, error: null, errorKind: null, consecutiveFailures: 0, lastNotifiedAt: null, warnings: [], rowsWritten: 0, cursor: {}, quota: { day: "2026-11-10", youtubeUnits: 99, youtubeAnalyticsCalls: 0 }, manualAt: null, updatedAt: NOW } as never);
      const capped = await syncAccount(deps, ytAccount);
      assert.ok(capped.state.warnings.some((w) => /allowance/.test(w)), "own cap reported");
      assert.equal(capped.state.quota.youtubeUnits, 100);
      // Google says the project's quota is gone.
      net.ytQuota = true;
      await sc.deleteOne({ _id: ytAccount.id });
      const q = await syncAccount(deps, ytAccount);
      assert.equal(q.state.status, "deferred");
      assert.equal(q.state.errorKind, "quota");
      assert.ok(q.state.nextSyncAt!.getTime() > NOW.getTime());
    });

    await t("analytics: matches by external id (same titles stay apart), manual override is badged and never counted, CSV carries sync timestamps", async () => {
      const col = await postsCollection();
      await col.updateOne({ _id: "pC" }, { $set: { "variants.0.metrics": { impressions: 999, reach: 0, clicks: 0, engagements: 77, likes: 0, comments: 0, shares: 0, saves: 0, videoViews: 0, conversions: 0, updatedAt: new Date("2026-11-09T10:00:00Z"), updatedBy: "u_typed" } } });
      const net = new FakeNet();
      await syncAccount(makeDeps(net, [igAccount], { now: new Date(NOW.getTime() + 20 * 86400000) }), igAccount, { full: true });
      const d = await loadAnalytics({ from: "2026-11-01", to: "2026-11-30" }, new Date(NOW.getTime() + 20 * 86400000), { listAccounts: async () => [igAccount], loadAttempts: async () => [] });
      const a = d.posts.find((p) => p.postId === "pA")!;
      const b = d.posts.find((p) => p.postId === "pB")!;
      assert.equal(a.externalId, "MEDIA1");
      assert.equal(a.metrics.reach, 400);
      assert.equal(a.engagements, 40);
      assert.equal(a.rate!.value, 10);
      assert.equal(b.metrics.reach, 100);
      assert.equal(b.engagements, 1);
      assert.ok(a.syncedAt);
      assert.equal(d.posts.find((p) => p.postId === "pC"), undefined, "no platform id: not in the table");
      assert.equal(d.kpis.engagements.value, 41, "typed-in 77 is not added");
      assert.equal(d.unmatched, 2, "the hand-published post and the YouTube post whose account is not connected");
      // Manual override on a post that HAS an id.
      await col.updateOne({ _id: "pB" }, { $set: { "variants.0.metrics": { impressions: 5, reach: 5, clicks: 0, engagements: 5, likes: 0, comments: 0, shares: 0, saves: 0, videoViews: 0, conversions: 0, updatedAt: new Date("2026-11-09T10:00:00Z"), updatedBy: "507f1f77bcf86cd799439011" } } });
      const d2 = await loadAnalytics({ from: "2026-11-01", to: "2026-11-30" }, new Date(NOW.getTime() + 20 * 86400000), { listAccounts: async () => [igAccount], loadAttempts: async () => [] });
      const b2 = d2.posts.find((p) => p.postId === "pB")!;
      assert.ok(b2.manual && b2.manual.at.startsWith("2026-11-09") && b2.manual.by);
      assert.equal(b2.metrics.reach, 100, "synced value untouched by the override");
      assert.equal(d2.kpis.engagements.value, 41);
      const csv = postsToCsv(d2.posts);
      assert.match(csv, /Numbers read from platform at/);
      assert.match(csv, /entered manually by/);
      assert.match(csv, /https:\/\/x\.test\/MEDIA1/);
      assert.equal(postsToCsv([{ ...a, title: "=HYPERLINK(\"x\")" }]).split("\r\n")[1].startsWith("\"'=HYPERLINK") || postsToCsv([{ ...a, title: "=HYPERLINK(\"x\")" }]).includes("'=HYPERLINK"), true);
      // Filters.
      const reels = await loadAnalytics({ from: "2026-11-01", to: "2026-11-30", contentType: "reel" }, new Date(NOW.getTime() + 20 * 86400000), { listAccounts: async () => [igAccount], loadAttempts: async () => [] });
      assert.deepEqual(reels.posts.map((p) => p.postId), ["pA"]);
      const none = await loadAnalytics({ from: "2026-11-01", to: "2026-11-30", platform: "youtube" }, NOW, { listAccounts: async () => [igAccount], loadAttempts: async () => [] });
      assert.equal(none.posts.length, 0);
      assert.equal(none.kpis.reach.value, null);
      assert.ok(none.kpis.reach.reason);
    });

    await t("analytics: paid results come from the ad snapshots; CPA and ROAS only when Meta reported them", async () => {
      await upsertSnapshots([
        { platform: "meta", externalId: "cmp1", level: "campaign", metric: "spend", value: 100, date: "2026-11-05", source: "meta_ads_insights", campaignId: "camp_local" },
        { platform: "meta", externalId: "cmp1", level: "campaign", metric: "impressions", value: 10000, date: "2026-11-05", source: "meta_ads_insights", campaignId: "camp_local" },
        { platform: "meta", externalId: "cmp1", level: "campaign", metric: "inline_link_clicks", value: 200, date: "2026-11-05", source: "meta_ads_insights", campaignId: "camp_local" },
        { platform: "meta", externalId: "cmp2", level: "campaign", metric: "spend", value: 50, date: "2026-11-05", source: "meta_ads_insights", campaignId: "camp_2" },
        { platform: "meta", externalId: "cmp2", level: "campaign", metric: "impressions", value: 1000, date: "2026-11-05", source: "meta_ads_insights", campaignId: "camp_2" },
        { platform: "meta", externalId: "cmp2", level: "campaign", metric: "action:lead", value: 5, date: "2026-11-05", source: "meta_ads_insights", campaignId: "camp_2" },
        { platform: "meta", externalId: "cmp2", level: "campaign", metric: "action:offsite_conversion.fb_pixel_lead", value: 5, date: "2026-11-05", source: "meta_ads_insights", campaignId: "camp_2" },
        { platform: "meta", externalId: "cmp2", level: "campaign", metric: "roas:omni_purchase", value: 3, date: "2026-11-05", source: "meta_ads_insights", campaignId: "camp_2" },
      ]);
      const d = await loadAnalytics({ from: "2026-11-01", to: "2026-11-30" }, NOW, { listAccounts: async () => [], loadAttempts: async () => [] });
      const c1 = d.paid.find((r) => r.id === "cmp1")!;
      assert.deepEqual([c1.spend, c1.math.ctr, c1.math.cpc, c1.math.cpm, c1.conversions, c1.math.cpa, c1.math.roas], [100, 2, 0.5, 10, null, null, null]);
      const c2 = d.paid.find((r) => r.id === "cmp2")!;
      assert.deepEqual([c2.conversions, c2.math.cpa, c2.math.roas, c2.math.ctr], [5, 10, 3, 0]);
      const only = await loadAnalytics({ from: "2026-11-01", to: "2026-11-30", campaign: "camp_2" }, NOW, { listAccounts: async () => [], loadAttempts: async () => [] });
      assert.deepEqual(only.paid.map((r) => r.id), ["cmp2"]);
      assert.equal(d.hasAnyAccount, false);
    });
  });

  await t("tenancy: another company sees none of the first company's snapshots, sync state, posts or settings", async () => {
    await runAsCompany("co_wp7_other", async () => {
      resetSnapshotIndexCacheForTests();
      assert.equal(await (await snapshotsCollection()).countDocuments({}), 0);
      assert.equal(await (await (await import("../src/lib/products/viralpulse-ai/metrics/store")).syncCol()).countDocuments({}), 0);
      assert.equal((await getMetricsSettings()).retentionDays, DEFAULT_SETTINGS.retentionDays);
      const d = await loadAnalytics({}, NOW, { listAccounts: async () => [], loadAttempts: async () => [] });
      assert.equal(d.posts.length, 0);
      assert.equal(d.paid.length, 0);
      assert.equal(d.kpis.reach.value, null);
      assert.equal(d.bestTime.ok, false);
    });
    await runAsCompany(CO, async () => {
      resetSnapshotIndexCacheForTests();
      assert.ok((await (await snapshotsCollection()).countDocuments({})) > 0);
      assert.equal((await getMetricsSettings()).youtubeDailyUnitCap, 100);
    });
  });

  console.log(`\nviralpulse WP7: ${pass} passed, ${fail} failed`);
  const client = await MongoClient.connect(uri);
  await client.db().dropDatabase();
  await client.close();
  process.exit(fail ? 1 : 0);
})();
