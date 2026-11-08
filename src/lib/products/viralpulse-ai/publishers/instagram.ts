import { graphGet, graphPost, pendingOrTimeout } from "./meta-common";
import { ProviderError } from "./errors";
import { baseValidate, issue } from "./validate";
import type { Capabilities, PlatformPublisher, PublishCtx, PublishIssue, PublishResult } from "./types";

/**
 * Instagram (professional account via the Meta Graph API, Facebook Login flow). Spec and verification date: SPEC.md.
 * Flow: [quota check] -> create container(s) -> poll status_code (across runs, never blocking) -> media_publish (the commit point).
 */

export const instagramCapabilities: Capabilities = {
  label: "Instagram",
  formats: ["image", "carousel", "video", "reel", "story"],
  maxImages: 20,
  maxVideos: 1,
  imageTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"], // non-JPEG is converted to JPEG (Instagram accepts JPEG only)
  videoTypes: ["video/mp4", "video/quicktime"],
  maxImageBytes: 8 * 1024 * 1024,
  maxVideoBytes: 1024 * 1024 * 1024,
  videoDurationSec: { min: 3, max: 900 },
  aspect: { min: 0.8, max: 1.91 }, // feed images 4:5 .. 1.91:1; reels/stories are checked separately
  captionLimit: 2200,
  hashtagLimit: 30,
  nativeScheduling: false,
  dailyBudget: 100,
  nativeAiLabel: true,
  needsAppApproval: "Meta App Review (instagram_content_publish) + Business Verification for accounts other than the app's own role holders",
  unverified: ["captionLimit", "hashtagLimit", "videoDuration", "aspect"],
};

type Format = "feed" | "reel" | "story";
export function igFormat(ctx: { post: { options: { instagram?: { format?: Format } } }; video: unknown }): Format {
  return ctx.post.options.instagram?.format ?? (ctx.video ? "reel" : "feed");
}

function validate(post: Parameters<PlatformPublisher["validate"]>[0], media: Parameters<PlatformPublisher["validate"]>[1]): PublishIssue[] {
  const fmt = post.options.instagram?.format ?? (media.video ? "reel" : "feed");
  const caps = fmt === "feed" ? instagramCapabilities : { ...instagramCapabilities, aspect: { min: 0.01, max: 10 } };
  const out = baseValidate(caps, post, media);
  if (!media.video && media.images.length === 0) out.push(issue("media_required", "error", "Instagram posts need an image or a video.", "Attach media."));
  if (media.video) {
    const r = media.video.width && media.video.height ? media.video.width / media.video.height : null;
    if (r && fmt !== "feed" && Math.abs(r - 9 / 16) > 0.08) out.push(issue("reel_not_vertical", "warning", `Reels and Stories are 9:16; this video is ${r.toFixed(2)}:1, so Instagram will crop or letterbox it.`, "Export it vertically (1080×1920).", media.video.id));
    if (fmt === "story" && (media.video.durationSec ?? 0) > 60) out.push(issue("story_too_long", "warning", "Stories longer than 60 seconds are cut into parts or rejected.", "Trim to 60 seconds or less.", media.video.id));
  }
  for (const m of media.images) if (m.contentType !== "image/jpeg") out.push(issue("converted_to_jpeg", "warning", `"${m.name}" is ${m.contentType}; Instagram only takes JPEG, so a JPEG copy is sent.`, "No action needed.", m.id));
  if (media.images.length > 1 && media.images.some((m) => m.altText) ) out.push(issue("carousel_alt_text", "warning", "Alt text is applied to single-image posts only.", "No action needed."));
  return out;
}

async function precheck(ctx: PublishCtx): Promise<void> {
  const r = await graphGet<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(ctx, "Instagram", `/${ctx.creds.targetId}/content_publishing_limit`, { fields: "quota_usage,config" });
  const row = r.data?.[0];
  const total = row?.config?.quota_total ?? instagramCapabilities.dailyBudget ?? 100;
  if (typeof row?.quota_usage === "number" && row.quota_usage >= total)
    throw new ProviderError({ klass: "rate_limit", message: `Instagram's 24-hour publishing limit is used up (${row.quota_usage}/${total}).`, hint: "It will be retried automatically once the limit rolls over.", retryAfterMs: 60 * 60_000, code: "ig_quota" });
}

async function createContainer(ctx: PublishCtx): Promise<string> {
  const ig = ctx.creds.targetId;
  const o = ctx.post.options.instagram ?? {};
  const fmt = igFormat(ctx);
  const ai = ctx.post.aiNative ? { is_ai_generated: true } : {};
  const caption = fmt === "story" ? undefined : ctx.post.caption;
  if (fmt === "feed" && !ctx.video && ctx.images.length > 1) {
    const children: string[] = (ctx.data.children as string[] | undefined) ?? [];
    for (let i = children.length; i < ctx.images.length; i++) {
      const c = await graphPost<{ id: string }>(ctx, "Instagram", `/${ig}/media`, { image_url: await ctx.publicUrl(ctx.images[i].id, { jpeg: true }), is_carousel_item: true });
      children.push(c.id);
      await ctx.checkpoint({ children });
    }
    return (await graphPost<{ id: string }>(ctx, "Instagram", `/${ig}/media`, { media_type: "CAROUSEL", children: children.join(","), caption, location_id: o.locationId, ...ai })).id;
  }
  if (ctx.video) {
    const type = fmt === "story" ? "STORIES" : "REELS";
    return (
      await graphPost<{ id: string }>(ctx, "Instagram", `/${ig}/media`, {
        media_type: type,
        video_url: await ctx.publicUrl(ctx.video.id),
        caption,
        ...(type === "REELS" ? { share_to_feed: o.shareToFeed ?? true, cover_url: ctx.thumbnail ? await ctx.publicUrl(ctx.thumbnail.id, { jpeg: true }) : undefined } : {}),
        location_id: o.locationId,
        ...ai,
      })
    ).id;
  }
  const img = ctx.images[0];
  return (
    await graphPost<{ id: string }>(ctx, "Instagram", `/${ig}/media`, {
      image_url: await ctx.publicUrl(img.id, { jpeg: true }),
      ...(fmt === "story" ? { media_type: "STORIES" } : { caption, alt_text: img.altText || undefined, location_id: o.locationId }),
      ...ai,
    })
  ).id;
}

const containerStatus = (ctx: PublishCtx, id: string) => graphGet<{ status_code?: string; status?: string }>(ctx, "Instagram", `/${id}`, { fields: "status_code,status" });

async function publish(ctx: PublishCtx): Promise<PublishResult> {
  const ig = ctx.creds.targetId;
  let containerId = ctx.data.containerId as string | undefined;
  if (!containerId) {
    await precheck(ctx);
    containerId = await createContainer(ctx);
    await ctx.checkpoint({ containerId, containerAt: ctx.now().toISOString() });
  }
  if (!ctx.committed) {
    const st = await containerStatus(ctx, containerId);
    if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
      if (st.status_code === "EXPIRED") await ctx.checkpoint({ containerId: null, children: null });
      throw new ProviderError({ klass: st.status_code === "EXPIRED" ? "transient" : "media", message: `Instagram couldn't process the media (${st.status_code}${st.status ? `: ${st.status}` : ""}).`, hint: st.status_code === "EXPIRED" ? "The upload expired before it was published; it will be recreated." : "Check the image/video format, size and shape, then publish again.", code: `ig_${st.status_code}` });
    }
    if (st.status_code !== "FINISHED" && st.status_code) pendingOrTimeout(ctx, ctx.data.containerAt as string | undefined, "Instagram");
    await ctx.markCommitPoint();
  }
  const pub = await graphPost<{ id: string }>(ctx, "Instagram", `/${ig}/media_publish`, { creation_id: containerId });
  return finish(ctx, pub.id);
}

async function finish(ctx: PublishCtx, mediaId: string): Promise<PublishResult> {
  let url: string | null = null;
  try {
    url = (await graphGet<{ permalink?: string }>(ctx, "Instagram", `/${mediaId}`, { fields: "permalink" })).permalink ?? null;
  } catch (e) {
    ctx.log("permalink_failed", { message: (e as Error).message });
  }
  return { externalId: mediaId, url, extraIds: { containerId: String(ctx.data.containerId ?? "") } };
}

/** The media_publish response was lost: ask Instagram whether that container was published. */
async function reconcile(ctx: PublishCtx): Promise<PublishResult | null> {
  const containerId = ctx.data.containerId as string | undefined;
  if (!containerId) return null;
  const st = await containerStatus(ctx, containerId);
  if (st.status_code !== "PUBLISHED") return null; // a container can be published only once; not published yet -> safe to call media_publish again
  const recent = await graphGet<{ data?: { id: string; timestamp?: string; caption?: string }[] }>(ctx, "Instagram", `/${ctx.creds.targetId}/media`, { fields: "id,timestamp,caption", limit: "10" });
  const since = Date.parse((ctx.data.containerAt as string | undefined) ?? "") || 0;
  const hit = recent.data?.find((m) => Date.parse(m.timestamp ?? "") >= since - 60_000 && (m.caption ?? "").trim().slice(0, 40) === ctx.post.caption.trim().slice(0, 40));
  if (hit) return finish(ctx, hit.id);
  throw new ProviderError({ klass: "ambiguous", message: "Instagram says the container was published, but the post couldn't be matched.", hint: "Open Instagram, check whether the post is there, and mark it as published here.", code: "ig_unmatched" });
}

export const instagram: PlatformPublisher = {
  platform: "instagram",
  capabilities: instagramCapabilities,
  validate,
  publish,
  reconcile,
  precheck,
  async status(ctx, externalId) {
    const r = await graphGet<{ id?: string }>(ctx, "Instagram", `/${externalId}`, { fields: "id" });
    return { state: r.id ? "published" : "failed" };
  },
  async delete() {
    throw new ProviderError({ klass: "permanent", message: "Instagram's API can't delete posts.", hint: "Delete it in the Instagram app." });
  },
};
