/**
 * ViralPulse WP4 tests (AI Image Studio): platform size table, cost maths, limits/approval, policy (30+ cases), magic-byte sniffing,
 * sharp crop/resize/overlay golden checks on synthetic pictures (no network), provider mapping with fake clients, the whole engine with a
 * fake provider, tenancy, library filters. Database: a THROWAWAY MongoDB only (asserted, then dropped). No real model is called.
 * Run: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_vpwp4 npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-viralpulse-wp4.ts
 */
import assert from "node:assert/strict";
import sharp from "sharp";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "";
const dbName = uri.split("?")[0].split("/").pop() ?? "";
assert.ok(/zz_throwaway/.test(dbName), "refusing to run: MONGODB_URI must be a zz_throwaway_* database");
assert.ok(!/\.env\.local/.test(uri));

import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { GOALS, SPECS, SPECS_VERIFIED_ON, cropLoss, fitsFor, geminiRatioFor, goalById, openAiSizeFor, ratioOf, safeBox, specByKey, specGroups } from "../src/lib/products/viralpulse-ai/images/specs";
import { GEMINI_IMAGE_PRICES, estimateJob, geminiImageCost, openAiImageCost } from "../src/lib/products/viralpulse-ai/images/pricing";
import { DEFAULT_IMAGE_SETTINGS, cleanSettings, evaluateRequest, istDayStart } from "../src/lib/products/viralpulse-ai/images/limits";
import { checkOverlayText, policyCheck } from "../src/lib/products/viralpulse-ai/images/policy";
import { matchesClaim, sniffKind } from "../src/lib/products/viralpulse-ai/images/sniff";
import { composeExport, contrastRatio, makeThumb, probe, xmpPacket } from "../src/lib/products/viralpulse-ai/images/compose";
import { OpenAiImageProvider, mapOpenAiError } from "../src/lib/products/viralpulse-ai/images/providers/openai";
import { GeminiImageProvider, findImage, mapGeminiFailure } from "../src/lib/products/viralpulse-ai/images/providers/gemini";
import { ImageProviderError, type ImageProvider, type ImageRequest } from "../src/lib/products/viralpulse-ai/images/providers/types";
import { buildPrompt, cleanBrief, createEngine, type ImageDeps, type Actor } from "../src/lib/products/viralpulse-ai/images/engine";
import { getBrandKit, getImageSettings, getProject, listProjects, saveBrandKit, saveImageSettings } from "../src/lib/products/viralpulse-ai/images/store";
import { EMPTY_KIT } from "../src/lib/products/viralpulse-ai/images/types";
import { COLLECTIONS, smmsCollection, createStamp } from "../src/lib/products/viralpulse-ai/db";
import { buildMediaFilter, listMedia, platformFit, type MediaDoc } from "../src/lib/products/viralpulse-ai/media";
import { PLATFORM_META } from "../src/lib/products/viralpulse-ai/constants";

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

const solid = (w: number, h: number, c: { r: number; g: number; b: number }) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();
async function px(buf: Buffer, x: number, y: number) {
  const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const m = await sharp(buf).metadata();
  const i = (y * (m.width ?? 0) + x) * (m.channels ?? 3);
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}
const near = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, tol = 12) => Math.abs(a.r - b.r) <= tol && Math.abs(a.g - b.g) <= tol && Math.abs(a.b - b.b) <= tol;
/** Four coloured quadrants: crops and resizes can be checked by sampling the corners. */
async function quadrants(w: number, h: number) {
  const q = (c: { r: number; g: number; b: number }) => sharp({ create: { width: w / 2, height: h / 2, channels: 3, background: c } }).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 3, background: "#000" } }).composite([
    { input: await q({ r: 255, g: 0, b: 0 }), left: 0, top: 0 },
    { input: await q({ r: 0, g: 255, b: 0 }), left: w / 2, top: 0 },
    { input: await q({ r: 0, g: 0, b: 255 }), left: 0, top: h / 2 },
    { input: await q({ r: 255, g: 255, b: 0 }), left: w / 2, top: h / 2 },
  ]).png().toBuffer();
}

// ── a fake provider: no network, deterministic pictures, records every call ──
function fakeProvider(opts: { fail?: ImageProviderError } = {}) {
  const calls: { kind: "generate" | "edit"; req: ImageRequest }[] = [];
  const provider: ImageProvider = {
    id: "openai",
    async generate(req) {
      calls.push({ kind: "generate", req });
      if (opts.fail) throw opts.fail;
      return { images: await Promise.all(Array.from({ length: req.n }, (_, i) => solid(1024, req.openAiSize === "1024x1536" ? 1536 : 1024, { r: 40 + i * 30, g: 90, b: 160 }))), usage: null, model: req.model };
    },
    async edit(req) {
      calls.push({ kind: "edit", req });
      if (opts.fail) throw opts.fail;
      return { images: await Promise.all(Array.from({ length: req.n }, () => solid(1024, 1024, { r: 200, g: 120, b: 40 }))), usage: null, model: req.model };
    },
  };
  return { provider, calls };
}

function makeDeps(over: { provider?: ImageProvider; now?: () => Date } = {}) {
  const blobs = new Map<string, Buffer>();
  const media = new Map<string, { data: Buffer; mimeType: string; name: string }>();
  const saved: { buf: Buffer; meta: Parameters<ImageDeps["saveExport"]>[1] }[] = [];
  const audits: string[] = [];
  const notes: string[] = [];
  const fp = fakeProvider();
  const deps: ImageDeps = {
    now: over.now ?? (() => new Date()),
    settings: getImageSettings,
    openAiPricing: async () => ({ overrides: null, flatUsd: 0 }),
    resolveProvider: async () => ({ provider: over.provider ?? fp.provider, model: "gpt-image-2.5-flare" }),
    putBlob: async (key, data) => (blobs.set(key, data), key),
    getBlob: async (key) => blobs.get(key) ?? null,
    readMedia: async (id) => media.get(id) ?? null,
    saveExport: async (buf, meta) => (saved.push({ buf, meta }), { _id: `m${saved.length}` }),
    audit: async (e) => void audits.push(`${e.action}:${e.summary}`),
    notify: async (_ids, n) => void notes.push(n.title),
    managerIds: async () => ["mgr1"],
    kit: getBrandKit,
    storagePrefix: async () => "smms/test/studio",
  };
  return { deps, blobs, media, saved, audits, notes, fp };
}
const emp: Actor = { userId: "u1", email: "u1@x.test", canApprove: false };
const mgr: Actor = { userId: "mgr1", email: "m@x.test", canApprove: true };
const okBrief = { goalId: "organic_post", subject: "A tailor measuring fabric in a bright, tidy shop", product: "Custom tailoring", style: "warm light", overlayText: ["Festive offers"], variants: 2 };

async function main() {
  // ── size table ──
  await t("specs: unique keys, https source, verified date, positive sizes, safe zones leave room", () => {
    assert.equal(new Set(SPECS.map((s) => s.key)).size, SPECS.length);
    for (const s of SPECS) {
      assert.ok(s.width > 0 && s.height > 0, s.key);
      assert.match(s.source.url, /^https:\/\//, s.key);
      assert.match(s.source.verifiedOn, /^\d{4}-\d{2}-\d{2}$/, s.key);
      assert.ok(["official", "partial", "secondary"].includes(s.source.confidence), s.key);
      const b = safeBox(s);
      assert.ok(b.width >= s.width * 0.4 && b.height >= s.height * 0.3, `${s.key} safe zone too small`);
      assert.ok(s.formats.length > 0 && (s.maxBytes === null || s.maxBytes > 1000), s.key);
    }
    assert.equal(SPECS_VERIFIED_ON, "2026-11-01");
  });
  await t("specs: the ratio in each label matches the pixel size", () => {
    for (const s of SPECS) {
      const m = /(\d+(?:\.\d+)?):(\d+)/.exec(s.label);
      if (!m) continue;
      assert.ok(Math.abs(ratioOf(s.width, s.height) / (Number(m[1]) / Number(m[2])) - 1) < 0.02, `${s.key} ${s.label} is ${s.width}x${s.height}`);
    }
  });
  await t("specs: every goal's sizes exist, goals are unique, carousel has a slide range", () => {
    assert.equal(new Set(GOALS.map((g) => g.id)).size, GOALS.length);
    for (const g of GOALS) for (const k of g.specKeys) assert.ok(specByKey(k), `${g.id} -> ${k}`);
    assert.ok(goalById("carousel_set")!.slides!.max >= 2);
    assert.ok(GOALS.length >= 13);
  });
  await t("specs: the app's older PLATFORM_META sizes that are images are in the table", () => {
    const have = new Set(SPECS.map((s) => `${s.width}x${s.height}`));
    for (const m of Object.values(PLATFORM_META)) for (const f of m.formats) if (f.kind === "image") assert.ok(have.has(`${f.width}x${f.height}`), `${m.label} ${f.label} ${f.width}x${f.height}`);
  });
  await t("specs: YouTube thumbnail is the officially confirmed 16:9 under 2 MB", () => {
    const y = specByKey("yt_thumb")!;
    assert.equal(y.source.confidence, "official");
    assert.equal(ratioOf(y.width, y.height).toFixed(3), (16 / 9).toFixed(3));
    assert.equal(y.maxBytes, 2 * 1024 * 1024);
  });
  await t("specs: story safe zone is the strict one (top 14%, bottom 35%)", () => {
    const s = specByKey("ig_story")!;
    assert.equal(s.safe.top, 0.14);
    assert.equal(s.safe.bottom, 0.35);
    const b = safeBox(s);
    assert.equal(b.top, Math.round(1920 * 0.14));
    assert.equal(b.top + b.height, 1920 - Math.round(1920 * 0.35));
  });
  await t("specs: generation shape follows the wanted sizes", () => {
    assert.equal(openAiSizeFor([specByKey("ig_story")!]), "1024x1536");
    assert.equal(openAiSizeFor([specByKey("yt_thumb")!]), "1536x1024");
    assert.equal(openAiSizeFor([specByKey("ig_feed_square")!]), "1024x1024");
    assert.equal(geminiRatioFor([specByKey("ig_feed_portrait")!]), "4:5");
    assert.equal(geminiRatioFor([specByKey("ig_story")!]), "9:16");
    assert.equal(geminiRatioFor([specByKey("yt_thumb")!]), "16:9");
    assert.equal(openAiSizeFor([]), "1024x1024");
  });
  await t("specs: crop loss and library fit", () => {
    assert.ok(cropLoss(1024, 1536, specByKey("ig_story")!) > 0.1);
    assert.ok(cropLoss(1024, 1024, specByKey("ig_feed_square")!) < 0.001);
    const fits = fitsFor(1080, 1350).map((s) => s.key);
    assert.ok(fits.includes("ig_feed_portrait") && !fits.includes("ig_story"));
    assert.deepEqual(fitsFor(null, 100), []);
    assert.ok(fitsFor(300, 300).length === 0, "too small to fit any size");
    assert.ok(specGroups().length >= 6);
  });

  // ── cost maths ──
  await t("cost: OpenAI by reported usage = tokens x published rates", () => {
    const c = openAiImageCost({ model: "gpt-image-2.5-flare", quality: "high", size: "1024x1024", usage: { input_tokens: 1000, output_tokens: 4000, input_tokens_details: { text_tokens: 1000, image_tokens: 0 } } });
    assert.equal(c.basis, "usage");
    assert.equal(c.usd, (1000 * 5 + 4000 * 30) / 1e6);
  });
  await t("cost: OpenAI without usage uses the per-quality, per-size table", () => {
    const lo = openAiImageCost({ model: "gpt-image-2.5-flare", quality: "low", size: "1024x1024" });
    const hi = openAiImageCost({ model: "gpt-image-2.5-flare", quality: "high", size: "1024x1536" });
    assert.equal(lo.usd, 0.006);
    assert.equal(hi.usd, 0.165);
    assert.ok(hi.usd > lo.usd);
    assert.equal(openAiImageCost({ model: "gpt-image-2.5-flare", quality: "max", size: "1024x1024" }).usd, 0.211, "max falls back to the high price");
  });
  await t("cost: an admin override and the flat fallback win in order", () => {
    assert.equal(openAiImageCost({ model: "x", quality: "medium", size: "1024x1024", overrides: { medium: { "1024x1024": 0.5 } } }).usd, 0.5);
    assert.equal(openAiImageCost({ model: "x", quality: "medium", size: "9x9", flatUsd: 0.07 }).basis, "flat-setting");
    assert.equal(openAiImageCost({ model: "x", quality: "medium", size: "9x9" }).basis, "unknown");
  });
  await t("cost: Gemini per image by model and size, with overrides", () => {
    assert.equal(geminiImageCost({ model: "gemini-nano-banana-2.1" }).usd, 0.0336);
    assert.equal(geminiImageCost({ model: "gemini-nano-banana-2.1", size: "4K" }).usd, 0.113);
    assert.equal(geminiImageCost({ model: "gemini-3-pro-image", size: "4K" }).usd, 0.24);
    assert.equal(geminiImageCost({ model: "gemini-3.1-flash-lite-image", size: "2K" }).usd, 0.0336, "unlisted size falls back to 1K");
    assert.equal(geminiImageCost({ model: "gemini-nano-banana-2.1", overrides: { "gemini-nano-banana-2.1": { "1K": 0.02 } } }).usd, 0.02);
    assert.equal(geminiImageCost({ model: "nope" }).basis, "unknown");
    assert.ok(Object.keys(GEMINI_IMAGE_PRICES).length >= 5);
  });
  await t("cost: job estimate = unit x images, 0 images = 0", () => {
    const e = estimateJob({ provider: "openai", model: "gpt-image-2.5-flare", quality: "medium", openAiSize: "1024x1536", images: 4 });
    assert.equal(e.totalUsd, 0.041 * 4);
    assert.equal(estimateJob({ provider: "gemini", model: "gemini-nano-banana-2.1", quality: "medium", openAiSize: "1024x1024", images: 3 }).totalUsd, 0.1008);
    assert.equal(estimateJob({ provider: "openai", model: "gpt-image-2.5-flare", quality: "low", openAiSize: "1024x1024", images: 0 }).totalUsd, 0);
  });

  // ── limits ──
  const S = { ...DEFAULT_IMAGE_SETTINGS };
  const base = { settings: S, images: 2, estimateUsd: 0.5, recentImagesByUser: 0, spentTodayUsd: 0, canApprove: false };
  await t("limits: allowed, rate limit per user, daily cap, approval threshold", () => {
    assert.deepEqual(evaluateRequest(base), { ok: true, needsApproval: false });
    const rate = evaluateRequest({ ...base, recentImagesByUser: 7 });
    assert.ok(!rate.ok && rate.code === "RATE");
    const cap = evaluateRequest({ ...base, spentTodayUsd: 19.9 });
    assert.ok(!cap.ok && cap.code === "CAP" && /manager can raise/.test(cap.message));
    assert.deepEqual(evaluateRequest({ ...base, estimateUsd: 3 }), { ok: true, needsApproval: true });
    assert.deepEqual(evaluateRequest({ ...base, estimateUsd: 3, canApprove: true }), { ok: true, needsApproval: false });
    assert.deepEqual(evaluateRequest({ ...base, estimateUsd: 2 }), { ok: true, needsApproval: false }, "exactly the threshold is allowed");
  });
  await t("limits: off switch, zero cap, bad counts, zero threshold means every request", () => {
    assert.ok(!evaluateRequest({ ...base, settings: { ...S, enabled: false } }).ok);
    const zero = evaluateRequest({ ...base, settings: { ...S, dailySpendCapUsd: 0 } });
    assert.ok(!zero.ok && zero.code === "DISABLED");
    assert.ok(!evaluateRequest({ ...base, images: 0 }).ok);
    assert.ok(!evaluateRequest({ ...base, images: 7 }).ok);
    assert.ok(!evaluateRequest({ ...base, images: NaN }).ok);
    assert.deepEqual(evaluateRequest({ ...base, settings: { ...S, approvalThresholdUsd: 0 } }), { ok: true, needsApproval: true });
  });
  await t("limits: the day starts at midnight India time", () => {
    assert.equal(istDayStart(new Date("2026-11-01T20:00:00Z")).toISOString(), "2026-11-01T18:30:00.000Z");
    assert.equal(istDayStart(new Date("2026-11-01T10:00:00Z")).toISOString(), "2026-10-31T18:30:00.000Z");
  });
  await t("limits: settings are clamped and sanitised", () => {
    const c = cleanSettings({ dailySpendCapUsd: -4, maxVariants: 99, perUserPerMinute: 0, geminiModel: "bad model!", defaultQuality: "weird" as never, approvalThresholdUsd: 1e9 }, S);
    assert.equal(c.dailySpendCapUsd, 0);
    assert.equal(c.maxVariants, 4);
    assert.equal(c.perUserPerMinute, 1);
    assert.equal(c.geminiModel, S.geminiModel);
    assert.equal(c.defaultQuality, S.defaultQuality);
    assert.equal(c.approvalThresholdUsd, 100000);
    assert.deepEqual(cleanSettings({ geminiPrices: { "g-1": { "1K": 0.5, "2K": -1, "4K": 99 } } }, S).geminiPrices, { "g-1": { "1K": 0.5 } });
  });

  // ── policy: 30+ cases ──
  const blocked = (input: Parameters<typeof policyCheck>[0], code: string) => {
    const r = policyCheck(input);
    assert.ok(!r.ok && r.blocked.some((f) => f.code === code), `${code} expected, got ${JSON.stringify(r.blocked.map((f) => f.code))}`);
  };
  const flagged = (input: Parameters<typeof policyCheck>[0], code: string) => {
    const r = policyCheck(input);
    assert.ok(r.flagged.some((f) => f.code === code), `${code} flag expected, got ${JSON.stringify(r.flagged.map((f) => f.code))}`);
  };
  const clean = (input: Parameters<typeof policyCheck>[0]) => {
    const r = policyCheck(input);
    assert.ok(r.ok && r.flagged.length === 0, JSON.stringify([...r.blocked, ...r.flagged].map((f) => f.code)));
  };
  await t("policy: ordinary product briefs pass clean (5)", () => {
    clean({ subject: "A wooden table with a ceramic mug and morning light", style: "minimal studio" });
    clean({ subject: "Rolls of coloured fabric on a shelf", product: "Tailoring service", overlayText: ["Stitched with care"] });
    clean({ subject: "A laptop on a desk next to a plant", overlayText: ["Free demo this week"] });
    clean({ subject: "Abstract blue gradient background", overlayText: ["Monthly tip"] });
    clean({ subject: "Diwali diyas on a table", style: "warm festive", overlayText: ["Happy Diwali"] });
  });
  await t("policy: real people and likeness are blocked (5)", () => {
    blocked({ subject: "Narendra Modi holding our product" }, "public_figure");
    blocked({ subject: "Virat Kohli drinking our juice" }, "public_figure");
    blocked({ subject: "A man who looks exactly like a famous actor" }, "likeness_request");
    blocked({ subject: "Face swap our CEO onto the model" }, "likeness_request");
    blocked({ subject: "A woman who resembles my neighbour" }, "likeness_request");
  });
  await t("policy: brands, characters, emblems, hate symbols (8)", () => {
    blocked({ subject: "Our shoe next to the Nike logo" }, "brand_logo");
    blocked({ subject: "A phone with the logo of Apple on the back" }, "brand_logo");
    flagged({ subject: "A cup of Starbucks coffee on a desk" }, "brand_name");
    blocked({ subject: "Mickey Mouse holding a gift" }, "protected_character");
    blocked({ subject: "A banner with Pikachu" }, "protected_character");
    blocked({ subject: "The Ashoka Chakra emblem on a government seal" }, "government_emblem");
    blocked({ subject: "A rally with a neo-nazi symbol" }, "nazi_hate_symbol");
    flagged({ subject: "A product with an FSSAI logo" }, "certification_mark");
  });
  await t("policy: minors, sexual, violence, drugs, weapons, politics (9)", () => {
    flagged({ subject: "A child playing with wooden toys" }, "minor_present");
    blocked({ subject: "A teenager in a bikini" }, "minor_sexual");
    blocked({ subject: "A sexy model in lingerie" }, "sexualised");
    blocked({ subject: "A nude statue" }, "sexualised");
    blocked({ subject: "A bloody crime scene with a corpse" }, "violence_gore");
    blocked({ subject: "A table with cocaine" }, "drugs_props");
    flagged({ subject: "A man holding a pistol" }, "weapons");
    blocked({ subject: "Election rally poster, vote for us" }, "political_content");
    blocked({ subject: "Before and after photos of weight and belly fat" }, "medical_before_after");
  });
  await t("policy: text printed on the picture (claims, numbers, urgency) (8)", () => {
    blocked({ subject: "A bottle", overlayText: ["100% cure for diabetes"] }, "medical_claim");
    blocked({ subject: "A chart", overlayText: ["Guaranteed returns of 20%"] }, "finance_guarantee");
    blocked({ subject: "A banner", overlayText: ["Guaranteed visa approval"] }, "guarantee_overlay");
    blocked({ subject: "A banner", overlayText: ["Card 1234 5678 9012 3456"] }, "secret_id_number");
    flagged({ subject: "A banner", overlayText: ["Call 9876543210"] }, "contact_number");
    flagged({ subject: "A banner", overlayText: ["Hurry, last chance"] }, "scarcity_in_text");
    flagged({ subject: "A banner", overlayText: ["Flat 50% off"] }, "price_claim");
    blocked({ subject: "A banner", overlayText: ["Doctor recommended"] }, "fake_authority");
  });
  await t("policy: documents, edits, negatives, religion", () => {
    blocked({ subject: "A fake news headline screenshot" }, "fake_document");
    flagged({ subject: "Edit", instruction: "make her look thinner", hasReferenceImages: true, consent: { attested: true, showsPeople: true, publicFigure: false, at: null, by: null } }, "alters_real_person");
    clean({ subject: "A quiet park bench", negative: "children, logos, crowds, text, weapons" });
    flagged({ subject: "A temple at sunrise" }, "religious_sensitive");
    clean({ subject: "Rangoli patterns on a floor", overlayText: ["Shubh Deepawali"] });
  });
  await t("policy: reference photos need consent, and never a public figure", () => {
    blocked({ subject: "Our product", hasReferenceImages: true, consent: null }, "consent_missing");
    blocked({ subject: "Our team photo", hasReferenceImages: true, consent: { attested: false, showsPeople: true, publicFigure: false, at: null, by: null } }, "consent_missing");
    blocked({ subject: "Our spokesperson", hasReferenceImages: true, consent: { attested: true, showsPeople: true, publicFigure: true, at: null, by: null } }, "public_figure_reference");
    clean({ subject: "Our product on a table", hasReferenceImages: true, consent: { attested: false, showsPeople: false, publicFigure: false, at: null, by: null } });
    clean({ subject: "Our product with our team", hasReferenceImages: true, consent: { attested: true, showsPeople: true, publicFigure: false, at: "2026-11-01", by: "a@b.c" } });
  });
  await t("policy: AI badge is suggested for realistic people, not for illustrations or products", () => {
    assert.equal(policyCheck({ subject: "A smiling shopkeeper at the counter", goalId: "organic_post" }).suggestAiBadge, true);
    assert.equal(policyCheck({ subject: "A smiling shopkeeper", style: "flat vector illustration" }).suggestAiBadge, false);
    assert.equal(policyCheck({ subject: "A ceramic mug on a table" }).suggestAiBadge, false);
    assert.equal(policyCheck({ subject: "Our product", hasReferenceImages: true, consent: { attested: true, showsPeople: true, publicFigure: false, at: null, by: null } }).suggestAiBadge, true);
  });
  await t("overlay text: limits, scripts, emoji", () => {
    assert.ok(checkOverlayText("Happy Diwali 50% off").ok);
    assert.ok(checkOverlayText("दिवाली की शुभकामनाएँ").ok);
    assert.ok(checkOverlayText("Sale ₹499 only").ok);
    assert.ok(!checkOverlayText("x".repeat(161)).ok);
    assert.ok(!checkOverlayText("a\nb\nc\nd\ne\nf\ng").ok);
    assert.ok(!checkOverlayText("Party 🎉").ok);
    assert.ok(!checkOverlayText("இனிய தீபாவளி").ok, "Tamil has no bundled font");
    assert.ok(checkOverlayText("").ok);
  });

  // ── magic bytes ──
  await t("sniff: real files are recognised, claims are checked", async () => {
    const png = await solid(8, 8, { r: 1, g: 2, b: 3 });
    const jpg = await sharp(png).jpeg().toBuffer();
    const webp = await sharp(png).webp().toBuffer();
    const gif = await sharp(png).gif().toBuffer();
    assert.equal(sniffKind(png), "png");
    assert.equal(sniffKind(jpg), "jpeg");
    assert.equal(sniffKind(webp), "webp");
    assert.equal(sniffKind(gif), "gif");
    assert.equal(sniffKind(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42")])), "mp4");
    assert.equal(sniffKind(Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from("ftypqt  ")])), "mov");
    assert.equal(sniffKind(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0])), "webm");
    assert.ok(matchesClaim(png, "image/png").ok);
    assert.ok(!matchesClaim(png, "image/jpeg").ok, "a PNG sent as image/jpeg is rejected");
    assert.ok(!matchesClaim(Buffer.from("<svg onload=alert(1)>"), "image/png").ok);
    assert.ok(!matchesClaim(Buffer.from("MZ\x90\x00"), "image/png").ok);
    assert.equal(sniffKind(Buffer.alloc(0)), null);
  });
  await t("probe: a file that only starts like an image is refused", async () => {
    await assert.rejects(() => probe(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("garbage")])));
    const p = await probe(await solid(30, 20, { r: 0, g: 0, b: 0 }));
    assert.deepEqual([p.width, p.height], [30, 20]);
  });

  // ── sharp golden checks ──
  await t("compose: crops to the exact size and keeps the right part of the picture", async () => {
    const src = await quadrants(1024, 1536);
    for (const key of ["ig_story", "ig_feed_square", "ig_feed_portrait", "yt_thumb", "li_banner_company", "gads_landscape"]) {
      const spec = specByKey(key)!;
      const out = await composeExport({ spec, source: src });
      const m = await sharp(out.data).metadata();
      assert.deepEqual([m.width, m.height, m.format], [spec.width, spec.height, "jpeg"], key);
      assert.ok(near(await px(out.data, 4, 4), { r: 255, g: 0, b: 0 }, 30), `${key} top-left`);
      assert.ok(near(await px(out.data, spec.width - 5, 4), { r: 0, g: 255, b: 0 }, 30), `${key} top-right`);
      assert.ok(near(await px(out.data, 4, spec.height - 5), { r: 0, g: 0, b: 255 }, 30), `${key} bottom-left`);
    }
  });
  await t("compose: focus keeps the chosen edge when cropping", async () => {
    const src = await quadrants(1000, 500);
    const sq = { width: 500, height: 500, safe: { top: 0, bottom: 0, left: 0, right: 0 }, formats: ["png" as const], maxBytes: null };
    const left = await composeExport({ spec: sq, source: src, focus: "left" });
    const right = await composeExport({ spec: sq, source: src, focus: "right" });
    assert.ok(near(await px(left.data, 490, 10), { r: 255, g: 0, b: 0 }, 5));
    assert.ok(near(await px(right.data, 10, 10), { r: 0, g: 255, b: 0 }, 5));
  });
  await t("compose: text is drawn by the app, inside the safe zone, in English and Hindi, with no network", async () => {
    const dark = await solid(1024, 1536, { r: 20, g: 30, b: 60 });
    const spec = specByKey("ig_story")!;
    const box = safeBox(spec);
    for (const text of ["Diwali Sale 50% off", "दिवाली की शुभकामनाएँ", "Free demo\nBook a seat"]) {
      const plain = await composeExport({ spec, source: dark, format: "png" });
      const out = await composeExport({ spec, source: dark, text: { value: text, position: "middle" }, format: "png" });
      assert.ok(out.textRect, text);
      const r = out.textRect!;
      assert.ok(r.left >= box.left && r.top >= box.top && r.left + r.width <= box.left + box.width && r.top + r.height <= box.top + box.height, `${text} inside safe zone: ${JSON.stringify(r)}`);
      const crop = (b: Buffer) => sharp(b).extract({ left: r.left, top: r.top, width: r.width, height: r.height }).raw().toBuffer();
      const [a, b] = await Promise.all([crop(plain.data), crop(out.data)]);
      let lit = 0;
      for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i] - b[i]) > 80) lit++;
      assert.ok(lit > 200, `${text} drew ${lit} bright pixels`);
      assert.deepEqual(await px(out.data, 5, 5), await px(plain.data, 5, 5), "outside the text, the picture is untouched");
    }
  });
  await t("compose: text colour adapts to a light picture and meets contrast", async () => {
    const light = await solid(1080, 1080, { r: 245, g: 240, b: 225 });
    const out = await composeExport({ spec: specByKey("ig_feed_square")!, source: light, text: { value: "Quiet Sunday", position: "bottom" }, format: "png" });
    const r = out.textRect!;
    const raw = await sharp(out.data).extract({ left: r.left, top: r.top, width: r.width, height: r.height }).raw().toBuffer();
    let darkest = 255;
    for (let i = 0; i < raw.length; i += 3) darkest = Math.min(darkest, raw[i]);
    assert.ok(darkest < 80, "dark text on a light picture");
    assert.ok(contrastRatio("#ffffff", "#000000") > 20.9);
    assert.ok(contrastRatio("#777777", "#ffffff") < 4.6);
  });
  await t("compose: long text is shrunk to fit, and reported when it cannot", async () => {
    const long = "A very long line that cannot possibly fit on a banner this thin without being tiny, so it must wrap and shrink";
    const spec = specByKey("li_banner_company")!;
    const fit = await composeExport({ spec, source: await solid(1128, 191, { r: 0, g: 0, b: 0 }), text: { value: long, position: "middle" }, format: "png" });
    assert.ok(fit.textRect!.height <= safeBox(spec).height);
    const tiny = { width: 240, height: 60, safe: { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1 }, formats: ["png" as const], maxBytes: null };
    const out = await composeExport({ spec: tiny, source: await solid(240, 60, { r: 0, g: 0, b: 0 }), text: { value: long.repeat(3), position: "middle" }, format: "png" });
    assert.ok(out.warnings.some((w) => /too long/.test(w)));
  });
  await t("compose: logo lands in its corner inside the safe zone, badge opposite the logo", async () => {
    const logo = await sharp({ create: { width: 200, height: 100, channels: 4, background: { r: 255, g: 0, b: 255, alpha: 1 } } }).png().toBuffer();
    const spec = specByKey("ig_feed_square")!;
    const box = safeBox(spec);
    const out = await composeExport({ spec, source: await solid(1080, 1080, { r: 10, g: 10, b: 10 }), logo: { data: logo, placement: "tl", scale: 0.2 }, badge: true, format: "png" });
    assert.ok(near(await px(out.data, box.left + 5, box.top + 5), { r: 255, g: 0, b: 255 }, 6), "logo top-left");
    assert.ok(near(await px(out.data, 1075, 1075), { r: 10, g: 10, b: 10 }, 6), "nothing outside the safe zone");
    const pill = await px(out.data, box.left + box.width - 30, box.top + box.height - 14);
    assert.ok(pill.r < 5 + 40 && pill.g < 5 + 40, "badge is on the right, opposite the left logo");
    const noBadge = await composeExport({ spec, source: await solid(1080, 1080, { r: 10, g: 10, b: 10 }), format: "png" });
    assert.notDeepEqual(await sharp(out.data).raw().toBuffer(), await sharp(noBadge.data).raw().toBuffer());
  });
  await t("compose: logo overlapping the text is reported", async () => {
    const logo = await solid(300, 300, { r: 255, g: 0, b: 255 });
    const out = await composeExport({ spec: specByKey("ig_feed_square")!, source: await solid(1080, 1080, { r: 0, g: 0, b: 0 }), text: { value: "Hello there", position: "top" }, logo: { data: logo, placement: "tl", scale: 0.3 }, format: "png" });
    assert.ok(out.warnings.some((w) => /overlaps/.test(w)));
  });
  await t("compose: JPEG is brought under the platform's size limit, metadata marks AI", async () => {
    const noisy = await sharp({ create: { width: 1600, height: 900, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 70 } } }).png().toBuffer();
    const spec = specByKey("yt_thumb")!;
    const out = await composeExport({ spec, source: noisy, meta: { description: "Test picture", aiGenerated: true } });
    assert.ok(out.data.length <= spec.maxBytes!, `${out.data.length} bytes`);
    const m = await sharp(out.data).metadata();
    assert.match(m.xmp?.toString("utf8") ?? "", /trainedAlgorithmicMedia/);
    assert.match(m.xmp?.toString("utf8") ?? "", /Test picture/);
    assert.ok(m.exif && m.exif.length > 10);
    assert.match(xmpPacket({ description: "<&>", aiGenerated: false }), /&lt;&amp;&gt;/);
    assert.ok(!/trainedAlgorithmicMedia/.test(xmpPacket({ description: "x", aiGenerated: false })));
  });
  await t("compose: thumbnails are small WebP", async () => {
    const th = await makeThumb(await solid(2000, 1000, { r: 9, g: 9, b: 9 }));
    assert.equal(th.width, 480);
    assert.equal(th.height, 240);
    assert.equal((await sharp(th.data).metadata()).format, "webp");
  });

  // ── providers ──
  await t("openai provider: generate and edit map parameters, usage and refusals", async () => {
    const seen: Record<string, unknown>[] = [];
    const png = (await solid(8, 8, { r: 1, g: 1, b: 1 })).toString("base64");
    const client = {
      images: {
        generate: async (p: Record<string, unknown>) => (seen.push({ k: "g", ...p }), { data: [{ b64_json: png }, { b64_json: png }], usage: { input_tokens: 10, output_tokens: 100 } }),
        edit: async (p: Record<string, unknown>) => (seen.push({ k: "e", ...p }), { data: [{ b64_json: png }] }),
      },
    };
    const prov = new OpenAiImageProvider(client as never);
    const g = await prov.generate({ prompt: "p", n: 2, model: "gpt-image-2.5-flare", quality: "high", openAiSize: "1024x1536", geminiRatio: "9:16" });
    assert.equal(g.images.length, 2);
    assert.equal(g.usage?.output_tokens, 100);
    assert.deepEqual([seen[0].model, seen[0].n, seen[0].size, seen[0].quality], ["gpt-image-2.5-flare", 2, "1024x1536", "high"]);
    const e = await prov.edit({ prompt: "warmer", n: 1, model: "m", quality: "low", openAiSize: "1024x1024", geminiRatio: "1:1", references: [{ data: Buffer.from(png, "base64"), mimeType: "image/png" }] });
    assert.equal(e.images.length, 1);
    assert.equal((seen[1].image as unknown[]).length, 1);
    await assert.rejects(() => prov.edit({ prompt: "x", n: 1, model: "m", quality: "low", openAiSize: "1024x1024", geminiRatio: "1:1" }), ImageProviderError);
  });
  await t("openai provider: refusals and failures become plain messages", () => {
    const m = (e: unknown) => mapOpenAiError(e);
    assert.equal(m({ status: 400, code: "content_policy_violation", message: "x" }).code, "moderation");
    assert.equal(m({ status: 400, error: { code: "moderation_blocked", message: "Your request was rejected by the safety system" } }).code, "moderation");
    assert.equal(m({ status: 400, message: "rejected by the safety system" }).code, "moderation");
    assert.equal(m({ status: 429, code: "insufficient_quota" }).code, "quota");
    assert.equal(m({ status: 429 }).code, "rate");
    assert.equal(m({ status: 401 }).code, "auth");
    assert.equal(m({ status: 400, message: "bad size" }).code, "bad_request");
    assert.equal(m({ name: "APIConnectionError", message: "fetch failed" }).code, "unreachable");
    assert.equal(m(new Error("boom")).code, "provider");
    for (const c of ["moderation", "quota", "rate", "auth"]) assert.ok(!/sk-|status|\{/.test(m({ status: 400, code: c === "moderation" ? "content_policy_violation" : "", message: "sk-abc123" }).message));
  });
  await t("gemini provider: request shape, reference images, response parsing, refusals", async () => {
    const png = (await solid(300, 300, { r: 5, g: 6, b: 7 })).toString("base64");
    const bodies: Record<string, unknown>[] = [];
    const headers: Record<string, string>[] = [];
    const fetchFn = async (url: string, init?: RequestInit) => {
      assert.match(url, /\/v1beta\/interactions$/);
      bodies.push(JSON.parse(String(init?.body)));
      headers.push(init?.headers as Record<string, string>);
      return new Response(JSON.stringify({ status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "ok" }, { type: "image", mime_type: "image/png", data: png }] }] }), { status: 200 });
    };
    const prov = new GeminiImageProvider("KEY", fetchFn as never);
    const r = await prov.generate({ prompt: "a mug", n: 3, model: "gemini-nano-banana-2.1", quality: "medium", openAiSize: "1024x1024", geminiRatio: "4:5" });
    assert.equal(r.images.length, 3);
    assert.equal(bodies.length, 3, "one call per picture");
    assert.equal(bodies[0].model, "gemini-nano-banana-2.1");
    assert.deepEqual(bodies[0].response_format, { type: "image", aspect_ratio: "4:5", image_size: "1K" });
    assert.equal(headers[0]["x-goog-api-key"], "KEY");
    await prov.edit({ prompt: "warmer", n: 1, model: "gemini-nano-banana-2.1", quality: "medium", openAiSize: "1024x1024", geminiRatio: "1:1", references: [{ data: Buffer.from(png, "base64"), mimeType: "image/png" }] });
    const input = bodies[3].input as { type: string }[];
    assert.deepEqual(input.map((x) => x.type), ["image", "text"]);
    assert.ok(findImage({ a: [{ b: { type: "image", data: png } }] }));
    assert.equal(findImage({ type: "text" }), null);
    const blockedFetch = async () => new Response(JSON.stringify({ error: { message: "Request blocked by safety filters" } }), { status: 400 });
    await assert.rejects(() => new GeminiImageProvider("K", blockedFetch as never).generate({ prompt: "x", n: 1, model: "m", quality: "m", openAiSize: "1024x1024", geminiRatio: "1:1" }), (e: ImageProviderError) => e.code === "moderation");
    const noImage = async () => new Response(JSON.stringify({ status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "cannot" }] }] }), { status: 200 });
    await assert.rejects(() => new GeminiImageProvider("K", noImage as never).generate({ prompt: "x", n: 1, model: "m", quality: "m", openAiSize: "1024x1024", geminiRatio: "1:1" }), (e: ImageProviderError) => e.code === "moderation");
    assert.equal(mapGeminiFailure(429, "quota exhausted").code, "quota");
    assert.equal(mapGeminiFailure(429, "slow down").code, "rate");
    assert.equal(mapGeminiFailure(403, "").code, "auth");
    assert.equal(mapGeminiFailure(500, "").code, "provider");
  });

  // ── prompt and brief ──
  await t("brief: cleaned, bounded, text checked; prompt never contains the overlay words", () => {
    const b = cleanBrief({ ...okBrief, variants: 9, specKeys: ["ig_story", "bogus", "ig_story"] }, S);
    assert.equal(b.variants, 4);
    assert.deepEqual(b.specKeys, ["ig_story"]);
    assert.throws(() => cleanBrief({ ...okBrief, goalId: "nope" }, S));
    assert.throws(() => cleanBrief({ ...okBrief, overlayText: ["Party 🎉"] }, S));
    assert.throws(() => cleanBrief({ ...okBrief, specKeys: ["bogus"] }, S));
    const c = cleanBrief({ goalId: "carousel_set", subject: "x".repeat(10), overlayText: ["One", "Two", "Three"] }, S);
    assert.equal(c.variants, 3, "one picture per slide");
    assert.equal(cleanBrief({ goalId: "carousel_set", overlayText: ["a"] }, S).overlayText.length, 2, "padded to the minimum slide count");
    const p = buildPrompt(b, { ...EMPTY_KIT, voice: "friendly", dos: ["natural light"], donts: ["neon"], colours: { primary: "#112233", secondary: "", accent: "", text: "" } }, goalById("organic_post")!, null);
    assert.ok(!p.includes("Festive offers"));
    assert.match(p, /Do not draw any text/);
    assert.match(p, /#112233/);
    assert.match(p, /Never: neon/);
    assert.match(buildPrompt(b, null, goalById("organic_post")!, null, "make the background warmer"), /Change requested: make the background warmer/);
  });

  // ── engine, tenancy, library (throwaway database) ──
  try {
    await runAsCompany("co_img_a", async () => {
      await saveImageSettings({ ...S, dailySpendCapUsd: 5, approvalThresholdUsd: 2, perUserPerMinute: 60 }, "admin");
      const h = makeDeps();
      const eng = createEngine(h.deps);

      let projectId = "";
      await t("engine: create, generate N variants, books cost and writes the audit trail", async () => {
        const p = await eng.createProject(emp, okBrief);
        projectId = p._id;
        const out = await eng.generate(emp, p._id);
        assert.equal(out.outcome, "done");
        const doc = await getProject(p._id);
        assert.equal(doc!.variants.length, 2);
        assert.equal(h.fp.calls.length, 2, "one request per picture, so progress is real");
        assert.ok(h.fp.calls.every((c) => c.req.n === 1));
        assert.equal(doc!.progress?.done, 2);
        assert.equal(h.fp.calls[0].req.openAiSize, "1024x1024");
        assert.ok(!h.fp.calls[0].req.prompt.includes("Festive offers"), "overlay words never reach the model");
        assert.equal(doc!.variants[0].costBasis, "price-table");
        assert.equal(doc!.totalCostUsd, doc!.variants.reduce((a, v) => a + v.costUsd, 0));
        assert.ok(doc!.totalCostUsd > 0);
        assert.ok(doc!.variants.every((v) => h.blobs.has(v.storageKey)), "pictures stored under the company prefix");
        assert.ok(doc!.variants.every((v) => v.storageKey.startsWith("smms/test/studio/")));
        assert.ok(h.audits.some((a) => a.startsWith("generate:")));
      });
      await t("engine: blocked briefs are refused before any spend; flags need acknowledgement", async () => {
        const bad = await eng.createProject(emp, { ...okBrief, subject: "Narendra Modi with our product" });
        await assert.rejects(() => eng.generate(emp, bad._id), /can't be generated/);
        const before = h.fp.calls.length;
        const flag = await eng.createProject(emp, { ...okBrief, subject: "A child playing with wooden toys in a shop" });
        const r1 = await eng.generate(emp, flag._id);
        assert.equal(r1.outcome, "needs_ack");
        assert.equal(h.fp.calls.length, before, "nothing generated before acknowledgement");
        const r2 = await eng.generate(emp, flag._id, { acknowledge: ["minor_present"] });
        assert.equal(r2.outcome, "done");
      });
      await t("engine: pick, then edit this variant (references the chosen picture) with lineage", async () => {
        const doc = await getProject(projectId);
        const chosen = await eng.choose(emp, projectId, [doc!.variants[0].id, doc!.variants[1].id]);
        assert.deepEqual(chosen.chosenIds, [doc!.variants[0].id], "one pick for a normal goal");
        const r = await eng.editVariant(emp, projectId, doc!.variants[0].id, "make the background warmer");
        assert.equal(r.outcome, "done");
        const after = await getProject(projectId);
        const edited = after!.variants[after!.variants.length - 1];
        assert.equal(edited.parentId, doc!.variants[0].id);
        assert.equal(edited.instruction, "make the background warmer");
        const call = h.fp.calls[h.fp.calls.length - 1];
        assert.equal(call.kind, "edit");
        assert.match(call.req.prompt, /Change requested: make the background warmer/);
        assert.equal(call.req.references![0].mimeType, "image/png");
        await assert.rejects(() => eng.editVariant(emp, projectId, doc!.variants[0].id, "x"), /Say what to change/);
        await assert.rejects(() => eng.editVariant(emp, projectId, "nope", "make it brighter"), /no longer exists/);
      });
      await t("engine: an edit instruction that breaks policy is refused", async () => {
        const doc = await getProject(projectId);
        await assert.rejects(() => eng.editVariant(emp, projectId, doc!.variants[0].id, "add the Nike logo on the shirt"), /can't be generated/);
      });
      await t("engine: finish composes every size, saves with provenance and disclosure, records consent", async () => {
        const doc = await getProject(projectId);
        await eng.choose(emp, projectId, [doc!.variants[0].id]);
        const r = await eng.finish(emp, projectId, { name: "Festive", tags: ["diwali"], folder: "Diwali 2026", badge: true, applyLogo: false, specKeys: ["ig_story", "yt_thumb"] });
        assert.equal(r.exports.length, 2);
        assert.equal(h.saved.length, 2);
        const [a, b] = h.saved;
        assert.deepEqual([a.meta.width, a.meta.height], [1080, 1920]);
        assert.deepEqual([b.meta.width, b.meta.height], [1280, 720]);
        assert.equal(a.meta.ai.aiGenerated, true);
        assert.equal(a.meta.ai.projectId, projectId);
        assert.equal(a.meta.ai.model, "gpt-image-2.5-flare");
        assert.equal(a.meta.studio.badge, true);
        assert.equal(a.meta.studio.metadataMarked, true);
        assert.equal(a.meta.folder, "Diwali 2026");
        assert.ok(a.meta.tags.includes("diwali") && a.meta.tags.includes("image-studio"));
        assert.match(a.meta.prompt, /Create a social media feed image/);
        assert.equal(a.meta.platform, "instagram");
        assert.equal(b.meta.platform, "youtube");
        assert.match(((await sharp(a.buf).metadata()).xmp ?? Buffer.alloc(0)).toString("utf8"), /trainedAlgorithmicMedia/);
        assert.equal((await getProject(projectId))!.status, "finished");
        assert.ok(h.audits.some((x) => /Saved 2 AI image/.test(x)));
      });
      await t("engine: finish needs a pick, a real logo when asked, and a policy-clean brief", async () => {
        const p = await eng.createProject(emp, okBrief);
        await assert.rejects(() => eng.finish(emp, p._id, { name: "x", badge: false, applyLogo: false }), /Pick the picture/);
        await eng.generate(emp, p._id);
        const d = await getProject(p._id);
        await eng.choose(emp, p._id, [d!.variants[0].id]);
        await assert.rejects(() => eng.finish(emp, p._id, { name: "x", badge: false, applyLogo: true }), /Add a logo/);
        await saveBrandKit({ logoMediaId: "logo1", applyLogo: true }, "admin");
        await assert.rejects(() => eng.finish(emp, p._id, { name: "x", badge: false, applyLogo: true }), /logo is missing/);
        h.media.set("logo1", { data: await sharp({ create: { width: 120, height: 60, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(), mimeType: "image/png", name: "logo" });
        const n = h.saved.length;
        await eng.finish(emp, p._id, { name: "with logo", badge: false, applyLogo: true, specKeys: ["ig_feed_square"] });
        assert.equal(h.saved.length, n + 1);
        assert.ok(near(await px(h.saved[n].buf, 1080 - 54 - 20, 1080 - 54 - 8), { r: 255, g: 0, b: 0 }, 30), "logo bottom-right inside the safe zone");
      });
      await t("engine: carousel makes one picture per slide and exports each slide", async () => {
        const p = await eng.createProject(emp, { goalId: "carousel_set", subject: "Abstract blue shapes", overlayText: ["Step one", "Step two", "Step three"] });
        const before = h.fp.calls.length;
        await eng.generate(emp, p._id);
        assert.equal(h.fp.calls.length - before, 3);
        assert.match(h.fp.calls[before + 1].req.prompt, /slide 2 of 3/);
        const d = await getProject(p._id);
        assert.deepEqual(d!.variants.map((v) => v.slide), [0, 1, 2]);
        await eng.choose(emp, p._id, d!.variants.map((v) => v.id));
        const n = h.saved.length;
        const r = await eng.finish(emp, p._id, { name: "Steps", badge: false, applyLogo: false });
        assert.equal(r.exports.length, 3);
        assert.match(h.saved[n + 1].meta.name, /slide 2/);
      });
      await t("engine: provider refusal is shown plainly, books nothing, and the next try works", async () => {
        const hf = makeDeps({ provider: fakeProvider({ fail: new ImageProviderError("moderation", "The image model declined this request because of its safety rules.") }).provider });
        const e2 = createEngine(hf.deps);
        const p = await e2.createProject(emp, okBrief);
        await assert.rejects(() => e2.generate(emp, p._id), /safety rules/);
        const d = await getProject(p._id);
        assert.equal(d!.variants.length, 0);
        assert.equal(d!.totalCostUsd, 0);
        assert.equal(d!.status, "failed");
        assert.match(d!.error ?? "", /safety/);
        assert.ok(hf.audits.some((x) => /failed: moderation/.test(x)));
      });

      // limits against the real ledger
      await t("engine: per-person rate limit counts the ledger", async () => {
        await saveImageSettings({ perUserPerMinute: 3, dailySpendCapUsd: 100, approvalThresholdUsd: 100 }, "admin");
        const h2 = makeDeps();
        const e2 = createEngine(h2.deps);
        const u: Actor = { userId: "rate-user", email: null, canApprove: false };
        const p = await e2.createProject(u, { ...okBrief, variants: 2 });
        assert.equal((await e2.generate(u, p._id)).outcome, "done");
        await assert.rejects(() => e2.generate(u, p._id), /3 pictures a minute|pictures a minute/);
        const other: Actor = { userId: "other-user", email: null, canApprove: false };
        assert.equal((await e2.generate(other, p._id)).outcome, "done", "another person is not limited");
      });
      await t("engine: daily spend cap blocks and tells a manager can raise it", async () => {
        await saveImageSettings({ perUserPerMinute: 60, dailySpendCapUsd: 0.05, approvalThresholdUsd: 100 }, "admin");
        const h3 = makeDeps();
        const e3 = createEngine(h3.deps);
        const u: Actor = { userId: "cap-user", email: null, canApprove: false };
        const p = await e3.createProject(u, { ...okBrief, variants: 4 });
        await assert.rejects(() => e3.generate(u, p._id), /spend limit/);
        assert.equal(h3.fp.calls.length, 0);
      });
      await t("engine: above the approval limit it waits for a manager; the manager's approval runs it", async () => {
        await saveImageSettings({ perUserPerMinute: 60, dailySpendCapUsd: 100, approvalThresholdUsd: 0.01 }, "admin");
        const h4 = makeDeps();
        const e4 = createEngine(h4.deps);
        const u: Actor = { userId: "appr-user", email: "a@x", canApprove: false };
        const p = await e4.createProject(u, okBrief);
        const r = await e4.generate(u, p._id);
        assert.equal(r.outcome, "needs_manager");
        assert.equal(h4.fp.calls.length, 0, "no spend before approval");
        assert.deepEqual(h4.notes.length, 1);
        assert.equal((await getProject(p._id))!.status, "awaiting_approval");
        await assert.rejects(() => e4.approve(u, p._id), /Only a manager/);
        const ok = await e4.approve(mgr, p._id);
        assert.equal(ok.outcome, "done");
        assert.equal(h4.fp.calls.length, 2);
        assert.equal((await getProject(p._id))!.variants.length, 2);
        await assert.rejects(() => e4.approve(mgr, p._id), /Nothing is waiting/);
        const direct = await e4.generate(mgr, p._id);
        assert.equal(direct.outcome, "done", "a manager is not held up by the limit");
        const p2 = await e4.createProject(u, okBrief);
        assert.equal((await e4.generate(u, p2._id)).outcome, "needs_manager");
        await e4.reject(mgr, p2._id);
        assert.equal((await getProject(p2._id))!.pendingApproval, null);
      });
      await t("engine: kit and settings round-trip and are sanitised", async () => {
        const kit = await saveBrandKit({ colours: { primary: "#ABCDEF", secondary: "nope", accent: "", text: "123456" }, dos: ["a", "a", "b"], logoScale: 5, logoPlacement: "zz" as never }, "admin");
        assert.equal(kit.colours.primary, "#abcdef");
        assert.equal(kit.colours.secondary, "");
        assert.equal(kit.colours.text, "#123456");
        assert.deepEqual(kit.dos, ["a", "b"]);
        assert.equal(kit.logoScale, 0.4);
        assert.equal(kit.logoPlacement, "br");
        assert.equal((await getBrandKit()).colours.primary, "#abcdef");
      });
    });

    await runAsCompany("co_img_b", async () => {
      await t("tenancy: another company sees none of the projects, kit or settings", async () => {
        assert.equal((await listProjects()).length, 0);
        assert.equal((await getBrandKit()).colours.primary, "");
        assert.equal((await getImageSettings()).dailySpendCapUsd, DEFAULT_IMAGE_SETTINGS.dailySpendCapUsd);
        const h = makeDeps();
        await assert.rejects(() => createEngine(h.deps).getProject("anything"));
      });
    });
    await runAsCompany("co_img_a", async () => {
      await t("tenancy: company A still has its projects", async () => {
        assert.ok((await listProjects()).length >= 5);
      });
    });

    // ── library filters ──
    await runAsCompany("co_lib", async () => {
      const col = await smmsCollection<MediaDoc>(COLLECTIONS.media);
      const base = { description: "", altText: "", tags: [] as string[], platform: null, contentType: "image/png", size: 1000, durationSec: null, creativePrompt: "", thumbnailId: null, script: "", caption: "", versions: [] };
      const mk = (id: string, o: Partial<MediaDoc>): MediaDoc => ({ _id: id, kind: "image", name: id, storageKey: `k/${id}`, width: 1080, height: 1080, source: "upload", ...base, ...createStamp("u"), ...o }) as MediaDoc;
      await col.insertMany([
        mk("up-square", { name: "Shop front", tags: ["store"], folder: "Store" }),
        mk("ai-portrait", { source: "ai", width: 1080, height: 1350, tags: ["ai", "diwali"], folder: "Diwali", ai: { aiGenerated: true, provider: "openai", model: "m", projectId: "p", role: "image", disclosureRequired: true } }),
        mk("ai-story", { source: "ai", width: 1080, height: 1920, tags: ["ai"] }),
        mk("ugc-video", { kind: "video", source: "ai", contentType: "video/mp4", width: 1080, height: 1920, tags: ["ai", "ugc"] }),
        mk("small", { width: 300, height: 300, name: "Tiny" }),
        mk("gone", { deletedAt: new Date() }),
      ]);
      const ids = async (f: Parameters<typeof listMedia>[0]) => (await listMedia(f)).items.map((m) => m._id).sort();
      await t("library: origin filter separates uploads, AI images and UGC videos", async () => {
        assert.deepEqual(await ids({ origin: "upload" }), ["small", "up-square"]);
        assert.deepEqual(await ids({ origin: "ai_image" }), ["ai-portrait", "ai-story"]);
        assert.deepEqual(await ids({ origin: "ugc_video" }), ["ugc-video"]);
        assert.deepEqual(await ids({ source: "ai" }), ["ai-portrait", "ai-story", "ugc-video"]);
        assert.ok(!(await ids({})).includes("gone"), "deleted items never show");
      });
      await t("library: platform fit, width, folder, tag and search filters", async () => {
        assert.deepEqual(await ids({ fit: "ig_feed_portrait" }), ["ai-portrait"]);
        assert.deepEqual(await ids({ fit: "ig_story" }), ["ai-story"]);
        assert.deepEqual(await ids({ fit: "ig_feed_square" }), ["up-square"], "300px is too small for a 1080 square");
        assert.deepEqual(await ids({ minWidth: 1000, kind: "image" }), ["ai-portrait", "ai-story", "up-square"]);
        assert.deepEqual(await ids({ folder: "Diwali" }), ["ai-portrait"]);
        assert.deepEqual(await ids({ folder: "__none" }), ["small", "ugc-video", "ai-story"].sort());
        assert.deepEqual(await ids({ tag: "diwali" }), ["ai-portrait"]);
        assert.deepEqual(await ids({ q: "shop" }), ["up-square"]);
        assert.deepEqual(await ids({ q: "Diwali" }), ["ai-portrait"], "search also covers folder and tags");
        assert.deepEqual(await ids({ q: ".*" }), [], "search text is escaped, not a pattern");
        assert.deepEqual(await ids({ fit: "nope" }), (await ids({})), "an unknown size filter is ignored");
      });
      await t("library: filter builder and platform fit chips", () => {
        assert.deepEqual(buildMediaFilter({}), { deletedAt: null });
        assert.deepEqual(platformFit({ kind: "image", width: 1080, height: 1920 }), ["ig_story", "fb_story"]);
        assert.deepEqual(platformFit({ kind: "video", width: 1080, height: 1920 }), []);
      });
    });
  } finally {
    const client = await MongoClient.connect(uri);
    for (const d of (await client.db().admin().listDatabases()).databases) if (/zz_throwaway/.test(d.name) || /co_img|co_lib/.test(d.name)) {
      // Only databases whose names prove they are throwaway are dropped.
      if (/zz_throwaway/.test(d.name)) await client.db(d.name).dropDatabase();
    }
    assert.ok(/zz_throwaway/.test(client.db().databaseName));
    await client.db().dropDatabase();
    await client.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
