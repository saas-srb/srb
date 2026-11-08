/**
 * ViralPulse Image Studio projects + wizard tests: the project state machine, the wizard reducer / validation / draft helpers, the format
 * cards, estimate and gate maths, and the engine against a THROWAWAY MongoDB (asserted, then dropped) with a fake provider: drafts that
 * resume, progress per picture, failures that keep finished pictures, stale generations, approval, duplicate, soft delete, consent
 * attestation written from the session, tenancy. No real model is called.
 * Run: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_vpimg npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-viralpulse-image-projects.ts
 */
import assert from "node:assert/strict";
import sharp from "sharp";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "";
const dbName = uri.split("?")[0].split("/").pop() ?? "";
assert.ok(/zz_throwaway/.test(dbName), "refusing to run: MONGODB_URI must be a zz_throwaway_* database");
assert.ok(!/\.env\.local/.test(uri));

import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { TRANSITIONS, canTransition, countsByTab, isStale, nextPollDelay, parseTab, pollDecision, POLL, progressPct, statusAfterBriefSave, statusMeta, statusWhenIdle, tabOfStatus } from "../src/lib/products/viralpulse-ai/images/state";
import { QUICK_STEPS, WIZARD_STEPS, advance, blankBrief, briefComplete, duplicateBrief, formatCards, hasContent, imagesFor, ratioLabel, restoreDraft, resumeStep, reviewReasons, scaleEstimate, selectGoal, serializeDraft, sourceTag, validateStep, wizardReducer, initialWizard, policyOf } from "../src/lib/products/viralpulse-ai/images/wizard";
import { GOALS, goalById, specByKey } from "../src/lib/products/viralpulse-ai/images/specs";
import { estimateJob } from "../src/lib/products/viralpulse-ai/images/pricing";
import { approvalState, capBar } from "../src/lib/products/viralpulse-ai/ugc/ui-helpers";
import { createEngine, type Actor, type ImageDeps } from "../src/lib/products/viralpulse-ai/images/engine";
import { getBrandKit, getImageSettings, getProject, listProjects, projectOverview, projectsCollection, saveImageSettings } from "../src/lib/products/viralpulse-ai/images/store";
import { DEFAULT_IMAGE_SETTINGS } from "../src/lib/products/viralpulse-ai/images/limits";
import { ImageProviderError, type ImageProvider } from "../src/lib/products/viralpulse-ai/images/providers/types";
import type { Brief, ProjectStatus } from "../src/lib/products/viralpulse-ai/images/types";

let pass = 0;
let fail = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
  try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e instanceof Error ? e.message.split("\n").slice(0, 8).join("\n    ") : e); }
};

const solid = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 60, g: 100, b: 160 } } }).png().toBuffer();
/** A fake provider; `failOn` = the 1-based call number that fails. */
function fakeProvider(failOn = 0) {
  let n = 0;
  const calls: number[] = [];
  const provider: ImageProvider = {
    id: "openai",
    async generate(req) { n++; calls.push(n); if (n === failOn) throw new ImageProviderError("moderation", "The image model declined this request because of its safety rules."); return { images: await Promise.all(Array.from({ length: req.n }, () => solid(1024, 1024))), usage: null, model: req.model }; },
    async edit(req) { n++; calls.push(n); return { images: await Promise.all(Array.from({ length: req.n }, () => solid(1024, 1024))), usage: null, model: req.model }; },
  };
  return { provider, calls };
}
function makeDeps(provider: ImageProvider, now: () => Date = () => new Date()) {
  const blobs = new Map<string, Buffer>();
  const audits: string[] = [];
  const notes: string[] = [];
  const deps: ImageDeps = {
    now, settings: getImageSettings, openAiPricing: async () => ({ overrides: null, flatUsd: 0 }),
    resolveProvider: async () => ({ provider, model: "gpt-image-2.5-flare" }),
    putBlob: async (key, data) => (blobs.set(key, data), key), getBlob: async (key) => blobs.get(key) ?? null,
    readMedia: async () => null, saveExport: async () => ({ _id: "m1" }),
    audit: async (e) => void audits.push(`${e.action}:${e.summary}`), notify: async (_i, n) => void notes.push(n.title),
    managerIds: async () => ["mgr1"], kit: getBrandKit, storagePrefix: async () => "smms/test/studio",
  };
  return { deps, audits, notes };
}
const emp: Actor = { userId: "u1", email: "u1@x.test", canApprove: false };
const mgr: Actor = { userId: "mgr1", email: "m@x.test", canApprove: true };
const okBrief = { goalId: "organic_post", name: "Diwali offer", subject: "A tailor measuring fabric in a bright, tidy shop", product: "Custom tailoring", style: "warm light", overlayText: ["Festive offers"], variants: 2 };
const D = { provider: "openai" as const, quality: "medium" as const, badge: true };
const ctx = { maxVariants: 4, providers: { openai: true, gemini: false } };
const good = (): Brief => ({ ...blankBrief(D), subject: "A tailor measuring fabric in a bright shop", product: "Tailoring" });

async function main() {
  // ── state machine ──
  await t("state: every status has transitions that stay inside the set; generating can only end ready/failed", () => {
    const all = Object.keys(TRANSITIONS) as ProjectStatus[];
    for (const s of all) for (const to of TRANSITIONS[s]) assert.ok(all.includes(to));
    assert.deepEqual([...TRANSITIONS.generating].sort(), ["failed", "generating", "ready"]);
    assert.ok(canTransition("draft", "briefed") && !canTransition("draft", "generating"), "a draft cannot generate before its brief is complete");
    assert.ok(canTransition("failed", "generating") && !canTransition("failed", "finished"));
    assert.ok(canTransition("awaiting_approval", "generating") && canTransition("awaiting_approval", "briefed"));
  });
  await t("state: saving a brief maps to draft / briefed / ready", () => {
    assert.equal(statusAfterBriefSave("draft", true, false), "briefed");
    assert.equal(statusAfterBriefSave("briefed", false, false), "draft");
    assert.equal(statusAfterBriefSave("finished", true, true), "ready");
    assert.equal(statusAfterBriefSave("ready", false, true), "ready");
    assert.equal(statusAfterBriefSave("failed", true, false), "briefed");
    assert.equal(statusAfterBriefSave("awaiting_approval", true, false), "briefed", "editing cancels a pending request");
    assert.equal(statusAfterBriefSave("generating", true, false), "generating");
    assert.equal(statusWhenIdle(true), "ready");
    assert.equal(statusWhenIdle(false), "briefed");
  });
  await t("state: tabs, counts, labels", () => {
    assert.equal(tabOfStatus("briefed"), "draft");
    assert.equal(tabOfStatus("awaiting_approval"), "generating");
    assert.equal(tabOfStatus("finished"), "ready");
    assert.equal(tabOfStatus("failed"), "failed");
    assert.deepEqual(countsByTab({ draft: 2, briefed: 1, generating: 1, ready: 3, finished: 1, failed: 2 }), { draft: 3, generating: 1, ready: 4, failed: 2 });
    assert.equal(parseTab("ready"), "ready");
    assert.equal(parseTab("zzz"), "all");
    assert.equal(statusMeta("generating").busy, true);
    assert.equal(statusMeta("ready").tone, "ok");
  });
  await t("state: polling backs off, stops when finished, hidden or failing; stale generations are detected", () => {
    assert.equal(nextPollDelay(0), POLL.baseMs);
    assert.equal(nextPollDelay(2), POLL.baseMs * 4);
    assert.equal(nextPollDelay(20), POLL.maxMs);
    assert.deepEqual(pollDecision({ status: "generating", hidden: false, consecutiveErrors: 0 }), { poll: true, reason: "active" });
    assert.equal(pollDecision({ status: "ready", hidden: false, consecutiveErrors: 0 }).poll, false);
    assert.equal(pollDecision({ status: "generating", hidden: true, consecutiveErrors: 0 }).reason, "hidden");
    assert.equal(pollDecision({ status: "generating", hidden: false, consecutiveErrors: POLL.maxErrors }).reason, "errors");
    const now = new Date("2026-11-02T10:00:00Z");
    assert.equal(isStale("generating", new Date("2026-11-02T09:00:00Z"), now), true);
    assert.equal(isStale("generating", new Date("2026-11-02T09:55:00Z"), now), false);
    assert.equal(isStale("ready", new Date("2026-11-01T09:00:00Z"), now), false);
    assert.equal(progressPct({ total: 4, done: 1 }), 25);
    assert.equal(progressPct({ total: 0, done: 0 }), 0);
  });

  // ── wizard ──
  await t("wizard: five steps / three quick steps with unique keys, quick uses the same step keys", () => {
    assert.deepEqual(WIZARD_STEPS.map((s) => s.key), ["goal", "brief", "brand", "variants", "review"]);
    assert.deepEqual(QUICK_STEPS.map((s) => s.key), ["brief", "variants", "review"]);
    assert.ok(QUICK_STEPS.every((q) => WIZARD_STEPS.some((w) => w.key === q.key)));
  });
  await t("wizard reducer: selecting a goal swaps sizes, keeps typed text, handles carousels", () => {
    let s = initialWizard({ ...good(), overlayText: ["Sale today"] });
    s = wizardReducer(s, { type: "selectGoal", goalId: "story" });
    assert.deepEqual(s.brief.specKeys, goalById("story")!.specKeys);
    assert.equal(s.brief.subject, good().subject);
    assert.deepEqual(s.brief.overlayText, ["Sale today"]);
    s = wizardReducer(s, { type: "selectGoal", goalId: "carousel_set" });
    assert.equal(s.brief.overlayText.length, 2);
    assert.equal(s.brief.variants, 2);
    assert.equal(selectGoal(s.brief, "nope"), s.brief, "an unknown goal changes nothing");
    s = wizardReducer(s, { type: "goto", step: 3 });
    assert.equal(s.reached, 3);
    s = wizardReducer(s, { type: "goto", step: 1 });
    assert.equal(s.step, 1);
    assert.equal(s.reached, 3, "furthest step reached is kept");
    assert.equal(wizardReducer(s, { type: "set", patch: { name: "x" } }).brief.name, "x");
  });
  await t("wizard validation: each step names what is missing", () => {
    const b = blankBrief(D);
    assert.deepEqual(validateStep(b, "goal", ctx), {});
    assert.ok(validateStep({ ...b, specKeys: [] }, "goal", ctx).specKeys);
    assert.ok(validateStep(b, "brief", ctx).subject, "an empty brief is incomplete");
    assert.deepEqual(validateStep(good(), "brief", ctx), {});
    assert.ok(validateStep({ ...good(), overlayText: ["Party 🎉"] }, "brief", ctx).overlay0);
    assert.ok(validateStep({ ...good(), subject: "make it look like Nike logo on shoes" }, "brief", ctx).policy, "policy blocks surface in the brief step");
    const car = selectGoal(good(), "carousel_set");
    assert.ok(validateStep(car, "brief", ctx).overlaySlides, "every slide needs text");
    assert.ok(validateStep({ ...good(), variants: 9 }, "variants", ctx).variants);
    assert.ok(validateStep({ ...good(), provider: "gemini" }, "variants", ctx).provider, "a model that is not connected is refused");
    assert.deepEqual(validateStep(good(), "variants", ctx), {});
  });
  await t("wizard validation: reference photos need consent, people need attestation, public figures are refused", () => {
    const withRef = { ...good(), referenceIds: ["m1"] };
    assert.ok(validateStep(withRef, "brand", ctx).consent);
    const c = { attested: false, showsPeople: true, publicFigure: false, at: null, by: null };
    assert.ok(validateStep({ ...withRef, consent: c }, "brand", ctx).consent);
    assert.deepEqual(validateStep({ ...withRef, consent: { ...c, attested: true } }, "brand", ctx), {});
    assert.deepEqual(validateStep({ ...withRef, consent: { ...c, showsPeople: false } }, "brand", ctx), {}, "product photos need no consent");
    assert.match(validateStep({ ...withRef, consent: { ...c, attested: true, publicFigure: true } }, "brand", ctx).consent, /public figure/i);
    assert.deepEqual(validateStep(good(), "brand", ctx), {});
  });
  await t("wizard: advance blocks on the first incomplete step; resume lands on it", () => {
    const empty = blankBrief(D);
    const r = advance(empty, WIZARD_STEPS, 0, 3, ctx);
    assert.ok(r.blocked && r.errors.subject);
    assert.equal(advance(good(), WIZARD_STEPS, 0, 4, ctx).blocked, null);
    assert.equal(advance(empty, WIZARD_STEPS, 3, 1, ctx).blocked, null, "going back is never blocked");
    assert.equal(resumeStep(empty, WIZARD_STEPS, ctx), 1, "an empty brief resumes at the brief");
    assert.equal(resumeStep(good(), WIZARD_STEPS, ctx), 4, "a complete brief resumes at the review");
    assert.equal(resumeStep(good(), QUICK_STEPS, ctx), 2);
    assert.equal(briefComplete(good(), ctx), true);
    assert.equal(briefComplete(empty, ctx), false);
  });
  await t("wizard draft: survives a refresh, drops references and consent, rejects garbage", () => {
    const s = { ...initialWizard({ ...good(), referenceIds: ["m9"], consent: { attested: true, showsPeople: true, publicFigure: false, at: "x", by: "y" } }, 2), reached: 3 };
    const back = restoreDraft(serializeDraft(s), 5)!;
    assert.equal(back.brief.subject, good().subject);
    assert.equal(back.step, 2);
    assert.equal(back.reached, 3);
    assert.deepEqual(back.brief.referenceIds, []);
    assert.equal(back.brief.consent, null, "consent is never restored from the browser");
    assert.equal(restoreDraft("{not json", 5), null);
    assert.equal(restoreDraft(JSON.stringify({ v: 2, brief: good() }), 5), null);
    assert.equal(restoreDraft(JSON.stringify({ v: 1, brief: { goalId: "zzz", overlayText: [], specKeys: [] } }), 5), null);
    assert.equal(restoreDraft(JSON.stringify({ v: 1, brief: good(), step: 99, reached: 99 }), 5)!.step, 4, "step is clamped");
    assert.equal(restoreDraft(null, 5), null);
    assert.equal(hasContent(blankBrief(D)), false);
    assert.equal(hasContent(good()), true);
  });
  await t("format cards: one per goal, exact ratio, platforms, honest source tag", () => {
    const cards = formatCards();
    assert.equal(cards.length, GOALS.length - 1);
    for (const c of cards) {
      assert.equal(c.lead.key, c.goal.specKeys[0]);
      assert.equal(c.ratio, ratioLabel(c.lead.width, c.lead.height));
      assert.ok(c.platforms.length > 0);
    }
    assert.equal(cards.find((c) => c.goal.id === "story")!.ratio, "9:16");
    assert.equal(cards.find((c) => c.goal.id === "youtube_thumbnail")!.ratio, "16:9");
    assert.equal(cards.find((c) => c.goal.id === "youtube_thumbnail")!.tag, "verified");
    assert.equal(cards.find((c) => c.goal.id === "organic_post")!.tag, "recheck", "Meta sizes are secondary-sourced and say so");
    assert.equal(cards.find((c) => c.goal.id === "ad_google")!.tag, "partial");
    assert.equal(ratioLabel(1200, 628), "1.91:1");
    assert.equal(ratioLabel(1080, 1350), "4:5");
    assert.equal(sourceTag([specByKey("yt_thumb")!, specByKey("ig_story")!]), "recheck");
  });
  await t("estimate maths: per-picture price x pictures; scaling follows the count; carousel counts slides", () => {
    const e = estimateJob({ provider: "openai", model: "gpt-image-2.5-flare", quality: "medium", openAiSize: "1024x1024", images: 3, flatUsd: 0.05 });
    assert.equal(e.images, 3);
    assert.ok(Math.abs(e.totalUsd - e.perImageUsd * 3) < 1e-9);
    const v = scaleEstimate({ ...e, model: "m" }, 4);
    assert.ok(Math.abs(v.totalUsd - e.perImageUsd * 4) < 1e-9);
    assert.equal(imagesFor({ ...good(), variants: 3 }), 3);
    assert.equal(imagesFor(selectGoal({ ...good(), overlayText: ["a", "b"] }, "carousel_set")), 2);
    assert.equal(estimateJob({ provider: "openai", model: "m", quality: "low", openAiSize: "1024x1024", images: 0, flatUsd: 1 }).totalUsd, 0);
  });
  await t("gates: daily cap and approval threshold", () => {
    const base = { thresholdUsd: 2, dailyCapUsd: 20, spentTodayUsd: 0, canApprove: false, requested: false };
    assert.equal(approvalState({ ...base, estimateUsd: 0.5 }).kind, "ok");
    assert.equal(approvalState({ ...base, estimateUsd: 3 }).kind, "needs_manager");
    assert.equal(approvalState({ ...base, estimateUsd: 3, requested: true }).kind, "pending");
    assert.equal(approvalState({ ...base, estimateUsd: 3, canApprove: true }).kind, "ok", "a manager approves their own spend");
    assert.equal(approvalState({ ...base, estimateUsd: 5, spentTodayUsd: 18 }).kind, "over_cap");
    assert.equal(approvalState({ ...base, estimateUsd: 1, dailyCapUsd: 0 }).kind, "off");
    assert.equal(capBar(10, 5, 20).over, false);
    assert.equal(capBar(18, 5, 20).over, true);
  });
  await t("review reasons: lists everything that blocks, empty when ready", () => {
    const ok = { errors: {}, policy: policyOf(good()), acknowledged: [] as string[], confirmations: { claims: true, rights: false, label: true }, hasReferences: false, approvalKind: "ok" as const, approvalMessage: "", providerOk: true };
    assert.equal(reviewReasons(ok).ready, true);
    assert.ok(!reviewReasons({ ...ok, confirmations: { claims: false, rights: false, label: true } }).ready);
    assert.ok(!reviewReasons({ ...ok, hasReferences: true }).ready, "references need the rights confirmation");
    assert.match(reviewReasons({ ...ok, approvalKind: "over_cap", approvalMessage: "Over the limit" }).reasons.join(" "), /Over the limit/);
    assert.ok(!reviewReasons({ ...ok, providerOk: false }).ready);
    const flagged = policyOf({ ...good(), subject: "a child holding a lamp at Diwali" });
    assert.ok(flagged.flagged.length > 0);
    assert.ok(!reviewReasons({ ...ok, policy: flagged }).ready, "an unacknowledged flag blocks");
    assert.ok(reviewReasons({ ...ok, policy: flagged, acknowledged: flagged.flagged.map((f) => f.code) }).ready);
  });
  await t("duplicate brief: same settings, consent must be given again", () => {
    const d = duplicateBrief({ ...good(), name: "A", referenceIds: ["m1"], consent: { attested: true, showsPeople: true, publicFigure: false, at: "t", by: "u" } });
    assert.equal(d.name, "A (copy)");
    assert.equal(d.consent!.attested, false);
    assert.equal(d.consent!.by, null);
    assert.deepEqual(d.referenceIds, ["m1"]);
  });

  // ── engine (throwaway database) ──
  try {
    await runAsCompany("co_ip_a", async () => {
      await saveImageSettings({ ...DEFAULT_IMAGE_SETTINGS, dailySpendCapUsd: 5, approvalThresholdUsd: 2, perUserPerMinute: 60 }, "admin");

      await t("engine: a draft is saved, resumes after a refresh, and becomes briefed once complete", async () => {
        const fp = fakeProvider();
        const eng = createEngine(makeDeps(fp.provider).deps);
        const p = await eng.createProject(emp, { goalId: "organic_post", name: "Half done" });
        assert.equal(p.status, "draft");
        const reread = await createEngine(makeDeps(fakeProvider().provider).deps).getProject(p._id); // a new engine = a new page load
        assert.equal(reread.brief.name, "Half done");
        assert.equal(reread.status, "draft");
        const u = await eng.updateBrief(emp, p._id, okBrief);
        assert.equal(u.status, "briefed");
        const u2 = await eng.updateBrief(emp, p._id, { subject: "", product: "" });
        assert.equal(u2.status, "draft", "clearing the brief makes it a draft again");
        const c = await eng.createProject(emp, okBrief);
        assert.equal(c.status, "briefed");
        assert.equal(fp.calls.length, 0, "saving a draft never calls the model or books spend");
      });

      await t("engine: start marks generating with progress; execute draws one picture at a time and finishes ready", async () => {
        const fp = fakeProvider();
        const eng = createEngine(makeDeps(fp.provider).deps);
        const p = await eng.createProject(emp, { ...okBrief, variants: 3 });
        const s = await eng.start(emp, p._id);
        assert.equal(s.outcome, "done");
        let d = (await getProject(p._id))!;
        assert.equal(d.status, "generating");
        assert.deepEqual(d.progress, { total: 3, done: 0 });
        await assert.rejects(() => eng.updateBrief(emp, p._id, { name: "x" }), /Wait for the current generation/);
        await assert.rejects(() => eng.start(emp, p._id), /Already generating/);
        await assert.rejects(() => eng.remove(emp, p._id), /Wait for the pictures/);
        await eng.execute(emp, p._id);
        d = (await getProject(p._id))!;
        assert.equal(d.status, "ready");
        assert.deepEqual(d.progress, { total: 3, done: 3 });
        assert.equal(d.variants.length, 3);
        assert.equal(fp.calls.length, 3);
        assert.equal(d.error, null);
      });

      await t("engine: with defer the call answers at once (generating) and the work runs afterwards", async () => {
        const fp = fakeProvider();
        const eng = createEngine(makeDeps(fp.provider).deps);
        const p = await eng.createProject(emp, okBrief);
        let job: (() => Promise<unknown>) | null = null;
        const out = await eng.generate(emp, p._id, { defer: (r) => { job = r; } });
        assert.equal(out.outcome, "done");
        if (out.outcome === "done") assert.equal(out.project.status, "generating");
        assert.equal(fp.calls.length, 0, "nothing drawn until the deferred work runs");
        await (job as unknown as () => Promise<unknown>)();
        assert.equal((await getProject(p._id))!.status, "ready");
        assert.equal(fp.calls.length, 2);
      });

      await t("engine: a failure on the first picture is 'failed'; a later one keeps what finished ('ready' + error)", async () => {
        const f1 = fakeProvider(1);
        const e1 = createEngine(makeDeps(f1.provider).deps);
        const a = await e1.createProject(emp, okBrief);
        await assert.rejects(() => e1.generate(emp, a._id), /safety rules/);
        const da = (await getProject(a._id))!;
        assert.equal(da.status, "failed");
        assert.equal(da.variants.length, 0);
        assert.equal(da.totalCostUsd, 0, "a failed request books nothing");
        const f2 = fakeProvider(2);
        const e2 = createEngine(makeDeps(f2.provider).deps);
        const b = await e2.createProject(emp, okBrief);
        await assert.rejects(() => e2.generate(emp, b._id), /safety rules/);
        const db = (await getProject(b._id))!;
        assert.equal(db.status, "ready");
        assert.equal(db.variants.length, 1, "the first picture is kept");
        assert.ok(db.totalCostUsd > 0 && db.totalCostUsd === db.variants[0].costUsd);
        assert.match(db.error ?? "", /safety/);
        // a failed project can be edited and tried again
        const retry = await createEngine(makeDeps(fakeProvider().provider).deps).generate(emp, a._id);
        assert.equal(retry.outcome, "done");
        assert.equal((await getProject(a._id))!.status, "ready");
      });

      await t("engine: a generation nobody is working on any more is shown as failed (stale) and can be restarted", async () => {
        let now = new Date();
        const fp = fakeProvider();
        const eng = createEngine(makeDeps(fp.provider, () => now).deps);
        const p = await eng.createProject(emp, okBrief);
        await eng.start(emp, p._id);
        assert.equal((await eng.reconcile(p._id)).status, "generating", "a fresh generation is left alone");
        now = new Date(Date.now() + 20 * 60_000);
        const r = await eng.reconcile(p._id);
        assert.equal(r.status, "failed");
        assert.match(r.error ?? "", /stopped before it finished/);
        now = new Date();
        assert.equal((await eng.generate(emp, p._id)).outcome, "done");
      });

      await t("engine: above the approval limit the request waits (awaiting_approval); editing the brief cancels it; a manager's approval runs it", async () => {
        await saveImageSettings({ ...(await getImageSettings()), approvalThresholdUsd: 0.0001 }, "admin");
        const fp = fakeProvider();
        const h = makeDeps(fp.provider);
        const eng = createEngine(h.deps);
        const p = await eng.createProject(emp, okBrief);
        const r = await eng.generate(emp, p._id);
        assert.equal(r.outcome, "needs_manager");
        assert.equal((await getProject(p._id))!.status, "awaiting_approval");
        assert.equal(fp.calls.length, 0);
        assert.ok(h.notes.some((n) => /Approve image spend/.test(n)));
        const edited = await eng.updateBrief(emp, p._id, { name: "changed" });
        assert.equal(edited.status, "briefed");
        assert.equal(edited.pendingApproval, null);
        await eng.generate(emp, p._id);
        await assert.rejects(() => eng.approve(emp, p._id), /Only a manager/);
        assert.equal((await eng.approve(mgr, p._id)).outcome, "done");
        assert.equal((await getProject(p._id))!.status, "ready");
        const p2 = await eng.createProject(emp, okBrief);
        await eng.generate(emp, p2._id);
        await eng.reject(mgr, p2._id);
        assert.equal((await getProject(p2._id))!.status, "briefed");
        await saveImageSettings({ ...(await getImageSettings()), approvalThresholdUsd: 2 }, "admin");
      });

      await t("engine: the daily cap stops a request before any spend", async () => {
        await saveImageSettings({ ...(await getImageSettings()), dailySpendCapUsd: 0.0001 }, "admin");
        const fp = fakeProvider();
        const eng = createEngine(makeDeps(fp.provider).deps);
        const p = await eng.createProject(emp, okBrief);
        await assert.rejects(() => eng.generate(emp, p._id), /spend limit/);
        assert.equal(fp.calls.length, 0);
        assert.equal((await getProject(p._id))!.status, "briefed", "refused before starting, so it stays ready to try again");
        await saveImageSettings({ ...(await getImageSettings()), dailySpendCapUsd: 5 }, "admin");
      });

      await t("engine: consent is stamped from the session, whatever the browser sent", async () => {
        const eng = createEngine(makeDeps(fakeProvider().provider).deps);
        const p = await eng.createProject(emp, { ...okBrief, referenceIds: ["m1"], consent: { attested: true, showsPeople: true, publicFigure: false, by: "someone-else@x.test", at: "1999-01-01" } });
        assert.equal(p.brief.consent!.by, "u1@x.test");
        assert.notEqual(p.brief.consent!.at, "1999-01-01");
        const u = await eng.updateBrief(mgr, p._id, { name: "touch" });
        assert.equal(u.brief.consent!.by, "u1@x.test", "an unchanged attestation keeps who confirmed it");
        const u2 = await eng.updateBrief(mgr, p._id, { consent: { attested: true, showsPeople: false, publicFigure: false } });
        assert.equal(u2.brief.consent!.by, "m@x.test", "a changed attestation is re-stamped with the new person");
      });

      await t("engine: duplicate copies the brief without pictures or consent; delete is soft and leaves the list", async () => {
        const eng = createEngine(makeDeps(fakeProvider().provider).deps);
        const p = await eng.createProject(emp, { ...okBrief, referenceIds: ["m1"], consent: { attested: true, showsPeople: true, publicFigure: false } });
        await eng.generate(emp, p._id).catch(() => {});
        const c = await eng.duplicate(emp, p._id);
        assert.notEqual(c._id, p._id);
        assert.equal(c.variants.length, 0);
        assert.equal(c.brief.name, "Diwali offer (copy)");
        assert.equal(c.brief.consent!.attested, false);
        assert.equal(c.status, "draft", "consent is missing again, so it is not ready to generate");
        const before = (await listProjects()).length;
        await eng.remove(emp, c._id);
        assert.equal((await listProjects()).length, before - 1);
        assert.equal(await getProject(c._id), null);
        const raw = await (await projectsCollection()).findOne({ _id: c._id });
        assert.ok(raw?.deletedAt, "kept for the record, just hidden");
        await assert.rejects(() => eng.getProject(c._id));
      });

      await t("overview: counts per status, images and spend this month", async () => {
        const o = await projectOverview(new Date());
        assert.ok(o.total >= 8);
        assert.equal(Object.values(o.counts).reduce((a, n) => a + (n ?? 0), 0), o.total);
        assert.ok(o.imagesMonth > 0 && o.spendMonthUsd > 0);
      });
    });

    await runAsCompany("co_ip_b", async () => {
      await t("tenancy: another company sees none of the projects and cannot open one by id", async () => {
        assert.equal((await listProjects()).length, 0);
        assert.equal((await projectOverview(new Date())).total, 0);
        const eng = createEngine(makeDeps(fakeProvider().provider).deps);
        const any = await runAsCompany("co_ip_a", async () => (await listProjects())[0]._id);
        await assert.rejects(() => eng.getProject(any));
        await assert.rejects(() => eng.remove(emp, any));
        await assert.rejects(() => eng.duplicate(emp, any));
      });
    });
  } finally {
    const c = await MongoClient.connect(uri);
    await c.db(dbName).dropDatabase();
    await c.close();
  }
  console.log(`\nviralpulse image projects: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
