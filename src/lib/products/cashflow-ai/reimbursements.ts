import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, notDeleted, nextYearSequence, formatYearCode, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { round2, type PaymentMethod, type FundAccountType } from "@/lib/products/cashflow-ai/constants";
import { getExpense, markExpenseReimbursed, type Expense } from "@/lib/products/spendiq/expenses";
import { startPayout, type FmsPayout } from "@/lib/products/cashflow-ai/payments/payouts";
import { employeePayee } from "@/lib/products/cashflow-ai/payments/payees";

/**
 * Reimbursements (§13) — fills a real gap: PRMS's `markExpenseReimbursed`
 * is a bare status flip with no amount, method, date or reference captured
 * anywhere. Recording one here creates the actual payment record, calls
 * PRMS's own real `markExpenseReimbursed()` (reuse, not duplicate — same
 * precedent as Phase 2's vendor-payment wrapper calling PRMS's
 * `recordPayment`), and posts a linked, already-`completed`
 * `fms_transaction` via `postSystemTransaction`.
 */

export const REIMBURSEMENTS_COLLECTION = "fms_reimbursements";
const REIMBURSEMENT_NUMBER_PREFIX = "RMB";

export interface Reimbursement extends AuditFields {
  _id: string;
  reimbursementNumber: string;
  expenseId: string;
  expenseCode: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  method: PaymentMethod;
  transactionReference: string | null;
  paymentDate: Date;
  transactionId: string | null;
  notes: string | null;
  /** The Razorpay payment that paid it. */
  payoutId?: string | null;
}

export interface SerializedReimbursement extends Omit<Reimbursement, "createdAt" | "updatedAt" | "deletedAt" | "paymentDate"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  paymentDate: string;
}

export function serializeReimbursement(r: Reimbursement): SerializedReimbursement {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    paymentDate: r.paymentDate.toISOString().slice(0, 10),
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Reimbursement>(REIMBURSEMENTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ reimbursementNumber: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ expenseId: 1 }).catch(() => {}),
      collection.createIndex({ employeeId: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateReimbursementNumber(year = new Date().getFullYear()): Promise<string> {
  const seq = await nextYearSequence(REIMBURSEMENT_NUMBER_PREFIX, year);
  return formatYearCode(REIMBURSEMENT_NUMBER_PREFIX, year, seq);
}

export async function listReimbursementsForExpense(expenseId: string): Promise<Reimbursement[]> {
  const collection = await getCollection();
  return collection.find({ expenseId, ...notDeleted }).sort({ paymentDate: -1 }).toArray();
}

export async function getReimbursement(id: string): Promise<Reimbursement | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function searchReimbursements(opts: { page?: number; pageSize?: number } = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = { ...notDeleted };
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ paymentDate: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export interface RecordReimbursementData {
  expenseId: string;
  amount: number;
  method: PaymentMethod;
  transactionReference: string | null;
  paymentDate: string;
  fundAccountId?: string | null;
  fundAccountType?: FundAccountType | null;
  notes: string | null;
}

const MODE_OF: Record<string, "NEFT" | "RTGS" | "IMPS" | "UPI"> = { neft: "NEFT", rtgs: "RTGS", imps: "IMPS", upi: "UPI" };

/**
 * Pays an approved personal expense back through Razorpay, into the employee's primary bank account. The reimbursement record, and the
 * expense turning "reimbursed", are made when Razorpay reports the money paid (`finalizeReimbursement`), never before.
 */
export async function recordReimbursement(
  data: RecordReimbursementData,
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: true; payoutId: string } | { ok: false; reason: string }> {
  const expense: Expense | null = await getExpense(data.expenseId);
  if (!expense) return { ok: false, reason: "Expense not found." };
  if (expense.vendorId) return { ok: false, reason: "This is a vendor-billed expense, not a personal claim." };
  if (expense.approvalStatus !== "approved") return { ok: false, reason: "Only approved expenses can be reimbursed." };

  const amount = round2(data.amount);
  if (amount <= 0) return { ok: false, reason: "Enter a reimbursement amount." };

  const existing = await listReimbursementsForExpense(data.expenseId);
  const alreadyPaid = existing.reduce((s, r) => s + r.amount, 0);
  if (amount + alreadyPaid > expense.totalAmount + 0.01) {
    return { ok: false, reason: `Amount exceeds the claim total (already reimbursed: ${alreadyPaid}).` };
  }

  const payee = await employeePayee(expense.raisedByUserId);
  if (!payee.ok) return { ok: false, reason: payee.error };
  const res = await startPayout(
    {
      purpose: "reimbursement",
      sourceModule: "prms",
      // One payment per part-payment of the claim: the number after # keeps two part-payments apart.
      sourceRecordId: `${expense._id}#${existing.length + 1}`,
      payee: payee.payee,
      amount,
      narration: `Claim ${expense.expenseCode}`,
      employeeId: expense.raisedByUserId,
      mode: MODE_OF[String(data.method)] ?? null,
      description: `Reimbursement for ${expense.expenseCode} to ${expense.raisedByName}`,
    },
    { id: actorId, email: actorEmail },
  );
  return res.ok ? { ok: true, payoutId: res.payout._id } : { ok: false, reason: res.error };
}

/** Razorpay has paid a reimbursement: make the record and mark the expense reimbursed. Safe to call twice. */
export async function finalizeReimbursement(p: FmsPayout): Promise<void> {
  const expenseId = (p.sourceRecordId ?? "").split("#")[0];
  const collection = await getCollection();
  if (await collection.findOne({ payoutId: p._id } as never)) return;
  const expense = await getExpense(expenseId);
  if (!expense) return;
  const paymentDate = p.settledAt ?? new Date();
  await markExpenseReimbursed(expense._id, "razorpayx");
  await collection.insertOne({
    _id: newId(),
    reimbursementNumber: await generateReimbursementNumber(paymentDate.getFullYear()),
    expenseId: expense._id,
    expenseCode: expense.expenseCode,
    employeeId: expense.raisedByUserId,
    employeeName: expense.raisedByName,
    amount: p.amount,
    method: (p.mode === "UPI" ? "upi" : p.mode.toLowerCase()) as PaymentMethod,
    transactionReference: p.utr ?? p.providerPayoutId,
    paymentDate,
    transactionId: p.transactionId,
    notes: null,
    payoutId: p._id,
    ...createStamp("razorpayx"),
  } as Reimbursement);
}

/** The bank sent a reimbursement back: the record goes and the claim is payable again. */
export async function reverseReimbursement(p: FmsPayout): Promise<void> {
  const collection = await getCollection();
  const row = await collection.findOne({ payoutId: p._id } as never);
  if (!row) return;
  await collection.updateOne({ _id: row._id }, { $set: { deletedAt: new Date() } });
  const expenseId = (p.sourceRecordId ?? "").split("#")[0];
  await (await getDb()).collection("prms_expenses").updateOne({ _id: expenseId as never, approvalStatus: "reimbursed" }, { $set: { approvalStatus: "approved", updatedAt: new Date() } });
}
