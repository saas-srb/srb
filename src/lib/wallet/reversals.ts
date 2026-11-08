import "server-only";
import { getDb } from "@/lib/mongodb";
import { TRANSACTIONS_COLLECTION, type WalletTransaction } from "@/lib/wallet/transactions";
import { applyBalanceDelta, insertLedgerRow, getWallet, claimIdempotencyKey, getOrCreateWallet } from "@/lib/wallet/wallets";
import { getReferralsCollection } from "@/lib/wallet/referrals";
import { updateStamp } from "@/lib/wallet/db";
import { formatCredits } from "@/lib/wallet/constants";
import { notifyPortalUser } from "@/lib/products/clientos/notifications";
import { externalUsers } from "@/lib/portal-auth";

const REVERSIBLE_TYPES = ["signup_bonus", "referral_bonus_referrer", "referral_bonus_referee", "activity_reward", "manual_adjustment"];

async function txCollection() {
  const db = await getDb();
  return db.collection<WalletTransaction>(TRANSACTIONS_COLLECTION);
}

export type ReversalResult = { ok: true; clawedBack: number; unrecovered: number } | { ok: false; error: string };

/**
 * Claws back a previously issued credit. The original row is flipped to
 * `reversed` with a guarded update (so it can only happen once), and a new
 * `reversal` debit row records what was actually recovered. If the user has
 * already spent part of it, only the still-available part is recovered —
 * balances never go negative — and the shortfall is recorded on the ledger
 * row as `unrecovered` so finance can see it.
 */
export async function reverseTransaction(txId: string, actorId: string, reason: string): Promise<ReversalResult> {
  const why = reason.trim();
  if (why.length < 5) return { ok: false, error: "A reason of at least 5 characters is required." };
  const c = await txCollection();
  const original = await c.findOne({ _id: txId });
  if (!original) return { ok: false, error: "Transaction not found." };
  if (original.direction !== "credit" || original.bucket !== "available" || !REVERSIBLE_TYPES.includes(original.type)) {
    return { ok: false, error: "Only issued credits (rewards or manual additions) can be reversed." };
  }
  if (original.status !== "active") return { ok: false, error: `This credit is already ${original.status}.` };

  const flipped = await c.findOneAndUpdate({ _id: txId, status: "active" }, { $set: { status: "reversed" } }, { returnDocument: "after" });
  if (!flipped) return { ok: false, error: "This credit was already reversed." };

  await claimIdempotencyKey(`reversal:${txId}`);
  let claw = 0;
  let result = null;
  for (let attempt = 0; attempt < 4 && !result; attempt++) {
    const wallet = await getWallet(original.userId);
    claw = Math.max(0, Math.min(original.amount, wallet?.balances.available ?? 0));
    if (claw === 0) break;
    result = await applyBalanceDelta(original.userId, { available: -claw, lifetimeReversed: claw }, { "balances.available": { $gte: claw } });
  }
  const before = result?.before.balances.available ?? (await getWallet(original.userId))?.balances.available ?? 0;
  const after = result?.after.balances.available ?? before;
  const recovered = result ? claw : 0;

  await insertLedgerRow(
    {
      userId: original.userId,
      type: "reversal",
      direction: "debit",
      bucket: "available",
      amount: recovered,
      status: "active",
      expiresAt: null,
      idempotencyKey: `reversal:${txId}:row`,
      referenceType: original.referenceType,
      referenceId: original.referenceId,
      reason: why,
      metadata: { reversedTxId: txId, originalAmount: original.amount, unrecovered: original.amount - recovered },
      createdBy: actorId,
    },
    before,
    after
  );
  if (recovered > 0) {
    await notifyPortalUser({
      recipientUserId: original.userId,
      type: "wallet.credit_reversed",
      title: "Credits reversed",
      body: `${formatCredits(recovered)} were removed from your wallet.`,
      link: "/clientos/wallet",
    });
  }
  return { ok: true, clawedBack: recovered, unrecovered: original.amount - recovered };
}

/** Rejects a referral and claws back whatever it paid out — one audited action for the admin queue. */
export async function reverseReferralRewards(referralId: string, actorId: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const why = reason.trim();
  if (why.length < 5) return { ok: false, error: "A reason of at least 5 characters is required." };
  const collection = await getReferralsCollection();
  const referral = await collection.findOne({ _id: referralId });
  if (!referral) return { ok: false, error: "Referral not found." };
  for (const id of [referral.rewardTransactionId.referrer, referral.rewardTransactionId.referee]) {
    if (id) await reverseTransaction(id, actorId, `Referral reversed: ${why}`);
  }
  await collection.updateOne(
    { _id: referralId },
    { $set: { status: "REJECTED", statusReason: `Reversed: ${why}`, reviewedBy: actorId, reviewedAt: new Date(), ...updateStamp(actorId) } }
  );
  return { ok: true };
}

/** Puts spent credits back after a cancelled/refunded order. Idempotent per original redemption row. */
export async function refundRedemption(confirmedTxId: string, actorId: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const why = reason.trim();
  if (why.length < 5) return { ok: false, error: "A reason of at least 5 characters is required." };
  const c = await txCollection();
  const original = await c.findOne({ _id: confirmedTxId });
  if (!original || original.type !== "redemption_confirmed") return { ok: false, error: "Only a completed redemption can be refunded." };
  const flipped = await c.findOneAndUpdate({ _id: confirmedTxId, status: "active" }, { $set: { status: "reversed" } });
  if (!flipped) return { ok: false, error: "This redemption was already refunded." };

  const user = await (await externalUsers()).findOne({ _id: original.userId });
  await getOrCreateWallet(original.userId, user?.role ?? "client");
  const result = await applyBalanceDelta(original.userId, { available: original.amount, lifetimeRedeemed: -original.amount });
  if (!result) return { ok: false, error: "Wallet not found." };
  await insertLedgerRow(
    {
      userId: original.userId,
      type: "reversal",
      direction: "credit",
      bucket: "available",
      amount: original.amount,
      status: "active",
      expiresAt: null,
      idempotencyKey: `refund:${confirmedTxId}`,
      referenceType: original.referenceType,
      referenceId: original.referenceId,
      reason: why,
      metadata: { refundedTxId: confirmedTxId },
      createdBy: actorId,
    },
    result.before.balances.available,
    result.after.balances.available
  );
  await notifyPortalUser({
    recipientUserId: original.userId,
    type: "wallet.credit_refunded",
    title: "Credits refunded",
    body: `${formatCredits(original.amount)} were returned to your wallet.`,
    link: "/clientos/wallet",
  });
  return { ok: true };
}
