/**
 * AI UGC Studio backend tests. No real video model, LLM, TTS or storage is ever called: providers use an injected fetch or a fake class,
 * the LLM is a fake, ffmpeg is a fake runner, blobs live in a Map. Database: a THROWAWAY MongoDB only (asserted, then dropped).
 * Run: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_ugc npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-ugc.ts
 */
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "";
const dbName = uri.split("?")[0].split("/").pop() ?? "";
assert.ok(/zz_throwaway/.test(dbName), "refusing to run: MONGODB_URI must be a zz_throwaway_* database");
assert.ok(!/\.env\.local/.test(uri));

import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { policyCheck, platformDisclosures, disclosureFor, minAge, AI_LABEL_TEXT, ILLUSTRATIVE_NOTICE } from "../src/lib/products/viralpulse-ai/ugc/policy";
import { canProject, canJob, backoffMs, istDayStart, PROJECT_TRANSITIONS } from "../src/lib/products/viralpulse-ai/ugc/state";
import { validatePlan, snapDuration, durationAllowed } from "../src/lib/products/viralpulse-ai/ugc/validate";
import { generateScenePlan, PlanError, type LlmClient } from "../src/lib/products/viralpulse-ai/ugc/script";
import { OMNI_CAPABILITIES, GeminiOmniProvider } from "../src/lib/products/viralpulse-ai/ugc/providers/gemini-omni";
import { VEO_CAPABILITIES, VeoProvider } from "../src/lib/products/viralpulse-ai/ugc/providers/veo";
import { ProviderError, mapModeration, type VideoProvider, type RemoteStatus, type VideoRequest } from "../src/lib/products/viralpulse-ai/ugc/providers/types";
import { mp4DurationSecs, looksLikeMp4 } from "../src/lib/products/viralpulse-ai/ugc/mp4";
import { buildCues, toSrt, toAss, srtTime } from "../src/lib/products/viralpulse-ai/ugc/captions";
import { assemble, buildFilter } from "../src/lib/products/viralpulse-ai/ugc/assemble";
import { buildScenePrompt, actorPrompt } from "../src/lib/products/viralpulse-ai/ugc/prompt";
import { estimatePlan, costUsd } from "../src/lib/products/viralpulse-ai/ugc/pricing";
import { getStyle, listStyles, pickVariation } from "../src/lib/products/viralpulse-ai/ugc/styles";
import { sanitizeCast, castDirection } from "../src/lib/products/viralpulse-ai/ugc/cast";
import * as engine from "../src/lib/products/viralpulse-ai/ugc/engine";
import * as sampleEngine from "../src/lib/products/viralpulse-ai/ugc/engine-sample";
import { buildSamplePlan, sampleKeyFor, sampleBrief, sampleDurationSecs, sanitizeSeed } from "../src/lib/products/viralpulse-ai/ugc/sample";
import { saveUgcSettings, getUgcSettings, jobsCollection, projectsCollection } from "../src/lib/products/viralpulse-ai/ugc/store";
import type { EngineDeps, Actor } from "../src/lib/products/viralpulse-ai/ugc/deps";
import type { ScenePlan, ProductBrief } from "../src/lib/products/viralpulse-ai/ugc/types";
import { SmmsInputError } from "../src/lib/products/viralpulse-ai/viewer";

let pass = 0;
let fail = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try {
    await fn();
    pass++;
  } catch (e) {
    fail++;
    console.log("FAIL", name, "\n   ", e instanceof Error ? e.message.split("\n").slice(0, 8).join("\n    ") : e);
  }
};

// ── helpers ────────────────────────────────────────────────────────────

function mkMp4(secs: number): Buffer {
  const ftyp = Buffer.concat([Buffer.from([0, 0, 0, 16]), Buffer.from("ftypisom"), Buffer.alloc(4)]);
  const mvhdBody = Buffer.alloc(100);
  mvhdBody.writeUInt32BE(1000, 12); // timescale
  mvhdBody.writeUInt32BE(Math.round(secs * 1000), 16);
  const mvhd = Buffer.concat([Buffer.from([0, 0, 0, 108]), Buffer.from("mvhd"), mvhdBody]);
  const moov = Buffer.concat([Buffer.alloc(4), Buffer.from("moov"), mvhd]);
  moov.writeUInt32BE(moov.length, 0);
  return Buffer.concat([ftyp, moov]);
}

const BRIEF: ProductBrief = { name: "Chai Corner", description: "A neighbourhood cafe serving filter coffee and homemade cakes.", keyPoints: ["Filter coffee brewed with fresh beans", "Cakes baked every morning"], audience: "Young professionals", callToAction: "Visit us this weekend" };
const style = listStyles().find((s) => s.actorCount === 2 && s.aspects[0] === "9:16") ?? listStyles()[0];

function planFor(brief: ProductBrief): Record<string, unknown> {
  const target = style.durationRange[0];
  const n = Math.max(1, Math.ceil(target / 8));
  const each = Math.min(10, Math.max(3, Math.round(target / n)));
  const actors = Array.from({ length: style.actorCount }, (_, i) => ({ id: `a${i + 1}`, label: ["Asha", "Ravi", "Meera"][i], ageRange: "25-30", gender: i % 2 ? "male" : "female", look: "medium build, black shoulder length hair, warm brown skin", wardrobe: "olive linen shirt", personality: "relaxed and curious", accent: "Indian English" }));
  return {
    title: "Weekend coffee chat",
    actors,
    scenes: Array.from({ length: n }, (_, i) => ({
      durationSecs: each,
      setting: "A cosy cafe corner with warm light",
      visualPrompt: "Two friends chat over coffee at a wooden table",
      cameraNotes: "handheld smartphone, slight shake",
      actorIds: actors.map((a) => a.id),
      dialogue: [{ speakerId: "a1", text: i === 0 ? "You have to try this filter coffee" : "Honestly the cakes are fresh too" }],
      onScreenText: "",
      voiceOver: "",
      factsUsed: [brief.keyPoints[i % brief.keyPoints.length]],
    })),
  };
}

function fakeLlm(opts: { responses?: unknown[]; fn?: (n: number) => unknown } = {}): LlmClient & { calls: number; lastUser: string } {
  const c = {
    calls: 0,
    lastUser: "",
    async json(a: { user: string }) {
      c.lastUser = a.user;
      const data = opts.fn ? opts.fn(c.calls) : (opts.responses?.[c.calls] ?? planFor(BRIEF));
      c.calls++;
      return { data, model: "fake-llm", inputTokens: 100, outputTokens: 200, costUsd: 0.001 };
    },
  };
  return c;
}

class FakeProvider implements VideoProvider {
  capabilities = OMNI_CAPABILITIES;
  submits: VideoRequest[] = [];
  cancels: string[] = [];
  jobs = new Map<string, { state: RemoteStatus["state"]; error?: ProviderError["failure"]; secs: number }>();
  n = 0;
  submitFails: ProviderError | Error | null = null;
  nextOutcome: Array<"succeeded" | "running" | { fail: ProviderError["failure"] }> = [];
  defaultOutcome: "succeeded" | "running" = "succeeded";
  failFirstSubmits = 0;
  async submit(req: VideoRequest) {
    if (this.failFirstSubmits > 0) {
      this.failFirstSubmits--;
      throw new ProviderError({ code: "provider_error", retryable: true, message: "temp" });
    }
    if (this.submitFails) throw this.submitFails;
    this.submits.push(req);
    const id = `job-${++this.n}`;
    this.jobs.set(id, { state: "running", secs: req.durationSecs });
    return { providerJobId: id };
  }
  async poll(id: string): Promise<RemoteStatus> {
    const j = this.jobs.get(id)!;
    const next = this.nextOutcome.length ? this.nextOutcome.shift()! : this.defaultOutcome;
    if (next === "running") return { state: "running" };
    if (next === "succeeded") {
      j.state = "succeeded";
      return { state: "succeeded" };
    }
    return { state: "failed", error: next.fail };
  }
  async fetchResult(id: string) {
    return { data: mkMp4(this.jobs.get(id)!.secs), contentType: "video/mp4" };
  }
  async cancel(id: string) {
    this.cancels.push(id);
  }
  estimateCost(r: { durationSecs: number }) {
    return r.durationSecs * 0.1;
  }
}

interface Env {
  d: EngineDeps;
  provider: FakeProvider;
  llm: ReturnType<typeof fakeLlm>;
  clock: { t: number };
  blobs: Map<string, Buffer>;
  audits: Array<{ action: string; summary: string; entityId: string; actorId: string; metadata?: Record<string, unknown> }>;
  notes: Array<{ type: string; ids: string[] }>;
  meters: Array<{ kind: string; costUsd: number; seconds: number }>;
  attached: Array<{ postId: string; mediaId: string }>;
  ffmpegCalls: string[][];
  hasFfmpeg: boolean;
}

function makeEnv(llm = fakeLlm(), provider = new FakeProvider()): Env {
  const env = { provider, llm, clock: { t: Date.parse("2026-11-01T06:00:00Z") }, blobs: new Map<string, Buffer>(), audits: [], notes: [], meters: [], attached: [], ffmpegCalls: [], hasFfmpeg: true } as unknown as Env;
  let tok = 0;
  const media = new Map<string, { kind: "image" | "video"; ai: boolean; storageKey: string }>();
  media.set("photo-1", { kind: "image", ai: false, storageKey: "k/photo-1" });
  media.set("ai-img", { kind: "image", ai: true, storageKey: "k/ai" });
  env.d = {
    now: () => new Date(env.clock.t),
    token: () => `tok-${++tok}`,
    getProvider: async () => provider,
    llm: () => llm,
    resolveStyle: (id) => getStyle(id) ?? null,
    async saveClip(buf, info) {
      const id = `clip-${info.projectId.slice(0, 4)}-${info.sceneIndex}-${env.blobs.size}`;
      env.blobs.set(id, buf);
      media.set(id, { kind: "video", ai: true, storageKey: id });
      return { mediaId: id, storageKey: id };
    },
    async saveRender(a) {
      const id = `render-${env.blobs.size}`;
      env.blobs.set(id, a.video);
      media.set(id, { kind: "video", ai: true, storageKey: id });
      return { mediaId: id, thumbnailId: a.thumbnail ? `thumb-${id}` : null };
    },
    async readBlob(k) {
      const b = env.blobs.get(k);
      if (!b) throw new Error("missing");
      return b;
    },
    async mediaInfo(id) {
      const m = media.get(id);
      return m ? { ...m, contentType: m.kind === "image" ? "image/jpeg" : "video/mp4" } : null;
    },
    async readReference() {
      return { data: Buffer.from("img"), mimeType: "image/jpeg" };
    },
    async ffmpeg() {
      if (!env.hasFfmpeg) return null;
      return async (args: string[]) => {
        env.ffmpegCalls.push(args);
        const out = args[args.length - 1];
        const { writeFile } = await import("node:fs/promises");
        await writeFile(out, out.endsWith(".jpg") ? Buffer.from([0xff, 0xd8, 0xff]) : mkMp4(20));
      };
    },
    async meter(e) {
      env.meters.push({ kind: e.kind, costUsd: e.costUsd, seconds: e.seconds });
    },
    async audit(e) {
      env.audits.push({ action: e.action, summary: e.summary, entityId: e.entityId, actorId: e.actorId, metadata: e.metadata });
    },
    async notify(ids, n) {
      env.notes.push({ type: n.type, ids });
    },
    managerIds: async () => ["mgr-1"],
    async attachMedia(postId, mediaId) {
      env.attached.push({ postId, mediaId });
      return { title: "My post", platforms: ["instagram", "youtube"] };
    },
  };
  return env;
}

let coN = 0;
/** A database test in its own company, so one test's leftover jobs never count against another's concurrency or spend limits. */
const dbt = (name: string, fn: () => Promise<void>) =>
  t(name, () =>
    runAsCompany(`co_t${++coN}`, async () => {
      await saveUgcSettings({ dailySpendCapUsd: 100, approvalThresholdUsd: 50, maxConcurrentJobs: 2, maxAttemptsPerScene: 3 }, "admin");
      await fn();
    })
  );

const CREATOR: Actor = { userId: "creator-1", email: "c@x.test", canApprove: false };
const MANAGER: Actor = { userId: "mgr-1", email: "m@x.test", canApprove: true };

async function newScripted(env: Env, actor = CREATOR) {
  let p = await engine.createProject({ styleId: style.id, brief: BRIEF as unknown as Record<string, unknown>, options: { language: "en" } }, actor, env.d);
  p = await engine.generatePlan(p._id, actor, env.d);
  return p;
}
const sweep = (env: Env, projectId?: string) => engine.runUgcSweep(env.d, { projectId });
const mustFail = async (fn: () => Promise<unknown>, rx: RegExp) => {
  try {
    await fn();
  } catch (e) {
    assert.ok(e instanceof SmmsInputError || e instanceof PlanError || e instanceof ProviderError, `unexpected error type ${e}`);
    assert.match((e as Error).message, rx);
    return;
  }
  assert.fail(`expected failure matching ${rx}`);
};

async function main() {
  // ── pure: state machine ──
  await t("project transitions follow the lifecycle", () => {
    assert.ok(canProject("draft", "scripted") && canProject("scripted", "approved") && canProject("approved", "generating") && canProject("generating", "ready"));
    assert.ok(!canProject("draft", "generating") && !canProject("draft", "approved") && !canProject("ready", "approved") && !canProject("cancelled", "generating") && !canProject("scripted", "ready"));
    for (const [from, tos] of Object.entries(PROJECT_TRANSITIONS)) assert.ok(!tos.includes("approved") || from === "scripted", `${from} -> approved must only come from scripted`);
  });
  await t("job transitions: terminal states are final", () => {
    assert.ok(canJob("queued", "submitting") && canJob("submitting", "running") && canJob("running", "succeeded") && canJob("running", "queued"));
    for (const s of ["succeeded", "failed", "cancelled"] as const) for (const to of ["queued", "running", "succeeded"] as const) assert.ok(!canJob(s, to));
  });
  await t("backoff grows and is capped; IST day start", () => {
    assert.deepEqual([1, 2, 3, 4].map(backoffMs), [30000, 60000, 120000, 240000]);
    assert.equal(backoffMs(20), 600000);
    assert.equal(istDayStart(new Date("2026-11-01T20:00:00Z")).toISOString(), "2026-11-01T18:30:00.000Z"); // 01:30 IST on 2 Nov
    assert.equal(istDayStart(new Date("2026-11-01T06:00:00Z")).toISOString(), "2026-10-31T18:30:00.000Z");
  });

  // ── pure: policy (>= 40 cases) ──
  const blockCases: Array<[string, string]> = [
    ["Narendra Modi loves our tea", "public_figure"], ["Virat Kohli uses these shoes", "public_figure"], ["an actor who looks like a famous celebrity", "celebrity_likeness"],
    ["Bollywood star recommends our cream", "celebrity_endorsement"], ["vote for our party this election campaign", "politics"], ["A 9 year old boy actor reviewing the phone", "minor_actor"],
    ["kid trying our loan app", "minor_sensitive"], ["pretending to be a bank manager", "impersonation"], ["A real customer shares his review", "fake_real_customer"], ["genuine testimonial from a verified buyer", "fake_real_customer"],
    ["doctor recommended formula", "fake_authority"], ["clinically proven to work", "fake_authority"], ["A miracle for your hair", "miracle_claim"], ["cures diabetes in a week", "medical_claim"],
    ["guaranteed returns on your investment", "finance_guarantee"], ["double your money in 30 days", "finance_guarantee"], ["guaranteed visa approval", "legal_guarantee"], ["nude photoshoot", "adult"],
    ["He will kill him in the scene", "violence"], ["suicide prevention stunt", "violence"], ["buy cocaine online", "illegal_products"], ["fake passport service", "illegal_products"],
    ["online betting bonus", "illegal_products"], ["Buy beer today", "alcohol_tobacco"], ["Unlike Amazon, we care", "competitor_disparage"], ["Other brands are a scam", "competitor_generic"],
    ["Call 9876543210 now", "personal_data"], ["hate speech against all muslims", "hate"], ["a terrorist plot", "violence"], ["ISO certified bakery", "fake_authority"],
  ];
  for (const [text, code] of blockCases) {
    await t(`policy blocks: ${text}`, () => {
      const r = policyCheck({ name: "X", description: text, keyPoints: [] }, null);
      assert.ok(!r.ok, "should be blocked");
      assert.ok(r.blocked.some((f) => f.code === code), `expected ${code}, got ${r.blocked.map((f) => f.code)}`);
    });
  }
  const flagCases: Array<[string, string]> = [
    ["lose weight with our plan", "weight_loss"], ["supports immunity every day", "health_claim"], ["mutual funds SIP basics", "finance_topic"], ["Only 5 left in stock", "fake_scarcity"],
    ["India's best coffee", "superlative"], ["Flat 50% off today", "price_claim"], ["Award-winning bakery", "award_claim"], ["lawyer consultation for startups", "legal_topic"], ["baby food brand", "child_safety_topic"], ["temple prasad from the mandir", "religion_sensitive"],
  ];
  for (const [text, code] of flagCases) {
    await t(`policy flags: ${text}`, () => {
      const r = policyCheck({ name: "X", description: text, keyPoints: [] }, null);
      assert.ok(r.flagged.some((f) => f.code === code), `expected flag ${code}, got ${r.flagged.map((f) => f.code)}`);
      assert.ok(!r.blocked.some((f) => f.code === code));
    });
  }
  for (const text of ["Fresh filter coffee beans roasted weekly in small batches", "A cosy cafe in Pune serving homemade cakes", "Bath bomb with lavender scent", "Cotton kurta in three colours", "A striped shirt for office", "Handmade ceramic mugs"]) {
    await t(`policy passes clean text: ${text}`, () => assert.equal(policyCheck({ name: "X", description: text, keyPoints: [] }, null).ok, true));
  }
  await t("policy: plan-level actor age, dialogue, testimonial notice", () => {
    const base = planFor(BRIEF) as unknown as ScenePlan;
    const mk = (over: Partial<ScenePlan>): ScenePlan => { const c = JSON.parse(JSON.stringify(base)) as ScenePlan; return { styleId: style.id, language: "en", aspect: "9:16", productBrief: BRIEF, title: "t", actors: c.actors.map((a) => ({ ...a, voice: { mode: "native" as const } })), scenes: c.scenes.map((s, i) => ({ ...s, index: i })), ...over }; };
    assert.equal(policyCheck(BRIEF, mk({})).ok, true, JSON.stringify(policyCheck(BRIEF, mk({}))));
    const minor = mk({}); minor.actors[0] = { ...minor.actors[0], ageRange: "14-16" };
    assert.ok(policyCheck(BRIEF, minor).blocked.some((f) => f.code === "actor_age"));
    const teen = mk({}); teen.actors[0] = { ...teen.actors[0], ageRange: "teenager" };
    assert.ok(!policyCheck(BRIEF, teen).ok);
    const vague = mk({}); vague.actors[0] = { ...vague.actors[0], ageRange: "adult" };
    assert.ok(!policyCheck(BRIEF, vague).ok, "unstated age must be refused");
    const bad = mk({}); bad.scenes[0].dialogue[0].text = "This cures cancer, miracle!";
    assert.ok(policyCheck(BRIEF, bad).blocked.length >= 1);
    const testi = mk({}); testi.scenes[0].dialogue[0].text = "I tried this for a month and I love it";
    assert.equal(policyCheck(BRIEF, testi).requiresIllustrativeNotice, true, 'testi');
    assert.equal(policyCheck(BRIEF, mk({})).requiresIllustrativeNotice, false, 'plain');
    assert.equal(policyCheck(BRIEF, mk({}), { illustrativeStyle: true }).requiresIllustrativeNotice, true);
    assert.equal(minAge("25-30"), 25);
    assert.equal(minAge("mid 20s"), 20);
  });
  await t("disclosure: every platform has a suffix and an action; Hinglish variant", () => {
    const all = platformDisclosures("en");
    assert.deepEqual(all.map((d) => d.platform).sort(), ["facebook", "instagram", "linkedin", "whatsapp", "x", "youtube"]);
    for (const d of all) assert.ok(d.captionSuffix.includes("AI") && d.action.length > 10);
    assert.match(disclosureFor("instagram", "hinglish").captionSuffix, /AI se banaya/);
    assert.match(disclosureFor("youtube", "en").action, /synthetic/i);
    assert.equal(AI_LABEL_TEXT, "AI generated");
    assert.match(ILLUSTRATIVE_NOTICE, /Not a real customer/);
  });

  // ── pure: validation, prompts, captions ──
  await t("validatePlan: durations, dialogue length, actors, invented numbers", () => {
    const good = planFor(BRIEF) as unknown as ScenePlan;
    const plan = (): ScenePlan => ({ styleId: style.id, language: "en", aspect: "9:16", productBrief: BRIEF, title: "t", actors: JSON.parse(JSON.stringify(good.actors)).map((a: object) => ({ ...a, voice: { mode: "native" } })), scenes: JSON.parse(JSON.stringify(good.scenes)).map((s: object, i: number) => ({ ...s, index: i, dialogue: (s as { dialogue: Array<{ speakerId: string; text: string }> }).dialogue.map((l) => ({ ...l, language: "en" })) })) });
    const opts = { caps: OMNI_CAPABILITIES, totalRange: style.durationRange, maxActors: style.actorCount, briefFacts: [BRIEF.name, BRIEF.description, ...BRIEF.keyPoints] };
    assert.deepEqual(validatePlan(plan(), opts).errors, []);
    const longer = plan(); longer.scenes[0].dialogue[0].text = "word ".repeat(40);
    assert.match(validatePlan(longer, opts).errors.join(" "), /needs about/);
    const unk = plan(); unk.scenes[0].actorIds = ["zz"];
    assert.match(validatePlan(unk, opts).errors.join(" "), /unknown actor/);
    const num = plan(); num.scenes[0].dialogue[0].text = "Only 99 rupees today";
    assert.match(validatePlan(num, opts).errors.join(" "), /"99" is not in the brief/);
    const ok2 = plan(); ok2.scenes[0].dialogue[0].text = "Only 99 rupees";
    assert.deepEqual(validatePlan(ok2, { ...opts, briefFacts: [...opts.briefFacts, "Coffee is 99 rupees"] }).errors.filter((e) => /99/.test(e)), []);
    const fact = plan();
    assert.match(validatePlan(fact, { ...opts, factsUsed: { 0: ["Won best cafe award"] } }).errors.join(" "), /not in the brief/);
    const dur = plan(); dur.scenes[0].durationSecs = 30;
    assert.match(validatePlan(dur, opts).errors.join(" "), /not a length/);
    const veoDur = plan(); veoDur.scenes[0].durationSecs = 5;
    assert.match(validatePlan(veoDur, { ...opts, caps: VEO_CAPABILITIES }).errors.join(" "), /use 4, 6, 8/);
    const noAct = plan(); noAct.actors = [];
    assert.match(validatePlan(noAct, opts).errors.join(" "), /At least one actor/);
    assert.equal(snapDuration(5, VEO_CAPABILITIES), 6); // tie -> longer
    assert.equal(snapDuration(7.4, VEO_CAPABILITIES), 8);
    assert.equal(snapDuration(30, OMNI_CAPABILITIES), 10);
    assert.ok(durationAllowed(8, VEO_CAPABILITIES) && !durationAllowed(7, VEO_CAPABILITIES));
  });
  await t("scene prompt reuses actor description verbatim and keeps dialogue", () => {
    const plan = { ...(planFor(BRIEF) as object), styleId: style.id, language: "hinglish", aspect: "9:16", productBrief: BRIEF } as unknown as ScenePlan;
    plan.actors = plan.actors.map((a) => ({ ...a, voice: { mode: "native" as const } }));
    plan.scenes = plan.scenes.map((s, i) => ({ ...s, index: i }));
    plan.scenes[0].dialogue = [{ speakerId: "a1", text: "Yaar ye coffee try karo", language: "hinglish" }];
    const p0 = buildScenePrompt(plan, plan.scenes[0], { cap: 200 });
    const p1 = buildScenePrompt(plan, plan.scenes[plan.scenes.length - 1]);
    for (const a of plan.actors) assert.ok(p0.includes(actorPrompt(a)) && p1.includes(actorPrompt(a)), "actor description verbatim in every scene");
    assert.ok(p0.includes("Yaar ye coffee try karo"), "dialogue never truncated");
    assert.match(p0, /No on-screen text/);
  });
  await t("captions: cues fit scene, SRT and ASS contents", () => {
    const plan = { ...(planFor(BRIEF) as object), styleId: style.id, language: "en", aspect: "9:16", productBrief: BRIEF } as unknown as ScenePlan;
    plan.scenes = plan.scenes.map((s, i) => ({ ...s, index: i }));
    const cues = buildCues(plan);
    let off = 0;
    plan.scenes.forEach((s, i) => { assert.ok(cues[i].start >= off && cues[i].end <= off + s.durationSecs + 0.01); off += s.durationSecs; });
    assert.equal(srtTime(3661.5), "01:01:01,500");
    assert.match(toSrt(cues), /^1\n00:00:00,600 --> /);
    const ass = toAss({ cues, totalSecs: off, aspect: "9:16", captions: true, aiLabel: { enabled: true, position: "top-right" }, illustrativeNotice: true });
    assert.match(ass, /Label,,0,0,0,,AI generated/);
    assert.match(ass, /Notice,,0,0,0,,Illustrative AI-generated/);
    assert.match(ass, /Style: Label,.*,9,/); // top-right alignment 9
    const off2 = toAss({ cues, totalSecs: off, aspect: "9:16", captions: false, aiLabel: { enabled: false, position: "top-right" }, illustrativeNotice: false });
    assert.ok(!/Dialogue:/.test(off2));
  });
  await t("mp4 duration parser", () => {
    assert.equal(mp4DurationSecs(mkMp4(7.5)), 7.5);
    assert.equal(mp4DurationSecs(Buffer.from("not a video")), null);
    assert.ok(looksLikeMp4(mkMp4(1)) && !looksLikeMp4(Buffer.from("hello world, this is text")));
  });
  await t("assemble: one ffmpeg pass with scale/concat/subtitles, thumbnail, SRT; fake runner", async () => {
    const calls: string[][] = [];
    const plan = { ...(planFor(BRIEF) as object), styleId: style.id, language: "en", aspect: "1:1", productBrief: BRIEF } as unknown as ScenePlan;
    plan.scenes = plan.scenes.map((s, i) => ({ ...s, index: i }));
    const { writeFile, readFile } = await import("node:fs/promises");
    const out = await assemble({ clips: plan.scenes.map(() => mkMp4(6)), clipDurations: plan.scenes.map(() => 6), plan, captions: true, aiLabel: { enabled: true, position: "bottom-left" }, illustrativeNotice: false }, async (args, cwd) => {
      calls.push(args);
      assert.ok(cwd.includes("ugc-"));
      if (args.includes("-filter_complex")) assert.match(await readFile(`${cwd}/o.ass`, "utf8"), /AI generated/);
      await writeFile(args[args.length - 1], args[args.length - 1].endsWith(".jpg") ? Buffer.from([1]) : mkMp4(12));
    });
    const fc = calls[0][calls[0].indexOf("-filter_complex") + 1];
    assert.match(fc, /scale=720:720.*crop=720:720/);
    assert.match(fc, /concat=n=\d+:v=1:a=1/);
    assert.match(fc, /subtitles=o\.ass/);
    assert.ok(out.video.length > 0 && out.thumbnail && out.srt.includes("-->"));
    assert.ok(!buildFilter(2, 720, 1280, null).includes("subtitles"));
  });

  // ── providers via injected fetch ──
  await t("Omni adapter: background request shape, status mapping, moderation, cost", async () => {
    const reqs: Array<{ url: string; init?: RequestInit }> = [];
    let status = "in_progress";
    const fetchFn = async (url: string, init?: RequestInit) => {
      reqs.push({ url, init });
      if (init?.method === "POST" && url.endsWith("/interactions")) return new Response(JSON.stringify({ id: "v1_abc", status: "in_progress" }), { status: 200 });
      if (url.endsWith("/cancel")) return new Response("{}", { status: 200 });
      if (status === "completed") return new Response(JSON.stringify({ id: "v1_abc", status, steps: [{ type: "model_output", content: [{ type: "video", mime_type: "video/mp4", data: mkMp4(5).toString("base64") }] }] }), { status: 200 });
      if (status === "failed") return new Response(JSON.stringify({ id: "v1_abc", status, error: { message: "Blocked: the prompt depicts a public figure" } }), { status: 200 });
      if (status === "empty") return new Response(JSON.stringify({ id: "v1_abc", status: "completed", steps: [{ type: "model_output", content: [] }] }), { status: 200 });
      return new Response(JSON.stringify({ id: "v1_abc", status }), { status: 200 });
    };
    const p = new GeminiOmniProvider("KEY", fetchFn as never);
    const { providerJobId } = await p.submit({ prompt: "hello", aspect: "9:16", durationSecs: 6, resolution: "720p", model: "gemini-omni-1.1-flash", referenceImages: [{ data: Buffer.from("x"), mimeType: "image/jpeg" }] });
    assert.equal(providerJobId, "v1_abc");
    const body = JSON.parse(String(reqs[0].init?.body));
    assert.equal(body.background, true); assert.equal(body.store, true);
    assert.equal(body.response_format.aspect_ratio, "9:16");
    assert.equal(body.generation_config.video_config.task, "reference_to_video");
    assert.match(JSON.stringify(body.input), /about 6 seconds/);
    assert.equal((reqs[0].init?.headers as Record<string, string>)["x-goog-api-key"], "KEY");
    assert.deepEqual(await p.poll("v1_abc"), { state: "running" });
    status = "completed"; assert.deepEqual(await p.poll("v1_abc"), { state: "succeeded" });
    const file = await p.fetchResult("v1_abc");
    assert.equal(mp4DurationSecs(file.data), 5);
    status = "failed"; const f = await p.poll("v1_abc");
    assert.ok(f.state === "failed" && f.error.code === "moderation" && !f.error.retryable && /real or recognisable person/.test(f.error.message));
    status = "empty"; const e = await p.poll("v1_abc");
    assert.ok(e.state === "failed" && e.error.code === "moderation");
    await p.cancel("v1_abc");
    assert.ok(reqs.some((r) => r.url.endsWith("/v1_abc/cancel")));
    assert.equal(p.estimateCost({ durationSecs: 10, resolution: "720p", model: "gemini-omni-1.1-flash" }), 1);
  });
  await t("Omni/Veo adapters map HTTP errors; Veo request shape", async () => {
    const mk = (status: number, body = "{}") => new GeminiOmniProvider("K", (async () => new Response(body, { status })) as never);
    await assert.rejects(() => mk(429).poll("x"), (e: ProviderError) => e.failure.retryable && e.failure.code === "quota");
    await assert.rejects(() => mk(401).poll("x"), (e: ProviderError) => !e.failure.retryable && e.failure.code === "auth" && !/AIza/.test(e.message));
    await assert.rejects(() => mk(500).poll("x"), (e: ProviderError) => e.failure.retryable);
    await assert.rejects(() => mk(400, "unsafe content blocked by safety policy").poll("x"), (e: ProviderError) => e.failure.code === "moderation");
    const sent: unknown[] = [];
    const veo = new VeoProvider("K", (async (_u: string, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ name: "operations/abc" }), { status: 200 }); }) as never);
    assert.equal((await veo.submit({ prompt: "p", aspect: "9:16", durationSecs: 8, resolution: "720p", model: "veo-3.0-fast-generate-001" })).providerJobId, "operations/abc");
    assert.equal((sent[0] as { parameters: { durationSeconds: number } }).parameters.durationSeconds, 8);
    await assert.rejects(() => veo.submit({ prompt: "p", aspect: "9:16", durationSecs: 5, resolution: "720p", model: "veo-3.0-fast-generate-001" }), (e: ProviderError) => /4, 6 or 8/.test(e.message));
    const done = new VeoProvider("K", (async () => new Response(JSON.stringify({ done: true, response: { generateVideoResponse: { raiMediaFilteredCount: 1, raiMediaFilteredReasons: ["Content blocked: celebrity likeness"] } } }), { status: 200 })) as never);
    const st = await done.poll("operations/abc");
    assert.ok(st.state === "failed" && st.error.code === "moderation");
    assert.equal(mapModeration("hello world"), null);
    assert.equal(veo.estimateCost({ durationSecs: 8, resolution: "720p", model: "veo-3.0-fast-generate-001" }), 1.2);
  });

  // ── script engine with a fake LLM ──
  await t("generateScenePlan: strict schema call, normalised plan, repair round, hard failure", async () => {
    const llm = fakeLlm();
    const out = await generateScenePlan(BRIEF, style, { aspect: "9:16", language: "hinglish", targetSecs: style.durationRange[0], caps: OMNI_CAPABILITIES }, { llm });
    assert.equal(out.attempts, 1);
    assert.equal(out.plan.styleId, style.id);
    assert.equal(out.plan.language, "hinglish");
    assert.equal(out.plan.scenes[0].dialogue[0].language, "hinglish");
    assert.match(llm.lastUser, /Hinglish/);
    assert.match(llm.lastUser, /only source of facts/i);
    const bad = planFor(BRIEF) as { scenes: Array<{ dialogue: Array<{ text: string }> }> };
    const bad1 = JSON.parse(JSON.stringify(bad)); bad1.scenes[0].dialogue[0].text = "Only 49 rupees, best price";
    const llm2 = fakeLlm({ responses: [bad1, planFor(BRIEF)] });
    const out2 = await generateScenePlan(BRIEF, style, { aspect: "9:16", language: "en", targetSecs: style.durationRange[0], caps: OMNI_CAPABILITIES }, { llm: llm2 });
    assert.equal(out2.attempts, 2); assert.match(llm2.lastUser, /previous attempt had these problems/); assert.equal(out2.inputTokens, 200);
    await assert.rejects(() => generateScenePlan(BRIEF, style, { aspect: "9:16", language: "en", targetSecs: style.durationRange[0], caps: OMNI_CAPABILITIES }, { llm: fakeLlm({ fn: () => bad1 }) }), (e: PlanError) => e instanceof PlanError && e.errors.length > 0);
    await assert.rejects(() => generateScenePlan({ ...BRIEF, description: "" }, style, { aspect: "9:16", language: "en", targetSecs: 20, caps: OMNI_CAPABILITIES }, { llm }), PlanError);
    // veo: durations snapped to 4/6/8
    const veoPlan = JSON.parse(JSON.stringify(planFor(BRIEF))); veoPlan.scenes.forEach((s: { durationSecs: number }) => (s.durationSecs = 5));
    const o3 = await generateScenePlan(BRIEF, style, { aspect: "9:16", language: "en", targetSecs: style.durationRange[0], caps: VEO_CAPABILITIES }, { llm: fakeLlm({ fn: () => veoPlan }) }).catch((e) => e);
    if (!(o3 instanceof Error)) assert.ok(o3.plan.scenes.every((s) => [4, 6, 8].includes(s.durationSecs)));
  });
  await t("cost estimate: per second, override, scene subset", () => {
    const plan = { ...(planFor(BRIEF) as object), styleId: style.id, language: "en", aspect: "9:16", productBrief: BRIEF } as unknown as ScenePlan;
    plan.scenes = plan.scenes.map((s, i) => ({ ...s, index: i }));
    const total = plan.scenes.reduce((a, s) => a + s.durationSecs, 0);
    const e = estimatePlan(plan, "omni", "gemini-omni-1.1-flash", null, 1);
    assert.equal(e.totalSecs, total); assert.equal(e.usd, Math.round(total * 0.1 * 10000) / 10000);
    assert.equal(estimatePlan(plan, "omni", "gemini-omni-1.1-flash", 0.2, 1).usd, Math.round(total * 0.2 * 10000) / 10000);
    assert.equal(estimatePlan(plan, "omni", "x", null, 1, [0]).perScene.length, 1);
    assert.equal(costUsd("veo", "veo-3.0-generate-001", 8, null), 3.2);
  });

  // ── database-backed engine ──
  try {
    await runAsCompany("co_a", async () => {
      await saveUgcSettings({ dailySpendCapUsd: 100, approvalThresholdUsd: 50, maxConcurrentJobs: 2, maxAttemptsPerScene: 3 }, "admin");

      await dbt("project lifecycle: draft -> scripted (plan, policy, estimate, version) with audit", async () => {
        const env = makeEnv();
        const p0 = await engine.createProject({ styleId: style.id, brief: BRIEF as unknown as Record<string, unknown>, options: { language: "en" } }, CREATOR, env.d);
        assert.equal(p0.status, "draft");
        assert.equal(p0.options.aiLabel.enabled, true, "AI label default ON");
        const p = await engine.generatePlan(p0._id, CREATOR, env.d);
        assert.equal(p.status, "scripted"); assert.equal(p.planVersion, 1); assert.equal(p.versions.length, 1);
        assert.ok(p.estimate && p.estimate.usd > 0 && p.policy?.ok);
        assert.ok(env.audits.some((a) => a.action === "create") && env.audits.some((a) => a.action === "generate"));
        assert.ok(env.meters.some((m) => m.kind === "plan"));
        await mustFail(() => engine.createProject({ styleId: "nope", brief: BRIEF as unknown as Record<string, unknown> }, CREATOR, env.d), /Choose a video style/);
        await mustFail(() => engine.createProject({ styleId: style.id, brief: { name: "x", description: "" } }, CREATOR, env.d), /Describe the product/);
      });

      await dbt("cast and look: sanitised, sent to the script writer, enforced on the written actors; a changed cast or style returns to draft", async () => {
        const env = makeEnv();
        const p0 = await engine.createProject({ styleId: style.id, brief: BRIEF as unknown as Record<string, unknown>, options: { language: "en" } }, CREATOR, env.d);
        const cast = pickVariation(style, "ui-seed-1");
        const withCast = await engine.setCast(p0._id, cast, CREATOR, env.d);
        assert.equal(withCast.cast?.actors.length, style.actorCount);
        await mustFail(() => engine.setCast(p0._id, { ...cast, actors: cast.actors.map((a) => ({ ...a, ageRange: "16-17" })) }, CREATOR, env.d), /adult/);
        await mustFail(() => engine.setCast(p0._id, { ...cast, actors: cast.actors.slice(0, 1).concat(style.actorCount > 1 ? [] : []) , styleId: "other" }, CREATOR, env.d), /different style|needs exactly/);
        const p = await engine.generatePlan(p0._id, CREATOR, env.d);
        assert.match(env.llm.lastUser, /CAST AND LOOK/);
        assert.match(env.llm.lastUser, new RegExp(cast.actors[0].wardrobe.slice(0, 12)));
        assert.equal(p.plan!.actors[0].label, cast.actors[0].label, "the chosen people are written onto the script");
        assert.equal(p.plan!.actors[0].wardrobe, cast.actors[0].wardrobe);
        assert.ok(castDirection(sanitizeCast(style, cast)).includes(cast.setting.label));
        const recast = pickVariation(style, "ui-seed-2");
        const again = await engine.setCast(p._id, recast, CREATOR, env.d);
        assert.equal(again.status, "draft", "a different cast makes the written script stale");
        assert.equal(again.estimate, null);
        const other = listStyles().find((x) => x.id !== style.id && x.actorCount === 1) ?? listStyles().find((x) => x.id !== style.id)!;
        const moved = await engine.changeStyle(p._id, other.id, CREATOR, env.d);
        assert.equal(moved.styleId, other.id); assert.equal(moved.cast, null); assert.equal(moved.plan, null); assert.equal(moved.status, "draft");
        assert.ok(other.aspects.includes(moved.options.aspect));
        await mustFail(() => engine.changeStyle(p._id, "nope", CREATOR, env.d), /Choose a video style/);
      });

      await dbt("editPlan validates, versions, resets approval state; brief change sends it back to draft", async () => {
        const env = makeEnv();
        const p = await newScripted(env);
        const edited = JSON.parse(JSON.stringify(p.plan)) as ScenePlan;
        edited.scenes[0].dialogue[0].text = "Try this filter coffee";
        const p2 = await engine.editPlan(p._id, edited, CREATOR, env.d);
        assert.equal(p2.planVersion, 2); assert.equal(p2.versions.length, 2);
        const badE = JSON.parse(JSON.stringify(p.plan)) as ScenePlan; badE.scenes[0].dialogue[0].text = "It costs 7 rupees";
        await mustFail(() => engine.editPlan(p._id, badE, CREATOR, env.d), /not in the brief/);
        const unsafe = JSON.parse(JSON.stringify(p.plan)) as ScenePlan; unsafe.scenes[0].dialogue[0].text = "A miracle cure";
        const p3 = await engine.editPlan(p._id, unsafe, CREATOR, env.d);
        assert.equal(p3.policy?.ok, false);
        await mustFail(() => engine.approveAndGenerate(p._id, MANAGER, env.d), /can't be generated/);
        const restored = await engine.restoreVersion(p._id, 1, CREATOR, env.d);
        assert.equal(restored.planVersion, 4); assert.equal(restored.policy?.ok, true);
        const p4 = await engine.updateBrief(p._id, { brief: { description: "A neighbourhood cafe for tea lovers" } }, CREATOR, env.d);
        assert.equal(p4.status, "draft"); assert.equal(p4.estimate, null);
        await mustFail(() => engine.approveAndGenerate(p._id, MANAGER, env.d), /script/i);
      });

      await dbt("no spend without approval: sweep does nothing for a scripted project; provider never called", async () => {
        const env = makeEnv();
        const p = await newScripted(env);
        const r = await sweep(env);
        assert.equal(env.provider.submits.length, 0);
        assert.equal(r.submitted, 0);
        assert.equal((await engine.getProjectOrThrow(p._id)).status, "scripted");
      });

      await dbt("approval threshold: creator is routed to a manager; manager approval is recorded with estimate and who", async () => {
        await saveUgcSettings({ approvalThresholdUsd: 0.5 }, "admin");
        const env = makeEnv();
        const p = await newScripted(env);
        const r = await engine.approveAndGenerate(p._id, CREATOR, env.d);
        assert.equal(r.outcome, "needs_manager");
        assert.ok(r.outcome === "needs_manager" && r.estimateUsd > 0.5);
        let cur = await engine.getProjectOrThrow(p._id);
        assert.equal(cur.status, "scripted"); assert.ok(cur.pendingApproval); assert.equal(cur.approvals.length, 0);
        assert.deepEqual(env.notes.at(-1)?.ids, ["mgr-1"]);
        assert.equal(env.provider.submits.length, 0);
        const m = await engine.approveAndGenerate(p._id, MANAGER, env.d);
        assert.equal(m.outcome, "started");
        cur = await engine.getProjectOrThrow(p._id);
        assert.equal(cur.status, "generating"); assert.equal(cur.approvals[0].by, "mgr-1"); assert.equal(cur.approvals[0].estimateUsd, cur.estimate!.usd); assert.equal(cur.approvals[0].scope, "project");
        assert.ok(env.audits.some((a) => a.action === "approve" && a.actorId === "mgr-1"));
        await saveUgcSettings({ approvalThresholdUsd: 50 }, "admin");
      });

      await dbt("flagged content needs acknowledgement; blocked cannot be approved", async () => {
        const env = makeEnv();
        const flagged = { ...BRIEF, keyPoints: [...BRIEF.keyPoints, "India's best coffee"] };
        let p = await engine.createProject({ styleId: style.id, brief: flagged as unknown as Record<string, unknown> }, CREATOR, env.d);
        p = await engine.generatePlan(p._id, CREATOR, env.d);
        assert.ok(p.policy!.flagged.some((f) => f.code === "superlative"));
        await mustFail(() => engine.approveAndGenerate(p._id, CREATOR, env.d), /acknowledge/);
        const r = await engine.approveAndGenerate(p._id, CREATOR, env.d, { acknowledgeFlags: ["superlative"] });
        assert.equal(r.outcome, "started");
        assert.deepEqual((await engine.getProjectOrThrow(p._id)).approvals[0].flagsAcknowledged, ["superlative"]);
        const blockedBrief = { ...BRIEF, keyPoints: ["Doctor recommended and clinically proven"] };
        const envB = makeEnv(fakeLlm({ fn: () => planFor(blockedBrief) }));
        let b = await engine.createProject({ styleId: style.id, brief: blockedBrief as unknown as Record<string, unknown> }, CREATOR, envB.d);
        b = await engine.generatePlan(b._id, CREATOR, envB.d);
        await mustFail(() => engine.approveAndGenerate(b._id, MANAGER, envB.d), /can't be generated/);
      });

      await dbt("claim race: two simultaneous approvals start exactly one generation; jobs are not duplicated", async () => {
        const env = makeEnv();
        const p = await newScripted(env);
        const res = await Promise.allSettled([engine.approveAndGenerate(p._id, MANAGER, env.d), engine.approveAndGenerate(p._id, MANAGER, env.d), engine.approveAndGenerate(p._id, MANAGER, env.d)]);
        assert.equal(res.filter((r) => r.status === "fulfilled").length, 1);
        const jobs = await (await jobsCollection()).find({ projectId: p._id }).toArray();
        assert.equal(jobs.length, p.plan!.scenes.length);
        assert.equal(new Set(jobs.map((j) => j.requestKey)).size, jobs.length);
      });

      await dbt("happy path: submit (concurrency cap), poll, store clips, assemble, ready; metering; media flagged; idempotent sweeps", async () => {
        const env = makeEnv();
        env.provider.defaultOutcome = "running";
        const p = await newScripted(env);
        const nScenes = p.plan!.scenes.length;
        await engine.approveAndGenerate(p._id, MANAGER, env.d);
        const r1 = await sweep(env, p._id);
        assert.equal(r1.submitted, Math.min(2, nScenes), "per-company concurrency cap of 2");
        const r1b = await sweep(env, p._id);
        assert.equal(r1b.submitted, 0, "nothing more while at the cap and still rendering");
        assert.equal(env.provider.submits.length, Math.min(2, nScenes));
        env.provider.defaultOutcome = "succeeded";
        for (let i = 0; i < nScenes + 2; i++) await sweep(env, p._id);
        const done = await engine.getProjectOrThrow(p._id);
        assert.equal(done.status, "ready");
        assert.equal(env.provider.submits.length, nScenes, "each scene submitted exactly once");
        assert.equal(done.render?.strategy, nScenes === 1 ? "single" : "assembled");
        assert.ok(done.render?.mediaId && done.render.labelBurned && done.render.captionsBurned && done.render.srt.includes("-->"));
        assert.equal(env.meters.filter((m) => m.kind === "video").length, nScenes);
        assert.ok(Math.abs(done.spendUsd - done.estimate!.usd) < 0.5);
        assert.ok(env.ffmpegCalls.length >= 1);
        assert.ok(env.notes.some((n) => n.type === "smms_ugc_ready"));
        const before = env.provider.submits.length;
        await sweep(env, p._id); await sweep(env, p._id);
        assert.equal(env.provider.submits.length, before);
        assert.equal(env.audits.filter((a) => /Video ready/.test(a.summary)).length, 1);
      });

      await dbt("retry with backoff on a transient provider failure, then success; attempts bounded", async () => {
        const env = makeEnv();
        env.provider.defaultOutcome = "running";
        env.provider.failFirstSubmits = 1;
        const p = await newScripted(env);
        await engine.approveAndGenerate(p._id, MANAGER, env.d);
        const r = await sweep(env, p._id);
        assert.ok(r.retried >= 1);
        const jobs = await (await jobsCollection()).find({ projectId: p._id, status: "queued" }).toArray();
        const j = jobs.find((x) => x.attempts === 1)!;
        assert.ok(j && j.nextAttemptAt.getTime() - env.clock.t === 30_000, "first backoff is 30s");
        await sweep(env, p._id);
        assert.ok(!env.provider.submits.some((_, i) => i === 99));
        const stillQueued = await (await jobsCollection()).findOne({ _id: j._id });
        assert.equal(stillQueued?.status, "queued", "not resubmitted before its backoff passes");
        env.clock.t += 31_000;
        env.provider.defaultOutcome = "succeeded";
        for (let i = 0; i < 6; i++) await sweep(env, p._id);
        assert.equal((await engine.getProjectOrThrow(p._id)).status, "ready");
        // exhaust attempts: always transient
        const env2 = makeEnv();
        env2.provider.failFirstSubmits = 100;
        const q = await newScripted(env2);
        await engine.approveAndGenerate(q._id, MANAGER, env2.d);
        for (let i = 0; i < 8; i++) { await sweep(env2, q._id); env2.clock.t += 700_000; }
        const failed = await engine.getProjectOrThrow(q._id);
        assert.equal(failed.status, "failed");
        const js = await (await jobsCollection()).find({ projectId: q._id }).toArray();
        assert.ok(js.every((x) => x.attempts <= 3), "bounded retries");
        assert.ok(env2.notes.some((n) => n.type === "smms_ugc_failed"));
      });

      await dbt("moderation failure is not retried and is shown in plain words; failed scene can be redone, others kept", async () => {
        const env = makeEnv();
        const p = await newScripted(env);
        const n = p.plan!.scenes.length;
        await engine.approveAndGenerate(p._id, MANAGER, env.d);
        env.provider.nextOutcome = [];
        // first poll of the first submitted job fails with moderation
        env.provider.defaultOutcome = "succeeded";
        const origPoll = env.provider.poll.bind(env.provider);
        let hit = false;
        env.provider.poll = async (id: string) => (!hit && ((hit = true), true) ? { state: "failed" as const, error: { code: "moderation" as const, retryable: false, message: "The video model's safety filter declined this scene." } } : origPoll(id));
        for (let i = 0; i < n + 3; i++) await sweep(env, p._id);
        const f = await engine.getProjectOrThrow(p._id);
        assert.equal(f.status, "failed"); assert.match(f.error ?? "", /safety filter/);
        const js = await engine.latestJobs(f);
        const bad = js.find((j) => j.status === "failed")!;
        assert.equal(bad.attempts, 1, "moderation is never retried");
        assert.equal(js.filter((j) => j.status === "succeeded").length, n - 1);
        await mustFail(() => engine.resumeProject(p._id, CREATOR, env.d), /Redo those scenes/);
        env.provider.poll = origPoll;
        const spendBefore = env.d.now().getTime();
        const r = await engine.regenerateScene(p._id, bad.sceneIndex, CREATOR, env.d);
        assert.equal(r.outcome, "started");
        const subsBefore = env.provider.submits.length;
        for (let i = 0; i < 4; i++) await sweep(env, p._id);
        assert.equal(env.provider.submits.length, subsBefore + 1, "only the failed scene is re-rendered");
        const done = await engine.getProjectOrThrow(p._id);
        assert.equal(done.status, "ready");
        assert.equal(done.sceneGen[String(bad.sceneIndex)], 2);
        assert.ok(done.approvals.some((a) => a.scope === `scene:${bad.sceneIndex}`));
        assert.ok(spendBefore > 0);
      });

      await dbt("regenerate scene with a policy-violating note is refused; only ready/failed projects", async () => {
        const env = makeEnv();
        const p = await newScripted(env);
        await mustFail(() => engine.regenerateScene(p._id, 0, CREATOR, env.d), /once the video has finished/);
        await engine.approveAndGenerate(p._id, MANAGER, env.d);
        for (let i = 0; i < 6; i++) await sweep(env, p._id);
        await mustFail(() => engine.regenerateScene(p._id, 0, CREATOR, env.d, { note: "make it a miracle cure" }), /can't be used/);
        await assert.rejects(() => engine.regenerateScene(p._id, 99, CREATOR, env.d), /Not found/);
      });

      await dbt("cancel: queued and running jobs cancelled, provider asked to cancel, project cancelled, nothing billed", () => runAsCompany("co_cancel", async () => {
        const env = makeEnv();
        env.provider.defaultOutcome = "running";
        const p = await newScripted(env);
        await engine.approveAndGenerate(p._id, MANAGER, env.d);
        await sweep(env, p._id);
        const c = await engine.cancelProject(p._id, CREATOR, env.d);
        assert.equal(c.status, "cancelled");
        assert.ok(env.provider.cancels.length >= 1);
        const js = await (await jobsCollection()).find({ projectId: p._id }).toArray();
        assert.ok(js.every((j) => j.status === "cancelled"));
        assert.equal(env.meters.filter((m) => m.kind === "video").length, 0);
        const sub = env.provider.submits.length;
        await sweep(env); await sweep(env);
        assert.equal(env.provider.submits.length, sub, "no submission after cancel");
        assert.equal((await engine.cancelProject(p._id, CREATOR, env.d)).status, "cancelled", "idempotent");
        const r = await engine.updateBrief(p._id, { title: "Reopened" }, CREATOR, env.d);
        assert.equal(r.title, "Reopened");
      }));

      await dbt("cancel while a submit is in flight does not leave a paid orphan", async () => {
        const env = makeEnv();
        const p = await newScripted(env);
        await engine.approveAndGenerate(p._id, MANAGER, env.d);
        const slow = env.provider.submit.bind(env.provider);
        env.provider.submit = async (req) => {
          const out = await slow(req);
          await engine.cancelProject(p._id, CREATOR, env.d); // user cancels while the provider call was in flight
          return out;
        };
        await sweep(env, p._id);
        assert.ok(env.provider.cancels.length >= 1, "late job id was cancelled at the provider");
        assert.equal((await engine.getProjectOrThrow(p._id)).status, "cancelled");
      });

      await dbt("reconcile after restart: state is in the DB, a fresh deps/process continues, stale submit lease is requeued", () => runAsCompany("co_recon", async () => {
        await saveUgcSettings({ dailySpendCapUsd: 100, approvalThresholdUsd: 50, maxConcurrentJobs: 2 }, "admin");
        const env = makeEnv();
        env.provider.defaultOutcome = "running";
        const p = await newScripted(env);
        await engine.approveAndGenerate(p._id, MANAGER, env.d);
        await sweep(env, p._id); // submits 2 and "crashes"
        // simulate a crash mid-submit: a job stuck in submitting with an expired lease and no provider id
        const col = await jobsCollection();
        const q = await col.findOne({ projectId: p._id, status: "queued" });
        if (q) await col.updateOne({ _id: q._id }, { $set: { status: "submitting", providerJobId: null, lease: { token: "dead", until: new Date(env.clock.t - 1000) }, attempts: 1 } });
        const env2 = makeEnv(env.llm, env.provider); // brand-new deps = new process
        env2.clock.t = env.clock.t + 120_000;
        env2.blobs = env.blobs;
        env.provider.defaultOutcome = "succeeded";
        for (let i = 0; i < 8; i++) { await sweep(env2); env2.clock.t += 60_000; }
        const done = await engine.getProjectOrThrow(p._id);
        assert.equal(done.status, "ready");
        assert.equal(env.provider.submits.length, p.plan!.scenes.length + 0, "no scene submitted twice (the interrupted one is the only re-submit)");
      }));

      await dbt("approved-but-no-jobs (crash between claim and job creation) is repaired by the sweep, idempotently", async () => {
        const env = makeEnv();
        const p = await newScripted(env);
        await (await projectsCollection()).updateOne({ _id: p._id }, { $set: { status: "approved", updatedAt: new Date(env.clock.t - 120_000) } });
        env.clock.t = Date.now();
        await sweep(env, p._id);
        await sweep(env, p._id);
        const js = await (await jobsCollection()).find({ projectId: p._id }).toArray();
        assert.equal(js.length, p.plan!.scenes.length);
      });

      await dbt("daily spend cap and settings: refuses over-cap, counts reservations, caps at 0 disable", async () => {
        const env = makeEnv();
        const p = await newScripted(env);
        const est = p.estimate!.usd;
        await saveUgcSettings({ dailySpendCapUsd: (await engine.spentTodayUsd(env.d)) + est * 1.5 }, "admin");
        const a = await engine.approveAndGenerate(p._id, MANAGER, env.d);
        assert.equal(a.outcome, "started");
        const p2 = await newScripted(env);
        await mustFail(() => engine.approveAndGenerate(p2._id, MANAGER, env.d), /limit|left of today/);
        assert.equal((await engine.getProjectOrThrow(p2._id)).status, "scripted");
        assert.ok((await engine.spentTodayUsd(env.d)) >= est);
        env.clock.t += 24 * 3600_000; // next IST day: reservations no longer count
        const b = await engine.approveAndGenerate(p2._id, MANAGER, env.d);
        assert.equal(b.outcome, "started");
        await saveUgcSettings({ dailySpendCapUsd: 0 }, "admin");
        const p3 = await newScripted(env);
        await mustFail(() => engine.approveAndGenerate(p3._id, MANAGER, env.d), /0 spend/);
        await saveUgcSettings({ dailySpendCapUsd: 100, enabled: false }, "admin");
        await mustFail(() => newScripted(env), /switched off/);
        await saveUgcSettings({ enabled: true }, "admin");
        const s = await getUgcSettings();
        assert.equal(s.dailySpendCapUsd, 100); assert.equal(s.maxConcurrentJobs, 2);
        const clamp = await saveUgcSettings({ maxConcurrentJobs: 999, dailySpendCapUsd: -5 }, "admin");
        assert.equal(clamp.maxConcurrentJobs, 20); assert.equal(clamp.dailySpendCapUsd, 0);
        await saveUgcSettings({ dailySpendCapUsd: 100, maxConcurrentJobs: 2 }, "admin");
      });

      await dbt("provider not connected: approval fails early with a plain message and no job is created", async () => {
        const env = makeEnv();
        const p = await newScripted(env);
        env.d.getProvider = async () => { throw new ProviderError({ code: "auth", retryable: false, message: "Connect your Google Gemini API key in Settings -> Integrations to create AI videos." }); };
        await mustFail(() => engine.approveAndGenerate(p._id, MANAGER, env.d), /Gemini API key/);
        assert.equal(await (await jobsCollection()).countDocuments({ projectId: p._id }), 0);
      });

      await dbt("consent record for reference photos: both attestations required, stored with who/when/what, no AI images, limit, veo refused", async () => {
        const env = makeEnv();
        const p = await newScripted(env);
        await mustFail(() => engine.addReference(p._id, "photo-1", { hasConsent: true, notPublicFigureOrMinor: false }, CREATOR, env.d), /Confirm both/);
        await mustFail(() => engine.addReference(p._id, "ai-img", { hasConsent: true, notPublicFigureOrMinor: true }, CREATOR, env.d), /not AI images/);
        await mustFail(() => engine.addReference(p._id, "missing", { hasConsent: true, notPublicFigureOrMinor: true }, CREATOR, env.d), /Pick an image/);
        const r = await engine.addReference(p._id, "photo-1", { hasConsent: true, notPublicFigureOrMinor: true }, CREATOR, env.d);
        assert.equal(r.references.length, 1);
        const c = r.references[0].consent;
        assert.equal(c.userId, "creator-1"); assert.equal(c.mediaId, "photo-1"); assert.ok(c.at instanceof Date); assert.match(c.statement, /public figure/);
        await mustFail(() => engine.addReference(p._id, "photo-1", { hasConsent: true, notPublicFigureOrMinor: true }, CREATOR, env.d), /already attached/);
        assert.ok(env.audits.some((a) => /reference photo/.test(a.summary)));
        env.provider.defaultOutcome = "running";
        await engine.approveAndGenerate(p._id, MANAGER, env.d);
        await sweep(env, p._id);
        assert.equal(env.provider.submits[0].referenceImages?.length, 1, "reference photo reaches the provider");
        const rm = await engine.createProject({ styleId: style.id, brief: BRIEF as unknown as Record<string, unknown>, options: { provider: "veo" } }, CREATOR, env.d);
        await mustFail(() => engine.addReference(rm._id, "photo-1", { hasConsent: true, notPublicFigureOrMinor: true }, CREATOR, env.d), /can't use reference photos/);
      });

      await dbt("attach to post: AI metadata intact, caption suffixes per platform, audit; clips-only cannot attach; no-ffmpeg path", async () => {
        const env = makeEnv();
        const p = await newScripted(env);
        await mustFail(() => engine.attachToPost(p._id, "post-1", CREATOR, env.d), /isn't finished/);
        await engine.approveAndGenerate(p._id, MANAGER, env.d);
        for (let i = 0; i < 6; i++) await sweep(env, p._id);
        const out = await engine.attachToPost(p._id, "post-1", CREATOR, env.d);
        assert.deepEqual(env.attached, [{ postId: "post-1", mediaId: out.mediaId }]);
        assert.deepEqual(out.suffixes.map((s) => s.platform), ["instagram", "youtube"]);
        assert.ok(out.suffixes.every((s) => /AI/.test(s.captionSuffix)));
        assert.ok(env.audits.some((a) => a.metadata?.aiGenerated === true && /Attached/.test(a.summary)));
        // a render that lost its AI flag cannot be attached
        const orig = env.d.mediaInfo;
        env.d.mediaInfo = async (id) => { const i = await orig(id); return i ? { ...i, ai: false } : i; };
        await mustFail(() => engine.attachToPost(p._id, "post-2", CREATOR, env.d), /lost its AI-generated flag/);
        env.d.mediaInfo = orig;
        // no ffmpeg: multi-scene gives scene clips only, honestly reported
        const e2 = makeEnv(); e2.hasFfmpeg = false;
        const q = await newScripted(e2);
        await engine.approveAndGenerate(q._id, MANAGER, e2.d);
        for (let i = 0; i < 6; i++) await sweep(e2, q._id);
        const r = await engine.getProjectOrThrow(q._id);
        assert.equal(r.status, "ready");
        if (q.plan!.scenes.length > 1) {
          assert.equal(r.render?.strategy, "clips-only"); assert.equal(r.render?.mediaId, null); assert.match(r.error ?? "", /ffmpeg/);
          await mustFail(() => engine.attachToPost(q._id, "post-1", CREATOR, e2.d), /separate scene clips/);
        }
        assert.equal(Object.keys(r.sceneMedia).length, q.plan!.scenes.length);
      });

      await dbt("resume after an assembly failure re-runs only the assembly (no new provider spend)", async () => {
        const env = makeEnv();
        const orig = env.d.ffmpeg;
        env.d.ffmpeg = async () => async () => { throw new Error("ffmpeg exploded"); };
        const p = await newScripted(env);
        await engine.approveAndGenerate(p._id, MANAGER, env.d);
        for (let i = 0; i < 6; i++) await sweep(env, p._id);
        const f = await engine.getProjectOrThrow(p._id);
        assert.equal(f.status, "failed"); assert.match(f.error ?? "", /Putting the scenes together failed/);
        const subs = env.provider.submits.length;
        env.d.ffmpeg = orig;
        await engine.resumeProject(p._id, CREATOR, env.d);
        for (let i = 0; i < 3; i++) await sweep(env, p._id);
        assert.equal((await engine.getProjectOrThrow(p._id)).status, "ready");
        assert.equal(env.provider.submits.length, subs);
      });

      await dbt("delete is refused while generating; soft delete hides it from the list", async () => {
        const env = makeEnv();
        env.provider.defaultOutcome = "running";
        const p = await newScripted(env);
        await engine.approveAndGenerate(p._id, MANAGER, env.d);
        await mustFail(() => engine.deleteProject(p._id, CREATOR, env.d), /Cancel the video/);
        await engine.cancelProject(p._id, CREATOR, env.d);
        await engine.deleteProject(p._id, CREATOR, env.d);
        assert.ok(!(await engine.listProjectDocs()).some((x) => x._id === p._id));
      });

      await dbt("a long-running job times out, is cancelled at the provider and retried", async () => {
        const env = makeEnv();
        env.provider.defaultOutcome = "running";
        const p = await newScripted(env);
        await engine.approveAndGenerate(p._id, MANAGER, env.d);
        await sweep(env, p._id);
        env.clock.t += 26 * 60_000;
        const r = await sweep(env, p._id);
        assert.ok(r.retried >= 1 && env.provider.cancels.length >= 1);
      });
    });

    // ── tenancy ──
    await t("tenancy: company B sees none of company A's projects, jobs or settings, and cannot act on them", async () => {
      const env = makeEnv();
      const a = await runAsCompany("co_a", async () => newScripted(env));
      await runAsCompany("co_b", async () => {
        assert.equal((await engine.listProjectDocs()).length, 0);
        await assert.rejects(() => engine.getProjectOrThrow(a._id));
        await assert.rejects(() => engine.approveAndGenerate(a._id, MANAGER, env.d));
        await assert.rejects(() => engine.cancelProject(a._id, MANAGER, env.d));
        assert.equal(await (await jobsCollection()).countDocuments({}), 0);
        assert.equal((await getUgcSettings()).dailySpendCapUsd, 25, "B has its own default settings");
        assert.equal(await engine.spentTodayUsd(env.d), 0);
        const mine = await newScripted(env);
        assert.equal((await engine.listProjectDocs()).length, 1);
        assert.notEqual(mine._id, a._id);
      });
      await runAsCompany("co_a", async () => {
        assert.ok((await engine.listProjectDocs()).some((x) => x._id === a._id));
        assert.ok(!(await engine.listProjectDocs()).some((x) => x.title === "other"));
      });
    });

    // ── style samples ──
    await t("sample: pure keying, duration, brief and plan for all styles pass policy and validation", () => {
      assert.equal(sanitizeSeed("preview-2"), "preview-2");
      assert.equal(sanitizeSeed("../x y"), "preview-1");
      assert.equal(sampleDurationSecs(OMNI_CAPABILITIES), 4);
      assert.equal(sampleDurationSecs(VEO_CAPABILITIES), 4);
      for (const st of listStyles()) {
        const v = pickVariation(st, "preview-1");
        assert.equal(sampleKeyFor(st.id, v), sampleKeyFor(st.id, pickVariation(st, "preview-1")), "stable key");
        const plan = buildSamplePlan(st, v, OMNI_CAPABILITIES);
        const pol = policyCheck(plan.productBrief, plan, { illustrativeStyle: st.illustrative });
        assert.ok(pol.ok, `${st.id}: ${pol.blocked.map((f) => f.code)}`);
        assert.deepEqual(pol.flagged, [], `${st.id} flagged ${pol.flagged.map((f) => f.code)}`);
        const val = validatePlan(plan, { caps: OMNI_CAPABILITIES, maxActors: st.actorCount, briefFacts: [sampleBrief(st).name, sampleBrief(st).description] });
        assert.ok(val.ok, `${st.id}: ${val.errors}`);
        assert.equal(plan.scenes.length, 1);
        assert.ok(!/\d/.test(plan.scenes[0].dialogue.map((l) => l.text).join("")), "no numbers spoken");
      }
      const a = listStyles()[0];
      assert.notEqual(sampleKeyFor(a.id, pickVariation(a, "preview-1")), sampleKeyFor(a.id, pickVariation(a, "preview-2")));
    });
    await t("offer styles: validatePlan refuses an offer style whose brief has no offer details", () => {
      const st = getStyle("offer-flat-discount")!;
      const plan = buildSamplePlan(st, pickVariation(st, "preview-1"), OMNI_CAPABILITIES);
      const bad = validatePlan(plan, { caps: OMNI_CAPABILITIES, maxActors: st.actorCount, offerStyle: st });
      assert.equal(bad.ok, false);
      assert.ok(bad.errors.some((e) => /Add the offer details/.test(e)), `message: ${bad.errors}`);
      // A sample (no offerStyle passed) is unaffected, and a non-offer style never asks for an offer.
      assert.ok(validatePlan(plan, { caps: OMNI_CAPABILITIES, maxActors: st.actorCount }).ok);
      const plain = getStyle("cosy-floor-chat")!;
      assert.ok(validatePlan(buildSamplePlan(plain, pickVariation(plain, "preview-1"), OMNI_CAPABILITIES), { caps: OMNI_CAPABILITIES, maxActors: plain.actorCount, offerStyle: plain }).ok);
      const withOffer = { ...plan, productBrief: { ...plan.productBrief, offer: { details: "Flat 20 off", validity: "until 30 Nov" } } };
      const stillBad = validatePlan(withOffer, { caps: OMNI_CAPABILITIES, maxActors: st.actorCount, offerStyle: st });
      assert.ok(stillBad.errors.some((e) => /exactly as written in the brief/.test(e)), "figures must be on screen");
    });
    await dbt("sample: needs an exact cost confirmation; creates nothing without it", async () => {
      const env = makeEnv();
      const st = listStyles()[0];
      const q = await sampleEngine.sampleQuote(st.id, "preview-1", CREATOR, env.d);
      assert.equal(q.estimateUsd, 0.4);
      assert.equal(q.blocker, null);
      await mustFail(() => sampleEngine.requestSample(st.id, "preview-1", CREATOR, env.d, {}), /Confirm the cost/);
      await mustFail(() => sampleEngine.requestSample(st.id, "preview-1", CREATOR, env.d, { confirmUsd: 0.1 }), /Confirm the cost/);
      assert.equal((await sampleEngine.listSamples()).length, 0);
      assert.equal(env.provider.submits.length, 0);
    });
    await dbt("sample: generates once, is labelled, reused, never listed as a video, replace and delete work", async () => {
      const env = makeEnv();
      const st = listStyles()[0];
      const r = await sampleEngine.requestSample(st.id, "preview-1", CREATOR, env.d, { confirmUsd: 0.4 });
      assert.equal(r.outcome, "started");
      assert.equal((await engine.listProjectDocs()).length, 0, "samples are not in the video list");
      assert.equal(env.provider.submits.length, 0, "nothing is sent before the sweep");
      const again = await sampleEngine.requestSample(st.id, "preview-1", CREATOR, env.d, { confirmUsd: 0.4 });
      assert.equal(again.outcome, "in_progress");
      for (let i = 0; i < 4; i++) await sweep(env);
      assert.equal(env.provider.submits.length, 1);
      assert.equal(env.provider.submits[0].durationSecs, 4);
      let list = await sampleEngine.listSamples();
      assert.equal(list.length, 1);
      assert.equal(list[0].status, "ready");
      assert.ok(list[0].mediaId);
      const reuse = await sampleEngine.requestSample(st.id, "preview-1", CREATOR, env.d, { confirmUsd: 0.4 });
      assert.equal(reuse.outcome, "exists");
      await sweep(env);
      assert.equal(env.provider.submits.length, 1, "no regeneration without replace");
      const other = await sampleEngine.requestSample(st.id, "preview-2", CREATOR, env.d, { confirmUsd: 0.4 });
      assert.equal(other.outcome, "started", "another look is another sample");
      for (let i = 0; i < 4; i++) await sweep(env);
      const old = list[0];
      const rep = await sampleEngine.requestSample(st.id, "preview-1", CREATOR, env.d, { confirmUsd: 0.4, replace: true });
      assert.equal(rep.outcome, "started");
      for (let i = 0; i < 4; i++) await sweep(env);
      list = await sampleEngine.listSamples();
      assert.equal(list.length, 2);
      assert.notEqual(list.find((x) => x.key === old.key)!.projectId, old.projectId);
      await sampleEngine.deleteSample(old.key, CREATOR, env.d);
      assert.equal((await sampleEngine.listSamples()).length, 1);
      await mustFail(() => sampleEngine.deleteSample(old.key, CREATOR, env.d), /no longer exists/);
    });
    await dbt("sample: two simultaneous requests make one clip", async () => {
      const env = makeEnv();
      const st = listStyles()[1];
      const rs = await Promise.all([1, 2, 3].map(() => sampleEngine.requestSample(st.id, "preview-1", CREATOR, env.d, { confirmUsd: 0.4 })));
      assert.equal(rs.filter((x) => x.outcome === "started").length, 1);
      for (let i = 0; i < 4; i++) await sweep(env);
      assert.equal(env.provider.submits.length, 1);
    });
    await dbt("sample: daily cap, missing connection and manager threshold are respected", async () => {
      const env = makeEnv();
      const st = listStyles()[2];
      await saveUgcSettings({ dailySpendCapUsd: 0.2 }, "admin");
      assert.match((await sampleEngine.sampleQuote(st.id, "preview-1", CREATOR, env.d)).blocker ?? "", /only \$0\.20 is left/);
      await mustFail(() => sampleEngine.requestSample(st.id, "preview-1", CREATOR, env.d, { confirmUsd: 0.4 }), /left of today/);
      assert.equal((await sampleEngine.listSamples()).length, 0, "a refused request leaves nothing behind");
      await saveUgcSettings({ dailySpendCapUsd: 100, approvalThresholdUsd: 0.3 }, "admin");
      const q = await sampleEngine.sampleQuote(st.id, "preview-1", CREATOR, env.d);
      assert.equal(q.needsManager, true);
      const pend = await sampleEngine.requestSample(st.id, "preview-1", CREATOR, env.d, { confirmUsd: 0.4 });
      assert.equal(pend.outcome, "needs_manager");
      assert.equal((await sampleEngine.listSamples())[0].status, "pending_approval");
      await sweep(env);
      assert.equal(env.provider.submits.length, 0, "nothing runs before approval");
      const ok = await sampleEngine.requestSample(st.id, "preview-1", MANAGER, env.d, { confirmUsd: 0.4 });
      assert.equal(ok.outcome, "started");
      assert.equal((await sampleEngine.listSamples()).length, 1, "the pending request was reused, not duplicated");
      const env2 = makeEnv();
      env2.d.getProvider = async () => { throw new ProviderError({ code: "auth", retryable: false, message: "Connect your Google Gemini API key in Settings -> Integrations to create AI videos." }); };
      const q2 = await sampleEngine.sampleQuote(listStyles()[3].id, "preview-1", CREATOR, env2.d);
      assert.equal(q2.connected, false);
      assert.match(q2.blocker ?? "", /Connect your Google Gemini/);
      await mustFail(() => sampleEngine.requestSample(listStyles()[3].id, "preview-1", CREATOR, env2.d, { confirmUsd: 0.4 }), /Connect your Google Gemini/);
      assert.equal((await sampleEngine.listSamples()).filter((x) => x.styleId === listStyles()[3].id).length, 0);
    });
    await t("sample: tenancy - another company sees none and can make its own", async () => {
      const env = makeEnv();
      const st = listStyles()[4];
      await runAsCompany("co_s_a", async () => {
        await saveUgcSettings({ dailySpendCapUsd: 100, approvalThresholdUsd: 50 }, "admin");
        await sampleEngine.requestSample(st.id, "preview-1", CREATOR, env.d, { confirmUsd: 0.4 });
        assert.equal((await sampleEngine.listSamples()).length, 1);
      });
      await runAsCompany("co_s_b", async () => {
        await saveUgcSettings({ dailySpendCapUsd: 100, approvalThresholdUsd: 50 }, "admin");
        assert.equal((await sampleEngine.listSamples()).length, 0);
        assert.equal((await sampleEngine.sampleQuote(st.id, "preview-1", CREATOR, env.d)).existing, null);
        await mustFail(() => sampleEngine.deleteSample(sampleKeyFor(st.id, pickVariation(st, "preview-1")), CREATOR, env.d), /no longer exists/);
        const r = await sampleEngine.requestSample(st.id, "preview-1", CREATOR, env.d, { confirmUsd: 0.4 });
        assert.equal(r.outcome, "started");
      });
    });
  } finally {
    const client = await MongoClient.connect(uri);
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
