import { fmsEvents } from "@/lib/notify/triggers/fms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, nextYearSequence, formatYearCode, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { round2, canTransitionAdvance, DEFAULT_ADVANCE_STATUS, type AdvanceStatus, type PaymentMethod, type FundAccountType } from "@/lib/products/cashflow-ai/constants";
import { startPayout } from "@/lib/products/cashflow-ai/payments/payouts";
import { employeePayee } from "@/lib/products/cashflow-ai/payments/payees";
import { postSystemTransaction } from "@/lib/products/cashflow-ai/transactions";

/**
 * Employee Advances (§12) — genuinely new. Confirmed via research that
 * HRMS has no advance/loan concept anywhere (`grep -ri "advance"` across
 * `src/lib/talentos/` returns nothing). FMS originates this data itself,
 * referencing `hrms_employees` by id only. Deliberately NOT wired into
 * HRMS's payslip deduction engine (`payroll-run.ts` has no such
 * integration point, and adding one means writing into HRMS's own
 * computation — a materially bigger change than this phase). Repayment
 * stays a manual FMS-side ledger: each repayment is its own entry, never a
 * payslip deduction.
 */

export const EMPLOYEE_ADVANCES_COLLECTION = "fms_employee_advances";
const ADVANCE_NUMBER_PREFIX = "ADV";

export interface AdvanceRepayment {
  date: Date;
  amount: number;
  method: PaymentMethod;
  transactionReference: string | null;
  transactionId: string | null;
}

export interface EmployeeAdvance extends AuditFields {
  _id: string;
  advanceNumber: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  reason: string;
  status: AdvanceStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  disbursedAt: Date | null;
  disbursementTransactionId: string | null;
  /** The Razorpay payment that disbursed it. */
  payoutId?: string | null;
  repayments: AdvanceRepayment[];
}

export interface SerializedAdvance
  extends Omit<EmployeeAdvance, "createdAt" | "updatedAt" | "deletedAt" | "approvedAt" | "disbursedAt" | "repayments"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  approvedAt: string | null;
  disbursedAt: string | null;
  repayments: (Omit<AdvanceRepayment, "date"> & { date: string })[];
  outstandingBalance: number;
}

export function outstandingBalance(a: Pick<EmployeeAdvance, "status" | "amount" | "repayments">): number {
  if (a.status !== "disbursed" && a.status !== "repaid") return 0;
  const repaid = a.repayments.reduce((s, r) => s + r.amount, 0);
  return round2(a.amount - repaid);
}

export function serializeAdvance(a: EmployeeAdvance): SerializedAdvance {
  return {
    ...a,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    deletedAt: a.deletedAt ? a.deletedAt.toISOString() : null,
    approvedAt: a.approvedAt ? a.approvedAt.toISOString() : null,
    disbursedAt: a.disbursedAt ? a.disbursedAt.toISOString() : null,
    repayments: a.repayments.map((r) => ({ ...r, date: r.date.toISOString() })),
    outstandingBalance: outstandingBalance(a),
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<EmployeeAdvance>(EMPLOYEE_ADVANCES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ advanceNumber: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ employeeId: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateAdvanceNumber(year = new Date().getFullYear()): Promise<string> {
  const seq = await nextYearSequence(ADVANCE_NUMBER_PREFIX, year);
  return formatYearCode(ADVANCE_NUMBER_PREFIX, year, seq);
}

export async function getAdvance(id: string): Promise<EmployeeAdvance | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function listAdvancesForEmployee(employeeId: string): Promise<EmployeeAdvance[]> {
  const collection = await getCollection();
  return collection.find({ employeeId, ...notDeleted }).sort({ createdAt: -1 }).toArray();
}

export async function searchAdvances(opts: { status?: AdvanceStatus; page?: number; pageSize?: number } = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.status) filter.status = opts.status;
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function totalOutstandingAdvances(): Promise<number> {
  const collection = await getCollection();
  const rows = await collection.find({ status: "disbursed", ...notDeleted }).toArray();
  return round2(rows.reduce((s, a) => s + outstandingBalance(a), 0));
}

export interface AdvanceWriteData {
  employeeId: string;
  employeeName: string;
  amount: number;
  reason: string;
}

export async function requestAdvance(data: AdvanceWriteData, actorId: string): Promise<EmployeeAdvance> {
  const collection = await getCollection();
  const doc: EmployeeAdvance = {
    _id: newId(),
    advanceNumber: await generateAdvanceNumber(),
    employeeId: data.employeeId,
    employeeName: data.employeeName,
    amount: round2(data.amount),
    reason: data.reason,
    status: DEFAULT_ADVANCE_STATUS,
    approvedBy: null,
    approvedAt: null,
    disbursedAt: null,
    disbursementTransactionId: null,
    repayments: [],
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  await fmsEvents.advanceRequested({ id: doc._id, advanceNumber: doc.advanceNumber, employeeName: doc.employeeName, amount: doc.amount, currency: "INR" }, actorId);
  return doc;
}

export async function changeAdvanceStatus(
  id: string,
  toStatus: AdvanceStatus,
  actorId: string,
  actorEmail: string | null,
  _fundAccountId: string | null = null,
  _fundAccountType: FundAccountType | null = null
): Promise<{ ok: boolean; reason?: string }> {
  void _fundAccountId;
  void _fundAccountType;
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Advance not found." };
  if (!canTransitionAdvance(existing.status, toStatus)) {
    return { ok: false, reason: `Cannot move a ${existing.status} advance to ${toStatus}.` };
  }

  const patch: Record<string, unknown> = { status: toStatus };
  if (toStatus === "approved") {
    patch.approvedBy = actorId;
    patch.approvedAt = new Date();
  }
  if (toStatus === "disbursed") {
    // The money goes out through Razorpay, into the employee's primary bank account. The advance becomes "disbursed" (and the ledger entry is
    // made) when Razorpay reports it paid; until then it stays approved with the payment on its way.
    const payee = await employeePayee(existing.employeeId);
    if (!payee.ok) return { ok: false, reason: payee.error };
    const res = await startPayout(
      { purpose: "advance", sourceModule: "fms", sourceRecordId: existing._id, payee: payee.payee, amount: existing.amount, narration: `Advance ${existing.advanceNumber}`, employeeId: existing.employeeId, description: `Advance ${existing.advanceNumber} disbursed to ${existing.employeeName}` },
      { id: actorId, email: actorEmail },
    );
    return res.ok ? { ok: true } : { ok: false, reason: res.error };
  }

  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { ...patch, ...updateStamp(actorId) } });
  await fmsEvents.advanceStatus({ id: existing._id, advanceNumber: existing.advanceNumber, amount: existing.amount, currency: "INR" }, toStatus, actorId);
  return { ok: true };
}

export async function recordRepayment(
  id: string,
  data: {
    amount: number;
    method: PaymentMethod;
    transactionReference: string | null;
    date: string;
    fundAccountId?: string | null;
    fundAccountType?: FundAccountType | null;
  },
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Advance not found." };
  if (existing.status !== "disbursed") return { ok: false, reason: "Only a disbursed advance can be repaid." };

  const amount = round2(data.amount);
  const outstanding = outstandingBalance(existing);
  if (amount <= 0) return { ok: false, reason: "Enter a repayment amount." };
  if (amount > outstanding + 0.01) return { ok: false, reason: `Repayment exceeds the outstanding balance of ${outstanding}.` };

  const date = new Date(`${data.date}T00:00:00`);
  const txn = await postSystemTransaction(
    {
      type: "income",
      transactionDate: date,
      postingDate: date,
      amount,
      currency: "INR",
      paymentMethod: data.method,
      sourceModule: "fms",
      sourceRecordId: existing._id,
      customerId: null,
      vendorId: null,
      employeeId: existing.employeeId,
      projectId: null,
      department: null,
      accountId: null,
      fundAccountId: data.fundAccountId ?? null,
      fundAccountType: data.fundAccountType ?? null,
      taxAmount: 0,
      referenceNumber: data.transactionReference,
      description: `Advance repayment for ${existing.advanceNumber} from ${existing.employeeName}`,
      attachments: [],
    },
    actorId,
    actorEmail
  );
  if ("ok" in txn) return txn;

  const repayment: AdvanceRepayment = {
    date,
    amount,
    method: data.method,
    transactionReference: data.transactionReference,
    transactionId: txn._id,
  };
  const newOutstanding = round2(outstanding - amount);
  await collection.updateOne(
    { _id: id, ...notDeleted },
    {
      $push: { repayments: repayment },
      $set: { ...(newOutstanding <= 0.01 ? { status: "repaid" as AdvanceStatus } : {}), ...updateStamp(actorId) },
    }
  );
  return { ok: true };
}
