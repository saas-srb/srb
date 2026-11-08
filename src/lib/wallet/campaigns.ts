import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/wallet/db";
import type { ReferralQualifyingEvent, RewardRuleAudience } from "@/lib/wallet/constants";
import type { ReferralCampaignWriteInput } from "@/lib/wallet/campaign-validation";
import { queueBroadcast } from "@/lib/webpush/send";

export const CAMPAIGNS_COLLECTION = "wallet_referral_campaigns";

export interface ReferralCampaign extends AuditFields {
  _id: string;
  name: string;
  isActive: boolean;
  qualifyingEvent: ReferralQualifyingEvent;
  referrerAudience: RewardRuleAudience;
  maxReferralsPerReferrer: number;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface SerializedReferralCampaign extends Omit<ReferralCampaign, "createdAt" | "updatedAt" | "deletedAt" | "startsAt" | "endsAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

export function serializeCampaign(c: ReferralCampaign): SerializedReferralCampaign {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
    startsAt: c.startsAt ? c.startsAt.toISOString() : null,
    endsAt: c.endsAt ? c.endsAt.toISOString() : null,
  };
}

async function getCollection() {
  const db = await getDb();
  return db.collection<ReferralCampaign>(CAMPAIGNS_COLLECTION);
}

function toDoc(data: ReferralCampaignWriteInput) {
  return { ...data, startsAt: data.startsAt ? new Date(data.startsAt) : null, endsAt: data.endsAt ? new Date(data.endsAt) : null };
}

export async function listCampaigns(): Promise<ReferralCampaign[]> {
  return (await getCollection()).find(notDeleted).sort({ createdAt: -1 }).toArray();
}

export async function getCampaign(id: string): Promise<ReferralCampaign | null> {
  return (await getCollection()).findOne({ _id: id, ...notDeleted });
}

/** A reward campaign is live: website visitors subscribed to "Credits and rewards" get a push (no-op when website push is off). */
async function announce(name: string): Promise<void> {
  await queueBroadcast({ topic: "rewards", title: `Earn credits: ${name}`, body: "A new rewards campaign is on. Tap to see how to earn.", url: "/rewards", trigger: "reward" });
}

export async function createCampaign(data: ReferralCampaignWriteInput, actorId: string): Promise<ReferralCampaign> {
  const doc: ReferralCampaign = { _id: newId(), ...toDoc(data), ...createStamp(actorId) };
  await (await getCollection()).insertOne(doc);
  if (doc.isActive) await announce(doc.name);
  return doc;
}

export async function updateCampaign(id: string, data: ReferralCampaignWriteInput, actorId: string): Promise<ReferralCampaign | null> {
  const col = await getCollection();
  const before = await col.findOne({ _id: id, ...notDeleted }, { projection: { isActive: 1 } });
  const after = await col.findOneAndUpdate({ _id: id, ...notDeleted }, { $set: { ...toDoc(data), ...updateStamp(actorId) } }, { returnDocument: "after" });
  // Switched on just now: tell the visitors who asked to hear about rewards.
  if (after?.isActive && before && !before.isActive) await announce(after.name);
  return after;
}

export async function deleteCampaign(id: string, actorId: string): Promise<void> {
  await (await getCollection()).updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
}

export type CampaignResolution =
  | { state: "no_campaigns" } // nothing configured yet — referrals run with safe defaults so a fresh install still works
  | { state: "inactive" } // campaigns exist but none is live for this referrer right now
  | { state: "active"; campaign: ReferralCampaign };

/**
 * The live campaign for a referrer of `role`. Exact-audience campaigns win
 * over "ALL". When the admin has never created a campaign the program runs
 * with defaults (account_created qualification, cap 50) so it isn't silently
 * dead on a fresh database; once any campaign exists, only a live one counts
 * — that is how an admin switches referrals off.
 */
export async function resolveCampaign(referrerRole: string, now = new Date()): Promise<CampaignResolution> {
  const all = await listCampaigns();
  if (all.length === 0) return { state: "no_campaigns" };
  const live = all.filter(
    (c) =>
      c.isActive &&
      (!c.startsAt || c.startsAt <= now) &&
      (!c.endsAt || c.endsAt >= now) &&
      (c.referrerAudience === "ALL" || c.referrerAudience === referrerRole)
  );
  if (live.length === 0) return { state: "inactive" };
  const exact = live.find((c) => c.referrerAudience === referrerRole);
  return { state: "active", campaign: exact ?? live[0] };
}

export const DEFAULT_CAMPAIGN_SETTINGS = { qualifyingEvent: "account_created" as ReferralQualifyingEvent, maxReferralsPerReferrer: 50 };
