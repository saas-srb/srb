import { fmsEvents } from "@/lib/notify/triggers/fms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { newId, createStamp, updateStamp, notDeleted, nextYearSequence, formatYearCode, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { syncDebitNoteAccrual, trySync } from "@/lib/products/cashflow-ai/accrual/posting";
import { round2, type NoteStatus, DEFAULT_NOTE_STATUS } from "@/lib/products/cashflow-ai/constants";
import { getInvoice as getPrmsBill } from "@/lib/products/spendiq/invoices";

/**
 * Debit Notes (§27) — additional charges, purchase adjustments, vendor
 * corrections against a PRMS vendor bill (`prms_invoices`). FMS-owned and
 * additive only: it never writes into `prms_invoices` — Payables totals are
 * computed as PRMS's real outstanding balance *plus* the sum of active
 * (`issued`) debit notes for that vendor (see `fms/payables.ts`). Same
 * `draft → issued → cancelled` shape as Credit Notes.
 */

export const DEBIT_NOTES_COLLECTION = "fms_debit_notes";
const DEBIT_NOTE_NUMBER_PREFIX = "DBN";

export interface DebitNote extends AuditFields {
  _id: string;
  debitNoteNumber: string;
  billId: string;
  billNumber: string;
  vendorId: string;
  vendorName: string;
  amount: number;
  reason: string;
  status: NoteStatus;
  issuedAt: Date | null;
}

export interface SerializedDebitNote extends Omit<DebitNote, "createdAt" | "updatedAt" | "deletedAt" | "issuedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  issuedAt: string | null;
}

export function serializeDebitNote(d: DebitNote): SerializedDebitNote {
  return {
    ...d,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    deletedAt: d.deletedAt ? d.deletedAt.toISOString() : null,
    issuedAt: d.issuedAt ? d.issuedAt.toISOString() : null,
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<DebitNote>(DEBIT_NOTES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ debitNoteNumber: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ billId: 1 }).catch(() => {}),
      collection.createIndex({ vendorId: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateDebitNoteNumber(year = new Date().getFullYear()): Promise<string> {
  const seq = await nextYearSequence(DEBIT_NOTE_NUMBER_PREFIX, year);
  return formatYearCode(DEBIT_NOTE_NUMBER_PREFIX, year, seq);
}

export async function getDebitNote(id: string): Promise<DebitNote | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function listDebitNotesForBill(billId: string): Promise<DebitNote[]> {
  const collection = await getCollection();
  return collection.find({ billId, ...notDeleted }).sort({ createdAt: -1 }).toArray();
}

/** Sum of `issued` debit notes per vendor — the additive adjustment for Payables. */
export async function activeDebitNoteTotalsByVendor(): Promise<Map<string, number>> {
  const collection = await getCollection();
  const rows = await collection
    .aggregate<{ _id: string; total: number }>([
      { $match: { status: "issued", ...notDeleted } },
      { $group: { _id: "$vendorId", total: { $sum: "$amount" } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id, r.total]));
}

export interface DebitNoteFilter {
  search?: string;
  vendorId?: string;
  status?: NoteStatus;
}
function buildFilter(opts: DebitNoteFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ debitNoteNumber: rx }, { billNumber: rx }, { vendorName: rx }];
  }
  if (opts.vendorId) filter.vendorId = opts.vendorId;
  if (opts.status) filter.status = opts.status;
  return filter;
}

export async function searchDebitNotes(opts: DebitNoteFilter & { page?: number; pageSize?: number } = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export interface DebitNoteWriteData {
  billId: string;
  amount: number;
  reason: string;
}

export async function createDebitNote(
  data: DebitNoteWriteData,
  actorId: string
): Promise<{ ok: true; note: DebitNote } | { ok: false; reason: string }> {
  const bill = await getPrmsBill(data.billId);
  if (!bill) return { ok: false, reason: "Bill not found." };
  const amount = round2(data.amount);
  if (amount <= 0) return { ok: false, reason: "Enter a debit amount." };

  const collection = await getCollection();
  const doc: DebitNote = {
    _id: newId(),
    debitNoteNumber: await generateDebitNoteNumber(),
    billId: bill._id,
    billNumber: bill.invoiceNumber,
    vendorId: bill.vendorId,
    vendorName: bill.vendorName,
    amount,
    reason: data.reason,
    status: DEFAULT_NOTE_STATUS,
    issuedAt: null,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return { ok: true, note: doc };
}

export async function issueDebitNote(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const note = await collection.findOne({ _id: id, ...notDeleted });
  if (!note) return { ok: false, reason: "Debit note not found." };
  if (note.status !== "draft") return { ok: false, reason: "Only a draft debit note can be issued." };
  await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { status: "issued", issuedAt: new Date(), ...updateStamp(actorId) } }
  );
  const posted = await trySync(() => syncDebitNoteAccrual(id, { id: actorId, email: null }));
  if (!posted.ok) {
    await collection.updateOne({ _id: id }, { $set: { status: "draft", issuedAt: null } });
    return { ok: false, reason: posted.error };
  }
  await fmsEvents.debitNote({ id: note._id, debitNoteNumber: note.debitNoteNumber, amount: note.amount }, "issued", actorId);
  return { ok: true };
}

export async function cancelDebitNote(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const note = await collection.findOne({ _id: id, ...notDeleted });
  if (!note) return { ok: false, reason: "Debit note not found." };
  if (note.status !== "issued") return { ok: false, reason: "Only an issued debit note can be cancelled." };
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { status: "cancelled", ...updateStamp(actorId) } });
  const posted = await trySync(() => syncDebitNoteAccrual(id, { id: actorId, email: null }));
  if (!posted.ok) {
    await collection.updateOne({ _id: id }, { $set: { status: "issued" } });
    return { ok: false, reason: posted.error };
  }
  await fmsEvents.debitNote({ id: note._id, debitNoteNumber: note.debitNoteNumber, amount: note.amount }, "cancelled", actorId);
  return { ok: true };
}
