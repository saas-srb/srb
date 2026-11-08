import "server-only";
import { getDb } from "@/lib/mongodb";
import { encryptField, decryptField, isEncryptionConfigured, type EncryptedValue } from "@/lib/products/cashflow-ai/crypto";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";

export const BENEFICIARIES_COLLECTION = "fms_beneficiaries";

export type BeneficiaryEntity = "vendor" | "employee" | "client" | "student" | "other";

export interface BeneficiaryBankAccount extends AuditFields {
  _id: string;
  entityType: BeneficiaryEntity;
  entityId: string;
  beneficiaryName: string;
  bankName: string;
  /** The number is stored encrypted. Rows saved before that kept it here as plain text; they are encrypted the first time they are read. */
  accountNumber?: string;
  accountNumberEnc?: EncryptedValue | null;
  accountNumberLast4: string;
  ifsc: string;
  branch: string | null;
  upiId: string | null;
  isVerified: boolean;
  /** When the account details were last entered or changed: a payment to freshly changed details waits (Payments → Limits). */
  detailsChangedAt?: Date | null;
  notes: string | null;
}

let indexesEnsured = false;
let migrated = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<BeneficiaryBankAccount>(BENEFICIARIES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ entityType: 1, entityId: 1 }).catch(() => {}),
      collection.createIndex({ beneficiaryName: 1 }).catch(() => {}),
    ]);
  }
  if (!migrated && isEncryptionConfigured()) {
    migrated = true;
    // Encrypt account numbers saved as plain text by an earlier version.
    const plain = await collection.find({ accountNumber: { $exists: true, $ne: "" }, accountNumberEnc: { $exists: false } } as never).toArray();
    for (const b of plain) {
      if (!b.accountNumber) continue;
      await collection.updateOne({ _id: b._id }, { $set: { accountNumberEnc: encryptField(b.accountNumber), accountNumberLast4: b.accountNumberLast4 || b.accountNumber.slice(-4) }, $unset: { accountNumber: "" } } as never);
    }
  }
  return collection;
}

/** The full account number, for making a payment only. */
export function revealBeneficiaryAccount(b: Pick<BeneficiaryBankAccount, "accountNumber" | "accountNumberEnc">): string | null {
  return b.accountNumberEnc ? decryptField(b.accountNumberEnc) : (b.accountNumber ?? null);
}

export async function listBeneficiaries(entityType?: BeneficiaryEntity): Promise<BeneficiaryBankAccount[]> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (entityType) filter.entityType = entityType;
  return collection.find(filter).sort({ beneficiaryName: 1 }).toArray();
}

export async function getBeneficiaryByEntity(entityType: BeneficiaryEntity, entityId: string): Promise<BeneficiaryBankAccount | null> {
  const collection = await getCollection();
  return collection.findOne({ entityType, entityId, ...notDeleted });
}

async function saveBeneficiaryRecord(
  data: {
    entityType: BeneficiaryEntity;
    entityId: string;
    beneficiaryName: string;
    bankName: string;
    accountNumber: string;
    ifsc: string;
    branch?: string | null;
    upiId?: string | null;
    notes?: string | null;
  },
  actorId: string
): Promise<BeneficiaryBankAccount> {
  const collection = await getCollection();
  const existing = await collection.findOne({ entityType: data.entityType, entityId: data.entityId, ...notDeleted });

  if (!isEncryptionConfigured()) throw new Error("Secure storage for bank details is not set up on this server (PLATFORM_ENCRYPTION_KEY), so the account number cannot be saved.");
  const last4 = data.accountNumber.slice(-4) || "0000";
  const enc = encryptField(data.accountNumber);

  if (existing) {
    const patch: Record<string, unknown> = {
      beneficiaryName: data.beneficiaryName,
      bankName: data.bankName,
      accountNumberEnc: enc,
      accountNumberLast4: last4,
      ifsc: data.ifsc,
      branch: data.branch ?? null,
      upiId: data.upiId ?? null,
      notes: data.notes ?? null,
      isVerified: false,
      detailsChangedAt: new Date(),
      ...updateStamp(actorId),
    };
    const updated = await collection.findOneAndUpdate({ _id: existing._id }, { $set: patch, $unset: { accountNumber: "" } }, { returnDocument: "after" });
    // Changed bank details for a payee is how invoices get redirected to a fraudster: the owners are told at once.
    const { alertOwners } = await import("@/lib/products/cashflow-ai/payment-alerts");
    await alertOwners("A payee's bank details were changed", [`${data.beneficiaryName} (${data.entityType}): the bank account now ends ${last4}${data.bankName ? ` at ${data.bankName}` : ""}.`, "Payments to it are held for the cooling-off period. If this was not expected, review it before anyone is paid."]);
    return updated!;
  }

  const doc: BeneficiaryBankAccount = {
    _id: newId(),
    entityType: data.entityType,
    entityId: data.entityId,
    beneficiaryName: data.beneficiaryName,
    bankName: data.bankName,
    accountNumberEnc: enc,
    accountNumberLast4: last4,
    ifsc: data.ifsc,
    branch: data.branch ?? null,
    upiId: data.upiId ?? null,
    // Nothing here has been checked with the bank, so it is not marked verified.
    isVerified: false,
    detailsChangedAt: new Date(),
    notes: data.notes ?? null,
    ...createStamp(actorId),
  };

  await collection.insertOne(doc);
  return doc;
}

/** Saves a payee's bank details. For a vendor, the vendor-controls check runs straight away so the person who made the change is on record and it awaits someone else's verification. */
export async function saveBeneficiary(data: Parameters<typeof saveBeneficiaryRecord>[0], actorId: string): Promise<BeneficiaryBankAccount> {
  const saved = await saveBeneficiaryRecord(data, actorId);
  if (data.entityType === "vendor") {
    try {
      const { syncVendorBank } = await import("@/lib/products/cashflow-ai/vendor-controls/store");
      await syncVendorBank(data.entityId);
    } catch {
      // the check also runs on every payout and page view; a failure here must not undo the save
    }
  }
  return saved;
}
