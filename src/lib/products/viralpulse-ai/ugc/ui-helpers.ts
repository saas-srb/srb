import { validatePlan } from "./validate";
import { getStyle } from "./styles/catalogue";
import { offerProblems } from "./offer";
import { policyCheck, type PlatformDisclosure } from "./policy";
import { capabilitiesFor } from "./pricing";
import { estimateSpeakingSecs, LEAD_IN_SECS, maxWordsForDuration, countWords } from "./styles/language";
import { ACTOR_ARCHETYPES, SETTINGS, type ActorArchetype } from "./styles/pools";
import { pickVariation } from "./styles/variation";
import { briefFacts } from "./script";
import type { ProviderCapabilities } from "./providers/types";
import type { Platform, UgcStyle, Variation, VariationActor, VariationPart } from "./styles/types";
import type { PolicyFinding, ProductBrief, ProjectStatus, ProviderId, SceneJobStatus, ScenePlan, UgcScene } from "./types";

/**
 * Pure helpers behind the AI UGC Studio screens (no React, no server imports), so the rules that matter - what the wizard allows, what the
 * estimate and the approval state say, how a project's status reads, when polling stops - are tested without a browser.
 */

// ── status mapping ─────────────────────────────────────────────────────

export type ListTab = "draft" | "generating" | "ready" | "failed";
export const LIST_TABS: { key: ListTab; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "generating", label: "Generating" },
  { key: "ready", label: "Ready" },
  { key: "failed", label: "Failed" },
];

export function tabOfStatus(s: ProjectStatus): ListTab {
  if (s === "draft" || s === "scripted") return "draft";
  if (s === "approved" || s === "generating") return "generating";
  if (s === "ready") return "ready";
  return "failed"; // failed and cancelled: both need a person to act
}

export function parseTab(v: string | null | undefined): ListTab | "all" {
  return LIST_TABS.some((t) => t.key === v) ? (v as ListTab) : "all";
}

export function countsByTab(counts: Partial<Record<ProjectStatus, number>>): Record<ListTab, number> {
  const out: Record<ListTab, number> = { draft: 0, generating: 0, ready: 0, failed: 0 };
  for (const [s, n] of Object.entries(counts) as [ProjectStatus, number][]) out[tabOfStatus(s)] += n;
  return out;
}

export type Tone = "neutral" | "info" | "warn" | "ok" | "bad";

export function statusMeta(status: ProjectStatus, pendingApproval = false): { label: string; tone: Tone; busy: boolean } {
  switch (status) {
    case "draft": return { label: "Draft", tone: "neutral", busy: false };
    case "scripted": return pendingApproval ? { label: "Waiting for a manager", tone: "warn", busy: false } : { label: "Script ready", tone: "info", busy: false };
    case "approved": return { label: "Starting", tone: "info", busy: true };
    case "generating": return { label: "Generating", tone: "info", busy: true };
    case "ready": return { label: "Ready", tone: "ok", busy: false };
    case "failed": return { label: "Failed", tone: "bad", busy: false };
    case "cancelled": return { label: "Cancelled", tone: "neutral", busy: false };
  }
}

export function jobMeta(status: SceneJobStatus | "none", retrying = false): { label: string; tone: Tone; busy: boolean } {
  switch (status) {
    case "queued": return retrying ? { label: "Retrying", tone: "warn", busy: true } : { label: "Queued", tone: "neutral", busy: true };
    case "submitting": return { label: "Sending", tone: "info", busy: true };
    case "running": return { label: "Rendering", tone: "info", busy: true };
    case "succeeded": return { label: "Done", tone: "ok", busy: false };
    case "failed": return { label: "Failed", tone: "bad", busy: false };
    case "cancelled": return { label: "Cancelled", tone: "neutral", busy: false };
    default: return { label: "Waiting", tone: "neutral", busy: false };
  }
}

export interface JobLike {
  sceneIndex: number;
  status: SceneJobStatus;
  attempts: number;
  mediaId: string | null;
}

export function progressOf(jobs: JobLike[], sceneCount: number): { total: number; done: number; failed: number; active: number; pct: number } {
  const total = Math.max(sceneCount, 0);
  const done = jobs.filter((j) => j.status === "succeeded").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  const active = jobs.filter((j) => j.status === "queued" || j.status === "submitting" || j.status === "running").length;
  return { total, done, failed, active, pct: total ? Math.round((done / total) * 100) : 0 };
}

// ── polling ────────────────────────────────────────────────────────────

export const POLL = { baseMs: 4000, maxMs: 30000, maxErrors: 6 } as const;

export const isActiveStatus = (s: ProjectStatus) => s === "approved" || s === "generating";

/** Poll only while the video is being made, the tab is visible, and the server has not failed repeatedly. */
export function pollDecision(i: { status: ProjectStatus; hidden: boolean; consecutiveErrors: number }): { poll: boolean; reason: "active" | "finished" | "hidden" | "errors" } {
  if (!isActiveStatus(i.status)) return { poll: false, reason: "finished" };
  if (i.consecutiveErrors >= POLL.maxErrors) return { poll: false, reason: "errors" };
  if (i.hidden) return { poll: false, reason: "hidden" };
  return { poll: true, reason: "active" };
}

/** 4 s while healthy, doubling after each failed refresh up to 30 s. */
export function nextPollDelay(consecutiveErrors: number): number {
  return Math.min(POLL.baseMs * 2 ** Math.max(0, consecutiveErrors), POLL.maxMs);
}

// ── estimate and approval display ──────────────────────────────────────

export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  if (n > 0 && n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

export function formatSecs(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface ApprovalInput {
  estimateUsd: number;
  thresholdUsd: number;
  dailyCapUsd: number;
  spentTodayUsd: number;
  /** The viewer may approve spend above the threshold (manager). */
  canApprove: boolean;
  /** A manager has already been asked for this exact estimate. */
  requested: boolean;
}

export type ApprovalState =
  | { kind: "off"; message: string }
  | { kind: "over_cap"; message: string; remainingUsd: number }
  | { kind: "pending"; message: string }
  | { kind: "needs_manager"; message: string }
  | { kind: "ok"; message: string };

/** Mirrors the engine's rules (cap first, then the manager threshold) so the button says what will happen before it is pressed. */
export function approvalState(i: ApprovalInput): ApprovalState {
  const remaining = Math.max(0, Math.round((i.dailyCapUsd - i.spentTodayUsd) * 10000) / 10000);
  if (i.dailyCapUsd <= 0) return { kind: "off", message: "Video generation is set to $0 per day. An admin can raise the daily limit in the Studio settings." };
  if (i.spentTodayUsd + i.estimateUsd > i.dailyCapUsd + 1e-9) {
    return { kind: "over_cap", remainingUsd: remaining, message: `This video costs about ${formatUsd(i.estimateUsd)} but only ${formatUsd(remaining)} is left of today's ${formatUsd(i.dailyCapUsd)} limit. Make it shorter, wait until tomorrow, or ask an admin to raise the limit.` };
  }
  if (i.estimateUsd > i.thresholdUsd && !i.canApprove) {
    if (i.requested) return { kind: "pending", message: `A manager has been asked to approve about ${formatUsd(i.estimateUsd)}. You'll be notified when they decide.` };
    return { kind: "needs_manager", message: `Spend above ${formatUsd(i.thresholdUsd)} needs a manager's approval. Pressing the button asks one.` };
  }
  return { kind: "ok", message: i.estimateUsd > i.thresholdUsd ? `Above ${formatUsd(i.thresholdUsd)}, and you can approve it yourself.` : `Within the ${formatUsd(i.thresholdUsd)} approval limit.` };
}

export function capBar(spentUsd: number, addUsd: number, capUsd: number): { spentPct: number; addPct: number; over: boolean } {
  if (capUsd <= 0) return { spentPct: 0, addPct: 0, over: addUsd > 0 };
  const spentPct = Math.min(100, (spentUsd / capUsd) * 100);
  const addPct = Math.max(0, Math.min(100 - spentPct, (addUsd / capUsd) * 100));
  return { spentPct, addPct, over: spentUsd + addUsd > capUsd + 1e-9 };
}

export function costRows(perScene: { index: number; secs: number; usd: number }[]): { label: string; secs: number; usd: number; share: number }[] {
  const total = perScene.reduce((a, r) => a + r.usd, 0);
  return perScene.map((r) => ({ label: `Scene ${r.index + 1}`, secs: r.secs, usd: r.usd, share: total > 0 ? r.usd / total : 0 }));
}

// ── script editing ─────────────────────────────────────────────────────

export const MAX_SCENES = 12;

export function sceneSpeech(scene: UgcScene, language: string): { words: number; secs: number; maxWords: number; level: "ok" | "tight" | "over" } {
  const texts = [...scene.dialogue.map((l) => l.text), scene.voiceOver ?? ""];
  const words = texts.reduce((a, t) => a + countWords(t), 0);
  const secs = scene.dialogue.reduce((a, l) => a + estimateSpeakingSecs(l.text, l.language || language), 0) + (scene.voiceOver ? estimateSpeakingSecs(scene.voiceOver, language) : 0);
  const maxWords = maxWordsForDuration(scene.durationSecs, language);
  const need = secs + LEAD_IN_SECS;
  const level = secs > 0 && need > scene.durationSecs + 0.5 ? "over" : secs > 0 && need > scene.durationSecs * 0.9 ? "tight" : "ok";
  return { words, secs: Math.round(secs * 10) / 10, maxWords, level };
}

export function reindex(scenes: UgcScene[]): UgcScene[] {
  return scenes.map((s, i) => ({ ...s, index: i }));
}

export function allowedDurationList(caps: ProviderCapabilities): number[] {
  if (caps.allowedDurations.length) return [...caps.allowedDurations];
  const [lo, hi] = caps.promptDurationRange ?? [3, 10];
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

export function addScene(plan: ScenePlan, caps: ProviderCapabilities, max = MAX_SCENES): ScenePlan {
  if (plan.scenes.length >= max) return plan;
  const last = plan.scenes[plan.scenes.length - 1];
  const durations = allowedDurationList(caps);
  const blank: UgcScene = {
    index: plan.scenes.length,
    durationSecs: last && durations.includes(last.durationSecs) ? last.durationSecs : (durations[Math.floor(durations.length / 2)] ?? 6),
    setting: last?.setting ?? "",
    visualPrompt: "",
    cameraNotes: last?.cameraNotes ?? "",
    actorIds: last ? [...last.actorIds] : plan.actors.slice(0, 1).map((a) => a.id),
    dialogue: [],
  };
  return { ...plan, scenes: reindex([...plan.scenes, blank]) };
}

export function removeScene(plan: ScenePlan, index: number): ScenePlan {
  if (plan.scenes.length <= 1) return plan;
  return { ...plan, scenes: reindex(plan.scenes.filter((_, i) => i !== index)) };
}

export function moveScene(plan: ScenePlan, from: number, to: number): ScenePlan {
  if (from === to || from < 0 || to < 0 || from >= plan.scenes.length || to >= plan.scenes.length) return plan;
  const next = [...plan.scenes];
  const [m] = next.splice(from, 1);
  next.splice(to, 0, m as UgcScene);
  return { ...plan, scenes: reindex(next) };
}

export function updateScene(plan: ScenePlan, index: number, patch: Partial<UgcScene>): ScenePlan {
  return { ...plan, scenes: plan.scenes.map((s, i) => (i === index ? { ...s, ...patch } : s)) };
}

export function totalSecs(plan: ScenePlan): number {
  return plan.scenes.reduce((a, s) => a + s.durationSecs, 0);
}

export interface ScriptCheck {
  ok: boolean;
  general: string[];
  byScene: Record<number, string[]>;
  policy: ReturnType<typeof policyCheck>;
}

/** The backend's own validator and content policy, run in the browser for live feedback (the server re-checks on save and again before spend). */
export function checkScript(plan: ScenePlan, style: UgcStyle | null, provider: ProviderId, providedFacts: string[], brief: ProductBrief = plan.productBrief): ScriptCheck {
  const v = validatePlan(plan, { caps: capabilitiesFor(provider), totalRange: style?.durationRange, maxActors: style?.actorCount ?? 3, briefFacts: briefFacts(plan.productBrief, providedFacts), offerStyle: style ?? undefined });
  const general: string[] = [];
  const byScene: Record<number, string[]> = {};
  for (const e of v.errors) {
    const m = /^Scene (\d+):\s*(.*)$/.exec(e);
    if (m) (byScene[Number(m[1]) - 1] ??= []).push(m[2] ?? e);
    else general.push(e);
  }
  const policy = policyCheck(brief, plan, { illustrativeStyle: style?.illustrative });
  return { ok: v.ok, general, byScene, policy };
}

// ── policy in plain language ───────────────────────────────────────────

const FIX: Record<string, string> = {
  public_figure: "Remove the name. The actors are invented adults; describe the kind of person instead.",
  celebrity_likeness: "Remove any wish for a look-alike or sound-alike. Choose an invented actor from the cast step.",
  celebrity_endorsement: "Take out any claim that a famous person uses or backs the product.",
  politics: "Remove political or election wording.",
  minor_sensitive: "Take children out of any medical, money, alcohol or adult context.",
  minor_actor: "Only adults appear in these videos. Remove the child or teenager.",
  impersonation: "Don't speak as a real person, bank, government or body. Speak as an ordinary customer-like character.",
  fake_real_customer: "Don't call it a real review, real customer or true story: the speakers are AI actors. Say what the product does instead.",
  fake_authority: "Remove 'doctor recommended', 'clinically proven' and similar unless you can prove it, and then say so in the brief's own words outside the video.",
  miracle_claim: "Replace results or cure language with what the product is and how it is used.",
  medical_claim: "Don't say a product treats, cures or prevents a condition. Describe how it is used instead.",
  finance_guarantee: "Remove promises of returns or profit.",
  legal_guarantee: "Remove guaranteed legal outcomes.",
  weight_loss: "Use modest, non-guaranteed wording and no before-and-after promises.",
  health_claim: "Keep health words to claims you can back up, copied exactly from your brief.",
  finance_topic: "Check the wording against RBI/SEBI advertising rules and add the required disclaimers in the post.",
  legal_topic: "Check the wording against Bar Council advertising rules.",
  adult: "Remove adult or sexual content.",
  violence: "Remove violence, weapons or self-harm.",
  hate: "Remove wording that targets a group.",
  illegal_products: "This product type can't be promoted here.",
  alcohol_tobacco: "Alcohol, tobacco and betting can't be promoted here.",
  competitor_disparage: "Don't name or criticise other brands.",
  competitor_generic: "Don't say other brands cheat or are fake. Talk about your own product.",
  fake_scarcity: "Keep urgency words only if they are true, and put the real fact in your brief.",
  superlative: "'Best' or 'number one' needs proof. Rephrase, or add the proof to the brief.",
  price_claim: "Make sure prices and discounts match your brief exactly.",
  award_claim: "Keep award and ranking claims only if you can prove them, and put them in your brief.",
  personal_data: "Remove phone numbers, Aadhaar or card numbers.",
  religion_sensitive: "Read the religious or community reference carefully before publishing.",
  child_safety_topic: "Show only adults, and don't make claims about children's health.",
  actor_age: "Set every actor's age range to 18 or over in the cast step.",
};

export function explainFinding(f: PolicyFinding): { title: string; fix: string; blocking: boolean } {
  return { title: f.message, fix: FIX[f.code] ?? (f.severity === "block" ? "Change the wording and check again." : "Check this carefully, then tick it to continue."), blocking: f.severity === "block" };
}

// ── AI disclosure ──────────────────────────────────────────────────────

export function withDisclosure(caption: string, suffix: string): string {
  const base = caption.trimEnd();
  if (!suffix || base.includes(suffix)) return base;
  return base ? `${base}\n\n${suffix}` : suffix;
}

export function suffixFor(platforms: PlatformDisclosure[], platform: string): PlatformDisclosure | null {
  return platforms.find((p) => p.platform === platform) ?? platforms[0] ?? null;
}

// ── wizard ─────────────────────────────────────────────────────────────

export const WIZARD_STEPS = [
  { n: 1, key: "brief", label: "Brief" },
  { n: 2, key: "style", label: "Style" },
  { n: 3, key: "cast", label: "Cast & look" },
  { n: 4, key: "script", label: "Script" },
  { n: 5, key: "review", label: "Review" },
] as const;
export type WizardStep = 1 | 2 | 3 | 4 | 5;

export const PLATFORM_CHOICES = [
  { value: "instagram", label: "Instagram Reels" },
  { value: "youtube", label: "YouTube Shorts" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X (Twitter)" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;

export const GOAL_CHOICES = [
  { value: "awareness", label: "Awareness" },
  { value: "engagement", label: "Engagement" },
  { value: "leads", label: "Leads" },
  { value: "sales", label: "Sales" },
  { value: "installs", label: "App installs" },
  { value: "footfall", label: "Store footfall" },
  { value: "trust", label: "Trust" },
  { value: "education", label: "Education" },
  { value: "retention", label: "Retention" },
] as const;

export const LANGUAGE_CHOICES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "hinglish", label: "Hinglish (Hindi-English mix)" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "bn", label: "Bengali" },
  { value: "mr", label: "Marathi" },
  { value: "gu", label: "Gujarati" },
  { value: "kn", label: "Kannada" },
  { value: "ml", label: "Malayalam" },
  { value: "pa", label: "Punjabi" },
] as const;

export interface WizardState {
  step: WizardStep;
  /** Highest step reached, so the stepper lets people jump back but not skip ahead. */
  reached: WizardStep;
  title: string;
  name: string;
  description: string;
  keyPointsText: string;
  audience: string;
  callToAction: string;
  /** Offer details (only used by offer styles). Shown on screen exactly as written. */
  offerDetails: string;
  offerValidity: string;
  offerCode: string;
  offerTerms: string;
  offerStockLimited: boolean;
  platform: string;
  goal: string;
  industry: string;
  language: string;
  targetSecs: number;
  styleId: string;
  seed: string;
  cast: Variation | null;
  aiLabelOn: boolean;
  aiLabelPos: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  burnCaptions: boolean;
  imageIds: string[];
}

export const EMPTY_WIZARD: WizardState = {
  step: 1, reached: 1, title: "", name: "", description: "", keyPointsText: "", audience: "", callToAction: "", offerDetails: "", offerValidity: "", offerCode: "", offerTerms: "", offerStockLimited: false, platform: "instagram", goal: "awareness",
  industry: "", language: "en", targetSecs: 30, styleId: "", seed: "", cast: null, aiLabelOn: true, aiLabelPos: "top-right", burnCaptions: true, imageIds: [],
};

export function parseKeyPoints(text: string): string[] {
  return text.split("\n").map((l) => l.trim().slice(0, 240)).filter(Boolean).slice(0, 10);
}

export type WizardAction =
  | { type: "set"; patch: Partial<WizardState> }
  | { type: "goto"; step: WizardStep }
  | { type: "selectStyle"; style: UgcStyle; seed: string }
  | { type: "surprise"; style: UgcStyle; seed: string }
  | { type: "reroll"; style: UgcStyle; seed: string; change: VariationPart[] }
  | { type: "actor"; index: number; patch: Partial<VariationActor> }
  | { type: "castPart"; patch: Partial<Pick<Variation, "setting" | "camera" | "cameraFlavour" | "pacing" | "ambience">> }
  | { type: "load"; state: WizardState };

export function clampSecs(style: UgcStyle | null, secs: number): number {
  const n = Math.round(Number(secs) || 0);
  if (!style) return Math.min(60, Math.max(15, n || 30));
  return Math.min(style.durationRange[1], Math.max(style.durationRange[0], n || style.durationRange[0]));
}

const stepOf = (n: number): WizardStep => Math.min(5, Math.max(1, n)) as WizardStep;

export function wizardReducer(s: WizardState, a: WizardAction): WizardState {
  switch (a.type) {
    case "set":
      return { ...s, ...a.patch };
    case "goto":
      // Never past the furthest step already reached: validation gates moving forward (see `canLeave`).
      return { ...s, step: stepOf(Math.min(a.step, s.reached)), reached: s.reached };
    case "selectStyle": {
      if (s.styleId === a.style.id) return s;
      const cast = pickVariation(a.style, a.seed);
      return { ...s, styleId: a.style.id, seed: a.seed, cast, targetSecs: clampSecs(a.style, s.targetSecs) };
    }
    case "surprise":
      return { ...s, seed: a.seed, cast: pickVariation(a.style, a.seed) };
    case "reroll": {
      if (!s.cast) return { ...s, seed: a.seed, cast: pickVariation(a.style, a.seed) };
      return { ...s, seed: a.seed, cast: pickVariation(a.style, a.seed, { keep: s.cast, change: a.change }) };
    }
    case "actor": {
      if (!s.cast) return s;
      return { ...s, cast: { ...s.cast, actors: uniqueLabels(s.cast.actors.map((x, i) => (i === a.index ? { ...x, ...a.patch } : x))) } };
    }
    case "castPart":
      return s.cast ? { ...s, cast: { ...s.cast, ...a.patch } } : s;
    case "load":
      return a.state;
  }
}

/** Moves to `step` only when the steps before it are valid. Returns the state unchanged (with the reason) when not. */
export function advance(s: WizardState, to: WizardStep, scriptReady: boolean): { state: WizardState; blocked: string | null } {
  if (to <= s.step) return { state: { ...s, step: to }, blocked: null };
  for (let n = s.step; n < to; n++) {
    const errs = validateStep(s, stepOf(n), scriptReady);
    const first = Object.values(errs)[0];
    if (first) return { state: s, blocked: first };
  }
  return { state: { ...s, step: to, reached: stepOf(Math.max(s.reached, to)) }, blocked: null };
}

export function validateStep(s: WizardState, step: WizardStep, scriptReady = false): Record<string, string> {
  const e: Record<string, string> = {};
  if (step === 1) {
    if (!s.name.trim()) e.name = "Enter the product or business name.";
    if (s.description.trim().length < 10) e.description = "Describe it in a sentence or two. The video can only mention what you write here.";
    if (s.description.length > 1500) e.description = "Keep the description under 1,500 characters.";
    if (s.keyPointsText.split("\n").filter((l) => l.trim()).length > 10) e.keyPoints = "Ten key points at most.";
    if (s.keyPointsText.split("\n").some((l) => l.trim().length > 240)) e.keyPoints = "Each key point can be up to 240 characters.";
    if (!s.language) e.language = "Choose the language people will speak.";
    if (!(s.targetSecs >= 15 && s.targetSecs <= 60)) e.targetSecs = "Choose a length between 15 and 60 seconds.";
  }
  if (step === 2 && !s.styleId) e.styleId = "Pick a style to continue.";
  if (step === 2 && s.styleId) {
    const problem = offerProblems(offerBrief(s), getStyle(s.styleId) ?? {});
    if (problem[0]) e.styleId = `${problem[0]} Go back to step 1 and fill in the offer section.`;
  }
  if (step === 3) {
    if (!s.cast) e.cast = "Choose the cast and look.";
    else if (s.cast.actors.some((a) => !a.ageRange || (Number(/\d+/.exec(a.ageRange)?.[0]) || 0) < 18)) e.cast = "Every actor must be an adult (18 or over).";
  }
  if (step === 4 && !scriptReady) e.script = "Write the script and fix anything marked in red.";
  return e;
}

/** The brief as far as offer rules care (name and description are not needed for them). */
export function offerBrief(s: WizardState): ProductBrief {
  return { name: s.name, description: s.description, keyPoints: [], ...(s.offerDetails.trim() ? { offer: { details: s.offerDetails.trim(), ...(s.offerValidity.trim() ? { validity: s.offerValidity.trim() } : {}), ...(s.offerCode.trim() ? { code: s.offerCode.trim() } : {}), ...(s.offerTerms.trim() ? { terms: s.offerTerms.trim() } : {}), ...(s.offerStockLimited ? { stockLimited: true } : {}) } } : {}) };
}

export function briefPayload(s: WizardState) {
  return {
    title: s.title.trim() || s.name.trim(),
    brief: { name: s.name.trim(), description: s.description.trim(), keyPoints: parseKeyPoints(s.keyPointsText), audience: s.audience.trim(), callToAction: s.callToAction.trim(), ...(offerBrief(s).offer ? { offer: offerBrief(s).offer } : {}) },
    options: { language: s.language, targetSecs: s.targetSecs, aiLabel: { enabled: s.aiLabelOn, position: s.aiLabelPos }, burnCaptions: s.burnCaptions },
  };
}

export const DRAFT_VERSION = 1;

/** What goes into the browser's autosave before a project exists (never any media or secrets). */
export function serializeDraft(s: WizardState): string {
  return JSON.stringify({ v: DRAFT_VERSION, s });
}

export function restoreDraft(raw: string | null): WizardState | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { v?: number; s?: Partial<WizardState> };
    if (p.v !== DRAFT_VERSION || !p.s || typeof p.s !== "object") return null;
    const m = { ...EMPTY_WIZARD, ...p.s };
    for (const k of ["title", "name", "description", "keyPointsText", "audience", "callToAction", "offerDetails", "offerValidity", "offerCode", "offerTerms", "platform", "goal", "industry", "language", "styleId", "seed"] as const) if (typeof m[k] !== "string") m[k] = EMPTY_WIZARD[k];
    m.offerStockLimited = m.offerStockLimited === true;
    m.step = stepOf(Number(m.step) || 1);
    m.reached = stepOf(Math.max(Number(m.reached) || 1, m.step));
    m.imageIds = Array.isArray(m.imageIds) ? m.imageIds.filter((x) => typeof x === "string").slice(0, 3) : [];
    return m;
  } catch {
    return null;
  }
}

export interface ProjectLike {
  title: string;
  styleId: string;
  status: ProjectStatus;
  brief: ProductBrief;
  options: { language: string; targetSecs: number; aiLabel: { enabled: boolean; position: WizardState["aiLabelPos"] }; burnCaptions: boolean };
  cast: Variation | null;
  plan: ScenePlan | null;
  pendingApproval: unknown;
}

/** The wizard as it should look when someone comes back to a saved draft: on the furthest step their work supports. */
export function wizardFromProject(p: ProjectLike, meta: { platform?: string; goal?: string; industry?: string; imageIds?: string[] } = {}): WizardState {
  const resume: WizardStep = p.plan ? (p.pendingApproval ? 5 : 4) : p.cast ? 3 : 2;
  return {
    ...EMPTY_WIZARD,
    step: resume,
    reached: p.plan ? 5 : resume,
    title: p.title === p.brief.name ? "" : p.title,
    name: p.brief.name,
    description: p.brief.description,
    keyPointsText: p.brief.keyPoints.join("\n"),
    audience: p.brief.audience ?? "",
    callToAction: p.brief.callToAction ?? "",
    offerDetails: p.brief.offer?.details ?? "",
    offerValidity: p.brief.offer?.validity ?? "",
    offerCode: p.brief.offer?.code ?? "",
    offerTerms: p.brief.offer?.terms ?? "",
    offerStockLimited: p.brief.offer?.stockLimited === true,
    platform: meta.platform || EMPTY_WIZARD.platform,
    goal: meta.goal || EMPTY_WIZARD.goal,
    industry: meta.industry ?? "",
    language: p.options.language,
    targetSecs: p.options.targetSecs,
    styleId: p.styleId,
    seed: p.cast?.seed ?? "",
    cast: p.cast,
    aiLabelOn: p.options.aiLabel.enabled,
    aiLabelPos: p.options.aiLabel.position,
    burnCaptions: p.options.burnCaptions,
    imageIds: meta.imageIds ?? [],
  };
}

export function hasContent(s: WizardState): boolean {
  return !!(s.name.trim() || s.description.trim() || s.keyPointsText.trim() || s.styleId);
}

// ── cast pickers ───────────────────────────────────────────────────────

const ARCH_NAME: Record<string, string> = {
  "college-woman": "college student", "college-man": "college student", "young-professional-woman": "young professional", "young-professional-man": "young professional",
  "mid-woman": "established", "mid-man": "established", "senior-woman": "senior", "senior-man": "senior",
};

export function archetypeLabel(a: ActorArchetype): string {
  return `${a.gender === "woman" ? "Woman" : "Man"}, ${a.ageRange} (${ARCH_NAME[a.id] ?? a.id.replaceAll("-", " ")})`;
}

export function actorFromArchetype(a: ActorArchetype, prev?: VariationActor): VariationActor {
  return {
    archetypeId: a.id,
    label: `${a.gender === "woman" ? "Woman" : "Man"}, ${a.ageRange}${prev && /\((first|second)\)$/.test(prev.label) ? ` (${/\(first\)$/.test(prev.label) ? "first" : "second"})` : ""}`,
    ageRange: a.ageRange,
    gender: a.gender,
    look: a.look,
    wardrobe: a.wardrobes[0] ?? "",
    personality: a.personalities[0] ?? "",
    accent: a.accents[0] ?? "",
  };
}

/** Two actors with the same label would be indistinguishable in the script: add "(first)" / "(second)" where they collide. */
export function uniqueLabels(actors: VariationActor[]): VariationActor[] {
  const base = (l: string) => l.replace(/ \((?:first|second)\)$/, "");
  return actors.map((a, i) => {
    const b = base(a.label);
    const same = actors.filter((x) => base(x.label) === b);
    if (same.length < 2) return { ...a, label: b };
    return { ...a, label: `${b} (${actors.findIndex((x) => base(x.label) === b) === i ? "first" : "second"})` };
  });
}

export const archetypeById = (id: string) => ACTOR_ARCHETYPES.find((a) => a.id === id);

export function settingChoices(style: UgcStyle) {
  const ids = new Set(style.settingIds);
  const list = SETTINGS.filter((s) => ids.has(s.id));
  return list.length ? list : SETTINGS;
}

export function settingFrom(id: string, pick: { lighting?: string; timeOfDay?: string } = {}): Variation["setting"] | null {
  const d = SETTINGS.find((s) => s.id === id);
  if (!d) return null;
  return { id: d.id, label: d.label, description: d.description, lighting: pick.lighting && d.lighting.includes(pick.lighting) ? pick.lighting : (d.lighting[0] ?? ""), timeOfDay: pick.timeOfDay && d.timeOfDay.includes(pick.timeOfDay) ? pick.timeOfDay : (d.timeOfDay[0] ?? ""), props: d.props.slice(0, 3) };
}

// ── style gallery ──────────────────────────────────────────────────────

export interface StyleFilter {
  q: string;
  category: string;
  industry: string;
  actors: string;
  duration: string;
  /** Optional so older callers keep working. */
  platform?: string;
}

/** Total of the style's own beat template: its natural length. */
export const templateSecs = (s: UgcStyle) => s.beats.reduce((a, b) => a + b.durationSecs, 0);

export const DURATION_BANDS = [
  { value: "bumper", label: "Quick cut (about 20 s)", test: (s: UgcStyle) => templateSecs(s) <= 20 },
  { value: "short", label: "Up to 30 s", test: (s: UgcStyle) => s.durationRange[0] <= 30 },
  { value: "mid", label: "30 to 45 s", test: (s: UgcStyle) => s.durationRange[1] >= 30 && s.durationRange[0] <= 45 },
  { value: "long", label: "45 s or more", test: (s: UgcStyle) => s.durationRange[1] >= 45 },
] as const;

export function filterStyles(styles: UgcStyle[], f: StyleFilter): UgcStyle[] {
  const q = f.q.trim().toLowerCase();
  const band = DURATION_BANDS.find((b) => b.value === f.duration);
  return styles.filter((s) => {
    if (f.category && s.category !== f.category) return false;
    if (f.industry && !s.industries.includes(f.industry) && !s.industries.includes("any")) return false;
    if (f.actors && String(s.actorCount) !== f.actors) return false;
    if (f.platform && !s.platforms.includes(f.platform as Platform)) return false;
    if (band && !band.test(s)) return false;
    if (q && !`${s.label} ${s.description} ${s.category}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function groupByCategory(styles: UgcStyle[]): { category: string; styles: UgcStyle[] }[] {
  const map = new Map<string, UgcStyle[]>();
  for (const s of styles) map.set(s.category, [...(map.get(s.category) ?? []), s]);
  return [...map.entries()].map(([category, list]) => ({ category, styles: list }));
}

export const titleCase = (s: string) => s.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase());

// ── studio settings form ───────────────────────────────────────────────

export interface SettingsForm {
  enabled: boolean;
  dailySpendCapUsd: string;
  approvalThresholdUsd: string;
  /** Empty = the built-in price. */
  pricePerSecUsd: string;
  maxConcurrentJobs: string;
  aiLabelDefault: boolean;
}

export function validateSettings(f: SettingsForm): Record<string, string> {
  const e: Record<string, string> = {};
  const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
  const cap = num(f.dailySpendCapUsd);
  if (!(cap >= 0 && cap <= 100000)) e.dailySpendCapUsd = "Enter an amount from 0 to 100,000.";
  const thr = num(f.approvalThresholdUsd);
  if (!(thr >= 0 && thr <= 100000)) e.approvalThresholdUsd = "Enter an amount from 0 to 100,000.";
  if (f.pricePerSecUsd.trim() !== "") {
    const r = num(f.pricePerSecUsd);
    if (!(r >= 0.001 && r <= 20)) e.pricePerSecUsd = "Enter a price from 0.001 to 20, or leave it empty.";
  }
  const c = num(f.maxConcurrentJobs);
  if (!(Number.isInteger(c) && c >= 1 && c <= 20)) e.maxConcurrentJobs = "Enter a whole number from 1 to 20.";
  return e;
}

export function settingsPatch(f: SettingsForm) {
  return {
    enabled: f.enabled,
    dailySpendCapUsd: Number(f.dailySpendCapUsd),
    approvalThresholdUsd: Number(f.approvalThresholdUsd),
    pricePerSecUsd: f.pricePerSecUsd.trim() === "" ? null : Number(f.pricePerSecUsd),
    maxConcurrentJobs: Number(f.maxConcurrentJobs),
    aiLabelDefault: f.aiLabelDefault,
  };
}
