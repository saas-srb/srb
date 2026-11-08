import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/offers/db";
import type { CampaignWriteInput } from "@/lib/offers/campaign-validation";
import { DEFAULT_DISPLAY_CONFIG, type DisplayConfigInput } from "@/lib/offers/display-validation";
import { DEFAULT_THEME_PRESET, pageIsTargeted, type Audience, type CampaignStatus, type CampaignType, type CampaignThemePreset } from "@/lib/offers/constants";

export const CAMPAIGNS_COLLECTION = "offer_campaigns";

export { DEFAULT_DISPLAY_CONFIG };

export interface OfferCampaign extends AuditFields {
  _id: string;
  name: string;
  slug: string;
  campaignType: CampaignType;
  themePreset: CampaignThemePreset;
  theme: {
    primaryColor?: string;
    accentColor?: string;
    bannerHeadline?: string;
    bannerSubheadline?: string;
  };
  bannerImage?: string;
  startDate: Date;
  endDate: Date;
  status: CampaignStatus;
  priority: number;
  targetAudience: Audience[];
  isFeatured: boolean;
  faqs: { question: string; answer: string; audience?: Audience }[];
  display: DisplayConfigInput;
}

export interface SerializedCampaign extends Omit<OfferCampaign, "createdAt" | "updatedAt" | "deletedAt" | "startDate" | "endDate"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  startDate: string;
  endDate: string;
}

export function serializeCampaign(c: OfferCampaign): SerializedCampaign {
  return {
    ...c,
    display: c.display ?? DEFAULT_DISPLAY_CONFIG,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<OfferCampaign>(CAMPAIGNS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ slug: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ status: 1, startDate: 1, endDate: 1, priority: -1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getCampaign(id: string): Promise<OfferCampaign | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function getCampaignBySlug(slug: string): Promise<OfferCampaign | null> {
  const collection = await getCollection();
  return collection.findOne({ slug, ...notDeleted });
}

export async function listCampaignOptions(): Promise<{ _id: string; name: string; status: CampaignStatus }[]> {
  const collection = await getCollection();
  const docs = await collection
    .find(notDeleted, { projection: { name: 1, status: 1 } })
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map((d) => ({ _id: d._id, name: d.name, status: d.status }));
}

export interface CampaignFilter {
  search?: string;
  status?: CampaignStatus;
}

function buildFilter(opts: CampaignFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ name: rx }, { slug: rx }];
  }
  if (opts.status) filter.status = opts.status;
  return filter;
}

export interface SearchCampaignsOptions extends CampaignFilter {
  page?: number;
  pageSize?: number;
}

export async function searchCampaigns(opts: SearchCampaignsOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ priority: -1, createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

/**
 * Resolves the single campaign that should be live right now: eligible
 * statuses are "scheduled" and "active" (so a campaign flips live/off purely
 * by date, with no status flip required), whose date window contains `now`.
 * Ties broken by priority DESC, then startDate DESC (newer wins), then _id
 * DESC (deterministic). Returns null when nothing is live — the public page
 * must render an honest empty state, never a fake default campaign.
 */
export async function getActiveCampaign(now: Date = new Date()): Promise<OfferCampaign | null> {
  const collection = await getCollection();
  const candidates = await collection
    .find({
      ...notDeleted,
      status: { $in: ["scheduled", "active"] },
      startDate: { $lte: now },
      endDate: { $gte: now },
    })
    .sort({ priority: -1, startDate: -1, _id: -1 })
    .limit(1)
    .toArray();
  return candidates[0] ?? null;
}

/**
 * Same resolution as `getActiveCampaign`, with an additional page-targeting
 * filter (§17: priority → audience/page targeting → dates). Since page
 * targeting can't be expressed as a simple Mongo equality filter (a
 * prefix-match against a list), this fetches a bounded window of top
 * candidates by priority and filters in memory — negligible cost, campaign
 * counts are always small.
 */
export async function getActiveCampaignForPage(pathname: string, now: Date = new Date()): Promise<OfferCampaign | null> {
  const collection = await getCollection();
  const candidates = await collection
    .find({
      ...notDeleted,
      status: { $in: ["scheduled", "active"] },
      startDate: { $lte: now },
      endDate: { $gte: now },
    })
    .sort({ priority: -1, startDate: -1, _id: -1 })
    .limit(25)
    .toArray();
  return candidates.find((c) => pageIsTargeted(pathname, (c.display ?? DEFAULT_DISPLAY_CONFIG).pageTargeting)) ?? null;
}

/**
 * The nearest not-yet-started campaign for a page — powers the "coming soon" strip/popup
 * teaser so a scheduled campaign gets promoted site-wide before it goes live, not just once
 * it's active. Same priority → page-targeting → dates resolution as `getActiveCampaignForPage`,
 * just against a future date window (soonest start first, so a nearer campaign always wins
 * over a farther one regardless of priority).
 */
export async function getUpcomingCampaignForPage(pathname: string, now: Date = new Date()): Promise<OfferCampaign | null> {
  const collection = await getCollection();
  const candidates = await collection
    .find({
      ...notDeleted,
      status: { $in: ["scheduled", "active"] },
      startDate: { $gt: now },
      endDate: { $gt: now },
    })
    .sort({ startDate: 1, priority: -1, _id: -1 })
    .limit(25)
    .toArray();
  return candidates.find((c) => pageIsTargeted(pathname, (c.display ?? DEFAULT_DISPLAY_CONFIG).pageTargeting)) ?? null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createCampaign(data: CampaignWriteInput, actorId: string): Promise<OfferCampaign> {
  const collection = await getCollection();
  const doc: OfferCampaign = {
    _id: newId(),
    name: data.name,
    slug: data.slug,
    campaignType: data.campaignType,
    themePreset: data.themePreset ?? DEFAULT_THEME_PRESET,
    theme: data.theme,
    bannerImage: data.bannerImage,
    startDate: new Date(data.startDate),
    endDate: new Date(data.endDate),
    status: data.status,
    priority: data.priority,
    targetAudience: data.targetAudience,
    isFeatured: data.isFeatured,
    faqs: data.faqs,
    display: data.display ?? DEFAULT_DISPLAY_CONFIG,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updateCampaign(
  id: string,
  data: CampaignWriteInput,
  actorId: string
): Promise<OfferCampaign | null> {
  const collection = await getCollection();
  return collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    {
      $set: {
        name: data.name,
        slug: data.slug,
        campaignType: data.campaignType,
        themePreset: data.themePreset ?? DEFAULT_THEME_PRESET,
        theme: data.theme,
        bannerImage: data.bannerImage,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: data.status,
        priority: data.priority,
        targetAudience: data.targetAudience,
        isFeatured: data.isFeatured,
        faqs: data.faqs,
        display: data.display ?? DEFAULT_DISPLAY_CONFIG,
        ...updateStamp(actorId),
      },
    },
    { returnDocument: "after" }
  );
}

export async function deleteCampaign(id: string, actorId: string): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return { ok: res.modifiedCount === 1 };
}
