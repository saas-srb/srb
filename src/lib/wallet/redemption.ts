import "server-only";
import { applyBalanceDelta, insertLedgerRow, reconcileExpiredLots, claimIdempotencyKey, getWallet } from "@/lib/wallet/wallets";

export interface ReserveResult {
  ok: boolean;
  error?: string;
  transactionId?: string;
}

/**
 * Reserve → confirm/release. Called from `/api/offers/claim` (the only
 * redemption surface in Phase 1). `reserve` moves credits `available →
 * locked`; `confirm` (only after the real claim/order succeeds) moves
 * `locked → spent` (via `lifetimeRedeemed`); `release` (the route's catch
 * block, or a retried/duplicate call) reverses the reservation. Every step
 * is a single guarded `findOneAndUpdate` — the only real atomicity
 * primitive available in this codebase (no multi-document transactions
 * exist anywhere).
 */
export async function reserveWalletCredit(userId: string, amount: number, idempotencyKey: string): Promise<ReserveResult> {
  if (amount <= 0) return { ok: false, error: "Amount must be greater than zero." };

  const claimed = await claimIdempotencyKey(idempotencyKey);
  if (!claimed) return { ok: false, error: "This redemption was already processed." };

  await reconcileExpiredLots(userId);

  const result = await applyBalanceDelta(userId, { available: -amount, locked: amount }, { "balances.available": { $gte: amount }, status: "active" });
  if (!result) return { ok: false, error: "Insufficient wallet balance, or the wallet is frozen." };

  const tx = await insertLedgerRow(
    {
      userId,
      type: "redemption_reserved",
      direction: "debit",
      bucket: "available",
      amount,
      status: "active",
      expiresAt: null,
      idempotencyKey,
      referenceType: "offer_claim",
      referenceId: null,
      reason: null,
      metadata: {},
      createdBy: null,
    },
    result.before.balances.available,
    result.after.balances.available
  );

  return { ok: true, transactionId: tx._id };
}

export async function confirmWalletRedemption(userId: string, amount: number, claimId: string, reservationIdempotencyKey: string): Promise<void> {
  const result = await applyBalanceDelta(userId, { locked: -amount, lifetimeRedeemed: amount });
  if (!result) return;

  await insertLedgerRow(
    {
      userId,
      type: "redemption_confirmed",
      direction: "debit",
      bucket: "locked",
      amount,
      status: "active",
      expiresAt: null,
      idempotencyKey: `${reservationIdempotencyKey}:confirmed`,
      referenceType: "offer_claim",
      referenceId: claimId,
      reason: null,
      metadata: {},
      createdBy: null,
    },
    result.before.balances.locked,
    result.after.balances.locked
  );
}

/** Guarded on a fresh idempotency key derived from the reservation's, so a retried release (e.g. the catch block firing twice) is a no-op rather than double-crediting. */
export async function releaseWalletReservation(userId: string, amount: number, reservationIdempotencyKey: string): Promise<void> {
  const releaseKey = `${reservationIdempotencyKey}:released`;
  const claimed = await claimIdempotencyKey(releaseKey);
  if (!claimed) return;

  const result = await applyBalanceDelta(userId, { locked: -amount, available: amount });
  if (!result) return;

  await insertLedgerRow(
    {
      userId,
      type: "redemption_released",
      direction: "credit",
      bucket: "locked",
      amount,
      status: "active",
      expiresAt: null,
      idempotencyKey: releaseKey,
      referenceType: "offer_claim",
      referenceId: null,
      reason: null,
      metadata: {},
      createdBy: null,
    },
    result.before.balances.locked,
    result.after.balances.locked
  );
}

export async function getAvailableBalance(userId: string): Promise<number> {
  await reconcileExpiredLots(userId);
  const wallet = await getWallet(userId);
  return wallet?.balances.available ?? 0;
}
