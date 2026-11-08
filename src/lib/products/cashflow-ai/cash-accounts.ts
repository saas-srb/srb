import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { round2, DEFAULT_FUND_ACCOUNT_STATUS, type FundAccountStatus } from "@/lib/products/cashflow-ai/constants";

/**
 * Company cash accounts (§21) — petty cash / cash-in-hand. No sensitive
 * number to encrypt, unlike bank accounts. Same balance-maintenance story
 * as `bank-accounts.ts`, via the shared `fund-accounts.ts` helper.
 */

export const CASH_ACCOUNTS_COLLECTION = "fms_cash_accounts";

export interface CashAccount extends AuditFields {
  _id: string;
  accountName: string;
  location: string | null;
  department: string | null;
  currency: string;
  openingBalance: number;
  currentBalance: number;
  status: FundAccountStatus;
  notes: string | null;
}

export interface SerializedCashAccount extends Omit<CashAccount, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeCashAccount(a: CashAccount): SerializedCashAccount {
  return {
    ...a,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    deletedAt: a.deletedAt ? a.deletedAt.toISOString() : null,
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<CashAccount>(CASH_ACCOUNTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ accountName: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function getCashAccount(id: string): Promise<CashAccount | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function listCashAccounts(opts: { status?: FundAccountStatus } = {}): Promise<CashAccount[]> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.status) filter.status = opts.status;
  return collection.find(filter).sort({ accountName: 1 }).toArray();
}

export async function listCashAccountOptions(): Promise<{ _id: string; accountName: string; currency: string }[]> {
  const collection = await getCollection();
  const docs = await collection
    .find({ status: "active", ...notDeleted }, { projection: { accountName: 1, currency: 1 } })
    .sort({ accountName: 1 })
    .toArray();
  return docs.map((d) => ({ _id: d._id, accountName: d.accountName, currency: d.currency }));
}

export async function totalCashBalance(): Promise<number> {
  try {
    const collection = await getCollection();
    const rows = await collection.find({ status: { $ne: "closed" }, ...notDeleted }).toArray();
    return round2(rows.reduce((s, a) => s + a.currentBalance, 0));
  } catch {
    return 0;
  }
}

export interface CashAccountWriteData {
  accountName: string;
  location: string | null;
  department: string | null;
  currency: string;
  status: FundAccountStatus;
  notes: string | null;
}

export async function createCashAccount(
  data: CashAccountWriteData & { openingBalance: number },
  actorId: string
): Promise<CashAccount> {
  const collection = await getCollection();
  const opening = round2(data.openingBalance);
  const doc: CashAccount = {
    _id: newId(),
    accountName: data.accountName,
    location: data.location,
    department: data.department,
    currency: data.currency,
    openingBalance: opening,
    currentBalance: opening,
    status: data.status ?? DEFAULT_FUND_ACCOUNT_STATUS,
    notes: data.notes,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updateCashAccount(id: string, data: CashAccountWriteData, actorId: string): Promise<CashAccount | null> {
  const collection = await getCollection();
  return collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...data, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
}

export async function deleteCashAccount(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const account = await collection.findOne({ _id: id, ...notDeleted });
  if (!account) return { ok: false, reason: "Cash account not found." };
  if (account.currentBalance !== 0) return { ok: false, reason: "Only zero-balance accounts can be deleted. Close it instead." };
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: true };
}
