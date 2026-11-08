import "server-only";
import { COLLECTIONS, smmsCollection, newId, createStamp, updateStamp, notDeleted, str, dateOrNull, type Stamps } from "@/lib/products/viralpulse-ai/db";
import { findFormat, isAdPlatform, PLATFORM_META, type AdPlatform, type ContentStatus } from "@/lib/products/viralpulse-ai/constants";
import { EMPTY_AD, normalizeAd, type AdConcept, type AdContent } from "@/lib/products/viralpulse-ai/content";
import { SmmsInputError, NotFoundError, can, ForbiddenError, type SmmsViewer } from "@/lib/products/viralpulse-ai/viewer";
import { PAID_SCHEMA_VERSION, normalizeAdPaid, type AdPaid } from "@/lib/products/viralpulse-ai/ads-platforms/meta/draft";
import { CAPABILITIES, adsPlatformFor, AD_COLLECTIONS } from "@/lib/products/viralpulse-ai/ads-platforms/types";

/**
 * An ad creative inside a campaign: one platform, one format (image or video),
 * its copy, creative direction, variations and attached media, plus the real Meta
 * creative fields (`paid`: ad set, link, button, UTM tags, carousel cards...). Facebook and
 * Instagram ads are launched through `ads-platforms/launches.ts`; for platforms with no API
 * support here, `markAdManuallyTracked` records (audited, labelled "manually tracked") that
 * someone launched it in that platform's ad manager.
 */

export interface AdDoc extends Stamps {
  _id: string;
  campaignId: string;
  name: string;
  platform: AdPlatform;
  format: "image" | "video";
  /** A `PLATFORM_META[platform].formats[].key` — placement + dimensions. */
  formatKey: string | null;
  status: ContentStatus;
  content: AdContent;
  mediaIds: string[];
  thumbnailId: string | null;
  /** The Meta creative fields (schema version 2). Older ads hold copy only; `getAd` lifts them on read. */
  paid: AdPaid;
  /** Set only by `markAdManuallyTracked`: the ad was launched outside the app on a platform with no API support here. */
  manualTracking: { by: string; at: Date; reason: string } | null;
  /** Planned go-live. */
  scheduledAt: Date | null;
  scheduledBy: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  /** Set when marked live: the ad's id or URL in the ad platform. */
  externalRef: string | null;
  launchedAt: Date | null;
  launchedBy: string | null;
  archivedFrom: ContentStatus | null;
}

let indexesEnsured = false;
export async function adsCollection() {
  const col = await smmsCollection<AdDoc>(COLLECTIONS.ads);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([col.createIndex({ campaignId: 1, deletedAt: 1 }).catch(() => {}), col.createIndex({ status: 1, scheduledAt: 1 }).catch(() => {})]);
  }
  return col;
}

export function parseAdHeader(input: Record<string, unknown>, allowed: readonly string[]): { name: string; platform: AdPlatform; format: "image" | "video"; formatKey: string | null } {
  const platform = input.platform;
  if (!isAdPlatform(platform) || !allowed.includes(platform)) throw new SmmsInputError("Pick one of the campaign's platforms.");
  const format = input.format === "video" ? "video" : "image";
  const fk = str(input.formatKey, 40);
  const f = findFormat(platform, fk);
  if (fk && (!f || (f.kind !== "both" && f.kind !== format))) throw new SmmsInputError("That size doesn't fit this platform and format.");
  return { name: str(input.name, 120) || `${PLATFORM_META[platform].label} ${format} ad`, platform, format, formatKey: f ? f.key : null };
}

export async function createAd(campaignId: string, header: ReturnType<typeof parseAdHeader>, actorId: string, content: AdContent = EMPTY_AD): Promise<AdDoc> {
  const col = await adsCollection();
  const hasContent = Boolean(content.headline || content.primaryText);
  const doc: AdDoc = {
    _id: newId(),
    campaignId,
    ...header,
    status: hasContent ? "edited" : "draft",
    content,
    mediaIds: [],
    thumbnailId: null,
    paid: normalizeAdPaid(null, { cta: content.cta, format: header.format }),
    manualTracking: null,
    scheduledAt: null,
    scheduledBy: null,
    approvedBy: null,
    approvedAt: null,
    externalRef: null,
    launchedAt: null,
    launchedBy: null,
    archivedFrom: null,
    ...createStamp(actorId),
  };
  await col.insertOne(doc);
  return doc;
}

/** A campaign's AI ad concept → a pre-filled ad draft. */
export function contentFromConcept(c: AdConcept): AdContent {
  return { ...EMPTY_AD, headline: c.headline, primaryText: c.primaryText, description: c.description, cta: c.cta, image: { ...EMPTY_AD.image, concept: c.format === "image" ? c.angle : "" }, video: { ...EMPTY_AD.video, concept: c.format === "video" ? c.angle : "" } };
}

export async function getAd(id: string): Promise<AdDoc | null> {
  if (!id) return null;
  const col = await adsCollection();
  const doc = await col.findOne({ _id: id, ...notDeleted });
  return doc ? { ...doc, content: normalizeAd(doc.content), paid: normalizeAdPaid(doc.paid, { cta: doc.content?.cta, format: doc.format }), manualTracking: doc.manualTracking ?? null } : null;
}

export async function requireAd(campaignId: string, id: string): Promise<AdDoc> {
  const ad = await getAd(id);
  if (!ad || ad.campaignId !== campaignId) throw new NotFoundError();
  return ad;
}

export async function listAdsForCampaign(campaignId: string): Promise<AdDoc[]> {
  const col = await adsCollection();
  return col.find({ campaignId, ...notDeleted }).sort({ createdAt: 1 }).toArray();
}

export async function updateAd(id: string, set: Partial<AdDoc>, actorId: string): Promise<void> {
  const col = await adsCollection();
  await col.updateOne({ _id: id }, { $set: { ...set, ...updateStamp(actorId) } });
}

export async function duplicateAd(ad: AdDoc, actorId: string, override: Partial<Pick<AdDoc, "platform" | "name" | "formatKey">> = {}): Promise<AdDoc> {
  const col = await adsCollection();
  const doc: AdDoc = {
    ...ad,
    ...override,
    _id: newId(),
    name: override.name ?? `${ad.name} (copy)`.slice(0, 120),
    status: ad.content.headline || ad.content.primaryText ? "edited" : "draft",
    scheduledAt: null,
    scheduledBy: null,
    approvedBy: null,
    approvedAt: null,
    externalRef: null,
    manualTracking: null,
    launchedAt: null,
    launchedBy: null,
    archivedFrom: null,
    ...createStamp(actorId),
  };
  await col.insertOne(doc);
  return doc;
}

export async function softDeleteAd(id: string, actorId: string): Promise<void> {
  const col = await adsCollection();
  await col.updateOne({ _id: id }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
}

export function parseSchedule(v: unknown): Date {
  const d = dateOrNull(v);
  if (!d) throw new SmmsInputError("Pick a date and time.");
  if (d.getTime() < Date.now() - 60_000) throw new SmmsInputError("Pick a time in the future.");
  return d;
}

/** Saves the Meta creative fields. Refused while the ad is part of a launch that exists in Meta (use `editLaunch`). */
export async function saveAdPaid(id: string, paid: unknown, viewer: SmmsViewer): Promise<AdDoc> {
  if (!can(viewer, "CREATE_ADS")) throw new ForbiddenError("CREATE_ADS");
  const ad = await getAd(id);
  if (!ad) throw new NotFoundError();
  const launches = await smmsCollection<{ _id: string; campaignId: string; active: boolean; state: string }>(AD_COLLECTIONS.launches);
  if (await launches.findOne({ campaignId: ad.campaignId, active: true, state: { $in: ["ready", "creating", "partial"] } })) throw new SmmsInputError("This ad is part of a launch in Meta. Change it with the launch controls.");
  const next = normalizeAdPaid({ ...(paid as object), schemaVersion: PAID_SCHEMA_VERSION }, { cta: ad.content.cta, format: ad.format });
  await updateAd(id, { paid: next }, viewer.userId);
  return (await getAd(id))!;
}

/**
 * The only way to mark an ad live by hand, kept for platforms this app cannot launch on. It is refused for Facebook and Instagram (they
 * launch through the API), requires a reason, and the ad is labelled "manually tracked" so reports never present it as verified.
 */
export async function markAdManuallyTracked(ad: AdDoc, input: { reason: string; externalRef: string }, viewer: SmmsViewer): Promise<AdDoc> {
  if (!can(viewer, "PUBLISH_CONTENT")) throw new ForbiddenError("PUBLISH_CONTENT");
  const key = adsPlatformFor(ad.platform);
  if (key && CAPABILITIES[key].realLaunch) throw new SmmsInputError("This platform launches from the app. Use Launch instead of marking it live by hand.");
  const reason = str(input.reason, 300);
  if (reason.length < 5) throw new SmmsInputError("Say why this ad is being tracked by hand (at least a few words).");
  const now = new Date();
  await updateAd(ad._id, { status: "published", externalRef: str(input.externalRef, 300) || null, launchedAt: now, launchedBy: viewer.userId, manualTracking: { by: viewer.userId, at: now, reason } }, viewer.userId);
  return (await getAd(ad._id))!;
}
