import { offerPlanProblems, offerProblems } from "./offer";
import type { UgcStyle } from "./styles/types";
import { estimateSpeakingSecs, LEAD_IN_SECS } from "./styles/language";
import type { ProviderCapabilities } from "./providers/types";
import type { ScenePlan } from "./types";

export interface ValidateOptions {
  caps: ProviderCapabilities;
  /** Allowed total length [min, max] in seconds (the style's range). */
  totalRange?: [number, number];
  maxActors?: number;
  maxScenes?: number;
  /** Facts the user supplied (key points, description, name, CTA): numbers and claims in the script must come from here. */
  briefFacts?: string[];
  /** The style, for offer rules (omit for style samples). */
  offerStyle?: Pick<UgcStyle, "offer" | "offerNeeds">;
  factsUsed?: Record<number, string[]>;
}

export interface Validation {
  ok: boolean;
  errors: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[\s,]+/g, " ").replace(/[^\p{L}\p{N}%₹$. ]/gu, "").trim();

export function snapDuration(secs: number, caps: ProviderCapabilities): number {
  if (caps.allowedDurations.length) return caps.allowedDurations.reduce((b, d) => (Math.abs(d - secs) < Math.abs(b - secs) || (Math.abs(d - secs) === Math.abs(b - secs) && d > b) ? d : b), caps.allowedDurations[0]);
  const [lo, hi] = caps.promptDurationRange ?? [3, 10];
  return Math.min(hi, Math.max(lo, Math.round(secs)));
}

export function durationAllowed(secs: number, caps: ProviderCapabilities): boolean {
  if (caps.allowedDurations.length) return caps.allowedDurations.includes(secs);
  const [lo, hi] = caps.promptDurationRange ?? [3, 10];
  return Number.isInteger(secs) && secs >= lo && secs <= hi;
}

/** Numbers, prices and percentages that appear in script text. */
export function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, ""));
}

export function validatePlan(plan: ScenePlan, o: ValidateOptions): Validation {
  const errors: string[] = [];
  const e = (m: string) => errors.push(m);
  const maxActors = o.maxActors ?? 3;
  if (o.offerStyle?.offer) for (const m of [...offerProblems(plan.productBrief, o.offerStyle), ...offerPlanProblems(plan, o.offerStyle)]) if (!errors.includes(m)) e(m);
  if (!plan.title.trim()) e("The plan needs a title.");
  if (plan.actors.length === 0) e("At least one actor is required.");
  if (plan.actors.length > maxActors) e(`At most ${maxActors} actors are supported.`);
  if (plan.scenes.length === 0) e("At least one scene is required.");
  if (plan.scenes.length > (o.maxScenes ?? 12)) e(`At most ${o.maxScenes ?? 12} scenes are supported.`);
  const actorIds = new Set<string>();
  for (const a of plan.actors) {
    if (!a.id || actorIds.has(a.id)) e(`Actor id "${a.id}" is missing or duplicated.`);
    actorIds.add(a.id);
    for (const f of ["label", "ageRange", "gender", "look", "wardrobe", "personality"] as const) if (!String(a[f] ?? "").trim()) e(`Actor "${a.id}" has no ${f}.`);
  }
  const used = new Set<string>();
  let total = 0;
  plan.scenes.forEach((s, i) => {
    const tag = `Scene ${i + 1}`;
    if (s.index !== i) e(`${tag}: scene numbering must run 0, 1, 2... in order.`);
    if (!durationAllowed(s.durationSecs, o.caps)) e(`${tag}: ${s.durationSecs}s is not a length ${o.caps.label} can render${o.caps.allowedDurations.length ? ` (use ${o.caps.allowedDurations.join(", ")})` : ` (use ${o.caps.promptDurationRange?.join("-")} s)`}.`);
    total += s.durationSecs;
    if (!s.visualPrompt.trim()) e(`${tag}: the visual description is empty.`);
    if (!s.setting.trim()) e(`${tag}: the setting is empty.`);
    if (s.actorIds.length === 0 && s.dialogue.length > 0) e(`${tag}: dialogue with no actors on screen.`);
    for (const id of s.actorIds) {
      if (!actorIds.has(id)) e(`${tag}: unknown actor "${id}".`);
      used.add(id);
    }
    for (const l of s.dialogue) {
      if (!s.actorIds.includes(l.speakerId)) e(`${tag}: "${l.speakerId}" speaks but is not in the scene.`);
      if (!l.text.trim()) e(`${tag}: an empty dialogue line.`);
    }
    const speak = s.dialogue.reduce((t, l) => t + estimateSpeakingSecs(l.text, l.language || plan.language), 0) + (s.voiceOver ? estimateSpeakingSecs(s.voiceOver, plan.language) : 0);
    if (speak > 0 && speak + LEAD_IN_SECS > s.durationSecs + 0.5) e(`${tag}: the dialogue needs about ${speak.toFixed(1)}s to speak but the scene is ${s.durationSecs}s. Shorten the lines or lengthen the scene.`);
  });
  for (const id of actorIds) if (!used.has(id)) e(`Actor "${id}" never appears in a scene.`);
  if (o.totalRange && (total < o.totalRange[0] - 1 || total > o.totalRange[1] + 1)) e(`Total length ${total}s is outside the ${o.totalRange[0]}-${o.totalRange[1]}s this style allows.`);

  if (o.briefFacts) {
    const facts = o.briefFacts.map(norm);
    const allBrief = norm(o.briefFacts.join(" "));
    const briefNumbers = new Set(numbersIn(o.briefFacts.join(" ")));
    plan.scenes.forEach((s, i) => {
      const spoken = [...s.dialogue.map((l) => l.text), s.voiceOver ?? "", s.onScreenText ?? ""].join(" ");
      for (const n of numbersIn(spoken)) if (!briefNumbers.has(n)) e(`Scene ${i + 1}: the number "${n}" is not in the brief. Only figures you provided may be used.`);
      for (const f of o.factsUsed?.[i] ?? []) {
        const nf = norm(f);
        if (nf && !allBrief.includes(nf) && !facts.some((x) => x.includes(nf) || nf.includes(x))) e(`Scene ${i + 1}: claims to use the fact "${f.slice(0, 60)}" which is not in the brief.`);
      }
    });
  }
  return { ok: errors.length === 0, errors };
}
