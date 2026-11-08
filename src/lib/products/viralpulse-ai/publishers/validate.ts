/**
 * Pure validators and caption composition shared by every platform module (no network, no server-only imports).
 * Limits live in each module's `capabilities`; anything we could not confirm in the official docs is listed in
 * `capabilities.unverified` and only ever produces a warning, never a blocking error.
 */
import { disclosureFor } from "@/lib/products/viralpulse-ai/ugc/policy";
import type { Capabilities, MediaFacts, PublishIssue, PublishOptions, PublishPost } from "./types";

export const issue = (code: string, severity: PublishIssue["severity"], message: string, fix: string, mediaId?: string): PublishIssue => ({ code, severity, message, fix, ...(mediaId ? { mediaId } : {}) });

const hashtagText = (tags: string[]) => tags.map((t) => (t.startsWith("#") ? t : `#${t}`).replace(/\s+/g, "")).join(" ");

export interface Disclosure {
  required: boolean;
  /** "off" only when the company turned it off and nothing forbids that. */
  mode: "none" | "suffix" | "off";
  nativeFlag: boolean;
  suffix: string;
  reason: string;
}

/**
 * AI disclosure decision. Media with `ai.aiGenerated` (UGC Studio) needs disclosure; a platform's native flag is always set when the
 * API has one. The caption suffix is added too, because the platform label does not reach every surface. A company may switch the
 * suffix off only when no AI-generated *video* is involved and the platform has no native label; otherwise the switch is ignored.
 */
export function disclosureFor_(platform: string, caps: Pick<Capabilities, "nativeAiLabel">, media: MediaFacts[], opts: PublishOptions, language = "en"): Disclosure {
  const ai = media.filter((m) => m.aiGenerated && m.aiDisclosureRequired !== false);
  if (ai.length === 0) return { required: false, mode: "none", nativeFlag: false, suffix: "", reason: "No AI-generated media." };
  const hasVideo = ai.some((m) => m.kind === "video");
  const suffix = disclosureFor(platform === "google_business" ? "linkedin" : platform, language).captionSuffix;
  if (opts.aiDisclosureOff && !hasVideo && !caps.nativeAiLabel) return { required: true, mode: "off", nativeFlag: false, suffix: "", reason: "Company turned the AI caption note off for AI images on a platform without a label requirement." };
  return { required: true, mode: "suffix", nativeFlag: caps.nativeAiLabel, suffix, reason: hasVideo ? "AI-generated video must be disclosed." : "AI-generated media is disclosed." };
}

/** Final text: body + hashtags + disclosure suffix, never cutting a hashtag or the suffix. Returns the text and whether the body was shortened. */
export function composeCaption(platform: string, p: { text: string; hashtags: string[] }, link: string | null, limit: number, disclosure: Disclosure, usesHashtags = true): { text: string; truncated: boolean } {
  const body = p.text.trim();
  const withLink = link && platform === "linkedin" && !body.includes(link) ? `${body}\n\n${link}` : body;
  const tags = usesHashtags && p.hashtags.length && !p.hashtags.every((h) => withLink.includes(h)) ? hashtagText(p.hashtags) : "";
  const tail = [tags, disclosure.mode === "suffix" ? disclosure.suffix : ""].filter(Boolean).join("\n\n");
  const full = tail ? `${withLink}\n\n${tail}` : withLink;
  if (full.length <= limit) return { text: full, truncated: false };
  const room = limit - (tail ? tail.length + 2 : 0) - 1;
  if (room < 20) return { text: full.slice(0, limit), truncated: true };
  const cut = withLink.slice(0, room);
  const at = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "), cut.lastIndexOf(" "));
  const trimmed = `${(at > room * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
  return { text: tail ? `${trimmed}\n\n${tail}` : trimmed, truncated: true };
}

const ratio = (m: MediaFacts) => (m.width && m.height ? m.width / m.height : null);

/** Checks common to all platforms, driven by `caps`. Platform modules add their own on top. */
export function baseValidate(caps: Capabilities, post: PublishPost, media: { images: MediaFacts[]; video: MediaFacts | null; thumbnail: MediaFacts | null }, unverifiedAsWarning = true): PublishIssue[] {
  const out: PublishIssue[] = [];
  const L = caps.label;
  const { images, video } = media;
  if (!post.caption.trim() && !video && images.length === 0) out.push(issue("empty", "error", `The ${L} version has no text or media.`, "Write the caption or attach media."));
  if (images.length > caps.maxImages) out.push(issue("too_many_images", "error", `${L} takes at most ${caps.maxImages} image${caps.maxImages === 1 ? "" : "s"} per post; this post has ${images.length}.`, "Remove images or split into two posts."));
  if (video && caps.maxVideos === 0) out.push(issue("video_unsupported", "error", `${L} can't publish video through its API.`, "Use an image or publish the video in the app and mark it as published."));
  if (video && images.length && caps.maxImages > 0 && !caps.formats.includes("carousel")) out.push(issue("mixed_media", "error", `${L} can't mix a video and images in one post.`, "Keep either the video or the images."));
  if (images.length && caps.maxImages === 0) out.push(issue("image_unsupported", "error", `${L} can't publish images through its API.`, "Use a video."));
  const len = post.caption.length;
  if (len > caps.captionLimit) out.push(issue("caption_too_long", caps.unverified.includes("captionLimit") && unverifiedAsWarning ? "warning" : "error", `The ${L} text is ${len} characters; the limit is ${caps.captionLimit}.`, `Shorten the caption or remove hashtags by ${len - caps.captionLimit} characters.`));
  const tagCount = post.variant.hashtags.length;
  if (caps.hashtagLimit && tagCount > caps.hashtagLimit) out.push(issue("too_many_hashtags", caps.unverified.includes("hashtagLimit") ? "warning" : "error", `${tagCount} hashtags; ${L} allows ${caps.hashtagLimit}.`, "Remove some hashtags."));
  for (const m of [...images, ...(video ? [video] : [])]) {
    const types = m.kind === "image" ? caps.imageTypes : caps.videoTypes;
    const max = m.kind === "image" ? caps.maxImageBytes : caps.maxVideoBytes;
    if (types.length && !types.includes(m.contentType)) out.push(issue("type_unsupported", "error", `"${m.name}" is ${m.contentType}; ${L} accepts ${types.join(", ")}.`, "Upload the file again in a supported format.", m.id));
    if (max && m.size > max) out.push(issue("file_too_large", "error", `"${m.name}" is ${(m.size / 1048576).toFixed(1)} MB; ${L} allows ${(max / 1048576).toFixed(0)} MB.`, "Compress the file or upload a smaller one.", m.id));
    if (m.kind === "video") {
      const d = caps.videoDurationSec;
      if (m.durationSec == null) out.push(issue("duration_unknown", "warning", `Couldn't read the length of "${m.name}".`, "Re-upload the video so its length can be checked.", m.id));
      else if (d && (m.durationSec < d.min || m.durationSec > d.max)) {
        const soft = caps.unverified.includes("videoDuration") && unverifiedAsWarning;
        out.push(issue("duration_out_of_range", soft ? "warning" : "error", `"${m.name}" is ${m.durationSec.toFixed(1)} s; ${L} accepts ${d.min}–${d.max} s${soft ? " (as far as we could confirm)" : ""}.`, m.durationSec > d.max ? "Trim the video." : "Use a longer clip.", m.id));
      }
    }
    const r = ratio(m);
    if (r == null) out.push(issue("dimensions_unknown", "warning", `Couldn't read the size of "${m.name}".`, "Re-upload so the shape can be checked.", m.id));
    else if (caps.aspect && (r < caps.aspect.min - 0.005 || r > caps.aspect.max + 0.005)) {
      const soft = caps.unverified.includes("aspect") && unverifiedAsWarning;
      out.push(issue("aspect_out_of_range", soft ? "warning" : "error", `"${m.name}" is ${m.width}×${m.height} (${r.toFixed(2)}:1); ${L} accepts ${caps.aspect.min.toFixed(2)}–${caps.aspect.max.toFixed(2)}:1.`, "Crop the media to a supported shape (1:1, 4:5, 1.91:1 or 9:16 depending on the platform).", m.id));
    }
  }
  if (caps.behindFlag) out.push(issue("flag_off", "warning", `${L} publishing needs ${caps.behindFlag}.`, "Turn it on in Settings once Google has approved API access."));
  return out;
}

export const hasErrors = (issues: PublishIssue[]) => issues.some((i) => i.severity === "error");
