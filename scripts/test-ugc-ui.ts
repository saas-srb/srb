/**
 * AI UGC Studio UI logic: the wizard state machine and validation, the estimate and approval display, status mapping, polling stop rules,
 * script-editing limits, the style gallery filters and the settings form. All pure, no browser, no database, no network.
 *   npx tsx scripts/test-ugc-ui.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addScene, advance, allowedDurationList, approvalState, briefPayload, capBar, checkScript, costRows, countsByTab, DURATION_BANDS, EMPTY_WIZARD, explainFinding, filterStyles, formatSecs, formatUsd,
  groupByCategory, isActiveStatus, jobMeta, LIST_TABS, MAX_SCENES, moveScene, nextPollDelay, parseKeyPoints, parseTab, POLL, pollDecision, progressOf, removeScene, restoreDraft, sceneSpeech, serializeDraft,
  settingsPatch, statusMeta, suffixFor, tabOfStatus, uniqueLabels, validateSettings, validateStep, withDisclosure, wizardFromProject, wizardReducer, clampSecs, actorFromArchetype, settingChoices, settingFrom,
  archetypeById, type WizardState, type WizardAction,
} from "../src/lib/products/viralpulse-ai/ugc/ui-helpers";
import { getStyle, listStyles, pickVariation, suggestStyles, ACTOR_ARCHETYPES } from "../src/lib/products/viralpulse-ai/ugc/styles";
import { composeStoryboard, framingFor, layoutFigures, paletteFor, propGlyphs, roomKindFor, stepMs, previewSeed, fillPlaceholders } from "../src/lib/products/viralpulse-ai/ugc/styles/preview";
import { platformDisclosures } from "../src/lib/products/viralpulse-ai/ugc/policy";
import { OMNI_CAPABILITIES } from "../src/lib/products/viralpulse-ai/ugc/providers/gemini-omni";
import { VEO_CAPABILITIES } from "../src/lib/products/viralpulse-ai/ugc/providers/veo";
import type { ProjectStatus, ScenePlan, SceneJobStatus } from "../src/lib/products/viralpulse-ai/ugc/types";

let pass = 0;
let fail = 0;
const t = (name: string, fn: () => void) => {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    console.log("FAIL", name, "\n   ", e instanceof Error ? e.message.split("\n").slice(0, 6).join("\n    ") : e);
  }
};

const ALL: ProjectStatus[] = ["draft", "scripted", "approved", "generating", "ready", "failed", "cancelled"];
const style = listStyles().find((s) => s.actorCount === 2)!;
const reduce = (s: WizardState, ...a: WizardAction[]) => a.reduce(wizardReducer, s);
const filled: WizardState = { ...EMPTY_WIZARD, name: "Chai Corner", description: "A neighbourhood cafe serving filter coffee.", keyPointsText: "Fresh beans\n\nCakes every morning  \n" };

// ── status mapping ──
t("every project status maps to exactly one list tab; Draft/Generating/Ready/Failed all reachable", () => {
  const tabs = new Set(ALL.map(tabOfStatus));
  assert.deepEqual([...tabs].sort(), ["draft", "failed", "generating", "ready"]);
  assert.equal(tabOfStatus("scripted"), "draft"); assert.equal(tabOfStatus("approved"), "generating"); assert.equal(tabOfStatus("cancelled"), "failed");
  assert.deepEqual(LIST_TABS.map((x) => x.key), ["draft", "generating", "ready", "failed"]);
});
t("tab counts add up and parseTab rejects junk", () => {
  const c = countsByTab({ draft: 2, scripted: 1, approved: 1, generating: 2, ready: 5, failed: 1, cancelled: 3 });
  assert.deepEqual(c, { draft: 3, generating: 3, ready: 5, failed: 4 });
  assert.equal(parseTab("ready"), "ready"); assert.equal(parseTab("nope"), "all"); assert.equal(parseTab(undefined), "all");
});
t("status chips: busy only while work is happening; pending approval is called out", () => {
  for (const s of ALL) { const m = statusMeta(s); assert.ok(m.label && m.tone); assert.equal(m.busy, s === "approved" || s === "generating"); }
  assert.match(statusMeta("scripted", true).label, /manager/i);
  assert.equal(statusMeta("ready").tone, "ok"); assert.equal(statusMeta("failed").tone, "bad");
});
t("job chips cover every job status, retries are visible", () => {
  const js: SceneJobStatus[] = ["queued", "submitting", "running", "succeeded", "failed", "cancelled"];
  for (const j of js) assert.ok(jobMeta(j).label);
  assert.equal(jobMeta("queued", true).label, "Retrying"); assert.equal(jobMeta("queued").label, "Queued"); assert.equal(jobMeta("none").busy, false);
});
t("progress counts finished scenes only", () => {
  const jobs = [{ sceneIndex: 0, status: "succeeded" as const, attempts: 1, mediaId: "m" }, { sceneIndex: 1, status: "running" as const, attempts: 1, mediaId: null }, { sceneIndex: 2, status: "failed" as const, attempts: 3, mediaId: null }];
  assert.deepEqual(progressOf(jobs, 4), { total: 4, done: 1, failed: 1, active: 1, pct: 25 });
  assert.equal(progressOf([], 0).pct, 0);
});

// ── polling ──
t("polling runs only while generating, visible, and the server is answering", () => {
  assert.deepEqual(pollDecision({ status: "generating", hidden: false, consecutiveErrors: 0 }), { poll: true, reason: "active" });
  assert.deepEqual(pollDecision({ status: "approved", hidden: false, consecutiveErrors: 2 }), { poll: true, reason: "active" });
  for (const s of ["draft", "scripted", "ready", "failed", "cancelled"] as ProjectStatus[]) assert.deepEqual(pollDecision({ status: s, hidden: false, consecutiveErrors: 0 }), { poll: false, reason: "finished" });
  assert.deepEqual(pollDecision({ status: "generating", hidden: true, consecutiveErrors: 0 }), { poll: false, reason: "hidden" });
  assert.deepEqual(pollDecision({ status: "generating", hidden: false, consecutiveErrors: POLL.maxErrors }), { poll: false, reason: "errors" });
  assert.ok(isActiveStatus("generating") && !isActiveStatus("ready"));
});
t("poll delay backs off 4s -> 30s and never exceeds the cap", () => {
  assert.equal(nextPollDelay(0), 4000); assert.equal(nextPollDelay(1), 8000); assert.equal(nextPollDelay(2), 16000);
  assert.equal(nextPollDelay(3), 30000); assert.equal(nextPollDelay(50), 30000); assert.equal(nextPollDelay(-3), 4000);
});

// ── estimate and approval ──
t("money and time formatting", () => {
  assert.equal(formatUsd(3.2), "$3.20"); assert.equal(formatUsd(0), "$0.00"); assert.equal(formatUsd(0.004), "<$0.01"); assert.equal(formatUsd(NaN), "$0.00");
  assert.equal(formatSecs(0), "0:00"); assert.equal(formatSecs(24.4), "0:24"); assert.equal(formatSecs(75), "1:15");
});
t("approval state mirrors the engine: cap first, then the manager threshold", () => {
  const base = { estimateUsd: 4, thresholdUsd: 5, dailyCapUsd: 25, spentTodayUsd: 0, canApprove: false, requested: false };
  assert.equal(approvalState(base).kind, "ok");
  assert.equal(approvalState({ ...base, estimateUsd: 6 }).kind, "needs_manager");
  assert.equal(approvalState({ ...base, estimateUsd: 6, requested: true }).kind, "pending");
  assert.equal(approvalState({ ...base, estimateUsd: 6, canApprove: true }).kind, "ok");
  assert.equal(approvalState({ ...base, estimateUsd: 5 }).kind, "ok", "equal to the threshold needs no manager");
  const over = approvalState({ ...base, estimateUsd: 6, spentTodayUsd: 20, canApprove: true });
  assert.equal(over.kind, "over_cap"); assert.match(over.message, /\$5\.00 is left/);
  assert.equal(approvalState({ ...base, dailyCapUsd: 0 }).kind, "off");
  assert.equal(approvalState({ ...base, thresholdUsd: 0 }).kind, "needs_manager", "threshold 0 means every video");
  assert.equal(approvalState({ ...base, estimateUsd: 25 - 1e-12, spentTodayUsd: 0, thresholdUsd: 100 }).kind, "ok");
});
t("cap bar never overflows 100% and flags going over", () => {
  assert.deepEqual(capBar(5, 5, 20), { spentPct: 25, addPct: 25, over: false });
  const o = capBar(18, 5, 20); assert.equal(o.over, true); assert.ok(o.spentPct + o.addPct <= 100);
  assert.deepEqual(capBar(0, 0, 0), { spentPct: 0, addPct: 0, over: false }); assert.equal(capBar(0, 1, 0).over, true);
});
t("per-scene cost rows sum to the total shares", () => {
  const rows = costRows([{ index: 0, secs: 6, usd: 0.6 }, { index: 1, secs: 8, usd: 0.8 }]);
  assert.equal(rows[0].label, "Scene 1"); assert.ok(Math.abs(rows.reduce((a, r) => a + r.share, 0) - 1) < 1e-9);
  assert.equal(costRows([]).length, 0); assert.equal(costRows([{ index: 0, secs: 0, usd: 0 }])[0].share, 0);
});

// ── script editing ──
const plan: ScenePlan = {
  styleId: style.id, title: "t", language: "en", aspect: "9:16", productBrief: { name: "Chai Corner", description: "A cafe serving filter coffee.", keyPoints: ["Fresh beans"] },
  actors: [{ id: "a1", label: "Asha", ageRange: "25-30", gender: "woman", look: "x", wardrobe: "y", personality: "z", voice: { mode: "native" } }, { id: "a2", label: "Ravi", ageRange: "25-30", gender: "man", look: "x", wardrobe: "y", personality: "z", voice: { mode: "native" } }],
  scenes: [
    { index: 0, durationSecs: 6, setting: "cafe", visualPrompt: "chat", cameraNotes: "", actorIds: ["a1", "a2"], dialogue: [{ speakerId: "a1", text: "Try this coffee", language: "en" }] },
    { index: 1, durationSecs: 6, setting: "cafe", visualPrompt: "chat", cameraNotes: "", actorIds: ["a1", "a2"], dialogue: [{ speakerId: "a2", text: "Nice", language: "en" }] },
  ],
};
t("speech meter: fits, tight, over", () => {
  assert.equal(sceneSpeech(plan.scenes[0], "en").level, "ok");
  const long = { ...plan.scenes[0], dialogue: [{ speakerId: "a1", text: Array(40).fill("word").join(" "), language: "en" }] };
  const m = sceneSpeech(long, "en"); assert.equal(m.level, "over"); assert.ok(m.words === 40 && m.maxWords < 40);
  assert.equal(sceneSpeech({ ...plan.scenes[0], dialogue: [] }, "en").level, "ok");
  const tight = { ...plan.scenes[0], durationSecs: 8, dialogue: [{ speakerId: "a1", text: Array(10).fill("word").join(" ") + ".", language: "en" }] };
  assert.ok(["tight", "over", "ok"].includes(sceneSpeech(tight, "en").level));
});
t("scenes: add, remove, move keep indexes 0..n-1 and respect limits", () => {
  let p = addScene(plan, OMNI_CAPABILITIES);
  assert.equal(p.scenes.length, 3); assert.deepEqual(p.scenes.map((s) => s.index), [0, 1, 2]);
  assert.ok(allowedDurationList(OMNI_CAPABILITIES).includes(p.scenes[2].durationSecs));
  assert.ok(allowedDurationList(VEO_CAPABILITIES).includes(addScene(plan, VEO_CAPABILITIES).scenes[2].durationSecs));
  p = moveScene(p, 2, 0); assert.deepEqual(p.scenes.map((s) => s.index), [0, 1, 2]); assert.equal(p.scenes[1].dialogue[0]?.text, "Try this coffee");
  assert.equal(moveScene(p, 0, 9), p); assert.equal(moveScene(p, 1, 1), p);
  p = removeScene(p, 0); assert.equal(p.scenes.length, 2); assert.deepEqual(p.scenes.map((s) => s.index), [0, 1]);
  assert.equal(removeScene(removeScene(p, 0), 0).scenes.length, 1, "the last scene can't be removed");
  let big = plan; for (let i = 0; i < 20; i++) big = addScene(big, OMNI_CAPABILITIES);
  assert.equal(big.scenes.length, MAX_SCENES);
});
t("live script check runs the backend validator and groups errors by scene", () => {
  const ok = checkScript(plan, style, "omni", []);
  const bad = checkScript({ ...plan, scenes: [{ ...plan.scenes[0], visualPrompt: "", dialogue: [{ speakerId: "a1", text: "It costs 499 rupees", language: "en" }] }, plan.scenes[1]] }, style, "omni", []);
  assert.equal(bad.ok, false);
  assert.ok((bad.byScene[0] ?? []).some((e) => /visual description is empty/.test(e)), JSON.stringify(bad.byScene));
  assert.ok((bad.byScene[0] ?? []).some((e) => /"499" is not in the brief/.test(e)));
  assert.ok(!bad.general.some((e) => /^Scene \d/.test(e)));
  assert.equal(typeof ok.policy.ok, "boolean");
  const blocked = checkScript({ ...plan, scenes: [{ ...plan.scenes[0], dialogue: [{ speakerId: "a1", text: "This is a real customer review", language: "en" }] }, plan.scenes[1]] }, style, "omni", []);
  assert.ok(blocked.policy.blocked.some((f) => f.code === "fake_real_customer"));
});
t("every content-policy rule has a plain-language fix", () => {
  const src = readFileSync(new URL("../src/lib/products/viralpulse-ai/ugc/policy.ts", import.meta.url), "utf8");
  const codes = [...src.matchAll(/R\("([a-z_]+)",\s*"(block|flag)"/g)].map((m) => m[1]);
  assert.ok(codes.length >= 25);
  const generic = explainFinding({ code: "zzz", severity: "block", message: "m" }).fix;
  for (const c of [...codes, "actor_age"]) assert.notEqual(explainFinding({ code: c, severity: "block", message: "m" }).fix, generic, `no specific fix text for ${c}`);
  assert.equal(explainFinding({ code: "superlative", severity: "flag", message: "m" }).blocking, false);
});

// ── disclosure ──
t("AI-label caption suffix is added once", () => {
  const d = platformDisclosures("en");
  const s = suffixFor(d, "youtube")!;
  assert.equal(s.platform, "youtube"); assert.equal(suffixFor(d, "tiktok")!.platform, d[0].platform);
  const once = withDisclosure("Great coffee", s.captionSuffix);
  assert.ok(once.endsWith(s.captionSuffix)); assert.equal(withDisclosure(once, s.captionSuffix), once);
  assert.equal(withDisclosure("", s.captionSuffix), s.captionSuffix);
});

// ── wizard ──
t("brief validation: required fields, limits, and only valid briefs can leave step 1", () => {
  assert.deepEqual(Object.keys(validateStep(EMPTY_WIZARD, 1)).sort(), ["description", "name"]);
  assert.deepEqual(validateStep(filled, 1), {});
  assert.ok(validateStep({ ...filled, keyPointsText: Array(11).fill("x").join("\n") }, 1).keyPoints);
  assert.ok(validateStep({ ...filled, keyPointsText: "x".repeat(241) }, 1).keyPoints);
  assert.ok(validateStep({ ...filled, targetSecs: 90 }, 1).targetSecs); assert.ok(validateStep({ ...filled, description: "short" }, 1).description);
  assert.deepEqual(parseKeyPoints("Fresh beans\n\n Cakes every morning  \n"), ["Fresh beans", "Cakes every morning"]);
  assert.equal(parseKeyPoints(Array(30).fill("a").join("\n")).length, 10);
});
t("steps cannot be skipped: advance validates every step it passes", () => {
  assert.ok(advance(EMPTY_WIZARD, 2, false).blocked);
  const a = advance(filled, 2, false); assert.equal(a.blocked, null); assert.equal(a.state.step, 2); assert.equal(a.state.reached, 2);
  assert.match(advance(a.state, 3, false).blocked ?? "", /style/i);
  assert.ok(advance(filled, 4, false).blocked, "can't jump past the style step");
  const picked = reduce(a.state, { type: "selectStyle", style, seed: "s1" });
  assert.equal(advance(picked, 3, false).blocked, null);
  const at4 = { ...picked, step: 4 as const };
  assert.ok(advance(at4, 5, false).blocked, "the script must be ready");
  assert.equal(advance(at4, 5, true).blocked, null);
  assert.equal(advance(at4, 2, false).state.step, 2, "going back is always allowed");
});
t("goto never moves past the furthest step reached", () => {
  const s = { ...filled, step: 2 as const, reached: 2 as const };
  assert.equal(wizardReducer(s, { type: "goto", step: 5 }).step, 2); assert.equal(wizardReducer(s, { type: "goto", step: 1 }).step, 1);
});
t("choosing a style creates a cast; re-choosing the same style keeps edits; a new style resets it", () => {
  const s1 = reduce(filled, { type: "selectStyle", style, seed: "a" });
  assert.equal(s1.cast!.styleId, style.id); assert.equal(s1.cast!.actors.length, style.actorCount);
  const edited = reduce(s1, { type: "actor", index: 0, patch: { wardrobe: "my own jacket" } });
  assert.equal(wizardReducer(edited, { type: "selectStyle", style, seed: "b" }), edited, "same style: unchanged");
  const other = listStyles().find((x) => x.id !== style.id && x.actorCount === 1)!;
  const s2 = wizardReducer(edited, { type: "selectStyle", style: other, seed: "c" });
  assert.equal(s2.cast!.styleId, other.id); assert.equal(s2.cast!.actors.length, 1);
  assert.ok(s2.targetSecs >= other.durationRange[0] && s2.targetSecs <= other.durationRange[1]);
});
t("Surprise me is deterministic per seed; Keep/Change re-rolls only the marked parts", () => {
  const s1 = reduce(filled, { type: "selectStyle", style, seed: "a" });
  const sur = wizardReducer(s1, { type: "surprise", style, seed: "zzz" });
  assert.deepEqual(sur.cast, pickVariation(style, "zzz"));
  const kept = wizardReducer(s1, { type: "reroll", style, seed: "q1", change: ["setting"] });
  assert.deepEqual(kept.cast!.actors, s1.cast!.actors, "people kept"); assert.equal(kept.cast!.camera, s1.cast!.camera); assert.equal(kept.cast!.pacing, s1.cast!.pacing);
  let moved = false;
  for (const seed of ["q1", "q2", "q3", "q4", "q5", "q6"]) if (wizardReducer(s1, { type: "reroll", style, seed, change: ["setting"] }).cast!.setting.id !== s1.cast!.setting.id) moved = true;
  assert.ok(moved, "the place changes for some seed");
  const people = wizardReducer(s1, { type: "reroll", style, seed: "q9", change: ["actors"] });
  assert.equal(people.cast!.setting.id, s1.cast!.setting.id);
});
t("cast edits: archetype swap keeps labels unique, adults only", () => {
  const s1 = reduce(filled, { type: "selectStyle", style, seed: "a" });
  const a = ACTOR_ARCHETYPES[0]; const same = actorFromArchetype(a);
  const s2 = reduce(s1, { type: "actor", index: 0, patch: same }, { type: "actor", index: 1, patch: same });
  const labels = s2.cast!.actors.map((x) => x.label); assert.equal(new Set(labels).size, 2); assert.ok(labels.every((l) => /\((first|second)\)$/.test(l)));
  assert.equal(uniqueLabels([same, { ...same, label: "Man, 30-40" }])[0].label, same.label);
  for (const x of ACTOR_ARCHETYPES) assert.ok(Number(/\d+/.exec(x.ageRange)![0]) >= 18);
  assert.ok(validateStep({ ...s2, cast: { ...s2.cast!, actors: s2.cast!.actors.map((x) => ({ ...x, ageRange: "16-17" })) } }, 3).cast);
  assert.ok(validateStep({ ...s2, cast: null }, 3).cast); assert.deepEqual(validateStep(s2, 3), {});
  assert.equal(archetypeById(a.id)?.id, a.id);
});
t("setting choices come from the style's pool", () => {
  const ch = settingChoices(style); assert.ok(ch.length >= 1 && ch.every((c) => style.settingIds.includes(c.id)));
  const s = settingFrom(ch[0].id)!; assert.equal(s.id, ch[0].id); assert.ok(s.lighting && s.timeOfDay);
  assert.equal(settingFrom("nope"), null);
  assert.equal(settingFrom(ch[0].id, { lighting: "not a real light" })!.lighting, ch[0].lighting[0]);
});
t("length clamps to the style's range", () => {
  assert.equal(clampSecs(style, 1), style.durationRange[0]); assert.equal(clampSecs(style, 999), style.durationRange[1]); assert.equal(clampSecs(null, 5), 15);
});
t("draft autosave round-trips and rejects junk", () => {
  const s = reduce(filled, { type: "selectStyle", style, seed: "a" });
  const back = restoreDraft(serializeDraft({ ...s, step: 3, reached: 3 }))!;
  assert.equal(back.name, "Chai Corner"); assert.equal(back.step, 3); assert.deepEqual(back.cast, s.cast);
  for (const junk of [null, "", "not json", "{}", JSON.stringify({ v: 99, s: {} }), JSON.stringify({ v: 1, s: "x" })]) assert.equal(restoreDraft(junk), null);
  const partial = restoreDraft(JSON.stringify({ v: 1, s: { name: 5, step: 99, imageIds: ["a", 3, "b", "c", "d"] } }))!;
  assert.equal(partial.name, ""); assert.equal(partial.step, 5); assert.deepEqual(partial.imageIds, ["a", "b", "c"]);
});
t("payload sent to the server is trimmed and carries the disclosure options", () => {
  const p = briefPayload({ ...filled, title: "  ", aiLabelOn: false, aiLabelPos: "bottom-left" });
  assert.equal(p.title, "Chai Corner"); assert.deepEqual(p.brief.keyPoints, ["Fresh beans", "Cakes every morning"]);
  assert.deepEqual(p.options.aiLabel, { enabled: false, position: "bottom-left" }); assert.equal(p.options.language, "en");
});
t("returning to a saved project lands on the furthest sensible step", () => {
  const cast = pickVariation(style, "k");
  const base = { title: "Chai Corner", styleId: style.id, status: "draft" as ProjectStatus, brief: { name: "Chai Corner", description: "d".repeat(20), keyPoints: ["a"] }, options: { language: "hinglish", targetSecs: 30, aiLabel: { enabled: true, position: "top-right" as const }, burnCaptions: true }, cast: null, plan: null, pendingApproval: null };
  assert.equal(wizardFromProject(base).step, 2);
  assert.equal(wizardFromProject({ ...base, cast }).step, 3);
  assert.equal(wizardFromProject({ ...base, cast, plan }).step, 4);
  assert.equal(wizardFromProject({ ...base, cast, plan, status: "scripted", pendingApproval: {} }).step, 5);
  const w = wizardFromProject({ ...base, cast }, { platform: "youtube", industry: "food" });
  assert.equal(w.language, "hinglish"); assert.equal(w.platform, "youtube"); assert.equal(w.title, ""); assert.equal(w.keyPointsText, "a");
});

// ── style gallery ──
t("gallery: 43+ styles, grouping and filters", () => {
  const all = listStyles(); assert.ok(all.length >= 43);
  assert.equal(groupByCategory(all).reduce((a, g) => a + g.styles.length, 0), all.length);
  const none = { q: "", category: "", industry: "", actors: "", duration: "" };
  assert.equal(filterStyles(all, none).length, all.length);
  assert.ok(filterStyles(all, { ...none, actors: "2" }).every((s) => s.actorCount === 2));
  const cat = all[0].category; assert.ok(filterStyles(all, { ...none, category: cat }).every((s) => s.category === cat));
  assert.ok(filterStyles(all, { ...none, industry: "food" }).every((s) => s.industries.includes("food") || s.industries.includes("any")));
  assert.equal(filterStyles(all, { ...none, q: "zzzz-no-such-style" }).length, 0);
  for (const b of DURATION_BANDS) assert.ok(filterStyles(all, { ...none, duration: b.value }).every(b.test));
  assert.equal(getStyle(all[0].id)?.id, all[0].id);
  assert.ok(all.length >= 200, "200+ styles");
  for (const pl of ["instagram", "facebook", "youtube", "linkedin", "x"]) {
    const hit = filterStyles(all, { ...none, platform: pl });
    assert.ok(hit.length >= 6 && hit.every((s) => s.platforms.includes(pl as never)), `platform filter ${pl}`);
  }
  assert.ok(filterStyles(all, { ...none, duration: "bumper" }).length > 0, "quick-cut band has styles");
  const sg = suggestStyles({ industry: "restaurant", goal: "footfall", platform: "instagram", language: "hinglish", limit: 6 });
  assert.equal(sg.length, 6); assert.ok(sg.every((x) => x.reasons.length > 0));
});


// ── style storyboard previews (pure scene composition) ──
t("storyboard: every style composes with beats, placeholders only, valid figures, aspect and cast", () => {
  for (const st of listStyles()) {
    const b = composeStoryboard(st, pickVariation(st, previewSeed(1)));
    assert.equal(b.scenes.length, st.beats.length);
    assert.equal(b.aspect, st.aspects[0]);
    assert.equal(b.cast.length, st.actorCount);
    assert.deepEqual(b.scenes.map((x) => x.role), st.beats.map((x) => x.role));
    for (const sc of b.scenes) {
      assert.ok(sc.caption && !/[{}]/.test(sc.caption) && !/[{}]/.test(sc.subtitle), `${st.id} placeholders`);
      assert.ok(/^"\[.+\]"$/.test(sc.subtitle) || sc.role === "hook", `${st.id} subtitle`);
      assert.ok(sc.figures.length <= st.actorCount && sc.figures.every((f) => f.x >= 0 && f.x <= 1 && f.size > 0 && f.size <= 1.3));
      assert.ok(sc.props.length <= 3 && sc.cameraNote.length > 0);
    }
    assert.equal(b.totalSecs, st.beats.reduce((a, x) => a + x.durationSecs, 0));
  }
});
t("storyboard: same seed is identical, another seed changes the look, rooms and light are mapped", () => {
  const st = listStyles()[0];
  const a = composeStoryboard(st, pickVariation(st, previewSeed(1)));
  assert.deepEqual(a, composeStoryboard(st, pickVariation(st, previewSeed(1))));
  const looks = new Set(Array.from({ length: 8 }, (_, i) => JSON.stringify(composeStoryboard(st, pickVariation(st, previewSeed(i + 1))).cast) + composeStoryboard(st, pickVariation(st, previewSeed(i + 1))).room));
  assert.ok(looks.size > 1, "variation re-roll changes cast or room");
  assert.equal(roomKindFor({ id: "gym-floor", label: "Local gym" }), "gym");
  assert.equal(roomKindFor({ id: "x", label: "Some festive hall" }), "festive");
  assert.equal(roomKindFor({ id: "x", label: "Void" }), "generic");
  assert.equal(paletteFor("late night", "dim lamp").dark, true);
  assert.equal(paletteFor("morning", "soft window light").dark, false);
  assert.deepEqual(propGlyphs(["a steaming mug", "a small potted plant", "a steel tea tumbler"]), ["mug", "plant"]);
});
t("storyboard: camera framing, figure layout per actor count, step timing", () => {
  assert.equal(framingFor("front-camera selfie, arm's length", 1), "selfie");
  assert.equal(framingFor("handheld over one friend's shoulder", 2), "over-shoulder");
  assert.equal(framingFor("split-screen of two propped phone frames", 2), "split");
  assert.equal(framingFor("tripod-style static two-shot on the railing", 2), "two-shot");
  assert.equal(framingFor("first-person phone POV with hands visible", 1), "pov");
  assert.equal(framingFor("handheld, slow movement", 3), "two-shot");
  const act = (n: number) => Array.from({ length: n }, (_, i) => ({ archetypeId: `a${i}`, wardrobe: "olive shirt" }));
  assert.equal(layoutFigures("two-shot", "body", act(3)).figures.length, 3);
  const sp = layoutFigures("split", "body", act(2));
  assert.ok(sp.split && sp.figures[0].x < 0.5 && sp.figures[1].x > 0.5);
  const os = layoutFigures("over-shoulder", "body", act(2));
  assert.ok(os.figures[0].back && !os.figures[1].back);
  assert.ok(layoutFigures("selfie", "hook", act(1)).figures[0].size > layoutFigures("selfie", "proof", act(1)).figures[0].size);
  assert.equal(stepMs(1), 2400); assert.equal(stepMs(100), 4200);
  assert.equal(fillPlaceholders("Show {product} for {problem}"), "Show [your product] for [the problem]");
});

// ── settings form ──
t("settings form validates and maps to the save patch", () => {
  const ok = { enabled: true, dailySpendCapUsd: "25", approvalThresholdUsd: "5", pricePerSecUsd: "", maxConcurrentJobs: "3", aiLabelDefault: true };
  assert.deepEqual(validateSettings(ok), {});
  assert.deepEqual(settingsPatch(ok), { enabled: true, dailySpendCapUsd: 25, approvalThresholdUsd: 5, pricePerSecUsd: null, maxConcurrentJobs: 3, aiLabelDefault: true });
  assert.equal(settingsPatch({ ...ok, pricePerSecUsd: "0.08" }).pricePerSecUsd, 0.08);
  assert.ok(validateSettings({ ...ok, dailySpendCapUsd: "" }).dailySpendCapUsd); assert.ok(validateSettings({ ...ok, dailySpendCapUsd: "-1" }).dailySpendCapUsd);
  assert.deepEqual(validateSettings({ ...ok, dailySpendCapUsd: "0", approvalThresholdUsd: "0" }), {}, "zero is allowed: it switches generation off / asks for every approval");
  assert.ok(validateSettings({ ...ok, pricePerSecUsd: "0" }).pricePerSecUsd); assert.ok(validateSettings({ ...ok, pricePerSecUsd: "abc" }).pricePerSecUsd);
  assert.ok(validateSettings({ ...ok, maxConcurrentJobs: "0" }).maxConcurrentJobs); assert.ok(validateSettings({ ...ok, maxConcurrentJobs: "2.5" }).maxConcurrentJobs); assert.ok(validateSettings({ ...ok, maxConcurrentJobs: "21" }).maxConcurrentJobs);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
