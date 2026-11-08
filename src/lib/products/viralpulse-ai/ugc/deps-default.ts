import "server-only";
import { randomUUID } from "node:crypto";
import { getObject } from "@/lib/storage/blob";
import { deleteMedia, getMedia, saveAiImage, saveAiVideo, type AiMediaMeta } from "@/lib/products/viralpulse-ai/media";
import { requirePost, updatePost } from "@/lib/products/viralpulse-ai/posts";
import { recordAudit, type AuditAction } from "@/lib/products/viralpulse-ai/audit";
import { notifySmmsUsers } from "@/lib/products/viralpulse-ai/notifications";
import { smmsUsersWith } from "@/lib/products/viralpulse-ai/publishing";
import { recordAiUsage } from "@/lib/platform/billing/ai-usage-log";
import { outputSize } from "./captions";
import { findFfmpeg, spawnRunner } from "./assemble";
import { getVideoProvider } from "./providers";
import { openAiLlm } from "./script-openai";
import { getStyle } from "./styles";
import type { EngineDeps } from "./deps";
import type { UgcStyle } from "./styles/types";

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Production wiring: the company's own Gemini/OpenAI keys, the shared Blob store, the media library, the audit log and the notification bell. */
export function defaultDeps(): EngineDeps {
  const aiMeta = (info: { projectId: string; provider: string; model: string }, role: AiMediaMeta["role"], sceneIndex?: number): AiMediaMeta => ({ aiGenerated: true, provider: info.provider, model: info.model, projectId: info.projectId, role, ...(sceneIndex === undefined ? {} : { sceneIndex }), disclosureRequired: true });
  return {
    now: () => new Date(),
    token: () => randomUUID(),
    getProvider: (id) => getVideoProvider(id),
    llm: () => openAiLlm(),
    resolveStyle: (id) => (getStyle(id) as UgcStyle | undefined) ?? null,
    async saveClip(buf, info, actorId) {
      const { w, h } = outputSize(info.aspect === "16:9" ? "16:9" : "9:16");
      const m = await saveAiVideo(buf, { name: info.name, creativePrompt: info.prompt, platform: null, width: w, height: h, durationSec: Math.round(info.durationSecs), thumbnailId: null, script: "", caption: "", tags: ["ugc-scene"], ai: aiMeta(info, "scene", info.sceneIndex) }, actorId);
      return { mediaId: m._id, storageKey: m.storageKey };
    },
    async saveRender(a, actorId) {
      const { w, h } = outputSize(a.aspect === "16:9" ? "16:9" : a.aspect === "1:1" ? "1:1" : "9:16");
      let thumbnailId: string | null = null;
      if (a.thumbnail) {
        const t = await saveAiImage(a.thumbnail, { name: `${a.name} thumbnail`, creativePrompt: "", platform: null, width: w, height: h, tags: ["ugc-thumbnail"], contentType: "image/jpeg", ai: aiMeta(a, "thumbnail") }, actorId);
        thumbnailId = t._id;
      }
      const m = await saveAiVideo(a.video, { name: a.name, creativePrompt: "", platform: null, width: w, height: h, durationSec: Math.round(a.durationSecs), thumbnailId, script: a.script, caption: a.caption, tags: ["ugc-final"], ai: aiMeta(a, "render") }, actorId);
      return { mediaId: m._id, thumbnailId };
    },
    async readBlob(storageKey) {
      const o = await getObject(storageKey);
      if (!o) throw new Error("A stored scene clip is missing.");
      return streamToBuffer(o.stream);
    },
    async mediaInfo(mediaId) {
      const m = await getMedia(mediaId);
      return m ? { kind: m.kind, storageKey: m.storageKey, contentType: m.contentType, ai: !!m.ai?.aiGenerated } : null;
    },
    async readReference(mediaId) {
      const m = await getMedia(mediaId);
      if (!m || m.kind !== "image" || !["image/jpeg", "image/png", "image/webp"].includes(m.contentType)) return null;
      const o = await getObject(m.storageKey);
      return o ? { data: await streamToBuffer(o.stream), mimeType: m.contentType } : null;
    },
    async ffmpeg() {
      const bin = await findFfmpeg();
      return bin ? spawnRunner(bin) : null;
    },
    async meter(e) {
      // Video is billed by the company's own Google account (no SelfRun fallback key exists), so it never draws on the plan's AI-token
      // allowance. It is still logged in the company's AI usage history: Omni bills 5,792 output tokens per second of 720p video.
      if (e.kind === "video" && e.provider === "omni") await recordAiUsage({ usage: { input_tokens: 0, output_tokens: Math.round(e.seconds * 5792) }, model: e.model, endpoint: "interactions", feature: "AI UGC Studio (video)" });
    },
    async audit(e) {
      await recordAudit({ actorId: e.actorId, actorEmail: e.actorEmail, action: e.action as AuditAction, entity: e.entity, entityId: e.entityId, entityLabel: e.entityLabel, recordId: e.entity === "ugc" ? e.entityId : null, summary: e.summary, metadata: e.metadata ?? null });
    },
    async notify(ids, n) {
      await notifySmmsUsers(ids, n);
    },
    managerIds: () => smmsUsersWith("PUBLISH_CONTENT"),
    async deleteMedia(mediaId, actorId) {
      await deleteMedia(mediaId, actorId);
    },
    async attachMedia(postId, mediaId, thumbnailId, actorId) {
      const post = await requirePost(postId);
      const mediaIds = post.mediaIds.includes(mediaId) ? post.mediaIds : [...post.mediaIds, mediaId].slice(0, 10);
      await updatePost(postId, { mediaIds, thumbnailId: post.thumbnailId ?? thumbnailId, contentType: "video" }, actorId);
      return { title: post.title, platforms: post.variants.map((v) => v.platform) };
    },
  };
}
