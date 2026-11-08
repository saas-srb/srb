/**
 * ViralPulse WP0 tests: model verification + fallback, image price math, LinkedIn version window, OAuth redirect helper, health
 * aggregation, ffmpeg feature parsing, Gemini model status and the demo-seeder guard. No network, database or binary is used:
 * every HTTP call goes through an injected fake fetch and the health inputs are plain objects.
 * Run: npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-viralpulse-wp0.ts
 */
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";

// Importing the server modules opens the platform connection; only ever a throwaway database (asserted, then dropped).
const uri = process.env.MONGODB_URI ?? "";
const dbName = uri.split("?")[0].split("/").pop() ?? "";
assert.ok(/zz_throwaway/.test(dbName), "refusing to run: MONGODB_URI must be a zz_throwaway_* database");
import {
  classifyModels, fetchModelIds, resolveModel, ModelUnavailableError, imageCost, DEFAULT_IMAGE_MODEL, DEFAULT_TEXT_MODEL, IMAGE_FALLBACK_PRICES,
} from "../src/lib/products/viralpulse-ai/models";
import { checkLinkedinVersion, effectiveLinkedinVersion, LINKEDIN_DEFAULT_VERSION } from "../src/lib/products/viralpulse-ai/linkedin-version";
import { oauthRedirectUrl, originFromHeaders } from "../src/lib/products/viralpulse-ai/oauth-redirect";
import { buildHealth, type HealthDeps } from "../src/lib/products/viralpulse-ai/health";
import { parseFfmpegFeatures } from "../src/lib/products/viralpulse-ai/ugc/assemble";
import { fetchGeminiModelIds, videoModelStatus } from "../src/lib/products/viralpulse-ai/ugc/providers/gemini-models";
import { mergeModels } from "../src/lib/products/viralpulse-ai/settings";
// @ts-expect-error plain .mjs
import { assertDemoTarget, isProductionEnv } from "./demo/guard.mjs";

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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const IDS = ["gpt-6-luna", "gpt-6.1-terra", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "gpt-realtime-2.1", "text-embedding-3-small", "whisper-1", "gpt-6-luna-2026-09-08"];

async function main() {
  await t("defaults are the verified current models", () => {
    assert.equal(DEFAULT_IMAGE_MODEL, "gpt-image-2.5-flare");
    assert.equal(DEFAULT_TEXT_MODEL, "gpt-6-luna");
  });

  await t("classifyModels separates text and image and drops audio/embedding", () => {
    const c = classifyModels(IDS);
    assert.deepEqual(c.image, ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]);
    assert.ok(c.text.includes("gpt-6-luna") && c.text.includes("gpt-6.1-terra"));
    assert.ok(!c.text.some((x) => /realtime|embedding|whisper|image/.test(x)));
  });

  await t("fetchModelIds: sends the key, parses ids, maps failures to plain messages", async () => {
    let seen: { url: string; auth: string | null } | null = null;
    const ok = await fetchModelIds({ apiKey: "sk-test", fetchFn: async (url, init) => { seen = { url, auth: new Headers(init?.headers).get("authorization") }; return json({ data: IDS.map((id) => ({ id })) }); } });
    assert.ok(ok.ok && ok.ids.length === IDS.length);
    assert.equal(seen!.url, "https://api.openai.com/v1/models");
    assert.equal(seen!.auth, "Bearer sk-test");
    const r401 = await fetchModelIds({ apiKey: "x", fetchFn: async () => json({}, 401) });
    assert.ok(!r401.ok && /rejected/.test(r401.error));
    const r403 = await fetchModelIds({ apiKey: "x", fetchFn: async () => json({}, 403) });
    assert.ok(!r403.ok && /Models read/.test(r403.error));
    const down = await fetchModelIds({ apiKey: "x", fetchFn: async () => { throw new Error("net"); } });
    assert.ok(!down.ok && /reach/.test(down.error));
    const empty = await fetchModelIds({ apiKey: "x", fetchFn: async () => json({ data: [] }) });
    assert.ok(!empty.ok);
  });

  await t("resolveModel: configured model present -> used as is (alias matches a dated snapshot too)", () => {
    const av = new Set(IDS);
    assert.deepEqual(resolveModel("image", "gpt-image-2.5-flare", av), { model: "gpt-image-2.5-flare", requested: "gpt-image-2.5-flare", fellBack: false, note: null });
    assert.equal(resolveModel("text", "gpt-6-luna", new Set(["gpt-6-luna-2026-09-08"])).fellBack, false);
  });

  await t("resolveModel: retired image model falls back with a clear note", () => {
    const c = resolveModel("image", "gpt-image-1", new Set(IDS));
    assert.equal(c.model, "gpt-image-2.5-flare");
    assert.equal(c.fellBack, true);
    assert.match(c.note ?? "", /gpt-image-1.*not available.*gpt-image-2\.5-flare.*Settings/);
    // first fallback missing -> second
    assert.equal(resolveModel("image", "gpt-image-1", new Set(["gpt-image-2.5-sunburst"])).model, "gpt-image-2.5-sunburst");
  });

  await t("resolveModel: retired text model falls back; nothing usable throws with what is available", () => {
    assert.equal(resolveModel("text", "gpt-4.1-mini", new Set(IDS)).model, "gpt-6-luna");
    assert.throws(() => resolveModel("image", "gpt-image-1", new Set(["gpt-6-luna", "whisper-1"])), (e: unknown) => e instanceof ModelUnavailableError && /no replacement/.test(e.message));
    assert.throws(() => resolveModel("text", "gpt-4.1-mini", new Set(["gpt-image-2.5-flare"])), ModelUnavailableError);
    try { resolveModel("image", "gpt-image-1", new Set(["gpt-image-9"])); assert.fail("should throw"); } catch (e) { assert.match((e as Error).message, /Available: gpt-image-9/); }
  });

  await t("resolveModel: when the list can't be read the configured model is used (no silent block)", () => {
    const c = resolveModel("image", "gpt-image-1", null);
    assert.equal(c.model, "gpt-image-1");
    assert.equal(c.fellBack, false);
  });

  await t("imageCost: token usage x documented rates (image out $30/M, text in $5/M, image in $8/M)", () => {
    const c = imageCost({ model: "gpt-image-2.5-flare", quality: "medium", size: "1024x1024", usage: { input_tokens: 100, output_tokens: 1750, input_tokens_details: { text_tokens: 100, image_tokens: 0 } } });
    assert.equal(c.basis, "usage");
    assert.equal(c.usd, (100 * 5 + 1750 * 30) / 1e6); // 0.0530
    const edit = imageCost({ model: "gpt-image-2.5-sunburst", quality: "high", size: "1024x1536", usage: { input_tokens: 1100, output_tokens: 1000, input_tokens_details: { text_tokens: 100, image_tokens: 1000 } } });
    assert.equal(edit.usd, (100 * 5 + 1000 * 8 + 1000 * 30) / 1e6);
  });

  await t("imageCost: without usage uses the per-quality/size table, overrides win, xhigh/max use high as lower bound", () => {
    assert.deepEqual(imageCost({ model: "gpt-image-2.5-flare", quality: "low", size: "1536x1024" }), { usd: 0.005, basis: "price-table" });
    assert.equal(imageCost({ model: "gpt-image-2.5-flare", quality: "high", size: "1024x1024" }).usd, IMAGE_FALLBACK_PRICES.high!["1024x1024"]);
    assert.equal(imageCost({ model: "gpt-image-2.5-flare", quality: "max", size: "1024x1536" }).usd, 0.165);
    assert.equal(imageCost({ model: "gpt-image-2.5-flare", quality: "medium", size: "1024x1024", overrides: { medium: { "1024x1024": 0.07 } } }).usd, 0.07);
  });

  await t("imageCost: unknown size falls to flat setting, then to unknown (never a made-up number)", () => {
    assert.deepEqual(imageCost({ model: "x", quality: "medium", size: "2048x2048", flatUsd: 0.09 }), { usd: 0.09, basis: "flat-setting" });
    assert.deepEqual(imageCost({ model: "x", quality: "medium", size: "2048x2048" }), { usd: 0, basis: "unknown" });
    // a model without a rate row ignores usage and uses the table
    assert.equal(imageCost({ model: "future-model", quality: "low", size: "1024x1024", usage: { output_tokens: 999 } }).basis, "price-table");
  });

  await t("text price table: new defaults present and merged into saved lists", () => {
    const merged = mergeModels([{ id: "gpt-4o", label: "GPT-4o", input: 2.5, output: 10 }]);
    assert.ok(merged.some((m) => m.id === "gpt-6-luna" && m.input === 0.1 && m.output === 0.5));
    assert.ok(merged.some((m) => m.id === "gpt-6.1-terra" && m.input === 1 && m.output === 5));
    assert.equal(merged.filter((m) => m.id === "gpt-4o").length, 1);
  });

  const NOW = new Date("2026-11-01T00:00:00Z");
  await t("LinkedIn: default is the latest verified version and is OK", () => {
    assert.equal(LINKEDIN_DEFAULT_VERSION, "202610");
    const c = checkLinkedinVersion("202610", NOW);
    assert.equal(c.state, "ok");
    assert.equal(c.sunsetAt, "2027-10-01");
  });

  await t("LinkedIn: old default 202509 is sunset; 202511 is expiring (announced 2026-11-16)", () => {
    assert.equal(checkLinkedinVersion("202509", NOW).state, "sunset");
    const c = checkLinkedinVersion("202511", NOW);
    assert.equal(c.state, "expiring");
    assert.equal(c.sunsetAt, "2026-11-16");
    assert.equal(c.announced, true);
    assert.equal(c.daysLeft, 15);
    assert.match(c.message, /202610/);
  });

  await t("LinkedIn: 60-day warning window boundaries", () => {
    // 202601 is retired no earlier than 2027-01-01
    assert.equal(checkLinkedinVersion("202601", new Date("2026-11-02T00:00:00Z")).daysLeft, 60);
    assert.equal(checkLinkedinVersion("202601", new Date("2026-11-02T00:00:00Z")).state, "expiring");
    assert.equal(checkLinkedinVersion("202601", new Date("2026-11-01T00:00:00Z")).daysLeft, 61);
    assert.equal(checkLinkedinVersion("202601", new Date("2026-11-01T00:00:00Z")).state, "ok");
    assert.equal(checkLinkedinVersion("202601", new Date("2027-01-01T00:00:00Z")).state, "sunset");
  });

  await t("LinkedIn: invalid format, and version precedence settings > env > default", () => {
    assert.equal(checkLinkedinVersion("2026-10", NOW).state, "invalid");
    assert.equal(checkLinkedinVersion("202613", NOW).state, "invalid");
    assert.deepEqual(effectiveLinkedinVersion("202608", "202609"), { version: "202608", source: "settings" });
    assert.deepEqual(effectiveLinkedinVersion(undefined, "202609"), { version: "202609", source: "env" });
    assert.deepEqual(effectiveLinkedinVersion("junk", "junk"), { version: "202610", source: "default" });
  });

  await t("OAuth redirect helper: exact /callback URL, consistent with what the routes send", () => {
    for (const p of ["meta", "google", "linkedin"]) assert.equal(oauthRedirectUrl(p, "https://app.example.com"), `https://app.example.com/api/viralpulse-ai/oauth/${p}/callback`);
    assert.equal(oauthRedirectUrl("meta", "http://localhost:3000"), "http://localhost:3000/api/viralpulse-ai/oauth/meta/callback");
    const h = (m: Record<string, string>) => ({ get: (k: string) => m[k.toLowerCase()] ?? null });
    assert.equal(originFromHeaders(h({ host: "acme-app.example.com" })), "https://acme-app.example.com");
    assert.equal(originFromHeaders(h({ host: "localhost:3000" })), "http://localhost:3000");
    assert.equal(originFromHeaders(h({ "x-forwarded-host": "app.acme.com", "x-forwarded-proto": "https", host: "internal:3000" })), "https://app.acme.com");
    assert.equal(originFromHeaders(h({})), null);
  });

  await t("catalog help text carries the /callback path", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/lib/platform/connections/catalog.ts", "utf8");
    for (const p of ["meta", "google", "linkedin"]) assert.ok(src.includes(`/api/viralpulse-ai/oauth/${p}/callback`), p);
    assert.ok(!/oauth\/(meta|google|linkedin)["\s]/.test(src.replace(/oauth\/\w+\/callback/g, "")), "a note still omits /callback");
  });

  await t("ffmpeg feature parsing: libass subtitles + drawtext detection", () => {
    const filters = " ... ass               V->V       Render ASS subtitles\n T.C drawtext          V->V       Draw text\n ... subtitles         V->V       Render text subtitles\n";
    const f = parseFfmpegFeatures("ffmpeg version 7.0.2-static https://x\n", filters);
    assert.deepEqual(f, { version: "7.0.2-static", subtitles: true, drawtext: true });
    const none = parseFfmpegFeatures("ffmpeg version n6.1\n", " ... scale V->V Scale\n");
    assert.deepEqual(none, { version: "n6.1", subtitles: false, drawtext: false });
  });

  await t("Gemini model list: pagination, omni vs retired Veo, key rejection", async () => {
    let calls = 0;
    const r = await fetchGeminiModelIds("K", async (url) => {
      calls++;
      return url.includes("pageToken=p2") ? json({ models: [{ name: "models/veo-3.0-fast-generate-001" }] }) : json({ models: [{ name: "models/gemini-omni-1.1-flash" }], nextPageToken: "p2" });
    });
    assert.ok(r.ok && calls === 2);
    if (r.ok) {
      assert.deepEqual(videoModelStatus(r.ids), { omni: true, veo: ["veo-3.0-fast-generate-001"] });
      assert.deepEqual(videoModelStatus(["gemini-2.5-flash"]), { omni: false, veo: [] });
    }
    const bad = await fetchGeminiModelIds("K", async () => json({}, 403));
    assert.ok(!bad.ok && /rejected/.test(bad.error));
  });

  const baseDeps = (): HealthDeps => ({
    now: NOW,
    openaiConfigured: true,
    openaiModels: { ok: true, ids: IDS },
    ai: { textModel: "gpt-6-luna", imageModel: "gpt-image-2.5-flare" },
    linkedinSaved: undefined,
    linkedinEnv: undefined,
    integrations: [
      { provider: "meta", label: "Meta (Facebook & Instagram)", platforms: ["facebook", "instagram"], configured: true, connected: true, status: "connected", accountName: "Acme", expiresAt: "2027-01-10T00:00:00.000Z", lastError: null, connectedAt: "2026-10-01T00:00:00.000Z", redirectUrl: null, targets: { facebook: [{ id: "1", name: "Page" }], instagram: [{ id: "2", name: "ig" }] }, selected: { facebook: "1", instagram: "2" } },
      { provider: "google", label: "Google (YouTube & Business Profile)", platforms: ["youtube", "google_business"], configured: true, connected: true, status: "connected", accountName: "Chan", expiresAt: "2026-10-30T00:00:00.000Z", lastError: null, connectedAt: "2026-10-01T00:00:00.000Z", redirectUrl: null, targets: { youtube: [{ id: "c", name: "Chan" }], google_business: [] }, selected: { youtube: "c" } },
      { provider: "linkedin", label: "LinkedIn", platforms: ["linkedin"], configured: true, connected: true, status: "connected", accountName: "Me", expiresAt: "2027-01-01T00:00:00.000Z", lastError: null, connectedAt: "2026-10-01T00:00:00.000Z", redirectUrl: null, targets: { linkedin: [{ id: "u", name: "Me" }] }, selected: { linkedin: "u" } },
    ] as HealthDeps["integrations"],
    geminiConfigured: true,
    geminiModels: { ok: true, ids: ["gemini-omni-1.1-flash"] },
    ffmpeg: { path: "/x/ffmpeg", source: "ffmpeg-static", tried: [] },
    ffmpegFeatures: { version: "7.0", subtitles: true, drawtext: false },
    ffmpegProbeError: null,
    jobs: [
      { key: "viralpulse-publisher", name: "Scheduled posts", health: "healthy", healthNote: "Ran when it was due.", enabled: true, last: { id: "1", trigger: "cron", by: null, status: "ok", startedAt: "2026-11-01T04:30:00.000Z", durationMs: 100, summary: "", error: "" }, lastOkAt: "2026-11-01T04:30:00.000Z", effectiveSchedule: "30 4 * * *", when: "Every day at 04:30" },
      { key: "viralpulse-accounts", name: "Connected account checks", health: "healthy", healthNote: "Ran when it was due.", enabled: true, last: { id: "2", trigger: "cron", by: null, status: "ok", startedAt: "2026-11-01T00:00:00.000Z", durationMs: 100, summary: "", error: "" }, lastOkAt: "2026-11-01T00:00:00.000Z", effectiveSchedule: "*/2 * * * *", when: "Every 2 minutes" },
      { key: "viralpulse-ugc", name: "AI UGC videos", health: "healthy", healthNote: "Ran when it was due.", enabled: true, last: { id: "2", trigger: "cron", by: null, status: "ok", startedAt: "2026-11-01T00:00:00.000Z", durationMs: 100, summary: "", error: "" }, lastOkAt: "2026-11-01T00:00:00.000Z", effectiveSchedule: "*/2 * * * *", when: "Every 2 minutes" },
      { key: "viralpulse-metrics", name: "Social post and account results", health: "healthy", healthNote: "Ran when it was due.", enabled: true, last: { id: "2", trigger: "cron", by: null, status: "ok", startedAt: "2026-11-01T00:00:00.000Z", durationMs: 100, summary: "", error: "" }, lastOkAt: "2026-11-01T00:00:00.000Z", effectiveSchedule: "0 */3 * * *", when: "Every 3 hours" },
    ],
    encryptionReady: true,
  });
  const item = (h: ReturnType<typeof buildHealth>, id: string) => h.groups.flatMap((g) => g.items).find((i) => i.id === id)!;

  await t("health: all good -> OK with no attention items (Google access token past expiry is fine: it refreshes)", () => {
    const h = buildHealth(baseDeps());
    assert.equal(h.status, "ok", JSON.stringify(h.groups.flatMap((g) => g.items).filter((i) => i.status === "attention")));
    assert.equal(h.attentionCount, 0);
    assert.ok(h.groups.every((g) => g.status === "ok"));
  });

  await t("health: retired image model, expiring Meta token, sunset LinkedIn version, missing ffmpeg, failing cron -> attention with fixes", () => {
    const d = baseDeps();
    d.ai.imageModel = "gpt-image-1";
    d.integrations[0].expiresAt = "2026-11-10T00:00:00.000Z";
    d.linkedinEnv = "202509";
    d.ffmpeg = { path: null, source: null, tried: ["no ffmpeg on PATH"] };
    d.ffmpegFeatures = null;
    d.jobs[0] = { ...d.jobs[0], health: "failing", healthNote: "boom", last: { ...d.jobs[0].last!, status: "failed", error: "db down" } };
    const h = buildHealth(d);
    assert.equal(h.status, "attention");
    assert.equal(item(h, "openai.image").status, "attention");
    assert.match(item(h, "openai.image").fix ?? "", /gpt-image-2\.5-flare/);
    assert.match(item(h, "conn.meta").detail, /expires in 9 days/);
    assert.equal(item(h, "linkedin.version").status, "attention");
    assert.match(item(h, "linkedin.version").detail, /sunset/);
    assert.equal(item(h, "ffmpeg").status, "attention");
    assert.match(item(h, "ffmpeg").fix ?? "", /ffmpeg-static|FFMPEG_PATH/);
    assert.equal(item(h, "cron.viralpulse-publisher").status, "attention");
    assert.equal(item(h, "cron.viralpulse-publisher").lastError, "db down");
    assert.equal(h.attentionCount, 5);
    assert.ok(h.groups.find((g) => g.id === "video")!.status === "attention");
    assert.ok(h.groups.every((g) => g.items.every((i) => i.status === "ok" || (i.fix && i.fix.length > 5))), "every attention item has a fix");
  });

  await t("health: ffmpeg without libass, unreadable model list, no keys, error connection", () => {
    const d = baseDeps();
    d.ffmpegFeatures = { version: "6.1", subtitles: false, drawtext: true };
    d.openaiModels = { ok: false, error: "The OpenAI key is not allowed to list models" };
    d.geminiConfigured = false;
    d.integrations[2] = { ...d.integrations[2], status: "error", lastError: "invalid_grant" };
    d.integrations[1] = { ...d.integrations[1], connected: false, status: null };
    const h = buildHealth(d);
    assert.match(item(h, "ffmpeg").detail, /no "subtitles" filter/);
    assert.equal(item(h, "openai.models").status, "attention");
    assert.equal(item(h, "gemini.key").status, "attention");
    assert.equal(item(h, "conn.linkedin").lastError, "invalid_grant");
    assert.equal(item(h, "conn.google").status, "attention");
    const noKey = buildHealth({ ...baseDeps(), openaiConfigured: false });
    assert.equal(item(noKey, "openai.key").status, "attention");
  });

  await t("health: scheduler states (paused, overdue, never ran)", () => {
    const d = baseDeps();
    d.jobs[0] = { ...d.jobs[0], enabled: false };
    d.jobs[2] = { ...d.jobs[2], health: "overdue", healthNote: "It should have run at 00:00 UTC and did not." };
    let h = buildHealth(d);
    assert.match(item(h, "cron.viralpulse-publisher").detail, /Paused/);
    assert.match(item(h, "cron.viralpulse-ugc").fix ?? "", /CRON_SECRET/);
    d.jobs = [];
    h = buildHealth(d);
    assert.equal(item(h, "cron.viralpulse-publisher").status, "attention");
  });

  await t("demo seeder guard: refuses unflagged, platform owner, missing target and any production environment; allows flagged demo", () => {
    const dev = { NODE_ENV: "development" } as NodeJS.ProcessEnv;
    assert.doesNotThrow(() => assertDemoTarget({ slug: "demo", isDemo: true }, dev));
    assert.throws(() => assertDemoTarget({ slug: "acme" }, dev), /not flagged as a demo company.*mark-demo-company/);
    assert.throws(() => assertDemoTarget({ slug: "acme", isDemo: false }, dev), /not flagged/);
    assert.throws(() => assertDemoTarget({ slug: "owner", isDemo: true, isPlatformOwner: true }, dev), /platform operator/);
    assert.throws(() => assertDemoTarget(undefined, dev), /no target company/);
    assert.throws(() => assertDemoTarget({ slug: "demo", isDemo: true }, { NODE_ENV: "production" } as NodeJS.ProcessEnv), /production/);
    assert.throws(() => assertDemoTarget({ slug: "demo", isDemo: true }, { VERCEL: "1" } as NodeJS.ProcessEnv), /production/);
    assert.throws(() => assertDemoTarget({ slug: "demo", isDemo: true }, { VERCEL_ENV: "preview" } as NodeJS.ProcessEnv), /production/);
    // there is no override switch
    assert.throws(() => assertDemoTarget({ slug: "demo", isDemo: true }, { NODE_ENV: "production", DEMO_SEED_ALLOW_PRODUCTION: "1" } as unknown as NodeJS.ProcessEnv), /production/);
    assert.equal(isProductionEnv({ NODE_ENV: "test" } as NodeJS.ProcessEnv), false);
  });

  await t("seedSmms calls the guard before writing anything", async () => {
    const { seedSmms } = await import("./demo/smms.mjs" as string);
    const writes: string[] = [];
    const db = { collection: (n: string) => new Proxy({}, { get: (_t, m) => () => { writes.push(`${n}.${String(m)}`); throw new Error("db touched"); } }) };
    await assert.rejects(() => seedSmms(db, { company: { slug: "acme" } }), /not flagged as a demo company/);
    await assert.rejects(() => seedSmms(db), /no target company/);
    assert.deepEqual(writes, []);
  });

  const c = await MongoClient.connect(uri);
  assert.ok(/zz_throwaway/.test(c.db().databaseName));
  await c.db().dropDatabase();
  await c.close();
  console.log(`\nviralpulse WP0: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main();
