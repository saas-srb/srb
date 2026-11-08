/**
 * Image Studio: what an image is for, and the exact pixel sizes each destination wants. Pure (no server imports): the browser uses it
 * for the format picker and safe-zone guides, the server for resizing and validation.
 *
 * Every size carries its source and how far it was verified. `official` = read on the platform's own documentation page on the
 * `verifiedOn` date. `partial` = the platform's page confirms the aspect ratio / format but the pixel size is the platform's usual
 * recommendation as reported by several current guides. `secondary` = the platform's own page could not be opened that day; the size
 * and safe zone come from several 2026 third-party guides and the app's earlier constants. Safe zones for Stories / Reels differ
 * between sources (bottom 20% to 35%); the stricter number is used so text never lands under the platform's interface.
 * Re-verify before relying on a `secondary` row for a paid campaign: the Meta Ads Manager preview shows its own safe-zone overlay.
 */

import type { PostPlatform } from "@/lib/products/viralpulse-ai/constants";

export const SPECS_VERIFIED_ON = "2026-11-01";

export type Confidence = "official" | "partial" | "secondary";

export interface SafeZone {
  /** Fractions of the height / width that must stay free of text and logos. */
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ImageSpec {
  key: string;
  /** Group heading in the picker. */
  group: string;
  label: string;
  width: number;
  height: number;
  safe: SafeZone;
  /** Largest file the platform accepts for this placement, when known. */
  maxBytes: number | null;
  formats: ("jpeg" | "png")[];
  /** Placement note shown beside the size. */
  note?: string;
  source: { url: string; verifiedOn: string; confidence: Confidence; note?: string };
}

const m = (u: number) => u * 1024 * 1024;
const SRC = {
  meta: { url: "https://www.facebook.com/business/ads-guide", verifiedOn: SPECS_VERIFIED_ON, confidence: "secondary" as Confidence, note: "Meta's guide could not be opened that day; sizes agree across several 2026 guides. Safe zone: top 14%, bottom 35%, sides 6% (the strictest of the figures in circulation)." },
  yt: { url: "https://support.google.com/youtube/answer/72431", verifiedOn: SPECS_VERIFIED_ON, confidence: "official" as Confidence, note: "YouTube recommends 3840x2160, minimum width 640, 16:9, JPG or PNG, up to 2 MB from a phone and 50 MB from a computer. 1280x720 is exported so it stays under 2 MB." },
  li: { url: "https://www.linkedin.com/help/lms/answer/a424806", verifiedOn: SPECS_VERIFIED_ON, confidence: "secondary" as Confidence, note: "LinkedIn's help page returned an error that day; sizes follow its documented 1.91:1, 1:1 and 4:5 single-image options as reported by 2026 guides." },
  gads: { url: "https://support.google.com/google-ads/answer/7005917", verifiedOn: SPECS_VERIFIED_ON, confidence: "partial" as Confidence, note: "Responsive display ads take 1.91:1, 1:1 and 4:5 images; the recommended pixel sizes are Google's usual ones. Google may crop the image, so keep text well inside." },
  x: { url: "https://docs.x.com/x-ads-api/creatives", verifiedOn: SPECS_VERIFIED_ON, confidence: "partial" as Confidence, note: "docs.x.com confirms 1:1 and 1.91:1 images in BMP, JPEG or PNG; the pixel sizes and the 5 MB limit come from 2026 guides." },
  gbp: { url: "https://support.google.com/business/answer/7090206", verifiedOn: SPECS_VERIFIED_ON, confidence: "secondary" as Confidence, note: "Photos: 4:3 recommended, JPG or PNG, 10 KB to 5 MB per Google's help; not re-opened that day." },
};
const sz = (top: number, bottom: number, side: number): SafeZone => ({ top, bottom, left: side, right: side });
const FEED = sz(0.05, 0.05, 0.05);
const STORY = sz(0.14, 0.35, 0.06);

export const SPECS: ImageSpec[] = [
  { key: "ig_feed_portrait", group: "Instagram", label: "Feed portrait 4:5", width: 1080, height: 1350, safe: FEED, maxBytes: m(30), formats: ["jpeg", "png"], note: "Takes the most screen in the feed", source: SRC.meta },
  { key: "ig_feed_square", group: "Instagram", label: "Feed square 1:1", width: 1080, height: 1080, safe: FEED, maxBytes: m(30), formats: ["jpeg", "png"], source: SRC.meta },
  { key: "ig_story", group: "Instagram", label: "Story / Reel cover 9:16", width: 1080, height: 1920, safe: STORY, maxBytes: m(30), formats: ["jpeg", "png"], note: "Keep text between the top 14% and bottom 35% markers", source: SRC.meta },
  { key: "fb_feed_portrait", group: "Facebook", label: "Feed portrait 4:5", width: 1080, height: 1350, safe: FEED, maxBytes: m(30), formats: ["jpeg", "png"], source: SRC.meta },
  { key: "fb_feed_square", group: "Facebook", label: "Feed square 1:1", width: 1080, height: 1080, safe: FEED, maxBytes: m(30), formats: ["jpeg", "png"], source: SRC.meta },
  { key: "fb_link", group: "Facebook", label: "Link / landscape 1.91:1", width: 1200, height: 628, safe: sz(0.06, 0.06, 0.06), maxBytes: m(30), formats: ["jpeg", "png"], source: SRC.meta },
  { key: "fb_story", group: "Facebook", label: "Story 9:16", width: 1080, height: 1920, safe: STORY, maxBytes: m(30), formats: ["jpeg", "png"], source: SRC.meta },
  { key: "yt_thumb", group: "YouTube", label: "Thumbnail 16:9", width: 1280, height: 720, safe: { top: 0.05, bottom: 0.12, left: 0.05, right: 0.12 }, maxBytes: m(2), formats: ["jpeg", "png"], note: "The video length badge covers the bottom-right corner", source: SRC.yt },
  { key: "li_landscape", group: "LinkedIn", label: "Post landscape 1.91:1", width: 1200, height: 627, safe: sz(0.06, 0.06, 0.06), maxBytes: m(5), formats: ["jpeg", "png"], source: SRC.li },
  { key: "li_square", group: "LinkedIn", label: "Post square 1:1", width: 1200, height: 1200, safe: FEED, maxBytes: m(5), formats: ["jpeg", "png"], source: SRC.li },
  { key: "li_portrait", group: "LinkedIn", label: "Post portrait 4:5", width: 1080, height: 1350, safe: FEED, maxBytes: m(5), formats: ["jpeg", "png"], source: SRC.li },
  { key: "li_banner_company", group: "LinkedIn", label: "Company page banner", width: 1128, height: 191, safe: sz(0.1, 0.1, 0.2), maxBytes: m(2), formats: ["jpeg", "png"], note: "The logo overlaps the left edge on the page", source: { ...SRC.li, note: "Company cover 1128x191 per LinkedIn's page-branding help; not re-opened that day." } },
  { key: "li_banner_personal", group: "LinkedIn", label: "Profile banner", width: 1584, height: 396, safe: sz(0.1, 0.1, 0.25), maxBytes: m(8), formats: ["jpeg", "png"], note: "The profile photo covers the lower left", source: { ...SRC.li, note: "Personal banner 1584x396 per LinkedIn's help; not re-opened that day." } },
  { key: "gads_landscape", group: "Google Ads", label: "Display landscape 1.91:1", width: 1200, height: 628, safe: sz(0.08, 0.08, 0.08), maxBytes: m(5), formats: ["jpeg", "png"], source: SRC.gads },
  { key: "gads_square", group: "Google Ads", label: "Display square 1:1", width: 1200, height: 1200, safe: sz(0.08, 0.08, 0.08), maxBytes: m(5), formats: ["jpeg", "png"], source: SRC.gads },
  { key: "gads_portrait", group: "Google Ads", label: "Display portrait 4:5", width: 960, height: 1200, safe: sz(0.08, 0.08, 0.08), maxBytes: m(5), formats: ["jpeg", "png"], source: SRC.gads },
  { key: "x_card", group: "X", label: "Image / website card 1.91:1", width: 1200, height: 628, safe: sz(0.06, 0.06, 0.06), maxBytes: m(5), formats: ["jpeg", "png"], source: SRC.x },
  { key: "x_square", group: "X", label: "Image square 1:1", width: 1200, height: 1200, safe: FEED, maxBytes: m(5), formats: ["jpeg", "png"], source: SRC.x },
  { key: "gbp_photo", group: "Google Business Profile", label: "Post photo 4:3", width: 1200, height: 900, safe: FEED, maxBytes: m(5), formats: ["jpeg", "png"], source: SRC.gbp },
];

const BY_KEY = new Map(SPECS.map((s) => [s.key, s]));
export const specByKey = (key: string): ImageSpec | null => BY_KEY.get(key) ?? null;
export const specGroups = (): { group: string; specs: ImageSpec[] }[] => {
  const out: { group: string; specs: ImageSpec[] }[] = [];
  for (const s of SPECS) (out.find((g) => g.group === s.group) ?? (out[out.push({ group: s.group, specs: [] }) - 1])).specs.push(s);
  return out;
};

export interface GoalDef {
  id: string;
  label: string;
  description: string;
  /** Sizes selected by default; the person can add or remove. */
  specKeys: string[];
  /** Photographic people are likely: the visible "AI generated" badge starts ON. */
  peopleLikely: boolean;
  /** The goal normally carries words on the picture. */
  textLikely: boolean;
  /** Carousel: one image per slide. */
  slides?: { min: number; max: number };
  /** What the generator is told the image is. */
  promptRole: string;
}

export const GOALS: GoalDef[] = [
  { id: "custom", label: "Any size", description: "Pick the sizes yourself.", specKeys: ["ig_feed_square"], peopleLikely: true, textLikely: false, promptRole: "an image" },
  { id: "organic_post", label: "Organic post", description: "A feed picture for Instagram, Facebook or LinkedIn.", specKeys: ["ig_feed_portrait", "fb_feed_square", "li_square"], peopleLikely: true, textLikely: false, promptRole: "a social media feed image" },
  { id: "story", label: "Story", description: "Full-screen vertical picture for Instagram and Facebook Stories.", specKeys: ["ig_story", "fb_story"], peopleLikely: true, textLikely: true, promptRole: "a vertical full-screen story background" },
  { id: "reel_cover", label: "Reel cover", description: "The still shown for a Reel.", specKeys: ["ig_story"], peopleLikely: true, textLikely: true, promptRole: "a vertical video cover image" },
  { id: "youtube_thumbnail", label: "YouTube thumbnail", description: "Bold 16:9 thumbnail that reads at small size.", specKeys: ["yt_thumb"], peopleLikely: true, textLikely: true, promptRole: "a high-contrast YouTube thumbnail background with a clear focal subject and empty space for a headline" },
  { id: "linkedin_banner", label: "LinkedIn banner", description: "Company page or profile banner.", specKeys: ["li_banner_company", "li_banner_personal"], peopleLikely: false, textLikely: true, promptRole: "a very wide, simple banner background with calm empty space" },
  { id: "ad_meta", label: "Ad creative: Meta", description: "Facebook and Instagram ads.", specKeys: ["ig_feed_portrait", "ig_feed_square", "fb_link", "ig_story"], peopleLikely: true, textLikely: true, promptRole: "an advertising image for Facebook and Instagram" },
  { id: "ad_google", label: "Ad creative: Google", description: "Responsive display ads.", specKeys: ["gads_landscape", "gads_square", "gads_portrait"], peopleLikely: false, textLikely: false, promptRole: "an advertising image for Google display ads, with the subject centred so any crop still works" },
  { id: "ad_linkedin", label: "Ad creative: LinkedIn", description: "LinkedIn single image ads.", specKeys: ["li_landscape", "li_square"], peopleLikely: false, textLikely: true, promptRole: "a professional advertising image for LinkedIn" },
  { id: "ad_x", label: "Ad creative: X", description: "X image ads and website cards.", specKeys: ["x_card", "x_square"], peopleLikely: false, textLikely: true, promptRole: "an advertising image for X" },
  { id: "product_shot", label: "Product shot", description: "Clean picture of your product.", specKeys: ["ig_feed_square", "fb_feed_square", "gads_square", "gbp_photo"], peopleLikely: false, textLikely: false, promptRole: "a clean commercial product photograph" },
  { id: "quote_card", label: "Quote card", description: "A quote or tip on a designed background.", specKeys: ["ig_feed_square", "ig_feed_portrait", "li_square"], peopleLikely: false, textLikely: true, promptRole: "an abstract, uncluttered background for a text quote, with no objects in the centre" },
  { id: "festival_greeting", label: "Festival greeting", description: "A greeting for a festival or occasion.", specKeys: ["ig_feed_square", "ig_story", "fb_feed_square"], peopleLikely: false, textLikely: true, promptRole: "a festive greeting background with empty space for the greeting text" },
  { id: "offer_banner", label: "Offer banner", description: "A sale or offer banner.", specKeys: ["fb_link", "gads_landscape", "ig_feed_portrait"], peopleLikely: false, textLikely: true, promptRole: "a promotional banner background with space for the offer text" },
  { id: "carousel_set", label: "Carousel set", description: "A set of matching slides (one picture per slide).", specKeys: ["ig_feed_square"], peopleLikely: false, textLikely: true, slides: { min: 2, max: 6 }, promptRole: "one slide of a matching carousel set" },
];
export const goalById = (id: string): GoalDef | null => GOALS.find((g) => g.id === id) ?? null;

// ── geometry ────────────────────────────────────────────────────────────────

export const ratioOf = (w: number, h: number) => w / h;

/** The text-safe rectangle of a spec in pixels. */
export function safeBox(spec: Pick<ImageSpec, "width" | "height" | "safe">): { left: number; top: number; width: number; height: number } {
  const left = Math.round(spec.width * spec.safe.left);
  const top = Math.round(spec.height * spec.safe.top);
  return { left, top, width: Math.max(1, spec.width - left - Math.round(spec.width * spec.safe.right)), height: Math.max(1, spec.height - top - Math.round(spec.height * spec.safe.bottom)) };
}

/** Share (0-1) of the source that a cover-crop to `spec` throws away. 0 = same shape. */
export function cropLoss(srcW: number, srcH: number, spec: Pick<ImageSpec, "width" | "height">): number {
  const s = srcW / srcH;
  const t = spec.width / spec.height;
  return s > t ? 1 - t / s : 1 - s / t;
}

/** The sizes the OpenAI image models produce (see models.ts price table) and the closest one for a shape. */
export const OPENAI_SIZES = [
  { size: "1024x1024" as const, w: 1024, h: 1024 },
  { size: "1536x1024" as const, w: 1536, h: 1024 },
  { size: "1024x1536" as const, w: 1024, h: 1536 },
];
export type OpenAiSize = (typeof OPENAI_SIZES)[number]["size"];
export function openAiSizeFor(specs: Pick<ImageSpec, "width" | "height">[]): OpenAiSize {
  return pickShape(specs, OPENAI_SIZES.map((o) => ({ id: o.size, ratio: o.w / o.h }))) as OpenAiSize;
}

/** Aspect ratios the Gemini image models accept (docs: ai.google.dev/gemini-api/docs/image-generation). */
export const GEMINI_RATIOS = ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9"] as const;
export type GeminiRatio = (typeof GEMINI_RATIOS)[number];
export function geminiRatioFor(specs: Pick<ImageSpec, "width" | "height">[]): GeminiRatio {
  return pickShape(specs, GEMINI_RATIOS.map((r) => { const [a, b] = r.split(":").map(Number); return { id: r, ratio: a / b }; })) as GeminiRatio;
}

/** The generation shape that wastes the least of the picture over every wanted size (compared on a log scale, so 2:1 and 1:2 weigh equally). */
function pickShape(specs: Pick<ImageSpec, "width" | "height">[], shapes: { id: string; ratio: number }[]): string {
  const wanted = specs.length ? specs : [{ width: 1, height: 1 }];
  let best = shapes[0];
  let bestCost = Infinity;
  for (const s of shapes) {
    const cost = wanted.reduce((a, w) => a + Math.abs(Math.log(s.ratio / (w.width / w.height))), 0);
    if (cost < bestCost - 1e-9) {
      best = s;
      bestCost = cost;
    }
  }
  return best.id;
}

/** Specs whose shape a library image fits (within `tol` of the ratio, and at least `minShare` of the pixel width). */
export function fitsFor(width: number | null, height: number | null, tol = 0.03): ImageSpec[] {
  if (!width || !height) return [];
  const r = width / height;
  return SPECS.filter((s) => Math.abs(r / (s.width / s.height) - 1) <= tol && width >= s.width * 0.9);
}

/** The post platform a spec group publishes to (null = the app cannot publish there yet). */
export const GROUP_TO_POST_PLATFORM: Record<string, PostPlatform | null> = {
  Instagram: "instagram",
  Facebook: "facebook",
  YouTube: "youtube",
  LinkedIn: "linkedin",
  "Google Ads": null,
  X: "x",
  "Google Business Profile": "google_business",
};
