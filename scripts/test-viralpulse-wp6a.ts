/**
 * ViralPulse WP6a tests: Meta ads manager backend. A FAKE Meta Graph server (in-memory) answers every call: no provider is contacted.
 * Covers the HTTP client (appsecret_proof, usage headers, retries, ambiguous writes), error mapping, validators per objective / placement /
 * creative type, request builders, asset upload, targeting search cache, legacy migration, launch creation order + idempotency + compensation
 * + resume, approval / spend guard / permissions, edit after launch, status + insights sync (snapshot idempotency, notifications), tenancy,
 * manual tracking and the shape-only Google / LinkedIn / X validators. Database: a THROWAWAY MongoDB only (asserted, then dropped).
 * Run: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_vpwp6a npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-viralpulse-wp6a.ts
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "";
const dbName = uri.split("?")[0].split("/").pop() ?? "";
assert.ok(/zz_throwaway/.test(dbName), "refusing to run: MONGODB_URI must be a zz_throwaway_* database");
assert.ok(!/\.env\.local/.test(uri));

import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { MetaClient, appSecretProof, parseUsage } from "../src/lib/products/viralpulse-ai/ads-platforms/meta/client";
import { classifyGraphError, MetaApiError } from "../src/lib/products/viralpulse-ai/ads-platforms/meta/errors";
import { validateMetaLaunch, type AdForValidation, type MediaFacts } from "../src/lib/products/viralpulse-ai/ads-platforms/meta/validate";
import { buildAdPayload, buildAdSetPayload, buildCampaignPayload, buildCreativePayload, buildTargetingSpec } from "../src/lib/products/viralpulse-ai/ads-platforms/meta/build";
import { emptyAdSet, emptyMetaAd, emptyMetaCampaign, normalizeCampaignPaid, normalizeAdPaid, objectiveFromText, type MetaCampaignDraft, type MetaAdDraft } from "../src/lib/products/viralpulse-ai/ads-platforms/meta/draft";
import { uploadImage, uploadVideo, RangeReader } from "../src/lib/products/viralpulse-ai/ads-platforms/meta/assets";
import { searchInterests, clearSearchCache, deliveryEstimate } from "../src/lib/products/viralpulse-ai/ads-platforms/meta/search";
import { parseInsights, parseIssues } from "../src/lib/products/viralpulse-ai/ads-platforms/meta/sync";
import { CAPABILITIES, adsPlatformFor, toMinor, fromMinor } from "../src/lib/products/viralpulse-ai/ads-platforms/types";
import * as google from "../src/lib/products/viralpulse-ai/ads-platforms/google";
import * as linkedin from "../src/lib/products/viralpulse-ai/ads-platforms/linkedin";
import * as xAds from "../src/lib/products/viralpulse-ai/ads-platforms/x";
import { commitmentOf, evaluateGuard, defaultGuard, saveGuard, setKillSwitch, getGuard } from "../src/lib/products/viralpulse-ai/ads-platforms/guard";
import { upsertSnapshots, snapshotsCollection, resetSnapshotIndexCacheForTests } from "../src/lib/products/viralpulse-ai/ads-platforms/snapshots";
import { createLaunch, resumeLaunch, rollbackLaunch, approveLaunch, activateLaunch, pauseLaunch, archiveLaunch, editLaunch, validateLaunch, getLaunch, launchesCollection, listLaunches, LaunchValidationError, LaunchBlockedError, ApprovalRequiredError, pauseAllRunning, resetLaunchIndexCacheForTests } from "../src/lib/products/viralpulse-ai/ads-platforms/launches";
import { runAdsSync, newProblems } from "../src/lib/products/viralpulse-ai/ads-platforms/ads-sync";
import type { AdsDeps, AccountLite, MediaLite } from "../src/lib/products/viralpulse-ai/ads-platforms/deps";
import { createCampaign, parseBrief, getCampaign, saveCampaignPaid, migrateLegacyCampaigns, campaignsCollection } from "../src/lib/products/viralpulse-ai/campaigns";
import { createAd, parseAdHeader, getAd, updateAd, saveAdPaid, markAdManuallyTracked, adsCollection } from "../src/lib/products/viralpulse-ai/ads";
import { ForbiddenError, SmmsInputError, type SmmsViewer } from "../src/lib/products/viralpulse-ai/viewer";
import { SMMS_ROLE_PERMISSIONS } from "../src/lib/smms-roles";

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
    assert.ok(test(e), `${msg}: wrong error ${e instanceof Error ? e.constructor.name + ": " + e.message : e}`);
    return;
  }
  assert.fail(`${msg}: did not throw`);
};

// ── a fake Meta Graph server ──────────────────────────────────────────────────────────────────────────
interface Obj { id: string; kind: string; parent: string | null; name: string; status: string; payload: Record<string, unknown>; created: string; effective?: string; review?: unknown }
class FakeMeta {
  objs = new Map<string, Obj>();
  seq = 1000;
  log: { method: string; path: string; body: Record<string, unknown>; headers: Record<string, string>; url: string }[] = [];
  inject: ((r: { method: string; path: string; body: Record<string, unknown> }) => Response | null | "ok-but-500") | null = null;
  usageHeader: string | null = null;
  accountStatus = 1;
  videoPolls = 0;
  uploaded = { chunks: [] as { start: number; len: number }[], finished: false };
  json(body: unknown, status = 200, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...(this.usageHeader ? { "x-business-use-case-usage": this.usageHeader } : {}), ...headers } });
  }
  errorRes(status: number, code: number, sub: number | undefined, message = "bad", extra: Record<string, unknown> = {}) {
    return this.json({ error: { message, type: "OAuthException", code, ...(sub ? { error_subcode: sub } : {}), fbtrace_id: "TRACE", ...extra } }, status);
  }
  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/v[\d.]+\//, "").replace(/^\//, "");
    const body: Record<string, unknown> = {};
    const raw = init?.body;
    if (raw instanceof URLSearchParams) for (const [k, v] of raw) { try { body[k] = JSON.parse(v); } catch { body[k] = v; } }
    else if (raw instanceof FormData) for (const [k, v] of raw.entries()) body[k] = typeof v === "string" ? v : `[file ${(v as Blob).size}]`;
    const query: Record<string, string> = {};
    for (const [k, v] of url.searchParams) query[k] = v;
    this.log.push({ method, path, body: { ...body, ...(method === "GET" ? query : {}) }, headers: (init?.headers ?? {}) as Record<string, string>, url: url.toString() });
    const inj = this.inject?.({ method, path, body });
    if (inj === "ok-but-500") { this.apply(method, path, body, query); return this.json({ error: { message: "temporary", code: 2, is_transient: true } }, 500); }
    if (inj) return inj;
    return this.apply(method, path, body, query);
  };
  private create(kind: string, parent: string | null, body: Record<string, unknown>): Obj {
    const id = String(++this.seq);
    const o: Obj = { id, kind, parent, name: String(body.name ?? ""), status: String(body.status ?? "PAUSED"), payload: body, created: new Date().toISOString() };
    this.objs.set(id, o);
    return o;
  }
  private apply(method: string, path: string, body: Record<string, unknown>, query: Record<string, string>): Response {
    const m = /^(act_\d+)\/(\w+)$/.exec(path);
    if (method === "GET" && /^act_\d+$/.test(path)) {
      return this.json({ id: path, name: "Main account", account_status: this.accountStatus, currency: "INR", timezone_name: "Asia/Kolkata", min_daily_budget: "8000", min_campaign_group_spend_cap: "10000", spend_cap: "0", amount_spent: "0", balance: "0", is_prepay_account: false, business: { id: "B1" }, funding_source_details: { id: "F1", type: 1 }, user_tasks: ["MANAGE", "ADVERTISE"], default_dsa_payor: null, default_dsa_beneficiary: null });
    }
    if (method === "POST" && m) {
      const [, , res] = m;
      if (res === "campaigns") {
        if (!body.special_ad_categories) return this.errorRes(400, 100, 1815857, "special ad category required");
        return this.json({ id: this.create("campaign", null, body).id });
      }
      if (res === "adsets") return this.json({ id: this.create("adset", String(body.campaign_id), body).id });
      if (res === "adcreatives") return this.json({ id: this.create("creative", null, body).id });
      if (res === "ads") return this.json({ id: this.create("ad", String(body.adset_id), body).id });
      if (res === "adimages") return this.json({ images: { [String(body.name ?? "f")]: { hash: `hash_${++this.seq}` } } });
      if (res === "advideos") {
        if (body.upload_phase === "start") return this.json({ upload_session_id: "S1", video_id: "VID1", start_offset: "0", end_offset: "4" });
        if (body.upload_phase === "transfer") {
          const start = Number(body.start_offset);
          const len = Number(String(body.video_file_chunk).replace(/\D/g, ""));
          this.uploaded.chunks.push({ start, len });
          const next = start + len;
          return this.json({ start_offset: String(next), end_offset: String(next + 4) });
        }
        if (body.upload_phase === "finish") { this.uploaded.finished = true; return this.json({ success: true }); }
      }
    }
    const lm = /^(act_\d+|\d+)\/(campaigns|adsets|ads|adcreatives)$/.exec(path);
    if (method === "GET" && lm) {
      const kind = { campaigns: "campaign", adsets: "adset", ads: "ad", adcreatives: "creative" }[lm[2]]!;
      return this.json({ data: [...this.objs.values()].filter((o) => o.kind === kind && (lm[1].startsWith("act_") || o.parent === lm[1])).map((o) => ({ id: o.id, name: o.name, created_time: o.created })) });
    }
    if (method === "GET" && m && m[2] === "insights") {
      const level = query.level as string;
      const kind = level === "adset" ? "adset" : level;
      const rows = [...this.objs.values()].filter((o) => o.kind === kind).map((o) => ({ [`${level === "campaign" ? "campaign" : level}_id`]: o.id, date_start: new Date().toISOString().slice(0, 10), impressions: "1000", clicks: "20", spend: "12.5", actions: [{ action_type: "link_click", value: "18" }] }));
      return this.json({ data: rows });
    }
    if (method === "GET" && m && m[2] === "delivery_estimate") return this.json({ data: [{ estimate_ready: true, estimate_dau: 12000, estimate_mau_lower_bound: 250000, estimate_mau_upper_bound: 300000 }] });
    if (method === "GET" && path === "search") return this.json({ data: [{ id: "6003", name: "Yoga", audience_size_lower_bound: 1000, audience_size_upper_bound: 2000, path: ["Interests", "Yoga"] }] });
    if (method === "GET" && path === "") {
      const out: Record<string, unknown> = {};
      for (const id of String(query.ids).split(",")) {
        const o = this.objs.get(id);
        if (o) out[id] = { id, status: o.status, effective_status: o.effective ?? (o.status === "ACTIVE" ? "ACTIVE" : o.status === "PAUSED" ? "PAUSED" : o.status), ...(o.review ? { ad_review_feedback: o.review } : {}) };
      }
      return this.json(out);
    }
    if (method === "GET" && path === "VID1") { this.videoPolls++; return this.json({ status: { video_status: this.videoPolls >= 2 ? "ready" : "processing" } }); }
    if (method === "POST" && /^\d+$/.test(path)) {
      const o = this.objs.get(path);
      if (!o) return this.errorRes(400, 100, undefined, "Unsupported post request. Object does not exist");
      if (body.status) o.status = String(body.status);
      if (body.name) o.name = String(body.name);
      if (body.daily_budget) o.payload.daily_budget = body.daily_budget;
      if (body.creative) o.payload.creative = body.creative;
      return this.json({ success: true });
    }
    if (method === "DELETE" && /^\d+$/.test(path)) {
      if (!this.objs.delete(path)) return this.errorRes(400, 100, undefined, "Object does not exist");
      return this.json({ success: true });
    }
    return this.errorRes(404, 100, undefined, `fake meta: unhandled ${method} ${path}`);
  }
  count(method: string, re: RegExp) {
    return this.log.filter((l) => l.method === method && re.test(l.path)).length;
  }
  ofKind(k: string) {
    return [...this.objs.values()].filter((o) => o.kind === k);
  }
}

// ── scaffolding ───────────────────────────────────────────────────────────────────────────────────────
const T0 = Date.now();
const iso = (days: number) => new Date(T0 + days * 86_400_000).toISOString();
const viewer = (id: string, role: string): SmmsViewer => ({ userId: id, email: `${id}@x.test`, roles: [role], ctx: { roles: [role], permissionOverrides: null } });
const admin = viewer("u_admin", "smms_admin");
const manager = viewer("u_manager", "smms_manager");
const specialist = viewer("u_spec", "smms_specialist");
const employee = viewer("u_emp", "smms_employee");

const acct = (id: string, provider: string, externalId: string): AccountLite => ({ id, provider, externalId, name: id, meta: {}, enabled: true, status: "healthy" });
const ACCOUNTS: Record<string, AccountLite> = { acct_ad: acct("acct_ad", "meta_ad_account", "act_1"), acct_pg: acct("acct_pg", "facebook_page", "PAGE1"), acct_ig: acct("acct_ig", "instagram_business", "IG1") };
const MEDIA: Record<string, MediaLite & { bytes: Buffer }> = {
  m_img: { id: "m_img", kind: "image", name: "hero.jpg", contentType: "image/jpeg", size: 2000, width: 1080, height: 1350, durationSec: null, storageKey: "k1", bytes: Buffer.alloc(2000, 1) },
  m_vid: { id: "m_vid", kind: "video", name: "reel.mp4", contentType: "video/mp4", size: 10, width: 1080, height: 1920, durationSec: 20, storageKey: "k2", bytes: Buffer.alloc(10, 2) },
};

function makeDeps(fake: FakeMeta, notes: { title: string; body: string; dedupeKey: string }[], clock: { now: Date } = { now: new Date(T0) }): AdsDeps {
  return {
    async withMeta(accountId, fn) {
      const a = ACCOUNTS[accountId];
      if (!a) throw new Error("unknown account");
      return fn(new MetaClient({ token: "TOKEN_X", appSecret: "SECRET_X", fetchImpl: fake.fetch, sleep: async () => {}, rand: () => 0.5 }), a);
    },
    async getAccount(id) { return ACCOUNTS[id] ?? null; },
    async getMedia(ids) { return ids.map((i) => MEDIA[i]).filter(Boolean); },
    byteSource(m) {
      const b = MEDIA[m.id].bytes;
      return { size: b.length, async open() { return new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(b.subarray(0, 3))); c.enqueue(new Uint8Array(b.subarray(3))); c.close(); } }); } };
    },
    now: () => clock.now,
    sleep: async () => {},
    notify: async (n) => { if (!notes.some((x) => x.dedupeKey === n.dedupeKey)) notes.push(n); },
    audit: async () => {},
  };
}

function goodDraft(over: Partial<MetaCampaignDraft> = {}): MetaCampaignDraft {
  const s = emptyAdSet("s1", "India 25-45");
  s.optimizationGoal = "LINK_CLICKS";
  s.budget = { type: "daily", amountMinor: 50000 };
  s.targeting.geo.countries = ["IN"];
  s.targeting.ageMin = 25;
  s.targeting.ageMax = 45;
  return { ...emptyMetaCampaign(), adAccountId: "acct_ad", pageAccountId: "acct_pg", objective: "OUTCOME_TRAFFIC", startTime: iso(1), stopTime: iso(11), adSets: [s], ...over };
}
const goodAd = (over: Partial<MetaAdDraft> = {}): MetaAdDraft => ({ ...emptyMetaAd(), adSetKey: "s1", link: "https://example.com/offer", ctaType: "LEARN_MORE", ...over });
const adFor = (meta: MetaAdDraft, extra: Partial<AdForValidation> = {}): AdForValidation => ({ id: "a1", name: "Ad one", format: "image", headline: "Learn yoga", primaryText: "Join our classes", description: "", mediaIds: ["m_img"], meta, ...extra });
const mediaFacts: MediaFacts[] = [{ id: "m_img", kind: "image", contentType: "image/jpeg", size: 2000, width: 1080, height: 1350, durationSec: null }, { id: "m_vid", kind: "video", contentType: "video/mp4", size: 10, width: 1080, height: 1920, durationSec: 20 }];
const ACCOUNT_FACTS = { currency: "INR", status: 1, minDailyBudgetMinor: 8000, minSpendCapMinor: 10000 };
const codes = (r: { errors: { code: string }[] }) => r.errors.map((e) => e.code);

async function main() {
  // ── client ──
  await t("client: appsecret_proof is HMAC-SHA256(token, secret); token only in the header, never in the URL", async () => {
    const f = new FakeMeta();
    const c = new MetaClient({ token: "TOK", appSecret: "SEC", fetchImpl: f.fetch });
    await c.get("act_1", { fields: "name" });
    const l = f.log[0];
    assert.equal(appSecretProof("TOK", "SEC"), createHmac("sha256", "SEC").update("TOK").digest("hex"));
    assert.ok(l.url.includes(`appsecret_proof=${appSecretProof("TOK", "SEC")}`));
    assert.ok(!l.url.includes("TOK"));
    assert.equal(l.headers.Authorization, "Bearer TOK");
    assert.ok(l.url.includes("/v25.0/"));
  });
  await t("client: usage headers parsed (x-business-use-case-usage, x-ad-account-usage)", () => {
    const u = parseUsage(new Headers({ "x-business-use-case-usage": JSON.stringify({ "1": [{ type: "ads_management", call_count: 40, total_cputime: 12, total_time: 55, estimated_time_to_regain_access: 7, ads_api_access_tier: "development_access" }] }), "x-ad-account-usage": JSON.stringify({ acc_id_util_pct: 71 }) }));
    assert.equal(u.maxPct, 71);
    assert.equal(u.regainMinutes, 7);
    assert.equal(u.tier, "development_access");
  });
  await t("client: throttled call (17/2446079) is retried with backoff then succeeds", async () => {
    const f = new FakeMeta();
    let n = 0;
    f.inject = () => (n++ < 2 ? f.errorRes(400, 17, 2446079, "limit") : null);
    const waits: number[] = [];
    const c = new MetaClient({ token: "T", fetchImpl: f.fetch, sleep: async (ms) => { waits.push(ms); }, rand: () => 0 });
    await c.get("act_1");
    assert.equal(f.log.length, 3);
    assert.deepEqual(waits, [500, 1000]);
  });
  await t("client: a long throttle (regain 30 min) is thrown as rate_limit with retryAfterMs, not slept", async () => {
    const f = new FakeMeta();
    f.usageHeader = JSON.stringify({ "1": [{ estimated_time_to_regain_access: 30 }] });
    f.inject = () => f.errorRes(400, 80004, undefined, "too many");
    const c = new MetaClient({ token: "T", fetchImpl: f.fetch, sleep: async () => {} });
    await rejects(() => c.get("act_1"), (e) => e instanceof MetaApiError && e.kind === "rate_limit" && (e.retryAfterMs ?? 0) >= 30 * 60_000, "long throttle");
    assert.equal(f.log.length, 1);
  });
  await t("client: a GET 500 is retried, a POST 500 (create may have run) is NOT blindly retried", async () => {
    const f = new FakeMeta();
    let n = 0;
    f.inject = ({ method }) => (method === "GET" && n++ < 1 ? f.json({ error: { message: "x", code: 2 } }, 500) : null);
    const c = new MetaClient({ token: "T", fetchImpl: f.fetch, sleep: async () => {} });
    await c.get("act_1");
    assert.equal(f.log.length, 2);
    const g = new FakeMeta();
    g.inject = () => g.json({ error: { message: "x", code: 2 } }, 500);
    const c2 = new MetaClient({ token: "T", fetchImpl: g.fetch, sleep: async () => {} });
    await rejects(() => c2.post("act_1/campaigns", { name: "x" }), (e) => e instanceof MetaApiError && e.ambiguous, "ambiguous");
    assert.equal(g.log.length, 1);
  });
  await t("client: network failure is ambiguous for writes and never leaks the URL", async () => {
    const c = new MetaClient({ token: "SECRETTOK", fetchImpl: (async () => { throw new TypeError("fetch failed https://graph.facebook.com/?access_token=SECRETTOK"); }) as unknown as typeof fetch, sleep: async () => {} });
    await rejects(() => c.post("act_1/ads", { name: "x" }), (e) => e instanceof MetaApiError && e.ambiguous && !e.message.includes("SECRETTOK"), "network");
  });

  // ── errors ──
  await t("errors: plain messages for subcodes, field hints, kinds", () => {
    const e1 = classifyGraphError({ code: 100, error_subcode: 1885621, message: "x" }, 400);
    assert.equal(e1.kind, "validation");
    assert.match(e1.message, /campaign and (on )?the ad set/i);
    assert.equal(e1.field, "budget");
    const e2 = classifyGraphError({ code: 100, error_subcode: 1815857, message: "x" }, 400);
    assert.match(e2.message, /special ad category/i);
    const e3 = classifyGraphError({ code: 190, error_subcode: 463, message: "expired" }, 401);
    assert.equal(e3.kind, "auth");
    assert.match(e3.message, /expired/i);
    const e4 = classifyGraphError({ code: 294, message: "x" }, 400);
    assert.equal(e4.kind, "permission");
    assert.match(e4.message, /ads_management/);
    const e5 = classifyGraphError({ code: 200, error_subcode: 1870034 }, 403);
    assert.match(e5.message, /Custom Audience terms/);
    const e6 = classifyGraphError({ code: 100, error_subcode: 3858079 }, 400);
    assert.match(e6.message, /payor/);
    assert.equal(e6.field, "dsaPayor");
    const e7 = classifyGraphError({ code: 17, error_subcode: 1885172 }, 400);
    assert.equal(e7.kind, "rate_limit");
    assert.ok(e7.retryable);
    const e8 = classifyGraphError({ code: 100, message: "Invalid parameter", error_data: { blame_field_specs: [["targeting"]] } }, 400);
    assert.deepEqual(e8.blame, ["targeting"]);
    const e9 = classifyGraphError({ code: 1, message: "unknown" }, 500);
    assert.ok(e9.retryable && e9.ambiguous);
    const e10 = classifyGraphError({ code: 100, message: "see https://x/?access_token=abc123&y=1" }, 400);
    assert.ok(!e10.message.includes("abc123"));
  });

  // ── validators ──
  await t("validate: a complete traffic launch is valid", () => {
    const r = validateMetaLaunch({ campaign: goodDraft(), ads: [adFor(goodAd())], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) });
    assert.deepEqual(r.errors, []);
    assert.equal(r.ok, true);
  });
  await t("validate: required basics are reported with draft paths", () => {
    const r = validateMetaLaunch({ campaign: emptyMetaCampaign(), ads: [], media: [], account: null, now: new Date(T0) });
    const paths = r.errors.map((e) => e.path);
    for (const p of ["meta.adAccountId", "meta.pageAccountId", "meta.objective", "meta.adSets", "ads"]) assert.ok(paths.includes(p), `missing ${p}: ${paths}`);
  });
  await t("validate: optimisation goal must belong to the objective (ODAX)", () => {
    const d = goodDraft({ objective: "OUTCOME_AWARENESS" });
    d.adSets[0].optimizationGoal = "LINK_CLICKS";
    d.adSets[0].promotedObject = { pageId: "PAGE1" };
    const r = validateMetaLaunch({ campaign: d, ads: [adFor(goodAd())], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) });
    assert.ok(codes(r).includes("goal_objective"));
  });
  for (const [objective, goal, dest, missing] of [
    ["OUTCOME_LEADS", "LEAD_GENERATION", "ON_AD", "promoted_required"],
    ["OUTCOME_SALES", "OFFSITE_CONVERSIONS", "WEBSITE", "promoted_required"],
    ["OUTCOME_APP_PROMOTION", "APP_INSTALLS", null, "promoted_required"],
    ["OUTCOME_ENGAGEMENT", "PAGE_LIKES", "ON_PAGE", "promoted_required"],
  ] as const) {
    await t(`validate: ${objective}/${goal} needs its promoted object`, () => {
      const d = goodDraft({ objective });
      d.adSets[0].optimizationGoal = goal;
      d.adSets[0].destinationType = dest;
      const r = validateMetaLaunch({ campaign: d, ads: [adFor(goodAd({ leadFormId: "L1" }))], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) });
      assert.ok(codes(r).includes(missing), `${objective}: ${codes(r)}`);
      const d2 = JSON.parse(JSON.stringify(d)) as MetaCampaignDraft;
      d2.adSets[0].promotedObject = { pageId: "PAGE1", pixelId: "PX1", customEventType: "PURCHASE", applicationId: "APP1", objectStoreUrl: "https://play.google.com/store/apps/details?id=x" };
      const r2 = validateMetaLaunch({ campaign: d2, ads: [adFor(goodAd({ leadFormId: "L1", conversionDomain: "example.com" }))], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) });
      assert.ok(!codes(r2).includes(missing), `${objective} with object: ${codes(r2)}`);
    });
  }
  await t("validate: sales conversions need a pixel and the ad needs the conversion domain", () => {
    const d = goodDraft({ objective: "OUTCOME_SALES" });
    d.adSets[0].optimizationGoal = "OFFSITE_CONVERSIONS";
    d.adSets[0].promotedObject = { pixelId: "PX1", customEventType: "PURCHASE" };
    const r = validateMetaLaunch({ campaign: d, ads: [adFor(goodAd())], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) });
    assert.deepEqual(codes(r), ["conversion_domain"]);
  });
  await t("validate: budgets - both levels, none, lifetime without end, below minimum, bid cap needs amount", () => {
    const d = goodDraft({ campaignBudget: { type: "daily", amountMinor: 10000 } });
    assert.ok(codes(validateMetaLaunch({ campaign: d, ads: [adFor(goodAd())], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) })).includes("budget_both"));
    const d2 = goodDraft();
    d2.adSets[0].budget = null;
    assert.ok(codes(validateMetaLaunch({ campaign: d2, ads: [adFor(goodAd())], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) })).includes("budget_required"));
    const d3 = goodDraft();
    d3.adSets[0].budget = { type: "lifetime", amountMinor: 100000 };
    assert.ok(codes(validateMetaLaunch({ campaign: d3, ads: [adFor(goodAd())], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) })).includes("lifetime_end"));
    const d4 = goodDraft();
    d4.adSets[0].budget = { type: "daily", amountMinor: 5000 };
    assert.ok(codes(validateMetaLaunch({ campaign: d4, ads: [adFor(goodAd())], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) })).includes("budget_min"));
    const d5 = goodDraft({ bidStrategy: "COST_CAP" });
    assert.ok(codes(validateMetaLaunch({ campaign: d5, ads: [adFor(goodAd())], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) })).includes("bid_required"));
  });
  await t("validate: EU targeting needs DSA beneficiary and payor unless the account has defaults", () => {
    const d = goodDraft();
    d.adSets[0].targeting.geo.countries = ["DE"];
    const r = validateMetaLaunch({ campaign: d, ads: [adFor(goodAd())], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) });
    assert.ok(codes(r).includes("dsa_beneficiary") && codes(r).includes("dsa_payor"));
    const r2 = validateMetaLaunch({ campaign: d, ads: [adFor(goodAd())], media: mediaFacts, account: { ...ACCOUNT_FACTS, defaultDsaBeneficiary: "Acme", defaultDsaPayor: "Acme" }, now: new Date(T0) });
    assert.ok(!codes(r2).includes("dsa_payor"));
  });
  await t("validate: targeting rules (geo, age, radius, detailed needs geo, demographic kind)", () => {
    const d = goodDraft();
    const tg = d.adSets[0].targeting;
    tg.geo.countries = [];
    tg.ageMin = 12;
    tg.ageMax = 70;
    tg.geo.cities = [{ key: "c1", radius: 5, distanceUnit: "mile" }];
    tg.detailed = [{ interests: [], behaviors: [], demographics: [{ id: "1" }] }];
    const c = codes(validateMetaLaunch({ campaign: d, ads: [adFor(goodAd())], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) }));
    for (const k of ["age_min", "age_max", "city_radius", "demographic_kind"]) assert.ok(c.includes(k), `${k} in ${c}`);
    const d2 = goodDraft();
    d2.adSets[0].targeting.geo.countries = [];
    assert.ok(codes(validateMetaLaunch({ campaign: d2, ads: [adFor(goodAd())], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) })).includes("geo_required"));
  });
  await t("validate: placement rules (audience network alone, stories need feed, sponsored messages alone, positions need platform)", () => {
    const base = (p: Partial<ReturnType<typeof goodDraft>["adSets"][0]["targeting"]["placements"]>) => {
      const d = goodDraft();
      d.adSets[0].targeting.placements = { automatic: false, publisherPlatforms: [], facebookPositions: [], instagramPositions: [], messengerPositions: [], audienceNetworkPositions: [], devicePlatforms: [], ...p };
      return codes(validateMetaLaunch({ campaign: d, ads: [adFor(goodAd())], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) }));
    };
    assert.ok(base({ publisherPlatforms: ["audience_network"] }).includes("an_alone"));
    assert.ok(base({ publisherPlatforms: ["facebook"], facebookPositions: ["story"] }).includes("fb_story_alone"));
    assert.ok(!base({ publisherPlatforms: ["facebook"], facebookPositions: ["feed", "story"] }).includes("fb_story_alone"));
    assert.ok(base({ publisherPlatforms: ["facebook"], facebookPositions: ["feed", "story"], devicePlatforms: ["desktop"] }).includes("story_mobile"));
    assert.ok(base({ publisherPlatforms: ["messenger", "facebook"], messengerPositions: ["sponsored_messages"], facebookPositions: ["feed"] }).includes("sponsored_alone"));
    assert.ok(base({ publisherPlatforms: ["facebook"], facebookPositions: ["marketplace"] }).includes("needs_feed"));
    assert.ok(base({ publisherPlatforms: ["facebook"], instagramPositions: ["reels"] }).includes("ig_pos_platform"));
    assert.ok(base({ publisherPlatforms: ["facebook"], facebookPositions: ["feed", "nope"] }).includes("placement_unknown"));
    assert.ok(base({}).includes("placement_none"));
    assert.deepEqual(base({ publisherPlatforms: ["facebook", "instagram"], facebookPositions: ["feed"], instagramPositions: ["stream", "reels"] }), []);
  });
  await t("validate: creative - image/video/carousel requirements, https link, UTM format, text warnings", () => {
    const run = (a: AdForValidation, m = mediaFacts) => validateMetaLaunch({ campaign: goodDraft(), ads: [a], media: m, account: ACCOUNT_FACTS, now: new Date(T0) });
    assert.ok(codes(run(adFor(goodAd(), { mediaIds: [] }))).includes("media_required"));
    assert.ok(codes(run(adFor(goodAd({ creativeType: "video" })))).includes("media_required"));
    assert.ok(!codes(run(adFor(goodAd({ creativeType: "video" }), { mediaIds: ["m_vid"], format: "video" }))).includes("media_required"));
    assert.ok(codes(run(adFor(goodAd({ link: "http://x.com" })))).includes("link_https"));
    assert.ok(codes(run(adFor(goodAd({ urlTags: "?utm_source=a" })))).includes("url_tags"));
    assert.ok(codes(run(adFor(goodAd({ creativeType: "carousel", cards: [{ mediaId: "m_img", headline: "a", description: "", link: "" }] })))).includes("cards_min"));
    const big = run(adFor(goodAd()), [{ ...mediaFacts[0], size: 31 * 1024 * 1024 }, mediaFacts[1]]);
    assert.ok(codes(big).includes("image_size"));
    const webp = run(adFor(goodAd()), [{ ...mediaFacts[0], contentType: "image/webp" }, mediaFacts[1]]);
    assert.ok(codes(webp).includes("image_type"));
    const long = run(adFor(goodAd(), { primaryText: "x".repeat(200), headline: "h".repeat(60) }));
    assert.ok(long.ok && long.warnings.some((w) => w.code === "primary_long") && long.warnings.some((w) => w.code === "headline_long"), "length is advisory only");
    assert.ok(codes(run(adFor(goodAd({ adSetKey: "zz" })))).includes("adset_unknown"));
  });
  await t("validate: stories/reels shape and length are warnings, 120s stories video is an error", () => {
    const d = goodDraft();
    d.adSets[0].targeting.placements = { automatic: false, publisherPlatforms: ["instagram", "facebook"], facebookPositions: ["feed"], instagramPositions: ["story", "stream"], messengerPositions: [], audienceNetworkPositions: [], devicePlatforms: [] };
    const r = validateMetaLaunch({ campaign: d, ads: [adFor(goodAd(), { mediaIds: ["m_img"] })], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) });
    assert.ok(r.warnings.some((w) => w.code === "ratio_vertical"));
    assert.ok(r.ok);
    const long = validateMetaLaunch({ campaign: d, ads: [adFor(goodAd({ creativeType: "video" }), { mediaIds: ["m_vid"], format: "video" })], media: [mediaFacts[0], { ...mediaFacts[1], durationSec: 130 }], account: ACCOUNT_FACTS, now: new Date(T0) });
    assert.ok(codes(long).includes("story_length"));
  });
  await t("validate: account not active, special ad category warns on country, frequency cap only for reach/thruplay", () => {
    const r = validateMetaLaunch({ campaign: goodDraft(), ads: [adFor(goodAd())], media: mediaFacts, account: { ...ACCOUNT_FACTS, status: 3 }, now: new Date(T0) });
    assert.ok(codes(r).includes("account_status"));
    const d = goodDraft({ specialAdCategories: ["HOUSING"] });
    const r2 = validateMetaLaunch({ campaign: d, ads: [adFor(goodAd())], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) });
    assert.ok(r2.warnings.some((w) => w.code === "sac_country"));
    const d3 = goodDraft();
    d3.adSets[0].frequencyControl = { event: "IMPRESSIONS", intervalDays: 7, maxFrequency: 3 };
    assert.ok(codes(validateMetaLaunch({ campaign: d3, ads: [adFor(goodAd())], media: mediaFacts, account: ACCOUNT_FACTS, now: new Date(T0) })).includes("freq_goal"));
  });

  // ── builders ──
  await t("build: campaign payload is PAUSED, special categories default NONE, budget sharing flag when no CBO", () => {
    const p = buildCampaignPayload(goodDraft(), "Spring");
    assert.equal(p.status, "PAUSED");
    assert.deepEqual(p.special_ad_categories, ["NONE"]);
    assert.equal(p.objective, "OUTCOME_TRAFFIC");
    assert.equal(p.buying_type, "AUCTION");
    assert.equal(p.is_adset_budget_sharing_enabled, false);
    assert.equal(p.daily_budget, undefined);
    const cbo = buildCampaignPayload(goodDraft({ campaignBudget: { type: "lifetime", amountMinor: 900000 }, specialAdCategories: ["CREDIT"], specialAdCategoryCountry: ["US"], spendCapMinor: 1000000 }), "x");
    assert.equal(cbo.lifetime_budget, 900000);
    assert.equal(cbo.bid_strategy, "LOWEST_COST_WITHOUT_CAP");
    assert.deepEqual(cbo.special_ad_categories, ["CREDIT"]);
    assert.deepEqual(cbo.special_ad_category_country, ["US"]);
    assert.equal(cbo.spend_cap, 1000000);
  });
  await t("build: ad set payload (budget, billing event, targeting spec, promoted page, DSA only for EU, no location_types)", () => {
    const d = goodDraft({ objective: "OUTCOME_LEADS" });
    const s = d.adSets[0];
    s.optimizationGoal = "LEAD_GENERATION";
    s.destinationType = "ON_AD";
    s.targeting.geo.cities = [{ key: "2420379", radius: 25, distanceUnit: "kilometer" }];
    s.targeting.detailed = [{ interests: [{ id: "6003", name: "Yoga" }], behaviors: [], demographics: [{ id: "9", name: "Newlywed", kind: "life_events" }] }];
    s.targeting.customAudiences = [{ id: "CA1" }];
    s.targeting.advantageAudience = true;
    s.targeting.placements = { automatic: false, publisherPlatforms: ["facebook"], facebookPositions: ["feed"], instagramPositions: [], messengerPositions: [], audienceNetworkPositions: [], devicePlatforms: ["mobile"] };
    const p = buildAdSetPayload(s, d, "C1", "PAGE1");
    assert.equal(p.status, "PAUSED");
    assert.equal(p.campaign_id, "C1");
    assert.equal(p.daily_budget, 50000);
    assert.equal(p.optimization_goal, "LEAD_GENERATION");
    assert.equal(p.billing_event, "IMPRESSIONS");
    assert.deepEqual(p.promoted_object, { page_id: "PAGE1" });
    assert.equal(p.destination_type, "ON_AD");
    assert.equal(p.dsa_payor, undefined);
    const tg = p.targeting as Record<string, unknown>;
    assert.deepEqual((tg.geo_locations as Record<string, unknown>).cities, [{ key: "2420379", radius: 25, distance_unit: "kilometer" }]);
    assert.equal((tg.geo_locations as Record<string, unknown>).location_types, undefined);
    assert.deepEqual(tg.flexible_spec, [{ interests: [{ id: "6003", name: "Yoga" }], life_events: [{ id: "9", name: "Newlywed" }] }]);
    assert.deepEqual(tg.targeting_automation, { advantage_audience: 1 });
    assert.deepEqual(tg.publisher_platforms, ["facebook"]);
    assert.deepEqual(tg.facebook_positions, ["feed"]);
    const eu = goodDraft();
    eu.adSets[0].targeting.geo.countries = ["FR"];
    eu.adSets[0].dsaPayor = "Acme SARL";
    const pe = buildAdSetPayload(eu.adSets[0], eu, "C1", "PAGE1", { dsaBeneficiary: "Acme default" });
    assert.equal(pe.dsa_payor, "Acme SARL");
    assert.equal(pe.dsa_beneficiary, "Acme default");
    const auto = buildTargetingSpec(goodDraft().adSets[0].targeting);
    assert.equal(auto.publisher_platforms, undefined);
  });
  await t("build: creative payloads - link_data, video_data, carousel, asset_feed, UTM, political", () => {
    const assets = { imageHashes: { m_img: "H1" }, videoIds: { m_vid: "V1" } };
    const kinds = { m_img: "image", m_vid: "video" } as const;
    const base = { name: "Ad", headline: "Head", primaryText: "Body", description: "Desc", mediaKinds: kinds, pageId: "PAGE1", instagramUserId: "IG1" };
    const img = buildCreativePayload({ ...base, mediaIds: ["m_img"], meta: goodAd({ urlTags: "utm_source=meta", displayLink: "example.com" }) }, assets) as { object_story_spec: { page_id: string; instagram_user_id: string; link_data: Record<string, unknown> }; url_tags: string };
    assert.equal(img.object_story_spec.page_id, "PAGE1");
    assert.equal(img.object_story_spec.instagram_user_id, "IG1");
    assert.equal((img.object_story_spec as Record<string, unknown>).instagram_actor_id, undefined);
    assert.deepEqual(img.object_story_spec.link_data, { link: "https://example.com/offer", message: "Body", image_hash: "H1", name: "Head", description: "Desc", caption: "example.com", call_to_action: { type: "LEARN_MORE", value: { link: "https://example.com/offer" } } });
    assert.equal(img.url_tags, "utm_source=meta");
    const vid = buildCreativePayload({ ...base, mediaIds: ["m_vid", "m_img"], meta: goodAd({ creativeType: "video" }) }, assets) as { object_story_spec: { video_data: Record<string, unknown> } };
    assert.equal(vid.object_story_spec.video_data.video_id, "V1");
    assert.equal(vid.object_story_spec.video_data.image_hash, "H1");
    assert.equal(vid.object_story_spec.video_data.title, "Head");
    const car = buildCreativePayload({ ...base, mediaIds: [], meta: goodAd({ creativeType: "carousel", cards: [{ mediaId: "m_img", headline: "A", description: "", link: "" }, { mediaId: "m_vid", headline: "B", description: "d", link: "https://example.com/b" }] }) }, assets) as { object_story_spec: { link_data: { child_attachments: Record<string, unknown>[] } } };
    assert.equal(car.object_story_spec.link_data.child_attachments.length, 2);
    assert.equal(car.object_story_spec.link_data.child_attachments[0].image_hash, "H1");
    assert.equal(car.object_story_spec.link_data.child_attachments[1].video_id, "V1");
    assert.equal(car.object_story_spec.link_data.child_attachments[1].link, "https://example.com/b");
    const feed = buildCreativePayload({ ...base, mediaIds: ["m_img"], meta: goodAd({ extraPrimaryTexts: ["Body 2"], extraHeadlines: ["Head 2"] }) }, assets) as { asset_feed_spec: { bodies: unknown[]; titles: unknown[]; images: unknown[] }; object_story_spec: Record<string, unknown> };
    assert.equal(feed.asset_feed_spec.bodies.length, 2);
    assert.equal(feed.asset_feed_spec.titles.length, 2);
    assert.equal(feed.object_story_spec.link_data, undefined);
    const pol = buildCreativePayload({ ...base, mediaIds: ["m_img"], meta: goodAd({ politicalDeclaration: "political_digital" }) }, assets);
    assert.equal(pol.authorization_category, "POLITICAL_WITH_DIGITALLY_CREATED_MEDIA");
    const lead = buildCreativePayload({ ...base, mediaIds: ["m_img"], meta: goodAd({ leadFormId: "LF1" }) }, assets) as { object_story_spec: { link_data: { call_to_action: { value: Record<string, unknown> } } } };
    assert.deepEqual(lead.object_story_spec.link_data.call_to_action.value, { lead_gen_form_id: "LF1" });
    const ad = buildAdPayload("Ad", "S1", "CR1", goodAd({ conversionDomain: "example.com" }));
    assert.deepEqual(ad, { name: "Ad", adset_id: "S1", creative: { creative_id: "CR1" }, status: "PAUSED", conversion_domain: "example.com" });
  });

  // ── assets / search / parsing ──
  await t("assets: image upload returns the hash; video uploads in chunks following Meta's offsets, polls until ready", async () => {
    const f = new FakeMeta();
    const c = new MetaClient({ token: "T", fetchImpl: f.fetch, sleep: async () => {} });
    const src = (b: Buffer) => ({ size: b.length, async open() { return new ReadableStream<Uint8Array>({ start(ctl) { ctl.enqueue(new Uint8Array(b.subarray(0, 1))); ctl.enqueue(new Uint8Array(b.subarray(1))); ctl.close(); } }); } });
    const h = await uploadImage(c, "act_1", src(Buffer.from("abc")), "x.jpg");
    assert.match(h, /^hash_/);
    assert.equal(f.log.find((l) => l.path === "act_1/adimages")!.body.bytes, Buffer.from("abc").toString("base64"));
    const id = await uploadVideo(c, "act_1", src(Buffer.alloc(10, 7)), "reel", { sleep: async () => {}, pollMs: 0 });
    assert.equal(id, "VID1");
    assert.deepEqual(f.uploaded.chunks, [{ start: 0, len: 4 }, { start: 4, len: 4 }, { start: 8, len: 2 }]);
    assert.ok(f.uploaded.finished);
    assert.ok(f.videoPolls >= 2);
  });
  await t("assets: RangeReader can go back (re-opens the stream)", async () => {
    let opens = 0;
    const b = Buffer.from("0123456789");
    const rr = new RangeReader({ size: 10, async open() { opens++; return new ReadableStream<Uint8Array>({ start(ctl) { ctl.enqueue(new Uint8Array(b)); ctl.close(); } }); } });
    assert.equal(Buffer.from(await rr.read(0, 4)).toString(), "0123");
    assert.equal(Buffer.from(await rr.read(4, 10)).toString(), "456789");
    assert.equal(Buffer.from(await rr.read(2, 5)).toString(), "234");
    assert.equal(opens, 2);
    await rr.close();
  });
  await t("search: interests are cached per scope; short queries make no call; delivery estimate parsed", async () => {
    clearSearchCache();
    const f = new FakeMeta();
    const c = new MetaClient({ token: "T", fetchImpl: f.fetch, sleep: async () => {} });
    assert.deepEqual(await searchInterests(c, "co1", "y"), []);
    const a = await searchInterests(c, "co1", "Yoga");
    await searchInterests(c, "co1", "yoga");
    assert.equal(f.count("GET", /^search$/), 1);
    assert.equal(a[0].id, "6003");
    await searchInterests(c, "co2", "yoga");
    assert.equal(f.count("GET", /^search$/), 2);
    const est = await deliveryEstimate(c, "act_1", { optimizationGoal: "REACH", targetingSpec: { geo_locations: { countries: ["IN"] } } });
    assert.equal(est.monthlyLower, 250000);
    const l = f.log.find((x) => x.path.endsWith("delivery_estimate"))!;
    assert.equal(l.body.optimization_goal, "REACH");
  });
  await t("parse: insights flatten to metrics; review issues parsed defensively", () => {
    const rows = parseInsights("ad", [{ ad_id: "9", date_start: "2026-11-01", impressions: "100", spend: "5.5", actions: [{ action_type: "lead", value: "3" }], cost_per_action_type: [{ action_type: "lead", value: "1.8" }] }, { date_start: "2026-11-01" }]);
    const m = Object.fromEntries(rows.map((r) => [r.metric, r.value]));
    assert.equal(m.impressions, 100);
    assert.equal(m.spend, 5.5);
    assert.equal(m["action:lead"], 3);
    assert.equal(m["cost_per:lead"], 1.8);
    assert.deepEqual(parseIssues({ ad_review_feedback: { global: { "Policy X": "Not allowed" } }, issues_info: [{ error_summary: "Payment" }] }), ["Policy X: Not allowed", "Payment"]);
    assert.deepEqual(parseIssues({}), []);
  });
  await t("money: minor units follow the currency's digits; objective words map only when unambiguous", () => {
    assert.equal(toMinor(500, "INR"), 50000);
    assert.equal(toMinor(500, "JPY"), 500);
    assert.equal(fromMinor(50000, "INR"), 500);
    assert.equal(objectiveFromText("Lead generation"), "OUTCOME_LEADS");
    assert.equal(objectiveFromText("brand awareness and traffic"), null);
    assert.equal(objectiveFromText("grow the business"), null);
    assert.equal(adsPlatformFor("instagram"), "meta");
    assert.equal(adsPlatformFor("youtube"), "google");
  });

  // ── guard maths ──
  await t("guard: commitment, caps, overshoot, kill switch, second approver", () => {
    const d = goodDraft();
    const c = commitmentOf(d, new Date(T0));
    assert.equal(c.dailyMinor, 50000);
    assert.equal(c.totalMinor, 50000 * 10);
    const open = goodDraft({ stopTime: null });
    open.adSets[0].endTime = null;
    assert.equal(commitmentOf(open, new Date(T0)).totalMinor, null);
    assert.equal(commitmentOf(open, new Date(T0)).monthlyMinor, 50000 * 30);
    const g = defaultGuard();
    assert.equal(evaluateGuard(g, "INR", c, []).ok, false, "no cap configured blocks");
    g.perCurrency.INR = { maxDailyPerLaunchMinor: 60000, maxTotalPerLaunchMinor: 600000, companyDailyCapMinor: 100000, companyMonthlyCapMinor: null, approvalThresholdMinor: 40000 };
    assert.equal(evaluateGuard(g, "INR", c, []).ok, true);
    assert.equal(evaluateGuard(g, "INR", c, []).needsSecondApprover, true);
    assert.equal(evaluateGuard(g, "INR", c, [{ dailyMinor: 40000, totalMinor: null, monthlyMinor: 0 }]).ok, false, "125% overshoot of 90k exceeds 100k");
    assert.equal(evaluateGuard(g, "INR", commitmentOf(open, new Date(T0)), []).ok, false, "open-ended vs total cap");
    g.killSwitch = true;
    assert.match(evaluateGuard(g, "INR", c, []).reasons.join(" "), /kill switch/);
    assert.equal(evaluateGuard({ ...defaultGuard(), allowUncapped: true }, "USD", c, []).ok, true);
  });
  await t("permissions: approval is manager/admin, not specialist/employee", () => {
    assert.ok(SMMS_ROLE_PERMISSIONS.smms_manager.includes("APPROVE_AD_SPEND"));
    assert.ok(SMMS_ROLE_PERMISSIONS.smms_admin.includes("APPROVE_AD_SPEND"));
    assert.ok(!SMMS_ROLE_PERMISSIONS.smms_specialist.includes("APPROVE_AD_SPEND"));
    assert.ok(!SMMS_ROLE_PERMISSIONS.smms_employee.includes("APPROVE_AD_SPEND"));
  });
  await t("shape-only platforms: capability flags and validators", () => {
    assert.equal(CAPABILITIES.meta.realLaunch, true);
    for (const k of ["google", "linkedin", "x"] as const) assert.ok(!CAPABILITIES[k].realLaunch && CAPABILITIES[k].requiresApprovedAccess);
    const g = google.validateGoogleSearch({ customerId: "123-456-7890", name: "n", dailyBudgetMicros: 1_000_000, startDate: null, endDate: null, keywords: [{ text: "yoga", matchType: "PHRASE" }], headlines: ["a", "b"], descriptions: ["d".repeat(91)], finalUrl: "http://x.com" });
    assert.deepEqual(g.errors.map((e) => e.code).sort(), ["description_max", "descriptions_count", "headlines_count", "url_https"].sort());
    const ops = google.buildGoogleSearchOperations({ customerId: "1234567890", name: "n", dailyBudgetMicros: 5_000_000, startDate: "2026-12-01", endDate: null, keywords: [{ text: "yoga", matchType: "EXACT" }], headlines: ["a", "b", "c"], descriptions: ["d1", "d2"], finalUrl: "https://x.com" });
    assert.deepEqual(ops.map((o) => o.resource), ["campaignBudgets", "campaigns", "adGroups", "adGroupAds", "adGroupCriteria"]);
    assert.equal((ops[1].operation.create as Record<string, unknown>).status, "PAUSED");
    const li = (o: Partial<linkedin.LinkedInCampaignDraft> = {}): linkedin.LinkedInCampaignDraft => ({ accountId: "1", campaignGroupId: null, name: "c", type: "SPONSORED_UPDATES", objectiveType: "WEBSITE_VISITS", costType: "CPC", unitCost: { amount: "2", currencyCode: "USD" }, dailyBudget: { amount: "50", currencyCode: "USD" }, totalBudget: null, runStartMs: T0, runEndMs: null, locale: { country: "US", language: "en" }, optimizationTargetType: "NONE", audienceExpansionEnabled: false, offsiteDeliveryEnabled: false, creativeSelection: "OPTIMIZED", associatedEntity: "urn:li:organization:1", targetingInclude: { "urn:li:adTargetingFacet:interfaceLocales": ["urn:li:locale:en_US"] }, ...o });
    assert.equal(linkedin.validateLinkedInCampaign(li(), "USD").ok, true);
    const bad = linkedin.validateLinkedInCampaign(li({ totalBudget: { amount: "10", currencyCode: "EUR" }, dailyBudget: null, offsiteDeliveryEnabled: true, objectiveType: "LEAD_GENERATION", associatedEntity: null, optimizationTargetType: "CAP_COST_AND_MAXIMIZE_LEADS", costType: "CPC" }), "USD");
    for (const k of ["currency", "end_required", "lan_leadgen", "entity_required", "cost_cap_cpm"]) assert.ok(bad.errors.some((e) => e.code === k), `${k}`);
    const body = linkedin.buildLinkedInCampaignBody(li());
    assert.equal(body.status, "PAUSED");
    assert.equal(body.account, "urn:li:sponsoredAccount:1");
    assert.equal(linkedin.linkedInHeaders("T")["Linkedin-Version"], "202610");
    const xd: xAds.XCampaignDraft = { accountId: "abc", fundingInstrumentId: "", name: "n", dailyBudgetMicros: 1, totalBudgetMicros: null, startTime: null, endTime: null, lineItems: [{ name: "l", objective: "A", placements: ["x"], bidAmountMicros: null, tweetIds: [] }, { name: "m", objective: "B", placements: ["x"], bidAmountMicros: null, tweetIds: ["1"] }] };
    const xr = xAds.validateXCampaign(xd, { activeCampaigns: 200 });
    for (const k of ["funding", "objective_mixed", "creative_required", "campaigns_cap"]) assert.ok(xr.errors.some((e) => e.code === k), k);
    assert.ok(xr.warnings.some((w) => w.code === "requires_access"));
  });
  await t("snapshots: pure key helpers and getter for sync problems", () => {
    const prev = { a1: { status: "ACTIVE", effectiveStatus: "ACTIVE", issues: [], at: new Date() } };
    const now = new Map([["ext1", { id: "ext1", level: "ad" as const, status: "ACTIVE", effectiveStatus: "DISAPPROVED", issues: ["x"], disapproved: true }]]);
    assert.equal(newProblems(prev, now).length, 1);
    assert.equal(newProblems({ ext1: { status: "ACTIVE", effectiveStatus: "DISAPPROVED", issues: [], at: new Date() } }, now).length, 0);
  });

  // ── database-backed flows ──
  const CO = "co_wp6a";
  await runAsCompany(CO, async () => {
    resetLaunchIndexCacheForTests();
    resetSnapshotIndexCacheForTests();
    const notes: { title: string; body: string; dedupeKey: string }[] = [];

    async function newCampaign(name: string, opts: { draft?: MetaCampaignDraft; ad?: Partial<MetaAdDraft>; media?: string[] } = {}) {
      const c = await createCampaign(parseBrief({ name, platforms: ["facebook", "instagram"], objective: "Website traffic", landingPage: "https://example.com/offer", cta: "Learn more", startDate: iso(1), endDate: iso(11) }), "u_admin");
      const ad = await createAd(c._id, parseAdHeader({ platform: "facebook", format: "image", name: `${name} ad` }, ["facebook", "instagram"]), "u_admin", { headline: "Learn yoga", primaryText: "Join our classes", description: "", cta: "Learn more", caption: "", hashtags: [], keywords: [], audienceSuggestions: [], image: { concept: "", prompt: "", overlayText: "", designNotes: "" }, video: { concept: "", hook: "", scenes: [], voiceoverScript: "", onScreenText: [], thumbnailConcept: "", durationSec: 0 }, variations: [] });
      await updateAd(ad._id, { mediaIds: opts.media ?? ["m_img"] }, "u_admin");
      await saveCampaignPaid(c._id, { meta: opts.draft ?? goodDraft() }, admin);
      await saveAdPaid(ad._id, { meta: goodAd(opts.ad) }, admin);
      return { c, ad };
    }

    await t("migration: a legacy campaign/ad (copy only) is lifted on read and persisted idempotently", async () => {
      const col = await campaignsCollection();
      const legacy = { _id: "legacy1", name: "Old", objective: "Lead generation", platforms: ["facebook"], targetAudience: "", industry: "", location: "", budget: 1000, currency: "INR", startDate: new Date(T0 + 86400000), endDate: new Date(T0 + 5 * 86400000), cta: "", landingPage: "https://example.com", offerService: "", offerId: null, clientId: null, brandInfo: "", keywords: [], tone: "", language: "English", status: "draft", ai: {}, lmsCampaignKeys: [], launchedAt: null, launchedBy: null, archivedFrom: null, createdAt: new Date(), updatedAt: new Date(), createdBy: "u", updatedBy: "u", deletedAt: null };
      await col.insertOne(legacy as never);
      const c = await getCampaign("legacy1");
      assert.equal(c!.paid.schemaVersion, 2);
      assert.equal(c!.paid.meta.objective, "OUTCOME_LEADS");
      assert.equal(c!.paid.meta.startTime, new Date(T0 + 86400000).toISOString());
      assert.equal(c!.paid.meta.adAccountId, null, "no invented account");
      assert.deepEqual(c!.paid.meta.adSets, [], "no invented audience or budget");
      assert.equal(c!.paid.meta.campaignBudget, null);
      const raw1 = await col.findOne({ _id: "legacy1" });
      assert.equal((raw1 as { paid?: unknown }).paid, undefined, "read does not write");
      assert.ok((await migrateLegacyCampaigns()) >= 1);
      const raw2 = (await col.findOne({ _id: "legacy1" })) as { paid: { schemaVersion: number } };
      assert.equal(raw2.paid.schemaVersion, 2);
      assert.equal(await migrateLegacyCampaigns(), 0, "idempotent");
      const ads = await adsCollection();
      await ads.insertOne({ _id: "legacyad", campaignId: "legacy1", name: "Old ad", platform: "facebook", format: "video", formatKey: null, status: "draft", content: { headline: "h", primaryText: "p", description: "", cta: "Shop now" }, mediaIds: [], thumbnailId: null, scheduledAt: null, scheduledBy: null, approvedBy: null, approvedAt: null, externalRef: null, launchedAt: null, launchedBy: null, archivedFrom: null, createdAt: new Date(), updatedAt: new Date(), createdBy: "u", updatedBy: "u", deletedAt: null } as never);
      const ad = await getAd("legacyad");
      assert.equal(ad!.paid.meta.creativeType, "video");
      assert.equal(ad!.paid.meta.ctaType, "SHOP_NOW");
      assert.equal(ad!.manualTracking, null);
      assert.equal(normalizeAdPaid(ad!.paid).schemaVersion, 2);
      assert.equal(normalizeCampaignPaid(c!.paid).meta.objective, "OUTCOME_LEADS");
    });

    await t("saveCampaignPaid: permission checked, unknown values dropped, version stamped", async () => {
      const { c } = await newCampaign("Save test");
      await rejects(() => saveCampaignPaid(c._id, { meta: goodDraft() }, employee), (e) => e instanceof ForbiddenError, "employee");
      const s = await saveCampaignPaid(c._id, { meta: { ...goodDraft(), objective: "CONVERSIONS", specialAdCategories: ["HOUSING", "BOGUS"] } }, specialist);
      assert.equal(s.paid.meta.objective, null, "legacy objective rejected");
      assert.deepEqual(s.paid.meta.specialAdCategories, ["HOUSING"]);
      assert.equal(s.paid.schemaVersion, 2);
    });

    await t("validateLaunch reads the ad account live and returns field errors + commitment + guard", async () => {
      const f = new FakeMeta();
      const { c } = await newCampaign("Validate live");
      const v = await validateLaunch(c._id, makeDeps(f, notes));
      assert.equal(v.ok, true, JSON.stringify(v.errors));
      assert.equal(v.account!.currency, "INR");
      assert.equal(v.commitment.dailyMinor, 50000);
      assert.equal(v.guard!.ok, false, "no cap yet");
      f.accountStatus = 2;
      const v2 = await validateLaunch(c._id, makeDeps(f, notes));
      assert.ok(v2.errors.some((e) => e.code === "account_status"));
    });

    await saveGuard({ perCurrency: { INR: { maxDailyPerLaunchMinor: 200000, maxTotalPerLaunchMinor: 5_000_000, companyDailyCapMinor: 300000, companyMonthlyCapMinor: 6_000_000, approvalThresholdMinor: 100000 } } }, "u_admin");

    let main!: { c: { _id: string }; ad: { _id: string } };
    const fake = new FakeMeta();
    const deps = makeDeps(fake, notes);

    await t("createLaunch: permission, validation errors, order of creation, everything PAUSED, ids recorded", async () => {
      main = await newCampaign("Main launch");
      await rejects(() => createLaunch(main.c._id, employee, deps), (e) => e instanceof ForbiddenError, "employee");
      const bad = await newCampaign("Bad launch", { draft: { ...goodDraft(), objective: null } });
      await rejects(() => createLaunch(bad.c._id, specialist, deps), (e) => e instanceof LaunchValidationError && e.errors.some((x) => x.path === "meta.objective"), "validation");
      assert.equal(fake.log.filter((l) => l.method === "POST").length, 0, "nothing sent when invalid");
      const out = await createLaunch(main.c._id, specialist, deps);
      assert.equal(out.ok, true, out.message ?? "");
      const posts = fake.log.filter((l) => l.method === "POST").map((l) => l.path);
      assert.deepEqual(posts, ["act_1/adimages", "act_1/campaigns", "act_1/adsets", "act_1/adcreatives", "act_1/ads"]);
      for (const o of fake.objs.values()) assert.equal(o.status, "PAUSED", `${o.kind} paused`);
      const l = out.launch;
      assert.equal(l.state, "ready");
      assert.equal(l.delivery, "paused");
      assert.ok(l.objects.campaign && l.objects.adSets.s1 && l.objects.creatives[main.ad._id] && l.objects.ads[main.ad._id] && l.objects.images.m_img);
      const adset = fake.objs.get(l.objects.adSets.s1)!;
      assert.equal(String(adset.payload.campaign_id), l.objects.campaign);
      assert.deepEqual(adset.payload.promoted_object, undefined);
      const ad = fake.objs.get(l.objects.ads[main.ad._id])!;
      assert.deepEqual(ad.payload.creative, { creative_id: l.objects.creatives[main.ad._id] });
      assert.equal(l.approval, null);
      assert.equal(l.commitment.dailyMinor, 50000);
    });
    await t("createLaunch is idempotent: the same draft returns the existing launch and sends nothing", async () => {
      const before = fake.log.length;
      const again = await createLaunch(main.c._id, specialist, deps);
      assert.equal(again.existing, true);
      assert.equal(fake.log.length, before);
      assert.equal((await listLaunches(main.c._id)).length, 1);
      const [a, b] = await Promise.all([createLaunch(main.c._id, specialist, deps), createLaunch(main.c._id, specialist, deps)]);
      assert.equal(a.launch._id, b.launch._id);
      assert.equal(fake.ofKind("campaign").length, 1);
    });
    await t("a campaign with a live launch cannot have its draft edited behind the launch's back", async () => {
      await rejects(() => saveCampaignPaid(main.c._id, { meta: goodDraft() }, admin), (e) => e instanceof SmmsInputError, "campaign");
      await rejects(() => saveAdPaid(main.ad._id, { meta: goodAd() }, admin), (e) => e instanceof SmmsInputError, "ad");
    });

    await t("activation is blocked without approval; approval needs the permission; creator cannot approve above the threshold", async () => {
      const l = (await listLaunches(main.c._id))[0];
      await rejects(() => activateLaunch(l._id, manager, deps), (e) => e instanceof ApprovalRequiredError, "no approval");
      await rejects(() => approveLaunch(l._id, specialist, {}, deps), (e) => e instanceof ForbiddenError, "specialist cannot approve");
      await rejects(() => activateLaunch(l._id, specialist, deps), (e) => e instanceof ForbiddenError, "specialist cannot activate");
      // the creator (u_spec) cannot approve their own launch: its 10-day total is above the 100000 threshold
      await rejects(() => approveLaunch(l._id, viewer("u_spec", "smms_manager"), {}, deps), (e) => e instanceof LaunchBlockedError && /someone other/i.test(e.message), "self approval");
      const ok = await approveLaunch(l._id, manager, { note: "ok" }, deps);
      assert.equal(ok.approval!.by, "u_manager");
      assert.equal(ok.approval!.committedDailyMinor, 50000);
      assert.equal(ok.approval!.committedTotalMinor, 500000);
      await (await launchesCollection()).updateOne({ _id: l._id }, { $set: { approval: null } });
      assert.equal(fake.ofKind("campaign")[0].status, "PAUSED");
    });
    await t("second approver is enforced above the approval threshold", async () => {
      const big = await newCampaign("Big spender", { draft: (() => { const d = goodDraft(); d.adSets[0].budget = { type: "daily", amountMinor: 150000 }; return d; })() });
      const out = await createLaunch(big.c._id, viewer("u_big", "smms_admin"), deps);
      assert.equal(out.ok, true, out.message ?? "");
      await rejects(() => approveLaunch(out.launch._id, viewer("u_big", "smms_admin"), {}, deps), (e) => e instanceof LaunchBlockedError && /someone other/i.test(e.message), "self approval");
      const a = await approveLaunch(out.launch._id, manager, { note: "checked with finance" }, deps);
      assert.equal(a.approval!.by, "u_manager");
      assert.equal(a.approval!.secondApproverRequired, true);
      assert.equal(a.approval!.note, "checked with finance");
      await rollbackLaunch(out.launch._id, admin, deps);
    });
    await t("guard blocks above-limit launches at creation and a kill switch blocks activation", async () => {
      const huge = await newCampaign("Too big", { draft: (() => { const d = goodDraft(); d.adSets[0].budget = { type: "daily", amountMinor: 250000 }; return d; })() });
      await rejects(() => createLaunch(huge.c._id, admin, deps), (e) => e instanceof LaunchBlockedError && e.reasons.some((r) => /per-launch limit/.test(r)), "per-launch");
      const l = (await listLaunches(main.c._id))[0];
      await approveLaunch(l._id, manager, {}, deps);
      await setKillSwitch(true, "u_admin");
      await rejects(() => activateLaunch(l._id, manager, deps), (e) => e instanceof LaunchBlockedError && e.reasons.some((r) => /kill switch/.test(r)), "kill switch");
      await setKillSwitch(false, "u_admin");
      assert.equal((await getGuard()).killSwitch, false);
    });
    await t("activate switches ads, ad set and campaign on; pause/resume work; resume re-checks", async () => {
      const l = (await listLaunches(main.c._id))[0];
      const act = await activateLaunch(l._id, manager, deps);
      assert.equal(act.delivery, "active");
      assert.equal(act.activatedBy, "u_manager");
      for (const o of fake.objs.values()) if (o.kind !== "creative") assert.equal(o.status, "ACTIVE", o.kind);
      const statusCalls = fake.log.filter((x) => x.method === "POST" && x.body.status === "ACTIVE").map((x) => fake.objs.get(x.path)!.kind);
      assert.deepEqual(statusCalls, ["ad", "adset", "campaign"], "children first, campaign last");
      const p = await pauseLaunch(l._id, manager, deps);
      assert.equal(p.delivery, "paused");
      assert.equal(fake.ofKind("campaign")[0].status, "PAUSED");
      await setKillSwitch(true, "u_admin");
      await rejects(() => activateLaunch(l._id, manager, deps), (e) => e instanceof LaunchBlockedError, "resume blocked by kill switch");
      await setKillSwitch(false, "u_admin");
      assert.equal((await activateLaunch(l._id, manager, deps)).delivery, "active");
    });
    await t("activation is refused when the Meta ad account is not active", async () => {
      const l = (await listLaunches(main.c._id))[0];
      await pauseLaunch(l._id, manager, deps);
      fake.accountStatus = 3;
      await rejects(() => activateLaunch(l._id, manager, deps), (e) => e instanceof LaunchBlockedError && /not active/.test(e.message), "account");
      fake.accountStatus = 1;
    });
    await t("editLaunch: rename + lower budget ok while paused; raising beyond approval makes activation need re-approval; raising while active is refused", async () => {
      const l0 = (await listLaunches(main.c._id))[0];
      assert.equal(l0.delivery, "paused");
      const lowered = await editLaunch(l0._id, specialist, { adSets: { s1: { name: "India 25-45 v2", budgetMinor: 40000 } }, ads: { [main.ad._id]: { name: "Ad renamed" } } }, deps);
      assert.equal(lowered.commitment.dailyMinor, 40000);
      assert.equal(fake.objs.get(lowered.objects.adSets.s1)!.name, "India 25-45 v2");
      assert.equal(fake.objs.get(lowered.objects.ads[main.ad._id])!.name, "Ad renamed");
      const raised = await editLaunch(l0._id, specialist, { adSets: { s1: { budgetMinor: 70000 } } }, deps);
      assert.equal(raised.commitment.dailyMinor, 70000);
      await rejects(() => activateLaunch(l0._id, manager, deps), (e) => e instanceof ApprovalRequiredError && /approved again/.test(e.message), "stale approval");
      await approveLaunch(l0._id, manager, { note: "new amount" }, deps);
      await activateLaunch(l0._id, manager, deps);
      await rejects(() => editLaunch(l0._id, specialist, { adSets: { s1: { budgetMinor: 90000 } } }, deps), (e) => e instanceof ApprovalRequiredError, "raise while active");
      const lowerActive = await editLaunch(l0._id, specialist, { adSets: { s1: { budgetMinor: 60000 } } }, deps);
      assert.equal(lowerActive.commitment.dailyMinor, 60000);
      await rejects(() => editLaunch(l0._id, employee, { campaign: { name: "x" } }, deps), (e) => e instanceof ForbiddenError, "employee");
      await rejects(() => editLaunch(l0._id, specialist, { adSets: { s1: { budgetMinor: 100 } } }, deps), (e) => e instanceof LaunchValidationError, "below Meta minimum");
    });
    await t("editLaunch swaps the creative for new copy (new creative, ad repointed)", async () => {
      const l = (await listLaunches(main.c._id))[0];
      const before = l.objects.creatives[main.ad._id];
      const out = await editLaunch(l._id, specialist, { ads: { [main.ad._id]: { copy: { primaryText: "New text", headline: "New head" } } } }, deps);
      assert.notEqual(out.objects.creatives[main.ad._id], before);
      const ad = fake.objs.get(out.objects.ads[main.ad._id])!;
      assert.deepEqual(ad.payload.creative, { creative_id: out.objects.creatives[main.ad._id] });
    });

    await t("sync: statuses, review feedback notify once, snapshots upserted idempotently, run recorded", async () => {
      const l = (await listLaunches(main.c._id))[0];
      const adExt = l.objects.ads[main.ad._id];
      const o = fake.objs.get(adExt)!;
      o.effective = "DISAPPROVED";
      o.review = { global: { "Misleading claims": "Remove the guarantee" } };
      const n0 = notes.length;
      const r1 = await runAdsSync(deps);
      assert.equal(r1.launches, 1);
      assert.equal(r1.errors.length, 0, JSON.stringify(r1.errors));
      assert.ok(r1.snapshots > 0);
      assert.equal(notes.length, n0 + 1);
      assert.match(notes[notes.length - 1].title, /disapproved/i);
      assert.match(notes[notes.length - 1].body, /Misleading claims/);
      const col = await snapshotsCollection();
      const count1 = await col.countDocuments({ launchId: l._id });
      assert.ok(count1 > 0);
      const spend = await col.findOne({ launchId: l._id, level: "ad", metric: "spend" });
      assert.equal(spend!.value, 12.5);
      assert.equal(spend!.source, "meta_ads_insights");
      assert.equal(spend!.adId, main.ad._id);
      // second run: same window, nothing new
      const stored = await getLaunch(l._id);
      assert.equal(stored!.review[main.ad._id].effectiveStatus, "DISAPPROVED");
      await (await launchesCollection()).updateOne({ _id: l._id }, { $set: { lastSyncAt: new Date(T0 - 3_600_000) } });
      const r2 = await runAdsSync(deps);
      assert.equal(notes.length, n0 + 1, "no repeat notification");
      assert.equal(await col.countDocuments({ launchId: l._id }), count1, "snapshots not duplicated");
      assert.ok(r2.snapshots > 0);
      const runs = await (await import("../src/lib/products/viralpulse-ai/ads-platforms/ads-sync")).syncRunsCollection();
      assert.equal(await runs.countDocuments({}), 2);
    });
    await t("sync: paused in Meta is recorded and notified; recent launches are skipped; rate-limited account is deferred", async () => {
      const l = (await listLaunches(main.c._id))[0];
      fake.objs.get(l.objects.campaign!)!.status = "PAUSED";
      await (await launchesCollection()).updateOne({ _id: l._id }, { $set: { lastSyncAt: null } });
      const before = notes.length;
      await runAdsSync(deps);
      assert.equal((await getLaunch(l._id))!.delivery, "paused");
      assert.ok(notes.length > before && notes.some((n) => /paused in Meta/.test(n.title)));
      const skipped = await runAdsSync(deps);
      assert.equal(skipped.launches, 0, "synced a moment ago");
      await (await launchesCollection()).updateOne({ _id: l._id }, { $set: { lastSyncAt: null } });
      fake.inject = () => fake.errorRes(400, 80004, undefined, "too many");
      fake.usageHeader = JSON.stringify({ "1": [{ estimated_time_to_regain_access: 45 }] });
      const rl = await runAdsSync(deps);
      assert.equal(rl.skippedRateLimited >= 1, true);
      const d = await getLaunch(l._id);
      assert.ok(d!.syncDeferredUntil && d!.syncDeferredUntil.getTime() > T0);
      fake.inject = null;
      fake.usageHeader = null;
    });
    await t("snapshot upsert is idempotent and keeps the latest value", async () => {
      const row = { platform: "meta", externalId: "X1", level: "ad" as const, metric: "clicks", value: 5, date: "2026-11-01", source: "meta_ads_insights" };
      await upsertSnapshots([row, row]);
      await upsertSnapshots([{ ...row, value: 9 }]);
      const col = await snapshotsCollection();
      const rows = await col.find({ externalId: "X1" }).toArray();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].value, 9);
    });

    await t("failure with compensation: Meta rejects the ad set budget -> campaign removed, field error addressed, no orphans, can retry", async () => {
      const f = new FakeMeta();
      const d = makeDeps(f, notes);
      const { c } = await newCampaign("Rejected");
      f.inject = ({ method, path }) => (method === "POST" && path === "act_1/adsets" ? f.errorRes(400, 100, 1885272, "budget too low") : null);
      const out = await createLaunch(c._id, specialist, d);
      assert.equal(out.ok, false);
      assert.equal(out.launch.state, "rolled_back");
      assert.equal(out.launch.active, false);
      assert.ok(out.errors.some((e) => e.path === "meta.adSets[0].budget"), JSON.stringify(out.errors));
      assert.match(out.message ?? "", /budget is below Meta's minimum/);
      assert.equal(f.objs.size, 0, "campaign deleted, nothing left");
      assert.deepEqual(out.launch.compensation!.failed, []);
      assert.equal(out.launch.compensation!.deleted.length, 1);
      assert.equal(f.count("DELETE", /^\d+$/), 1);
      // fix and retry: a new launch is allowed
      f.inject = null;
      const again = await createLaunch(c._id, specialist, d);
      assert.equal(again.ok, true);
      assert.equal(f.ofKind("campaign").length, 1);
      assert.equal((await listLaunches(c._id)).length, 2);
    });
    await t("failure after several objects: ad rejected -> ad set, creative, campaign deleted newest first", async () => {
      const f = new FakeMeta();
      const d = makeDeps(f, notes);
      const { c } = await newCampaign("Rejected ad");
      f.inject = ({ method, path }) => (method === "POST" && path === "act_1/ads" ? f.errorRes(400, 100, 1815199, "ig access") : null);
      const out = await createLaunch(c._id, specialist, d);
      assert.equal(out.launch.state, "rolled_back");
      const dels = f.log.filter((l) => l.method === "DELETE").map((l) => l.path);
      assert.equal(dels.length, 3);
      assert.equal(f.objs.size, 0);
      assert.ok(out.errors.some((e) => e.path.startsWith(`ads[`) || e.path.startsWith("ads")), JSON.stringify(out.errors));
    });
    await t("compensation that cannot delete keeps the objects recorded on the launch and tells the admins", async () => {
      const f = new FakeMeta();
      const nn: typeof notes = [];
      const d = makeDeps(f, nn);
      const { c } = await newCampaign("Stuck");
      f.inject = ({ method, path }) => {
        if (method === "POST" && path === "act_1/ads") return f.errorRes(400, 100, 1815199, "ig access");
        if (method === "DELETE") return f.errorRes(400, 1, undefined, "cannot delete right now", {});
        return null;
      };
      const out = await createLaunch(c._id, specialist, d);
      assert.equal(out.launch.state, "partial");
      assert.equal(out.launch.active, true, "still tracked: nothing is orphaned silently");
      assert.ok(out.launch.compensation!.failed.length >= 1);
      assert.ok(out.launch.objects.campaign);
      assert.ok(nn.some((n) => /left objects behind/i.test(n.title)));
      f.inject = null;
      const rolled = await rollbackLaunch(out.launch._id, specialist, d);
      assert.equal(rolled.state, "rolled_back");
      assert.equal(f.objs.size, 0);
    });
    await t("temporary failure keeps progress (partial) and resume finishes without re-creating anything", async () => {
      const f = new FakeMeta();
      const d = makeDeps(f, notes);
      const { c } = await newCampaign("Resume me");
      let fail = true;
      f.inject = ({ method, path }) => (fail && method === "POST" && path === "act_1/adcreatives" ? f.errorRes(400, 80004, undefined, "slow down") : null);
      f.usageHeader = JSON.stringify({ "1": [{ estimated_time_to_regain_access: 40 }] });
      const out = await createLaunch(c._id, specialist, d);
      assert.equal(out.ok, false);
      assert.equal(out.launch.state, "partial");
      assert.ok(out.launch.objects.campaign && out.launch.objects.adSets.s1);
      assert.equal(f.count("DELETE", /^\d+$/), 0, "nothing deleted for a temporary problem");
      fail = false;
      f.usageHeader = null;
      const resumed = await resumeLaunch(out.launch._id, specialist, d);
      assert.equal(resumed.ok, true, resumed.message ?? "");
      assert.equal(f.ofKind("campaign").length, 1);
      assert.equal(f.ofKind("adset").length, 1);
      assert.equal(f.count("POST", /adimages/), 1, "image uploaded once");
      assert.equal(f.ofKind("ad").length, 1);
      assert.equal(resumed.launch.state, "ready");
    });
    await t("an ambiguous create (Meta executed it but answered 500) is adopted, not duplicated", async () => {
      const f = new FakeMeta();
      const d = makeDeps(f, notes);
      const { c } = await newCampaign("Ambiguous");
      let once = true;
      f.inject = ({ method, path }) => {
        if (method === "POST" && path === "act_1/adsets" && once) { once = false; return "ok-but-500"; }
        return null;
      };
      const out = await createLaunch(c._id, specialist, d);
      assert.equal(out.ok, true, out.message ?? "");
      assert.equal(f.ofKind("adset").length, 1, "no double create");
      assert.equal(out.launch.objects.adSets.s1, f.ofKind("adset")[0].id);
    });
    await t("video launch uploads chunks, uses video_data and the thumbnail image", async () => {
      const f = new FakeMeta();
      const d = makeDeps(f, notes);
      const { c } = await newCampaign("Video", { ad: { creativeType: "video" }, media: ["m_vid", "m_img"] });
      const out = await createLaunch(c._id, specialist, d);
      assert.equal(out.ok, true, out.message ?? JSON.stringify(out.errors));
      assert.ok(f.uploaded.finished);
      const cr = f.ofKind("creative")[0].payload.object_story_spec as { video_data: Record<string, unknown> };
      assert.equal(cr.video_data.video_id, "VID1");
      assert.ok(cr.video_data.image_hash);
    });
    await t("archive frees the campaign for a new launch; pauseAllRunning pauses what spends", async () => {
      const f = new FakeMeta();
      const d = makeDeps(f, notes);
      const { c } = await newCampaign("Archive me");
      const out = await createLaunch(c._id, specialist, d);
      await approveLaunch(out.launch._id, manager, {}, d);
      await activateLaunch(out.launch._id, manager, d);
      const r = await pauseAllRunning(manager, d);
      assert.equal(r.paused, 1);
      assert.equal(f.ofKind("campaign")[0].status, "PAUSED");
      await rejects(() => pauseAllRunning(specialist, d), (e) => e instanceof ForbiddenError, "permission");
      const arch = await archiveLaunch(out.launch._id, manager, d);
      assert.equal(arch.delivery, "archived");
      assert.equal(arch.active, false);
      assert.equal(f.ofKind("campaign")[0].status, "ARCHIVED");
      const next = await createLaunch(c._id, specialist, d);
      assert.equal(next.ok, true);
    });

    await t("manual tracking: refused for Facebook/Instagram, needs a reason elsewhere, labelled manually tracked", async () => {
      const { c } = await newCampaign("Manual");
      const g = await createAd(c._id, parseAdHeader({ platform: "google_ads", format: "image", name: "G" }, ["facebook", "google_ads"]), "u_admin");
      const fb = (await getAd((await (await adsCollection()).findOne({ campaignId: c._id, platform: "facebook" }))!._id))!;
      await rejects(() => markAdManuallyTracked(fb, { reason: "because", externalRef: "" }, manager), (e) => e instanceof SmmsInputError && /launches from the app/.test(e.message), "meta refused");
      await rejects(() => markAdManuallyTracked(g, { reason: "", externalRef: "" }, manager), (e) => e instanceof SmmsInputError, "reason");
      await rejects(() => markAdManuallyTracked(g, { reason: "Launched in Google Ads UI", externalRef: "" }, specialist), (e) => e instanceof ForbiddenError, "permission");
      const done = await markAdManuallyTracked(g, { reason: "Launched in Google Ads UI by Priya", externalRef: "123" }, manager);
      assert.equal(done.status, "published");
      assert.equal(done.manualTracking!.by, "u_manager");
      assert.match(done.manualTracking!.reason, /Priya/);
    });
  });

  await t("tenancy: another company sees no launches, guard or snapshots of the first", async () => {
    await runAsCompany("co_wp6a_other", async () => {
      resetLaunchIndexCacheForTests();
      resetSnapshotIndexCacheForTests();
      assert.equal(await (await launchesCollection()).countDocuments({}), 0);
      assert.equal(await (await snapshotsCollection()).countDocuments({}), 0);
      assert.deepEqual((await getGuard()).perCurrency, {});
      const none = await runAdsSync(makeDeps(new FakeMeta(), []));
      assert.equal(none.launches, 0);
      assert.equal(await getCampaign("legacy1"), null);
    });
    await runAsCompany(CO, async () => {
      resetLaunchIndexCacheForTests();
      assert.ok((await (await launchesCollection()).countDocuments({})) > 0);
    });
  });

  console.log(`\nviralpulse WP6a: ${pass} passed, ${fail} failed`);
  const client = await MongoClient.connect(uri);
  await client.db().dropDatabase();
  await client.close();
  process.exit(fail ? 1 : 0);
}
void main();
