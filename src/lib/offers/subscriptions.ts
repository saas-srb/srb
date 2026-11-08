import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/offers/db";
import { notifyPortalUser } from "@/lib/products/clientos/notifications";
import { queueBroadcast } from "@/lib/webpush/send";
import type { SubscriptionInput, SubscriptionSource } from "@/lib/offers/subscription-validation";
import type { Audience } from "@/lib/offers/constants";

export const SUBSCRIPTIONS_COLLECTION = "offer_subscriptions";

export interface OfferSubscription {
  _id: string;
  email: string;
  name?: string;
  phone?: string;
  interest: Audience | null;
  message?: string;
  /** null = wants to hear about any upcoming campaign. */
  campaignId: string | null;
  source: SubscriptionSource;
  /** Campaigns this subscriber has already been told about (in-portal notice sent). */
  notifiedCampaignIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const c = db.collection<OfferSubscription>(SUBSCRIPTIONS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      c.createIndex({ email: 1, campaignId: 1 }, { unique: true }).catch(() => {}),
      c.createIndex({ campaignId: 1, createdAt: -1 }).catch(() => {}),
    ]);
  }
  return c;
}

/** Idempotent per (email, campaign): resubscribing updates details instead of creating a duplicate. */
export async function subscribeToOffers(input: SubscriptionInput): Promise<{ created: boolean }> {
  const c = await getCollection();
  const now = new Date();
  const res = await c.updateOne(
    { email: input.email, campaignId: input.campaignId },
    {
      $set: { updatedAt: now, interest: input.interest ?? null, source: input.source, ...(input.name ? { name: input.name } : {}), ...(input.phone ? { phone: input.phone } : {}), ...(input.message ? { message: input.message } : {}) },
      $setOnInsert: { _id: newId(), email: input.email, campaignId: input.campaignId, notifiedCampaignIds: [], createdAt: now },
    },
    { upsert: true }
  );
  return { created: res.upsertedCount === 1 };
}

export async function listSubscriptions(opts: { campaignId?: string | "any"; limit?: number } = {}): Promise<OfferSubscription[]> {
  const c = await getCollection();
  const filter: Record<string, unknown> = {};
  if (opts.campaignId === "any") filter.campaignId = null;
  else if (opts.campaignId) filter.campaignId = opts.campaignId;
  return c.find(filter).sort({ createdAt: -1 }).limit(opts.limit ?? 500).toArray();
}

export async function countSubscribersByCampaign(): Promise<Map<string | null, number>> {
  const c = await getCollection();
  const rows = await c.aggregate<{ _id: string | null; n: number }>([{ $group: { _id: "$campaignId", n: { $sum: 1 } } }]).toArray();
  return new Map(rows.map((r) => [r._id, r.n]));
}

/**
 * Runs once per campaign, the first time the public page serves it as live.
 * Guarded by an atomic `startNotifiedAt` stamp on the campaign so concurrent
 * requests can't double-send. Subscribers who have a portal account get an
 * in-portal notification. Email / WhatsApp are NOT sent (no mailer is
 * configured in this codebase) — the LMS Subscribers page exports the rest.
 */
export async function dispatchCampaignStart(campaign: { _id: string; name: string }): Promise<{ notified: number } | null> {
  const db = await getDb();
  const claimed = await db
    .collection<{ _id: string; startNotifiedAt?: Date }>("offer_campaigns")
    .findOneAndUpdate({ _id: campaign._id, startNotifiedAt: { $exists: false } }, { $set: { startNotifiedAt: new Date() } });
  if (!claimed) return null; // already dispatched

  // Website visitors who opted in to offers get a push (once: the stamp above guarantees it).
  await queueBroadcast({ topic: "offers", title: `${campaign.name} is live`, body: "New offers are available now. Tap to see them.", url: "/offers", trigger: "offer" });

  const c = await getCollection();
  const subs = await c.find({ $or: [{ campaignId: campaign._id }, { campaignId: null }], notifiedCampaignIds: { $ne: campaign._id } }).toArray();
  if (subs.length === 0) return { notified: 0 };

  const users = await db
    .collection<{ _id: string; email: string }>("external_users")
    .find({ email: { $in: subs.map((s) => s.email) } })
    .project({ email: 1 })
    .toArray();
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u._id]));
  let notified = 0;
  for (const s of subs) {
    const userId = byEmail.get(s.email);
    if (userId) {
      await notifyPortalUser({
        recipientUserId: userId,
        type: "offer.campaign_live",
        title: `${campaign.name} is live`,
        body: "The offers you asked to be notified about are now available.",
        link: "/offers",
        dedupeKey: `offer_campaign_live:${campaign._id}:${userId}`,
      });
      notified++;
    }
  }
  await c.updateMany({ _id: { $in: subs.map((s) => s._id) } }, { $addToSet: { notifiedCampaignIds: campaign._id }, $set: { updatedAt: new Date() } });
  return { notified };
}
