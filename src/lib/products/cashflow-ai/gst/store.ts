import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { getCompanyDetails } from "@/lib/products/talentos/company";
import { CLIENTS_COLLECTION } from "@/lib/products/sprintos/clients";
import { VENDORS_COLLECTION } from "@/lib/products/spendiq/vendors";
import { INVOICES_COLLECTION } from "@/lib/products/cashflow-ai/invoices";
import { BILLS as BILLS_COLLECTION } from "@/lib/products/cashflow-ai/accrual/posting";
import {
  billCountsForGst,
  creditNoteAdjustment,
  debitNoteAsInward,
  type CreditNoteAdjustment,
  countsForGst,
  gstr3bWorking,
  inwardRow,
  isMonth,
  ITC_DECISIONS,
  outwardRow,
  type BillLike,
  type CustomerLike,
  type Gstr3bWorking,
  type InvoiceLike,
  type InwardRow,
  type ItcDecision,
  type OutwardRow,
  type Registration,
  type VendorLike,
} from "@/lib/products/cashflow-ai/gst/core";

/**
 * Reads the books for GST: the company's registration, a month's sales and purchases as GST rows, and the company's decision about
 * the input tax on each bill. The documents themselves are never changed here.
 */
export const GST_ITC_COLLECTION = "fms_gst_itc";

export async function loadRegistration(): Promise<Registration> {
  const c = await getCompanyDetails();
  return { gstin: c.gstin ?? "", state: c.state ?? "" };
}

/** First and last day of a YYYY-MM, as YYYY-MM-DD strings (invoice dates are stored that way). */
export function monthRange(month: string): { from: string; to: string } {
  if (!isMonth(month)) throw new Error("Month must look like 2026-10.");
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

type Raw = Record<string, unknown> & { _id: string };

export async function loadOutwardRows(month: string, reg?: Registration): Promise<OutwardRow[]> {
  const { from, to } = monthRange(month);
  const db = await getDb();
  const registration = reg ?? (await loadRegistration());
  const invoices = (await db.collection(INVOICES_COLLECTION).find({ ...notDeleted, invoiceDate: { $gte: from, $lte: to } }).sort({ invoiceDate: 1, invoiceNumber: 1 }).toArray()) as unknown as Raw[];
  const counted = invoices.filter((i) => countsForGst(String(i.status)));
  const ids = [...new Set(counted.map((i) => String(i.customerId)))];
  const clients = ids.length ? ((await db.collection(CLIENTS_COLLECTION).find({ _id: { $in: ids as never[] } }).toArray()) as unknown as Raw[]) : [];
  const byId = new Map<string, CustomerLike>(
    clients.map((c) => {
      const billing = (c.billing ?? {}) as { gstin?: string | null; state?: string | null };
      return [String(c._id), { gstin: billing.gstin ?? null, state: billing.state ?? null }];
    })
  );
  return counted.map((i) => {
    const like: InvoiceLike = {
      id: String(i._id),
      invoiceNumber: String(i.invoiceNumber),
      invoiceDate: String(i.invoiceDate),
      customerId: String(i.customerId),
      customerName: String(i.customerName),
      currency: String(i.currency ?? "INR"),
      items: Array.isArray(i.items) ? (i.items as InvoiceLike["items"]) : [],
      discount: Number(i.discount ?? 0),
      subtotal: Number(i.subtotal ?? 0),
      taxAmount: Number(i.taxAmount ?? 0),
      totalAmount: Number(i.totalAmount ?? 0),
      status: String(i.status),
    };
    return outwardRow(like, byId.get(like.customerId) ?? null, registration);
  });
}

export async function loadItcDecisions(billIds: string[]): Promise<Map<string, ItcDecision>> {
  if (billIds.length === 0) return new Map();
  const db = await getDb();
  const rows = await db.collection<ItcRecord>(GST_ITC_COLLECTION).find({ billId: { $in: billIds }, ...notDeleted }).toArray();
  return new Map(rows.map((r) => [r.billId, r.decision]));
}

export async function loadInwardRows(month: string, reg?: Registration): Promise<InwardRow[]> {
  const { from, to } = monthRange(month);
  const db = await getDb();
  const registration = reg ?? (await loadRegistration());
  const bills = (await db.collection(BILLS_COLLECTION).find({ ...notDeleted, invoiceDate: { $gte: from, $lte: to } }).sort({ invoiceDate: 1 }).toArray()) as unknown as Raw[];
  const counted = bills.filter((b) => billCountsForGst(String(b.status)));
  const vendorIds = [...new Set(counted.map((b) => String(b.vendorId)))];
  const vendors = vendorIds.length ? ((await db.collection(VENDORS_COLLECTION).find({ _id: { $in: vendorIds as never[] } }).toArray()) as unknown as Raw[]) : [];
  const vById = new Map<string, VendorLike>(vendors.map((v) => [String(v._id), { gstin: (v.gstin as string | null) ?? null, state: (v.state as string | null) ?? null }]));
  const decisions = await loadItcDecisions(counted.map((b) => String(b._id)));
  return counted.map((b) => {
    const like: BillLike = {
      id: String(b._id),
      billNumber: String(b.invoiceNumber),
      vendorInvoiceNumber: (b.vendorInvoiceNumber as string | null) ?? null,
      invoiceDate: String(b.invoiceDate),
      vendorId: String(b.vendorId),
      vendorName: String(b.vendorName),
      currency: String(b.currency ?? "INR"),
      subtotal: Number(b.subtotal ?? 0),
      gstAmount: Number(b.gstAmount ?? 0),
      totalAmount: Number(b.totalAmount ?? 0),
      status: String(b.status),
    };
    return inwardRow(like, vById.get(like.vendorId) ?? null, decisions.get(like.id), registration);
  });
}

/** The moment a YYYY-MM starts and ends in India (documents carry real timestamps, invoices carry plain dates). */
function istBounds(month: string): { start: Date; end: Date } {
  const { from, to } = monthRange(month);
  return { start: new Date(`${from}T00:00:00+05:30`), end: new Date(`${to}T23:59:59.999+05:30`) };
}
const istDay = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

async function outwardRowOfInvoice(invoiceId: string, reg: Registration): Promise<OutwardRow | null> {
  const db = await getDb();
  const i = (await db.collection(INVOICES_COLLECTION).findOne({ _id: invoiceId as never })) as unknown as Raw | null;
  if (!i) return null;
  const client = (await db.collection(CLIENTS_COLLECTION).findOne({ _id: String(i.customerId) as never })) as unknown as Raw | null;
  const billing = (client?.billing ?? {}) as { gstin?: string | null; state?: string | null };
  return outwardRow(
    {
      id: String(i._id), invoiceNumber: String(i.invoiceNumber), invoiceDate: String(i.invoiceDate), customerId: String(i.customerId), customerName: String(i.customerName),
      currency: String(i.currency ?? "INR"), items: Array.isArray(i.items) ? (i.items as InvoiceLike["items"]) : [], discount: Number(i.discount ?? 0), subtotal: Number(i.subtotal ?? 0),
      taxAmount: Number(i.taxAmount ?? 0), totalAmount: Number(i.totalAmount ?? 0), status: String(i.status),
    },
    { gstin: billing.gstin ?? null, state: billing.state ?? null },
    reg
  );
}

/** Credit notes issued in the month, each worked out over the rate lines of the invoice it reduces. A note on an invoice that no longer exists is skipped and counted. */
export async function loadCreditNoteAdjustments(month: string, reg: Registration): Promise<{ adjustments: CreditNoteAdjustment[]; skipped: number }> {
  const { start, end } = istBounds(month);
  const db = await getDb();
  const notes = (await db.collection("fms_credit_notes").find({ ...notDeleted, status: "issued", issuedAt: { $gte: start, $lte: end } }).sort({ issuedAt: 1 }).toArray()) as unknown as Raw[];
  const adjustments: CreditNoteAdjustment[] = [];
  let skipped = 0;
  for (const n of notes) {
    const row = await outwardRowOfInvoice(String(n.invoiceId), reg);
    const adj = row ? creditNoteAdjustment({ id: String(n._id), number: String(n.creditNoteNumber), issuedOn: istDay(n.issuedAt as Date), amount: Number(n.amount) }, row) : null;
    if (adj) adjustments.push(adj);
    else skipped += 1;
  }
  return { adjustments, skipped };
}

/** Debit notes (extra charges from a vendor) issued in the month, as extra purchases carrying the decision on their bill. */
export async function loadDebitNoteInward(month: string, reg: Registration): Promise<{ rows: InwardRow[]; skipped: number }> {
  const { start, end } = istBounds(month);
  const db = await getDb();
  const notes = (await db.collection("fms_debit_notes").find({ ...notDeleted, status: "issued", issuedAt: { $gte: start, $lte: end } }).sort({ issuedAt: 1 }).toArray()) as unknown as Raw[];
  const rows: InwardRow[] = [];
  let skipped = 0;
  for (const n of notes) {
    const b = (await db.collection(BILLS_COLLECTION).findOne({ _id: String(n.billId) as never })) as unknown as Raw | null;
    if (!b) { skipped += 1; continue; }
    const v = (await db.collection(VENDORS_COLLECTION).findOne({ _id: String(b.vendorId) as never })) as unknown as Raw | null;
    const decision = (await loadItcDecisions([String(b._id)])).get(String(b._id));
    const bill: BillLike = {
      id: String(b._id), billNumber: String(b.invoiceNumber), vendorInvoiceNumber: (b.vendorInvoiceNumber as string | null) ?? null, invoiceDate: String(b.invoiceDate), vendorId: String(b.vendorId),
      vendorName: String(b.vendorName), currency: String(b.currency ?? "INR"), subtotal: Number(b.subtotal ?? 0), gstAmount: Number(b.gstAmount ?? 0), totalAmount: Number(b.totalAmount ?? 0), status: String(b.status),
    };
    const row = debitNoteAsInward({ id: String(n._id), number: String(n.debitNoteNumber), issuedOn: istDay(n.issuedAt as Date), amount: Number(n.amount) }, inwardRow(bill, { gstin: (v?.gstin as string | null) ?? null, state: (v?.state as string | null) ?? null }, decision, reg));
    if (row) rows.push(row);
    else skipped += 1;
  }
  return { rows, skipped };
}

export async function loadGstr3b(month: string): Promise<{ working: Gstr3bWorking; outward: OutwardRow[]; inward: InwardRow[]; registration: Registration; creditNotes: CreditNoteAdjustment[]; debitNotes: InwardRow[]; skippedNotes: number }> {
  const registration = await loadRegistration();
  const [outward, inward, cn, dn] = await Promise.all([loadOutwardRows(month, registration), loadInwardRows(month, registration), loadCreditNoteAdjustments(month, registration), loadDebitNoteInward(month, registration)]);
  return { working: gstr3bWorking(outward, inward, { creditNotes: cn.adjustments, debitNotes: dn.rows }), outward, inward, registration, creditNotes: cn.adjustments, debitNotes: dn.rows, skippedNotes: cn.skipped + dn.skipped };
}

// ───────────────────────── the company's decision on input credit ─────────────────────────

export interface ItcRecord extends AuditFields {
  _id: string;
  billId: string;
  decision: ItcDecision;
  note: string | null;
  decidedBy: string;
}

const DECISIONS = new Set<string>(ITC_DECISIONS.map((d) => d.value));

let indexed = false;
export async function saveItcDecision(
  input: { billId: string; decision: string; note?: string | null },
  actor: { id: string; email: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!DECISIONS.has(input.decision)) return { ok: false, error: "Choose one of the listed decisions." };
  const db = await getDb();
  const bill = (await db.collection(BILLS_COLLECTION).findOne({ _id: input.billId as never, ...notDeleted })) as unknown as Raw | null;
  if (!bill) return { ok: false, error: "Bill not found." };
  const col = db.collection<ItcRecord>(GST_ITC_COLLECTION);
  const previous = (await col.findOne({ billId: input.billId, ...notDeleted }))?.decision ?? "review";
  if (!indexed) {
    indexed = true;
    await col.createIndex({ billId: 1 }, { unique: true }).catch(() => {});
  }
  const note = input.note?.trim().slice(0, 500) || null;
  const res = await col.updateOne({ billId: input.billId }, { $set: { decision: input.decision as ItcDecision, note, decidedBy: actor.id, deletedAt: null, ...updateStamp(actor.id) } });
  if (res.matchedCount === 0) {
    try {
      await col.insertOne({ _id: newId(), billId: input.billId, decision: input.decision as ItcDecision, note, decidedBy: actor.id, ...createStamp(actor.id) });
    } catch {
      await col.updateOne({ billId: input.billId }, { $set: { decision: input.decision as ItcDecision, note, decidedBy: actor.id, ...updateStamp(actor.id) } });
    }
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "vendor", entityId: String(bill.vendorId), entityLabel: String(bill.vendorName), summary: `input tax on bill ${String(bill.invoiceNumber)}: ${previous} → ${input.decision}` });
  return { ok: true };
}
