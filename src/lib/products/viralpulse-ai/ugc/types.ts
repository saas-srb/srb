/**
 * AI UGC Studio: shared types. Pure (no server-only imports) so the style catalogue, the UI and the
 * tests can import them freely.
 */

export type AspectRatio = "9:16" | "1:1" | "16:9";

export interface UgcActor {
  id: string;
  label: string;
  ageRange: string;
  gender: string;
  look: string;
  wardrobe: string;
  personality: string;
  voice: { mode: "native" | "elevenlabs"; voiceId?: string; accent?: string };
}

export interface UgcLine {
  speakerId: string;
  text: string;
  language: string;
}

export interface UgcScene {
  index: number;
  durationSecs: number;
  setting: string;
  visualPrompt: string;
  cameraNotes: string;
  actorIds: string[];
  dialogue: UgcLine[];
  onScreenText?: string;
  voiceOver?: string;
}

export interface ProductBrief {
  name: string;
  description: string;
  keyPoints: string[];
  audience?: string;
  callToAction?: string;
  /** Offer details, only for offer styles. Written by the person; the video may show nothing else about the offer. */
  offer?: import("./offer").ProductOffer;
}

export interface ScenePlan {
  styleId: string;
  title: string;
  language: string;
  aspect: AspectRatio;
  actors: UgcActor[];
  scenes: UgcScene[];
  productBrief: ProductBrief;
}

/* ---- Backend-owned types ---- */

export type ProviderId = "omni" | "veo";

export type ProjectStatus = "draft" | "scripted" | "approved" | "generating" | "ready" | "failed" | "cancelled";
export type SceneJobStatus = "queued" | "submitting" | "running" | "succeeded" | "failed" | "cancelled";

export interface UgcOptions {
  provider: ProviderId;
  model: string;
  aspect: AspectRatio;
  language: string;
  /** Target total length in seconds. */
  targetSecs: number;
  aiLabel: { enabled: boolean; position: "top-left" | "top-right" | "bottom-left" | "bottom-right" };
  burnCaptions: boolean;
}

export interface PolicyFinding {
  code: string;
  severity: "block" | "flag";
  message: string;
}

export interface PolicyResult {
  ok: boolean;
  blocked: PolicyFinding[];
  flagged: PolicyFinding[];
  /** Scenes/testimonials that must be shown as illustrative. */
  requiresIllustrativeNotice: boolean;
}

export interface ConsentRecord {
  userId: string;
  email: string | null;
  at: Date;
  mediaId: string;
  statement: string;
}
