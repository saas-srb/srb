/** What a platform will actually receive as text: the same composition the publishers use (`composeCaption`), so the preview is exact. Pure. */
import { composeCaption, disclosureFor_, type Disclosure } from "@/lib/products/viralpulse-ai/publishers/validate";
import { stripPostDisclosureOverride, type MediaFacts, type PublishOptions } from "@/lib/products/viralpulse-ai/publishers/types";
import { languageCodeFor } from "@/lib/products/viralpulse-ai/publishers/schedule";
import type { PostPlatform } from "@/lib/products/viralpulse-ai/constants";
import { splitThread, buildPublishOptions, finalLink, type WizardState } from "./helpers";

export interface PreviewMedia {
  _id: string;
  kind: "image" | "video";
  name: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  altText: string;
  aiDisclosed?: boolean;
}

export const toFacts = (m: PreviewMedia): MediaFacts => ({ id: m._id, kind: m.kind, name: m.name, contentType: m.contentType, size: m.size, width: m.width, height: m.height, durationSec: m.durationSec, altText: m.altText, aiGenerated: Boolean(m.aiDisclosed), aiDisclosureRequired: Boolean(m.aiDisclosed) });

export interface PlatformPreviewData {
  text: string;
  /** X threads: the numbered parts. */
  parts: string[] | null;
  disclosure: Disclosure;
  truncated: boolean;
  limit: number;
}

export function previewFor(s: WizardState, platform: PostPlatform, media: PreviewMedia[], caps: { captionLimit: number; nativeAiLabel: boolean }, aiDisclosureOff: boolean): PlatformPreviewData {
  const v = s.variants[platform];
  const opts: PublishOptions = { ...stripPostDisclosureOverride(buildPublishOptions(s, undefined)), ...(aiDisclosureOff ? { aiDisclosureOff: true } : {}) };
  const d = disclosureFor_(platform, caps, media.map(toFacts), opts, languageCodeFor(s.language));
  const text = (v?.content ?? "").trim();
  const link = finalLink(s.link, s.utm) || null;
  const thread = platform === "x" && s.contentTypes.x === "thread";
  const c = composeCaption(platform, { text, hashtags: v?.hashtags ?? [] }, link, thread ? 100_000 : caps.captionLimit, d, platform !== "google_business");
  return { text: c.text, parts: thread ? splitThread(c.text) : null, disclosure: d, truncated: c.truncated, limit: caps.captionLimit };
}
