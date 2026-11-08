import { fmsEvents } from "@/lib/notify/triggers/fms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { DEFAULT_CURRENCY } from "@/lib/products/cashflow-ai/constants";
import { getAccountByCode, CONTROL_ACCOUNT_CODES } from "@/lib/products/cashflow-ai/accounts";
import { getProfitAndLoss } from "@/lib/products/cashflow-ai/reports/profit-and-loss";
import { postClosingEntry, reverseClosingEntry, type MiniAccount, type JournalSide } from "@/lib/products/cashflow-ai/journal";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";

/**
 * Fiscal period locking + real closing entries (§39 — Phase 7). No period-
 * lock concept existed anywhere in the platform before this — closest
 * precedents (HRMS's payroll-run status, PRMS's budget periods) don't gate
 * ledger posting. `closePeriod` posts one real, balanced journal entry that
 * zeroes every income/expense account's net activity for the period into
 * Retained Earnings — the same `postClosingEntry`/`journal.ts` mechanism
 * every other posting uses, not a parallel one. Reopening reverses it.
 *
 * Backward-compatible by construction: `fms/reports/balance-sheet.ts`'s
 * Retained Earnings = whatever's already posted here (0 if no period has
 * ever been closed) + live net income for the still-open remainder — so
 * nothing changes for an install that never closes a period.
 */

export const FISCAL_PERIODS_COLLECTION = "fms_fiscal_periods";

export type FiscalPeriodStatus = "open" | "closed";

export interface FiscalPeriod extends AuditFields {
  _id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: FiscalPeriodStatus;
  closedAt: Date | null;
  closedBy: string | null;
}

export interface SerializedFiscalPeriod
  extends Omit<FiscalPeriod, "createdAt" | "updatedAt" | "deletedAt" | "startDate" | "endDate" | "closedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  startDate: string;
  endDate: string;
  closedAt: string | null;
}

export function serializeFiscalPeriod(p: FiscalPeriod): SerializedFiscalPeriod {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
    startDate: p.startDate.toISOString(),
    endDate: p.endDate.toISOString(),
    closedAt: p.closedAt ? p.closedAt.toISOString() : null,
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<FiscalPeriod>(FISCAL_PERIODS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ startDate: 1, endDate: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function listFiscalPeriods(): Promise<FiscalPeriod[]> {
  const collection = await getCollection();
  return collection.find(notDeleted).sort({ startDate: -1 }).toArray();
}

export async function getFiscalPeriod(id: string): Promise<FiscalPeriod | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export interface FiscalPeriodWriteData {
  name: string;
  startDate: Date;
  endDate: Date;
}

export async function createFiscalPeriod(
  data: FiscalPeriodWriteData,
  actorId: string
): Promise<{ ok: true; period: FiscalPeriod } | { ok: false; reason: string }> {
  if (data.startDate >= data.endDate) return { ok: false, reason: "Start date must be before end date." };
  const collection = await getCollection();
  const overlap = await collection.findOne({
    ...notDeleted,
    startDate: { $lte: data.endDate },
    endDate: { $gte: data.startDate },
  });
  if (overlap) return { ok: false, reason: `Overlaps existing period "${overlap.name}".` };
  const doc: FiscalPeriod = {
    _id: newId(),
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    status: "open",
    closedAt: null,
    closedBy: null,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return { ok: true, period: doc };
}

/** Fail-soft — an infra error here must never block a posting; it just means the check is skipped. */
export async function isDateInClosedPeriod(date: Date): Promise<boolean> {
  try {
    const collection = await getCollection();
    const hit = await collection.findOne({ status: "closed", startDate: { $lte: date }, endDate: { $gte: date }, ...notDeleted });
    return !!hit;
  } catch {
    return false;
  }
}

/**
 * Zeroes every income/expense account's net activity within the period
 * into Retained Earnings, balanced by construction (income lines debited
 * by their net credit balance, expense lines credited by their net debit
 * balance, the difference posted to Retained Earnings) — then marks the
 * period closed so `transactions.ts` refuses further postings dated inside it.
 */
export async function closePeriod(
  id: string,
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: true; period: FiscalPeriod } | { ok: false; reason: string }> {
  const collection = await getCollection();
  const period = await collection.findOne({ _id: id, ...notDeleted });
  if (!period) return { ok: false, reason: "Fiscal period not found." };
  if (period.status === "closed") return { ok: false, reason: "Period is already closed." };

  const pl = await getProfitAndLoss({ dateFrom: period.startDate, dateTo: period.endDate });

  const lines: { account: MiniAccount; side: JournalSide; amount: number }[] = [];
  for (const l of pl.income) {
    if (l.amount === 0) continue;
    lines.push({ account: { _id: l.accountId, code: l.accountCode, name: l.accountName }, side: "debit", amount: l.amount });
  }
  for (const l of pl.expenses) {
    if (l.amount === 0) continue;
    lines.push({ account: { _id: l.accountId, code: l.accountCode, name: l.accountName }, side: "credit", amount: l.amount });
  }

  if (lines.length > 0 && pl.netProfit !== 0) {
    const retainedEarningsAccount = await getAccountByCode(CONTROL_ACCOUNT_CODES.retainedEarnings);
    if (!retainedEarningsAccount) {
      return { ok: false, reason: "Retained Earnings account (3000) is not configured — seed the default Chart of Accounts first." };
    }
    lines.push({
      account: { _id: retainedEarningsAccount._id, code: retainedEarningsAccount.code, name: retainedEarningsAccount.name },
      side: pl.netProfit > 0 ? "credit" : "debit",
      amount: Math.abs(pl.netProfit),
    });
  }

  if (lines.length > 0) {
    await postClosingEntry({
      periodId: id,
      entryDate: period.endDate,
      description: `Period close — ${period.name}`,
      currency: DEFAULT_CURRENCY,
      actorId,
      lines,
    });
  }

  const updated = await collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { status: "closed", closedAt: new Date(), closedBy: actorId, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
  if (!updated) return { ok: false, reason: "Failed to close the period." };

  await recordAudit({
    actorId,
    actorEmail,
    action: "status_change",
    entity: "fiscal_period",
    entityId: id,
    entityLabel: period.name,
    summary: `closed — net ${pl.netProfit >= 0 ? "profit" : "loss"} ${Math.abs(pl.netProfit)} moved to Retained Earnings`,
  });
  await fmsEvents.periodChanged({ id, label: period.name }, "closed", actorId);
  return { ok: true, period: updated };
}

/** Posts the equal-and-opposite of the period's closing entry (if one exists) and reopens it. */
export async function reopenPeriod(
  id: string,
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: true; period: FiscalPeriod } | { ok: false; reason: string }> {
  const collection = await getCollection();
  const period = await collection.findOne({ _id: id, ...notDeleted });
  if (!period) return { ok: false, reason: "Fiscal period not found." };
  if (period.status !== "closed") return { ok: false, reason: "Period is not closed." };

  await reverseClosingEntry(id, actorId);

  const updated = await collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { status: "open", closedAt: null, closedBy: null, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
  if (!updated) return { ok: false, reason: "Failed to reopen the period." };

  await recordAudit({
    actorId,
    actorEmail,
    action: "reverse",
    entity: "fiscal_period",
    entityId: id,
    entityLabel: period.name,
    summary: "reopened",
  });
  await fmsEvents.periodChanged({ id, label: period.name }, "reopened", actorId);
  return { ok: true, period: updated };
}
