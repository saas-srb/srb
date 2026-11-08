import "server-only";
import { getDb } from "@/lib/mongodb";
import type { WalletTxType, WalletBucket, WalletTxDirection, WalletTxStatus } from "@/lib/wallet/constants";

export const TRANSACTIONS_COLLECTION = "wallet_transactions";

/** Insert-only ledger row. Never mutated after insert except the `status` flip performed by `reconcileExpiredLots`/reversal flows — the amount/before/after values themselves are permanent. */
export interface WalletTransaction {
  _id: string;
  userId: string;
  type: WalletTxType;
  direction: WalletTxDirection;
  bucket: WalletBucket;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  status: WalletTxStatus;
  expiresAt: Date | null;
  idempotencyKey: string | null;
  referenceType: "signup" | "referral" | "offer_claim" | "admin_adjustment" | "module_charge" | "activity" | null;
  referenceId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  createdBy: string | null;
}

export type WalletTxWriteInput = Omit<WalletTransaction, "_id" | "createdAt" | "balanceBefore" | "balanceAfter">;

export interface SerializedWalletTransaction extends Omit<WalletTransaction, "createdAt" | "expiresAt"> {
  createdAt: string;
  expiresAt: string | null;
}

export function serializeWalletTx(t: WalletTransaction): SerializedWalletTransaction {
  return { ...t, createdAt: t.createdAt.toISOString(), expiresAt: t.expiresAt ? t.expiresAt.toISOString() : null };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<WalletTransaction>(TRANSACTIONS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ userId: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ userId: 1, direction: 1, bucket: 1, status: 1, expiresAt: 1 }).catch(() => {}),
      collection.createIndex({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }).catch(() => {}),
      collection.createIndex({ type: 1, createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export interface ListTxOptions {
  userId?: string;
  type?: WalletTxType;
  page?: number;
  pageSize?: number;
}

export async function listWalletTransactions(opts: ListTxOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 100);
  const filter: Record<string, unknown> = {};
  if (opts.userId) filter.userId = opts.userId;
  if (opts.type) filter.type = opts.type;

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function getWalletTransaction(id: string): Promise<WalletTransaction | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id });
}
