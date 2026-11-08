import type { GeminiRatio, OpenAiSize } from "@/lib/products/viralpulse-ai/images/specs";
import type { ImageUsage } from "@/lib/products/viralpulse-ai/models";
import type { ImageProviderId } from "@/lib/products/viralpulse-ai/images/types";

/**
 * The seam between the Image Studio and an image model. Everything provider-specific (endpoints, field names, refusal wording) lives
 * in an implementation of this; the engine only knows these shapes, so tests drive it with a fake provider and no network.
 */

export interface RefImage {
  data: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

export interface ImageRequest {
  prompt: string;
  /** How many pictures (1-4). */
  n: number;
  model: string;
  quality: string;
  /** The shape OpenAI should produce / the aspect ratio Gemini should produce. Each provider reads its own. */
  openAiSize: OpenAiSize;
  geminiRatio: GeminiRatio;
  /** Pictures to edit or to take as reference (the first is the one being edited). */
  references?: RefImage[];
  /** PNG whose transparent area marks what an edit may change (OpenAI only). */
  mask?: Buffer;
}

export interface ImageResult {
  images: Buffer[];
  /** Token usage for the whole call when the provider reports it (OpenAI). */
  usage: ImageUsage | null;
  model: string;
}

export type ImageErrorCode = "moderation" | "rate" | "quota" | "auth" | "bad_request" | "provider" | "unreachable";

export class ImageProviderError extends Error {
  constructor(public code: ImageErrorCode, message: string, public retryable = false) {
    super(message);
    this.name = "ImageProviderError";
  }
}

export interface ImageProvider {
  readonly id: ImageProviderId;
  generate(req: ImageRequest): Promise<ImageResult>;
  /** Edit the first reference per the prompt, using the other references as extra material. */
  edit(req: ImageRequest): Promise<ImageResult>;
}

/** What a refusal or failure should say to a person, whatever the provider's own wording. */
export const MESSAGES: Record<ImageErrorCode, string> = {
  moderation: "The image model declined this request because of its safety rules. Rewrite it without real people's likenesses, other companies' brands or sensitive content, and try again. Nothing was charged.",
  rate: "The image provider is busy or its rate limit was reached. Wait a minute and try again.",
  quota: "The image provider account has no credit or has hit its spending limit. Top it up with the provider, then try again.",
  auth: "The image provider rejected the API key. Check it in Settings > Integrations.",
  bad_request: "The image provider couldn't process that request. Shorten the brief or change the reference pictures and try again.",
  provider: "The image provider had a temporary problem. Please try again.",
  unreachable: "Could not reach the image provider. Check the connection and try again.",
};

export const providerError = (code: ImageErrorCode, retryable = false) => new ImageProviderError(code, MESSAGES[code], retryable);
