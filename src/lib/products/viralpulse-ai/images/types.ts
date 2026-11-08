import type { ImageQuality } from "@/lib/products/viralpulse-ai/image-pricing-core";

/** Plain shared shapes for the Image Studio. No server imports: safe in client bundles. */

export type ImageProviderId = "openai" | "gemini";

export const LOGO_PLACEMENTS = [
  { value: "tl", label: "Top left" },
  { value: "tr", label: "Top right" },
  { value: "bl", label: "Bottom left" },
  { value: "br", label: "Bottom right" },
  { value: "bc", label: "Bottom centre" },
] as const;
export type LogoPlacement = (typeof LOGO_PLACEMENTS)[number]["value"];

export const TEXT_POSITIONS = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" },
] as const;
export type TextPosition = (typeof TEXT_POSITIONS)[number]["value"];

export interface BrandKit {
  /** A library image used as the logo (PNG with transparency works best). */
  logoMediaId: string | null;
  logoPlacement: LogoPlacement;
  /** Logo width as a share of the picture width. */
  logoScale: number;
  /** Put the logo on every export by default. */
  applyLogo: boolean;
  colours: { primary: string; secondary: string; accent: string; text: string };
  /** Only the bundled fonts can be drawn on images: Noto Sans (Latin) and Noto Sans Devanagari. */
  fontWeight: "regular" | "bold";
  voice: string;
  dos: string[];
  donts: string[];
  defaultCta: string;
}

export const EMPTY_KIT: BrandKit = {
  logoMediaId: null,
  logoPlacement: "br",
  logoScale: 0.14,
  applyLogo: false,
  colours: { primary: "", secondary: "", accent: "", text: "" },
  fontWeight: "bold",
  voice: "",
  dos: [],
  donts: [],
  defaultCta: "",
};

export interface Consent {
  /** The person confirms they have the right to use every person shown in the reference photos. */
  attested: boolean;
  /** The references show people at all. */
  showsPeople: boolean;
  /** The references show a public figure or celebrity (never allowed). */
  publicFigure: boolean;
  at: string | null;
  by: string | null;
}

export interface Brief {
  goalId: string;
  name: string;
  /** What the picture shows. */
  subject: string;
  /** The product or service, when the picture is about one. */
  product: string;
  style: string;
  colours: string;
  /** Exact words to appear on the image: one entry per slide (one entry otherwise). Drawn by the app, never by the model. */
  overlayText: string[];
  textPosition: TextPosition;
  /** The language of the overlay text, for choosing the font. */
  language: string;
  negative: string;
  specKeys: string[];
  variants: number;
  quality: ImageQuality;
  provider: ImageProviderId;
  applyKit: boolean;
  referenceIds: string[];
  consent: Consent | null;
  /** Show a visible "AI generated" badge on exports (chosen in the review step; absent = decided when finishing). */
  badge?: boolean;
  /** Place the brand-kit logo on exports (absent = decided when finishing). */
  applyLogo?: boolean;
}

export interface Variant {
  id: string;
  /** Blob key of the generated picture (PNG), under the company's own prefix. */
  storageKey: string;
  contentType: string;
  width: number;
  height: number;
  provider: ImageProviderId;
  model: string;
  prompt: string;
  /** The variant this one was edited from. */
  parentId: string | null;
  instruction: string | null;
  /** Slide number (carousel) or null. */
  slide: number | null;
  costUsd: number;
  costBasis: string;
  createdAt: string;
}

/** draft (brief incomplete) -> briefed (brief complete) -> generating / awaiting_approval -> ready | failed -> finished (saved to the library). */
export type ProjectStatus = "draft" | "briefed" | "generating" | "ready" | "awaiting_approval" | "finished" | "failed";

export interface ExportRecord {
  specKey: string;
  mediaId: string;
  variantId: string;
  badge: boolean;
}

export interface ProjectView {
  id: string;
  brief: Brief;
  status: ProjectStatus;
  variants: Variant[];
  chosenIds: string[];
  exports: ExportRecord[];
  pendingApproval: { by: string; email: string | null; at: string; estimateUsd: number; kind: string } | null;
  totalCostUsd: number;
  error: string | null;
  updatedAt: string;
  createdAt: string;
  /** Pictures wanted / produced by the current or last generation. */
  progress: { total: number; done: number };
}
