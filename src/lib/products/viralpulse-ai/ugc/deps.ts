import type { FfmpegRunner } from "./assemble";
import type { LlmClient } from "./script";
import type { UgcStyle } from "./styles/types";
import type { RefImage, VideoProvider } from "./providers/types";
import type { ProviderId } from "./types";

/**
 * Everything the engine needs from outside itself. The production wiring is `deps-default.ts`; the tests pass fakes, so no test ever
 * reaches a real video model, LLM, storage or billing call.
 */
export interface EngineDeps {
  now(): Date;
  token(): string;
  getProvider(id: ProviderId): Promise<VideoProvider>;
  llm(): LlmClient;
  resolveStyle(id: string): UgcStyle | null;
  /** Stores a finished scene clip in the media library; returns its ids. */
  saveClip(buf: Buffer, info: { projectId: string; sceneIndex: number; provider: string; model: string; prompt: string; durationSecs: number; aspect: string; name: string }, actorId: string): Promise<{ mediaId: string; storageKey: string }>;
  saveRender(args: { video: Buffer; thumbnail: Buffer | null; projectId: string; provider: string; model: string; name: string; aspect: string; durationSecs: number; script: string; caption: string; disclosureRequired: boolean }, actorId: string): Promise<{ mediaId: string; thumbnailId: string | null }>;
  readBlob(storageKey: string): Promise<Buffer>;
  mediaInfo(mediaId: string): Promise<{ kind: "image" | "video"; storageKey: string; contentType: string; ai: boolean } | null>;
  readReference(mediaId: string): Promise<RefImage | null>;
  ffmpeg(): Promise<FfmpegRunner | null>;
  meter(e: { projectId: string; kind: "video" | "plan"; seconds: number; costUsd: number; provider: string; model: string; own: boolean }): Promise<void>;
  audit(e: { actorId: string; actorEmail: string | null; action: string; entity: "ugc" | "post" | "media"; entityId: string; entityLabel: string | null; summary: string; metadata?: Record<string, unknown> }): Promise<void>;
  notify(userIds: string[], n: { type: "smms_ugc_ready" | "smms_ugc_failed" | "smms_ugc_approval"; title: string; body: string; link: string }): Promise<void>;
  managerIds(): Promise<string[]>;
  /** Removes a media item from the library (used when a style sample is deleted or replaced). Optional: best effort. */
  deleteMedia?(mediaId: string, actorId: string): Promise<void>;
  /** Attaches a media item to a post (library-level; the engine does not know post internals). */
  attachMedia(postId: string, mediaId: string, thumbnailId: string | null, actorId: string): Promise<{ title: string; platforms: string[] }>;
}

export interface Actor {
  userId: string;
  email: string | null;
  /** May approve spend above the company threshold (PUBLISH_CONTENT). */
  canApprove: boolean;
}
