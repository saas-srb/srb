import { clientIpFrom } from "@/lib/security/ip";
import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { headers, cookies } from "next/headers";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, type AuditFields } from "@/lib/wallet/db";
import { randomReferralCode, formatCredits, type ReferralStatus } from "@/lib/wallet/constants";
import { creditWallet } from "@/lib/wallet/wallets";
import { awardActivity } from "@/lib/wallet/earn";
import { resolveActiveRewardRule } from "@/lib/wallet/reward-rules";
import { externalUsers } from "@/lib/portal-auth";
import { notifyPortalUser } from "@/lib/products/clientos/notifications";
import { resolveCampaign, DEFAULT_CAMPAIGN_SETTINGS } from "@/lib/wallet/campaigns";
import type { RewardRuleAudience, ReferralQualifyingEvent } from "@/lib/wallet/constants";

export const REFERRALS_COLLECTION = "referrals";

export interface Referral extends AuditFields {
  _id: string;
  referrerUserId: string;
  referralCode: string;
  refereeUserId: string;
  status: ReferralStatus;
  qualifyingEvent: ReferralQualifyingEvent;
  campaignId: string | null;
  rewardTransactionId: { referrer: string | null; referee: string | null };
  rewardAmounts: { referrer: number; referee: number };
  qualifiedAt: Date | null;
  rewardedAt: Date | null;
  /** Why the referral is on hold / rejected — always human-readable, shown in the admin queue. */
  statusReason: string | null;
  /** Machine-readable fraud signals that tripped, e.g. "shared_ip", "velocity". */
  flags: string[];
  /** sha256 of the signup IP — the raw address is never stored. */
  ipHash: string | null;
  /** sha256 of the anonymous first-party device cookie. */
  deviceHash?: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
}

export interface SerializedReferral extends Omit<Referral, "createdAt" | "updatedAt" | "deletedAt" | "qualifiedAt" | "rewardedAt" | "reviewedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  qualifiedAt: string | null;
  rewardedAt: string | null;
  reviewedAt: string | null;
}

export function serializeReferral(r: Referral): SerializedReferral {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    qualifiedAt: r.qualifiedAt ? r.qualifiedAt.toISOString() : null,
    rewardedAt: r.rewardedAt ? r.rewardedAt.toISOString() : null,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
  };
}

let indexesEnsured = false;

export async function getReferralsCollection() {
  return getCollection();
}

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Referral>(REFERRALS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ refereeUserId: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ referrerUserId: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ status: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ ipHash: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ deviceHash: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function listReferralsForReferrer(referrerUserId: string): Promise<Referral[]> {
  const collection = await getCollection();
  return collection.find({ referrerUserId }).sort({ createdAt: -1 }).toArray();
}

export async function listAllReferrals(limit = 200): Promise<Referral[]> {
  const collection = await getCollection();
  return collection.find({}).sort({ createdAt: -1 }).limit(limit).toArray();
}

/**
 * Lazily generated on first `/clientos/referrals` visit — a random 8-char
 * code, never an internal id. Relies on the unique sparse index on
 * `external_users.referralCode` (added in `portal-auth.ts`): a collision
 * with another user's code throws a duplicate-key error here, caught and
 * retried with a fresh random code; a `modifiedCount === 0` with no throw
 * means this account already got a code from a concurrent call, so just
 * re-read it.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const users = await externalUsers();
  const existing = await users.findOne({ _id: userId });
  if (existing?.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomReferralCode(randomBytes(8));
    try {
      const res = await users.updateOne({ _id: userId, referralCode: { $in: [null, undefined] } }, { $set: { referralCode: code } });
      if (res.modifiedCount === 1) return code;
      const refreshed = await users.findOne({ _id: userId });
      if (refreshed?.referralCode) return refreshed.referralCode;
    } catch {
      continue; // duplicate-key on referralCode — another account already has this code, retry with a new one
    }
  }
  throw new Error("Could not generate a referral code — please try again.");
}

/** Collapses `a.b+tag@gmail.com` and `ab@gmail.com` to one identity so trivial alias tricks can't self-refer. */
export function normalizeEmailIdentity(email: string): string {
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!domain) return email.trim().toLowerCase();
  let l = local.split("+")[0];
  if (domain === "gmail.com" || domain === "googlemail.com") l = l.replace(/\./g, "");
  return `${l}@${domain === "googlemail.com" ? "gmail.com" : domain}`;
}

function digits(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

async function requestIpHash(): Promise<string | null> {
  try {
    const h = await headers();
    const ip = clientIpFrom(h);
    if (!ip || ip === "unknown") return null;
    return createHash("sha256").update(`yo-referral:${ip}`).digest("hex").slice(0, 32);
  } catch {
    return null; // called outside a request scope (script/test) — no signal, never an error
  }
}

async function requestDeviceHash(): Promise<string | null> {
  try {
    const id = (await cookies()).get("yo_did")?.value;
    return id ? createHash("sha256").update(`yo-device:${id}`).digest("hex").slice(0, 32) : null;
  } catch {
    return null;
  }
}

const HOUR = 3600_000;

/**
 * Attribution at signup. Records the referrer↔referee relationship for every
 * valid code (so the admin sees rejected/held attempts too), then decides
 * one of: REJECTED (self/alias/duplicate-contact/inactive program/cap),
 * FRAUD_HOLD (velocity or shared-IP signals — a human decides), REGISTERED
 * ("Pending", waiting on the campaign's qualifying event), or REWARDED
 * (qualifying event is account creation, so both sides are paid now).
 * Never throws for a bad code — a bad `?ref=` must never block a signup.
 */
export async function attributeAndRewardReferral(
  referralCodeRaw: string | null | undefined,
  refereeUserId: string,
  refereeRole: RewardRuleAudience
): Promise<void> {
  const code = referralCodeRaw?.trim().toUpperCase();
  if (!code) return;

  const users = await externalUsers();
  const referrer = await users.findOne({ referralCode: code });
  if (!referrer) return; // unknown/stale code — silently ignore
  if (referrer._id === refereeUserId) return; // self-referral (same account)

  const referee = await users.findOne({ _id: refereeUserId });
  const collection = await getCollection();
  const resolution = await resolveCampaign(referrer.role);
  const campaign = resolution.state === "active" ? resolution.campaign : null;
  const qualifyingEvent = campaign?.qualifyingEvent ?? DEFAULT_CAMPAIGN_SETTINGS.qualifyingEvent;
  const cap = campaign?.maxReferralsPerReferrer ?? DEFAULT_CAMPAIGN_SETTINGS.maxReferralsPerReferrer;
  const ipHash = await requestIpHash();
  const deviceHash = await requestDeviceHash();

  let status: Referral["status"] = "REGISTERED";
  let statusReason: string | null = null;
  const flags: string[] = [];

  if (resolution.state === "inactive") {
    status = "REJECTED";
    statusReason = "No referral campaign is active for this account type.";
  } else if (referee && (digits(referee.phone) === digits(referrer.phone) || normalizeEmailIdentity(referee.email) === normalizeEmailIdentity(referrer.email))) {
    status = "REJECTED";
    statusReason = "Referred person shares the referrer's email or phone (self-referral).";
    flags.push("same_identity");
  } else if ((await collection.countDocuments({ referrerUserId: referrer._id, status: { $ne: "REJECTED" } })) >= cap) {
    status = "REJECTED";
    statusReason = `Referrer reached the campaign limit of ${cap} referrals.`;
  } else {
    if ((await collection.countDocuments({ referrerUserId: referrer._id, createdAt: { $gte: new Date(Date.now() - HOUR) } })) >= 3) flags.push("velocity");
    if (ipHash && (await collection.countDocuments({ ipHash, status: { $ne: "REJECTED" }, createdAt: { $gte: new Date(Date.now() - 24 * HOUR) } })) >= 2) flags.push("shared_ip");
    if (deviceHash && (await collection.countDocuments({ deviceHash, status: { $ne: "REJECTED" } })) >= 1) flags.push("shared_device");
    if (flags.length > 0) {
      status = "FRAUD_HOLD";
      statusReason = `Held for review: ${flags.join(", ")}.`;
    }
  }

  const referral: Referral = {
    _id: newId(),
    referrerUserId: referrer._id,
    referralCode: code,
    refereeUserId,
    status,
    qualifyingEvent,
    campaignId: campaign?._id ?? null,
    rewardTransactionId: { referrer: null, referee: null },
    rewardAmounts: { referrer: 0, referee: 0 },
    qualifiedAt: null,
    rewardedAt: null,
    statusReason,
    flags,
    ipHash,
    deviceHash,
    reviewedBy: null,
    reviewedAt: null,
    ...createStamp(null),
  };

  try {
    await collection.insertOne(referral);
  } catch {
    return; // unique index on refereeUserId — this account was already attributed once
  }

  if (status === "REGISTERED" && qualifyingEvent === "account_created") {
    await rewardReferral(referral._id, refereeRole);
  } else if (status === "REGISTERED") {
    await notifyPortalUser({
      recipientUserId: referrer._id,
      type: "wallet.referral_pending",
      title: "Someone joined with your referral link",
      body: "You'll earn your reward once they complete their first step.",
      link: "/clientos/referrals",
      dedupeKey: `wallet.referral_pending:${referral._id}`,
    });
  }
}

/**
 * Pays both sides of a referral. Used by attribution (account_created
 * campaigns), by `qualifyReferralOnEvent`, and by an admin approving a
 * held referral. The status flip to QUALIFIED is a guarded atomic update, so
 * two racing callers can never both proceed; the credits themselves are
 * additionally idempotent by key.
 */
export async function rewardReferral(referralId: string, refereeRoleHint?: RewardRuleAudience, actorId: string | null = null): Promise<boolean> {
  const collection = await getCollection();
  const claimed = await collection.findOneAndUpdate(
    { _id: referralId, status: { $in: ["REGISTERED", "FRAUD_HOLD"] } },
    { $set: { status: "QUALIFIED", qualifiedAt: new Date(), ...(actorId ? { reviewedBy: actorId, reviewedAt: new Date() } : {}), ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
  if (!claimed) return false;

  const users = await externalUsers();
  const [referrer, referee] = await Promise.all([users.findOne({ _id: claimed.referrerUserId }), users.findOne({ _id: claimed.refereeUserId })]);
  if (!referrer || !referee) return false;
  const refereeRole = (refereeRoleHint ?? referee.role) as RewardRuleAudience;

  const referrerRule = await resolveActiveRewardRule("referral_referrer", referrer.role as RewardRuleAudience);
  const refereeRule = await resolveActiveRewardRule("referral_referee", refereeRole);

  let referrerTxId: string | null = null;
  let refereeTxId: string | null = null;

  if (referrerRule) {
    const tx = await creditWallet({
      userId: referrer._id,
      role: referrer.role,
      type: "referral_bonus_referrer",
      amount: referrerRule.amount,
      idempotencyKey: `referral_referrer:${referralId}`,
      expiresInDays: referrerRule.expiresInDays,
      referenceType: "referral",
      referenceId: referralId,
      actorId,
    });
    referrerTxId = tx?._id ?? null;
    if (tx) {
      await notifyPortalUser({
        recipientUserId: referrer._id,
        type: "wallet.referral_rewarded",
        title: "🎉 Your referral qualified",
        body: `You earned ${formatCredits(referrerRule.amount)} for a successful referral.`,
        link: "/clientos/referrals",
        dedupeKey: `wallet.referral_referrer:${referralId}`,
      });
    }
  }

  if (refereeRule) {
    const tx = await creditWallet({
      userId: referee._id,
      role: referee.role,
      type: "referral_bonus_referee",
      amount: refereeRule.amount,
      idempotencyKey: `referral_referee:${referralId}`,
      expiresInDays: refereeRule.expiresInDays,
      referenceType: "referral",
      referenceId: referralId,
      actorId,
    });
    refereeTxId = tx?._id ?? null;
    if (tx) {
      await notifyPortalUser({
        recipientUserId: referee._id,
        type: "wallet.credit_earned",
        title: "🎉 Referral welcome bonus",
        body: `You earned ${formatCredits(refereeRule.amount)} for joining via a referral.`,
        link: "/clientos/wallet",
        dedupeKey: `wallet.referral_referee:${referralId}`,
      });
    }
  }

  await collection.updateOne(
    { _id: referralId },
    {
      $set: {
        status: "REWARDED",
        rewardedAt: new Date(),
        statusReason: null,
        rewardTransactionId: { referrer: referrerTxId, referee: refereeTxId },
        rewardAmounts: { referrer: referrerRule?.amount ?? 0, referee: refereeRule?.amount ?? 0 },
        ...updateStamp(actorId),
      },
    }
  );

  // Milestone bonus: the referrer's 3rd / 5th / 10th… rewarded referral can carry an extra reward (rule subKey = the count).
  const rewardedCount = await collection.countDocuments({ referrerUserId: referrer._id, status: "REWARDED" });
  await awardActivity({ userId: referrer._id, role: referrer.role, type: "referral_milestone", key: `${referrer._id}:${rewardedCount}`, subKey: String(rewardedCount), detail: `${rewardedCount} rewarded referrals` });
  return true;
}

/** Call from any product when a referred user completes a qualifying step. Cheap no-op for everyone who wasn't referred. */
export async function qualifyReferralOnEvent(refereeUserId: string, event: ReferralQualifyingEvent): Promise<void> {
  const collection = await getCollection();
  const pending = await collection.findOne({ refereeUserId, status: "REGISTERED", qualifyingEvent: event });
  if (!pending) return;
  await rewardReferral(pending._id);
}

export async function rejectReferral(referralId: string, actorId: string, reason: string): Promise<boolean> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: referralId, status: { $in: ["REGISTERED", "FRAUD_HOLD", "QUALIFIED"] } },
    { $set: { status: "REJECTED", statusReason: reason, reviewedBy: actorId, reviewedAt: new Date(), ...updateStamp(actorId) } }
  );
  return res.modifiedCount === 1;
}

export interface ReferralPreview {
  valid: boolean;
  referrerFirstName?: string;
  /** The best welcome bonus currently on offer to a new user, or 0 when none is configured. */
  welcomeBonus: number;
}

/** Public, minimal, non-sensitive view of a code for the landing banner / join page — first name only. */
export async function getReferralPreview(codeRaw: string): Promise<ReferralPreview> {
  const code = codeRaw.trim().toUpperCase();
  const users = await externalUsers();
  const referrer = await users.findOne({ referralCode: code });
  if (!referrer) return { valid: false, welcomeBonus: 0 };
  const resolution = await resolveCampaign(referrer.role);
  if (resolution.state === "inactive") return { valid: false, welcomeBonus: 0 };
  const roles: RewardRuleAudience[] = ["trainee", "intern", "client", "job_applicant"];
  const rules = await Promise.all(roles.map((r) => resolveActiveRewardRule("referral_referee", r)));
  return {
    valid: true,
    referrerFirstName: referrer.displayName.trim().split(/\s+/)[0] || "A friend",
    welcomeBonus: Math.max(0, ...rules.map((r) => r?.amount ?? 0)),
  };
}

/**
 * Purchase-linked qualification. Called (best-effort, never blocking) by the
 * TMS instalment and FMS receipt paths with whichever record id they know;
 * finds the portal account that owns it and qualifies its pending referral.
 */
export async function qualifyReferralForRecord(ref: { studentId?: string | null; clientId?: string | null }): Promise<void> {
  const filter = ref.studentId ? { studentId: ref.studentId } : ref.clientId ? { clientId: ref.clientId } : null;
  if (!filter) return;
  const users = await externalUsers();
  const user = await users.findOne(filter, { projection: { _id: 1, role: 1 } });
  if (!user) return;
  await qualifyReferralOnEvent(user._id, "first_payment");
  // The payer's own "first payment" reward (once per account).
  await awardActivity({ userId: user._id, role: user.role, type: "first_payment", key: user._id });
}
