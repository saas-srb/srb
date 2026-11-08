import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { round2, DEFAULT_FUND_ACCOUNT_STATUS, type FundAccountStatus } from "@/lib/products/cashflow-ai/constants";
import { encryptField, decryptField, last4Of, maskAccountNumber, isEncryptionConfigured, type EncryptedValue } from "@/lib/products/cashflow-ai/crypto";

/**
 * Company bank accounts (§19). Genuinely new — confirmed via research that
 * no company-level bank account concept exists anywhere in the platform
 * (HRMS's `hrms_bank_accounts` is strictly employee payout destinations).
 * The account number is encrypted at rest (mirrors HRMS's own approach for
 * employee bank details) — a full number can only be stored once
 * `PLATFORM_ENCRYPTION_KEY` is configured; otherwise the write is refused rather
 * than falling back to plaintext.
 */

export const BANK_ACCOUNTS_COLLECTION = "fms_bank_accounts";

export interface BankAccount extends AuditFields {
  _id: string;
  accountName: string;
  bankName: string;
  accountNumberEnc: EncryptedValue | null;
  accountNumberLast4: string | null;
  ifsc: string | null;
  branch: string | null;
  currency: string;
  openingBalance: number;
  currentBalance: number;
  status: FundAccountStatus;
  notes: string | null;
}

/** What crosses to the client — never the ciphertext or the full number. */
export interface SerializedBankAccount
  extends Omit<BankAccount, "createdAt" | "updatedAt" | "deletedAt" | "accountNumberEnc"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  accountNumberMasked: string;
}

export function serializeBankAccount(a: BankAccount): SerializedBankAccount {
  return {
    _id: a._id,
    accountName: a.accountName,
    bankName: a.bankName,
    accountNumberLast4: a.accountNumberLast4,
    ifsc: a.ifsc,
    branch: a.branch,
    currency: a.currency,
    openingBalance: a.openingBalance,
    currentBalance: a.currentBalance,
    status: a.status,
    notes: a.notes,
    createdBy: a.createdBy,
    updatedBy: a.updatedBy,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    deletedAt: a.deletedAt ? a.deletedAt.toISOString() : null,
    accountNumberMasked: maskAccountNumber(a.accountNumberLast4),
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<BankAccount>(BANK_ACCOUNTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ accountName: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function getBankAccount(id: string): Promise<BankAccount | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

/** Full plaintext number — only for an explicit reveal action, never a list view. */
export async function revealBankAccountNumber(id: string): Promise<string | null> {
  const account = await getBankAccount(id);
  return account ? decryptField(account.accountNumberEnc) : null;
}

export async function listBankAccounts(opts: { status?: FundAccountStatus } = {}): Promise<BankAccount[]> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.status) filter.status = opts.status;
  return collection.find(filter).sort({ accountName: 1 }).toArray();
}

export async function listBankAccountOptions(): Promise<{ _id: string; accountName: string; bankName: string; currency: string }[]> {
  const collection = await getCollection();
  const docs = await collection
    .find({ status: "active", ...notDeleted }, { projection: { accountName: 1, bankName: 1, currency: 1 } })
    .sort({ accountName: 1 })
    .toArray();
  return docs.map((d) => ({ _id: d._id, accountName: d.accountName, bankName: d.bankName, currency: d.currency }));
}

export async function totalBankBalance(): Promise<number> {
  try {
    const collection = await getCollection();
    const rows = await collection.find({ status: { $ne: "closed" }, ...notDeleted }).toArray();
    return round2(rows.reduce((s, a) => s + a.currentBalance, 0));
  } catch {
    return 0;
  }
}

export interface BankAccountWriteData {
  accountName: string;
  bankName: string;
  accountNumber: string | null;
  ifsc: string | null;
  branch: string | null;
  currency: string;
  status: FundAccountStatus;
  notes: string | null;
}

export interface BankAccountCreateData extends BankAccountWriteData {
  openingBalance: number;
}

export async function createBankAccount(
  data: BankAccountCreateData,
  actorId: string
): Promise<{ ok: true; account: BankAccount } | { ok: false; reason: string }> {
  if (data.accountNumber && !isEncryptionConfigured()) {
    return { ok: false, reason: "PLATFORM_ENCRYPTION_KEY is not configured — cannot store an account number. Leave it blank or ask an admin to set the key." };
  }
  const collection = await getCollection();
  const opening = round2(data.openingBalance);
  const doc: BankAccount = {
    _id: newId(),
    accountName: data.accountName,
    bankName: data.bankName,
    accountNumberEnc: data.accountNumber ? encryptField(data.accountNumber) : null,
    accountNumberLast4: data.accountNumber ? last4Of(data.accountNumber) : null,
    ifsc: data.ifsc,
    branch: data.branch,
    currency: data.currency,
    openingBalance: opening,
    currentBalance: opening,
    status: data.status ?? DEFAULT_FUND_ACCOUNT_STATUS,
    notes: data.notes,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return { ok: true, account: doc };
}

export async function updateBankAccount(
  id: string,
  data: BankAccountWriteData,
  actorId: string
): Promise<{ ok: true; account: BankAccount } | { ok: false; reason: string }> {
  if (data.accountNumber && !isEncryptionConfigured()) {
    return { ok: false, reason: "PLATFORM_ENCRYPTION_KEY is not configured — cannot store an account number." };
  }
  const collection = await getCollection();
  const patch: Record<string, unknown> = {
    accountName: data.accountName,
    bankName: data.bankName,
    ifsc: data.ifsc,
    branch: data.branch,
    currency: data.currency,
    status: data.status,
    notes: data.notes,
    ...updateStamp(actorId),
  };
  if (data.accountNumber) {
    patch.accountNumberEnc = encryptField(data.accountNumber);
    patch.accountNumberLast4 = last4Of(data.accountNumber);
  }
  const account = await collection.findOneAndUpdate({ _id: id, ...notDeleted }, { $set: patch }, { returnDocument: "after" });
  if (!account) return { ok: false, reason: "Bank account not found." };
  return { ok: true, account };
}

export async function deleteBankAccount(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const account = await collection.findOne({ _id: id, ...notDeleted });
  if (!account) return { ok: false, reason: "Bank account not found." };
  if (account.currentBalance !== 0) return { ok: false, reason: "Only zero-balance accounts can be deleted. Close it instead." };
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: true };
}
