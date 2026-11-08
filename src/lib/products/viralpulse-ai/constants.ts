/** Pure Social Media (SMMS) vocabulary — safe to import from client components. */

export type Option = { value: string; label: string };

// ── Platforms ───────────────────────────────────────────────────────────────

export const PLATFORMS = ["instagram", "facebook", "youtube", "linkedin", "x", "google_ads", "google_business"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Where paid campaigns & ads run. */
export const AD_PLATFORMS = ["instagram", "facebook", "youtube", "linkedin", "google_ads"] as const satisfies readonly Platform[];
export type AdPlatform = (typeof AD_PLATFORMS)[number];

/** Where organic posts go. */
export const POST_PLATFORMS = ["instagram", "facebook", "youtube", "linkedin", "x", "google_business"] as const satisfies readonly Platform[];
export type PostPlatform = (typeof POST_PLATFORMS)[number];

/** The OAuth provider that owns each platform's API (Meta covers Facebook + Instagram; Google covers YouTube + Business Profile). */
export type Provider = "meta" | "google" | "linkedin";

export interface PlatformFormat {
  key: string;
  label: string;
  width: number;
  height: number;
  kind: "image" | "video" | "both";
}

export interface PlatformMeta {
  label: string;
  short: string;
  provider: Provider | "x";
  /** The LMS ad-platform bucket its paid performance is imported under (`campaigns.platform`), if any. */
  lmsPlatform: "meta" | "google" | "linkedin" | null;
  /** Tailwind classes for the platform chip. */
  chip: string;
  /** Hex used in charts and previews. */
  color: string;
  captionLimit: number;
  headlineLimit: number | null;
  hashtagAdvice: string;
  /** Instagram and YouTube can't publish a text-only post. */
  needsMedia: "image_or_video" | "video" | "none";
  formats: PlatformFormat[];
}

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  instagram: {
    label: "Instagram",
    short: "IG",
    provider: "meta",
    lmsPlatform: "meta",
    chip: "bg-pink-500/12 text-pink-700 dark:text-pink-300",
    color: "#d62976",
    captionLimit: 2200,
    headlineLimit: null,
    hashtagAdvice: "3–10 relevant hashtags, at the end of the caption",
    needsMedia: "image_or_video",
    formats: [
      { key: "ig_square", label: "Feed square 1:1", width: 1080, height: 1080, kind: "both" },
      { key: "ig_portrait", label: "Feed portrait 4:5", width: 1080, height: 1350, kind: "both" },
      { key: "ig_story", label: "Story / Reel 9:16", width: 1080, height: 1920, kind: "both" },
    ],
  },
  facebook: {
    label: "Facebook",
    short: "FB",
    provider: "meta",
    lmsPlatform: "meta",
    chip: "bg-blue-600/12 text-blue-700 dark:text-blue-300",
    color: "#1877f2",
    captionLimit: 63206,
    headlineLimit: 40,
    hashtagAdvice: "0–3 hashtags; they matter little on Facebook",
    needsMedia: "none",
    formats: [
      { key: "fb_square", label: "Feed square 1:1", width: 1080, height: 1080, kind: "both" },
      { key: "fb_link", label: "Link / landscape 1.91:1", width: 1200, height: 628, kind: "image" },
      { key: "fb_story", label: "Story / Reel 9:16", width: 1080, height: 1920, kind: "both" },
    ],
  },
  youtube: {
    label: "YouTube",
    short: "YT",
    provider: "google",
    lmsPlatform: "google",
    chip: "bg-red-600/12 text-red-700 dark:text-red-300",
    color: "#ff0000",
    captionLimit: 5000,
    headlineLimit: 100,
    hashtagAdvice: "up to 3 hashtags in the description; tags go in keywords",
    needsMedia: "video",
    formats: [
      { key: "yt_video", label: "Video 16:9", width: 1920, height: 1080, kind: "video" },
      { key: "yt_short", label: "Short 9:16", width: 1080, height: 1920, kind: "video" },
      { key: "yt_thumb", label: "Thumbnail 16:9", width: 1280, height: 720, kind: "image" },
    ],
  },
  linkedin: {
    label: "LinkedIn",
    short: "IN",
    provider: "linkedin",
    lmsPlatform: "linkedin",
    chip: "bg-sky-700/12 text-sky-800 dark:text-sky-300",
    color: "#0a66c2",
    captionLimit: 3000,
    headlineLimit: 70,
    hashtagAdvice: "3–5 professional hashtags",
    needsMedia: "none",
    formats: [
      { key: "li_square", label: "Square 1:1", width: 1200, height: 1200, kind: "both" },
      { key: "li_landscape", label: "Landscape 1.91:1", width: 1200, height: 627, kind: "both" },
      { key: "li_portrait", label: "Portrait 4:5", width: 1080, height: 1350, kind: "both" },
    ],
  },
  x: {
    label: "X",
    short: "X",
    provider: "x",
    lmsPlatform: null,
    chip: "bg-zinc-900/10 text-zinc-900 dark:bg-zinc-100/10 dark:text-zinc-100",
    color: "#111111",
    captionLimit: 280,
    headlineLimit: null,
    hashtagAdvice: "1–2 hashtags at most; X counts every character, links count as 23",
    needsMedia: "none",
    formats: [
      { key: "x_landscape", label: "Landscape 16:9", width: 1600, height: 900, kind: "both" },
      { key: "x_square", label: "Square 1:1", width: 1080, height: 1080, kind: "both" },
    ],
  },
  google_ads: {
    label: "Google Ads",
    short: "GAds",
    provider: "google",
    lmsPlatform: "google",
    chip: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
    color: "#fbbc04",
    captionLimit: 90,
    headlineLimit: 30,
    hashtagAdvice: "no hashtags — use keywords",
    needsMedia: "none",
    formats: [
      { key: "gads_landscape", label: "Display landscape 1.91:1", width: 1200, height: 628, kind: "image" },
      { key: "gads_square", label: "Display square 1:1", width: 1200, height: 1200, kind: "image" },
      { key: "gads_portrait", label: "Display portrait 4:5", width: 960, height: 1200, kind: "image" },
      { key: "gads_video", label: "Video (YouTube) 16:9", width: 1920, height: 1080, kind: "video" },
    ],
  },
  google_business: {
    label: "Google Business Profile",
    short: "GBP",
    provider: "google",
    lmsPlatform: null,
    chip: "bg-emerald-600/12 text-emerald-700 dark:text-emerald-300",
    color: "#34a853",
    captionLimit: 1500,
    headlineLimit: 58,
    hashtagAdvice: "no hashtags",
    needsMedia: "none",
    formats: [
      { key: "gbp_photo", label: "Post photo 4:3", width: 1200, height: 900, kind: "image" },
      { key: "gbp_video", label: "Video", width: 1280, height: 720, kind: "video" },
    ],
  },
};

export const platformLabel = (p: string): string => PLATFORM_META[p as Platform]?.label ?? p;
export const isPlatform = (v: unknown): v is Platform => typeof v === "string" && (PLATFORMS as readonly string[]).includes(v);
export const isAdPlatform = (v: unknown): v is AdPlatform => typeof v === "string" && (AD_PLATFORMS as readonly string[]).includes(v);
export const isPostPlatform = (v: unknown): v is PostPlatform => typeof v === "string" && (POST_PLATFORMS as readonly string[]).includes(v);

// ── Content lifecycle ───────────────────────────────────────────────────────

/** Draft → Generated (AI) → Edited → Scheduled → Published / Failed; Archived at any point. */
export const CONTENT_STATUSES = ["draft", "generated", "edited", "scheduled", "published", "failed", "archived"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const STATUS_META: Record<ContentStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-slate-500/12 text-slate-700 dark:text-slate-300" },
  generated: { label: "Generated", cls: "bg-violet-500/12 text-violet-700 dark:text-violet-300" },
  edited: { label: "Edited", cls: "bg-sky-500/12 text-sky-700 dark:text-sky-300" },
  scheduled: { label: "Scheduled", cls: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  published: { label: "Published", cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  failed: { label: "Failed", cls: "bg-rose-500/12 text-rose-700 dark:text-rose-300" },
  archived: { label: "Archived", cls: "bg-zinc-500/12 text-zinc-600 dark:text-zinc-400" },
};

export const MEDIA_KINDS = ["image", "video"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

// ── Brief vocabularies (suggestions — free text is allowed where noted) ──────

export const CAMPAIGN_OBJECTIVES = ["Brand awareness", "Reach", "Website traffic", "Engagement", "Lead generation", "Conversions / sales", "App installs", "Video views", "Store / local visits", "Event registrations"];
export const POST_OBJECTIVES = ["Awareness", "Engagement", "Education", "Promotion", "Lead generation", "Announcement", "Community", "Thought leadership", "Recruitment", "Event"];
export const TONES = ["Professional", "Friendly", "Bold", "Inspirational", "Informative", "Conversational", "Playful", "Urgent", "Authoritative", "Empathetic", "Luxurious"];
export const LANGUAGES = ["English", "Hindi", "Hinglish", "Spanish", "French", "German", "Arabic", "Portuguese", "Marathi", "Tamil", "Telugu", "Bengali"];
export const CTAS = ["Learn More", "Sign Up", "Contact Us", "Book Now", "Get Quote", "Shop Now", "Apply Now", "Download", "Register", "Call Now", "Subscribe", "Watch More", "Get Offer", "Send Message"];
export const INDUSTRIES = ["IT & Software", "Education & Training", "Healthcare", "Finance & Fintech", "Retail & E-commerce", "Manufacturing", "Real Estate", "Logistics", "Hospitality", "Professional Services", "Startups", "Government"];

// ── AI Content Generator ────────────────────────────────────────────────────

export const GENERATOR_TYPES = [
  { value: "campaign_ideas", label: "Campaign ideas", description: "Several campaign ideas with angle, audience and channel mix." },
  { value: "ad_copy", label: "Ad copy", description: "Headlines, primary text, descriptions and CTAs in several variations." },
  { value: "social_post", label: "Social post", description: "A ready-to-post update with caption, hashtags and a creative concept." },
  { value: "captions", label: "Captions", description: "Several caption options for one idea." },
  { value: "video_script", label: "Video script", description: "Hook, scene-by-scene script, voiceover, on-screen text and thumbnail." },
  { value: "headlines", label: "Headlines", description: "Headline and title options within the platform's limits." },
  { value: "ctas", label: "CTAs", description: "Call-to-action lines and button labels." },
  { value: "hashtags", label: "Hashtags & keywords", description: "Grouped hashtags (broad, niche, branded) and keywords." },
  { value: "creative_concept", label: "Creative concept", description: "Image and video creative concepts with ready-to-use image prompts." },
] as const;
export type GeneratorType = (typeof GENERATOR_TYPES)[number]["value"];
export const isGeneratorType = (v: unknown): v is GeneratorType => GENERATOR_TYPES.some((g) => g.value === v);

/** Sizes OpenAI's image models can produce — each platform format maps to the closest aspect. */
export const IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

export function imageSizeFor(width: number, height: number): ImageSize {
  const r = width / height;
  if (r > 1.2) return "1536x1024";
  if (r < 0.85) return "1024x1536";
  return "1024x1024";
}

export function findFormat(platform: string, key: string | null | undefined): PlatformFormat | null {
  if (!key) return null;
  return PLATFORM_META[platform as Platform]?.formats.find((f) => f.key === key) ?? null;
}

// ── Upload limits ───────────────────────────────────────────────────────────

/** Browser → Vercel Blob direct uploads, so these aren't bound by the 4.5 MB function body cap. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
export const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
export const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

export const LIMITS = {
  nameMax: 120,
  shortMax: 300,
  textMax: 5000,
  longMax: 20000,
  instructionMax: 1000,
};

export interface ModelPrice {
  id: string;
  label: string;
  input: number;
  output: number;
}
