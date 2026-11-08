import { fmsEvents } from "@/lib/notify/triggers/fms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, notDeleted, nextYearSequence, formatYearCode, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { round2, type FundAccountType } from "@/lib/products/cashflow-ai/constants";
import { getBankAccount } from "@/lib/products/cashflow-ai/bank-accounts";
import { getCashAccount } from "@/lib/products/cashflow-ai/cash-accounts";
import { postSystemTransaction } from "@/lib/products/cashflow-ai/transactions";

/**
 * Transfers between any two fund accounts (§19/§21). Posts two linked
 * `fms_transactions` — an `expense` leg on the source account, an `income`
 * leg on the destination — rather than using the `"transfer"` transaction
 * type, so the existing unambiguous income=credit/expense=debit balance
 * math in `fms/transactions.ts` applies with no new sign logic. Both legs
 * share a `transferId` back to this record for traceability.
 */

export const FUND_TRANSFERS_COLLECTION = "fms_fund_transfers";
const TRANSFER_NUMBER_PREFIX = "TRF";

export interface FundTransfer extends AuditFields {
  _id: string;
  transferNumber: string;
  fromAccountId: string;
  fromAccountType: FundAccountType;
  fromAccountName: string;
  toAccountId: string;
  toAccountType: FundAccountType;
  toAccountName: string;
  amount: number;
  currency: string;
  transferDate: Date;
  referenceNumber: string | null;
  notes: string | null;
  outTransactionId: string;
  inTransactionId: string;
}

export interface SerializedFundTransfer extends Omit<FundTransfer, "createdAt" | "updatedAt" | "deletedAt" | "transferDate"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  transferDate: string;
}

export function serializeFundTransfer(t: FundTransfer): SerializedFundTransfer {
  return {
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    deletedAt: t.deletedAt ? t.deletedAt.toISOString() : null,
    transferDate: t.transferDate.toISOString().slice(0, 10),
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<FundTransfer>(FUND_TRANSFERS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ transferNumber: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ transferDate: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateTransferNumber(year = new Date().getFullYear()): Promise<string> {
  const seq = await nextYearSequence(TRANSFER_NUMBER_PREFIX, year);
  return formatYearCode(TRANSFER_NUMBER_PREFIX, year, seq);
}

export async function listTransfers(opts: { page?: number; pageSize?: number } = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = { ...notDeleted };
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ transferDate: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export interface RecordTransferData {
  fromAccountId: string;
  fromAccountType: FundAccountType;
  toAccountId: string;
  toAccountType: FundAccountType;
  amount: number;
  transferDate: string;
  referenceNumber: string | null;
  notes: string | null;
}

export async function recordTransfer(
  data: RecordTransferData,
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: true; transfer: FundTransfer } | { ok: false; reason: string }> {
  if (data.fromAccountType === data.toAccountType && data.fromAccountId === data.toAccountId) {
    return { ok: false, reason: "Source and destination accounts must be different." };
  }
  const amount = round2(data.amount);
  if (amount <= 0) return { ok: false, reason: "Enter a transfer amount." };

  const [fromAccount, toAccount] = await Promise.all([
    data.fromAccountType === "bank" ? getBankAccount(data.fromAccountId) : getCashAccount(data.fromAccountId),
    data.toAccountType === "bank" ? getBankAccount(data.toAccountId) : getCashAccount(data.toAccountId),
  ]);
  if (!fromAccount) return { ok: false, reason: "Source account not found." };
  if (!toAccount) return { ok: false, reason: "Destination account not found." };
  if (fromAccount.currency !== toAccount.currency) {
    return { ok: false, reason: `Currency mismatch (${fromAccount.currency} → ${toAccount.currency}) — multi-currency transfers aren't supported yet.` };
  }

  const transferDate = new Date(`${data.transferDate}T00:00:00`);
  const transferId = newId();

  const outTxn = await postSystemTransaction(
    {
      type: "expense",
      transactionDate: transferDate,
      postingDate: transferDate,
      amount,
      currency: fromAccount.currency,
      paymentMethod: "bank_transfer",
      sourceModule: "fms",
      sourceRecordId: null,
      customerId: null,
      vendorId: null,
      employeeId: null,
      projectId: null,
      department: null,
      accountId: null,
      fundAccountId: fromAccount._id,
      fundAccountType: data.fromAccountType,
      transferId,
      taxAmount: 0,
      referenceNumber: data.referenceNumber,
      description: `Transfer to ${toAccount.accountName}`,
      attachments: [],
    },
    actorId,
    actorEmail
  );
  if ("ok" in outTxn) return outTxn;

  const inTxn = await postSystemTransaction(
    {
      type: "income",
      transactionDate: transferDate,
      postingDate: transferDate,
      amount,
      currency: toAccount.currency,
      paymentMethod: "bank_transfer",
      sourceModule: "fms",
      sourceRecordId: null,
      customerId: null,
      vendorId: null,
      employeeId: null,
      projectId: null,
      department: null,
      accountId: null,
      fundAccountId: toAccount._id,
      fundAccountType: data.toAccountType,
      transferId,
      taxAmount: 0,
      referenceNumber: data.referenceNumber,
      description: `Transfer from ${fromAccount.accountName}`,
      attachments: [],
    },
    actorId,
    actorEmail
  );
  if ("ok" in inTxn) return inTxn;

  const collection = await getCollection();
  const doc: FundTransfer = {
    _id: transferId,
    transferNumber: await generateTransferNumber(transferDate.getFullYear()),
    fromAccountId: fromAccount._id,
    fromAccountType: data.fromAccountType,
    fromAccountName: fromAccount.accountName,
    toAccountId: toAccount._id,
    toAccountType: data.toAccountType,
    toAccountName: toAccount.accountName,
    amount,
    currency: fromAccount.currency,
    transferDate,
    referenceNumber: data.referenceNumber,
    notes: data.notes,
    outTransactionId: outTxn._id,
    inTransactionId: inTxn._id,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  await fmsEvents.fundTransfer({ transferNumber: doc.transferNumber, amount: doc.amount, currency: doc.currency }, actorId);
  return { ok: true, transfer: doc };
}
