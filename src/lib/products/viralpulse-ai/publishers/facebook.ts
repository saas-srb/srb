import { call } from "./http";
import { graphGet, graphPost, graphBase, pendingOrTimeout } from "./meta-common";
import { ProviderError } from "./errors";
import { baseValidate, issue } from "./validate";
import type { Capabilities, PlatformPublisher, PublishCtx, PublishIssue, PublishResult } from "./types";

/**
 * Facebook Pages. Text/link -> /{page}/feed; one photo -> /{page}/photos; several photos -> unpublished photos + /feed attached_media;
 * video -> graph-video /{page}/videos (file_url); Reels -> /{page}/video_reels (start, rupload with file_url, finish). Spec: SPEC.md.
 */

export const facebookCapabilities: Capabilities = {
  label: "Facebook",
  formats: ["text", "link", "image", "carousel", "video", "reel"],
  maxImages: 10,
  maxVideos: 1,
  imageTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  videoTypes: ["video/mp4", "video/quicktime"],
  maxImageBytes: 10 * 1024 * 1024,
  maxVideoBytes: 1024 * 1024 * 1024,
  videoDurationSec: null,
  aspect: null,
  captionLimit: 63206,
  hashtagLimit: null,
  nativeScheduling: true,
  dailyBudget: 30,
  nativeAiLabel: true, // Reels only (is_ai_generated)
  needsAppApproval: "Meta App Review (pages_manage_posts, publish_video) for Pages other than ones the app's role holders manage",
  unverified: ["captionLimit"],
};


function validate(post: Parameters<PlatformPublisher["validate"]>[0], media: Parameters<PlatformPublisher["validate"]>[1]): PublishIssue[] {
  const reel = post.options.facebook?.format === "reel";
  const caps: Capabilities = reel ? { ...facebookCapabilities, maxImages: 0, videoDurationSec: { min: 3, max: 90 }, aspect: { min: 9 / 16 - 0.01, max: 16 / 9 }, unverified: ["captionLimit"] } : facebookCapabilities;
  const out = baseValidate(caps, post, media);
  if (reel) {
    if (!media.video) out.push(issue("reel_needs_video", "error", "A Facebook Reel needs a video.", "Attach a vertical video of 3–90 seconds."));
    const v = media.video;
    if (v?.width && v?.height) {
      if (Math.abs(v.width / v.height - 9 / 16) > 0.05) out.push(issue("reel_not_vertical", "warning", `Reels are 9:16; this video is ${v.width}×${v.height}.`, "Export it vertically (1080×1920).", v.id));
      if (v.width < 540 || v.height < 960) out.push(issue("reel_resolution", "error", `Reels must be at least 540×960; this is ${v.width}×${v.height}.`, "Export at 1080×1920.", v.id));
    }
  } else if (!post.caption.trim() && !media.video && media.images.length === 0 && !post.link) out.push(issue("empty", "error", "Nothing to post.", "Write text or attach media."));
  if (media.images.some((m) => m.altText)) out.push(issue("fb_alt_text", "warning", "Facebook alt text isn't sent through the API.", "Add it in Facebook after publishing if needed."));
  return out;
}

const sched = (ctx: PublishCtx) => (ctx.scheduleAt ? { published: false, scheduled_publish_time: Math.floor(ctx.scheduleAt.getTime() / 1000) } : {});
const postUrl = (id: string) => `https://www.facebook.com/${id}`;

async function publishFeed(ctx: PublishCtx): Promise<PublishResult> {
  const page = ctx.creds.targetId;
  const message = ctx.post.caption;
  if (ctx.video) {
    await ctx.markCommitPoint();
    const r = await graphPost<{ id: string }>(ctx, "Facebook", `${graphBase(ctx).replace("graph.", "graph-video.")}/${page}/videos`, { file_url: await ctx.publicUrl(ctx.video.id), description: message, title: ctx.post.variant.title || undefined, ...sched(ctx) });
    return { externalId: r.id, url: `https://www.facebook.com/${page}/videos/${r.id}` };
  }
  if (ctx.images.length === 1) {
    await ctx.markCommitPoint();
    const r = await graphPost<{ id: string; post_id?: string }>(ctx, "Facebook", `/${page}/photos`, { url: await ctx.publicUrl(ctx.images[0].id), caption: message, ...sched(ctx) });
    return { externalId: r.post_id ?? r.id, url: postUrl(r.post_id ?? r.id) };
  }
  if (ctx.images.length > 1) {
    const ids: string[] = (ctx.data.photoIds as string[] | undefined) ?? [];
    for (let i = ids.length; i < ctx.images.length; i++) {
      const r = await graphPost<{ id: string }>(ctx, "Facebook", `/${page}/photos`, { url: await ctx.publicUrl(ctx.images[i].id), published: false });
      ids.push(r.id);
      await ctx.checkpoint({ photoIds: ids });
    }
    await ctx.markCommitPoint();
    const attached = Object.fromEntries(ids.map((id, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: id })]));
    const r = await graphPost<{ id: string }>(ctx, "Facebook", `/${page}/feed`, { message, ...attached, ...sched(ctx) });
    return { externalId: r.id, url: postUrl(r.id) };
  }
  await ctx.markCommitPoint();
  const r = await graphPost<{ id: string }>(ctx, "Facebook", `/${page}/feed`, { message, link: ctx.post.link ?? undefined, ...sched(ctx) });
  return { externalId: r.id, url: postUrl(r.id) };
}

async function publishReel(ctx: PublishCtx): Promise<PublishResult> {
  if (!ctx.video) throw new ProviderError({ klass: "media", message: "A Facebook Reel needs a video.", hint: "Attach a vertical video.", code: "no_video" });
  const page = ctx.creds.targetId;
  let videoId = ctx.data.videoId as string | undefined;
  if (!videoId) {
    const s = await graphPost<{ video_id: string; upload_url?: string }>(ctx, "Facebook", `/${page}/video_reels`, { upload_phase: "start" });
    videoId = s.video_id;
    await ctx.checkpoint({ videoId, startedAt: ctx.now().toISOString() });
  }
  if (!ctx.data.uploaded) {
    const url = await ctx.publicUrl(ctx.video.id);
    await call(ctx, (token) => ({ url: `https://rupload.facebook.com/video-upload/${videoId}`, init: { method: "POST", headers: { Authorization: `OAuth ${token}`, file_url: url } } }), { label: "Facebook", idempotent: true, timeoutMs: 60_000 });
    await ctx.checkpoint({ uploaded: true });
  }
  if (!ctx.committed) {
    const st = await graphGet<{ status?: { video_status?: string; uploading_phase?: { status?: string }; processing_phase?: { status?: string } } }>(ctx, "Facebook", `/${videoId}`, { fields: "status" });
    const v = st.status?.video_status;
    if (v === "upload_failed" || v === "error" || v === "expired") {
      await ctx.checkpoint({ uploaded: false });
      throw new ProviderError({ klass: v === "upload_failed" ? "transient" : "media", message: `Facebook couldn't process the Reel (${v}).`, hint: "Check the video: 9:16, 3–90 s, H.264/AAC, at least 540×960.", code: `fb_${v}` });
    }
    if (v !== "ready" && v !== "upload_complete") pendingOrTimeout(ctx, ctx.data.startedAt as string | undefined, "Facebook");
    await ctx.markCommitPoint();
  }
  const sc = ctx.scheduleAt;
  await graphPost(ctx, "Facebook", `/${page}/video_reels`, {
    upload_phase: "finish",
    video_id: videoId,
    video_state: sc ? "SCHEDULED" : "PUBLISHED",
    ...(sc ? { scheduled_publish_time: Math.floor(sc.getTime() / 1000) } : {}),
    description: ctx.post.caption,
    title: ctx.post.variant.title || undefined,
    ...(ctx.post.aiNative ? { is_ai_generated: true } : {}),
  });
  return { externalId: videoId, url: `https://www.facebook.com/reel/${videoId}` };
}


async function publish(ctx: PublishCtx): Promise<PublishResult> {
  return ctx.post.options.facebook?.format === "reel" ? publishReel(ctx) : publishFeed(ctx);
}

/** Reels: finishing twice is harmless only if the first one failed; check the video's publishing phase. */
async function reconcile(ctx: PublishCtx): Promise<PublishResult | null> {
  const videoId = ctx.data.videoId as string | undefined;
  if (ctx.post.options.facebook?.format === "reel" && videoId) {
    const st = await graphGet<{ status?: { publishing_phase?: { status?: string } } }>(ctx, "Facebook", `/${videoId}`, { fields: "status" });
    const p = st.status?.publishing_phase?.status;
    if (p === "completed" || p === "in_progress") return { externalId: videoId, url: `https://www.facebook.com/reel/${videoId}` };
    return null;
  }
  throw new ProviderError({ klass: "ambiguous", message: "The Facebook response was lost, so we can't tell whether the post went out.", hint: "Check your Page; if it's there, mark it as published here, otherwise publish again.", code: "fb_ambiguous" });
}

export const facebook: PlatformPublisher = {
  platform: "facebook",
  capabilities: facebookCapabilities,
  validate,
  publish,
  reconcile,
  async delete(ctx, externalId) {
    await call(ctx, (token) => ({ url: `${graphBase(ctx)}/${externalId}?${new URLSearchParams({ access_token: token })}`, init: { method: "DELETE" } }), { label: "Facebook", idempotent: true });
  },
};
