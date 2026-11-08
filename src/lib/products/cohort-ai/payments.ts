import { tmsEvents } from "@/lib/notify/triggers/tms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import {
  newId,
  createStamp,
  updateStamp,
  notDeleted,
  nextSequence,
  type AuditFields,
} from "@/lib/products/cohort-ai/db";
import { getTmsSettings } from "@/lib/products/cohort-ai/settings";
import {
  computePaymentStatus,
  PAYMENT_METHODS,
  type PaymentStatus,
  type PaymentMethod,
} from "@/lib/products/cohort-ai/constants";
import { PROGRAMS_COLLECTION } from "@/lib/products/cohort-ai/programs";
import { BATCHES_COLLECTION } from "@/lib/products/cohort-ai/batches";
import { dateFormatFor, type DashboardGranularity } from "@/lib/granularity";

export const PAYMENTS_COLLECTION = "payments";
const STUDENTS_COLLECTION = "training_students";

export { PAYMENT_METHODS };
export type { PaymentMethod };

export interface Installment {
  id: string;
  amount: number;
  method: PaymentMethod;
  transactionId: string | null;
  paidOn: string; // ISO yyyy-mm-dd
  invoiceNumber: string;
  note: string | null;
  recordedBy: string | null;
  recordedAt: Date;
}

export interface PaymentPlan extends AuditFields {
  _id: string;
  studentId: string;
  programId: string;
  batchId: string | null;
  enrollmentId: string | null;
  totalFees: number;
  currency: string;
  discount: number;
  installments: Installment[];
  notes: string | null;
}

export interface SerializedInstallment extends Omit<Installment, "recordedAt"> {
  recordedAt: string;
}

export interface SerializedPaymentPlan extends Omit<PaymentPlan, "createdAt" | "updatedAt" | "deletedAt" | "installments"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  installments: SerializedInstallment[];
  paidAmount: number;
  pendingAmount: number;
  status: PaymentStatus;
}

export function summarise(p: PaymentPlan): { paidAmount: number; pendingAmount: number; status: PaymentStatus; netFees: number } {
  const netFees = Math.max(p.totalFees - p.discount, 0);
  const paidAmount = p.installments.reduce((s, i) => s + i.amount, 0);
  const pendingAmount = Math.max(netFees - paidAmount, 0);
  return { paidAmount, pendingAmount, status: computePaymentStatus(paidAmount, netFees), netFees };
}

export function serializePaymentPlan(p: PaymentPlan): SerializedPaymentPlan {
  const { paidAmount, pendingAmount, status } = summarise(p);
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
    installments: p.installments.map((i) => ({ ...i, recordedAt: i.recordedAt.toISOString() })),
    paidAmount,
    pendingAmount,
    status,
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<PaymentPlan>(PAYMENTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ studentId: 1 }).catch(() => {}),
      collection.createIndex({ programId: 1 }).catch(() => {}),
      collection.createIndex({ "installments.paidOn": 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

async function generateInvoiceNumber(): Promise<string> {
  const seq = await nextSequence("invoice_number");
  return `INV-${String(new Date().getFullYear())}-${String(seq).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getPaymentPlan(id: string): Promise<PaymentPlan | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export interface PaymentView extends SerializedPaymentPlan {
  studentName: string;
  studentCode: string | null;
  programName: string;
  batchName: string | null;
}

async function attachMeta(rows: PaymentPlan[]): Promise<PaymentView[]> {
  if (rows.length === 0) return [];
  const db = await getDb();
  const [students, programs, batches] = await Promise.all([
    db.collection<{ _id: string; fullName: string; studentCode: string }>(STUDENTS_COLLECTION).find({ _id: { $in: rows.map((r) => r.studentId) } }, { projection: { fullName: 1, studentCode: 1 } }).toArray(),
    db.collection<{ _id: string; name: string }>(PROGRAMS_COLLECTION).find({ _id: { $in: rows.map((r) => r.programId) } }, { projection: { name: 1 } }).toArray(),
    db.collection<{ _id: string; name: string }>(BATCHES_COLLECTION).find({ _id: { $in: rows.map((r) => r.batchId).filter(Boolean) as string[] } }, { projection: { name: 1 } }).toArray(),
  ]);
  const studentById = new Map(students.map((s) => [s._id, s]));
  const programName = new Map(programs.map((p) => [p._id, p.name]));
  const batchName = new Map(batches.map((b) => [b._id, b.name]));
  return rows.map((r) => ({
    ...serializePaymentPlan(r),
    studentName: studentById.get(r.studentId)?.fullName ?? "Unknown student",
    studentCode: studentById.get(r.studentId)?.studentCode ?? null,
    programName: programName.get(r.programId) ?? "Unknown program",
    batchName: r.batchId ? batchName.get(r.batchId) ?? null : null,
  }));
}

export interface PaymentFilter {
  search?: string;
  programId?: string;
  studentId?: string;
  status?: PaymentStatus;
}

export async function listPaymentPlans(opts: PaymentFilter = {}, limit = 800): Promise<PaymentView[]> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.programId) filter.programId = opts.programId;
  if (opts.studentId) filter.studentId = opts.studentId;
  const rows = await collection.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  let views = await attachMeta(rows);
  if (opts.status) views = views.filter((v) => v.status === opts.status);
  if (opts.search?.trim()) {
    const q = opts.search.trim().toLowerCase();
    views = views.filter(
      (v) =>
        v.studentName.toLowerCase().includes(q) ||
        (v.studentCode ?? "").toLowerCase().includes(q) ||
        v.installments.some((i) => (i.invoiceNumber ?? "").toLowerCase().includes(q) || (i.transactionId ?? "").toLowerCase().includes(q))
    );
  }
  return views;
}

export async function paymentWithMeta(id: string): Promise<PaymentView | null> {
  const p = await getPaymentPlan(id);
  if (!p) return null;
  return (await attachMeta([p]))[0] ?? null;
}

export async function listPaymentsForStudent(studentId: string): Promise<PaymentView[]> {
  return listPaymentPlans({ studentId });
}

export interface SearchPaymentPlansOptions {
  search?: string;
  programId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "totalFees";
  sortDir?: "asc" | "desc";
}

/**
 * Paginated variant of `listPaymentPlans` — real DB-level pagination on the
 * stored fields (search, program). `status` (paid/partial/pending) is a
 * derived value computed from installments, not stored, so it isn't a
 * pushable Mongo filter here — the native page filters it in memory over an
 * unpaginated fetch, which this listing doesn't attempt to replicate.
 */
export async function searchPaymentPlans(opts: SearchPaymentPlansOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.programId) filter.programId = opts.programId;
  const sortField = opts.sortBy ?? "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [rows, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  let items = await attachMeta(rows);
  if (opts.search?.trim()) {
    const q = opts.search.trim().toLowerCase();
    items = items.filter(
      (v) => v.studentName.toLowerCase().includes(q) || (v.studentCode ?? "").toLowerCase().includes(q)
    );
  }
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

const EXPORT_ROW_LIMIT = 5000;

export async function exportPaymentPlans(opts: { ids?: string[] } = {}): Promise<PaymentView[]> {
  const collection = await getCollection();
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : notDeleted;
  const rows = await collection.find(filter).sort({ createdAt: -1 }).limit(EXPORT_ROW_LIMIT).toArray();
  return attachMeta(rows);
}

export interface PaymentAnalytics {
  totalBilled: number;
  totalCollected: number;
  totalPending: number;
  planCount: number;
  fullyPaid: number;
  collectionTrend: { date: string; count: number }[];
  byProgram: { label: string; value: number }[];
}

export async function getPaymentAnalytics(
  opts: { dateFrom?: Date; dateTo?: Date; granularity?: DashboardGranularity } = {}
): Promise<PaymentAnalytics> {
  const collection = await getCollection();
  const rows = await collection.find(notDeleted).toArray();

  let totalBilled = 0;
  let totalCollected = 0;
  let totalPending = 0;
  let fullyPaid = 0;
  const trendMap = new Map<string, number>();
  const programMap = new Map<string, number>();
  const dateFormat = opts.granularity ? dateFormatFor(opts.granularity) : "%Y-%m";
  const from = opts.dateFrom?.toISOString().slice(0, 10);
  const to = opts.dateTo?.toISOString().slice(0, 10);

  for (const r of rows) {
    const { paidAmount, pendingAmount, netFees, status } = summarise(r);
    totalBilled += netFees;
    totalCollected += paidAmount;
    totalPending += pendingAmount;
    if (status === "paid") fullyPaid += 1;
    for (const inst of r.installments) {
      if (from && inst.paidOn < from) continue;
      if (to && inst.paidOn > to) continue;
      const key =
        dateFormat === "%Y"
          ? inst.paidOn.slice(0, 4)
          : dateFormat === "%Y-%m-%d"
            ? inst.paidOn
            : inst.paidOn.slice(0, 7);
      trendMap.set(key, (trendMap.get(key) ?? 0) + inst.amount);
      programMap.set(r.programId, (programMap.get(r.programId) ?? 0) + inst.amount);
    }
  }

  const db = await getDb();
  const programs = await db
    .collection<{ _id: string; name: string }>(PROGRAMS_COLLECTION)
    .find({ _id: { $in: [...programMap.keys()] } }, { projection: { name: 1 } })
    .toArray();
  const nameById = new Map(programs.map((p) => [p._id, p.name]));

  return {
    totalBilled,
    totalCollected,
    totalPending,
    planCount: rows.length,
    fullyPaid,
    collectionTrend: [...trendMap.entries()].map(([date, count]) => ({ date, count: Math.round(count) })).sort((a, b) => a.date.localeCompare(b.date)),
    byProgram: [...programMap.entries()].map(([pid, v]) => ({ label: nameById.get(pid) ?? "Unknown", value: Math.round(v) })).sort((a, b) => b.value - a.value).slice(0, 12),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface PaymentPlanWriteData {
  studentId: string;
  programId: string;
  batchId: string | null;
  enrollmentId: string | null;
  totalFees: number;
  currency: string;
  discount: number;
  notes: string | null;
}

export async function createPaymentPlan(data: PaymentPlanWriteData, actorId: string): Promise<PaymentPlan> {
  const collection = await getCollection();
  const settings = await getTmsSettings();
  const doc: PaymentPlan = {
    _id: newId(),
    studentId: data.studentId,
    programId: data.programId,
    batchId: data.batchId,
    enrollmentId: data.enrollmentId,
    totalFees: data.totalFees,
    currency: data.currency || settings.defaultCurrency,
    discount: data.discount,
    installments: [],
    notes: data.notes,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updatePaymentPlan(
  id: string,
  data: Partial<Pick<PaymentPlanWriteData, "totalFees" | "discount" | "notes" | "currency">>,
  actorId: string
): Promise<PaymentPlan | null> {
  const collection = await getCollection();
  return collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...data, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
}

export interface InstallmentInput {
  amount: number;
  method: PaymentMethod;
  transactionId: string | null;
  paidOn: string;
  note: string | null;
}

export async function addInstallment(
  planId: string,
  input: InstallmentInput,
  actorId: string
): Promise<{ ok: true; invoiceNumber: string } | { ok: false; reason: string }> {
  const collection = await getCollection();
  const plan = await collection.findOne({ _id: planId, ...notDeleted });
  if (!plan) return { ok: false, reason: "Payment plan not found." };
  const { pendingAmount } = summarise(plan);
  if (input.amount > pendingAmount + 0.001) {
    return { ok: false, reason: `That exceeds the pending amount (${Math.round(pendingAmount)}).` };
  }
  const invoiceNumber = await generateInvoiceNumber();
  const installment: Installment = {
    id: newId(),
    amount: input.amount,
    method: input.method,
    transactionId: input.transactionId,
    paidOn: input.paidOn,
    invoiceNumber,
    note: input.note,
    recordedBy: actorId,
    recordedAt: new Date(),
  };
  await collection.updateOne(
    { _id: planId },
    { $push: { installments: installment }, $set: { ...updateStamp(actorId) } }
  );

  // Sync to Central FMS Engine
  try {
    const { postSystemTransaction } = await import("@/lib/products/cashflow-ai/transactions");
    await postSystemTransaction(
      {
        type: "income",
        transactionDate: new Date(input.paidOn),
        postingDate: new Date(),
        amount: input.amount,
        currency: plan.currency || "INR",
        paymentMethod: (input.method as any) || "UPI",
        sourceModule: "tms",
        sourceRecordId: plan._id,
        customerId: plan.studentId,
        vendorId: null,
        employeeId: null,
        projectId: null,
        department: "Cohort AI",
        accountId: null,
        taxAmount: 0,
        referenceNumber: input.transactionId || invoiceNumber,
        description: `Cohort AI Course Fee Payment (${invoiceNumber})`,
        attachments: [],
      },
      actorId,
      "tms@internal.invalid"
    );
  } catch {
    // Non-blocking fallback for FMS sync
  }

  // Wallet & Credits: a real payment is the "first payment" qualifying event for a pending referral. Best-effort; never affects the payment.
  try {
    const { qualifyReferralForRecord } = await import("@/lib/wallet/referrals");
    await qualifyReferralForRecord({ studentId: plan.studentId });
  } catch {
    /* non-blocking */
  }

  await tmsEvents.paymentRecorded(plan.studentId, input.amount, invoiceNumber, plan.currency || "INR");
  return { ok: true, invoiceNumber };
}

export async function removeInstallment(planId: string, installmentId: string, actorId: string): Promise<boolean> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: planId, ...notDeleted },
    { $pull: { installments: { id: installmentId } }, $set: { ...updateStamp(actorId) } }
  );
  return res.modifiedCount === 1;
}

export async function deletePaymentPlan(id: string, actorId: string): Promise<boolean> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return res.modifiedCount === 1;
}

/** Find one installment across all plans for the invoice route. */
export async function findInstallment(
  invoiceNumber: string
): Promise<{ plan: PaymentPlan; installment: Installment } | null> {
  const collection = await getCollection();
  const plan = await collection.findOne({ "installments.invoiceNumber": invoiceNumber, ...notDeleted });
  if (!plan) return null;
  const installment = plan.installments.find((i) => i.invoiceNumber === invoiceNumber);
  return installment ? { plan, installment } : null;
}
