import { defaultPrompt, defaultPromptAsync, type PromptFn } from "@/lib/prompts/defaults";
import { offerBriefLines, offerFacts, offerProblems } from "./offer";
import { LANGUAGE_LABEL, LANGUAGE_NOTES, WORDS_PER_SEC, maxWordsForDuration, normalizeLanguage } from "./styles/language";
import type { UgcStyle } from "./styles/types";
import type { ProviderCapabilities } from "./providers/types";
import { snapDuration, validatePlan } from "./validate";
import type { AspectRatio, ProductBrief, ScenePlan, UgcActor, UgcScene } from "./types";

/**
 * The script engine. The model writes the hook-body-CTA script and the scene plan; this file builds the instructions from the style
 * scaffold, forces a strict JSON shape, snaps lengths to what the video provider can render, and validates the result (one repair round).
 * It never sees the network: the LLM is injected (`LlmClient`), the default OpenAI implementation lives in `script-openai.ts`.
 */

export interface LlmResult {
  data: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface LlmClient {
  json(args: { system: string; user: string; schemaName: string; schema: Record<string, unknown> }): Promise<LlmResult>;
  /** Where the instructions come from: the registry through `getPrompt` for the real client; the built-in text when omitted (test clients). */
  prompt?: PromptFn;
}

export class PlanError extends Error {
  constructor(message: string, public errors: string[] = []) {
    super(message);
  }
}

type Schema = Record<string, unknown>;
const str = (description?: string): Schema => ({ type: "string", ...(description ? { description } : {}) });
const num = (description?: string): Schema => ({ type: "number", ...(description ? { description } : {}) });
const arr = (items: Schema): Schema => ({ type: "array", items });
const obj = (properties: Record<string, Schema>): Schema => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

export const PLAN_SCHEMA = obj({
  title: str("Short working title"),
  actors: arr(obj({ id: str("a1, a2..."), label: str("First name only, fictional"), ageRange: str("e.g. 25-30, always 18 or over"), gender: str(), look: str("Physical look: build, hair, skin tone, distinguishing features"), wardrobe: str(), personality: str("Energy and manner"), accent: str("Accent/voice description") })),
  scenes: arr(obj({
    durationSecs: num("Whole seconds"),
    setting: str(),
    visualPrompt: str("What happens on screen in this single continuous shot"),
    cameraNotes: str(),
    actorIds: arr(str()),
    dialogue: arr(obj({ speakerId: str(), text: str("Exactly what is said, in the video language") })),
    onScreenText: str("Short overlay text or empty"),
    voiceOver: str("Off-screen voice-over or empty"),
    factsUsed: arr(str("A brief fact copied verbatim that this scene relies on")),
  })),
});

export interface PlanOptions {
  aspect: AspectRatio;
  language: string;
  targetSecs: number;
  caps: ProviderCapabilities;
  /** Extra facts the user typed outside the structured brief (offers, prices). They count as provided facts. */
  providedFacts?: string[];
  /** Plain-text instruction for a regeneration ("make the hook funnier"). */
  instruction?: string;
  previous?: ScenePlan | null;
  /** The cast, setting and camera the client chose (see `cast.ts`): the script must keep to them. */
  direction?: string;
}

export function briefFacts(b: ProductBrief, extra: string[] = []): string[] {
  return [b.name, b.description, ...b.keyPoints, b.audience ?? "", b.callToAction ?? "", ...offerFacts(b.offer), ...extra].map((x) => x.trim()).filter(Boolean);
}

/** The script instructions: registry prompt "viralpulse.ugc.script" (editable part, then the pinned facts / fictional-people / no-claims rules). */
export function buildSystemPrompt(): string {
  return defaultPrompt("viralpulse.ugc.script");
}

export function buildUserPrompt(brief: ProductBrief, style: UgcStyle, o: PlanOptions): string {
  const lang = normalizeLanguage(o.language);
  const maxWordsEx = maxWordsForDuration(8, o.language);
  const beats = style.beats.map((b, i) => `  ${i + 1}. ${b.role.toUpperCase()} (about ${b.durationSecs}s): ${b.purpose}`).join("\n");
  const parts = [
    `STYLE: ${style.label} - ${style.description}`,
    `Prompt tag: ${style.promptTag}`,
    `Actors: exactly ${style.actorCount}`,
    `Beats (one scene per beat unless a beat clearly needs two):\n${beats}`,
    `Dialogue line roles in order: ${style.lineRoles.join(" -> ")}`,
    `Camera: ${style.camera.primary}`,
    `Realism cues: ${style.realismCues.join("; ")}`,
    `Never show: ${style.negativeCues.join("; ")}`,
    `LANGUAGE: ${LANGUAGE_LABEL[lang]} (${o.language}). ${LANGUAGE_NOTES[lang]} Speech guide: ${style.speech[lang === "hi" ? "hi" : lang === "hinglish" ? "hinglish" : lang === "en" ? "en" : "regional"]}`,
    `Speaking pace about ${WORDS_PER_SEC[lang]} words per second; an 8 second scene holds about ${maxWordsEx} words of speech.`,
    `LENGTH: total about ${o.targetSecs}s (allowed ${style.durationRange[0]}-${style.durationRange[1]}s). ${o.caps.allowedDurations.length ? `Every scene must be exactly one of ${o.caps.allowedDurations.join(", ")} seconds.` : `Every scene is a whole number of seconds from ${o.caps.promptDurationRange?.[0]} to ${o.caps.promptDurationRange?.[1]}.`}`,
    `ASPECT: ${o.aspect}`,
    "",
    "PRODUCT BRIEF (the only source of facts):",
    `Name: ${brief.name}`,
    `Description: ${brief.description}`,
    `Key points:\n${brief.keyPoints.map((k) => `- ${k}`).join("\n") || "- (none given)"}`,
    brief.audience ? `Audience: ${brief.audience}` : "",
    brief.callToAction ? `Call to action: ${brief.callToAction}` : "Call to action: none given; end with a soft, generic invitation that makes no claim.",
    ...offerBriefLines(brief.offer),
    style.offer ? `This is an OFFER style. Show the offer details and validity as on-screen text copied exactly from the brief (split across scenes, each at most 40 characters)${brief.offer?.terms ? ", and add the on-screen line 'Terms apply'" : ""}. Never invent or alter a figure, date, code or term. No countdown, 'ends tonight' or 'last few' unless the brief states a real deadline or stock limit.` : "",
    o.direction ? `\n${o.direction}` : "",
    o.providedFacts?.length ? `Additional facts provided by the user:\n${o.providedFacts.map((f) => `- ${f}`).join("\n")}` : "",
    style.illustrative ? "This style is testimonial-like: write it as an illustrative AI character sharing an experience in general terms, with no invented results." : "",
    o.instruction && o.previous ? `\nREVISE the previous plan as instructed: "${o.instruction}"\nPrevious plan:\n${JSON.stringify({ title: o.previous.title, actors: o.previous.actors, scenes: o.previous.scenes })}` : "",
  ];
  return parts.filter((p) => p !== "").join("\n");
}

interface RawPlan {
  title?: unknown;
  actors?: unknown;
  scenes?: unknown;
}

const s = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function normalizePlan(raw: unknown, brief: ProductBrief, style: UgcStyle, o: PlanOptions): { plan: ScenePlan; factsUsed: Record<number, string[]> } {
  const r = (raw && typeof raw === "object" ? raw : {}) as RawPlan;
  const rawActors = Array.isArray(r.actors) ? (r.actors as Record<string, unknown>[]) : [];
  const actors: UgcActor[] = rawActors.slice(0, 3).map((a, i) => ({
    id: s(a.id, 20) || `a${i + 1}`,
    label: s(a.label, 40),
    ageRange: s(a.ageRange, 20),
    gender: s(a.gender, 30),
    look: s(a.look, 400),
    wardrobe: s(a.wardrobe, 300),
    personality: s(a.personality, 300),
    voice: { mode: "native" as const, accent: s(a.accent, 100) || undefined },
  }));
  const rawScenes = Array.isArray(r.scenes) ? (r.scenes as Record<string, unknown>[]) : [];
  const factsUsed: Record<number, string[]> = {};
  const scenes: UgcScene[] = rawScenes.slice(0, 12).map((sc, i) => {
    const dialogue = (Array.isArray(sc.dialogue) ? (sc.dialogue as Record<string, unknown>[]) : []).map((l) => ({ speakerId: s(l.speakerId, 20), text: s(l.text, 600), language: o.language })).filter((l) => l.text);
    factsUsed[i] = (Array.isArray(sc.factsUsed) ? sc.factsUsed : []).map((x) => s(x, 300)).filter(Boolean);
    const onScreen = s(sc.onScreenText, 120);
    const vo = s(sc.voiceOver, 600);
    return {
      index: i,
      durationSecs: snapDuration(Number(sc.durationSecs) || 6, o.caps),
      setting: s(sc.setting, 400),
      visualPrompt: s(sc.visualPrompt, 1200),
      cameraNotes: s(sc.cameraNotes, 300),
      actorIds: (Array.isArray(sc.actorIds) ? sc.actorIds : []).map((x) => s(x, 20)).filter(Boolean),
      dialogue,
      ...(onScreen ? { onScreenText: onScreen } : {}),
      ...(vo ? { voiceOver: vo } : {}),
    };
  });
  return { plan: { styleId: style.id, title: s(r.title, 120), language: o.language, aspect: o.aspect, actors, scenes, productBrief: brief }, factsUsed };
}

export interface PlanOutcome {
  plan: ScenePlan;
  factsUsed: Record<number, string[]>;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  attempts: number;
}

export async function generateScenePlan(brief: ProductBrief, style: UgcStyle, options: PlanOptions, deps: { llm: LlmClient }): Promise<PlanOutcome> {
  if (!brief.name.trim() || !brief.description.trim()) throw new PlanError("Add the product name and a short description first.");
  const offerErrors = offerProblems(brief, style);
  if (offerErrors.length) throw new PlanError(offerErrors[0] as string, offerErrors);
  const facts = briefFacts(brief, options.providedFacts);
  const ask = deps.llm.prompt ?? defaultPromptAsync;
  const system = await ask("viralpulse.ugc.script");
  let user = buildUserPrompt(brief, style, options);
  let tokensIn = 0;
  let tokensOut = 0;
  let cost = 0;
  let last: { plan: ScenePlan; factsUsed: Record<number, string[]> } | null = null;
  let model = "";
  let errors: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await deps.llm.json({ system, user, schemaName: "ugc_scene_plan", schema: PLAN_SCHEMA });
    tokensIn += res.inputTokens;
    tokensOut += res.outputTokens;
    cost += res.costUsd;
    model = res.model;
    last = normalizePlan(res.data, brief, style, options);
    const v = validatePlan(last.plan, { caps: options.caps, totalRange: style.durationRange, maxActors: style.actorCount, briefFacts: facts, factsUsed: last.factsUsed, offerStyle: style });
    errors = v.errors;
    if (v.ok) return { ...last, model, inputTokens: tokensIn, outputTokens: tokensOut, costUsd: cost, attempts: attempt };
    user = `${buildUserPrompt(brief, style, options)}\n\n${await ask("viralpulse.ugc.script.fix", { problems: v.errors.map((e) => `- ${e}`).join("\n"), previous: JSON.stringify(res.data).slice(0, 8000) })}`;
  }
  throw new PlanError("The AI script didn't pass the checks after two attempts. Try again or adjust the brief.", errors);
}
