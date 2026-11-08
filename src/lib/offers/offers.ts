import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/offers/db";
import type { OfferWriteInput, OfferPricingInput } from "@/lib/offers/offer-validation";
import { audienceAliases, type Audience, type OfferStatus, type OfferType, type OfferSegment, type LimitKind, type LinkedItem } from "@/lib/offers/constants";
import { countClaimsByOffer } from "@/lib/offers/claims";
import type { CategorySlug } from "@/lib/categories";

export const OFFERS_COLLECTION = "offers";

export interface Offer extends AuditFields {
  _id: string;
  campaignId: string;
  title: string;
  description?: string;
  badgeText?: string;
  category: CategorySlug;
  subService: string;
  audience: Audience[];
  pricing: OfferPricingInput;
  benefits: string[];
  eligibility?: string[];
  offerTypes?: OfferType[];
  segment?: OfferSegment;
  limitKind?: LimitKind;
  linked?: LinkedItem | null;
  ctaText?: string;
  /** Optional total-claims cap; null/absent = unlimited. */
  claimLimit?: number | null;
  validFrom: Date;
  validUntil: Date;
  priority: number;
  isFeatured: boolean;
  isDealOfTheDay: boolean;
  isFlashDeal: boolean;
  status: OfferStatus;
}

export interface SerializedOffer extends Omit<Offer, "createdAt" | "updatedAt" | "deletedAt" | "validFrom" | "validUntil"> {
  /** Real number of claims so far (public pages only; undefined where not loaded). */
  claimedCount?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  validFrom: string;
  validUntil: string;
}

export function serializeOffer(o: Offer, claimedCount?: number): SerializedOffer {
  return {
    ...o,
    claimedCount,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    deletedAt: o.deletedAt ? o.deletedAt.toISOString() : null,
    validFrom: o.validFrom.toISOString(),
    validUntil: o.validUntil.toISOString(),
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Offer>(OFFERS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ campaignId: 1, status: 1 }).catch(() => {}),
      collection.createIndex({ campaignId: 1, isDealOfTheDay: 1 }).catch(() => {}),
      collection.createIndex({ category: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getOffer(id: string): Promise<Offer | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function listOffersForCampaign(campaignId: string): Promise<Offer[]> {
  const collection = await getCollection();
  return collection.find({ campaignId, ...notDeleted }).sort({ priority: -1, createdAt: -1 }).toArray();
}

/** Active, in-date offers for a campaign, optionally narrowed to an audience. Used by the public page. */
export async function getPublicOffers(opts: { campaignId: string; audience?: Audience; now?: Date }): Promise<Offer[]> {
  const collection = await getCollection();
  const now = opts.now ?? new Date();
  const filter: Record<string, unknown> = {
    ...notDeleted,
    campaignId: opts.campaignId,
    status: "active",
    validFrom: { $lte: now },
    validUntil: { $gte: now },
  };
  if (opts.audience) {
    filter.audience = { $in: audienceAliases(opts.audience) };
  }
  return collection.find(filter).sort({ priority: -1, createdAt: -1 }).toArray();
}

/**
 * Picks the single best-matching real offer for the top strip/popup on a
 * given page, so their content is always a real offer's title/discount —
 * never separately-authored marketing copy. Preference order: an offer
 * whose category matches the page's inferred audience/category context →
 * the campaign's Deal of the Day → the highest-priority featured offer →
 * the highest-priority offer overall. Returns null when the campaign has
 * no active offers at all (the caller must hide gracefully, not invent one).
 */
export function pickContextOffer(offers: Offer[], opts: { category?: CategorySlug } = {}): Offer | null {
  if (offers.length === 0) return null;
  if (opts.category) {
    const categoryMatch = offers.find((o) => o.category === opts.category);
    if (categoryMatch) return categoryMatch;
  }
  const dealOfTheDay = offers.find((o) => o.isDealOfTheDay);
  if (dealOfTheDay) return dealOfTheDay;
  const featured = offers.find((o) => o.isFeatured);
  if (featured) return featured;
  return offers[0];
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createOffer(data: OfferWriteInput, actorId: string): Promise<Offer> {
  const collection = await getCollection();
  const doc: Offer = {
    _id: newId(),
    campaignId: data.campaignId,
    title: data.title,
    description: data.description,
    badgeText: data.badgeText,
    category: data.category,
    subService: data.subService,
    audience: data.audience,
    pricing: data.pricing,
    benefits: data.benefits,
    eligibility: data.eligibility,
    offerTypes: data.offerTypes,
    segment: data.segment,
    limitKind: data.limitKind,
    linked: data.linked,
    ctaText: data.ctaText,
    claimLimit: data.claimLimit,
    validFrom: new Date(data.validFrom),
    validUntil: new Date(data.validUntil),
    priority: data.priority,
    isFeatured: data.isFeatured,
    isDealOfTheDay: false, // set via setDealOfTheDay() only, to keep the "at most one" invariant in one place
    isFlashDeal: data.isFlashDeal,
    status: data.status,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  if (data.isDealOfTheDay) await setDealOfTheDay(doc._id, doc.campaignId, actorId);
  return doc;
}

export async function updateOffer(id: string, data: OfferWriteInput, actorId: string): Promise<Offer | null> {
  const collection = await getCollection();
  const updated = await collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    {
      $set: {
        campaignId: data.campaignId,
        title: data.title,
        description: data.description,
        badgeText: data.badgeText,
        category: data.category,
        subService: data.subService,
        audience: data.audience,
        pricing: data.pricing,
        benefits: data.benefits,
        eligibility: data.eligibility,
        offerTypes: data.offerTypes,
        segment: data.segment,
        limitKind: data.limitKind,
        linked: data.linked,
        ctaText: data.ctaText,
        claimLimit: data.claimLimit,
        validFrom: new Date(data.validFrom),
        validUntil: new Date(data.validUntil),
        priority: data.priority,
        isFeatured: data.isFeatured,
        isFlashDeal: data.isFlashDeal,
        status: data.status,
        ...updateStamp(actorId),
      },
    },
    { returnDocument: "after" }
  );
  if (!updated) return null;
  if (data.isDealOfTheDay && !updated.isDealOfTheDay) {
    return setDealOfTheDay(id, updated.campaignId, actorId);
  }
  if (!data.isDealOfTheDay && updated.isDealOfTheDay) {
    await collection.updateOne({ _id: id }, { $set: { isDealOfTheDay: false, ...updateStamp(actorId) } });
    return { ...updated, isDealOfTheDay: false };
  }
  return updated;
}

/** Unsets Deal of the Day on every other offer in the campaign, then sets it here. Enforces "at most one per campaign" in one place. */
export async function setDealOfTheDay(offerId: string, campaignId: string, actorId: string): Promise<Offer | null> {
  const collection = await getCollection();
  await collection.updateMany(
    { campaignId, isDealOfTheDay: true, _id: { $ne: offerId } },
    { $set: { isDealOfTheDay: false, ...updateStamp(actorId) } }
  );
  return collection.findOneAndUpdate(
    { _id: offerId, ...notDeleted },
    { $set: { isDealOfTheDay: true, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
}

export async function deleteOffer(id: string, actorId: string): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return { ok: res.modifiedCount === 1 };
}

/** Public offers with their real claim counts attached, ready for the public page / JSON API. */
export async function getPublicOffersWithStats(opts: { campaignId: string; audience?: Audience; now?: Date }): Promise<SerializedOffer[]> {
  const offers = await getPublicOffers(opts);
  const counts = await countClaimsByOffer(offers.map((o) => o._id));
  return offers.map((o) => serializeOffer(o, counts.get(o._id) ?? 0));
}
