/**
 * Shapes of the AI-generated (and user-edited) content SMMS stores, with their
 * empty values and normalisers. Pure — shared by the server, the editors and
 * the JSON schemas the OpenAI calls are constrained to (`ai.ts`).
 */

type Rec = Record<string, unknown>;
const s = (v: unknown, max = 5000): string => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "");
const list = (v: unknown, maxItems = 40, max = 300): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : []).map((x) => s(x, max).trim()).filter(Boolean).slice(0, maxItems);
const objs = <T>(v: unknown, fn: (r: Rec) => T, maxItems = 20): T[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object").slice(0, maxItems).map((x) => fn(x as Rec)) : []);
const num = (v: unknown, min = 0, max = 100000): number => Math.min(Math.max(Number(v) || 0, min), max);

// ── Campaign strategy ───────────────────────────────────────────────────────

export interface AdConcept {
  title: string;
  platform: string;
  format: "image" | "video";
  angle: string;
  headline: string;
  primaryText: string;
  description: string;
  cta: string;
}

export interface CampaignAi {
  summary: string;
  positioning: string;
  keyMessages: string[];
  channelPlan: { platform: string; budgetPercent: number; role: string }[];
  timeline: string;
  kpis: string[];
  ideas: { title: string; description: string }[];
  audiences: { name: string; description: string; interests: string[] }[];
  keywords: string[];
  hashtags: string[];
  adConcepts: AdConcept[];
}

export const EMPTY_CAMPAIGN_AI: CampaignAi = { summary: "", positioning: "", keyMessages: [], channelPlan: [], timeline: "", kpis: [], ideas: [], audiences: [], keywords: [], hashtags: [], adConcepts: [] };

export function normalizeAdConcept(r: Rec): AdConcept {
  return {
    title: s(r.title, 200),
    platform: s(r.platform, 40),
    format: r.format === "video" ? "video" : "image",
    angle: s(r.angle, 1000),
    headline: s(r.headline, 300),
    primaryText: s(r.primaryText, 3000),
    description: s(r.description, 1000),
    cta: s(r.cta, 80),
  };
}

export function normalizeCampaignAi(v: unknown): CampaignAi {
  const r = (v && typeof v === "object" ? v : {}) as Rec;
  return {
    summary: s(r.summary),
    positioning: s(r.positioning),
    keyMessages: list(r.keyMessages),
    channelPlan: objs(r.channelPlan, (x) => ({ platform: s(x.platform, 40), budgetPercent: num(x.budgetPercent, 0, 100), role: s(x.role, 1000) })),
    timeline: s(r.timeline),
    kpis: list(r.kpis),
    ideas: objs(r.ideas, (x) => ({ title: s(x.title, 200), description: s(x.description, 2000) })),
    audiences: objs(r.audiences, (x) => ({ name: s(x.name, 200), description: s(x.description, 2000), interests: list(x.interests, 30, 120) })),
    keywords: list(r.keywords, 60, 120),
    hashtags: list(r.hashtags, 40, 80),
    adConcepts: objs(r.adConcepts, normalizeAdConcept),
  };
}

// ── Ad creative ─────────────────────────────────────────────────────────────

export interface VideoScene {
  scene: string;
  duration: string;
  visual: string;
  onScreenText: string;
  voiceover: string;
}

export interface VideoCreative {
  concept: string;
  hook: string;
  scenes: VideoScene[];
  voiceoverScript: string;
  onScreenText: string[];
  thumbnailConcept: string;
  durationSec: number;
}

export interface ImageCreative {
  concept: string;
  prompt: string;
  overlayText: string;
  designNotes: string;
}

export interface AdVariation {
  label: string;
  headline: string;
  primaryText: string;
  description: string;
  cta: string;
}

export interface AdContent {
  headline: string;
  primaryText: string;
  description: string;
  cta: string;
  caption: string;
  hashtags: string[];
  keywords: string[];
  audienceSuggestions: string[];
  image: ImageCreative;
  video: VideoCreative;
  variations: AdVariation[];
}

export const EMPTY_IMAGE: ImageCreative = { concept: "", prompt: "", overlayText: "", designNotes: "" };
export const EMPTY_VIDEO: VideoCreative = { concept: "", hook: "", scenes: [], voiceoverScript: "", onScreenText: [], thumbnailConcept: "", durationSec: 0 };
export const EMPTY_AD: AdContent = { headline: "", primaryText: "", description: "", cta: "", caption: "", hashtags: [], keywords: [], audienceSuggestions: [], image: EMPTY_IMAGE, video: EMPTY_VIDEO, variations: [] };

export function normalizeImage(v: unknown): ImageCreative {
  const r = (v && typeof v === "object" ? v : {}) as Rec;
  return { concept: s(r.concept), prompt: s(r.prompt, 4000), overlayText: s(r.overlayText, 500), designNotes: s(r.designNotes, 2000) };
}

export function normalizeVideo(v: unknown): VideoCreative {
  const r = (v && typeof v === "object" ? v : {}) as Rec;
  return {
    concept: s(r.concept),
    hook: s(r.hook, 1000),
    scenes: objs(r.scenes, (x) => ({ scene: s(x.scene, 200), duration: s(x.duration, 40), visual: s(x.visual, 1500), onScreenText: s(x.onScreenText, 300), voiceover: s(x.voiceover, 1500) }), 30),
    voiceoverScript: s(r.voiceoverScript, 10000),
    onScreenText: list(r.onScreenText, 30, 300),
    thumbnailConcept: s(r.thumbnailConcept, 1500),
    durationSec: num(r.durationSec, 0, 3600),
  };
}

export function normalizeAd(v: unknown): AdContent {
  const r = (v && typeof v === "object" ? v : {}) as Rec;
  return {
    headline: s(r.headline, 300),
    primaryText: s(r.primaryText),
    description: s(r.description, 2000),
    cta: s(r.cta, 80),
    caption: s(r.caption),
    hashtags: list(r.hashtags, 40, 80),
    keywords: list(r.keywords, 60, 120),
    audienceSuggestions: list(r.audienceSuggestions, 20, 300),
    image: normalizeImage(r.image),
    video: normalizeVideo(r.video),
    variations: objs(r.variations, (x) => ({ label: s(x.label, 80), headline: s(x.headline, 300), primaryText: s(x.primaryText), description: s(x.description, 2000), cta: s(x.cta, 80) }), 10),
  };
}

// ── Social post ─────────────────────────────────────────────────────────────

export interface PostCreative {
  imageConcept: string;
  imagePrompt: string;
  videoConcept: string;
  hook: string;
  videoScript: string;
  scenes: VideoScene[];
  thumbnailConcept: string;
}

export interface PostVariantContent {
  title: string;
  content: string;
  caption: string;
  cta: string;
  hashtags: string[];
  keywords: string[];
}

export const EMPTY_CREATIVE: PostCreative = { imageConcept: "", imagePrompt: "", videoConcept: "", hook: "", videoScript: "", scenes: [], thumbnailConcept: "" };
export const EMPTY_VARIANT: PostVariantContent = { title: "", content: "", caption: "", cta: "", hashtags: [], keywords: [] };

export function normalizeCreative(v: unknown): PostCreative {
  const r = (v && typeof v === "object" ? v : {}) as Rec;
  return {
    imageConcept: s(r.imageConcept),
    imagePrompt: s(r.imagePrompt, 4000),
    videoConcept: s(r.videoConcept),
    hook: s(r.hook, 1000),
    videoScript: s(r.videoScript, 10000),
    scenes: normalizeVideo({ scenes: r.scenes }).scenes,
    thumbnailConcept: s(r.thumbnailConcept, 1500),
  };
}

export function normalizeVariant(v: unknown): PostVariantContent {
  const r = (v && typeof v === "object" ? v : {}) as Rec;
  return { title: s(r.title, 300), content: s(r.content, 10000), caption: s(r.caption, 3000), cta: s(r.cta, 120), hashtags: list(r.hashtags, 40, 80), keywords: list(r.keywords, 60, 120) };
}

// ── AI Content Generator workspace ──────────────────────────────────────────

export interface WorkspaceOutput {
  summary: string;
  items: { heading: string; platform: string; body: string; cta: string; hashtags: string[] }[];
}

export function normalizeWorkspace(v: unknown): WorkspaceOutput {
  const r = (v && typeof v === "object" ? v : {}) as Rec;
  return { summary: s(r.summary, 3000), items: objs(r.items, (x) => ({ heading: s(x.heading, 300), platform: s(x.platform, 40), body: s(x.body, 10000), cta: s(x.cta, 120), hashtags: list(x.hashtags, 40, 80) }), 20) };
}

/** Plain-text rendering of a hashtag list (ensures the leading #). */
export function hashtagText(tags: string[]): string {
  return tags.map((t) => (t.startsWith("#") ? t : `#${t}`).replace(/\s+/g, "")).join(" ");
}
