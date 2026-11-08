/**
 * ViralPulse WP3a tests: publishers (HTTP-mocked), validators, caption/AI-disclosure, scheduling time zones, error mapping,
 * retry/backoff, attempt state machine, leases/idempotency and token redaction. Every provider call goes through a scripted fake
 * fetch; the database is a throwaway one (asserted, then dropped).
 * Run: npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-viralpulse-wp3.ts
 */
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "";
const dbName = uri.split("?")[0].split("/").pop() ?? "";
assert.ok(/zz_throwaway/.test(dbName), "refusing to run: MONGODB_URI must be a zz_throwaway_* database");

import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { classifyHttp, redact, ProviderError } from "../src/lib/products/viralpulse-ai/publishers/errors";
import { backoffMs } from "../src/lib/products/viralpulse-ai/publishers/retry";
import { zonedToUtc, checkSchedule, languageCodeFor, LocalTimeError } from "../src/lib/products/viralpulse-ai/publishers/schedule";
import { composeCaption, disclosureFor_, baseValidate, hasErrors } from "../src/lib/products/viralpulse-ai/publishers/validate";
import { PUBLISHER_MODULES } from "../src/lib/products/viralpulse-ai/publishers/index";
import { instagram } from "../src/lib/products/viralpulse-ai/publishers/instagram";
import { youtube, YT_CHUNK } from "../src/lib/products/viralpulse-ai/publishers/youtube";
import { linkedin, escapeCommentary } from "../src/lib/products/viralpulse-ai/publishers/linkedin";
import { x, splitThread } from "../src/lib/products/viralpulse-ai/publishers/x";
import { PendingProcessing, type MediaFacts, type PublishCtx, type PublishPost } from "../src/lib/products/viralpulse-ai/publishers/types";
import { ensureAttempt, claimAttempt, cancelAttempts, reopen, attemptsCol, type AttemptDoc } from "../src/lib/products/viralpulse-ai/publishers/attempts";
import { runAttempt, type EngineDeps, type RunInput } from "../src/lib/products/viralpulse-ai/publishers/engine";

let pass = 0;
let fail = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    pass++;
  } catch (e) {
    fail++;
    console.log("FAIL", name, "\n   ", e instanceof Error ? e.message.split("\n").slice(0, 6).join("\n    ") : e);
  }
};

const TOKEN = "TOKEN-SECRET-abcdef123456";
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

type Route = { m?: string; match: RegExp; res: (url: string, init: RequestInit) => Response | Promise<Response> };
function fakeFetch(routes: Route[]) {
  const calls: { method: string; url: string; body: string }[] = [];
  const f = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? "GET").toUpperCase();
    const body = typeof init.body === "string" ? init.body : init.body instanceof URLSearchParams ? init.body.toString() : init.body ? `<${(init.body as Uint8Array).byteLength ?? "bin"} bytes>` : "";
    calls.push({ method, url, body });
    const r = routes.find((x) => x.match.test(url) && (!x.m || x.m === method));
    if (!r) throw new Error(`unexpected request ${method} ${url}`);
    return r.res(url, init);
  }) as typeof fetch;
  return { f, calls };
}

const media = (o: Partial<MediaFacts> = {}): MediaFacts => ({ id: "m1", kind: "image", name: "pic.png", contentType: "image/png", size: 1000, width: 1080, height: 1080, durationSec: null, altText: "", aiGenerated: false, aiDisclosureRequired: false, ...o });
const video = (o: Partial<MediaFacts> = {}) => media({ id: "v1", kind: "video", name: "clip.mp4", contentType: "video/mp4", size: 5000, width: 1080, height: 1920, durationSec: 30, ...o });
const post = (o: Partial<PublishPost> = {}): PublishPost => ({ id: "p1", title: "T", link: null, languageCode: "en", variant: { title: "Title", text: "Hello world", hashtags: ["a"], keywords: ["k"], cta: "" }, caption: "Hello world #a", aiNative: false, options: {}, ...o });

function mkCtx(f: typeof fetch, o: Partial<PublishCtx> & { platform: PublishCtx["platform"] }): PublishCtx & { store: Record<string, unknown>; logs: string[] } {
  const store: Record<string, unknown> = { ...(o.data ?? {}) };
  const logs: string[] = [];
  const ctx = {
    post: post(), images: [], video: null, thumbnail: null,
    creds: { token: TOKEN, targetId: "T1", accountId: "acct", extra: { graph: "https://graph.test/v1", version: "202610" } },
    data: store, committed: false, scheduleAt: null,
    publicUrl: async (id: string, opts?: { jpeg?: boolean }) => `https://site.test/media/${id}${opts?.jpeg ? "?fmt=jpeg" : ""}`,
    openStream: async () => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(100)); c.close(); } }),
    imageBytes: async () => ({ bytes: Buffer.alloc(100), contentType: "image/jpeg" }),
    fetch: f, sleep: async () => {}, now: () => new Date("2026-11-02T10:00:00Z"),
    log: (e: string, fl?: Record<string, unknown>) => void logs.push(JSON.stringify({ e, ...fl })), noteRequestId: () => {},
    async checkpoint(p: Record<string, unknown>) { for (const [k, v] of Object.entries(p)) { if (v == null) delete store[k]; else store[k] = v; } },
    async markCommitPoint() { (ctx as { committed: boolean }).committed = true; },
    store, logs, ...o,
  } as unknown as PublishCtx & { store: Record<string, unknown>; logs: string[] };
  return ctx;
}

async function main() {
  // ── pure ────────────────────────────────────────────────────────────────────
  await t("zonedToUtc: India has no DST", () => assert.equal(zonedToUtc("2026-11-05T09:30", "Asia/Kolkata").toISOString(), "2026-11-05T04:00:00.000Z"));
  await t("zonedToUtc: spring-forward gap rejected", () => assert.throws(() => zonedToUtc("2026-03-29T02:30", "Europe/Berlin"), LocalTimeError));
  await t("zonedToUtc: fall-back picks first occurrence", () => assert.equal(zonedToUtc("2026-10-25T02:30", "Europe/Berlin").toISOString(), "2026-10-25T00:30:00.000Z"));
  await t("zonedToUtc: New York winter/summer offsets", () => {
    assert.equal(zonedToUtc("2026-01-15T12:00", "America/New_York").toISOString(), "2026-01-15T17:00:00.000Z");
    assert.equal(zonedToUtc("2026-07-15T12:00", "America/New_York").toISOString(), "2026-07-15T16:00:00.000Z");
  });
  await t("zonedToUtc: bad zone / format", () => {
    assert.throws(() => zonedToUtc("2026-01-01T10:00", "Mars/Base"), LocalTimeError);
    assert.throws(() => zonedToUtc("tomorrow", "Asia/Kolkata"), LocalTimeError);
  });
  await t("checkSchedule: past, near, native window", () => {
    const now = new Date("2026-11-02T10:00:00Z");
    assert.equal(checkSchedule(new Date("2026-11-02T09:00:00Z"), now).ok, false);
    assert.equal(checkSchedule(new Date("2026-11-02T10:00:30Z"), now).ok, false);
    assert.deepEqual([checkSchedule(new Date("2026-11-02T10:05:00Z"), now).ok, checkSchedule(new Date("2026-11-02T10:05:00Z"), now).nativeOk], [true, false]);
    assert.equal(checkSchedule(new Date("2026-11-10T10:00:00Z"), now).nativeOk, true);
    assert.equal(checkSchedule(new Date("2026-12-31T10:00:00Z"), now).nativeOk, false);
  });
  await t("languageCodeFor", () => { assert.equal(languageCodeFor("Hindi"), "hi"); assert.equal(languageCodeFor("English (India)"), "en"); assert.equal(languageCodeFor("xx-unknown"), "en"); });

  await t("backoff: exponential with jitter, honours Retry-After, capped", () => {
    assert.equal(backoffMs(1, { rand: () => 1 }), 30_000);
    assert.equal(backoffMs(3, { rand: () => 0 }), 60_000);
    assert.equal(backoffMs(1, { rand: () => 0, retryAfterMs: 600_000 }), 600_000);
    assert.equal(backoffMs(20, { rand: () => 1 }), 3 * 3600_000);
  });

  await t("error mapping", () => {
    const c = (s: number, b: unknown, h?: Record<string, string>) => classifyHttp("Instagram", s, b, new Headers(h));
    assert.equal(c(429, {}, { "retry-after": "120" }).retryAfterMs, 120_000);
    assert.equal(c(429, {}).klass, "rate_limit");
    assert.equal(c(400, { error: { message: "Error validating access token", code: 190 } }).klass, "auth");
    assert.equal(c(400, { error: { message: "x", code: 4 } }).klass, "rate_limit");
    assert.equal(c(403, { error: { message: "Permission denied", code: 200 } }).klass, "auth");
    assert.equal(c(400, { error: { message: "The aspect ratio is not supported", code: 36003 } }).klass, "media");
    assert.equal(c(400, { error: { message: "Media file too large" } }).klass, "media");
    assert.equal(c(503, {}).klass, "transient");
    assert.equal(c(403, { error: { message: "q", errors: [{ reason: "quotaExceeded" }] } }).klass, "rate_limit");
    assert.ok(c(401, {}).hint.toLowerCase().includes("reconnect"));
  });
  await t("redact removes tokens", () => {
    const s = redact(`https://x/?access_token=${TOKEN}&a=1 Bearer ${TOKEN} {"access_token":"${TOKEN}"}`);
    assert.ok(!s.includes(TOKEN), s);
    assert.ok(!new ProviderError({ klass: "auth", message: `fail access_token=${TOKEN}`, hint: "" }).message.includes(TOKEN));
  });

  await t("caption: hashtags + AI suffix kept, body trimmed on a boundary", () => {
    const d = disclosureFor_("instagram", { nativeAiLabel: true }, [video({ aiGenerated: true, aiDisclosureRequired: true })], {});
    assert.equal(d.mode, "suffix"); assert.equal(d.nativeFlag, true);
    const body = "Sentence one is here. ".repeat(200);
    const r = composeCaption("instagram", { text: body, hashtags: ["x", "y"] }, null, 300, d);
    assert.ok(r.truncated && r.text.length <= 300 && r.text.includes("#x #y") && r.text.includes("AI-generated"), r.text);
  });
  await t("AI disclosure: video can never be switched off; image on a label-less platform can", () => {
    assert.equal(disclosureFor_("linkedin", { nativeAiLabel: false }, [video({ aiGenerated: true, aiDisclosureRequired: true })], { aiDisclosureOff: true }).mode, "suffix");
    assert.equal(disclosureFor_("linkedin", { nativeAiLabel: false }, [media({ aiGenerated: true, aiDisclosureRequired: true })], { aiDisclosureOff: true }).mode, "off");
    assert.equal(disclosureFor_("instagram", { nativeAiLabel: true }, [media({ aiGenerated: true, aiDisclosureRequired: true })], { aiDisclosureOff: true }).mode, "suffix");
    assert.equal(disclosureFor_("instagram", { nativeAiLabel: true }, [media()], {}).mode, "none");
  });

  await t("validators: fixtures", () => {
    const ig = (p: PublishPost, m: Parameters<typeof instagram.validate>[1]) => instagram.validate(p, m);
    assert.ok(ig(post(), { images: [], video: null, thumbnail: null }).some((i) => i.code === "media_required"));
    assert.ok(ig(post({ caption: "x".repeat(2300) }), { images: [media()], video: null, thumbnail: null }).some((i) => i.code === "caption_too_long"));
    assert.ok(ig(post(), { images: [media({ width: 1080, height: 300 })], video: null, thumbnail: null }).some((i) => i.code === "aspect_out_of_range"));
    assert.ok(ig(post(), { images: [media()], video: null, thumbnail: null }).some((i) => i.code === "converted_to_jpeg"));
    assert.equal(hasErrors(ig(post(), { images: [media({ contentType: "image/jpeg" })], video: null, thumbnail: null })), false);
    assert.ok(ig(post({ options: { instagram: { format: "reel" } } }), { images: [], video: video({ durationSec: 1 }), thumbnail: null }).some((i) => i.code === "duration_out_of_range" && i.severity === "warning"));
    const fbReel = PUBLISHER_MODULES.facebook.validate(post({ options: { facebook: { format: "reel" } } }), { images: [], video: video({ width: 400, height: 700, durationSec: 100 }), thumbnail: null });
    assert.ok(fbReel.some((i) => i.code === "reel_resolution" && i.severity === "error") && fbReel.some((i) => i.code === "duration_out_of_range" && i.severity === "error"));
    const yt = youtube.validate(post(), { images: [], video: video(), thumbnail: null }).map((i) => i.code);
    assert.ok(yt.includes("made_for_kids") && yt.includes("private_default"));
    assert.ok(!youtube.validate(post({ options: { youtube: { madeForKids: false, privacy: "unlisted" } } }), { images: [], video: video(), thumbnail: null }).some((i) => i.severity === "error"));
    assert.ok(linkedin.validate(post({ link: "http://x.com" }), { images: [], video: null, thumbnail: null }).some((i) => i.code === "link_not_https"));
    assert.ok(x.validate(post({ caption: "y".repeat(400) }), { images: [], video: null, thumbnail: null }).some((i) => i.code === "x_too_long"));
    assert.ok(baseValidate(PUBLISHER_MODULES.google_business.capabilities, post(), { images: [], video: video(), thumbnail: null }).some((i) => i.code === "video_unsupported"));
  });

  // ── Instagram adapter ───────────────────────────────────────────────────────
  const igRoutes = (statusSeq: string[], extra: Route[] = []): Route[] => [
    ...extra,
    { match: /content_publishing_limit/, res: () => json({ data: [{ quota_usage: 3, config: { quota_total: 100 } }] }) },
    { m: "POST", match: /\/T1\/media$/, res: () => json({ id: "C1" }) },
    { match: /\/C1\?/, res: () => json({ status_code: statusSeq.shift() ?? "FINISHED" }) },
    { m: "POST", match: /media_publish/, res: () => json({ id: "M1" }) },
    { match: /\/M1\?/, res: () => json({ permalink: "https://instagram.com/p/abc/" }) },
  ];
  await t("instagram: image flow uses JPEG url, alt text, AI flag; no token in logs", async () => {
    const { f, calls } = fakeFetch(igRoutes([]));
    const ctx = mkCtx(f, { platform: "instagram", images: [media({ altText: "a cat" })], post: post({ aiNative: true }) });
    const r = await instagram.publish(ctx);
    assert.deepEqual([r.externalId, r.url], ["M1", "https://instagram.com/p/abc/"]);
    const create = calls.find((c) => /\/T1\/media$/.test(c.url))!;
    assert.ok(create.body.includes("fmt%3Djpeg") && create.body.includes("alt_text=a+cat") && create.body.includes("is_ai_generated=true"), create.body);
    assert.ok(ctx.committed);
    assert.ok(!ctx.logs.join("\n").includes(TOKEN));
  });
  await t("instagram: carousel children then container; reel uses REELS + share_to_feed", async () => {
    const { f, calls } = fakeFetch(igRoutes([]));
    await instagram.publish(mkCtx(f, { platform: "instagram", images: [media({ id: "a" }), media({ id: "b" })] }));
    assert.equal(calls.filter((c) => /\/T1\/media$/.test(c.url)).length, 3);
    assert.ok(calls.some((c) => c.body.includes("media_type=CAROUSEL") && c.body.includes("children=C1%2CC1")));
    const r2 = fakeFetch(igRoutes([]));
    await instagram.publish(mkCtx(r2.f, { platform: "instagram", video: video(), post: post({ options: { instagram: { shareToFeed: false } } }) }));
    assert.ok(r2.calls.some((c) => c.body.includes("media_type=REELS") && c.body.includes("share_to_feed=false")));
  });
  await t("instagram: still processing -> pending, container reused (no duplicate container)", async () => {
    const seq = ["IN_PROGRESS"];
    const { f, calls } = fakeFetch(igRoutes(seq));
    const ctx = mkCtx(f, { platform: "instagram", images: [media()] });
    await assert.rejects(() => instagram.publish(ctx), PendingProcessing);
    assert.equal(ctx.store.containerId, "C1");
    const ctx2 = mkCtx(f, { platform: "instagram", images: [media()], data: ctx.store });
    const r = await instagram.publish(ctx2);
    assert.equal(r.externalId, "M1");
    assert.equal(calls.filter((c) => /\/T1\/media$/.test(c.url)).length, 1, "container created once");
  });
  await t("instagram: ERROR container -> media error; quota exhausted -> rate_limit", async () => {
    const { f } = fakeFetch(igRoutes(["ERROR"]));
    await assert.rejects(() => instagram.publish(mkCtx(f, { platform: "instagram", images: [media()] })), (e: ProviderError) => e.klass === "media");
    const q = fakeFetch([{ match: /content_publishing_limit/, res: () => json({ data: [{ quota_usage: 100, config: { quota_total: 100 } }] }) }]);
    await assert.rejects(() => instagram.publish(mkCtx(q.f, { platform: "instagram", images: [media()] })), (e: ProviderError) => e.klass === "rate_limit");
  });
  await t("instagram: reconcile after lost media_publish response", async () => {
    const ok = fakeFetch([
      { match: /\/C1\?/, res: () => json({ status_code: "PUBLISHED" }) },
      { match: /\/T1\/media\?/, res: () => json({ data: [{ id: "M9", timestamp: "2026-11-02T10:00:05+0000", caption: "Hello world #a" }] }) },
      { match: /\/M9\?/, res: () => json({ permalink: "https://instagram.com/p/z/" }) },
    ]);
    const r = await instagram.reconcile!(mkCtx(ok.f, { platform: "instagram", data: { containerId: "C1", containerAt: "2026-11-02T09:59:00Z" }, committed: true }));
    assert.equal(r?.externalId, "M9");
    const none = fakeFetch([{ match: /\/C1\?/, res: () => json({ status_code: "FINISHED" }) }]);
    assert.equal(await instagram.reconcile!(mkCtx(none.f, { platform: "instagram", data: { containerId: "C1" }, committed: true })), null);
  });
  await t("http: 401 refreshes once; 429 Retry-After retried for GETs; 5xx/timeout classified", async () => {
    let n = 0;
    const a = fakeFetch([{ match: /content_publishing_limit/, res: (_u) => (String(_u).includes("access_token=NEW") ? json({ data: [] }) : json({ error: { message: "expired", code: 190 } }, 401)) }, ...igRoutes([]).slice(1)]);
    const ctx = mkCtx(a.f, { platform: "instagram", images: [media()] });
    ctx.creds.refresh = async () => "NEW";
    await instagram.publish(ctx);
    assert.equal(ctx.creds.token, "NEW");
    const b = fakeFetch([{ match: /content_publishing_limit/, res: () => (n++ === 0 ? json({}, 429, { "retry-after": "2" }) : json({ data: [] })) }, ...igRoutes([]).slice(1)]);
    const sleeps: number[] = [];
    await instagram.publish(mkCtx(b.f, { platform: "instagram", images: [media()], sleep: async (ms: number) => void sleeps.push(ms) }));
    assert.ok(sleeps[0] >= 2000, `slept ${sleeps}`);
    const c = fakeFetch([{ match: /content_publishing_limit/, res: () => json({ data: [] }) }, { m: "POST", match: /\/T1\/media$/, res: () => json({ error: { message: "boom" } }, 500) }]);
    await assert.rejects(() => instagram.publish(mkCtx(c.f, { platform: "instagram", images: [media()] })), (e: ProviderError) => e.klass === "transient");
    const d = (async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); }) as unknown as typeof fetch;
    await assert.rejects(() => instagram.publish(mkCtx(d, { platform: "instagram", images: [media()] })), (e: ProviderError) => e.klass === "transient" && e.code === "timeout");
  });

  // ── YouTube ─────────────────────────────────────────────────────────────────
  const bigStream = (n: number) => async () => { let sent = 0; return new ReadableStream<Uint8Array>({ pull(c) { const k = Math.min(1 << 20, n - sent); if (k <= 0) return c.close(); c.enqueue(new Uint8Array(k)); sent += k; } }); };
  await t("youtube: resumable upload in chunks, private default, synthetic flag, thumbnail", async () => {
    const size = YT_CHUNK + 1024;
    const ranges: string[] = [];
    const { f, calls } = fakeFetch([
      { m: "POST", match: /uploadType=resumable/, res: () => new Response("{}", { status: 200, headers: { location: "https://up.test/session1" } }) },
      { m: "PUT", match: /up\.test\/session1/, res: (_u, init) => {
        const cr = (init.headers as Record<string, string>)["Content-Range"]; ranges.push(cr);
        if (cr.startsWith("bytes */")) return new Response(null, { status: 308 });
        return cr.endsWith(`-${size - 1}/${size}`) ? json({ id: "YT1" }) : new Response(null, { status: 308, headers: { range: `bytes=0-${YT_CHUNK - 1}` } });
      } },
      { m: "POST", match: /thumbnails\/set/, res: () => json({}) },
    ]);
    const ctx = mkCtx(f, { platform: "youtube", video: video({ size }), thumbnail: media({ id: "th" }), post: post({ aiNative: true, options: { youtube: { madeForKids: false } } }), openStream: bigStream(size) });
    const r = await youtube.publish(ctx);
    assert.equal(r.externalId, "YT1");
    const init = JSON.parse(calls[0].body);
    assert.equal(init.status.privacyStatus, "private"); assert.equal(init.status.containsSyntheticMedia, true); assert.equal(init.status.selfDeclaredMadeForKids, false);
    assert.ok(init.snippet.description.includes("#Shorts"));
    assert.deepEqual(ranges.slice(1), [`bytes 0-${YT_CHUNK - 1}/${size}`, `bytes ${YT_CHUNK}-${size - 1}/${size}`]);
    assert.ok(calls.some((c) => /thumbnails\/set/.test(c.url)));
  });
  await t("youtube: resume skips bytes the session already holds; scheduled uses publishAt + private", async () => {
    const size = YT_CHUNK + 1024;
    const ranges: string[] = [];
    const { f } = fakeFetch([{ m: "PUT", match: /session1/, res: (_u, init) => {
      const cr = (init.headers as Record<string, string>)["Content-Range"]; ranges.push(cr);
      return cr.startsWith("bytes */") ? new Response(null, { status: 308, headers: { range: `bytes=0-${YT_CHUNK - 1}` } }) : json({ id: "YT2" });
    } }]);
    const r = await youtube.publish(mkCtx(f, { platform: "youtube", video: video({ size }), data: { uploadUrl: "https://up.test/session1" }, openStream: bigStream(size) }));
    assert.equal(r.externalId, "YT2");
    assert.deepEqual(ranges.slice(1), [`bytes ${YT_CHUNK}-${size - 1}/${size}`]);
    const s = fakeFetch([{ m: "POST", match: /resumable/, res: () => new Response("{}", { headers: { location: "https://up.test/s3" } }) }, { m: "PUT", match: /s3/, res: () => json({ id: "YT3" }) }]);
    await youtube.publish(mkCtx(s.f, { platform: "youtube", video: video({ size: 10 }), scheduleAt: new Date("2026-12-01T10:00:00Z"), post: post({ options: { youtube: { privacy: "public", madeForKids: false } } }) }));
    const b = JSON.parse(s.calls[0].body);
    assert.equal(b.status.privacyStatus, "private"); assert.equal(b.status.publishAt, "2026-12-01T10:00:00.000Z");
  });
  await t("youtube: thumbnail failure is a warning, not a lost video", async () => {
    const { f } = fakeFetch([{ m: "POST", match: /resumable/, res: () => new Response("{}", { headers: { location: "https://up.test/s4" } }) }, { m: "PUT", match: /s4/, res: () => json({ id: "YT4" }) }, { match: /thumbnails/, res: () => json({ error: { message: "bad" } }, 400) }]);
    const r = await youtube.publish(mkCtx(f, { platform: "youtube", video: video({ size: 10 }), thumbnail: media({ id: "th" }), post: post({ options: { youtube: { madeForKids: true } } }) }));
    assert.equal(r.externalId, "YT4"); assert.ok(r.warnings?.[0].includes("Thumbnail"));
  });

  // ── LinkedIn ────────────────────────────────────────────────────────────────
  await t("linkedin: escaping, image post via Posts API with version headers", async () => {
    assert.equal(escapeCommentary("Save (20%) #deal @you_now"), "Save \\(20%\\) #deal @you\\_now");
    const { f, calls } = fakeFetch([
      { match: /images\?action=initializeUpload/, res: () => json({ value: { uploadUrl: "https://li.test/up", image: "urn:li:image:1" } }) },
      { m: "PUT", match: /li\.test\/up/, res: () => new Response(null, { status: 201 }) },
      { m: "POST", match: /\/rest\/posts$/, res: () => new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:99" } }) },
    ]);
    const r = await linkedin.publish(mkCtx(f, { platform: "linkedin", images: [media({ altText: "alt" })], creds: { token: TOKEN, targetId: "urn:li:organization:5", accountId: "a", extra: { version: "202610" } } }));
    assert.equal(r.url, "https://www.linkedin.com/feed/update/urn:li:share:99/");
    const body = JSON.parse(calls.at(-1)!.body);
    assert.equal(body.author, "urn:li:organization:5"); assert.equal(body.content.media.id, "urn:li:image:1"); assert.equal(body.content.media.altText, "alt");
  });
  await t("linkedin: video parts streamed, etags finalised, waits for AVAILABLE", async () => {
    const size = 4 * 1024 * 1024 + 10;
    let avail = false;
    const { f, calls } = fakeFetch([
      { match: /videos\?action=initializeUpload/, res: () => json({ value: { video: "urn:li:video:V", uploadToken: "", uploadInstructions: [{ uploadUrl: "https://li.test/p1", firstByte: 0, lastByte: 4194303 }, { uploadUrl: "https://li.test/p2", firstByte: 4194304, lastByte: size - 1 }] } }) },
      { m: "PUT", match: /li\.test\/p(\d)/, res: (u) => new Response(null, { status: 200, headers: { etag: `"e${u.slice(-1)}"` } }) },
      { match: /action=finalizeUpload/, res: () => json({}) },
      { m: "GET", match: /videos\/urn/, res: () => json({ status: avail ? "AVAILABLE" : "PROCESSING" }) },
      { m: "POST", match: /\/rest\/posts$/, res: () => new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:7" } }) },
    ]);
    const ctx = mkCtx(f, { platform: "linkedin", video: video({ size }), openStream: bigStream(size) });
    await assert.rejects(() => linkedin.publish(ctx), PendingProcessing);
    avail = true;
    const r = await linkedin.publish(mkCtx(f, { platform: "linkedin", video: video({ size }), data: ctx.store }));
    assert.equal(r.externalId, "urn:li:share:7");
    assert.equal(calls.filter((c) => /li\.test\/p\d/.test(c.url)).length, 2, "each part uploaded once");
    assert.deepEqual(JSON.parse(calls.find((c) => /finalizeUpload/.test(c.url))!.body).finalizeUploadRequest.uploadedPartIds, ['"e1"', '"e2"']);
  });

  // ── X ───────────────────────────────────────────────────────────────────────
  await t("x: thread split within limit; replies chained; media via chunked flow", async () => {
    const parts = splitThread("Sentence number one is here. ".repeat(30));
    assert.ok(parts.length > 1 && parts.every((p) => p.length <= 280));
    let n = 0;
    const { f, calls } = fakeFetch([
      { match: /media\/upload\/initialize/, res: () => json({ data: { id: "MED1" } }) },
      { match: /MED1\/append/, res: () => json({}) },
      { match: /MED1\/finalize/, res: () => json({ data: {} }) },
      { m: "POST", match: /\/2\/tweets$/, res: () => json({ data: { id: `TW${++n}` } }, 201) },
    ]);
    const ctx = mkCtx(f, { platform: "x", images: [media({ contentType: "image/jpeg" })], post: post({ caption: "Sentence number one is here. ".repeat(30), options: { x: { thread: true } } }) });
    const r = await x.publish(ctx);
    assert.equal(r.externalId, "TW1"); assert.equal(r.extraIds?.thread?.split(",").length, parts.length);
    const tw = calls.filter((c) => /\/2\/tweets$/.test(c.url)).map((c) => JSON.parse(c.body));
    assert.ok(tw[0].media.media_ids[0] === "MED1" && tw[1].reply.in_reply_to_tweet_id === "TW1");
    assert.equal(JSON.parse(calls[0].body).media_category, "tweet_image");
  });
  await t("x: unconfirmed tweet is ambiguous, never re-sent", async () => {
    const { f, calls } = fakeFetch([]);
    await assert.rejects(() => x.publish(mkCtx(f, { platform: "x", data: { sending: 0, mediaIds: [] } })), (e: ProviderError) => e.klass === "ambiguous");
    assert.equal(calls.length, 0);
  });

  // ── engine + attempts (throwaway Mongo) ────────────────────────────────────
  const logsSeen: string[] = [];
  const orig = console.log;
  const mkDeps = (f: typeof fetch, o: Partial<EngineDeps> = {}, input?: Partial<RunInput>): EngineDeps => ({
    loadInput: async () => ({ post: post({ options: {} }), images: [media({ contentType: "image/jpeg" })], video: null, thumbnail: null, scheduleAt: null, disclosure: { mode: "none", nativeFlag: false, reason: "" }, ...input }),
    credentials: async () => ({ token: TOKEN, targetId: "urn:li:person:1", accountId: "acct1", extra: { version: "202610" } }),
    platformEnabled: async () => ({ ok: true }),
    publicUrl: async (id) => `https://site.test/${id}`,
    openStream: async () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array(10)); c.close(); } }),
    imageBytes: async () => ({ bytes: Buffer.alloc(10), contentType: "image/jpeg" }),
    reportAccountError: async () => {}, fetch: f, sleep: async () => {}, now: () => new Date(),
    log: (e, fl) => void logsSeen.push(JSON.stringify({ e, ...fl })), ...o,
  });
  const liOk = (counter: { posts: number }): Route[] => [
    { match: /images\?action=initializeUpload/, res: () => json({ value: { uploadUrl: "https://li.test/up", image: "urn:li:image:1" } }) },
    { m: "PUT", match: /li\.test\/up/, res: () => new Response(null, { status: 201 }) },
    { m: "POST", match: /\/rest\/posts$/, res: () => { counter.posts++; return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:1" } }); } },
  ];
  const claimed = async (postId: string, platform: "linkedin" | "instagram" | "x" = "linkedin", max = 5) => {
    const { attempt } = await ensureAttempt({ postId, platform, mode: "now", maxAttempts: max });
    const a = await claimAttempt(attempt._id, "w1");
    assert.ok(a, "claim");
    return a as AttemptDoc;
  };

  await runAsCompany("co_wp3", async () => {
    await t("attempt: concurrent ensure creates exactly one; concurrent claim has one winner", async () => {
      const res = await Promise.all(Array.from({ length: 12 }, () => ensureAttempt({ postId: "race1", platform: "linkedin", mode: "now" })));
      assert.equal(new Set(res.map((r) => r.attempt._id)).size, 1);
      assert.equal(res.filter((r) => r.created).length, 1);
      assert.equal(await (await attemptsCol()).countDocuments({ postId: "race1" }), 1);
      const id = res[0].attempt._id;
      const wins = await Promise.all(Array.from({ length: 10 }, (_, i) => claimAttempt(id, `w${i}`)));
      assert.equal(wins.filter(Boolean).length, 1);
    });
    await t("engine: success publishes once; second request is a duplicate and sends nothing", async () => {
      const counter = { posts: 0 };
      const { f } = fakeFetch(liOk(counter));
      const a = await claimed("dup1");
      const out = await runAttempt(a, mkDeps(f));
      assert.equal(out.kind, "published");
      const again = await ensureAttempt({ postId: "dup1", platform: "linkedin", mode: "now" });
      assert.equal(again.attempt.state, "published"); assert.equal(again.created, false);
      assert.equal(await claimAttempt(again.attempt._id, "w2"), null);
      assert.equal(counter.posts, 1);
    });
    await t("engine: 429 Retry-After -> queued with backoff >= retry-after, attempts counted; max attempts -> failed", async () => {
      const { f } = fakeFetch([{ match: /images\?action=initializeUpload/, res: () => json({}, 429, { "retry-after": "900" }) }]);
      const a = await claimed("rl1", "linkedin", 2);
      const t0 = Date.now();
      const out = await runAttempt(a, mkDeps(f));
      assert.equal(out.kind, "retry");
      if (out.kind === "retry") { assert.equal(out.attempt.state, "queued"); assert.ok(out.attempt.nextAttemptAt!.getTime() - t0 >= 899_000); assert.equal(out.attempt.attempts, 1); }
      const a2 = await claimAttempt(a._id, "w3", new Date(Date.now() + 3 * 3600_000));
      const out2 = await runAttempt(a2!, mkDeps(f));
      assert.equal(out2.kind, "failed");
      if (out2.kind === "failed") assert.equal(out2.attempt.errorClass, "rate_limit");
    });
    await t("engine: auth error is terminal with a reconnect hint and reports the account", async () => {
      let reported = "";
      const { f } = fakeFetch([{ match: /images\?action=initializeUpload/, res: () => json({ message: "bad token" }, 401) }]);
      const out = await runAttempt(await claimed("auth1"), mkDeps(f, { reportAccountError: async (_p, m, id) => void (reported = `${id}:${m}`) }));
      assert.equal(out.kind, "failed");
      if (out.kind === "failed") assert.ok(out.error.hint.toLowerCase().includes("reconnect"));
      assert.ok(reported.startsWith("acct1:"));
    });
    await t("engine: validation errors block before any provider call", async () => {
      const { f, calls } = fakeFetch([]);
      const out = await runAttempt(await claimed("val1"), mkDeps(f, {}, { images: [], post: post({ caption: "" }) }));
      assert.equal(out.kind, "failed"); assert.equal(calls.length, 0);
    });
    await t("engine: instagram partial success resumes with the saved container (no second container)", async () => {
      let publishFails = true;
      const { f, calls } = fakeFetch(igRoutes([], [{ m: "POST", match: /media_publish/, res: () => (publishFails ? json({ error: { message: "oops" } }, 500) : json({ id: "M1" })) }]));
      const deps = mkDeps(f, { credentials: async () => ({ token: TOKEN, targetId: "T1", accountId: "ig", extra: { graph: "https://graph.test/v1" } }) });
      const a = await claimed("ig1", "instagram");
      const o1 = await runAttempt(a, deps);
      // 500 at the commit point on a non-idempotent POST is retried only after reconcile: container not published -> resend
      assert.equal(o1.kind, "retry");
      publishFails = false;
      const a2 = await claimAttempt(a._id, "w9", new Date(Date.now() + 3600_000));
      assert.equal(a2!.committed, true);
      const route = igRoutes([]);
      void route;
      const { f: f2, calls: calls2 } = fakeFetch(igRoutes([], [{ m: "POST", match: /media_publish/, res: () => json({ id: "M1" }) }, { match: /\/C1\?fields=status_code%2Cstatus/, res: () => json({ status_code: "FINISHED" }) }]));
      const o2 = await runAttempt(a2!, mkDeps(f2, { credentials: async () => ({ token: TOKEN, targetId: "T1", accountId: "ig", extra: { graph: "https://graph.test/v1" } }) }));
      assert.equal(o2.kind, "published");
      assert.equal(calls.filter((c) => /\/T1\/media$/.test(c.url)).length + calls2.filter((c) => /\/T1\/media$/.test(c.url)).length, 1, "one container overall");
    });
    await t("engine: committed LinkedIn publish with lost response is ambiguous and not re-sent until forced", async () => {
      const counter = { posts: 0 };
      const { f } = fakeFetch(liOk(counter));
      const { attempt } = await ensureAttempt({ postId: "amb1", platform: "linkedin", mode: "now" });
      await (await attemptsCol()).updateOne({ _id: attempt._id }, { $set: { committed: true } });
      const out = await runAttempt((await claimAttempt(attempt._id, "w1"))!, mkDeps(f));
      assert.equal(out.kind, "failed");
      if (out.kind === "failed") assert.equal(out.error.klass, "ambiguous");
      assert.equal(counter.posts, 0);
      await reopen(attempt._id, { force: true });
      const out2 = await runAttempt((await claimAttempt(attempt._id, "w2"))!, mkDeps(f));
      assert.equal(out2.kind, "published"); assert.equal(counter.posts, 1);
    });
    await t("engine: cancel stops a waiting attempt; lease expiry lets another worker take over", async () => {
      const { attempt } = await ensureAttempt({ postId: "can1", platform: "linkedin", mode: "scheduled" });
      assert.equal(await cancelAttempts("can1"), 1);
      assert.equal(await claimAttempt(attempt._id, "w"), null);
      const e2 = await ensureAttempt({ postId: "lease1", platform: "linkedin", mode: "now" });
      assert.ok(await claimAttempt(e2.attempt._id, "wA"));
      assert.equal(await claimAttempt(e2.attempt._id, "wB"), null);
      assert.ok(await claimAttempt(e2.attempt._id, "wB", new Date(Date.now() + 10 * 60_000)), "expired lease can be taken");
    });
    await t("engine: platform disabled / skip / processing states", async () => {
      const { f } = fakeFetch([]);
      const d = await runAttempt(await claimed("dis1"), mkDeps(f, { platformEnabled: async () => ({ ok: false, reason: "off", hint: "turn on" }) }));
      assert.equal(d.kind, "failed");
      const s = await runAttempt(await claimed("skip1"), mkDeps(f, {}, { skip: "The post was deleted." }));
      assert.equal(s.kind, "cancelled");
    });
    await t("no secrets in any log line or stored attempt", async () => {
      const all = JSON.stringify(await (await attemptsCol()).find({}).toArray()) + logsSeen.join("\n");
      assert.ok(!all.includes(TOKEN));
    });
  });
  console.log = orig;
  console.log(`viralpulse wp3: ${pass} passed, ${fail} failed`);
}

main()
  .catch((e) => { fail++; console.error(e); })
  .finally(async () => {
    try { const c = await MongoClient.connect(uri); await c.db().dropDatabase(); await c.close(); } catch { /* ignore */ }
    process.exit(fail ? 1 : 0);
  });
