import { call, chunks } from "./http";
import { ProviderError } from "./errors";
import { baseValidate, issue } from "./validate";
import { PendingProcessing, type Capabilities, type PlatformPublisher, type PublishCtx, type PublishIssue, type PublishResult } from "./types";

/**
 * LinkedIn Posts API (/rest/posts) for a member (w_member_social) or an organisation (w_organization_social, Community Management API
 * product). Images via /rest/images, video via /rest/videos (4 MiB parts streamed from storage). The `Linkedin-Version` header comes
 * from `creds.extra.version` (linkedin-version.ts). Spec: SPEC.md.
 */

const BASE = "https://api.linkedin.com/rest";
const PART = 4 * 1024 * 1024;

export const linkedinCapabilities: Capabilities = {
  label: "LinkedIn",
  formats: ["text", "link", "image", "carousel", "video"],
  maxImages: 20,
  maxVideos: 1,
  imageTypes: ["image/jpeg", "image/png", "image/gif"],
  videoTypes: ["video/mp4"],
  maxImageBytes: 36 * 1024 * 1024,
  maxVideoBytes: 500 * 1024 * 1024,
  videoDurationSec: { min: 3, max: 1800 },
  aspect: null,
  captionLimit: 3000,
  hashtagLimit: null,
  nativeScheduling: false,
  dailyBudget: null,
  nativeAiLabel: false,
  needsAppApproval: "Posting as a company page needs the Community Management API product (LinkedIn approval) and an ADMINISTRATOR / CONTENT_ADMIN role; posting as a member needs the self-serve Share on LinkedIn product",
  unverified: ["captionLimit", "maxImages", "maxImageBytes"],
};

/** Reserved characters of LinkedIn's "little" text format are escaped; # and @ are left so hashtags keep working. */
export function escapeCommentary(s: string): string {
  return s.replace(/([\\|{}[\]()<>*_~])/g, "\\$1");
}

function validate(post: Parameters<PlatformPublisher["validate"]>[0], media: Parameters<PlatformPublisher["validate"]>[1]): PublishIssue[] {
  const out = baseValidate(linkedinCapabilities, post, media);
  if (!post.caption.trim()) out.push(issue("text_required", "error", "A LinkedIn post needs text.", "Write the post text."));
  if (media.video && media.video.size < 75 * 1024) out.push(issue("video_too_small", "error", "LinkedIn videos must be at least 75 KB.", "Use a real video file.", media.video.id));
  if (post.link && !/^https:\/\//i.test(post.link)) out.push(issue("link_not_https", "error", "The link must start with https://.", "Use the secure address."));
  if (post.link && !media.video && media.images.length === 0 && !(post.variant.title || post.title)) out.push(issue("article_title", "error", "A link post needs a title.", "Add a title."));
  return out;
}

const headers = (ctx: PublishCtx, token: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, "Linkedin-Version": ctx.creds.extra?.version ?? "", "X-Restli-Protocol-Version": "2.0.0", "Content-Type": "application/json", ...extra });

async function uploadImage(ctx: PublishCtx, mediaId: string): Promise<string> {
  const author = ctx.creds.targetId;
  const init = await call<{ value: { uploadUrl: string; image: string } }>(ctx, (t) => ({ url: `${BASE}/images?action=initializeUpload`, init: { method: "POST", headers: headers(ctx, t), body: JSON.stringify({ initializeUploadRequest: { owner: author } }) } }), { label: "LinkedIn", idempotent: false });
  const { bytes, contentType } = await ctx.imageBytes(mediaId);
  await call(ctx, (t) => ({ url: init.body.value.uploadUrl, init: { method: "PUT", headers: { Authorization: `Bearer ${t}`, "Content-Type": contentType }, body: new Uint8Array(bytes) } }), { label: "LinkedIn", idempotent: true, timeoutMs: 60_000 });
  return init.body.value.image;
}

async function uploadVideo(ctx: PublishCtx): Promise<string> {
  const v = ctx.video!;
  const init = await call<{ value: { video: string; uploadToken: string; uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[] } }>(ctx, (t) => ({ url: `${BASE}/videos?action=initializeUpload`, init: { method: "POST", headers: headers(ctx, t), body: JSON.stringify({ initializeUploadRequest: { owner: ctx.creds.targetId, fileSizeBytes: v.size, uploadCaptions: false, uploadThumbnail: false } }) } }), { label: "LinkedIn", idempotent: false });
  const val = init.body.value;
  await ctx.checkpoint({ videoUrn: val.video });
  const etags: string[] = [];
  const stream = await ctx.openStream(v.id);
  let i = 0;
  for await (const part of chunks(stream, PART)) {
    const ins = val.uploadInstructions[i++];
    if (!ins) throw new ProviderError({ klass: "permanent", message: "LinkedIn gave fewer upload parts than the file needs.", hint: "Retry the publish." });
    const r = await call(ctx, (t) => ({ url: ins.uploadUrl, init: { method: "PUT", headers: { "Content-Type": "application/octet-stream", Authorization: `Bearer ${t}` }, body: new Uint8Array(part) } }), { label: "LinkedIn", idempotent: true, timeoutMs: 120_000 });
    etags.push(r.headers.get("etag") ?? "");
  }
  await call(ctx, (t) => ({ url: `${BASE}/videos?action=finalizeUpload`, init: { method: "POST", headers: headers(ctx, t), body: JSON.stringify({ finalizeUploadRequest: { video: val.video, uploadToken: val.uploadToken, uploadedPartIds: etags } }) } }), { label: "LinkedIn", idempotent: true });
  await ctx.checkpoint({ videoFinalized: true });
  return val.video;
}

async function waitForVideo(ctx: PublishCtx, urn: string): Promise<void> {
  const r = await call<{ status?: string; processingFailureReason?: string }>(ctx, (t) => ({ url: `${BASE}/videos/${encodeURIComponent(urn)}`, init: { method: "GET", headers: headers(ctx, t) } }), { label: "LinkedIn", idempotent: true });
  const s = r.body.status;
  if (s === "AVAILABLE") return;
  if (s === "PROCESSING_FAILED") throw new ProviderError({ klass: "media", message: `LinkedIn couldn't process the video${r.body.processingFailureReason ? ` (${r.body.processingFailureReason})` : ""}.`, hint: "Use an MP4 (H.264/AAC), 3 seconds to 30 minutes, under 500 MB.", code: "li_processing_failed" });
  const started = Date.parse((ctx.data.videoAt as string | undefined) ?? "") || ctx.now().getTime();
  if (ctx.now().getTime() - started > 30 * 60_000) throw new ProviderError({ klass: "media", message: "LinkedIn is taking too long to process the video.", hint: "Try a smaller file.", code: "li_processing_timeout" });
  throw new PendingProcessing(60_000);
}

async function publish(ctx: PublishCtx): Promise<PublishResult> {
  const author = ctx.creds.targetId;
  let content: Record<string, unknown> | undefined;
  if (ctx.video) {
    let urn = ctx.data.videoUrn as string | undefined;
    if (!ctx.data.videoFinalized) {
      urn = await uploadVideo(ctx);
      await ctx.checkpoint({ videoAt: ctx.now().toISOString() });
    }
    await waitForVideo(ctx, urn!);
    content = { media: { id: urn, title: (ctx.post.variant.title || ctx.post.title).slice(0, 200) } };
  } else if (ctx.images.length > 1) {
    const urns: string[] = (ctx.data.imageUrns as string[] | undefined) ?? [];
    for (let i = urns.length; i < ctx.images.length; i++) {
      urns.push(await uploadImage(ctx, ctx.images[i].id));
      await ctx.checkpoint({ imageUrns: urns });
    }
    content = { multiImage: { images: urns.map((id, i) => ({ id, altText: ctx.images[i].altText || undefined })) } };
  } else if (ctx.images.length === 1) {
    let urn = (ctx.data.imageUrns as string[] | undefined)?.[0];
    if (!urn) {
      urn = await uploadImage(ctx, ctx.images[0].id);
      await ctx.checkpoint({ imageUrns: [urn] });
    }
    content = { media: { id: urn, altText: ctx.images[0].altText || undefined } };
  } else if (ctx.post.link) {
    // The Posts API does not scrape URLs: title and description must be supplied.
    content = { article: { source: ctx.post.link, title: (ctx.post.variant.title || ctx.post.title).slice(0, 200), description: ctx.post.variant.text.replace(/\s+/g, " ").slice(0, 250) } };
  }
  await ctx.markCommitPoint();
  const r = await call(
    ctx,
    (t) => ({
      url: `${BASE}/posts`,
      init: {
        method: "POST",
        headers: headers(ctx, t),
        body: JSON.stringify({ author, commentary: escapeCommentary(ctx.post.caption), visibility: ctx.post.options.linkedin?.visibility ?? "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false, ...(content ? { content } : {}) }),
      },
    }),
    { label: "LinkedIn", idempotent: false, timeoutMs: 60_000 },
  );
  const urn = r.headers.get("x-restli-id") ?? "";
  if (!urn) throw new ProviderError({ klass: "ambiguous", message: "LinkedIn accepted the post but returned no id.", hint: "Check the page; mark it as published here if it's there.", code: "li_no_id" });
  return { externalId: urn, url: `https://www.linkedin.com/feed/update/${urn}/` };
}

export const linkedin: PlatformPublisher = {
  platform: "linkedin",
  capabilities: linkedinCapabilities,
  validate,
  publish,
  async delete(ctx, externalId) {
    await call(ctx, (t) => ({ url: `${BASE}/posts/${encodeURIComponent(externalId)}`, init: { method: "DELETE", headers: headers(ctx, t, { "X-RestLi-Method": "DELETE" }) } }), { label: "LinkedIn", idempotent: true });
  },
};
