import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/talentos/db";
import { encryptField, decryptField, last4Of, isEncryptionConfigured, type EncryptedValue } from "@/lib/products/talentos/crypto";
import { recordAudit } from "@/lib/products/talentos/audit";
import { getEmployee, employeeFullName } from "@/lib/products/talentos/employees";
import { PAYROLL_PROFILES_COLLECTION } from "@/lib/products/talentos/payroll";
import type { AccountType, BankVerificationStatus } from "@/lib/products/talentos/payout-status";

export const BANK_ACCOUNTS_COLLECTION = "hrms_bank_accounts";

export interface BankAccount extends AuditFields {
  _id: string;
  employeeId: string;
  accountHolderName: string;
  bankName: string;
  branch: string | null;
  accountType: AccountType;
  accountNumberEnc: EncryptedValue;
  accountNumberLast4: string;
  ifsc: string;
  upiIdEnc: EncryptedValue | null;
  isPrimary: boolean;
  verificationStatus: BankVerificationStatus;
  verifiedAt: Date | null;
  verificationNote: string | null;
  providerContactId: string | null;
  providerFundAccountId: string | null;
  /** When the number, IFSC or holder was last entered or changed. A payment to a freshly changed account waits (Payments → Limits). */
  detailsChangedAt?: Date | null;
  /**
   * Which payout account (Razorpay key id) the cached contact/fund account
   * ids belong to. Absent on ids cached before per-company payout accounts —
   * those were made on the platform owner's env account.
   */
  providerAccountRef?: string | null;
}

/** What crosses to the client — never the ciphertext or the full number. */
export interface SerializedBankAccount {
  _id: string;
  employeeId: string;
  accountHolderName: string;
  bankName: string;
  branch: string | null;
  accountType: AccountType;
  accountNumberLast4: string;
  accountNumberMasked: string;
  ifsc: string;
  hasUpi: boolean;
  isPrimary: boolean;
  verificationStatus: BankVerificationStatus;
  verifiedAt: string | null;
  verificationNote: string | null;
  createdAt: string;
  updatedAt: string;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<BankAccount>(BANK_ACCOUNTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await collection.createIndex({ employeeId: 1 }).catch(() => {});
  }
  return collection;
}

export function serializeBankAccount(a: BankAccount): SerializedBankAccount {
  return {
    _id: a._id,
    employeeId: a.employeeId,
    accountHolderName: a.accountHolderName,
    bankName: a.bankName,
    branch: a.branch,
    accountType: a.accountType,
    accountNumberLast4: a.accountNumberLast4,
    accountNumberMasked: `XXXXXX${a.accountNumberLast4}`,
    ifsc: a.ifsc,
    hasUpi: a.upiIdEnc !== null,
    isPrimary: a.isPrimary,
    verificationStatus: a.verificationStatus,
    verifiedAt: a.verifiedAt ? a.verifiedAt.toISOString() : null,
    verificationNote: a.verificationNote,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// One-time migration from the legacy embedded `payroll_profiles.bank`.
// ---------------------------------------------------------------------------

interface LegacyBank {
  accountName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  bankName: string | null;
  branch: string | null;
}

async function migrateLegacyBank(employeeId: string): Promise<void> {
  const db = await getDb();
  const profiles = db.collection<{ _id: string; employeeId: string; bank?: LegacyBank | null }>(PAYROLL_PROFILES_COLLECTION);
  const profile = await profiles.findOne({ employeeId });
  const legacy = profile?.bank;
  if (!legacy || !legacy.accountNumber) return;
  if (!isEncryptionConfigured()) return; // can't migrate without a key — leave it in place

  const collection = await getCollection();
  const now = new Date();
  await collection.insertOne({
    _id: newId(),
    employeeId,
    accountHolderName: legacy.accountName ?? "",
    bankName: legacy.bankName ?? "",
    branch: legacy.branch ?? null,
    accountType: "savings",
    accountNumberEnc: encryptField(legacy.accountNumber),
    accountNumberLast4: last4Of(legacy.accountNumber),
    ifsc: (legacy.ifsc ?? "").toUpperCase(),
    upiIdEnc: null,
    isPrimary: true,
    verificationStatus: "unverified",
    verifiedAt: null,
    verificationNote: null,
    providerContactId: null,
    providerFundAccountId: null,
    createdAt: now,
    updatedAt: now,
    createdBy: "migration",
    updatedBy: "migration",
    deletedAt: null,
  });
  await profiles.updateOne({ _id: profile!._id }, { $set: { bank: null } });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listBankAccounts(employeeId: string): Promise<BankAccount[]> {
  const collection = await getCollection();
  const existing = await collection.find({ employeeId, ...notDeleted }).sort({ isPrimary: -1, createdAt: 1 }).toArray();
  if (existing.length === 0) {
    await migrateLegacyBank(employeeId).catch((e) => console.error("bank migration failed", e));
    return collection.find({ employeeId, ...notDeleted }).sort({ isPrimary: -1, createdAt: 1 }).toArray();
  }
  return existing;
}

export async function getBankAccount(id: string): Promise<BankAccount | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function getPrimaryBankAccount(employeeId: string): Promise<BankAccount | null> {
  const accounts = await listBankAccounts(employeeId);
  return accounts.find((a) => a.isPrimary) ?? accounts[0] ?? null;
}

/** Server-internal — full account number + IFSC for the NEFT file / provider call. */
export async function bankAccountForPayout(id: string): Promise<{ accountNumber: string; ifsc: string; holder: string; bankName: string } | null> {
  const account = await getBankAccount(id);
  if (!account) return null;
  const accountNumber = decryptField(account.accountNumberEnc);
  if (!accountNumber) return null;
  return { accountNumber, ifsc: account.ifsc, holder: account.accountHolderName, bankName: account.bankName };
}

export async function cacheProviderIds(id: string, contactId: string, fundAccountId: string, accountRef: string | null): Promise<void> {
  const collection = await getCollection();
  await collection.updateOne({ _id: id }, { $set: { providerContactId: contactId, providerFundAccountId: fundAccountId, providerAccountRef: accountRef, updatedAt: new Date() } });
}

// ---------------------------------------------------------------------------
// Writes (HR / super-admin only — the actions layer enforces the role)
// ---------------------------------------------------------------------------

export interface BankAccountInput {
  accountHolderName: string;
  bankName: string;
  branch: string | null;
  accountType: AccountType;
  accountNumber: string;
  ifsc: string;
  upiId: string | null;
  isPrimary: boolean;
}

async function clearOtherPrimaries(employeeId: string, keepId: string) {
  const collection = await getCollection();
  await collection.updateMany({ employeeId, _id: { $ne: keepId }, isPrimary: true }, { $set: { isPrimary: false, updatedAt: new Date() } });
}

export async function createBankAccount(
  employeeId: string,
  input: BankAccountInput,
  actor: { id: string; email: string }
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!isEncryptionConfigured()) {
    return { ok: false, error: "Set PLATFORM_ENCRYPTION_KEY on the server before storing bank details." };
  }
  const collection = await getCollection();
  const existingCount = await collection.countDocuments({ employeeId, ...notDeleted });
  const isPrimary = input.isPrimary || existingCount === 0;

  const id = newId();
  await collection.insertOne({
    _id: id,
    employeeId,
    accountHolderName: input.accountHolderName,
    bankName: input.bankName,
    branch: input.branch,
    accountType: input.accountType,
    accountNumberEnc: encryptField(input.accountNumber),
    accountNumberLast4: last4Of(input.accountNumber),
    ifsc: input.ifsc.toUpperCase(),
    upiIdEnc: input.upiId ? encryptField(input.upiId) : null,
    isPrimary,
    verificationStatus: "unverified",
    verifiedAt: null,
    verificationNote: null,
    providerContactId: null,
    providerFundAccountId: null,
    detailsChangedAt: new Date(),
    ...createStamp(actor.id),
  });
  if (isPrimary) await clearOtherPrimaries(employeeId, id);

  const emp = await getEmployee(employeeId);
  await recordAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "create",
    entity: "bank_account",
    entityId: id,
    entityLabel: emp ? `${employeeFullName(emp)} · ${input.bankName} XXXXXX${last4Of(input.accountNumber)}` : input.bankName,
  });
  return { ok: true, id };
}

export async function updateBankAccount(
  id: string,
  input: BankAccountInput,
  actor: { id: string; email: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!isEncryptionConfigured()) return { ok: false, error: "Set PLATFORM_ENCRYPTION_KEY on the server before storing bank details." };
  const collection = await getCollection();
  const account = await collection.findOne({ _id: id, ...notDeleted });
  if (!account) return { ok: false, error: "Bank account not found." };

  await collection.updateOne(
    { _id: id },
    {
      $set: {
        accountHolderName: input.accountHolderName,
        bankName: input.bankName,
        branch: input.branch,
        accountType: input.accountType,
        accountNumberEnc: encryptField(input.accountNumber),
        accountNumberLast4: last4Of(input.accountNumber),
        ifsc: input.ifsc.toUpperCase(),
        upiIdEnc: input.upiId ? encryptField(input.upiId) : null,
        // Editing the number resets verification + cached provider ids.
        verificationStatus: "unverified",
        verifiedAt: null,
        providerContactId: null,
        providerFundAccountId: null,
        detailsChangedAt: new Date(),
        ...updateStamp(actor.id),
      },
    }
  );
  // A change to where an employee is paid is told to the owners at once: it is the commonest way salary is redirected.
  {
    const { alertOwners } = await import("@/lib/products/cashflow-ai/payment-alerts");
    const emp = await getEmployee(account.employeeId);
    await alertOwners("An employee's bank details were changed", [`${emp ? employeeFullName(emp) : "An employee"}'s bank account was changed by ${actor.email} (now ${input.bankName}, ending ${last4Of(input.accountNumber)}).`, "Payments to it are held for the cooling-off period. If this was not expected, review it before anyone is paid."]);
  }
  if (input.isPrimary && !account.isPrimary) {
    await collection.updateOne({ _id: id }, { $set: { isPrimary: true } });
    await clearOtherPrimaries(account.employeeId, id);
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "bank_account", entityId: id });
  return { ok: true };
}

export async function setPrimaryBankAccount(id: string, actor: { id: string; email: string }): Promise<{ ok: boolean; error?: string }> {
  const collection = await getCollection();
  const account = await collection.findOne({ _id: id, ...notDeleted });
  if (!account) return { ok: false, error: "Bank account not found." };
  await collection.updateOne({ _id: id }, { $set: { isPrimary: true, ...updateStamp(actor.id) } });
  await clearOtherPrimaries(account.employeeId, id);
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "bank_account", entityId: id, summary: "Set as primary" });
  return { ok: true };
}

export async function setVerification(
  id: string,
  status: BankVerificationStatus,
  note: string | null,
  actor: { id: string; email: string }
): Promise<{ ok: boolean; error?: string }> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { verificationStatus: status, verifiedAt: status === "verified" ? new Date() : null, verificationNote: note, ...updateStamp(actor.id) } }
  );
  if (res.matchedCount === 0) return { ok: false, error: "Bank account not found." };
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "verify", entity: "bank_account", entityId: id, summary: `→ ${status}` });
  return { ok: true };
}

export async function deleteBankAccount(id: string, actor: { id: string; email: string }): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  const collection = await getCollection();
  const account = await collection.findOne({ _id: id, ...notDeleted });
  if (!account) return { ok: false, error: "Bank account not found." };

  const usedByPayout = await db.collection("hrms_salary_payouts").countDocuments({ bankAccountId: id, status: { $in: ["pending", "initiated", "processing"] } });
  if (usedByPayout > 0) return { ok: false, error: "This account has in-flight salary payouts. Resolve those first." };

  await collection.updateOne({ _id: id }, { $set: { deletedAt: new Date(), isPrimary: false, ...updateStamp(actor.id) } });

  // Promote another account to primary if we just removed the primary one.
  if (account.isPrimary) {
    const next = await collection.find({ employeeId: account.employeeId, ...notDeleted }).sort({ createdAt: 1 }).limit(1).toArray();
    if (next[0]) await collection.updateOne({ _id: next[0]._id }, { $set: { isPrimary: true } });
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "delete", entity: "bank_account", entityId: id });
  return { ok: true };
}

/** The only path that returns a full account number to the UI. Always audited. */
export async function revealAccountNumber(
  id: string,
  actor: { id: string; email: string }
): Promise<{ ok: true; accountNumber: string; upiId: string | null } | { ok: false; error: string }> {
  const account = await getBankAccount(id);
  if (!account) return { ok: false, error: "Bank account not found." };
  const accountNumber = decryptField(account.accountNumberEnc);
  if (accountNumber === null) return { ok: false, error: "Could not decrypt — check PLATFORM_ENCRYPTION_KEY." };

  const emp = await getEmployee(account.employeeId);
  await recordAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "view_sensitive",
    entity: "bank_account",
    entityId: id,
    entityLabel: emp ? `${employeeFullName(emp)} · ${account.bankName}` : account.bankName,
    summary: "Revealed full account number",
  });
  return { ok: true, accountNumber, upiId: decryptField(account.upiIdEnc) };
}
