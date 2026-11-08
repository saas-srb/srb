/**
 * ViralPulse review-fix regression tests. One block per finding of the independent review: two companies sharing external ids, AI media
 * without provenance, a per-post disclosure override, the kill switch, spend-cap races, approval rules, Image Studio consent, legacy
 * upload paths, approval withdrawal, metrics keys / currency / rate denominator. Everything is a fake: no provider, no network.
 * Database: a THROWAWAY MongoDB only (asserted, then dropped).
 * Run: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_vpfix npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-viralpulse-fixes.ts
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "";
const dbName = uri.split("?")[0].split("/").pop() ?? "";
assert.ok(/zz_throwaway/.test(dbName), "refusing to run: MONGODB_URI must be a zz_throwaway_* database");
assert.ok(!/\.env\.local/.test(uri));
process.env.PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.SMMS_ENCRYPTION_KEY;

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
const rejects = async (fn: () => Promise<unknown>, test: (e: unknown) => boolean, msg: string) => {
  try {
    await fn();
  } catch (e) {
    assert.ok(test(e), `${msg}: unexpected error ${(e as Error)?.message}`);
    return;
  }
  assert.fail(`${msg}: expected a rejection`);
};
const src = (rel: string) => readFileSync(path.join(__dirname, "..", rel), "utf8");

const A = "co_fix_a";
const B = "co_fix_b";

async function main() {
  const { runAsCompany } = await import("../src/lib/platform/tenancy/context");
  const { smmsCollection, COLLECTIONS } = await import("../src/lib/products/viralpulse-ai/db");
  const { encryptSecret } = await import("../src/lib/products/viralpulse-ai/crypto");

  // ── #2 tenancy: two companies that connect the same Page / channel / ad account ──
  await t("metrics settings: two companies each save their own row (no shared fixed _id)", async () => {
    const { getMetricsSettings, saveMetricsSettings } = await import("../src/lib/products/viralpulse-ai/metrics/store");
    await runAsCompany(A, () => saveMetricsSettings({ retentionDays: 120 }, "ua"));
    await runAsCompany(B, () => saveMetricsSettings({ retentionDays: 400 }, "ub"));
    await runAsCompany(A, () => saveMetricsSettings({ retentionDays: 130 }, "ua"));
    assert.equal((await runAsCompany(A, () => getMetricsSettings())).retentionDays, 130);
    assert.equal((await runAsCompany(B, () => getMetricsSettings())).retentionDays, 400);
  });
  await t("metrics housekeeping marker: one per company, both written, not shown as an account", async () => {
    const { runMetricsSync } = await import("../src/lib/products/viralpulse-ai/metrics/sync");
    const { syncCol } = await import("../src/lib/products/viralpulse-ai/metrics/store");
    const deps = { now: () => new Date("2026-11-10T09:00:00Z"), sleep: async () => {}, fetch: (async () => new Response("{}")) as typeof fetch, listAccounts: async () => [], withToken: async (_a: string, fn: (t: string) => Promise<unknown>) => fn("x"), loadPosts: async () => [], loadAttempts: async () => [], notify: async () => {}, linkedinVersion: async () => "202601" };
    await runAsCompany(A, () => runMetricsSync(deps as never));
    await runAsCompany(B, () => runMetricsSync(deps as never));
    for (const co of [A, B]) {
      const rows = await runAsCompany(co, async () => (await syncCol()).find({ accountId: "__housekeeping" }).toArray());
      assert.equal(rows.length, 1, `${co} has its marker`);
    }
  });
  await t("metric + ad snapshots: the same Page / ad account id in two companies gives each its own rows", async () => {
    const { writeRows } = await import("../src/lib/products/viralpulse-ai/metrics/store");
    const { snapshotsCollection, upsertSnapshots } = await import("../src/lib/products/viralpulse-ai/ads-platforms/snapshots");
    const at = new Date("2026-11-10T09:00:00Z");
    const row = { platform: "facebook" as const, externalId: "PAGE1", level: "account" as const, metric: "reach", value: 10, date: "2026-11-09", accountId: "acc" };
    await runAsCompany(A, () => writeRows([row], at, 365));
    await runAsCompany(B, () => writeRows([{ ...row, value: 99 }], at, 365));
    const snap = { platform: "meta", externalId: "act_1", level: "campaign" as const, metric: "spend", value: 5, date: "2026-11-09", source: "meta_ads_insights" };
    await runAsCompany(A, () => upsertSnapshots([snap], at));
    await runAsCompany(B, () => upsertSnapshots([{ ...snap, value: 7 }], at));
    for (const [co, reach, spend] of [[A, 10, 5], [B, 99, 7]] as const) {
      const rows = await runAsCompany(co, async () => (await snapshotsCollection()).find({}).toArray());
      assert.equal(rows.find((r) => r.metric === "reach")?.value, reach, `${co} reach`);
      assert.equal(rows.find((r) => r.metric === "spend")?.value, spend, `${co} spend`);
    }
  });
  await t("legacy connection migration: two companies with the same Page both migrate; errors are not swallowed; idempotent", async () => {
    const { ensureMigrated, resetMigrationCacheForTests, accountsCol, connectionsCol } = await import("../src/lib/products/viralpulse-ai/accounts/store");
    const errors: unknown[][] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => void errors.push(a);
    try {
      for (const co of [A, B]) {
        await runAsCompany(co, async () => {
          await (await smmsCollection(COLLECTIONS.integrations)).insertOne({
            _id: "meta", status: "connected", accountName: `Owner ${co}`, accessEnc: encryptSecret("tok", "meta:access"), refreshEnc: null, expiresAt: null, scopes: [],
            targets: { facebookPages: [{ id: "PAGE1", name: "Shared Page", tokenEnc: encryptSecret("pt", "meta:page:PAGE1") }], instagramAccounts: [], youtubeChannels: [], gbpLocations: [], linkedinAuthors: [] },
            selected: { facebook: "PAGE1" }, lastError: null, connectedBy: "u", connectedAt: new Date(), updatedAt: new Date(),
          } as never);
        });
      }
      for (let round = 0; round < 2; round++) {
        resetMigrationCacheForTests();
        for (const co of [A, B]) await runAsCompany(co, () => ensureMigrated());
      }
      for (const co of [A, B]) {
        const [c, a] = await runAsCompany(co, async () => [await (await connectionsCol()).find({}).toArray(), await (await accountsCol()).find({}).toArray()] as const);
        assert.equal(c.length, 1, `${co} connection`);
        assert.equal(a.length, 1, `${co} account`);
        assert.equal(a[0].externalId, "PAGE1");
        assert.equal(a[0].connectionId, c[0]._id);
      }
      assert.equal(errors.length, 0, `no migration error was logged: ${JSON.stringify(errors).slice(0, 200)}`);
    } finally {
      console.error = orig;
    }
  });

  // ── #3 / #8 AI media always disclosed; a per-post switch never relaxes it ──
  await t("AI media without provenance: read as AI generated, backfilled, and the disclosure suffix + native flag apply", async () => {
    const media = await import("../src/lib/products/viralpulse-ai/media");
    const { factsOf } = await import("../src/lib/products/viralpulse-ai/publishers/media-facts");
    const { disclosureFor_ } = await import("../src/lib/products/viralpulse-ai/publishers/validate");
    await runAsCompany(B, async () => {
      const raw = await smmsCollection<never>(COLLECTIONS.media);
      const base = { kind: "image", name: "old ai", description: "", altText: "", tags: [], platform: null, storageKey: "smms/ai/legacy.png", contentType: "image/png", size: 1, width: 10, height: 10, durationSec: null, source: "ai", creativePrompt: "", thumbnailId: null, script: "", caption: "", versions: [], createdAt: new Date(), updatedAt: new Date(), createdBy: "u", updatedBy: "u", deletedAt: null };
      await raw.insertOne({ _id: "legacy_ai", ...base } as never);
      await raw.insertOne({ _id: "plain_upload", ...base, source: "upload", name: "photo" } as never);
      const doc = (await media.getMedia("legacy_ai"))!;
      assert.equal(doc.ai?.aiGenerated, true, "read-side backfill");
      assert.equal(media.isAiMedia(doc), true);
      const f = factsOf(doc);
      assert.equal(f.aiGenerated, true);
      assert.equal(f.aiDisclosureRequired, true);
      const d = disclosureFor_("instagram", { nativeAiLabel: true }, [f], {});
      assert.equal(d.mode, "suffix");
      assert.equal(d.nativeFlag, true);
      assert.ok(d.suffix.length > 0);
      const up = factsOf((await media.getMedia("plain_upload"))!);
      assert.equal(up.aiGenerated, false);
      assert.equal(disclosureFor_("instagram", { nativeAiLabel: true }, [up], {}).required, false);
      // The mediaCollection() pass persists the provenance for rows saved without it.
      await media.mediaCollection();
      const stored = await raw.findOne({ _id: "legacy_ai" } as never);
      assert.equal((stored as unknown as { ai?: { aiGenerated?: boolean } }).ai?.aiGenerated, true, "persisted");
      assert.equal(media.toMediaCard(doc).aiDisclosed, true);
    });
    assert.match(src("src/lib/products/viralpulse-ai/generate.ts"), /saveAiImage\([\s\S]{0,400}ai: \{ aiGenerated: true/, "generateImageToLibrary passes provenance");
  });
  await t("per-post aiDisclosureOff is ignored; only the company setting relaxes the disclosure", async () => {
    const { buildPublishPost } = await import("../src/lib/products/viralpulse-ai/publishers/engine-deps");
    const { stripPostDisclosureOverride } = await import("../src/lib/products/viralpulse-ai/publishers/types");
    const post = { _id: "p1", title: "T", link: null, language: "en", publishOptions: { aiDisclosureOff: true }, variants: [{ platform: "linkedin", title: "", content: "Hello world", caption: "", cta: "", hashtags: [], keywords: [], publish: {} }] } as never;
    const img = { id: "m", kind: "image" as const, name: "n", contentType: "image/png", size: 1, width: 1, height: 1, durationSec: null, altText: "", aiGenerated: true, aiDisclosureRequired: true };
    const viaPost = buildPublishPost(post, "linkedin", { images: [img], video: null }, false)!;
    assert.equal(viaPost.disclosure.mode, "suffix", "post-level switch ignored");
    assert.ok(viaPost.post.caption.length > "Hello world".length, "suffix is in the caption");
    const viaCompany = buildPublishPost(post, "linkedin", { images: [img], video: null }, true)!;
    assert.equal(viaCompany.disclosure.mode, "off", "company setting still relaxes it");
    assert.deepEqual(stripPostDisclosureOverride({ aiDisclosureOff: true, nativeSchedule: true }), { nativeSchedule: true });
  });

  // ── #4 / #5 / #6 ads: kill switch, races, approvals ──
  const { SMMS_ROLE_PERMISSIONS } = await import("../src/lib/smms-roles");
  const guardMod = await import("../src/lib/products/viralpulse-ai/ads-platforms/guard");
  const L = await import("../src/lib/products/viralpulse-ai/ads-platforms/launches");
  const { runAdsSync } = await import("../src/lib/products/viralpulse-ai/ads-platforms/ads-sync");
  const { ForbiddenError } = await import("../src/lib/products/viralpulse-ai/viewer");
  const viewer = (id: string, role: string) => ({ userId: id, email: `${id}@x.test`, roles: [role], ctx: { roles: [role], permissionOverrides: {} } }) as never;
  const manager = viewer("u_mgr", "smms_manager");
  const specialist = viewer("u_spec", "smms_specialist");

  class FakeMeta {
    status = new Map<string, string>();
    failPost = new Set<string>();
    posts: { id: string; body: Record<string, unknown> }[] = [];
    calls = 0;
    lastUsage = null;
    async get(p: string, params: Record<string, unknown> = {}) {
      if (p === "") {
        const out: Record<string, unknown> = {};
        for (const id of String(params.ids).split(",")) if (this.status.has(id)) out[id] = { id, status: this.status.get(id), effective_status: this.status.get(id) };
        return out;
      }
      if (/^act_/.test(p)) return { id: p, name: "Main", account_status: 1, currency: "INR" };
      return {};
    }
    async getAll() {
      return [];
    }
    async post(id: string, body: Record<string, unknown>) {
      await new Promise((r) => setTimeout(r, 15));
      if (this.failPost.has(id)) throw new Error("Meta said no");
      this.posts.push({ id, body });
      if (typeof body.status === "string") this.status.set(id, body.status);
      return {};
    }
  }
  const mkDeps = (f: FakeMeta, notes: string[] = []) =>
    ({
      withMeta: async (_a: string, fn: (c: never, a: never) => Promise<unknown>) => fn(f as never, { id: "acct", externalId: "1", name: "n", provider: "meta", meta: {}, enabled: true, status: "healthy" } as never),
      getAccount: async () => null,
      getMedia: async () => [],
      byteSource: () => ({ size: 0, open: async () => new ReadableStream() }),
      now: () => new Date(),
      sleep: async (ms: number) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
      notify: async (n: { title: string }) => void notes.push(n.title),
      audit: async () => {},
    }) as never;
  let seq = 0;
  const launch = (over: Record<string, unknown> = {}) => {
    const n = ++seq;
    return {
      _id: `L${n}`, platform: "meta", campaignId: `C${n}`, active: true, state: "ready", delivery: "paused", adAccountId: "acct", actId: "act_1", pageAccountId: "p", pageId: "p", instagramUserId: null, currency: "INR",
      draftHash: `h${n}`, idempotencyKey: `k${n}`, campaign: { adSets: [] }, campaignName: `Campaign ${n}`, ads: [], commitment: { dailyMinor: 100000, totalMinor: 1_000_000, monthlyMinor: 1_000_000 },
      objects: { campaign: `meta_c${n}`, adSets: { s1: `meta_s${n}` }, creatives: {}, ads: { a1: `meta_a${n}` }, images: {}, videos: {} }, pending: null,
      approval: { by: "u_mgr", byEmail: null, at: new Date(), note: "", committedDailyMinor: 100000, committedTotalMinor: 1_000_000, currency: "INR", secondApproverRequired: true },
      lock: null, lastError: null, compensation: null, attempts: 1, review: {}, externalStatus: null, lastSyncAt: null, syncDeferredUntil: null, events: [], createdBy: "u_creator", createdAt: new Date(), updatedAt: new Date(), activatedBy: null, activatedAt: null,
      ...over,
    };
  };
  const seed = async (docs: ReturnType<typeof launch>[]) => {
    const col = await L.launchesCollection();
    await col.deleteMany({});
    if (docs.length) await col.insertMany(docs as never);
  };

  await runAsCompany(A, async () => {
    await t("roles: MANAGE_AD_LIMITS exists, admins have it, managers (who approve spend) do not", () => {
      assert.ok(SMMS_ROLE_PERMISSIONS.smms_admin.includes("MANAGE_AD_LIMITS"));
      assert.ok(!SMMS_ROLE_PERMISSIONS.smms_manager.includes("MANAGE_AD_LIMITS"));
      assert.ok(SMMS_ROLE_PERMISSIONS.smms_manager.includes("APPROVE_AD_SPEND"));
    });
    await t("money in the currency's own decimals (JPY has none)", () => {
      assert.equal(guardMod.formatMinorPlain(1500, "JPY"), "1,500 JPY");
      assert.equal(guardMod.formatMinorPlain(150050, "USD"), "1,500.50 USD");
      const v = guardMod.evaluateGuard({ ...guardMod.defaultGuard(), perCurrency: { JPY: { maxDailyPerLaunchMinor: 1000, maxTotalPerLaunchMinor: null, companyDailyCapMinor: null, companyMonthlyCapMinor: null, approvalThresholdMinor: null } } }, "JPY", { dailyMinor: 5000, totalMinor: null, monthlyMinor: 5000 }, []);
      assert.ok(v.reasons.some((r) => r.includes("5,000 JPY")) && !v.reasons.some((r) => r.includes("50 JPY")), v.reasons.join("|"));
    });

    await t("approvals: with no threshold set any spend needs a different approver; a threshold or an explicit switch-off relaxes it", () => {
      const g = guardMod.defaultGuard();
      const caps = { maxDailyPerLaunchMinor: null, maxTotalPerLaunchMinor: null, companyDailyCapMinor: null, companyMonthlyCapMinor: null, approvalThresholdMinor: null };
      const small = { dailyMinor: 100, totalMinor: 1000, monthlyMinor: 1000 };
      assert.equal(guardMod.evaluateGuard({ ...g, allowUncapped: true }, "INR", small, []).needsSecondApprover, true, "default: yes");
      assert.equal(guardMod.evaluateGuard({ ...g, perCurrency: { INR: { ...caps, approvalThresholdMinor: 5000 } } }, "INR", small, []).needsSecondApprover, false, "below an explicit threshold");
      assert.equal(guardMod.evaluateGuard({ ...g, allowUncapped: true, requireSecondApprover: false }, "INR", small, []).needsSecondApprover, false, "explicitly off");
    });
    await t("approveLaunch: the creator cannot approve their own launch by default", async () => {
      await guardMod.saveGuard({ perCurrency: { INR: { maxDailyPerLaunchMinor: 500000, maxTotalPerLaunchMinor: 9_000_000, companyDailyCapMinor: 200000, companyMonthlyCapMinor: 9_000_000 } } }, "u_adm");
      const f = new FakeMeta();
      const mine = launch({ approval: null, createdBy: "u_mgr" });
      const theirs = launch({ approval: null, createdBy: "u_creator" });
      await seed([mine, theirs]);
      await rejects(() => L.approveLaunch(mine._id, manager, {}, mkDeps(f)), (e) => e instanceof L.LaunchBlockedError && /someone other/i.test((e as Error).message), "self approval");
      const ok = await L.approveLaunch(theirs._id, manager, {}, mkDeps(f));
      assert.equal(ok.approval?.by, "u_mgr");
    });
    await t("activateLaunch re-checks the second-approver rule against the CURRENT rules", async () => {
      const f = new FakeMeta();
      const self = launch({ createdBy: "u_mgr", approval: { by: "u_mgr", byEmail: null, at: new Date(), note: "", committedDailyMinor: 100000, committedTotalMinor: 1_000_000, currency: "INR", secondApproverRequired: false } });
      await seed([self]);
      await rejects(() => L.activateLaunch(self._id, manager, mkDeps(f)), (e) => e instanceof L.ApprovalRequiredError && /other than/i.test((e as Error).message), "stale self-approval");
      assert.equal(f.posts.length, 0, "nothing reached Meta");
      await guardMod.saveGuard({ requireSecondApprover: false }, "u_adm");
      const r = await L.activateLaunch(self._id, manager, mkDeps(f));
      assert.equal(r.delivery, "active");
      await guardMod.saveGuard({ requireSecondApprover: true }, "u_adm");
    });

    await t("spend race: two concurrent activations cannot both fit the company daily cap", async () => {
      // Cap 200000 vs 125000 (100000 x 1.25 overshoot) per launch: one fits, two do not.
      await guardMod.saveGuard({ perCurrency: { INR: { maxDailyPerLaunchMinor: 500000, maxTotalPerLaunchMinor: 9_000_000, companyDailyCapMinor: 200000, companyMonthlyCapMinor: 90_000_000 } } }, "u_adm");
      const f = new FakeMeta();
      const a = launch();
      const b = launch();
      await seed([a, b]);
      const deps = mkDeps(f);
      const res = await Promise.allSettled([L.activateLaunch(a._id, manager, deps), L.activateLaunch(b._id, manager, deps)]);
      assert.equal(res.filter((r) => r.status === "fulfilled").length, 1, JSON.stringify(res.map((r) => r.status)));
      const bad = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
      assert.ok(bad.reason instanceof L.LaunchBlockedError, String(bad.reason));
      assert.equal([a, b].filter((l) => f.status.get(l.objects.campaign) === "ACTIVE").length, 1, "only one campaign switched on in Meta");
      const col = await L.launchesCollection();
      assert.equal(await col.countDocuments({ delivery: "active" }), 1);
    });

    await t("kill switch ON pauses recorded-active, Meta-active-but-recorded-paused and unverified launches, one result each", async () => {
      await guardMod.saveGuard({ perCurrency: { INR: { maxDailyPerLaunchMinor: 500000, companyDailyCapMinor: 90_000_000 } } }, "u_adm");
      const f = new FakeMeta();
      const recorded = launch({ delivery: "active" });
      const metaSeen = launch({ externalStatus: { campaign: "ACTIVE", at: new Date() } });
      const liveOnly = launch();
      const quiet = launch();
      const broken = launch({ delivery: "active" });
      for (const l of [recorded, metaSeen, broken]) f.status.set(l.objects.campaign, "ACTIVE");
      f.status.set(liveOnly.objects.campaign, "ACTIVE"); // the DB says paused, Meta says active
      f.status.set(quiet.objects.campaign, "PAUSED");
      f.failPost.add(broken.objects.campaign);
      await seed([recorded, metaSeen, liveOnly, quiet, broken]);
      const notes: string[] = [];
      const out = await L.engageKillSwitch(manager, mkDeps(f, notes));
      assert.equal(out.guard.killSwitch, true);
      assert.equal(out.results.length, 4, "the already-paused launch is left alone");
      const by = new Map(out.results.map((r) => [r.launchId, r]));
      assert.deepEqual([by.get(recorded._id)?.found, by.get(metaSeen._id)?.found, by.get(liveOnly._id)?.found], ["recorded_active", "meta_active", "live_read"]);
      assert.equal(by.get(broken._id)?.ok, false);
      assert.equal(out.failed, 1);
      assert.equal(out.paused, 3);
      for (const l of [recorded, metaSeen, liveOnly]) assert.equal(f.status.get(l.objects.campaign), "PAUSED", "paused in Meta");
      const col = await L.launchesCollection();
      assert.equal((await col.findOne({ _id: liveOnly._id }))!.delivery, "paused");
      assert.ok((await col.findOne({ _id: broken._id }))!.events.some((e) => e.type === "pause_failed"), "the failure is recorded on the launch");
      assert.ok(notes.some((n) => /could not be paused/.test(n)), notes.join("|"));
      await rejects(() => L.pauseAllRunning(specialist, mkDeps(f)), (e) => e instanceof ForbiddenError, "permission");
    });
    await t("ads sync PAUSES a campaign that runs in Meta while the kill switch is on, and retries a failed pause", async () => {
      const f = new FakeMeta();
      const l = launch({ delivery: "active" });
      f.status.set(l.objects.campaign, "ACTIVE");
      await seed([l]);
      const notes: string[] = [];
      const run1 = await runAdsSync(mkDeps(f, notes));
      assert.equal(run1.errors.length, 0, JSON.stringify(run1.errors));
      assert.equal(f.status.get(l.objects.campaign), "PAUSED");
      assert.equal((await (await L.launchesCollection()).findOne({ _id: l._id }))!.delivery, "paused");
      // A pause that fails is reported and tried again on the very next run (no minimum gap while the switch is on).
      f.status.set(l.objects.campaign, "ACTIVE");
      f.failPost.add(l.objects.campaign);
      const run2 = await runAdsSync(mkDeps(f, notes));
      assert.equal(run2.errors.length, 1);
      f.failPost.clear();
      const run3 = await runAdsSync(mkDeps(f, notes));
      assert.equal(run3.errors.length, 0);
      assert.equal(f.status.get(l.objects.campaign), "PAUSED");
    });
    await t("ads sync pauses an unapproved campaign found ACTIVE in Meta, but leaves an approved one alone", async () => {
      const g = await guardMod.getGuard();
      assert.equal(g.killSwitch, true);
      await guardMod.setKillSwitch(false, "u_adm");
      const f = new FakeMeta();
      const unapproved = launch({ approval: null });
      const approved = launch();
      f.status.set(unapproved.objects.campaign, "ACTIVE");
      f.status.set(approved.objects.campaign, "ACTIVE");
      await seed([unapproved, approved]);
      await runAdsSync(mkDeps(f));
      assert.equal(f.status.get(unapproved.objects.campaign), "PAUSED", "unapproved spend is stopped");
      assert.equal(f.status.get(approved.objects.campaign), "ACTIVE", "approved budget is not touched");
    });
  });

  // ── #5 Image Studio daily cap under concurrency ──
  await t("Image Studio: two concurrent generations cannot both spend the last of the daily cap", async () => {
    const sharp = (await import("sharp")).default;
    const { createEngine } = await import("../src/lib/products/viralpulse-ai/images/engine");
    const { getImageSettings, saveImageSettings, getBrandKit, getProject } = await import("../src/lib/products/viralpulse-ai/images/store");
    const { DEFAULT_IMAGE_SETTINGS } = await import("../src/lib/products/viralpulse-ai/images/limits");
    const png = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#345" } }).png().toBuffer();
    const blobs = new Map<string, Buffer>();
    const provider = {
      id: "openai" as const,
      async generate(req: { n: number; model: string }) {
        await new Promise((r) => setTimeout(r, 40));
        return { images: Array.from({ length: req.n }, () => png), usage: null, model: req.model };
      },
      async edit(req: { n: number; model: string }) {
        return this.generate(req);
      },
    };
    const deps = {
      now: () => new Date(), settings: getImageSettings, openAiPricing: async () => ({ overrides: null, flatUsd: 0 }),
      resolveProvider: async () => ({ provider, model: "gpt-image-2.5-flare" }),
      putBlob: async (key: string, data: Buffer) => (blobs.set(key, data), key), getBlob: async (key: string) => blobs.get(key) ?? null, readMedia: async () => null,
      saveExport: async () => ({ _id: "m" }), audit: async () => {}, notify: async () => {}, managerIds: async () => [], kit: getBrandKit, storagePrefix: async () => "smms/test/studio",
    };
    await runAsCompany(A, async () => {
      await saveImageSettings({ ...DEFAULT_IMAGE_SETTINGS, dailySpendCapUsd: 100, approvalThresholdUsd: 100, perUserPerMinute: 60 }, "admin");
      const eng = createEngine(deps as never);
      const actor = (id: string) => ({ userId: id, email: `${id}@x.test`, canApprove: false });
      const brief = { goalId: "organic_post", subject: "A tailor measuring fabric in a bright, tidy shop", product: "Custom tailoring", style: "warm light", overlayText: ["Festive offers"], variants: 1 };
      const p0 = await eng.createProject(actor("u0"), brief);
      assert.equal((await eng.generate(actor("u0"), p0._id)).outcome, "done");
      const unit = (await getProject(p0._id))!.totalCostUsd;
      assert.ok(unit > 0);
      // Today's spend is `unit`; leave room for exactly one more.
      await saveImageSettings({ ...DEFAULT_IMAGE_SETTINGS, dailySpendCapUsd: unit * 2.5, approvalThresholdUsd: 100, perUserPerMinute: 60 }, "admin");
      const p1 = await eng.createProject(actor("u1"), brief);
      const p2 = await eng.createProject(actor("u2"), brief);
      const res = await Promise.allSettled([eng.generate(actor("u1"), p1._id), eng.generate(actor("u2"), p2._id)]);
      assert.equal(res.filter((r) => r.status === "fulfilled").length, 1, JSON.stringify(res.map((r) => (r.status === "rejected" ? String(r.reason) : r.status))));
      const bad = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
      assert.match(String(bad.reason?.message ?? bad.reason), /limit|passed/i);
    });
  });

  // ── #7 Image Studio consent from the server ──
  await t("Image Studio consent: who / when come from the server, never from the browser; cleared when not attested", async () => {
    const { cleanBrief } = await import("../src/lib/products/viralpulse-ai/images/engine");
    const { DEFAULT_IMAGE_SETTINGS } = await import("../src/lib/products/viralpulse-ai/images/limits");
    const base = { goalId: "organic_post", subject: "A tailor measuring fabric in a shop", overlayText: ["Hi"] };
    const stamp = { by: "real@x.test", at: "2026-11-02T10:00:00.000Z" };
    const forged = { attested: true, showsPeople: true, publicFigure: false, at: "1999-01-01T00:00:00.000Z", by: "attacker@evil.test" };
    const b1 = cleanBrief({ ...base, consent: forged }, DEFAULT_IMAGE_SETTINGS, undefined, stamp);
    assert.deepEqual([b1.consent?.by, b1.consent?.at], [stamp.by, stamp.at]);
    // Saving again with the same attestation keeps the original record; a change re-stamps it.
    const b2 = cleanBrief({ ...base, consent: forged }, DEFAULT_IMAGE_SETTINGS, b1, { by: "later@x.test", at: "2027-01-01T00:00:00.000Z" });
    assert.deepEqual([b2.consent?.by, b2.consent?.at], [stamp.by, stamp.at]);
    const b3 = cleanBrief({ ...base, consent: { ...forged, showsPeople: false } }, DEFAULT_IMAGE_SETTINGS, b1, { by: "later@x.test", at: "2027-01-01T00:00:00.000Z" });
    assert.equal(b3.consent?.by, "later@x.test");
    const b4 = cleanBrief({ ...base, consent: { ...forged, attested: false } }, DEFAULT_IMAGE_SETTINGS, b1, stamp);
    assert.deepEqual([b4.consent?.by, b4.consent?.at], [null, null]);
    assert.match(src("src/lib/products/viralpulse-ai/images/engine.ts"), /consentRecorded: !!\(b\.consent\?\.attested && b\.consent\.showsPeople\)/);
    assert.ok(!/by: v\.email/.test(src("src/app/(products)/viralpulse-ai/(protected)/image-studio/actions.ts")), "the action no longer stamps consent from the client payload");
  });

  // ── #9 / #11 approvals ──
  await t("withdrawApprovalForMedia: a scheduled, approved post that uses replaced media loses its approval and its queue claim", async () => {
    const { postsCollection, EMPTY_PUBLISH } = await import("../src/lib/products/viralpulse-ai/posts");
    const { withdrawApprovalForMedia } = await import("../src/lib/products/viralpulse-ai/publishing");
    await runAsCompany(A, async () => {
      const col = await postsCollection();
      const mk = (id: string, over: Record<string, unknown>) => ({ _id: id, title: id, status: "scheduled", mediaIds: ["m1"], thumbnailId: null, variants: [{ platform: "linkedin", publish: EMPTY_PUBLISH }], approvedBy: "u_mgr", approvedAt: new Date(), publishQueuedAt: new Date(), createdBy: null, deletedAt: null, ...over });
      await col.insertMany([mk("w1", {}), mk("w2", { mediaIds: ["other"] }), mk("w3", { status: "draft", approvedBy: null, publishQueuedAt: null })] as never);
      const hit = await withdrawApprovalForMedia("m1", { userId: "u_edit", email: null }, "an attached picture was replaced");
      assert.deepEqual(hit, ["w1"]);
      const w1 = (await col.findOne({ _id: "w1" } as never))!;
      assert.equal(w1.approvedBy, null);
      assert.equal(w1.publishQueuedAt, null);
      assert.equal((await col.findOne({ _id: "w2" } as never))!.approvedBy, "u_mgr", "other posts untouched");
    });
    const actions = src("src/app/(products)/viralpulse-ai/(protected)/actions.ts");
    assert.match(actions, /replaceMediaFile\([\s\S]{0,120}\n\s*await withdrawApprovalForMedia/, "replace path withdraws");
    assert.match(actions, /withdrawApprovalForPosts\(\[id\], v, "media was added to the post"\)/, "AI image add withdraws");
  });
  await t("legacy actions go through the engine: scheduling runs preflight + cancel + queue reset; approving re-runs the plan", () => {
    const a = src("src/app/(products)/viralpulse-ai/(protected)/actions.ts");
    const sched = a.slice(a.indexOf("export async function schedulePostAction"), a.indexOf("export async function approvePostAction"));
    assert.ok(/schedulePost\(/.test(sched) && /cancelScheduled\(/.test(sched), "routes through schedulePost / cancelScheduled");
    assert.ok(!/updatePost\(/.test(sched) && !/parseSchedule\(/.test(sched), "no direct write of the schedule");
    const appr = a.slice(a.indexOf("export async function approvePostAction"), a.indexOf("export async function publishPostAction"));
    assert.ok(/buildPlan\(/.test(appr) && /cancelAttempts\(/.test(appr), "approval runs the plan; withdrawal cancels waiting attempts");
  });

  // ── #LOW media paths and routes ──
  await t("upload paths: an un-prefixed (legacy) or another company's path is refused for new registrations", async () => {
    const { assertUploadOwner, keyBelongsToCompany } = await import("../src/lib/products/viralpulse-ai/media");
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
    await runAsCompany(A, async () => {
      await assertUploadOwner(`smms/${A}/uploads/${id}.png`);
      await rejects(() => assertUploadOwner(`smms/uploads/${id}.png`), (e) => /isn't valid/.test((e as Error).message), "legacy path");
      await rejects(() => assertUploadOwner(`smms/${B}/uploads/${id}.png`), (e) => /isn't valid/.test((e as Error).message), "other company");
      assert.equal(await keyBelongsToCompany(`smms/${B}/ai/x.png`), false);
      assert.equal(await keyBelongsToCompany(`smms/${A}/ai/x.png`), true);
    });
    const route = src("src/app/(products)/api/viralpulse-ai/media/[id]/route.ts");
    assert.match(route, /keyBelongsToCompany/);
    assert.match(route, /Forbidden/);
    assert.match(src("src/app/(products)/api/viralpulse-ai/image-studio/variant/[projectId]/[variantId]/route.ts"), /!can\(viewer, "MANAGE_MEDIA"\) \|\| !can\(viewer, "GENERATE_AI_CONTENT"\)/);
  });

  // ── #LOW metrics ──
  await t("metrics: keyed by platform + external id; rate has one declared denominator; unknown-currency spend is not totalled", async () => {
    const q = await import("../src/lib/products/viralpulse-ai/metrics/queries");
    const compute = await import("../src/lib/products/viralpulse-ai/metrics/compute");
    const at = new Date();
    const latest = q.latestByKey(
      [
        { platform: "facebook", externalId: "123", level: "post", metric: "reach", value: 1, date: "2026-11-01", capturedAt: at },
        { platform: "instagram", externalId: "123", level: "post", metric: "reach", value: 2, date: "2026-11-01", capturedAt: at },
      ],
      "2026-11-30",
    );
    assert.equal(latest.size, 2);
    assert.equal(latest.get(q.snapKey("instagram", "123"))!.metrics.reach, 2);
    assert.equal(compute.engagementRate({ likes: 5, views: 100 }, "reach"), null, "no silent fallback when a denominator is declared");
    assert.equal(compute.engagementRate({ likes: 5, views: 100 })!.denominator, "views", "the per-post figure says which one it used");
    await runAsCompany(A, async () => {
      const { upsertSnapshots } = await import("../src/lib/products/viralpulse-ai/ads-platforms/snapshots");
      await upsertSnapshots([{ platform: "meta", externalId: "orphan_campaign", level: "campaign", metric: "spend", value: 50, date: "2026-11-09", source: "meta_ads_insights", launchId: "gone", campaignId: "C1" }], at);
      const d = await q.loadAnalytics({ from: "2026-11-01", to: "2026-11-10" }, new Date("2026-11-10T12:00:00Z"), { listAccounts: async () => [], loadAttempts: async () => [] });
      assert.ok(!d.kpis.spend.byCurrency.some((c) => c.currency === ""), "no empty-currency total");
      assert.ok(d.kpis.spend.skippedUnknownCurrency >= 1);
      assert.deepEqual(d.kpis.engagementRate.denominators, []);
    });
  });

  console.log(`\nviralpulse review fixes: ${pass} passed, ${fail} failed`);
  const client = await MongoClient.connect(uri);
  await client.db().dropDatabase();
  await client.close();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    const client = await MongoClient.connect(uri);
    await client.db().dropDatabase();
    await client.close();
  } catch {
    // best effort
  }
  process.exit(1);
});
