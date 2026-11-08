import "server-only";
import { getPost } from "@/lib/products/viralpulse-ai/posts";
import { PLATFORM_META, type PostPlatform } from "@/lib/products/viralpulse-ai/constants";
import { smmsCan } from "@/lib/smms-roles";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { logLine, type EngineDeps, type RunInput } from "./engine";
import { PUBLISHER_MODULES } from "./index";
import { imageBytesFor, loadPostMedia, openMediaStream, publicMediaUrl } from "./media-facts";
import { isConnected, reportAccountError, resolveCredentials } from "./publisherAuth";
import { getPublishSettings } from "./publish-settings";
import { languageCodeFor } from "./schedule";
import { ProviderError } from "./errors";
import type { AttemptDoc } from "./attempts";
import { stripPostDisclosureOverride, type MediaFacts, type PlatformKey, type PublishOptions, type PublishPost } from "./types";
import { composeCaption, disclosureFor_ } from "./validate";
import type { PostDoc } from "@/lib/products/viralpulse-ai/posts";

export async function approverStillAllowed(userId: string | null): Promise<boolean> {
  if (!userId || !ObjectId.isValid(userId)) return false;
  const db = await getDb();
  const u = await db.collection<{ _id: ObjectId; roles?: string[]; permissionOverrides?: Record<string, boolean> }>("admin_users").findOne({ _id: new ObjectId(userId) }, { projection: { roles: 1, permissionOverrides: 1 } });
  return Boolean(u && smmsCan({ roles: u.roles ?? [], permissionOverrides: u.permissionOverrides ?? {} }, "PUBLISH_CONTENT"));
}

/** Builds the provider-ready view of one platform's version of a post. Shared by the plan (UI checklist) and the engine so both see the same issues. */
export function buildPublishPost(p: PostDoc, platform: PlatformKey, media: { images: MediaFacts[]; video: MediaFacts | null }, aiDisclosureOff: boolean): { post: PublishPost; disclosure: RunInput["disclosure"] } | null {
  const v = p.variants.find((x) => x.platform === platform);
  if (!v) return null;
  const mod = PUBLISHER_MODULES[platform];
  // A per-post `aiDisclosureOff` is never honoured: only the company setting (publish-settings) may relax the disclosure.
  const options: PublishOptions = { ...stripPostDisclosureOverride(p.publishOptions), ...(aiDisclosureOff ? { aiDisclosureOff: true } : {}) };
  const all = [...media.images, ...(media.video ? [media.video] : [])];
  const d = disclosureFor_(platform, mod.capabilities, all, options, p.language);
  const text = (v.content || v.caption).trim();
  const cap = composeCaption(platform, { text, hashtags: v.hashtags }, p.link, mod.capabilities.captionLimit, d, platform !== "google_business");
  // Long X text is split into a thread, so it is not cut here.
  const caption = platform === "x" && options.x?.thread ? composeCaption(platform, { text, hashtags: v.hashtags }, p.link, 100_000, d).text : cap.text;
  return {
    post: { id: p._id, title: p.title, link: p.link, languageCode: languageCodeFor(p.language), variant: { title: v.title, text, hashtags: v.hashtags, keywords: v.keywords, cta: v.cta }, caption, aiNative: d.nativeFlag, options },
    disclosure: { mode: d.mode, nativeFlag: d.nativeFlag, reason: d.reason },
  };
}

export const realDeps: EngineDeps = {
  async loadInput(a: AttemptDoc): Promise<RunInput> {
    const empty = { post: null as never, images: [], video: null, thumbnail: null, scheduleAt: null, disclosure: { mode: "none", nativeFlag: false, reason: "" } };
    const p = await getPost(a.postId);
    if (!p || p.deletedAt) return { ...empty, skip: "The post was deleted." };
    if (p.status === "archived") return { ...empty, skip: "The post was archived." };
    const variant = p.variants.find((v) => v.platform === a.platform);
    if (!variant) return { ...empty, skip: `${a.platform} was removed from the post.` };
    if (variant.publish.state === "published" && variant.publish.externalId && !a.externalId) return { ...empty, skip: "This platform was already published." };
    if (a.mode === "scheduled") {
      if (p.status !== "scheduled") return { ...empty, skip: "The post is no longer scheduled." };
      if (!(await approverStillAllowed(p.approvedBy))) return { ...empty, skip: "The approval to publish was withdrawn or the approver lost permission." };
    }
    const settings = await getPublishSettings();
    const media = await loadPostMedia(p.mediaIds, p.thumbnailId);
    const built = buildPublishPost(p, a.platform, media, settings.aiDisclosureOff);
    if (!built) return { ...empty, skip: "Version not found." };
    const caps = PUBLISHER_MODULES[a.platform].capabilities;
    const sa = p.scheduledAt;
    const native = Boolean(p.publishOptions?.nativeSchedule && caps.nativeScheduling && a.mode === "scheduled" && sa);
    return { post: built.post, images: media.images, video: media.video, thumbnail: media.thumbnail, scheduleAt: native ? sa : null, disclosure: built.disclosure };
  },
  credentials: (platform, accountId) => resolveCredentials(platform, accountId),
  async platformEnabled(platform, accountId) {
    if (platform === "google_business") {
      if (!(await getPublishSettings()).gbpEnabled) return { ok: false, reason: "Google Business Profile posting is turned off.", hint: "Turn it on in Settings once Google has approved your Business Profile API access." };
    }
    if (!(await isConnected(platform, accountId))) return { ok: false, reason: `${platform === "x" ? "X" : PLATFORM_META[platform as PostPlatform].label} isn't connected.`, hint: "Connect the account in Settings → Connected accounts." };
    return { ok: true };
  },
  publicUrl: publicMediaUrl,
  async openStream(mediaId) {
    const { getMedia } = await import("@/lib/products/viralpulse-ai/media");
    const doc = await getMedia(mediaId);
    if (!doc) throw new ProviderError({ klass: "media", message: "A media file of this post no longer exists.", hint: "Re-attach the media.", code: "media_missing" });
    return openMediaStream(doc);
  },
  imageBytes: imageBytesFor,
  reportAccountError,
  fetch: (...args) => fetch(...args),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => new Date(),
  log: logLine,
};
