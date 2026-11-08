import { cmsEvents } from "@/lib/notify/triggers/cms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/offers/db";
import type { Audience } from "@/lib/offers/constants";
import type { CategorySlug } from "@/lib/categories";

export const CLAIMS_COLLECTION = "offer_claims";

export interface OfferClaimPricing {
  originalPrice?: number;
  offerDiscountAmount?: number;
  couponDiscountAmount?: number;
  totalDiscountApplied?: number;
  finalPrice?: number;
  currency?: string;
  /** Wallet credits applied server-side at claim time (Wallet & Credits module). */
  walletAmountApplied?: number;
}

export interface OfferClaim {
  _id: string;
  leadId: string;
  category: CategorySlug;
  leadEmail?: string;
  campaignId: string;
  offerId: string;
  couponCode?: string;
  audience: Extract<Audience, "CLIENT" | "STUDENT" | "INTERN" | "HIRING">;
  audienceFields: Record<string, string | undefined>;
  pricing: OfferClaimPricing;
  createdAt: Date;
}

export interface SerializedOfferClaim extends Omit<OfferClaim, "createdAt"> {
  createdAt: string;
}

export function serializeClaim(c: OfferClaim): SerializedOfferClaim {
  return { ...c, createdAt: c.createdAt.toISOString() };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<OfferClaim>(CLAIMS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ campaignId: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ offerId: 1 }).catch(() => {}),
      collection.createIndex({ couponCode: 1, leadEmail: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export interface CreateClaimInput {
  leadId: string;
  category: CategorySlug;
  leadEmail?: string;
  campaignId: string;
  offerId: string;
  couponCode?: string;
  audience: Extract<Audience, "CLIENT" | "STUDENT" | "INTERN" | "HIRING">;
  audienceFields: Record<string, string | undefined>;
  pricing: OfferClaimPricing;
}

export async function createOfferClaim(data: CreateClaimInput): Promise<OfferClaim> {
  const collection = await getCollection();
  const doc: OfferClaim = {
    _id: newId(),
    ...data,
    leadEmail: data.leadEmail?.trim().toLowerCase(),
    createdAt: new Date(),
  };
  await collection.insertOne(doc);
  await cmsEvents.offerClaimed({ id: doc._id, offerTitle: (doc as { offerTitle?: string }).offerTitle ?? null, name: (doc as { leadName?: string; name?: string }).leadName ?? (doc as { name?: string }).name ?? null });
  return doc;
}

export interface ClaimFilter {
  campaignId?: string;
  offerId?: string;
}

export async function listClaims(filter: ClaimFilter = {}, limit = 200): Promise<OfferClaim[]> {
  const collection = await getCollection();
  const query: Record<string, unknown> = {};
  if (filter.campaignId) query.campaignId = filter.campaignId;
  if (filter.offerId) query.offerId = filter.offerId;
  return collection.find(query).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function countClaimsForCouponAndEmail(couponCode: string, email: string): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments({ couponCode, leadEmail: email.trim().toLowerCase() });
}

/** Real claim counts per offer — the only source for public "N claimed" / progress numbers. */
export async function countClaimsByOffer(offerIds: string[]): Promise<Map<string, number>> {
  if (offerIds.length === 0) return new Map();
  const collection = await getCollection();
  const rows = await collection
    .aggregate<{ _id: string; count: number }>([{ $match: { offerId: { $in: offerIds } } }, { $group: { _id: "$offerId", count: { $sum: 1 } } }])
    .toArray();
  return new Map(rows.map((r) => [r._id, r.count]));
}

export async function countClaimsForOffer(offerId: string): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments({ offerId });
}

export async function hasClaimByEmail(email: string): Promise<boolean> {
  const collection = await getCollection();
  return (await collection.countDocuments({ leadEmail: email.trim().toLowerCase() }, { limit: 1 })) > 0;
}
