import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { round2 } from "@/lib/products/cashflow-ai/constants";
import { getCashAccount } from "@/lib/products/cashflow-ai/cash-accounts";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";

/**
 * Cash Reconciliation (§21) — a physical count compared against the cash
 * account's real system balance at the time of the count, not statement
 * matching (that's the bank-side concept — see `bank-reconciliation.ts`).
 * Matches how cash reconciliation actually works: count the drawer,
 * compare to the ledger, record the variance.
 */

export const CASH_COUNTS_COLLECTION = "fms_cash_counts";

export interface CashCount extends AuditFields {
  _id: string;
  cashAccountId: string;
  countDate: Date;
  physicalCount: number;
  systemBalance: number;
  variance: number;
  notes: string | null;
}

export interface SerializedCashCount extends Omit<CashCount, "createdAt" | "updatedAt" | "deletedAt" | "countDate"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  countDate: string;
}

export function serializeCashCount(c: CashCount): SerializedCashCount {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
    countDate: c.countDate.toISOString().slice(0, 10),
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<CashCount>(CASH_COUNTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await collection.createIndex({ cashAccountId: 1, countDate: -1 }).catch(() => {});
  }
  return collection;
}

export async function listCashCounts(cashAccountId: string): Promise<CashCount[]> {
  const collection = await getCollection();
  return collection.find({ cashAccountId, ...notDeleted }).sort({ countDate: -1 }).toArray();
}

export interface RecordCashCountData {
  cashAccountId: string;
  countDate: string;
  physicalCount: number;
  notes: string | null;
}

export async function recordCashCount(
  data: RecordCashCountData,
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: true; count: CashCount } | { ok: false; reason: string }> {
  const account = await getCashAccount(data.cashAccountId);
  if (!account) return { ok: false, reason: "Cash account not found." };

  const physicalCount = round2(data.physicalCount);
  const systemBalance = account.currentBalance;
  const variance = round2(physicalCount - systemBalance);

  const collection = await getCollection();
  const doc: CashCount = {
    _id: newId(),
    cashAccountId: account._id,
    countDate: new Date(`${data.countDate}T00:00:00`),
    physicalCount,
    systemBalance,
    variance,
    notes: data.notes,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  await recordAudit({
    actorId,
    actorEmail,
    action: "record",
    entity: "cash_count",
    entityId: doc._id,
    entityLabel: account.accountName,
    summary: `Physical count ${physicalCount} vs system ${systemBalance} (variance ${variance})`,
  });
  return { ok: true, count: doc };
}
