import { call, chunks } from "./http";
import { ProviderError } from "./errors";
import { baseValidate, issue } from "./validate";
import type { Capabilities, PlatformPublisher, PublishCtx, PublishIssue, PublishResult } from "./types";

/**
 * YouTube Data API v3: videos.insert via the resumable protocol, streamed from storage in 8 MiB chunks (one chunk in memory),
 * thumbnails.set afterwards. privacyStatus comes from the post (default private, never hardcoded public), madeForKids must be
 * declared, containsSyntheticMedia is set for AI-generated videos, publishAt schedules natively. Spec: SPEC.md.
 */

export const YT_CHUNK = 8 * 1024 * 1024; // must be a multiple of 256 KiB
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";

export const youtubeCapabilities: Capabilities = {
  label: "YouTube",
  formats: ["video", "short"],
  maxImages: 0,
  maxVideos: 1,
  imageTypes: [],
  videoTypes: ["video/mp4", "video/quicktime", "video/webm"],
  maxImageBytes: null,
  maxVideoBytes: 256 * 1024 ** 3,
  videoDurationSec: null,
  aspect: null,
  captionLimit: 5000,
  hashtagLimit: 15,
  nativeScheduling: true,
  dailyBudget: 100,
  nativeAiLabel: true,
  needsAppApproval: "Google OAuth consent-screen verification for the sensitive youtube.upload scope; YouTube API Services audit if uploads must not be restricted",
  unverified: ["captionLimit", "hashtagLimit"],
};

/** Shorts are classified by YouTube itself (no API flag): vertical or square and at most 3 minutes (help-centre rule, not in the API reference). */
export function looksLikeShort(v: { width: number | null; height: number | null; durationSec: number | null } | null): boolean {
  return Boolean(v && v.width && v.height && v.width <= v.height && v.durationSec != null && v.durationSec <= 180);
}

function validate(post: Parameters<PlatformPublisher["validate"]>[0], media: Parameters<PlatformPublisher["validate"]>[1]): PublishIssue[] {
  const out = baseValidate(youtubeCapabilities, post, media);
  const y = post.options.youtube ?? {};
  if (!media.video) out.push(issue("video_required", "error", "YouTube needs a video.", "Attach a video."));
  const title = (post.variant.title || post.title).trim();
  if (!title) out.push(issue("title_required", "error", "A YouTube video needs a title.", "Write a title (up to 100 characters)."));
  if (title.length > 100) out.push(issue("title_too_long", "error", `The title is ${title.length} characters; YouTube allows 100.`, "Shorten the title."));
  if (y.madeForKids === undefined) out.push(issue("made_for_kids", "error", "Say whether the video is made for kids.", "Choose \"Yes, it's made for kids\" or \"No\" - YouTube requires this declaration."));
  if (post.variant.keywords.join(",").length > 500) out.push(issue("tags_too_long", "warning", "Tags total more than 500 characters; YouTube ignores the excess.", "Use fewer keywords."));
  if (/[<>]/.test(title) || /[<>]/.test(post.caption)) out.push(issue("angle_brackets", "error", "YouTube doesn't allow < or > in the title or description.", "Remove them."));
  if (y.privacy === "public") out.push(issue("public_visibility", "warning", "This video will be public as soon as it is uploaded.", "Choose private or unlisted to review it first."));
  if (!y.privacy) out.push(issue("private_default", "warning", "No visibility chosen: the video will be uploaded as private.", "Choose public or unlisted if it should go live."));
  return out;
}

async function init(ctx: PublishCtx): Promise<string> {
  const v = ctx.video!;
  const y = ctx.post.options.youtube ?? {};
  const short = y.short ?? looksLikeShort(v);
  const privacy = ctx.scheduleAt ? "private" : (y.privacy ?? "private"); // publishAt requires private
  let description = ctx.post.caption;
  if (short && !/#shorts\b/i.test(description)) description = `${description}\n\n#Shorts`.slice(0, 5000);
  const body = {
    snippet: { title: (ctx.post.variant.title || ctx.post.title).trim().slice(0, 100), description, tags: ctx.post.variant.keywords.slice(0, 30), ...(y.categoryId ? { categoryId: y.categoryId } : { categoryId: "22" }) },
    status: {
      privacyStatus: privacy,
      selfDeclaredMadeForKids: y.madeForKids === true,
      ...(ctx.post.aiNative ? { containsSyntheticMedia: true } : {}),
      ...(ctx.scheduleAt ? { publishAt: ctx.scheduleAt.toISOString() } : {}),
    },
  };
  const r = await call(
    ctx,
    (token) => ({
      url: `${UPLOAD}?uploadType=resumable&part=snippet,status`,
      init: { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(v.size), "X-Upload-Content-Type": v.contentType }, body: JSON.stringify(body) },
    }),
    { label: "YouTube", idempotent: false },
  );
  const loc = r.headers.get("location");
  if (!loc) throw new ProviderError({ klass: "permanent", message: "YouTube didn't return an upload address.", hint: "Retry; if it repeats, reconnect the account." });
  return loc;
}

/** Asks the session how many bytes arrived. Returns the finished resource when the upload is already complete. */
async function probe(ctx: PublishCtx, uploadUrl: string, total: number): Promise<{ offset: number; done: { id: string } | null }> {
  const r = await call<{ id?: string }>(ctx, (token) => ({ url: uploadUrl, init: { method: "PUT", redirect: "manual", headers: { Authorization: `Bearer ${token}`, "Content-Length": "0", "Content-Range": `bytes */${total}` } } }), { label: "YouTube", idempotent: true, okStatuses: [308] });
  if (r.status === 308) {
    const m = /bytes=0-(\d+)/.exec(r.headers.get("range") ?? "");
    return { offset: m ? Number(m[1]) + 1 : 0, done: null };
  }
  return { offset: total, done: r.body?.id ? { id: r.body.id } : null };
}

async function upload(ctx: PublishCtx, uploadUrl: string): Promise<string> {
  const v = ctx.video!;
  const total = v.size;
  const first = await probe(ctx, uploadUrl, total);
  let offset = first.offset;
  const done = first.done;
  if (done) return done.id;
  const stream = await ctx.openStream(v.id);
  let pos = 0;
  for await (const chunk of chunks(stream, YT_CHUNK)) {
    const start = pos;
    pos += chunk.length;
    if (pos <= offset) continue; // already stored by YouTube
    const from = Math.max(start, offset);
    const part = chunk.subarray(from - start);
    const r = await call<{ id?: string }>(
      ctx,
      (token) => ({ url: uploadUrl, init: { method: "PUT", redirect: "manual", headers: { Authorization: `Bearer ${token}`, "Content-Type": v.contentType, "Content-Range": `bytes ${from}-${pos - 1}/${total}` }, body: new Uint8Array(part) } }),
      { label: "YouTube", idempotent: true, okStatuses: [308], timeoutMs: 120_000 },
    );
    offset = pos;
    if (r.status !== 308) {
      if (!r.body?.id) throw new ProviderError({ klass: "permanent", message: "YouTube finished the upload without returning a video id.", hint: "Check your channel before retrying." });
      return r.body.id;
    }
    await ctx.checkpoint({ uploadedBytes: offset });
  }
  const last = await probe(ctx, uploadUrl, total);
  if (last.done) return last.done.id;
  throw new ProviderError({ klass: "transient", message: "The YouTube upload ended early.", hint: "It will resume where it stopped." });
}

async function publish(ctx: PublishCtx): Promise<PublishResult> {
  if (!ctx.video) throw new ProviderError({ klass: "media", message: "YouTube needs a video.", hint: "Attach a video.", code: "no_video" });
  let videoId = ctx.data.videoId as string | undefined;
  const warnings: string[] = [];
  if (!videoId) {
    let uploadUrl = ctx.data.uploadUrl as string | undefined;
    if (!uploadUrl) {
      uploadUrl = await init(ctx);
      await ctx.checkpoint({ uploadUrl });
    }
    try {
      videoId = await upload(ctx, uploadUrl);
    } catch (e) {
      // An expired or unknown session (404/410) cannot be resumed: start a new one next time.
      if (e instanceof ProviderError && (e.status === 404 || e.status === 410)) await ctx.checkpoint({ uploadUrl: null, uploadedBytes: 0 });
      throw e;
    }
    await ctx.checkpoint({ videoId });
  }
  if (ctx.thumbnail && !ctx.data.thumbnailDone) {
    try {
      const { bytes, contentType } = await ctx.imageBytes(ctx.thumbnail.id, { jpeg: true });
      if (bytes.length > 2 * 1024 * 1024) throw new ProviderError({ klass: "media", message: "The thumbnail is larger than 2 MB.", hint: "Use a smaller thumbnail." });
      await call(ctx, (token) => ({ url: `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId!)}&uploadType=media`, init: { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType }, body: new Uint8Array(bytes) } }), { label: "YouTube", idempotent: true });
      await ctx.checkpoint({ thumbnailDone: true });
    } catch (e) {
      warnings.push(`Thumbnail not set: ${(e as Error).message}`);
      ctx.log("thumbnail_failed", { message: (e as Error).message });
    }
  }
  return { externalId: videoId, url: `https://www.youtube.com/watch?v=${videoId}`, ...(warnings.length ? { warnings } : {}) };
}

export const youtube: PlatformPublisher = {
  platform: "youtube",
  capabilities: youtubeCapabilities,
  validate,
  publish,
  // The resumable session is the idempotency mechanism: a lost final response is recovered by probing the session.
  async reconcile() {
    return null;
  },
  async delete(ctx, externalId) {
    await call(ctx, (token) => ({ url: `https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(externalId)}`, init: { method: "DELETE", headers: { Authorization: `Bearer ${token}` } } }), { label: "YouTube", idempotent: true });
  },
};
