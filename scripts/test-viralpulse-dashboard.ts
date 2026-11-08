/**
 * ViralPulse Dashboard tests: permission-aware sections, month boundaries in the company time zone, change-vs-previous only when both
 * periods have data, setup checklist, ranking of problems, launch buckets, empty states, no invented numbers, and tenancy.
 * Database: a THROWAWAY MongoDB only (asserted).
 * Run: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_vpdash npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-viralpulse-dashboard.ts
 */
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "";
const dbName = uri.split("?")[0].split("/").pop() ?? "";
assert.ok(/zz_throwaway/.test(dbName), "refusing to run: MONGODB_URI must be a zz_throwaway_* database");

let pass = 0;
let fail = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
  try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e instanceof Error ? e.message.split("\n").slice(0, 8).join("\n    ") : e); }
};

async function main() {
  const core = await import("../src/lib/products/viralpulse-ai/dashboard-core");
  const dash = await import("../src/lib/products/viralpulse-ai/dashboard");
  const { runAsCompany } = await import("../src/lib/platform/tenancy/context");
  const { smmsCollection, COLLECTIONS } = await import("../src/lib/products/viralpulse-ai/db");
  const { snapshotsCollection } = await import("../src/lib/products/viralpulse-ai/ads-platforms/snapshots");
  const { launchesCollection } = await import("../src/lib/products/viralpulse-ai/ads-platforms/launches");
  const { INSIGHTS_SOURCE } = await import("../src/lib/products/viralpulse-ai/ads-platforms/ads-sync");

  const none = core.dashPerms(() => false);
  const all = core.dashPerms(() => true);
  const only = (...ps: string[]) => core.dashPerms((p) => ps.includes(p));
  const NOW = new Date("2026-11-03T05:00:00Z"); // 10:30 IST, 3 Nov

  // ── pure ──
  await t("header actions: only what the person can use, fixed order", () => {
    assert.deepEqual(core.headerActions(none), []);
    assert.deepEqual(core.headerActions(all).map((a) => a.key), ["post", "campaign", "image", "ugc"]);
    assert.deepEqual(core.headerActions(only("MANAGE_POSTS")).map((a) => a.key), ["post"]);
    assert.deepEqual(core.headerActions(only("GENERATE_AI_CONTENT")).map((a) => a.key), ["image", "ugc"]);
    assert.deepEqual(core.headerActions(only("VIEW_CAMPAIGNS")).map((a) => a.key), []);
  });
  await t("periods: month starts at midnight in the company zone, not UTC", () => {
    const p = core.periodsFor(NOW, "Asia/Kolkata");
    assert.equal(p.start.toISOString(), "2026-10-31T18:30:00.000Z");
    assert.equal(p.today, "2026-11-03");
    assert.equal(p.daysElapsed, 3);
    assert.equal(p.prevStart.toISOString(), "2026-09-30T18:30:00.000Z");
    assert.equal(p.prevEnd.toISOString(), "2026-10-03T18:30:00.000Z"); // 1-3 Oct inclusive
    assert.deepEqual([p.fromDay, p.toDay, p.prevFromDay, p.prevToDay], ["2026-11-01", "2026-11-03", "2026-10-01", "2026-10-03"]);
    const utc = core.periodsFor(new Date("2026-11-01T00:30:00Z"), "America/Los_Angeles"); // still 31 Oct in LA
    assert.equal(utc.month, "2026-10");
  });
  await t("periods: previous window is capped when last month is shorter", () => {
    const p = core.periodsFor(new Date("2026-03-30T06:00:00Z"), "Asia/Kolkata");
    assert.equal(p.prevToDay, "2026-02-28");
    assert.equal(p.prevEnd.toISOString(), "2026-02-28T18:30:00.000Z");
  });
  await t("pctChange: null unless both sides are real and the base is positive", () => {
    assert.equal(core.pctChange(10, 5), 100);
    assert.equal(core.pctChange(5, 10), -50);
    assert.equal(core.pctChange(0, 10), -100);
    assert.equal(core.pctChange(5, 0), null);
    assert.equal(core.pctChange(null, 5), null);
    assert.equal(core.pctChange(5, null), null);
    assert.equal(core.pctChange(NaN, 5), null);
  });
  await t("setup: items limited by permission; hidden once all visible items are done", () => {
    const facts = { platforms: [{ label: "Instagram", count: 1 }, { label: "YouTube", count: 0 }], brandKitSet: true, aiModels: { state: "ok" as const, detail: "ok" }, publishingSaved: true, limitsSet: true, postCount: 2, campaignCount: 1 };
    const full = core.buildSetup(facts, all);
    assert.equal(full.total, 7);
    assert.ok(full.allDone);
    assert.match(full.items[0].detail, /Instagram connected; not yet: YouTube/);
    const emp = core.buildSetup({ ...facts, postCount: 0 }, only("MANAGE_POSTS"));
    assert.deepEqual(emp.items.map((i) => i.key), ["post"]);
    assert.equal(emp.allDone, false);
    assert.equal(core.buildSetup({ ...facts, aiModels: { state: "unknown", detail: "x" } }, only("MANAGE_INTEGRATIONS")).allDone, false);
    assert.equal(core.buildSetup(facts, none).allDone, true); // nothing to do for this person
    assert.equal(core.buildSetup({ ...facts, platforms: [{ label: "Instagram", count: 0 }] }, only("MANAGE_INTEGRATIONS")).items.find((i) => i.key === "accounts")!.done, false);
  });
  await t("attention: critical first, then publishing, ads, accounts; stable", () => {
    const mk = (id: string, severity: "critical" | "warning", title = id) => ({ id, severity, title, detail: "", fixLabel: "", href: null });
    const r = core.rankAttention([mk("cron.x", "warning"), mk("account.1", "critical"), mk("ads.due", "warning"), mk("posts.failed", "critical"), mk("ads.issue.1", "critical")]);
    assert.deepEqual(r.map((i) => i.id), ["posts.failed", "ads.issue.1", "account.1", "ads.due", "cron.x"]);
  });
  await t("health findings: expiry/expired/missing ffmpeg classified and linked; viewers who cannot fix get no link", () => {
    const items = [
      { id: "account.1", label: "Instagram: a", status: "attention", detail: "The login expired on 2026-10-01; posts to it will fail.", fix: "Press Reconnect" },
      { id: "account.2", label: "YouTube: b", status: "attention", detail: "The login expires in 3 days (2026-11-06) and cannot renew itself.", fix: "Press Reconnect" },
      { id: "ffmpeg", label: "ffmpeg", status: "attention", detail: "ffmpeg wasn't found (x). Multi-scene videos would be left as separate clips.", fix: "Reinstall" },
      { id: "openai.key", label: "OpenAI key", status: "ok", detail: "ok", fix: null },
    ];
    const a = core.fromHealth(items, true);
    assert.equal(a.length, 3);
    assert.equal(a.find((i) => i.id === "account.1")!.severity, "critical");
    assert.equal(a.find((i) => i.id === "account.2")!.severity, "warning");
    assert.equal(a.find((i) => i.id === "ffmpeg")!.href, "/viralpulse-ai/settings?tab=health");
    assert.equal(a.find((i) => i.id === "account.1")!.href, "/viralpulse-ai/settings?tab=integrations");
    assert.ok(core.fromHealth(items, false).every((i) => i.href === null));
  });
  await t("launch bucket: worst first", () => {
    const l = (state: string, delivery: string, eff: (string | null)[] = []) => ({ state, delivery, review: Object.fromEntries(eff.map((e, i) => [String(i), { effectiveStatus: e }])) });
    assert.equal(core.launchBucket(l("ready", "active", ["ACTIVE", "DISAPPROVED"])), "issue");
    assert.equal(core.launchBucket(l("ready", "active", ["PENDING_REVIEW"])), "review");
    assert.equal(core.launchBucket(l("ready", "active", ["ACTIVE"])), "running");
    assert.equal(core.launchBucket(l("ready", "paused")), "paused");
    assert.equal(core.launchBucket(l("partial", "paused")), "failed");
    assert.equal(core.launchBucket(l("ready", "archived")), "archived");
  });
  await t("schedule state", () => {
    const at = new Date("2026-11-03T05:00:00Z");
    assert.equal(core.scheduleState({ scheduledAt: new Date(at.getTime() + 3600_000), approvedBy: null }, at), "awaiting_approval");
    assert.equal(core.scheduleState({ scheduledAt: new Date(at.getTime() + 3600_000), approvedBy: "u" }, at), "approved");
    assert.equal(core.scheduleState({ scheduledAt: new Date(at.getTime() - 3600_000), approvedBy: "u" }, at), "overdue");
    assert.equal(core.scheduleState({ scheduledAt: new Date(at.getTime() - 3600_000), approvedBy: "u", publishQueuedAt: at }, at), "queued");
  });

  // ── database ──
  const ctxFor = (perms: ReturnType<typeof core.dashPerms>, extra: Partial<import("../src/lib/products/viralpulse-ai/dashboard").DashCtx> = {}) => ({ now: NOW, perms, viewerId: "u-me", ...extra });

  await runAsCompany("co_dash_1", async () => {
    await t("empty company: honest zeros, no deltas, no invented rows", async () => {
      const s = await dash.loadStats(ctxFor(all));
      assert.equal(s.posts!.publishedMonth, 0);
      assert.equal(s.posts!.deltaPct, null);
      assert.equal(s.posts!.scheduled, 0);
      assert.equal(s.ads!.running, 0);
      assert.equal(s.ads!.spend.rows, 0);
      assert.deepEqual(s.ads!.spend.byCurrency, []);
      assert.equal(s.ads!.deltaPct, null);
      assert.equal(s.images!.month, 0);
      assert.equal(s.images!.deltaPct, null);
      assert.deepEqual(s.ugc, { ready: 0, generating: 0 });
      assert.deepEqual(s.accounts, { healthy: 0, total: 0, needAttention: 0 });
      assert.deepEqual((await dash.loadSchedule(ctxFor(all)))!.rows, []);
      assert.deepEqual((await dash.loadRecentPublished(ctxFor(all, { analytics: async () => { throw new Error("no"); } })))!.rows, []);
      const ads = (await dash.loadAdsSnapshot(ctxFor(all)))!;
      assert.equal(ads.campaigns, 0);
      assert.deepEqual(ads.top, []);
      assert.deepEqual((await dash.loadStudios(ctxFor(all)))!.images, []);
      assert.deepEqual((await dash.loadAccountsHealth(ctxFor(all)))!, []);
      assert.deepEqual((await dash.loadActivity(ctxFor(all)))!.rows, []);
      const hl = (await dash.loadHighlights(ctxFor(all)))!;
      assert.equal(hl.hasAnyAccount, false);
      assert.equal(hl.trends.reach.length, 0);
      assert.equal(hl.bestTime.ok, false);
    });
    await t("empty company: setup lists every step as not done", async () => {
      const s = await dash.loadSetup(ctxFor(all, { health: async () => null }));
      assert.equal(s.allDone, false);
      assert.equal(s.items.filter((i) => i.done).length, 0);
      assert.equal(s.items.find((i) => i.key === "ai")!.cta, "Check");
    });

    // data
    const posts = await (await import("../src/lib/products/viralpulse-ai/posts")).postsCollection();
    const base = { deletedAt: null, title: "P", variants: [], mediaIds: [] } as never;
    const mk = (o: Record<string, unknown>) => ({ ...(base as object), ...o }) as never;
    await posts.insertMany([
      mk({ _id: "p-before", status: "published", publishedAt: new Date("2026-10-31T18:29:00Z"), title: "Last second of October (IST)" }),
      mk({ _id: "p-first", status: "published", publishedAt: new Date("2026-10-31T18:30:00Z"), title: "First instant of November (IST)" }),
      mk({ _id: "p-now", status: "published", publishedAt: new Date("2026-11-02T10:00:00Z"), title: "Recent" }),
      mk({ _id: "p-prev1", status: "published", publishedAt: new Date("2026-10-01T10:00:00Z") }),
      mk({ _id: "p-prev-late", status: "published", publishedAt: new Date("2026-10-20T10:00:00Z") }), // beyond day 3 of last month: not in the comparison window
      mk({ _id: "p-del", status: "published", publishedAt: new Date("2026-11-02T10:00:00Z"), deletedAt: new Date() }),
      mk({ _id: "s-appr", status: "scheduled", scheduledAt: new Date("2026-11-04T05:00:00Z"), approvedBy: "u", title: "Soon", variants: [{ platform: "instagram", publish: { state: "pending" } }] }),
      mk({ _id: "s-wait", status: "scheduled", scheduledAt: new Date("2026-11-05T05:00:00Z"), approvedBy: null, title: "Later" }),
      mk({ _id: "s-over", status: "scheduled", scheduledAt: new Date("2026-11-02T05:00:00Z"), approvedBy: "u", publishQueuedAt: null, title: "Missed" }),
      mk({ _id: "f1", status: "failed" }),
    ]);

    await t("counts by period boundary in the company zone; deleted excluded; comparison window equal length", async () => {
      const s = await dash.loadStats(ctxFor(only("MANAGE_POSTS")));
      assert.equal(s.posts!.publishedMonth, 2); // p-first (00:00 IST 1 Nov) and p-now; p-before is October
      assert.equal(s.posts!.deltaPct, 100 - 100 + (2 - 2) /* 2 vs p-before(Oct 31 is outside 1-3 Oct) + p-prev1 = 1 */ || s.posts!.deltaPct);
    });
    await t("posts delta is vs 1-3 October only", async () => {
      const s = await dash.loadStats(ctxFor(only("MANAGE_POSTS")));
      assert.equal(s.posts!.deltaPct, 100); // 2 now vs 1 (p-prev1)
      assert.equal(s.posts!.scheduled, 3);
      assert.equal(s.posts!.awaitingApproval, 1);
    });
    await t("permission filtering: a posts-only viewer gets no ads or ugc cards and no analytics, activity or ads sections (image studio follows the sidebar rule)", async () => {
      const c = ctxFor(only("MANAGE_POSTS"));
      const s = await dash.loadStats(c);
      assert.equal(s.ads, null);
      assert.ok(s.images); // MANAGE_POSTS opens the Image Studio in the sidebar
      assert.equal(s.ugc, null);
      assert.ok(s.accounts);
      assert.equal(await dash.loadAdsSnapshot(c), null);
      assert.equal(await dash.loadHighlights(c), null);
      assert.equal(await dash.loadActivity(c), null);
      assert.equal((await dash.loadStudios(c))!.videos, null);
      assert.equal(await dash.loadStudios(ctxFor(only("VIEW_CAMPAIGNS"))), null);
      const none0 = ctxFor(none);
      assert.equal(await dash.loadSchedule(none0), null);
      assert.equal(await dash.loadRecentPublished(none0), null);
      assert.equal(await dash.loadAccountsHealth(none0), null);
      assert.deepEqual(await dash.loadAttention(none0), []);
    });
    await t("schedule: soonest first, state per post, no invented account", async () => {
      const r = (await dash.loadSchedule(ctxFor(only("MANAGE_POSTS"))))!;
      assert.deepEqual(r.rows.map((x) => x.id), ["s-over", "s-appr", "s-wait"]);
      assert.deepEqual(r.rows.map((x) => x.state), ["overdue", "approved", "awaiting_approval"]);
      assert.deepEqual(r.rows[1].targets, [{ platform: "instagram", account: null }]);
      assert.equal(r.total, 3);
    });
    await t("recently published: newest first; no metrics without analytics permission; nothing synced => null, not zero", async () => {
      const noAn = (await dash.loadRecentPublished(ctxFor(only("MANAGE_POSTS"))))!;
      assert.equal(noAn.metrics, false);
      assert.deepEqual(noAn.rows.map((x) => x.id).slice(0, 2), ["p-now", "p-first"]);
      assert.ok(!noAn.rows.some((x) => x.id === "p-del"));
      assert.ok(noAn.rows.every((x) => x.reach === null && x.engagements === null && x.syncedAt === null));
      const withAn = (await dash.loadRecentPublished(ctxFor(only("MANAGE_POSTS", "VIEW_ANALYTICS"))))!;
      assert.equal(withAn.metrics, true);
      assert.ok(withAn.rows.every((x) => x.reach === null && x.engagements === null));
    });
    await t("attention: failed + overdue posts for a posts viewer, critical first", async () => {
      const a = await dash.loadAttention(ctxFor(only("MANAGE_POSTS")));
      assert.deepEqual(a.map((x) => x.id), ["posts.failed", "posts.overdue"]);
      assert.equal(a[0].severity, "critical");
    });

    // ads
    const launches = await launchesCollection();
    const L = (id: string, currency: string, over: Record<string, unknown> = {}) => ({ _id: id, platform: "meta", campaignId: `c-${id}`, campaignName: `Camp ${id}`, active: true, state: "ready", delivery: "active", currency, review: {}, approval: null, commitment: { dailyMinor: 50000, totalMinor: null }, createdBy: "u-other", updatedAt: new Date(), lastError: null, ...over }) as never;
    await launches.insertMany([L("l1", "INR"), L("l2", "INR", { delivery: "paused" }), L("l3", "USD", { review: { a: { effectiveStatus: "DISAPPROVED" } } }), L("l4", "INR", { createdBy: "u-me" })]);
    const snaps = await snapshotsCollection();
    const S = (id: string, launchId: string, metric: string, date: string, value: number) => ({ _id: id, platform: "meta", externalId: `ext-${launchId}`, level: "campaign", metric, value, date, source: INSIGHTS_SOURCE, capturedAt: new Date("2026-11-03T04:00:00Z"), launchId, campaignId: `c-${launchId}` }) as never;
    await snaps.insertMany([S("a", "l1", "spend", "2026-11-02", 1200), S("b", "l1", "impressions", "2026-11-02", 5000), S("c", "l1", "clicks", "2026-11-02", 90), S("d", "l1", "inline_link_clicks", "2026-11-02", 70), S("e", "l3", "spend", "2026-11-01", 10), S("f", "l1", "spend", "2026-10-31", 9999) /* October */]);

    await t("spend: per currency, month to date only, link clicks preferred, synced time shown", async () => {
      const s = await dash.loadStats(ctxFor(only("VIEW_CAMPAIGNS")));
      assert.deepEqual(s.ads!.spend.byCurrency, [{ currency: "INR", value: 1200 }, { currency: "USD", value: 10 }]);
      assert.equal(s.ads!.spend.impressions, 5000);
      assert.equal(s.ads!.spend.clicks, 70);
      assert.equal(s.ads!.spend.syncedAt, "2026-11-03T04:00:00.000Z");
      assert.equal(s.ads!.running, 3);
      assert.equal(s.ads!.deltaPct, null); // last month's window has no synced rows
    });
    await t("spend delta appears only when both periods have synced rows in one currency", async () => {
      await snaps.insertOne(S("g", "l1", "spend", "2026-10-02", 600));
      let s = await dash.loadStats(ctxFor(only("VIEW_CAMPAIGNS")));
      assert.equal(s.ads!.deltaPct, null); // this month has two currencies
      await snaps.deleteOne({ _id: "e" } as never);
      s = await dash.loadStats(ctxFor(only("VIEW_CAMPAIGNS")));
      assert.equal(s.ads!.deltaPct, 100); // 1200 vs 600
    });
    await t("spend with unknown currency is never added to a currency total", async () => {
      await snaps.insertOne(S("h", "gone", "spend", "2026-11-01", 5));
      const s = await dash.loadStats(ctxFor(only("VIEW_CAMPAIGNS")));
      assert.deepEqual(s.ads!.spend.byCurrency, [{ currency: "INR", value: 1200 }]);
      assert.equal(s.ads!.spend.skippedUnknownCurrency, 1);
    });
    await t("ads snapshot: buckets, approvals only for approvers and never for your own launch above the second-approver rule", async () => {
      const mgr = (await dash.loadAdsSnapshot(ctxFor(only("VIEW_CAMPAIGNS", "APPROVE_AD_SPEND"))))!;
      assert.equal(mgr.buckets.running, 2); // l1, l4
      assert.equal(mgr.buckets.paused, 1);
      assert.equal(mgr.buckets.issue, 1);
      assert.ok(mgr.approvals.some((a) => a.launchId === "l1"));
      assert.ok(mgr.approvals.every((a) => a.launchId !== "l4" || a.mine));
      const viewer = (await dash.loadAdsSnapshot(ctxFor(only("VIEW_CAMPAIGNS"))))!;
      assert.deepEqual(viewer.approvals, []);
      assert.equal(viewer.top.find((x) => x.launchId === "l1")!.spend, 1200);
    });
    await t("attention: rejected ad is critical and links to the campaign", async () => {
      const a = await dash.loadAttention(ctxFor(only("VIEW_CAMPAIGNS")));
      const x = a.find((i) => i.id === "ads.issue.l3")!;
      assert.equal(x.severity, "critical");
      assert.equal(x.href, "/viralpulse-ai/campaigns/c-l3");
    });

    // studios
    const media = await (await import("../src/lib/products/viralpulse-ai/media")).mediaCollection();
    const M = (id: string, over: Record<string, unknown>) => ({ _id: id, kind: "image", name: id, source: "ai", deletedAt: null, thumbKey: "k", createdAt: new Date("2026-11-02T00:00:00Z"), ...over }) as never;
    await media.insertMany([M("m1", {}), M("m2", { createdAt: new Date("2026-10-02T00:00:00Z") }), M("m3", { source: "upload" }), M("m4", { deletedAt: new Date() }), M("m5", { kind: "video" })]);
    const ugc = await (await import("../src/lib/products/viralpulse-ai/ugc/store")).projectsCollection();
    const U = (id: string, status: string, over: Record<string, unknown> = {}) => ({ _id: id, title: id, status, deletedAt: null, updatedAt: new Date("2026-11-02T00:00:00Z"), plan: { scenes: [{}, {}, {}] }, sceneMedia: {}, render: null, ...over }) as never;
    await ugc.insertMany([U("v1", "ready", { render: { mediaId: "vm1", thumbnailId: "vt1" } }), U("v2", "generating", { sceneMedia: { "0": "a" } }), U("v3", "draft"), U("v4", "ready", { kind: "style-sample" }), U("v5", "ready", { deletedAt: new Date() })]);
    await t("images this month count only live AI images in the month; delta vs same days last month", async () => {
      const s = await dash.loadStats(ctxFor(only("MANAGE_MEDIA")));
      assert.equal(s.images!.month, 1);
      assert.equal(s.images!.deltaPct, 0); // 1 vs 1 (2 Oct)
      assert.equal(s.ugc, null);
    });
    await t("ugc counts exclude drafts, style samples and deleted; studio lists show progress from real clips", async () => {
      const s = await dash.loadStats(ctxFor(only("GENERATE_AI_CONTENT")));
      assert.deepEqual(s.ugc, { ready: 1, generating: 1 });
      const st = (await dash.loadStudios(ctxFor(only("GENERATE_AI_CONTENT"))))!;
      assert.deepEqual(st.images!.map((i) => i.id).sort(), ["m1", "m2"]);
      const gen = st.videos!.find((v) => v.id === "v2")!;
      assert.deepEqual([gen.scenesDone, gen.scenesTotal, gen.mediaId], [1, 3, null]);
      assert.deepEqual(st.videos!.map((v) => v.id).sort(), ["v1", "v2"]);
      const imgOnly = (await dash.loadStudios(ctxFor(only("MANAGE_MEDIA"))))!;
      assert.equal(imgOnly.videos, null);
    });

    // activity
    await (await smmsCollection<{ _id: string }>(COLLECTIONS.audit)).insertMany(Array.from({ length: 12 }, (_, i) => ({ _id: `au${i}`, actorId: "u", actorEmail: `u${i}@x.in`, action: "create", entity: "post", entityId: `p${i}`, entityLabel: `Post ${i}`, recordId: null, summary: null, metadata: null, createdAt: new Date(2026, 10, 1, 10, i) })) as never[]);
    await t("activity: last 10, newest first, only with audit permission", async () => {
      const a = (await dash.loadActivity(ctxFor(only("VIEW_AUDIT_LOG"))))!;
      assert.equal(a.rows.length, 10);
      assert.equal(a.rows[0].id, "au11");
      assert.equal(a.rows[0].what, "Created");
      assert.equal(await dash.loadActivity(ctxFor(only("VIEW_CAMPAIGNS"))), null);
    });

    await t("setup: limits and brand reflect stored data; ai item follows health", async () => {
      const settings = await smmsCollection<{ _id: string }>(COLLECTIONS.settings);
      const base = await dash.loadSetup(ctxFor(all, { health: async () => ({ checkedAt: "", status: "ok", attentionCount: 0, groups: [{ id: "ai", title: "", status: "ok", items: [{ id: "openai.text", label: "", status: "ok", detail: "", fix: null }] }] }) }));
      assert.equal(base.items.find((i) => i.key === "ai")!.done, true);
      assert.equal(base.items.find((i) => i.key === "post")!.done, true);
      assert.equal(base.items.find((i) => i.key === "campaign")!.done, false);
      assert.equal(base.items.find((i) => i.key === "limits")!.done, false);
      await settings.insertOne({ _id: "ads-guard", perCurrency: { INR: { maxDailyPerLaunchMinor: 100000 } } } as never);
      await settings.insertOne({ _id: "publishing", timezone: "Asia/Kolkata" } as never);
      await settings.updateOne({ _id: "main" } as never, { $set: { imageKit: { voice: "Warm and direct" } } }, { upsert: true });
      const bad = await dash.loadSetup(ctxFor(all, { health: async () => ({ checkedAt: "", status: "attention", attentionCount: 1, groups: [{ id: "ai", title: "", status: "attention", items: [{ id: "openai.key", label: "", status: "attention", detail: "OpenAI isn't connected", fix: "x" }] }] }) }));
      assert.equal(bad.items.find((i) => i.key === "limits")!.done, true);
      assert.equal(bad.items.find((i) => i.key === "publishing")!.done, true);
      assert.equal(bad.items.find((i) => i.key === "brand")!.done, true);
      const ai = bad.items.find((i) => i.key === "ai")!;
      assert.equal(ai.done, false);
      assert.match(ai.detail, /OpenAI isn't connected/);
    });
    await t("attention for settings viewers uses health; setup-state findings are left to the checklist", async () => {
      const health = async () => ({ checkedAt: "", status: "attention" as const, attentionCount: 3, groups: [{ id: "connections" as const, title: "", status: "attention" as const, items: [
        { id: "conn.x", label: "X", status: "attention" as const, detail: "The app credentials aren't set up yet.", fix: "Add" },
        { id: "account.9", label: "Instagram: z", status: "attention" as const, detail: "The login expired on 2026-10-01; posts to it will fail.", fix: "Press Reconnect" },
        { id: "cron.viralpulse-publisher", label: "Scheduled posts", status: "attention" as const, detail: "Paused.", fix: "Resume" },
      ] }] });
      const a = await dash.loadAttention(ctxFor(only("MANAGE_INTEGRATIONS"), { health }));
      assert.deepEqual(a.map((x) => x.id), ["account.9", "cron.viralpulse-publisher"]);
    });
  });

  await runAsCompany("co_dash_2", async () => {
    await t("tenancy: another company sees none of company 1's data", async () => {
      const c = ctxFor(all);
      const s = await dash.loadStats(c);
      assert.equal(s.posts!.publishedMonth, 0);
      assert.equal(s.posts!.scheduled, 0);
      assert.equal(s.ads!.running, 0);
      assert.equal(s.ads!.spend.rows, 0);
      assert.equal(s.images!.month, 0);
      assert.deepEqual(s.ugc, { ready: 0, generating: 0 });
      assert.deepEqual((await dash.loadSchedule(c))!.rows, []);
      assert.deepEqual((await dash.loadActivity(c))!.rows, []);
      assert.deepEqual((await dash.loadStudios(c))!.images, []);
      assert.deepEqual(await dash.loadAttention(ctxFor(all, { health: async () => null })), []);
    });
  });

  console.log(`viralpulse dashboard: ${pass} passed, ${fail} failed`);
  const client = await MongoClient.connect(uri);
  const names = (await client.db().admin().listDatabases()).databases.map((d) => d.name).filter((n) => /zz_throwaway/.test(n) && (n === dbName || n.includes("co_dash")));
  for (const n of names) await client.db(n).dropDatabase();
  await client.close();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
