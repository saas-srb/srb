/**
 * UGC style catalogue: types. Pure data shapes, no server-only imports.
 */
import type { AspectRatio } from "../types";

export type StyleCategory =
  | "conversation" | "review" | "unboxing" | "tutorial" | "problem-solution" | "day-in-life" | "grwm"
  | "street-interview" | "reaction" | "pov" | "comparison" | "founder-story" | "podcast" | "asmr"
  | "food" | "fitness" | "tech-demo" | "home-decor" | "fashion" | "family" | "b2b" | "local-business" | "festival"
  | "direct-response" | "offer-sale" | "launch" | "brand-story" | "social-proof" | "explainer" | "short-formats" | "hiring" | "events"
  | "hospitality" | "wellness-care" | "learning-finance" | "property-auto" | "retail-vertical" | "trades" | "awareness" | "community"
  | "tech-qa" | "tech-humour" | "devotional" | "kids-parenting" | "news-style" | "entertainment" | "lifestyle" | "company-marketing" | "services-marketing" | "product-marketing";

export const STYLE_CATEGORIES: StyleCategory[] = [
  "conversation", "review", "unboxing", "tutorial", "problem-solution", "day-in-life", "grwm",
  "street-interview", "reaction", "pov", "comparison", "founder-story", "podcast", "asmr",
  "food", "fitness", "tech-demo", "home-decor", "fashion", "family", "b2b", "local-business", "festival",
  "direct-response", "offer-sale", "launch", "brand-story", "social-proof", "explainer", "short-formats", "hiring", "events",
  "hospitality", "wellness-care", "learning-finance", "property-auto", "retail-vertical", "trades", "awareness", "community",
  "tech-qa", "tech-humour", "devotional", "kids-parenting", "news-style", "entertainment", "lifestyle", "company-marketing", "services-marketing", "product-marketing",
];

/** Who is cast by default. A woman is always present; male-only casting does not exist. */
export type CastMode = "solo-female" | "female-male" | "female-female";
export type WardrobeToneId = "trendy" | "modest" | "traditional";
/** Categories whose people dress modestly/professionally, or traditionally; everything else is "trendy". */
export const MODEST_CATEGORIES: StyleCategory[] = ["news-style", "b2b", "kids-parenting", "learning-finance", "hiring", "awareness", "company-marketing", "services-marketing", "events", "social-proof"];
export const TRADITIONAL_CATEGORIES: StyleCategory[] = ["devotional", "festival"];

export type BeatRole = "hook" | "body" | "proof" | "cta";
export type Goal = "awareness" | "engagement" | "leads" | "sales" | "installs" | "footfall" | "trust" | "education" | "retention";
export type Platform = "instagram" | "youtube" | "facebook" | "whatsapp" | "linkedin" | "x";
export const PLATFORMS: Platform[] = ["instagram", "facebook", "youtube", "linkedin", "x", "whatsapp"];
export type HookFormulaId =
  | "curiosity-gap" | "pattern-interrupt" | "question" | "bold-statement" | "relatable-confession" | "mid-conversation" | "list-teaser"
  | "problem-agitate" | "myth-bust" | "announcement" | "urgency" | "skit-open";

export interface SceneBeat {
  role: BeatRole;
  durationSecs: number;
  purpose: string;
}

export interface HookFormula {
  id: HookFormulaId;
  label: string;
  how: string;
  /** Shape only; {product} / {problem} are placeholders, never real claims. */
  example: string;
}

export interface SpeechGuide {
  en: string;
  hi: string;
  hinglish: string;
  regional: string;
}

export interface UgcStyle {
  id: string;
  label: string;
  description: string;
  category: StyleCategory;
  industries: string[];
  goals: Goal[];
  platforms: Platform[];
  /** First entry is the recommended aspect. */
  aspects: AspectRatio[];
  /** Allowed total length [min, max] seconds. */
  durationRange: [number, number];
  actorCount: 1 | 2 | 3;
  beats: SceneBeat[];
  /** What each dialogue line does, in order (cycled if the plan has more lines). */
  lineRoles: string[];
  hookFormulas: HookFormulaId[];
  speech: SpeechGuide;
  camera: { primary: string; alternates: string[] };
  realismCues: string[];
  negativeCues: string[];
  /** Setting ids from the pool that suit this style. */
  settingIds: string[];
  /** Short tag that opens the video prompt, e.g. "candid smartphone video". */
  promptTag: string;
  /** Testimonial-like: output must be disclosed as illustrative. */
  illustrative: boolean;
  /** Max characters of a scene prompt; default 900. */
  promptCharCap?: number;
  /** Offer style: needs offer details in the brief (see offer.ts). */
  offer?: boolean;
  /** Offer styles that build urgency: a real deadline ("validity") or a real stock limit ("stock") must be in the brief. */
  offerNeeds?: "validity" | "stock";
  /** Set for styles built around one platform's native look (additive; absent for platform-agnostic styles). */
  nativePlatform?: Platform;
  /** Default casting (always includes a woman). Derived from actorCount when the definition does not say. */
  castMode: CastMode;
  /** Wardrobe pool tone: trendy everyday, modest/professional, or traditional. Derived from the category. */
  wardrobeTone: WardrobeToneId;
  /** Burned-in subtitles are on by default (silent-autoplay platforms, professional feeds). */
  subtitlesDefault?: boolean;
  /** No minors are ever on screen; always true. */
  adultsOnly: true;
}

export interface VariationActor {
  archetypeId: string;
  label: string;
  ageRange: string;
  gender: string;
  look: string;
  wardrobe: string;
  personality: string;
  accent: string;
}

export interface Variation {
  styleId: string;
  seed: string;
  actors: VariationActor[];
  setting: { id: string; label: string; description: string; lighting: string; timeOfDay: string; props: string[] };
  camera: string;
  cameraFlavour: string;
  pacing: string;
  ambience: string;
}

export type VariationPart = "actors" | "setting" | "camera" | "pacing" | "ambience";

export interface StyleSuggestion {
  styleId: string;
  score: number;
  reasons: string[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export type { AspectRatio };
