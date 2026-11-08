import "server-only";
import { getDb } from "@/lib/mongodb";
import { createStamp, updateStamp, notDeleted, newId as newTxId, type AuditFields } from "@/lib/wallet/db";
import { DEFAULT_CURRENCY, type WalletStatus, type WalletTxType } from "@/lib/wallet/constants";
import { TRANSACTIONS_COLLECTION, type WalletTransaction, type WalletTxWriteInput } from "@/lib/wallet/transactions";

export const WALLETS_COLLECTION = "wallets";

export interface WalletBalances {
  available: number;
  pending: number;
  locked: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  lifetimeExpired: number;
  lifetimeReversed: number;
}

const ZERO_BALANCES: WalletBalances = {
  available: 0,
  pending: 0,
  locked: 0,
  lifetimeEarned: 0,
  lifetimeRedeemed: 0,
  lifetimeExpired: 0,
  lifetimeReversed: 0,
};

/** `_id = external_users._id` — one wallet per portal user, per the spec's own "ONE WALLET" principle. */
export interface Wallet extends AuditFields {
  _id: string;
  role: string;
  balances: WalletBalances;
  currency: string;
  status: WalletStatus;
}

export interface SerializedWallet extends Omit<Wallet, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeWallet(w: Wallet): SerializedWallet {
  return {
    ...w,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
    deletedAt: w.deletedAt ? w.deletedAt.toISOString() : null,
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Wallet>(WALLETS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ role: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

async function getTxCollection() {
  const db = await getDb();
  return db.collection<WalletTransaction>(TRANSACTIONS_COLLECTION);
}

export async function getWallet(userId: string): Promise<Wallet | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: userId, ...notDeleted });
}

/** Creation-safe under concurrency — an upsert with `$setOnInsert`, never a find-then-insert race. */
export async function getOrCreateWallet(userId: string, role: string): Promise<Wallet> {
  const collection = await getCollection();
  const result = await collection.findOneAndUpdate(
    { _id: userId },
    { $setOnInsert: { _id: userId, role, balances: ZERO_BALANCES, currency: DEFAULT_CURRENCY, status: "active", ...createStamp(null) } },
    { upsert: true, returnDocument: "after" }
  );
  return result as Wallet;
}

export interface BalanceDelta {
  available?: number;
  pending?: number;
  locked?: number;
  lifetimeEarned?: number;
  lifetimeRedeemed?: number;
  lifetimeExpired?: number;
  lifetimeReversed?: number;
}

/**
 * The one atomic primitive every balance-affecting operation in this module
 * goes through — a single `findOneAndUpdate` with `$inc`, optionally guarded
 * (e.g. `"balances.available": {$gte: amount}` for a reservation). Returns
 * the wallet before and after, or `null` if the guard filter didn't match
 * (insufficient balance / already-transitioned row) — this codebase never
 * uses multi-document transactions, so this guarded single-document update
 * is the real atomicity boundary (same pattern as `offers/coupons.ts`).
 */
export async function applyBalanceDelta(
  userId: string,
  delta: BalanceDelta,
  guard: Record<string, unknown> = {}
): Promise<{ before: Wallet; after: Wallet } | null> {
  const collection = await getCollection();
  const before = await collection.findOne({ _id: userId, ...notDeleted });
  if (!before) return null;

  const inc: Record<string, number> = {};
  for (const [key, value] of Object.entries(delta)) {
    if (value) inc[`balances.${key}`] = value;
  }
  if (Object.keys(inc).length === 0) return { before, after: before };

  const after = await collection.findOneAndUpdate(
    { _id: userId, ...notDeleted, ...guard },
    { $inc: inc, $set: updateStamp(null) },
    { returnDocument: "after" }
  );
  if (!after) return null;
  return { before, after };
}

export type CreditLedgerInput = Omit<WalletTxWriteInput, "balanceBefore" | "balanceAfter">;

/** Inserts a ledger row from an already-computed before/after pair — never called with a guessed balance. */
export async function insertLedgerRow(input: CreditLedgerInput, balanceBefore: number, balanceAfter: number): Promise<WalletTransaction> {
  const collection = await getTxCollection();
  const doc: WalletTransaction = {
    _id: newTxId(),
    ...input,
    balanceBefore,
    balanceAfter,
    createdAt: new Date(),
  };
  await collection.insertOne(doc);
  return doc;
}

/**
 * Scoped, cheap, per-user expiry reconciliation — run before any redemption
 * reservation so an expired lot can never be spent. No global sweep, no
 * cron: this is the correctness mechanism for Phase 1 (see plan §"Expiry").
 */
export async function reconcileExpiredLots(userId: string): Promise<void> {
  const txCollection = await getTxCollection();
  const now = new Date();
  const expiredLots = await txCollection
    .find({
      userId,
      direction: "credit",
      bucket: "available",
      status: "active",
      expiresAt: { $ne: null, $lt: now },
    })
    .toArray();

  for (const lot of expiredLots) {
    const flipped = await txCollection.findOneAndUpdate(
      { _id: lot._id, status: "active" },
      { $set: { status: "expired" } },
      { returnDocument: "after" }
    );
    if (!flipped) continue; // already handled concurrently

    const result = await applyBalanceDelta(userId, { available: -lot.amount, lifetimeExpired: lot.amount });
    if (!result) continue;
    await insertLedgerRow(
      {
        userId,
        type: "expiry",
        direction: "debit",
        bucket: "available",
        amount: lot.amount,
        status: "active",
        expiresAt: null,
        idempotencyKey: `expiry:${lot._id}`,
        referenceType: null,
        referenceId: lot._id,
        reason: null,
        metadata: { expiredLotId: lot._id },
        createdBy: null,
      },
      result.before.balances.available,
      result.after.balances.available
    );
  }
}

// ---------------------------------------------------------------------------
// Idempotency — the gate every earning/redemption call claims before doing
// any work. An `insertOne` that throws duplicate-key means the work already
// happened; this is a single atomic operation, avoiding a find-then-insert
// TOCTOU race (no multi-document transactions exist anywhere in this
// codebase to wrap that race in instead).
// ---------------------------------------------------------------------------

interface WalletIdempotencyLock {
  _id: string; // = idempotencyKey
  claimedAt: Date;
}

let lockIndexEnsured = false;

async function getLockCollection() {
  const db = await getDb();
  const collection = db.collection<WalletIdempotencyLock>("wallet_idempotency_locks");
  if (!lockIndexEnsured) {
    lockIndexEnsured = true;
    await collection.createIndex({ claimedAt: 1 }).catch(() => {});
  }
  return collection;
}

/** Returns true if this call successfully claimed the key (do the work); false if it was already claimed (skip — already processed). */
export async function claimIdempotencyKey(key: string): Promise<boolean> {
  const collection = await getLockCollection();
  try {
    await collection.insertOne({ _id: key, claimedAt: new Date() });
    return true;
  } catch {
    return false; // duplicate key — already claimed
  }
}

export interface CreditWalletInput {
  userId: string;
  role: string;
  type: WalletTxType;
  amount: number;
  idempotencyKey: string;
  expiresInDays?: number | null;
  referenceType?: WalletTransaction["referenceType"];
  referenceId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  actorId?: string | null; // null = system-issued
}

/**
 * The one shared "earn" primitive — idempotency claim → ensure wallet →
 * atomic `available`/`lifetimeEarned` increment → ledger row. Returns the
 * inserted transaction, or `null` if this exact event was already
 * processed (idempotent no-op, not an error).
 */
export async function creditWallet(input: CreditWalletInput): Promise<WalletTransaction | null> {
  const claimed = await claimIdempotencyKey(input.idempotencyKey);
  if (!claimed) return null;

  await getOrCreateWallet(input.userId, input.role);
  const result = await applyBalanceDelta(input.userId, { available: input.amount, lifetimeEarned: input.amount });
  if (!result) return null; // wallet vanished mid-flight — should not happen, fail closed

  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400000) : null;

  return insertLedgerRow(
    {
      userId: input.userId,
      type: input.type,
      direction: "credit",
      bucket: "available",
      amount: input.amount,
      status: "active",
      expiresAt,
      idempotencyKey: input.idempotencyKey,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      reason: input.reason ?? null,
      metadata: input.metadata ?? {},
      createdBy: input.actorId ?? null,
    },
    result.before.balances.available,
    result.after.balances.available
  );
}

export async function freezeWallet(userId: string, actorId: string): Promise<void> {
  const collection = await getCollection();
  await collection.updateOne({ _id: userId }, { $set: { status: "frozen", ...updateStamp(actorId) } });
}

export async function unfreezeWallet(userId: string, actorId: string): Promise<void> {
  const collection = await getCollection();
  await collection.updateOne({ _id: userId }, { $set: { status: "active", ...updateStamp(actorId) } });
}
