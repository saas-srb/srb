import "server-only";
import { getDb } from "@/lib/mongodb";
import { getActiveCampaign, serializeCampaign, type OfferCampaign, type SerializedCampaign } from "@/lib/offers/campaigns";
import { getPublicOffersWithStats, serializeOffer, type SerializedOffer } from "@/lib/offers/offers";
import type { Offer } from "@/lib/offers/offers";

/** A campaign starting within this many days is "Coming Soon"; further out it is a "Future Campaign". */
export const COMING_SOON_WINDOW_DAYS = 7;

export type OffersState = "active" | "coming_soon" | "future" | "none";

export interface UpcomingCampaign {
  campaign: SerializedCampaign;
  /** Live offer count so far (offers marked active, valid in the future). */
  offerCount: number;
}

export interface OffersPageData {
  state: OffersState;
  serverTime: number;
  /** State `active` only. */
  active: { campaign: SerializedCampaign; offers: SerializedOffer[] } | null;
  /** States `coming_soon` / `future`: the next campaign to go live, with masked preview offers. */
  next: { campaign: SerializedCampaign; preview: SerializedOffer[] } | null;
  /** Every other upcoming campaign after `next` (chronological). */
  later: UpcomingCampaign[];
  /** State `none`: the most recently ended campaign, for a "you missed it — get the next one" nudge. */
  lastEnded: { name: string; endedAt: string } | null;
}

/**
 * Masks anything that shouldn't be public before launch: exact prices stay
 * hidden (the discount badge, benefits and type are enough to build
 * anticipation), and claim counts are meaningless pre-launch.
 */
function maskForPreview(o: Offer): SerializedOffer {
  const s = serializeOffer(o, undefined);
  return { ...s, pricing: { ...s.pricing, originalPrice: undefined }, claimLimit: null };
}

export async function getUpcomingCampaigns(now: Date): Promise<OfferCampaign[]> {
  const db = await getDb();
  return db
    .collection<OfferCampaign>("offer_campaigns")
    .find({ deletedAt: null, status: { $in: ["scheduled", "active"] }, startDate: { $gt: now }, endDate: { $gt: now } })
    .sort({ startDate: 1, priority: -1 })
    .limit(12)
    .toArray();
}

async function previewOffersFor(campaignId: string, now: Date): Promise<SerializedOffer[]> {
  const db = await getDb();
  const rows = await db
    .collection<Offer>("offers")
    .find({ deletedAt: null, campaignId, status: "active", validUntil: { $gte: now } })
    .sort({ priority: -1, createdAt: -1 })
    .limit(24)
    .toArray();
  return rows.map(maskForPreview);
}

/**
 * The one place that decides which experience /offers renders. Everything is
 * derived from the campaign's own start/end dates and status in the database,
 * so admins never touch frontend code: change a date or a status in the LMS
 * and the page switches state on the next request.
 */
export async function resolveOffersPage(now: Date = new Date()): Promise<OffersPageData> {
  const base: Omit<OffersPageData, "state"> = { serverTime: now.getTime(), active: null, next: null, later: [], lastEnded: null };

  const live = await getActiveCampaign(now);
  if (live) {
    const offers = await getPublicOffersWithStats({ campaignId: live._id, now });
    return { ...base, state: "active", active: { campaign: serializeCampaign(live), offers }, later: [] };
  }

  const upcoming = await getUpcomingCampaigns(now);
  if (upcoming.length > 0) {
    const [first, ...rest] = upcoming;
    const preview = await previewOffersFor(first._id, now);
    const days = (first.startDate.getTime() - now.getTime()) / 86400000;
    const db = await getDb();
    const counts = await db
      .collection("offers")
      .aggregate<{ _id: string; n: number }>([{ $match: { deletedAt: null, status: "active", campaignId: { $in: rest.map((c) => c._id) } } }, { $group: { _id: "$campaignId", n: { $sum: 1 } } }])
      .toArray();
    const countMap = new Map(counts.map((r) => [r._id, r.n]));
    return {
      ...base,
      state: days <= COMING_SOON_WINDOW_DAYS ? "coming_soon" : "future",
      next: { campaign: serializeCampaign(first), preview },
      later: rest.map((c) => ({ campaign: serializeCampaign(c), offerCount: countMap.get(c._id) ?? 0 })),
    };
  }

  const db = await getDb();
  const ended = await db
    .collection<OfferCampaign>("offer_campaigns")
    .find({ deletedAt: null, status: { $in: ["scheduled", "active", "expired"] }, endDate: { $lt: now } })
    .sort({ endDate: -1 })
    .limit(1)
    .toArray();
  return { ...base, state: "none", lastEnded: ended[0] ? { name: ended[0].name, endedAt: ended[0].endDate.toISOString() } : null };
}
