/**
 * Per-platform posting guidance: caption skeleton with placeholders only (never invented facts), a conservative hashtag suggestion,
 * subtitle default, recommended aspect and the AI-label wording that policy.ts provides. Platform limits change often, so the
 * guidance names no hard numbers beyond a small hashtag suggestion and always says to check the platform's current limits.
 */
import { disclosureFor, ILLUSTRATIVE_NOTICE } from "../policy";
import { HOOK_FORMULAS } from "./catalogue-base";
import { getStyle } from "./catalogue";
import type { AspectRatio, Platform, UgcStyle } from "./types";

export interface PostGuidance {
  styleId: string;
  platform: Platform;
  platformLabel: string;
  /** Recommended render aspect: only 9:16, 16:9 or 1:1. */
  aspect: AspectRatio;
  aspectNote: string;
  lengthNote: string;
  subtitlesDefault: boolean;
  subtitlesNote: string;
  hookFormula: string;
  pacing: string;
  /** Caption with {placeholders} to fill from the brief. */
  captionSkeleton: string;
  hashtagCount: { min: number; max: number };
  hashtagNote: string;
  ctaGuideline: string;
  aiLabel: { action: string; captionSuffix: string };
  illustrativeNotice: string | null;
  limitsNote: string;
}

interface PlatformRule {
  label: string;
  preferred: AspectRatio[];
  aspectNote: string;
  subtitles: boolean;
  pacing: string;
  skeleton: string;
  hashtags: [number, number];
  hashtagNote: string;
  cta: string;
}

const RULES: Record<Platform, PlatformRule> = {
  instagram: {
    label: "Instagram", preferred: ["9:16", "1:1"], subtitles: true,
    aspectNote: "Reels are 9:16. A 4:5 feed version is produced by cropping the 9:16 video, so keep faces and text in the middle of the frame.",
    pacing: "Fast: a cut or a new visual every few seconds; the first line must land in the first second.",
    skeleton: "{hook line, same words as the first spoken line}\n\n{one plain sentence on the benefit, from your brief}\n\n{call to action from your brief}\n\n{hashtags}",
    hashtags: [3, 5], hashtagNote: "A few specific tags work better than many broad ones.",
    cta: "One action only: save, follow, message or tap the link. Keep it in the caption and the last scene.",
  },
  facebook: {
    label: "Facebook", preferred: ["1:1", "9:16"], subtitles: true,
    aspectNote: "Square and vertical both work in the feed; a 4:5 version is produced by cropping the 9:16 video. Keep the key message away from the edges.",
    pacing: "Slower and steadier than Reels: plain words, long pauses, captions that carry the message with the sound off.",
    skeleton: "{one clear sentence saying what this is, from your brief}\n\n{who it is for and when or where, only from your brief}\n\n{call to action from your brief}\n\n{one or two hashtags, optional}",
    hashtags: [1, 3], hashtagNote: "Hashtags matter less here; plain words in the caption matter more.",
    cta: "One simple action: message us, call, visit or comment. Repeat it slowly in the last scene.",
  },
  youtube: {
    label: "YouTube", preferred: ["9:16", "16:9"], subtitles: false,
    aspectNote: "Shorts are 9:16. Normal videos are 16:9 landscape. Pick one; do not stretch one into the other.",
    pacing: "Shorts: very fast with a loop-friendly ending. Landscape: steady, with a clear title card per section.",
    skeleton: "Title: {title using the viewer's question or problem, no claims}\n\n{two lines on what the video covers, from your brief}\n\n{call to action from your brief}\n\n{a few hashtags}",
    hashtags: [3, 5], hashtagNote: "Keep the first few tags relevant; they can show above the title.",
    cta: "Ask for one thing: subscribe, watch the next video, or follow the link in the description.",
  },
  linkedin: {
    label: "LinkedIn", preferred: ["1:1", "16:9", "9:16"], subtitles: true,
    aspectNote: "Square or landscape sit best in the feed; vertical also works. Add subtitles because many people watch with the sound off at work.",
    pacing: "Measured and professional: one point per scene, a steady voice, no slang beyond what the audience uses.",
    skeleton: "{opening line that states the point, no hype}\n\n{two short lines of context, from your brief}\n\n{question or call to action from your brief}\n\n{a few hashtags}",
    hashtags: [3, 5], hashtagNote: "Three to five relevant professional tags is enough.",
    cta: "Invite a comment, a conversation or a click, in a professional tone; avoid urgency language.",
  },
  x: {
    label: "X", preferred: ["16:9", "1:1", "9:16"], subtitles: true,
    aspectNote: "Landscape or square play well inline; vertical is cropped in the timeline. Put the key text near the centre.",
    pacing: "Punchy: the point in the first seconds, no slow intros, one idea per video.",
    skeleton: "{one punchy line with the point}\n\n{link or reply prompt from your brief}\n\n{one hashtag, optional}",
    hashtags: [0, 2], hashtagNote: "One or two tags at most, or none.",
    cta: "One short ask: reply, repeat, or click the link. Keep the post text short.",
  },
  whatsapp: {
    label: "WhatsApp", preferred: ["9:16", "1:1"], subtitles: true,
    aspectNote: "Status and chat video are 9:16 or square. Keep the video small and the message short.",
    pacing: "Personal and quick: like a message to one person.",
    skeleton: "{short greeting}\n\n{the one thing, from your brief}\n\n{how to reply, from your brief}",
    hashtags: [0, 0], hashtagNote: "No hashtags are needed in chat or status.",
    cta: "Ask for a reply or a message, nothing else.",
  },
};

export const PLATFORM_LABEL: Record<Platform, string> = Object.fromEntries(Object.entries(RULES).map(([k, v]) => [k, v.label])) as Record<Platform, string>;

function aspectFor(style: UgcStyle, rule: PlatformRule): AspectRatio {
  const own = style.aspects.find((a) => rule.preferred.includes(a));
  return own ?? rule.preferred[0] ?? "9:16";
}

/** Guidance for posting `styleId` on `platform`; null when the style is unknown. No facts are invented: every blank is a placeholder. */
export function postGuidance(styleId: string, platform: Platform, language = "en"): PostGuidance | null {
  const style = getStyle(styleId);
  if (!style) return null;
  const rule = RULES[platform] ?? RULES.instagram;
  const native = style.nativePlatform === platform;
  const subtitlesDefault = native && style.subtitlesDefault !== undefined ? style.subtitlesDefault : rule.subtitles;
  const hook = style.hookFormulas[0] ? HOOK_FORMULAS[style.hookFormulas[0]] : null;
  const ai = disclosureFor(platform, language);
  const [lo, hi] = style.durationRange;
  const skeleton = style.illustrative ? `${rule.skeleton}\n\n${ILLUSTRATIVE_NOTICE}` : rule.skeleton;
  return {
    styleId, platform, platformLabel: rule.label,
    aspect: aspectFor(style, rule), aspectNote: rule.aspectNote,
    lengthNote: `This style runs ${lo}-${hi} s. Check the platform's current limits for your format before posting.`,
    subtitlesDefault,
    subtitlesNote: subtitlesDefault ? "Subtitles on by default: many people watch with the sound off." : "Subtitles are optional here; turn them on if the audience watches muted.",
    hookFormula: hook ? `${hook.label}: ${hook.how}` : "Open with one clear, honest line.",
    pacing: rule.pacing,
    captionSkeleton: skeleton,
    hashtagCount: { min: rule.hashtags[0], max: rule.hashtags[1] },
    hashtagNote: rule.hashtagNote,
    ctaGuideline: rule.cta,
    aiLabel: { action: ai.action, captionSuffix: ai.captionSuffix },
    illustrativeNotice: style.illustrative ? ILLUSTRATIVE_NOTICE : null,
    limitsNote: "Platform rules and limits change often. Check the platform's current limits and label rules before you post.",
  };
}
