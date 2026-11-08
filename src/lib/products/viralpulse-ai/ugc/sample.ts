/**
 * Style samples: the pure part. A "sample" is one short, optional, paid AI clip that shows what a style looks like. It needs no brand facts:
 * it is built from a neutral brief and the style's own description. Pure (no server-only imports) so the UI and the tests share it.
 */
import { findingsIn } from "./policy";
import { variationKey, variationToActors } from "./styles/variation";
import type { ProviderCapabilities } from "./providers/types";
import type { UgcStyle, Variation } from "./styles/types";
import type { AspectRatio, PolicyFinding, ProductBrief, ScenePlan, UgcScene } from "./types";

export const SAMPLE_BADGE = "AI-generated sample";

function fnvHex(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The variation seed is typed by the browser: only short, plain tokens are accepted. */
export function sanitizeSeed(seed: unknown): string {
  return typeof seed === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(seed) ? seed : "preview-1";
}

/** Same style + same visible variation = same key, so a sample is made once and reused. */
export function sampleKeyFor(styleId: string, v: Variation): string {
  return `${styleId}:${fnvHex(variationKey(v))}`;
}

/** Shortest clip the provider renders, within the 4-8 s the preview is meant to be. */
export function sampleDurationSecs(caps: Pick<ProviderCapabilities, "allowedDurations" | "promptDurationRange">): number {
  if (caps.allowedDurations.length) return Math.min(...caps.allowedDurations);
  const [lo, hi] = caps.promptDurationRange ?? [3, 10];
  return Math.min(hi, Math.max(lo, 4));
}

/** No brand, no claims, no prices, no numbers. The product is "a generic product". */
export function sampleBrief(style: UgcStyle): ProductBrief {
  return {
    name: "Sample product",
    description: `A generic, unbranded everyday product, shown only to preview the video style "${style.label}". It makes no claims.`,
    keyPoints: [],
  };
}

/** The style description minus any sentence the content policy would object to (e.g. "never a real customer" mentions one). */
function safeDescription(text: string): string {
  return text.split(/(?<=[.!?])\s+/).filter((sentence) => findingsIn(sentence).length === 0).join(" ");
}

const clean = (s: string) => s.replace(/\{[^}]*\}/g, "").replace(/\s+/g, " ").trim();

/** Styles where nobody speaks to the camera get no spoken line. */
const SILENT = new Set(["asmr", "pov"]);

export function buildSamplePlan(style: UgcStyle, v: Variation, caps: Pick<ProviderCapabilities, "allowedDurations" | "promptDurationRange">, aspect?: AspectRatio): ScenePlan {
  // "slim build" would trip the weight-loss flag; the sample has no use for that wording.
  const actors = variationToActors(v).map((a) => ({ ...a, look: a.look.replace(/\bslim\b/gi, "lean") }));
  const durationSecs = sampleDurationSecs(caps);
  const speaks = !SILENT.has(style.category) && actors.length > 0;
  const scene: UgcScene = {
    index: 0,
    durationSecs,
    setting: clean(`${v.setting.label}: ${v.setting.description}. Lighting: ${v.setting.lighting}. Time: ${v.setting.timeOfDay}. Props: ${v.setting.props.join(", ")}`),
    visualPrompt: clean(`${safeDescription(style.description)} Show a generic, unbranded product being handled naturally. ${v.pacing}.`),
    cameraNotes: clean(`${v.camera}; ${v.cameraFlavour}`),
    actorIds: actors.map((a) => a.id),
    dialogue: speaks ? [{ speakerId: actors[0].id, text: "Okay, so this is the one.", language: "en" }] : [],
    onScreenText: "",
    voiceOver: "",
  };
  return { styleId: style.id, title: `Style sample: ${style.label}`, language: "en", aspect: aspect ?? style.aspects[0] ?? "9:16", actors, scenes: [scene], productBrief: sampleBrief(style) };
}

/* ---- shapes shared with the UI ---- */

export type SampleStatus = "ready" | "generating" | "pending_approval" | "failed";

export interface SampleView {
  key: string;
  projectId: string;
  styleId: string;
  /** The variation seed it was made for, so the UI can jump back to the matching storyboard. */
  seed: string;
  status: SampleStatus;
  mediaId: string | null;
  thumbnailId: string | null;
  durationSecs: number | null;
  costUsd: number;
  error: string | null;
  createdAt: string;
}

export interface SampleQuote {
  styleId: string;
  seed: string;
  key: string;
  secs: number;
  estimateUsd: number;
  provider: string;
  model: string;
  /** Today's limit (IST day) and what is already spent or reserved. */
  dailyCapUsd: number;
  spentTodayUsd: number;
  thresholdUsd: number;
  /** Over the manager threshold and the viewer cannot approve: it will be sent to a manager. */
  needsManager: boolean;
  /** Within today's limit. */
  withinCap: boolean;
  /** Why it cannot run right now, in plain words (missing connection, switched off, cap). null = can run. */
  blocker: string | null;
  connected: boolean;
  policyOk: boolean;
  policyBlocked: PolicyFinding[];
  policyFlagged: PolicyFinding[];
  existing: SampleView | null;
}
