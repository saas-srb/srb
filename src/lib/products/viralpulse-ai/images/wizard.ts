import { checkOverlayText, policyCheck, type ImagePolicyResult } from "@/lib/products/viralpulse-ai/images/policy";
import { GOALS, goalById, specByKey, safeBox, type Confidence, type GoalDef, type ImageSpec } from "@/lib/products/viralpulse-ai/images/specs";
import type { Brief } from "@/lib/products/viralpulse-ai/images/types";
import type { ImageQuality } from "@/lib/products/viralpulse-ai/image-pricing-core";

/**
 * Pure helpers behind the Image Studio wizard (no React, no server imports): the steps, the reducer, what each step requires, how
 * the format cards describe a size, and the draft that survives a refresh. Tested without a browser.
 */

export type StepKey = "goal" | "brief" | "brand" | "variants" | "review";
export interface StepDef { key: StepKey; n: number; label: string; hint: string }

export const WIZARD_STEPS: readonly StepDef[] = [
  { key: "goal", n: 1, label: "Goal & format", hint: "Pick what the picture is for. The sizes follow." },
  { key: "brief", n: 2, label: "Brief", hint: "Say what it shows, its look, and the exact words on it." },
  { key: "brand", n: 3, label: "Brand & references", hint: "Apply your brand kit and add reference photos." },
  { key: "variants", n: 4, label: "Variants", hint: "How many options, how good, and which model." },
  { key: "review", n: 5, label: "Review & estimate", hint: "Check the cost and the rules, then approve." },
];
/** Quick generate: the same screens, three of them. */
export const QUICK_STEPS: readonly StepDef[] = [
  { key: "brief", n: 1, label: "Describe it", hint: "Pick a size and say what the picture shows." },
  { key: "variants", n: 2, label: "Options", hint: "How many options, how good, and which model." },
  { key: "review", n: 3, label: "Review & generate", hint: "Check the cost, then generate." },
];

export interface WizardState {
  brief: Brief;
  /** Index into the step list (0-based). */
  step: number;
  /** Furthest step reached. */
  reached: number;
}

export type WizardAction =
  | { type: "set"; patch: Partial<Brief> }
  | { type: "selectGoal"; goalId: string }
  | { type: "goto"; step: number }
  | { type: "load"; state: WizardState }
  | { type: "reset"; brief: Brief };

export interface BlankDefaults { provider: Brief["provider"]; quality: ImageQuality; badge: boolean }

export function blankBrief(d: BlankDefaults, quick = false): Brief {
  const goal = goalById(quick ? "custom" : "organic_post")!;
  return { goalId: goal.id, name: "", subject: "", product: "", style: "", colours: "", overlayText: [""], textPosition: "bottom", language: "English", negative: "", specKeys: [...goal.specKeys], variants: 2, quality: d.quality, provider: d.provider, applyKit: true, referenceIds: [], consent: null, badge: d.badge };
}

export const initialWizard = (brief: Brief, step = 0): WizardState => ({ brief, step, reached: step });

/** Picking another goal swaps in that goal's sizes and keeps what the person already typed. */
export function selectGoal(b: Brief, goalId: string): Brief {
  const g = goalById(goalId);
  if (!g) return b;
  const overlayText = g.slides ? Array.from({ length: g.slides.min }, (_, i) => b.overlayText[i] ?? "") : [b.overlayText[0] ?? ""];
  return { ...b, goalId: g.id, specKeys: [...g.specKeys], overlayText, variants: g.slides ? g.slides.min : Math.min(b.variants, 4) };
}

export function wizardReducer(s: WizardState, a: WizardAction): WizardState {
  switch (a.type) {
    case "set": return { ...s, brief: { ...s.brief, ...a.patch } };
    case "selectGoal": return { ...s, brief: selectGoal(s.brief, a.goalId) };
    case "goto": return { ...s, step: a.step, reached: Math.max(s.reached, a.step) };
    case "load": return a.state;
    case "reset": return initialWizard(a.brief);
  }
}

// ── validation ──────────────────────────────────────────────────────────────

export type Errors = Record<string, string>;
export interface ValidateCtx { maxVariants: number; providers: { openai: boolean; gemini: boolean } }

export function policyOf(b: Brief): ImagePolicyResult {
  return policyCheck({ subject: b.subject, product: b.product, style: b.style, negative: b.negative, overlayText: b.overlayText, goalId: b.goalId, hasReferenceImages: b.referenceIds.length > 0, consent: b.consent });
}

/** What a step still needs. Empty = the step is complete. */
export function validateStep(b: Brief, key: StepKey, ctx: ValidateCtx = { maxVariants: 4, providers: { openai: true, gemini: true } }): Errors {
  const e: Errors = {};
  if (key === "goal") {
    if (!goalById(b.goalId)) e.goalId = "Choose what the picture is for.";
    else if (b.specKeys.filter((k) => specByKey(k)).length === 0) e.specKeys = "Choose at least one output size.";
  }
  if (key === "brief") {
    if (b.subject.trim().length < 8 && b.product.trim().length < 3 && b.referenceIds.length === 0) e.subject = "Describe what the picture shows (at least a few words), or name the product.";
    b.overlayText.forEach((t, i) => { const c = checkOverlayText(t); if (!c.ok) e[`overlay${i}`] = c.message ?? "That text can't go on the picture."; });
    const g = goalById(b.goalId);
    if (g?.slides && b.overlayText.some((t) => !t.trim())) e.overlaySlides = "Write the text for every slide, or remove the empty slides.";
    const p = policyOf(b);
    const own = p.blocked.find((f) => f.code !== "consent_missing" && f.code !== "public_figure_reference");
    if (own) e.policy = own.message;
  }
  if (key === "brand") {
    if (b.referenceIds.length > 0) {
      if (!b.consent) e.consent = "Say whether the reference photos show people.";
      else if (b.consent.publicFigure) e.consent = "A public figure's likeness cannot be used. Remove that photo.";
      else if (b.consent.showsPeople && !b.consent.attested) e.consent = "Confirm that every person in the photos agreed to be used.";
    }
  }
  if (key === "variants") {
    const g = goalById(b.goalId);
    if (!g?.slides && (b.variants < 1 || b.variants > Math.min(ctx.maxVariants, 4))) e.variants = `Choose between 1 and ${Math.min(ctx.maxVariants, 4)} options.`;
    if (!ctx.providers[b.provider]) e.provider = b.provider === "gemini" ? "Google Gemini isn't connected. Choose OpenAI or connect Gemini in Settings." : "OpenAI isn't connected. Choose Gemini or connect OpenAI in Settings.";
  }
  if (key === "review") {
    for (const k of ["goal", "brief", "brand", "variants"] as const) Object.assign(e, validateStep(b, k, ctx));
  }
  return e;
}

export const stepKeysOf = (quick: boolean) => (quick ? QUICK_STEPS : WIZARD_STEPS).map((s) => s.key);

/** Can the person move forward to the step at `to`? Every step before it must be complete. */
export function advance(b: Brief, steps: readonly StepDef[], from: number, to: number, ctx?: ValidateCtx): { blocked: string | null; errors: Errors } {
  if (to <= from) return { blocked: null, errors: {} };
  for (let i = from; i < to; i++) {
    const errs = validateStep(b, steps[i].key, ctx);
    const first = Object.values(errs)[0];
    if (first) return { blocked: first, errors: errs };
  }
  return { blocked: null, errors: {} };
}

/** Where to land when a saved project is opened again: the first step that still needs something, else the review. */
export function resumeStep(b: Brief, steps: readonly StepDef[], ctx?: ValidateCtx): number {
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].key === "review") return i;
    if (Object.keys(validateStep(b, steps[i].key, ctx)).length) return i;
  }
  return steps.length - 1;
}

/** A complete brief can be generated from: the server marks the project "briefed". */
export function briefComplete(b: Brief, ctx?: ValidateCtx): boolean {
  return (["goal", "brief", "brand", "variants"] as const).every((k) => Object.keys(validateStep(b, k, ctx)).length === 0);
}

/** A project worth saving: something beyond the defaults was typed. */
export const hasContent = (b: Brief) => !!(b.subject.trim() || b.product.trim() || b.name.trim() || b.overlayText.some((t) => t.trim()) || b.referenceIds.length);

// ── draft that survives a refresh (before the project exists on the server) ──

export function serializeDraft(s: WizardState): string {
  return JSON.stringify({ v: 1, brief: s.brief, step: s.step, reached: s.reached });
}
export function restoreDraft(raw: string | null | undefined, stepCount: number): WizardState | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as { v?: number; brief?: Brief; step?: number; reached?: number };
    if (d.v !== 1 || !d.brief || typeof d.brief !== "object" || !goalById(d.brief.goalId) || !Array.isArray(d.brief.overlayText) || !Array.isArray(d.brief.specKeys)) return null;
    const step = Math.min(Math.max(Math.floor(Number(d.step) || 0), 0), stepCount - 1);
    return { brief: { ...d.brief, referenceIds: [], consent: null }, step, reached: Math.min(Math.max(Math.floor(Number(d.reached) || 0), step), stepCount - 1) };
  } catch {
    return null;
  }
}

/** The payload the server saves: everything the person typed (the server cleans and clamps it again). */
export const briefPayload = (b: Brief): Record<string, unknown> => ({ ...b });

// ── format cards ────────────────────────────────────────────────────────────

const RATIOS: [number, string][] = [[1, "1:1"], [4 / 5, "4:5"], [9 / 16, "9:16"], [16 / 9, "16:9"], [1.91, "1.91:1"], [4 / 3, "4:3"], [3 / 4, "3:4"]];
/** "4:5", "9:16", "1.91:1"; other shapes as "6:1" style numbers. */
export function ratioLabel(w: number, h: number): string {
  const r = w / h;
  const near = RATIOS.find(([x]) => Math.abs(x / r - 1) < 0.012);
  if (near) return near[1];
  return r >= 1 ? `${(Math.round(r * 10) / 10).toString()}:1` : `1:${(Math.round((1 / r) * 10) / 10).toString()}`;
}

export type SourceTag = "verified" | "partial" | "recheck";
const RANK: Record<Confidence, number> = { official: 0, partial: 1, secondary: 2 };
export function sourceTag(specs: Pick<ImageSpec, "source">[]): SourceTag {
  const worst = specs.reduce((a, s) => Math.max(a, RANK[s.source.confidence]), 0);
  return worst === 0 ? "verified" : worst === 1 ? "partial" : "recheck";
}
export const SOURCE_TAG_LABEL: Record<SourceTag, string> = { verified: "Verified", partial: "Partly verified", recheck: "Re-check for paid ads" };

export interface FormatCard {
  goal: GoalDef;
  specs: ImageSpec[];
  /** The shape drawn on the card (the first size). */
  lead: ImageSpec;
  ratio: string;
  platforms: string[];
  tag: SourceTag;
}
export function formatCards(): FormatCard[] {
  return GOALS.filter((g) => g.id !== "custom").map((goal) => {
    const specs = goal.specKeys.map((k) => specByKey(k)).filter((s): s is ImageSpec => !!s);
    const lead = specs[0];
    return { goal, specs, lead, ratio: ratioLabel(lead.width, lead.height), platforms: [...new Set(specs.map((s) => s.group))], tag: sourceTag(specs) };
  });
}

/** Safe zone as percentages for the layout guide (all in 0-100). */
export function safeRect(spec: Pick<ImageSpec, "width" | "height" | "safe">) {
  const b = safeBox(spec);
  return { x: (b.left / spec.width) * 100, y: (b.top / spec.height) * 100, w: (b.width / spec.width) * 100, h: (b.height / spec.height) * 100 };
}

/** Where printed text sits inside the safe box, as a share of the box height. */
export function textBand(position: Brief["textPosition"]): { y: number; h: number } {
  return position === "top" ? { y: 0, h: 0.28 } : position === "middle" ? { y: 0.36, h: 0.28 } : { y: 0.72, h: 0.28 };
}

// ── estimate and gates ──────────────────────────────────────────────────────

export interface EstimateView { perImageUsd: number; totalUsd: number; images: number; basis: string; model: string }

/** How many pictures a brief asks for (one per slide for a carousel). */
export const imagesFor = (b: Brief) => (goalById(b.goalId)?.slides ? b.overlayText.length : b.variants);

/** Scales a per-image price to a new count so the live estimate follows the sliders before the server answers. */
export const scaleEstimate = (e: EstimateView, images: number): EstimateView => ({ ...e, images, totalUsd: Math.round(e.perImageUsd * images * 1e6) / 1e6 });

export interface Confirmations { claims: boolean; rights: boolean; label: boolean }
export interface ReviewReasons { reasons: string[]; ready: boolean }
/** Everything that stops "Approve and generate", in plain words. Empty reasons = ready. */
export function reviewReasons(i: { errors: Errors; policy: ImagePolicyResult; acknowledged: string[]; confirmations: Confirmations; hasReferences: boolean; approvalKind: "ok" | "needs_manager" | "pending" | "over_cap" | "off"; approvalMessage: string; providerOk: boolean }): ReviewReasons {
  const r: string[] = [];
  const first = Object.values(i.errors)[0];
  if (first) r.push(first);
  if (i.policy.blocked.length && !first) r.push(i.policy.blocked[0].message);
  if (!i.providerOk) r.push("The chosen model isn't connected.");
  if (i.approvalKind === "off" || i.approvalKind === "over_cap" || i.approvalKind === "pending") r.push(i.approvalMessage);
  if (i.policy.flagged.some((f) => !i.acknowledged.includes(f.code))) r.push("Tick each point under “Please check”.");
  if (!i.confirmations.claims || !i.confirmations.label || (i.hasReferences && !i.confirmations.rights)) r.push("Tick the confirmations.");
  return { reasons: r, ready: r.length === 0 };
}

/** A copy of a brief for "Duplicate": same settings, nothing generated, and the consent record is cleared so it is asked for again. */
export const duplicateBrief = (b: Brief): Brief => ({ ...b, name: b.name ? `${b.name} (copy)`.slice(0, 160) : "", consent: b.consent ? { ...b.consent, attested: false, at: null, by: null } : null });
