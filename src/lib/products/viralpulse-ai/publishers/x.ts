import { call, chunks } from "./http";
import { ProviderError } from "./errors";
import { baseValidate, issue } from "./validate";
import { PendingProcessing, type Capabilities, type PlatformPublisher, type PublishCtx, type PublishIssue, type PublishResult } from "./types";

/**
 * X API v2: POST /2/tweets, chunked media upload (POST /2/media/upload/initialize, /{id}/append, /{id}/finalize, GET status).
 * Pay-per-use API: posts cost credits (a post containing a URL costs far more); the account needs credits and OAuth 2.0 user tokens
 * with tweet.write, media.write, users.read, offline.access. Not yet reachable from the UI: "x" is not a PostPlatform (see SPEC.md).
 */

const API = "https://api.x.com/2";
export const X_TEXT_LIMIT = 280; // unverified: longer limits apply to Premium accounts; configurable per account via creds.extra.textLimit
const APPEND = 4 * 1024 * 1024; // docs: keep chunks <= 5 MB (server accepts up to 8 MB)

export const xCapabilities: Capabilities = {
  label: "X",
  formats: ["text", "image", "video", "carousel", "thread"] as unknown as Capabilities["formats"],
  maxImages: 4,
  maxVideos: 1,
  imageTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  videoTypes: ["video/mp4", "video/quicktime"],
  maxImageBytes: 5 * 1024 * 1024,
  maxVideoBytes: 8 * 1024 ** 3,
  videoDurationSec: { min: 0.5, max: 1200 }, // 20 min for non-Premium; 125 min for Premium
  aspect: null,
  captionLimit: X_TEXT_LIMIT * 25,
  hashtagLimit: null,
  nativeScheduling: false,
  dailyBudget: null,
  nativeAiLabel: true, // made_with_ai field of POST /2/tweets
  needsAppApproval: "X developer account with prepaid credits (pay-per-use); no review, but the account's Premium status sets the video limits",
  unverified: ["captionLimit"],
};

/** Splits long text into thread parts at sentence / word boundaries, each within `limit` including a " n/N" suffix. */
export function splitThread(text: string, limit = X_TEXT_LIMIT): string[] {
  const clean = text.trim();
  if (clean.length <= limit) return [clean];
  const room = limit - 6; // " 12/12"
  const parts: string[] = [];
  let rest = clean;
  while (rest.length > room) {
    const window = rest.slice(0, room);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "), window.lastIndexOf("\n"));
    const at = cut > room * 0.5 ? cut + 1 : Math.max(window.lastIndexOf(" "), room * 0.5);
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts.map((p, i) => `${p} ${i + 1}/${parts.length}`);
}

function validate(post: Parameters<PlatformPublisher["validate"]>[0], media: Parameters<PlatformPublisher["validate"]>[1]): PublishIssue[] {
  const out = baseValidate(xCapabilities, post, media);
  const wantsThread = post.options.x?.thread;
  if (post.caption.length > X_TEXT_LIMIT && !wantsThread) out.push(issue("x_too_long", "error", `The post is ${post.caption.length} characters; X allows ${X_TEXT_LIMIT} (more only for Premium accounts).`, "Shorten it, or turn on \"Post as a thread\"."));
  if (media.images.some((m) => m.contentType === "image/gif") && (media.images.length > 1 || media.video)) out.push(issue("x_gif_alone", "error", "An animated GIF must be the only media in a post.", "Remove the other media."));
  if (post.link) out.push(issue("x_link_cost", "warning", "Posts containing a link are billed at a much higher rate by X's pay-per-use API.", "Remove the link if the cost matters."));
  if (!post.caption.trim() && !media.video && media.images.length === 0) out.push(issue("x_empty", "error", "Nothing to post.", "Write text or attach media."));
  return out;
}

const authz = (t: string) => ({ Authorization: `Bearer ${t}` });

async function uploadMedia(ctx: PublishCtx, m: { id: string; kind: "image" | "video"; contentType: string; size: number; altText: string }, warnings: string[]): Promise<string> {
  const category = m.kind === "video" ? "tweet_video" : m.contentType === "image/gif" ? "tweet_gif" : "tweet_image";
  const bytesTotal = m.size;
  const init = await call<{ data?: { id?: string }; id?: string }>(ctx, (t) => ({ url: `${API}/media/upload/initialize`, init: { method: "POST", headers: { ...authz(t), "Content-Type": "application/json" }, body: JSON.stringify({ media_type: m.contentType, total_bytes: bytesTotal, media_category: category }) } }), { label: "X", idempotent: false });
  const id = init.body.data?.id ?? init.body.id;
  if (!id) throw new ProviderError({ klass: "permanent", message: "X didn't return a media id.", hint: "Retry the publish." });
  let seg = 0;
  for await (const part of chunks(await ctx.openStream(m.id), APPEND)) {
    const i = seg++;
    await call(ctx, (t) => {
      const fd = new FormData();
      fd.set("segment_index", String(i));
      fd.set("media", new Blob([new Uint8Array(part)], { type: m.contentType }));
      return { url: `${API}/media/upload/${id}/append`, init: { method: "POST", headers: authz(t), body: fd } };
    }, { label: "X", idempotent: true, timeoutMs: 120_000 });
  }
  const fin = await call<{ data?: { processing_info?: { state?: string; check_after_secs?: number } }; processing_info?: { state?: string; check_after_secs?: number } }>(ctx, (t) => ({ url: `${API}/media/upload/${id}/finalize`, init: { method: "POST", headers: authz(t) } }), { label: "X", idempotent: true });
  const info = fin.body.data?.processing_info ?? fin.body.processing_info;
  if (info && info.state !== "succeeded") await checkProcessing(ctx, id, info.check_after_secs);
  if (m.altText) {
    try {
      // Alt text endpoint is not in the pages we could verify; a failure only produces a warning.
      await call(ctx, (t) => ({ url: `${API}/media/metadata`, init: { method: "POST", headers: { ...authz(t), "Content-Type": "application/json" }, body: JSON.stringify({ id, metadata: { alt_text: { text: m.altText.slice(0, 1000) } } }) } }), { label: "X", idempotent: true });
    } catch (e) {
      warnings.push(`Alt text not applied to "${m.id}": ${(e as Error).message}`);
    }
  }
  return id;
}

async function checkProcessing(ctx: PublishCtx, id: string, afterSecs?: number): Promise<void> {
  if (afterSecs && afterSecs <= 5) await ctx.sleep(afterSecs * 1000);
  const r = await call<{ data?: { processing_info?: { state?: string; check_after_secs?: number; error?: { message?: string } } }; processing_info?: { state?: string; check_after_secs?: number; error?: { message?: string } } }>(ctx, (t) => ({ url: `${API}/media/upload?${new URLSearchParams({ command: "STATUS", media_id: id })}`, init: { method: "GET", headers: authz(t) } }), { label: "X", idempotent: true });
  const info = r.body.data?.processing_info ?? r.body.processing_info;
  if (!info || info.state === "succeeded") return;
  if (info.state === "failed") throw new ProviderError({ klass: "media", message: `X couldn't process the media${info.error?.message ? ` (${info.error.message})` : ""}.`, hint: "Use MP4 (H.264/AAC) within your account's length limit.", code: "x_media_failed" });
  throw new PendingProcessing(Math.max(5, info.check_after_secs ?? 10) * 1000);
}

async function publish(ctx: PublishCtx): Promise<PublishResult> {
  const warnings: string[] = [];
  const all = [...ctx.images, ...(ctx.video ? [ctx.video] : [])];
  const mediaIds: string[] = (ctx.data.mediaIds as string[] | undefined) ?? [];
  if (mediaIds.length < all.length) {
    for (let i = mediaIds.length; i < all.length; i++) {
      mediaIds.push(await uploadMedia(ctx, all[i], warnings));
      await ctx.checkpoint({ mediaIds });
    }
  } else if (ctx.data.pendingMediaId) await checkProcessing(ctx, String(ctx.data.pendingMediaId));
  const limit = Number(ctx.creds.extra?.textLimit) || X_TEXT_LIMIT;
  const parts = ctx.post.options.x?.thread ? splitThread(ctx.post.caption, limit) : [ctx.post.caption];
  const ids: string[] = (ctx.data.tweetIds as string[] | undefined) ?? [];
  if (ctx.data.sending !== undefined && ctx.data.sending !== null && ids.length <= Number(ctx.data.sending)) {
    throw new ProviderError({ klass: "ambiguous", message: `X didn't confirm post ${Number(ctx.data.sending) + 1}, so we can't tell whether it went out.`, hint: "Check your X profile; if it is there mark it as published here, otherwise publish again.", code: "x_ambiguous" });
  }
  for (let i = ids.length; i < parts.length; i++) {
    await ctx.checkpoint({ sending: i });
    await ctx.markCommitPoint();
    const r = await call<{ data?: { id: string } }>(ctx, (t) => ({
      url: `${API}/tweets`,
      init: {
        method: "POST",
        headers: { ...authz(t), "Content-Type": "application/json" },
        body: JSON.stringify({ text: parts[i], ...(i === 0 && mediaIds.length ? { media: { media_ids: mediaIds } } : {}), ...(i > 0 ? { reply: { in_reply_to_tweet_id: ids[i - 1] } } : {}), ...(ctx.post.aiNative ? { made_with_ai: true } : {}) }),
      },
    }), { label: "X", idempotent: false });
    const id = r.body.data?.id;
    if (!id) throw new ProviderError({ klass: "ambiguous", message: "X accepted the post but returned no id.", hint: "Check your X profile.", code: "x_no_id" });
    ids.push(id);
    await ctx.checkpoint({ tweetIds: ids, sending: null });
  }
  return { externalId: ids[0], url: `https://x.com/i/web/status/${ids[0]}`, extraIds: ids.length > 1 ? { thread: ids.join(",") } : undefined, ...(warnings.length ? { warnings } : {}) };
}

export const x: PlatformPublisher = {
  platform: "x",
  capabilities: xCapabilities,
  validate,
  publish,
  async delete(ctx, externalId) {
    await call(ctx, (t) => ({ url: `${API}/tweets/${externalId}`, init: { method: "DELETE", headers: authz(t) } }), { label: "X", idempotent: true });
  },
};
