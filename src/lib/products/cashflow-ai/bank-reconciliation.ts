import { fmsEvents } from "@/lib/notify/triggers/fms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { round2, DEFAULT_STATEMENT_LINE_STATUS, type StatementLineStatus } from "@/lib/products/cashflow-ai/constants";
import { getTransaction, changeTransactionStatus, TRANSACTIONS_COLLECTION, type Transaction } from "@/lib/products/cashflow-ai/transactions";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";

/**
 * Bank Reconciliation (§20) — manual statement-line entry + matching, not
 * CSV/OFX import (a substantial separate feature, deliberately deferred).
 * Matching a line moves the linked FMS transaction from `completed` to
 * `reconciled` (an already-legal transition from Phase 1's
 * `TRANSACTION_TRANSITIONS`). Every match/flag is audited — §20's explicit
 * requirement.
 */

export const BANK_STATEMENT_LINES_COLLECTION = "fms_bank_statement_lines";

export interface BankStatementLine extends AuditFields {
  _id: string;
  bankAccountId: string;
  statementDate: Date;
  description: string;
  /** Signed: positive = credit/deposit, negative = debit/withdrawal. */
  amount: number;
  status: StatementLineStatus;
  matchedTransactionId: string | null;
  notes: string | null;
}

export interface SerializedBankStatementLine extends Omit<BankStatementLine, "createdAt" | "updatedAt" | "deletedAt" | "statementDate"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  statementDate: string;
}

export function serializeStatementLine(l: BankStatementLine): SerializedBankStatementLine {
  return {
    ...l,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    deletedAt: l.deletedAt ? l.deletedAt.toISOString() : null,
    statementDate: l.statementDate.toISOString().slice(0, 10),
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<BankStatementLine>(BANK_STATEMENT_LINES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ bankAccountId: 1, statementDate: -1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function listStatementLines(bankAccountId: string, opts: { status?: StatementLineStatus } = {}) {
  const collection = await getCollection();
  const filter: Record<string, unknown> = { bankAccountId, ...notDeleted };
  if (opts.status) filter.status = opts.status;
  return collection.find(filter).sort({ statementDate: -1 }).toArray();
}

export async function getStatementLine(id: string): Promise<BankStatementLine | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

/** Candidate FMS transactions to match against — same bank account, unreconciled, amount within 1%. */
export async function candidateTransactionsForLine(line: BankStatementLine, limit = 10): Promise<Transaction[]> {
  const db = await getDb();
  const absAmount = Math.abs(line.amount);
  const tolerance = Math.max(absAmount * 0.01, 1);
  return db
    .collection<Transaction>(TRANSACTIONS_COLLECTION)
    .find({
      fundAccountId: line.bankAccountId,
      fundAccountType: "bank",
      status: "completed",
      amount: { $gte: absAmount - tolerance, $lte: absAmount + tolerance },
      deletedAt: null,
    })
    .sort({ transactionDate: -1 })
    .limit(limit)
    .toArray();
}

export interface StatementLineWriteData {
  bankAccountId: string;
  statementDate: string;
  description: string;
  amount: number;
  notes: string | null;
}

export async function createStatementLine(data: StatementLineWriteData, actorId: string): Promise<BankStatementLine> {
  const collection = await getCollection();
  const doc: BankStatementLine = {
    _id: newId(),
    bankAccountId: data.bankAccountId,
    statementDate: new Date(`${data.statementDate}T00:00:00`),
    description: data.description,
    amount: round2(data.amount),
    status: DEFAULT_STATEMENT_LINE_STATUS,
    matchedTransactionId: null,
    notes: data.notes,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function matchStatementLine(
  lineId: string,
  transactionId: string,
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const line = await collection.findOne({ _id: lineId, ...notDeleted });
  if (!line) return { ok: false, reason: "Statement line not found." };

  const txn = await getTransaction(transactionId);
  if (!txn) return { ok: false, reason: "Transaction not found." };
  if (txn.fundAccountId !== line.bankAccountId) return { ok: false, reason: "That transaction belongs to a different bank account." };

  if (txn.status === "completed") {
    const res = await changeTransactionStatus(transactionId, "reconciled", actorId, actorEmail);
    if (res && "ok" in res && res.ok === false) return { ok: false, reason: res.reason };
  } else if (txn.status !== "reconciled") {
    return { ok: false, reason: `Only a completed or reconciled transaction can be matched (this one is ${txn.status}).` };
  }

  await collection.updateOne(
    { _id: lineId, ...notDeleted },
    { $set: { status: "matched", matchedTransactionId: transactionId, ...updateStamp(actorId) } }
  );
  await recordAudit({
    actorId,
    actorEmail,
    action: "reconcile",
    entity: "bank_statement_line",
    entityId: lineId,
    entityLabel: line.description,
    summary: `Matched to transaction ${txn.transactionNumber} (${line.amount})`,
  });
  return { ok: true };
}

export async function flagStatementLine(
  lineId: string,
  status: Extract<StatementLineStatus, "duplicate" | "needs_review" | "unmatched" | "partially_matched">,
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const line = await collection.findOne({ _id: lineId, ...notDeleted });
  if (!line) return { ok: false, reason: "Statement line not found." };
  await collection.updateOne(
    { _id: lineId, ...notDeleted },
    { $set: { status, matchedTransactionId: null, ...updateStamp(actorId) } }
  );
  await recordAudit({
    actorId,
    actorEmail,
    action: "status_change",
    entity: "bank_statement_line",
    entityId: lineId,
    entityLabel: line.description,
    summary: `Bank statement line flagged ${status}`,
  });
  await fmsEvents.statementLineFlagged({ id: lineId, description: line.description, amount: (line as { amount?: number }).amount }, actorId);
  return { ok: true };
}
