/**
 * ViralPulse posts wizard tests: reducer, per-step validation, character counting (X weighting, emoji), UTM builder, thread
 * splitting (same algorithm as the X publisher), schedule/time-zone helpers, publish-tracker status mapping and polling rules,
 * studio hand-off parsing, calendar helpers, state <-> post conversion for old posts, and a save/reopen round trip on a
 * throwaway database (the account/AI/provider layers are never touched).
 * Run: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_n npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-viralpulse-posts-ui.ts
 */
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "";
const dbName = uri.split("?")[0].split("/").pop() ?? "";
assert.ok(/zz_throwaway/.test(dbName), "refusing to run: MONGODB_URI must be a zz_throwaway_* database");

import { runAsCompany } from "../src/lib/platform/tenancy/context";
import {
  CONTENT_TYPES, OBJECTIVES, accountUse, buildPublishOptions, buildUtmUrl, checkScheduleInput, contentTypeDef, countChars, defaultUtm, draftInstruction, emptyWizard, finalLink, firstIncompleteStep, handoffHref,
  hashtagGuidance, inferContentTypes, istToZone, localInZone, moveItem, normalizeHashtags, objectiveKeyFor, parseHandoff, pickAccount, pollDelayMs, POLL_GIVE_UP_MS, postContentType, readUtm, resumeStep,
  sanitizeWizardState, shouldPoll, splitThread, stateFromPost, stripUtm, trackerActions, trackerPhase, validateStep, wizardReducer, xWeightedLength, nativeLabelMap, disclosureSummary,
  type PostLike, type ValidationCtx, type WizardAccount, type WizardState,
} from "../src/lib/products/viralpulse-ai/post-wizard/helpers";
import { previewFor, type PreviewMedia } from "../src/lib/products/viralpulse-ai/post-wizard/preview";
import { addDays, dayKeyIn, monthDays, rangeOf, shiftMonth, weekDays, weekStart } from "../src/lib/products/viralpulse-ai/post-wizard/calendar";
import { splitThread as serverSplit } from "../src/lib/products/viralpulse-ai/publishers/x";
import { POST_PLATFORMS } from "../src/lib/products/viralpulse-ai/constants";

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

const TZ = "Asia/Kolkata";
const acct = (o: Partial<WizardAccount> & { id: string; platform: WizardAccount["platform"] }): WizardAccount => ({ providerLabel: "x", name: o.id, handle: null, status: "healthy", enabled: true, isDefault: false, daysLeft: null, expiresAt: null, missingRequired: [], lastError: null, kind: "x", ...o });
const accounts: WizardAccount[] = [acct({ id: "ig1", platform: "instagram", isDefault: true }), acct({ id: "fb1", platform: "facebook" }), acct({ id: "yt1", platform: "youtube" }), acct({ id: "li1", platform: "linkedin" }), acct({ id: "x1", platform: "x" }), acct({ id: "xbad", platform: "x", status: "expired" })];
const ctx = (over: Partial<ValidationCtx> = {}): ValidationCtx => ({ accounts, media: { i1: { kind: "image" }, i2: { kind: "image" }, v1: { kind: "video" } }, captionLimits: { instagram: 2200, x: 280, youtube: 5000, linkedin: 3000, facebook: 63206, google_business: 1500 }, now: new Date("2026-11-02T10:00:00Z"), ...over });
const base = (over: Partial<WizardState> = {}): WizardState => ({ ...emptyWizard(TZ), objective: "awareness", topic: "Launch", platforms: ["instagram"], accountIds: { instagram: "ig1" }, contentTypes: { instagram: "image" }, variants: { instagram: { title: "", content: "Hello", hashtags: [], keywords: [], cta: "" } }, mediaIds: ["i1"], ...over });

async function main() {
  // ── platforms, content types ──
  await t("x is a post platform, with its own publisher-backed content types", () => {
    assert.ok((POST_PLATFORMS as readonly string[]).includes("x"));
    assert.deepEqual(CONTENT_TYPES.x.map((c) => c.key), ["text", "image", "video", "thread"]);
    assert.deepEqual(CONTENT_TYPES.youtube.map((c) => c.key), ["video", "short"]);
    assert.ok(CONTENT_TYPES.instagram.some((c) => c.key === "story") && CONTENT_TYPES.instagram.some((c) => c.key === "reel"));
    assert.equal(contentTypeDef("instagram", "carousel")?.max, 20);
    assert.equal(contentTypeDef("youtube", "article"), null);
    for (const p of POST_PLATFORMS) assert.ok(CONTENT_TYPES[p].length > 0, p);
  });
  await t("objectives map to labels and back, legacy labels are understood", () => {
    assert.equal(OBJECTIVES.length, 7);
    assert.equal(objectiveKeyFor("Awareness"), "awareness");
    assert.equal(objectiveKeyFor("hiring"), "hiring");
    assert.equal(objectiveKeyFor("Something else"), "");
  });

  // ── accounts ──
  await t("account health: expired, revoked, missing scope are blocked with a fix; expiring is allowed with a warning", () => {
    for (const status of ["expired", "revoked", "missing_scope"] as const) {
      const u = accountUse({ status, enabled: true, daysLeft: null, missingRequired: ["w_member_social"] });
      assert.equal(u.usable, false);
      assert.ok(u.fix && u.fix.length > 10);
    }
    const e = accountUse({ status: "expiring", enabled: true, daysLeft: 3, missingRequired: [] });
    assert.equal(e.usable, true);
    assert.equal(e.tone, "warn");
    assert.match(e.label, /3 days/);
    assert.equal(accountUse({ status: "healthy", enabled: false, daysLeft: null, missingRequired: [] }).usable, false);
  });
  await t("default account: chosen, else default flag, else first usable (never a blocked one)", () => {
    assert.equal(pickAccount("x", accounts)?.id, "x1");
    assert.equal(pickAccount("instagram", accounts)?.id, "ig1");
    assert.equal(pickAccount("x", accounts, "xbad")?.id, "xbad");
    assert.equal(pickAccount("google_business", accounts), null);
  });

  // ── reducer ──
  await t("reducer: toggling a platform picks its account and default type, and removes them again", () => {
    let s = emptyWizard(TZ);
    s = wizardReducer(s, { type: "togglePlatform", platform: "x", accounts });
    s = wizardReducer(s, { type: "togglePlatform", platform: "instagram", accounts });
    assert.deepEqual(s.platforms, ["instagram", "x"]);
    assert.equal(s.accountIds.x, "x1");
    assert.equal(s.contentTypes.instagram, "image");
    s = wizardReducer(s, { type: "togglePlatform", platform: "x", accounts });
    assert.deepEqual(s.platforms, ["instagram"]);
    assert.equal(s.accountIds.x, undefined);
    assert.equal(s.contentTypes.x, undefined);
  });
  await t("reducer: any content change clears the final confirmation, saving the post id does not", () => {
    let s = { ...base(), confirmed: true };
    s = wizardReducer(s, { type: "set", patch: { postId: "p1" } });
    assert.equal(s.confirmed, true);
    s = wizardReducer(s, { type: "variant", platform: "instagram", patch: { content: "Changed" } });
    assert.equal(s.confirmed, false);
    assert.equal(s.variants.instagram?.content, "Changed");
    s = wizardReducer({ ...s, confirmed: true }, { type: "option", patch: { youtubePrivacy: "public" } });
    assert.equal(s.confirmed, false);
  });
  await t("reducer: reordering media moves one item and ignores bad indexes", () => {
    assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
    assert.deepEqual(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
    assert.deepEqual(moveItem(["a", "b"], 0, 5), ["a", "b"]);
    const s = wizardReducer(base({ mediaIds: ["i1", "i2"] }), { type: "moveMedia", from: 1, to: 0 });
    assert.deepEqual(s.mediaIds, ["i2", "i1"]);
  });

  // ── validation ──
  await t("step 1: objective, platform, account health and post type are checked", () => {
    assert.ok(validateStep(emptyWizard(TZ), "goal", ctx()).errors.objective);
    assert.ok(validateStep({ ...emptyWizard(TZ), objective: "sales" }, "goal", ctx()).errors.platforms);
    const bad = base({ platforms: ["x"], accountIds: { x: "xbad" }, contentTypes: { x: "text" } });
    assert.match(validateStep(bad, "goal", ctx()).errors["account.x"], /expired/i);
    assert.deepEqual(validateStep(base(), "goal", ctx()).errors, {});
    assert.ok(validateStep(base({ contentTypes: {} }), "goal", ctx()).errors["type.instagram"]);
    assert.ok(validateStep(base({ platforms: ["google_business"], accountIds: {}, contentTypes: { google_business: "text" } }), "goal", ctx()).errors["account.google_business"]);
  });
  await t("step 2: topic is required and bounded", () => {
    assert.ok(validateStep(base({ topic: " " }), "brief", ctx()).errors.topic);
    assert.ok(validateStep(base({ topic: "x".repeat(501) }), "brief", ctx()).errors.topic);
    assert.deepEqual(validateStep(base(), "brief", ctx()).errors, {});
  });
  await t("step 3: character limits per platform, YouTube title, text types need text, bad link", () => {
    const long = base({ variants: { instagram: { title: "", content: "a".repeat(2201), hashtags: [], keywords: [], cta: "" } } });
    assert.match(validateStep(long, "content", ctx()).errors["content.instagram"], /2200/);
    const x = base({ platforms: ["x"], accountIds: { x: "x1" }, contentTypes: { x: "text" }, variants: { x: { title: "", content: "a".repeat(281), hashtags: [], keywords: [], cta: "" } } });
    assert.ok(validateStep(x, "content", ctx()).errors["content.x"]);
    const thread = { ...x, contentTypes: { x: "thread" as const } };
    assert.equal(validateStep(thread, "content", ctx()).errors["content.x"], undefined);
    const empty = { ...x, variants: { x: { title: "", content: "", hashtags: [], keywords: [], cta: "" } } };
    assert.ok(validateStep(empty, "content", ctx()).errors["content.x"]);
    const yt = base({ platforms: ["youtube"], accountIds: { youtube: "yt1" }, contentTypes: { youtube: "video" }, variants: { youtube: { title: "", content: "d", hashtags: [], keywords: [], cta: "" } } });
    assert.ok(validateStep(yt, "content", ctx()).errors["title.youtube"]);
    assert.ok(validateStep(base({ link: "not a url" }), "content", ctx()).errors.link);
    const li = base({ platforms: ["linkedin"], accountIds: { linkedin: "li1" }, contentTypes: { linkedin: "article" }, variants: { linkedin: { title: "t", content: "c", hashtags: [], keywords: [], cta: "" } } });
    assert.ok(validateStep(li, "content", ctx()).errors["link.linkedin"]);
  });
  await t("step 3: hashtag counts warn (Instagram 30, YouTube 3 shown, X 2)", () => {
    assert.equal(hashtagGuidance("instagram", 31).tone, "warn");
    assert.equal(hashtagGuidance("instagram", 5).tone, "ok");
    assert.equal(hashtagGuidance("youtube", 4).tone, "warn");
    assert.equal(hashtagGuidance("x", 3).tone, "warn");
    assert.deepEqual(normalizeHashtags(["Summer Sale", "#summer", "summer", "", "#"]), ["#SummerSale", "#summer"]);
  });
  await t("step 4: media counts per post type (photo, carousel 2..20, reel video, mixed)", () => {
    const m = (o: Partial<WizardState>) => validateStep(base(o), "media", ctx()).errors["media.instagram"];
    assert.equal(m({}), undefined);
    assert.ok(m({ mediaIds: [] }));
    assert.ok(m({ contentTypes: { instagram: "carousel" }, mediaIds: ["i1"] }));
    assert.equal(m({ contentTypes: { instagram: "carousel" }, mediaIds: ["i1", "i2"] }), undefined);
    assert.ok(m({ contentTypes: { instagram: "reel" }, mediaIds: ["i1"] }));
    assert.equal(m({ contentTypes: { instagram: "reel" }, mediaIds: ["v1"] }), undefined);
    assert.ok(m({ contentTypes: { instagram: "carousel" }, mediaIds: ["i1", "v1"] }));
    assert.ok(m({ contentTypes: { instagram: "story" }, mediaIds: ["i1", "i2"] }));
  });
  await t("step 5: YouTube made-for-kids must be answered; public privacy warns", () => {
    const yt = (o: Partial<WizardState["options"]>) => base({ platforms: ["youtube"], options: { ...base().options, ...o } });
    assert.ok(validateStep(yt({}), "options", ctx()).errors.madeForKids);
    assert.equal(validateStep(yt({ youtubeMadeForKids: false }), "options", ctx()).errors.madeForKids, undefined);
    assert.ok(validateStep(yt({ youtubeMadeForKids: false, youtubePrivacy: "public" }), "options", ctx()).warnings.length > 0);
    assert.equal(base().options.youtubePrivacy, "private");
  });
  await t("step 7: confirmation is required; the first incomplete step is found", () => {
    assert.ok(validateStep(base(), "review", ctx()).errors.confirmed);
    assert.deepEqual(validateStep({ ...base(), confirmed: true }, "review", ctx()).errors, {});
    assert.equal(firstIncompleteStep(base({ schedule: { mode: "draft", local: "", timezone: TZ, approve: true } }), ctx()), null);
    assert.equal(firstIncompleteStep(base({ topic: "" }), ctx()), "brief");
    assert.equal(resumeStep({ ...base({ topic: "" }), step: "content" }, ctx()), "brief");
    assert.equal(resumeStep({ ...base(), step: "content" }, ctx()), "content");
  });

  // ── character counting ──
  await t("counting: plain platforms use UTF-16 length (as the publishers' validators do)", () => {
    assert.equal(countChars("instagram", "hello"), 5);
    assert.equal(countChars("linkedin", "😀"), 2);
    assert.equal(countChars("instagram", ""), 0);
  });
  await t("counting: X weighs links as 23, emoji and non-Latin as 2, Latin and spaces as 1", () => {
    assert.equal(xWeightedLength("hello world"), 11);
    assert.equal(xWeightedLength("😀"), 2);
    assert.equal(xWeightedLength("👨‍👩‍👧"), 2);
    assert.equal(xWeightedLength("日本語"), 6);
    assert.equal(xWeightedLength("hi https://example.com/a/very/long/path?with=query end"), 3 + 23 + 4);
    assert.equal(countChars("x", "नमस्ते"), 6); // Devanagari is inside the weight-1 range of the twitter-text table
    assert.equal(xWeightedLength("café"), 4);
  });

  // ── thread splitter ──
  await t("thread: short text is one part; long text splits into numbered parts that fit; same as the X publisher", () => {
    assert.deepEqual(splitThread("short"), ["short"]);
    const text = Array.from({ length: 30 }, (_, i) => `Sentence number ${i + 1} says something useful.`).join(" ");
    const parts = splitThread(text);
    assert.ok(parts.length > 2);
    parts.forEach((p, i) => { assert.ok(p.length <= 280, `part ${i} is ${p.length}`); assert.ok(p.endsWith(` ${i + 1}/${parts.length}`)); });
    assert.deepEqual(parts, serverSplit(text));
    assert.deepEqual(splitThread(text, 100), serverSplit(text, 100));
  });

  // ── UTM ──
  await t("utm: builds a final link, keeps the query, replaces old utm values, validates", () => {
    const u = { enabled: true, source: "Instagram", medium: "social", campaign: "Diwali Sale 2026", content: "", term: "" };
    const r = buildUtmUrl("https://example.com/offer?ref=a&utm_source=old", u);
    assert.ok(r.ok);
    if (r.ok) {
      const url = new URL(r.url);
      assert.equal(url.searchParams.get("ref"), "a");
      assert.equal(url.searchParams.get("utm_source"), "Instagram");
      assert.equal(url.searchParams.get("utm_campaign"), "Diwali_Sale_2026");
      assert.equal(url.searchParams.get("utm_content"), null);
      assert.deepEqual(r.added, ["utm_source", "utm_medium", "utm_campaign"]);
    }
    assert.equal(buildUtmUrl("nonsense", u).ok, false);
    assert.equal(buildUtmUrl("ftp://x.com", u).ok, false);
    assert.equal(buildUtmUrl("https://a.com", { ...u, campaign: "" }).ok, false);
    const off = buildUtmUrl("https://a.com/x", { ...u, enabled: false });
    assert.ok(off.ok && off.url === "https://a.com/x");
    assert.equal(finalLink("", u), "");
    assert.equal(finalLink("bad", u), "bad");
    assert.match(finalLink("https://a.com/x", u), /utm_source=Instagram/);
  });
  await t("utm: defaults prefill from the platform and campaign; links round-trip", () => {
    assert.equal(defaultUtm(["instagram"], "Title", "").source, "instagram");
    assert.equal(defaultUtm(["instagram", "x"], "Title", "").source, "social");
    assert.equal(defaultUtm(["x"], "My Title!", "").campaign, "my_title");
    const link = finalLink("https://a.com/x?q=1", { enabled: true, source: "s", medium: "m", campaign: "c", content: "k", term: "" });
    assert.equal(stripUtm(link), "https://a.com/x?q=1");
    assert.deepEqual(readUtm(link), { enabled: true, source: "s", medium: "m", campaign: "c", content: "k", term: "" });
    assert.equal(readUtm("https://a.com/x"), null);
  });

  // ── schedule ──
  await t("schedule: past, too soon, invalid zone and nonexistent DST times are refused with a message", () => {
    const now = new Date("2026-11-02T10:00:00Z");
    assert.equal(checkScheduleInput("", TZ, now).ok, false);
    assert.match(checkScheduleInput("2026-11-02T15:00", TZ, now).error ?? "", /past|minute/);
    assert.match(checkScheduleInput("2026-11-05T09:30", "Nowhere/City", now).error ?? "", /zone/);
    const gap = checkScheduleInput("2027-03-28T02:30", "Europe/Berlin", now);
    assert.equal(gap.ok, false);
    assert.match(gap.error ?? "", /clocks skip forward/);
    const ok = checkScheduleInput("2026-11-05T09:30", TZ, now);
    assert.ok(ok.ok);
    assert.equal(ok.utc?.toISOString(), "2026-11-05T04:00:00.000Z");
  });
  await t("schedule: a time that happens twice when clocks go back gets a note (first one is used)", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const r = checkScheduleInput("2026-10-25T02:30", "Europe/Berlin", now);
    assert.ok(r.ok);
    assert.equal(r.notes.length, 1);
    assert.match(r.notes[0], /twice/);
    assert.equal(r.utc?.toISOString(), "2026-10-25T00:30:00.000Z");
    assert.equal(checkScheduleInput("2026-10-25T04:30", "Europe/Berlin", now).notes.length, 0);
  });
  await t("schedule: local/zone conversion and best-time (India time) conversion", () => {
    assert.equal(localInZone(new Date("2026-11-05T04:00:00Z"), TZ), "2026-11-05T09:30");
    assert.equal(localInZone(new Date("2026-11-05T04:00:00Z"), "America/New_York"), "2026-11-04T23:00");
    assert.equal(istToZone("2026-11-05T09:30", TZ), "2026-11-05T09:30");
    assert.equal(istToZone("2026-11-05T09:30", "UTC"), "2026-11-05T04:00");
  });

  // ── publish tracker ──
  await t("tracker: attempt state maps to a phase; failed+ambiguous is its own phase", () => {
    assert.equal(trackerPhase(null), "idle");
    assert.equal(trackerPhase({ state: "queued", errorClass: null, nextAttemptAt: null }), "queued");
    assert.equal(trackerPhase({ state: "failed", errorClass: "auth", nextAttemptAt: null }), "failed");
    assert.equal(trackerPhase({ state: "failed", errorClass: "ambiguous", nextAttemptAt: null }), "ambiguous");
    assert.equal(trackerPhase({ state: "processing", errorClass: null, nextAttemptAt: null }), "processing");
  });
  await t("tracker: polling continues while anything runs and stops when every platform is final; delays grow", () => {
    const a = (state: "queued" | "uploading" | "processing" | "published" | "failed" | "cancelled", errorClass: string | null = null) => ({ state, errorClass, nextAttemptAt: null });
    assert.equal(shouldPoll([a("published"), a("processing")]), true);
    assert.equal(shouldPoll([a("published"), a("failed")]), false);
    assert.equal(shouldPoll([a("failed", "ambiguous"), null]), false);
    assert.equal(shouldPoll([a("queued")]), true);
    assert.equal(shouldPoll([]), false);
    assert.ok(pollDelayMs(1000) < pollDelayMs(60_000) && pollDelayMs(60_000) < pollDelayMs(600_000));
    assert.ok(POLL_GIVE_UP_MS >= 10 * 60_000);
  });
  await t("tracker: which actions are offered per phase", () => {
    assert.deepEqual(trackerActions("failed"), { retry: true, confirmRetry: false, cancel: false });
    assert.deepEqual(trackerActions("ambiguous"), { retry: false, confirmRetry: true, cancel: false });
    assert.equal(trackerActions("queued").cancel, true);
    assert.deepEqual(trackerActions("published"), { retry: false, confirmRetry: false, cancel: false });
  });

  // ── hand-off ──
  await t("hand-off: media ids, source and platform are read from the query; junk is dropped", () => {
    const h = parseHandoff({ media: "abcdef12,abcdef12,../etc", source: "image_studio", platform: "instagram" });
    assert.deepEqual(h, { mediaIds: ["abcdef12"], source: "image_studio", platform: "instagram" });
    assert.equal(parseHandoff({ mediaId: "abcdef12", source: "ugc" }).source, "ugc_studio");
    assert.equal(parseHandoff({ media: "abcdef12" }).source, "library");
    assert.deepEqual(parseHandoff({}), { mediaIds: [], source: null, platform: null });
    assert.equal(parseHandoff({ media: "abcdef12", platform: "myspace" }).platform, null);
    assert.equal(parseHandoff({ media: ["abcdef12", "zzzzzz99"] as unknown as string }).mediaIds.length >= 0, true);
    assert.equal(handoffHref("abcdef12", "ugc_studio"), "/viralpulse-ai/posts/new?media=abcdef12&source=ugc_studio");
  });

  // ── preview / disclosure ──
  const aiPic: PreviewMedia = { _id: "i1", kind: "image", name: "p", contentType: "image/png", size: 1, width: 1080, height: 1080, durationSec: null, altText: "", aiDisclosed: true };
  await t("preview: the text is composed the way the publisher composes it (hashtags, AI note, link on LinkedIn)", () => {
    const s = base({ link: "https://a.com/x", variants: { instagram: { title: "", content: "Hello", hashtags: ["#a", "#b"], keywords: [], cta: "" } } });
    const pv = previewFor(s, "instagram", [aiPic], { captionLimit: 2200, nativeAiLabel: true }, false);
    assert.match(pv.text, /^Hello\n\n#a #b\n\n/);
    assert.equal(pv.disclosure.mode, "suffix");
    assert.ok(pv.text.length > "Hello\n\n#a #b".length);
    const off = previewFor(s, "instagram", [aiPic], { captionLimit: 2200, nativeAiLabel: true }, true);
    assert.equal(off.disclosure.mode, "suffix"); // native-label platforms keep the note
    const x = previewFor({ ...s, platforms: ["x"], contentTypes: { x: "image" } }, "x", [aiPic], { captionLimit: 7000, nativeAiLabel: true }, true);
    assert.equal(x.parts, null);
    const li = previewFor({ ...s, platforms: ["linkedin"], contentTypes: { linkedin: "image" } }, "linkedin", [aiPic], { captionLimit: 3000, nativeAiLabel: false }, true);
    assert.equal(li.disclosure.mode, "off");
    assert.ok(li.text.includes("https://a.com/x"));
    const none = previewFor(s, "instagram", [], { captionLimit: 2200, nativeAiLabel: true }, false);
    assert.equal(none.disclosure.mode, "none");
  });
  await t("preview: an X thread is split into numbered parts", () => {
    const long = Array.from({ length: 20 }, (_, i) => `Point ${i + 1} is worth knowing about.`).join(" ");
    const s = base({ platforms: ["x"], contentTypes: { x: "thread" }, variants: { x: { title: "", content: long, hashtags: [], keywords: [], cta: "" } } });
    const pv = previewFor(s, "x", [], { captionLimit: 7000, nativeAiLabel: true }, false);
    assert.ok(pv.parts && pv.parts.length > 1);
    assert.ok(pv.parts!.every((p) => p.length <= 280));
  });
  await t("disclosure summary: none without AI media; per-platform lines with it; Facebook label only for Reels", () => {
    assert.equal(disclosureSummary({ any: false, video: false }, ["instagram"], false, {}).applies, false);
    const d = disclosureSummary({ any: true, video: false }, ["instagram", "linkedin"], true, { instagram: true, linkedin: false });
    assert.equal(d.applies, true);
    assert.equal(d.lines.length, 2);
    assert.match(d.lines[1], /caption note is off/);
    const caps = { facebook: { nativeAiLabel: true }, instagram: { nativeAiLabel: true } };
    assert.deepEqual(nativeLabelMap(["facebook", "instagram"], { facebook: "image", instagram: "reel" }, caps), { facebook: false, instagram: true });
    assert.equal(nativeLabelMap(["facebook"], { facebook: "reel" }, caps).facebook, true);
  });

  // ── publish options ──
  await t("publish options: accounts, formats, YouTube privacy default private, kids answer, Instagram share-to-feed on reels only", () => {
    const s = base({ platforms: ["instagram", "youtube", "linkedin", "x"], accountIds: { instagram: "ig1", youtube: "yt1", linkedin: "li1", x: "x1" }, contentTypes: { instagram: "reel", youtube: "short", linkedin: "text", x: "thread" }, options: { ...base().options, youtubeMadeForKids: false, instagramShareToFeed: false, instagramLocationId: " 123 " } });
    const o = buildPublishOptions(s, undefined);
    assert.equal(o.accountIds?.x, "x1");
    assert.equal(o.instagram?.format, "reel");
    assert.equal(o.instagram?.shareToFeed, false);
    assert.equal(o.instagram?.locationId, "123");
    assert.equal(o.youtube?.privacy, "private");
    assert.equal(o.youtube?.short, true);
    assert.equal(o.youtube?.madeForKids, false);
    assert.equal(o.x?.thread, true);
    assert.equal(o.linkedin?.visibility, "PUBLIC");
    const feed = buildPublishOptions(base({ options: { ...base().options, instagramShareToFeed: false } }), undefined);
    assert.equal(feed.instagram?.shareToFeed, undefined);
    assert.equal(postContentType(s, []), "video");
    assert.equal(postContentType(base(), []), "image");
    assert.equal(postContentType(base(), ["video"]), "video");
  });

  // ── state conversion ──
  const oldPost: PostLike = { id: "p0", title: "Old", topic: "Topic", serviceProduct: "", audience: "", tone: "", language: "English", objective: "Promotion", contentType: "image", platforms: ["instagram", "facebook", "linkedin"], link: "https://a.com/?utm_source=ig&utm_medium=social&utm_campaign=c", campaignId: null, offerId: null, clientId: null, notes: "", idea: "",
    variants: [{ platform: "instagram", title: "", content: "", caption: "Legacy caption", cta: "", hashtags: ["#a"], keywords: [] }, { platform: "facebook", title: "", content: "FB text", caption: "", cta: "", hashtags: [], keywords: [] }, { platform: "linkedin", title: "", content: "LI", caption: "", cta: "", hashtags: [], keywords: [] }],
    mediaIds: ["i1", "i2"], thumbnailId: null, scheduledAtIso: "2026-11-05T04:00:00.000Z", plannedAtIso: null, scheduledTz: null, publishOptions: undefined, wizard: undefined };
  await t("old posts (no wizard fields) open: content types inferred, legacy caption used, utm read back, schedule shown in the zone", () => {
    const s = stateFromPost(oldPost, TZ);
    assert.equal(s.objective, "sales");
    assert.equal(s.contentTypes.instagram, "carousel");
    assert.equal(s.contentTypes.facebook, "carousel");
    assert.equal(s.contentTypes.linkedin, "carousel");
    assert.equal(s.variants.instagram?.content, "Legacy caption");
    assert.equal(s.link, "https://a.com/");
    assert.equal(s.utm.enabled, true);
    assert.equal(s.utm.campaign, "c");
    assert.equal(s.schedule.local, "2026-11-05T09:30");
    assert.equal(s.step, "content");
    assert.equal(s.options.youtubePrivacy, "private");
    assert.equal(s.options.youtubeMadeForKids, null);
    assert.deepEqual(inferContentTypes({ ...oldPost, platforms: ["youtube", "x"], contentType: "video", publishOptions: { youtube: { short: true } } }), { youtube: "short", x: "video" });
  });
  await t("sanitizer: unknown platforms, steps and types are dropped; strings are bounded", () => {
    const s = sanitizeWizardState({ step: "nope", platforms: ["instagram", "myspace"], contentTypes: { instagram: "story", x: "thread" }, topic: "t".repeat(900), objective: "bogus", options: { youtubePrivacy: "public", youtubeCategoryId: "999" }, variants: { instagram: { content: "hi", hashtags: ["a", "#b"] } }, schedule: { timezone: "Bad/Zone" } }, TZ);
    assert.equal(s.step, "goal");
    assert.deepEqual(s.platforms, ["instagram"]);
    assert.equal(s.contentTypes.instagram, "story");
    assert.equal(s.contentTypes.x, undefined);
    assert.equal(s.topic.length, 500);
    assert.equal(s.objective, "");
    assert.equal(s.options.youtubePrivacy, "public");
    assert.equal(s.options.youtubeCategoryId, "");
    assert.deepEqual(s.variants.instagram?.hashtags, ["#a", "#b"]);
    assert.equal(s.schedule.timezone, TZ);
    assert.equal(sanitizeWizardState(null, TZ).language, "English");
  });
  await t("draft instruction carries key message, CTA, offer and formats into the AI call (<= 1000 chars)", () => {
    const i = draftInstruction(base({ keyMessage: "Free demo", cta: "Book Now", offerText: "20% off until 30 Nov" }));
    assert.match(i, /Key message: Free demo/);
    assert.match(i, /Call to action: Book Now/);
    assert.match(i, /20% off until 30 Nov/);
    assert.match(i, /Instagram Photo post/);
    assert.ok(draftInstruction(base({ offerText: "x".repeat(900), keyMessage: "y".repeat(400) })).length <= 1000);
  });

  // ── calendar ──
  await t("calendar: weeks start Monday, months show 42 days, ranges follow the zone", () => {
    assert.equal(weekStart("2026-11-02"), "2026-11-02");
    assert.equal(weekStart("2026-11-08"), "2026-11-02");
    assert.deepEqual(weekDays("2026-11-04").length, 7);
    const m = monthDays("2026-11");
    assert.equal(m.length, 42);
    assert.equal(m[0], "2026-10-26");
    assert.ok(m.includes("2026-11-30"));
    assert.equal(shiftMonth("2026-12", 1), "2027-01");
    assert.equal(shiftMonth("2026-01", -1), "2025-12");
    assert.equal(addDays("2026-02-28", 1), "2026-03-01");
    assert.equal(dayKeyIn(new Date("2026-11-05T20:00:00Z"), TZ), "2026-11-06");
    const r = rangeOf(["2026-11-02", "2026-11-03"], TZ);
    assert.equal(r.from.toISOString(), "2026-11-01T18:30:00.000Z");
    assert.equal(r.to.toISOString(), "2026-11-03T18:30:00.000Z");
  });

  // ── save and reopen on a throwaway database ──
  await runAsCompany("co_posts_ui", async () => {
    const { saveWizardDraft } = await import("../src/lib/products/viralpulse-ai/post-wizard/server");
    const { getPost, postsCollection } = await import("../src/lib/products/viralpulse-ai/posts");
    const viewer = { userId: "u1", email: "u@example.com", roles: [], ctx: { roles: [], permissionOverrides: {} } } as never;
    let id = "";
    await t("save: creates the post from the wizard state, and reopening gives the same state back", async () => {
      const s = base({ title: "Launch", topic: "Launch week", keyMessage: "Free demo", cta: "Book Now", platforms: ["instagram", "x"], accountIds: { instagram: "ig1", x: "x1" }, contentTypes: { instagram: "image", x: "thread" }, mediaIds: [], link: "https://a.com/x",
        utm: { enabled: true, source: "social", medium: "social", campaign: "launch", content: "", term: "" }, step: "media",
        variants: { instagram: { title: "", content: "Hello IG", hashtags: ["#a"], keywords: [], cta: "" }, x: { title: "", content: "Hello X", hashtags: [], keywords: [], cta: "" } } });
      const r = await saveWizardDraft(s, { checkpoint: true }, viewer);
      id = r.id;
      assert.ok(r.created && id);
      const p = await getPost(id);
      assert.ok(p);
      assert.equal(p!.status, "edited");
      assert.deepEqual(p!.platforms, ["instagram", "x"]);
      assert.match(p!.link ?? "", /utm_campaign=launch/);
      assert.equal(p!.publishOptions?.accountIds?.x, "x1");
      assert.equal(p!.publishOptions?.x?.thread, true);
      assert.equal(p!.variants.find((v) => v.platform === "x")?.content, "Hello X");
      assert.equal(p!.wizard?.step, "media");
      const back = stateFromPost({ id: p!._id, title: p!.title, topic: p!.topic, serviceProduct: p!.serviceProduct, audience: p!.audience, tone: p!.tone, language: p!.language, objective: p!.objective, contentType: p!.contentType, platforms: p!.platforms, link: p!.link, campaignId: p!.campaignId, offerId: p!.offerId, clientId: p!.clientId, notes: p!.notes, idea: p!.idea,
        variants: p!.variants.map((v) => ({ platform: v.platform, title: v.title, content: v.content, caption: v.caption, cta: v.cta, hashtags: v.hashtags, keywords: v.keywords })), mediaIds: p!.mediaIds, thumbnailId: p!.thumbnailId, scheduledAtIso: null, plannedAtIso: null, scheduledTz: null, publishOptions: p!.publishOptions, wizard: p!.wizard }, TZ);
      assert.equal(back.step, "media");
      assert.equal(back.keyMessage, "Free demo");
      assert.equal(back.link, "https://a.com/x");
      assert.equal(back.utm.campaign, "launch");
      assert.deepEqual(back.contentTypes, { instagram: "image", x: "thread" });
      assert.equal(back.objective, "awareness");
    });
    await t("save: a second save updates the same post, keeps history, and a published platform cannot be removed or edited", async () => {
      const col = await postsCollection();
      const before = await getPost(id);
      const s = sanitizeWizardState({ ...stateFromPost({ id, title: before!.title, topic: before!.topic, serviceProduct: "", audience: "", tone: "", language: "English", objective: "Awareness", contentType: "image", platforms: before!.platforms, link: before!.link, campaignId: null, offerId: null, clientId: null, notes: "", idea: "", variants: before!.variants.map((v) => ({ platform: v.platform, title: v.title, content: v.content, caption: v.caption, cta: v.cta, hashtags: v.hashtags, keywords: v.keywords })), mediaIds: [], thumbnailId: null, scheduledAtIso: null, plannedAtIso: null, scheduledTz: null, publishOptions: before!.publishOptions, wizard: before!.wizard }, TZ) }, TZ);
      s.variants.instagram = { title: "", content: "Edited IG", hashtags: [], keywords: [], cta: "" };
      const r = await saveWizardDraft(s, { checkpoint: true }, viewer);
      assert.equal(r.id, id);
      assert.equal(r.created, false);
      assert.equal(typeof r.version, "number");
      assert.equal((await getPost(id))!.variants.find((v) => v.platform === "instagram")?.content, "Edited IG");
      await col.updateOne({ _id: id, "variants.platform": "instagram" }, { $set: { "variants.$.publish.state": "published" } });
      s.variants.instagram = { title: "", content: "Should not apply", hashtags: [], keywords: [], cta: "" };
      await saveWizardDraft(s, { checkpoint: false }, viewer);
      assert.equal((await getPost(id))!.variants.find((v) => v.platform === "instagram")?.content, "Edited IG");
      await assert.rejects(saveWizardDraft({ ...s, platforms: ["x"] }, { checkpoint: false }, viewer), /already published/);
    });
    await t("save: an incomplete brief is refused with a plain message (no topic)", async () => {
      await assert.rejects(saveWizardDraft({ ...base(), postId: null, topic: "" }, { checkpoint: false }, viewer), /topic/i);
    });
  });
  console.log(`viralpulse posts ui: ${pass} passed, ${fail} failed`);
}

main()
  .catch((e) => { fail++; console.error(e); })
  .finally(async () => {
    try { const c = await MongoClient.connect(uri); await c.db().dropDatabase(); await c.close(); } catch { /* ignore */ }
    process.exit(fail ? 1 : 0);
  });
