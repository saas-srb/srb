import { fmsEvents } from "@/lib/notify/triggers/fms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { newId, createStamp, updateStamp, notDeleted, nextYearSequence, formatYearCode, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { syncCreditNoteAccrual, trySync } from "@/lib/products/cashflow-ai/accrual/posting";
import { round2, type NoteStatus, DEFAULT_NOTE_STATUS } from "@/lib/products/cashflow-ai/constants";
import { getInvoice, applyCreditToInvoice, invoiceBalance } from "@/lib/products/cashflow-ai/invoices";

/**
 * Credit Notes (§27) — invoice corrections, discounts, refund adjustments,
 * overbilling corrections. `draft` has no effect on the invoice; `issued`
 * applies the amount to `fms_invoices.amountCredited` immediately;
 * `cancelled` (only from `issued`) reverses it. Mirrors the debit-note shape.
 */

export const CREDIT_NOTES_COLLECTION = "fms_credit_notes";
const CREDIT_NOTE_NUMBER_PREFIX = "CRN";

export interface CreditNote extends AuditFields {
  _id: string;
  creditNoteNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  reason: string;
  status: NoteStatus;
  issuedAt: Date | null;
}

export interface SerializedCreditNote extends Omit<CreditNote, "createdAt" | "updatedAt" | "deletedAt" | "issuedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  issuedAt: string | null;
}

export function serializeCreditNote(c: CreditNote): SerializedCreditNote {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
    issuedAt: c.issuedAt ? c.issuedAt.toISOString() : null,
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<CreditNote>(CREDIT_NOTES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ creditNoteNumber: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ invoiceId: 1 }).catch(() => {}),
      collection.createIndex({ customerId: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateCreditNoteNumber(year = new Date().getFullYear()): Promise<string> {
  const seq = await nextYearSequence(CREDIT_NOTE_NUMBER_PREFIX, year);
  return formatYearCode(CREDIT_NOTE_NUMBER_PREFIX, year, seq);
}

export async function getCreditNote(id: string): Promise<CreditNote | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function listCreditNotesForInvoice(invoiceId: string): Promise<CreditNote[]> {
  const collection = await getCollection();
  return collection.find({ invoiceId, ...notDeleted }).sort({ createdAt: -1 }).toArray();
}

export interface CreditNoteFilter {
  search?: string;
  customerId?: string;
  status?: NoteStatus;
}
function buildFilter(opts: CreditNoteFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ creditNoteNumber: rx }, { invoiceNumber: rx }, { customerName: rx }];
  }
  if (opts.customerId) filter.customerId = opts.customerId;
  if (opts.status) filter.status = opts.status;
  return filter;
}

export async function searchCreditNotes(
  opts: CreditNoteFilter & { page?: number; pageSize?: number } = {}
) {
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

export interface CreditNoteWriteData {
  invoiceId: string;
  amount: number;
  reason: string;
}

export async function createCreditNote(
  data: CreditNoteWriteData,
  actorId: string
): Promise<{ ok: true; note: CreditNote } | { ok: false; reason: string }> {
  const invoice = await getInvoice(data.invoiceId);
  if (!invoice) return { ok: false, reason: "Invoice not found." };
  const amount = round2(data.amount);
  if (amount <= 0) return { ok: false, reason: "Enter a credit amount." };
  const outstanding = invoiceBalance(invoice);
  if (amount > outstanding + 0.01) {
    return { ok: false, reason: `Credit amount exceeds the invoice's outstanding balance (${outstanding}).` };
  }

  const collection = await getCollection();
  const doc: CreditNote = {
    _id: newId(),
    creditNoteNumber: await generateCreditNoteNumber(),
    invoiceId: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    amount,
    reason: data.reason,
    status: DEFAULT_NOTE_STATUS,
    issuedAt: null,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return { ok: true, note: doc };
}

export async function issueCreditNote(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const note = await collection.findOne({ _id: id, ...notDeleted });
  if (!note) return { ok: false, reason: "Credit note not found." };
  if (note.status !== "draft") return { ok: false, reason: "Only a draft credit note can be issued." };

  const invoice = await getInvoice(note.invoiceId);
  if (!invoice) return { ok: false, reason: "The linked invoice no longer exists." };
  const outstanding = invoiceBalance(invoice);
  if (note.amount > outstanding + 0.01) {
    return { ok: false, reason: `Credit amount now exceeds the invoice's outstanding balance (${outstanding}).` };
  }

  const issuedAt = new Date();
  await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { status: "issued", issuedAt, ...updateStamp(actorId) } }
  );
  const posted = await trySync(() => syncCreditNoteAccrual(id, { id: actorId, email: null }));
  if (!posted.ok) {
    await collection.updateOne({ _id: id }, { $set: { status: "draft", issuedAt: null } });
    return { ok: false, reason: posted.error };
  }
  await applyCreditToInvoice(note.invoiceId, note.amount, actorId);
  await fmsEvents.creditNote({ id: note._id, creditNoteNumber: note.creditNoteNumber, amount: note.amount, currency: invoice.currency, invoiceNumber: invoice.invoiceNumber }, "issued", actorId);
  return { ok: true };
}

export async function cancelCreditNote(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const note = await collection.findOne({ _id: id, ...notDeleted });
  if (!note) return { ok: false, reason: "Credit note not found." };
  if (note.status !== "issued") return { ok: false, reason: "Only an issued credit note can be cancelled." };

  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { status: "cancelled", ...updateStamp(actorId) } });
  const posted = await trySync(() => syncCreditNoteAccrual(id, { id: actorId, email: null }));
  if (!posted.ok) {
    await collection.updateOne({ _id: id }, { $set: { status: "issued" } });
    return { ok: false, reason: posted.error };
  }
  await applyCreditToInvoice(note.invoiceId, -note.amount, actorId);
  await fmsEvents.creditNote({ id: note._id, creditNoteNumber: note.creditNoteNumber, amount: note.amount }, "cancelled", actorId);
  return { ok: true };
}
