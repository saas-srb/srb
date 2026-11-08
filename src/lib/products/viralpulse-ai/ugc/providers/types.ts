import type { AspectRatio, ProviderId } from "../types";

/**
 * The seam between the UGC engine and a video model. Everything provider specific (endpoints, field names, moderation wording) lives
 * in an implementation of this; the engine only knows these shapes. Pure types, so tests can fake a provider in a few lines.
 */

export type Resolution = "720p" | "1080p";

export interface RefImage {
  data: Buffer;
  mimeType: string;
}

export interface VideoRequest {
  prompt: string;
  /** Aspect the PROVIDER renders (it only does 9:16 and 16:9; a 1:1 project is rendered 9:16 and cropped in assembly). */
  aspect: "9:16" | "16:9";
  durationSecs: number;
  resolution: Resolution;
  /** Subject/reference photos (consented, never public figures). */
  referenceImages?: RefImage[];
  /** Image the clip starts from (continuity from the previous scene's last frame). */
  firstFrame?: RefImage;
  model: string;
}

export interface ProviderCapabilities {
  id: ProviderId;
  label: string;
  models: string[];
  defaultModel: string;
  /** Lengths the provider will render. Empty = the provider picks (prompted, not controlled). */
  allowedDurations: number[];
  /** "param" = a request field; "prompt" = only steered in the prompt and read back from the file. */
  durationControl: "param" | "prompt";
  /** For prompt-controlled providers: the inclusive range a clip is expected to fall in. */
  promptDurationRange?: [number, number];
  maxReferenceImages: number;
  supportsFirstFrame: boolean;
  nativeAudio: boolean;
  aspects: Array<"9:16" | "16:9">;
}

export type RemoteStatus =
  | { state: "running" }
  | { state: "succeeded" }
  | { state: "failed"; error: ProviderFailure }
  | { state: "cancelled" };

export interface ProviderFailure {
  code: "moderation" | "invalid_request" | "auth" | "quota" | "timeout" | "provider_error";
  /** Plain-language message safe to show in the UI. */
  message: string;
  /** Worth another attempt (transient). Moderation and invalid requests never are. */
  retryable: boolean;
}

export class ProviderError extends Error {
  constructor(public failure: ProviderFailure, public httpStatus?: number) {
    super(failure.message);
  }
}

export interface FetchedVideo {
  data: Buffer;
  contentType: string;
}

export interface VideoProvider {
  readonly capabilities: ProviderCapabilities;
  /** Starts a job and returns the provider's id for it. Must not block until the video is ready. */
  submit(req: VideoRequest): Promise<{ providerJobId: string }>;
  poll(providerJobId: string): Promise<RemoteStatus>;
  /** Downloads the finished file (call only after `poll` says succeeded). */
  fetchResult(providerJobId: string): Promise<FetchedVideo>;
  /** Best effort; resolves even when the provider can no longer cancel. */
  cancel(providerJobId: string): Promise<void>;
  /** USD for rendering `durationSecs` of video; the estimate shown before approval and the figure booked afterwards. */
  estimateCost(req: Pick<VideoRequest, "durationSecs" | "resolution" | "model">): number;
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Maps a provider's refusal text to a plain message. Shared by the implementations. */
export function mapModeration(raw: string): ProviderFailure | null {
  const t = raw.toLowerCase();
  if (/(minor|child|under\s?18|underage)/.test(t)) return { code: "moderation", retryable: false, message: "The video model declined this scene because it may show a minor. UGC Studio only creates adult actors; rewrite the scene and try again." };
  if (/(celebrity|public figure|real person|likeness|recogni[sz]able person|famous)/.test(t)) return { code: "moderation", retryable: false, message: "The video model declined this scene because it appears to depict a real or recognisable person. Describe a fictional adult instead." };
  if (/(copyright|trademark|brand|third[- ]party)/.test(t)) return { code: "moderation", retryable: false, message: "The video model declined this scene because it appears to use copyrighted or branded material. Remove the reference and try again." };
  if (/(safety|blocked|prohibited|violat|policy|moderat|sensitive|harmful|rai|filtered|not allowed|unsafe)/.test(t)) return { code: "moderation", retryable: false, message: "The video model's safety filter declined this scene. Rewrite it more neutrally (no violence, adult, or sensitive content) and try again." };
  return null;
}

export function mapHttpFailure(status: number, body: string): ProviderFailure {
  const mod = status === 400 ? mapModeration(body) : null;
  if (mod) return mod;
  if (status === 401 || status === 403) return { code: "auth", retryable: false, message: "The video provider rejected the API key. Check the Gemini key in Settings -> Integrations (and that it has video generation enabled)." };
  if (status === 429) return { code: "quota", retryable: true, message: "The video provider's rate limit or quota was reached. It will be retried automatically." };
  if (status === 400 || status === 404 || status === 422) return { code: "invalid_request", retryable: false, message: "The video provider could not process this scene's request. Adjust the scene and try again." };
  return { code: "provider_error", retryable: true, message: "The video provider had a temporary problem. It will be retried automatically." };
}

export function aspectForProvider(a: AspectRatio): "9:16" | "16:9" {
  return a === "16:9" ? "16:9" : "9:16";
}
