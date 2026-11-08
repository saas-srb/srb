import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted } from "@/lib/products/cashflow-ai/db";
import { round2 } from "@/lib/products/cashflow-ai/constants";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { INVOICES_COLLECTION as CUSTOMER_INVOICES } from "@/lib/products/cashflow-ai/invoices";
import { RECEIPTS_COLLECTION } from "@/lib/products/cashflow-ai/receipts";
import { CREDIT_NOTES_COLLECTION } from "@/lib/products/cashflow-ai/credit-notes";
import { DEBIT_NOTES_COLLECTION } from "@/lib/products/cashflow-ai/debit-notes";
import { REFUNDS_COLLECTION } from "@/lib/products/cashflow-ai/refunds";
import { INVOICES_COLLECTION as VENDOR_BILLS } from "@/lib/products/spendiq/invoices";
import { PAYMENTS_COLLECTION } from "@/lib/products/spendiq/payments";
import { searchClients, getClient } from "@/lib/products/sprintos/clients";
import { searchVendors, getVendor } from "@/lib/products/spendiq/vendors";
import {
  analyseParty,
  balanceAt,
  buildAgeing,
  compareWithConfirmation,
  isYmd,
  type ConfirmationComparison,
  type HeldDoc,
  type PartyAnalysis,
  type PartyDoc,
  type PartyKind,
} from "@/lib/products/cashflow-ai/party-recon/core";

/**
 * Party reconciliation, the data part. Statements are built from the sub-ledgers (invoices, receipts, credit notes and
 * refunds for customers; SpendIQ bills, payments and debit notes for vendors) because the general ledger is cash-basis
 * and does not hold what is owed. Nothing here writes to those collections or to the ledger.
 */

export const CONFIRMATIONS_COLLECTION = "fms_party_confirmations";
export const WRITE_OFFS_COLLECTION = "fms_party_writeoffs";

export const CONFIRMATION_STATUSES = [
  { value: "requested", label: "Asked, waiting for their figure" },
  { value: "agreed", label: "Agreed" },
  { value: "disputed", label: "Disputed" },
  { value: "written_off", label: "Difference written off" },
] as const;
export type ConfirmationStatus = (typeof CONFIRMATION_STATUSES)[number]["value"];

export type Actor = { id: string; email: string | null };
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const today = () => new Date().toISOString().slice(0, 10);
const ymd = (d: Date | string | null | undefined, fallback: Date | string): string => {
  const v = d ?? fallback;
  return typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

interface Loaded {
  docs: PartyDoc[];
  held: HeldDoc[];
}

/** Everything that counts toward each party's balance, for a bounded set of parties. */
export async function loadPartyDocs(kind: PartyKind, partyIds: string[]): Promise<Map<string, Loaded>> {
  const out = new Map<string, Loaded>(partyIds.map((id) => [id, { docs: [], held: [] }]));
  if (partyIds.length === 0) return out;
  const db = await getDb();
  const idField = kind === "customer" ? "customerId" : "vendorId";
  const match = { [idField]: { $in: partyIds }, ...notDeleted };
  const put = (partyId: string, d: PartyDoc) => out.get(partyId)?.docs.push(d);
  const hold = (partyId: string, h: HeldDoc) => out.get(partyId)?.held.push(h);

  if (kind === "customer") {
    const [invoices, receipts, notes, refunds] = await Promise.all([
      db.collection(CUSTOMER_INVOICES).find({ ...match, status: { $in: ["sent", "partially_paid", "overdue", "paid"] } }).toArray(),
      db.collection(RECEIPTS_COLLECTION).find(match).toArray(),
      db.collection(CREDIT_NOTES_COLLECTION).find({ ...match, status: "issued" }).toArray(),
      db.collection(REFUNDS_COLLECTION).find({ ...match, status: "completed" }).toArray(),
    ]);
    for (const i of invoices) {
      put(i.customerId, { id: String(i._id), type: "invoice", number: i.invoiceNumber, date: ymd(i.invoiceDate, i.createdAt), dueDate: i.dueDate ?? null, vendorRef: null, reference: null, amount: round2(i.totalAmount), currency: i.currency ?? "INR", allocations: [], unallocated: 0, recordedSettled: round2((i.amountPaid ?? 0) + (i.amountCredited ?? 0)) });
    }
    for (const r of receipts) {
      const date = ymd(r.receiptDate, r.createdAt);
      if (r.status === "pending_clearance" || r.status === "bounced") {
        hold(r.customerId, { number: r.receiptNumber, date, amount: round2(r.amount), reason: r.status === "bounced" ? "cheque bounced" : "cheque not yet cleared" });
        continue;
      }
      if (r.status !== "completed") continue; // voided
      put(r.customerId, { id: String(r._id), type: "receipt", number: r.receiptNumber, date, dueDate: null, vendorRef: null, reference: r.transactionReference ?? null, amount: round2(r.amount), currency: r.currency ?? "INR", allocations: (r.allocations ?? []).map((a: { invoiceId: string; amount: number }) => ({ docId: a.invoiceId, amount: round2(a.amount) })), unallocated: round2(r.advanceAmount ?? 0), recordedSettled: null });
    }
    for (const c of notes) {
      put(c.customerId, { id: String(c._id), type: "credit_note", number: c.creditNoteNumber, date: ymd(c.issuedAt, c.createdAt), dueDate: null, vendorRef: null, reference: null, amount: round2(c.amount), currency: "INR", allocations: [{ docId: c.invoiceId, amount: round2(c.amount) }], unallocated: 0, recordedSettled: null });
    }
    for (const f of refunds) {
      put(f.customerId, { id: String(f._id), type: "refund", number: f.refundNumber, date: ymd(f.updatedAt, f.createdAt), dueDate: null, vendorRef: null, reference: f.providerRefundId ?? null, amount: round2(f.amount), currency: "INR", allocations: [], unallocated: 0, recordedSettled: null });
    }
  } else {
    const [bills, payments, notes] = await Promise.all([
      db.collection(VENDOR_BILLS).find({ ...match, status: { $ne: "cancelled" } }).toArray(),
      db.collection(PAYMENTS_COLLECTION).find(match).toArray(),
      db.collection(DEBIT_NOTES_COLLECTION).find({ ...match, status: "issued" }).toArray(),
    ]);
    for (const b of bills) {
      put(b.vendorId, { id: String(b._id), type: "bill", number: b.invoiceNumber, date: ymd(b.invoiceDate, b.createdAt), dueDate: b.dueDate ?? null, vendorRef: b.vendorInvoiceNumber ?? null, reference: null, amount: round2(b.netPayable), currency: b.currency ?? "INR", allocations: [], unallocated: 0, recordedSettled: round2(b.amountPaid ?? 0) });
    }
    for (const p of payments) {
      const date = ymd(p.paymentDate, p.createdAt);
      if (p.status === "scheduled") {
        hold(p.vendorId, { number: p.paymentCode, date, amount: round2(p.amount), reason: "payment scheduled, not yet made" });
        continue;
      }
      if (p.status !== "processed") continue; // failed
      put(p.vendorId, { id: String(p._id), type: "payment", number: p.paymentCode, date, dueDate: null, vendorRef: null, reference: p.transactionReference ?? null, amount: round2(p.amount), currency: "INR", allocations: [{ docId: p.invoiceId, amount: round2(p.amount) }], unallocated: 0, recordedSettled: null });
    }
    // The payables report adds an issued debit note to what is owed to the vendor, so this statement does the same: the two never disagree.
    for (const n of notes) {
      put(n.vendorId, { id: String(n._id), type: "debit_note", number: n.debitNoteNumber, date: ymd(n.issuedAt, n.createdAt), dueDate: null, vendorRef: null, reference: null, amount: round2(n.amount), currency: "INR", allocations: [{ docId: n.billId, amount: round2(n.amount) }], unallocated: 0, recordedSettled: null });
    }
  }
  return out;
}

export interface PartyInfo {
  id: string;
  name: string;
  code: string;
}

export async function getParty(kind: PartyKind, id: string): Promise<PartyInfo | null> {
  if (!id || id.length > 80) return null;
  if (kind === "customer") {
    const c = await getClient(id);
    return c ? { id: String(c._id), name: c.companyName, code: c.clientCode } : null;
  }
  const v = await getVendor(id);
  return v ? { id: String(v._id), name: v.companyName, code: v.vendorCode } : null;
}

/** Statement, ageing and flags for one party. `to` defaults to today and `from` to the start of the Indian financial year. */
export async function analysePartyById(kind: PartyKind, id: string, range?: { from?: string; to?: string }): Promise<(PartyAnalysis & { docs: PartyDoc[]; held: HeldDoc[] }) | null> {
  const t = today();
  const to = range?.to && isYmd(range.to) ? range.to : t;
  const from = range?.from && isYmd(range.from) ? range.from : defaultFrom(to);
  const loaded = (await loadPartyDocs(kind, [id])).get(id)!;
  const a = analyseParty(loaded.docs, kind, { from: from <= to ? from : to, to }, loaded.held, t);
  return { ...a, docs: loaded.docs, held: loaded.held };
}

/** 1 April on or before the date: the start of the financial year the date falls in. */
export function defaultFrom(to: string): string {
  const y = Number(to.slice(0, 4));
  return `${Number(to.slice(5, 7)) >= 4 ? y : y - 1}-04-01`;
}

// ---------------------------------------------------------------------------
// Overview of many parties (paged)
// ---------------------------------------------------------------------------

export interface OverviewRow {
  id: string;
  name: string;
  code: string;
  balance: number;
  overdue: number;
  unusual: boolean;
  badFlags: number;
  warnFlags: number;
  confirmation: { status: ConfirmationStatus; asOf: string; difference: number | null } | null;
}

export async function listPartyOverview(kind: PartyKind, opts: { page?: number; pageSize?: number; search?: string } = {}) {
  const page = Math.max(Math.floor(opts.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Math.floor(opts.pageSize ?? 25), 1), 50);
  const search = opts.search?.trim().slice(0, 80) || undefined;
  const base = { page, pageSize, search, sortBy: "companyName" as const, sortDir: "asc" as const };
  const res =
    kind === "customer"
      ? await searchClients(base).then((r) => ({ total: r.total, totalPages: r.totalPages, parties: r.items.map((c) => ({ id: String(c._id), name: c.companyName, code: c.clientCode })) }))
      : await searchVendors(base).then((r) => ({ total: r.total, totalPages: r.totalPages, parties: r.items.map((v) => ({ id: String(v._id), name: v.companyName, code: v.vendorCode })) }));
  const ids = res.parties.map((p) => p.id);
  const [docs, confs] = await Promise.all([loadPartyDocs(kind, ids), latestConfirmations(kind, ids)]);
  const t = today();
  const rows = res.parties.map((p): OverviewRow => {
    const l = docs.get(p.id)!;
    const ageing = buildAgeing(l.docs, t);
    const flags = analyseParty(l.docs, kind, { from: t, to: t }, l.held, t).flags;
    return {
      ...p,
      balance: ageing.net,
      overdue: ageing.overdue,
      unusual: flags.some((f) => f.code === "unusual_balance"),
      badFlags: flags.filter((f) => f.level === "bad").length,
      warnFlags: flags.filter((f) => f.level === "warn").length,
      confirmation: confs.get(p.id) ?? null,
    };
  });
  return { rows, total: res.total, totalPages: res.totalPages, page, pageSize };
}

// ---------------------------------------------------------------------------
// Balance confirmations
// ---------------------------------------------------------------------------

export interface Confirmation {
  _id: string;
  kind: PartyKind;
  partyId: string;
  partyName: string;
  asOf: string;
  /** Our balance on that date, worked out by the system at the time of saving; never typed in. */
  ourBalance: number;
  theirBalance: number | null;
  /** Ours less theirs. */
  difference: number | null;
  status: ConfirmationStatus;
  note: string;
  /** What the data suggested as causes when this was saved. */
  explanations: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
}

let confIndexes = false;
async function confCollection() {
  const db = await getDb();
  const c = db.collection<Confirmation>(CONFIRMATIONS_COLLECTION);
  if (!confIndexes) {
    confIndexes = true;
    // one confirmation per party per date; saving again updates it
    await Promise.all([c.createIndex({ kind: 1, partyId: 1, asOf: 1 }, { unique: true }).catch(() => {}), c.createIndex({ partyId: 1, asOf: -1 }).catch(() => {})]);
  }
  return c;
}

async function latestConfirmations(kind: PartyKind, partyIds: string[]) {
  const map = new Map<string, NonNullable<OverviewRow["confirmation"]>>();
  if (partyIds.length === 0) return map;
  const c = await confCollection();
  const rows = await c.find({ kind, partyId: { $in: partyIds }, ...notDeleted }).sort({ asOf: -1 }).toArray();
  for (const r of rows) if (!map.has(r.partyId)) map.set(r.partyId, { status: r.status, asOf: r.asOf, difference: r.difference });
  return map;
}

export async function listConfirmations(kind: PartyKind, partyId: string, limit = 20): Promise<Confirmation[]> {
  const c = await confCollection();
  return c.find({ kind, partyId, ...notDeleted }).sort({ asOf: -1 }).limit(Math.min(limit, 100)).toArray();
}

const MAX_BALANCE = 1_000_000_000_000; // a thousand billion rupees: a typo guard, not a business limit

export function parseAmount(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.trim().replace(/,/g, "")) : NaN;
  if (!Number.isFinite(n) || Math.abs(n) > MAX_BALANCE) return null;
  return round2(n);
}

/** Works out the difference and likely causes for a figure the other side gave, comparing with our balance on the day we compare. */
export async function previewConfirmation(input: { kind: PartyKind; partyId: string; theirBalance: number; theirAsOf: string; ourAsOf?: string }): Promise<Result<{ comparison: ConfirmationComparison }>> {
  if (!isYmd(input.theirAsOf)) return { ok: false, error: "Enter the date of their statement." };
  if (!Number.isFinite(input.theirBalance)) return { ok: false, error: "Enter their balance as a number." };
  const ourAsOf = input.ourAsOf && isYmd(input.ourAsOf) ? input.ourAsOf : today();
  if (ourAsOf < input.theirAsOf) return { ok: false, error: "Compare on or after the date of their statement." };
  const l = (await loadPartyDocs(input.kind, [input.partyId])).get(input.partyId)!;
  return { ok: true, comparison: compareWithConfirmation(l.docs, { kind: input.kind, theirBalance: round2(input.theirBalance), theirAsOf: input.theirAsOf, ourAsOf }) };
}

export interface ConfirmationInput {
  kind: PartyKind;
  partyId: string;
  asOf: string;
  theirBalance: number | null;
  status: ConfirmationStatus;
  note: string;
}

export async function saveConfirmation(input: ConfirmationInput, actor: Actor): Promise<Result<{ confirmation: Confirmation }>> {
  if (input.kind !== "customer" && input.kind !== "vendor") return { ok: false, error: "Choose customer or vendor." };
  if (!CONFIRMATION_STATUSES.some((s) => s.value === input.status)) return { ok: false, error: "Choose a status." };
  if (!isYmd(input.asOf)) return { ok: false, error: "Enter the date the balance is as of." };
  if (input.asOf > today()) return { ok: false, error: "A balance cannot be as of a future date." };
  if (input.asOf < "2000-01-01") return { ok: false, error: "That date is too far back." };
  const note = (input.note ?? "").trim();
  if (note.length > 1000) return { ok: false, error: "Keep the note under 1,000 characters." };
  const party = await getParty(input.kind, input.partyId);
  if (!party) return { ok: false, error: input.kind === "customer" ? "Customer not found." : "Vendor not found." };

  const l = (await loadPartyDocs(input.kind, [party.id])).get(party.id)!;
  const ours = balanceAt(l.docs, input.asOf);
  let theirs: number | null = null;
  let difference: number | null = null;
  let explanations: string[] = [];
  if (input.status === "requested") {
    if (input.theirBalance !== null) return { ok: false, error: "Leave their balance empty until they reply, or choose Agreed or Disputed." };
  } else {
    if (input.theirBalance === null || !Number.isFinite(input.theirBalance) || Math.abs(input.theirBalance) > MAX_BALANCE) return { ok: false, error: "Enter the balance they confirmed." };
    theirs = round2(input.theirBalance);
    difference = round2(ours - theirs);
    const same = Math.abs(difference) <= 0.01;
    if (input.status === "agreed" && !same) return { ok: false, error: `Our balance on that date is ${ours.toFixed(2)}, which differs from theirs by ${Math.abs(difference).toFixed(2)}. Choose Disputed, or correct the figure.` };
    if ((input.status === "disputed" || input.status === "written_off") && same) return { ok: false, error: "The two balances are the same, so there is nothing to dispute or write off. Choose Agreed." };
    if (input.status === "written_off" && note.length < 5) return { ok: false, error: "Say why the difference is being written off." };
    if (input.status === "disputed" && note.length < 5) return { ok: false, error: "Say briefly what the dispute is about." };
    if (!same) {
      const cmp = compareWithConfirmation(l.docs, { kind: input.kind, theirBalance: theirs, theirAsOf: input.asOf, ourAsOf: input.asOf });
      explanations = cmp.explanations.slice(0, 6).map((e) => e.message);
    }
  }

  const c = await confCollection();
  const key = { kind: input.kind, partyId: party.id, asOf: input.asOf };
  const set = { partyName: party.name, ourBalance: ours, theirBalance: theirs, difference, status: input.status, note, explanations, ...updateStamp(actor.id) };
  let doc: Confirmation | null = null;
  // Two people saving the same party and date at once: the loser of the insert race retries as an update.
  for (let attempt = 0; attempt < 3 && !doc; attempt++) {
    try {
      const stamp = createStamp(actor.id);
      doc = await c.findOneAndUpdate(key, { $set: set, $setOnInsert: { _id: newId(), createdAt: stamp.createdAt, createdBy: stamp.createdBy, deletedAt: null } }, { upsert: true, returnDocument: "after" });
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
  }
  if (!doc) return { ok: false, error: "Could not save. Please try again." };
  await recordAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "record",
    entity: input.kind,
    entityId: party.id,
    entityLabel: party.name,
    summary: `balance confirmation as of ${input.asOf}: ${input.status}${difference !== null ? `, difference ${difference.toFixed(2)}` : ""}`,
    metadata: { ourBalance: ours, theirBalance: theirs, difference, status: input.status },
  });
  return { ok: true, confirmation: doc };
}

// ---------------------------------------------------------------------------
// Write-off / doubtful-debt register. A record for review only: it posts nothing to the books.
// ---------------------------------------------------------------------------

export interface WriteOff {
  _id: string;
  kind: PartyKind;
  partyId: string;
  partyName: string;
  docId: string;
  docNumber: string;
  amount: number;
  reason: string;
  status: "proposed" | "approved";
  proposedBy: string;
  proposedByEmail: string | null;
  approvedBy: string | null;
  approvedByEmail: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
}

let woIndexes = false;
async function woCollection() {
  const db = await getDb();
  const c = db.collection<WriteOff>(WRITE_OFFS_COLLECTION);
  if (!woIndexes) {
    woIndexes = true;
    await Promise.all([c.createIndex({ kind: 1, partyId: 1, createdAt: -1 }).catch(() => {}), c.createIndex({ docId: 1 }).catch(() => {})]);
  }
  return c;
}

export async function listWriteOffs(kind: PartyKind, partyId: string, limit = 50): Promise<WriteOff[]> {
  const c = await woCollection();
  return c.find({ kind, partyId, ...notDeleted }).sort({ createdAt: -1 }).limit(Math.min(limit, 200)).toArray();
}

async function activeWriteOffTotal(c: Awaited<ReturnType<typeof woCollection>>, docId: string): Promise<number> {
  const rows = await c.find({ docId, ...notDeleted }, { projection: { amount: 1 } }).toArray();
  return round2(rows.reduce((n, r) => n + r.amount, 0));
}

export async function proposeWriteOff(input: { kind: PartyKind; partyId: string; docId: string; amount: number; reason: string }, actor: Actor): Promise<Result<{ writeOff: WriteOff }>> {
  if (input.kind !== "customer" && input.kind !== "vendor") return { ok: false, error: "Choose customer or vendor." };
  const amount = round2(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_BALANCE) return { ok: false, error: "Enter an amount above zero." };
  const reason = (input.reason ?? "").trim();
  if (reason.length < 5) return { ok: false, error: "Say why this should be written off." };
  if (reason.length > 500) return { ok: false, error: "Keep the reason under 500 characters." };
  const party = await getParty(input.kind, input.partyId);
  if (!party) return { ok: false, error: input.kind === "customer" ? "Customer not found." : "Vendor not found." };
  const l = (await loadPartyDocs(input.kind, [party.id])).get(party.id)!;
  const item = buildAgeing(l.docs, today()).items.find((i) => i.docId === input.docId);
  if (!item || item.outstanding <= 0) return { ok: false, error: `That ${input.kind === "customer" ? "invoice" : "bill"} has nothing outstanding for this ${input.kind}.` };

  const c = await woCollection();
  const already = await activeWriteOffTotal(c, item.docId);
  if (round2(already + amount) > item.outstanding + 0.005) return { ok: false, error: already > 0 ? `Only ${round2(item.outstanding - already).toFixed(2)} more can be added on ${item.number}: ${item.outstanding.toFixed(2)} is outstanding and ${already.toFixed(2)} is already in the register.` : `Only ${item.outstanding.toFixed(2)} is outstanding on ${item.number}.` };

  const stamp = createStamp(actor.id);
  const doc: WriteOff = { _id: newId(), kind: input.kind, partyId: party.id, partyName: party.name, docId: item.docId, docNumber: item.number, amount, reason, status: "proposed", proposedBy: actor.id, proposedByEmail: actor.email, approvedBy: null, approvedByEmail: null, approvedAt: null, ...stamp };
  await c.insertOne(doc);
  // Two proposals at once can both pass the check above. Each one then looks at the register in the order it was made: it stays only if
  // everything made before it, plus itself, still fits. Earlier proposals always stay, so the outcome does not depend on timing.
  const ordered = await c.find({ docId: item.docId, ...notDeleted }).sort({ createdAt: 1, _id: 1 }).toArray();
  let running = 0;
  for (const w of ordered) {
    running = round2(running + w.amount);
    if (w._id === doc._id && running > item.outstanding + 0.005) {
      await c.updateOne({ _id: doc._id }, { $set: { deletedAt: new Date(), ...updateStamp(actor.id) } });
      return { ok: false, error: `That would write off more than is outstanding on ${item.number}.` };
    }
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "create", entity: input.kind, entityId: party.id, entityLabel: party.name, summary: `write-off proposed: ${amount.toFixed(2)} on ${item.number}`, metadata: { writeOffId: doc._id, docId: item.docId, reason } });
  return { ok: true, writeOff: doc };
}

/** The approver must be a different person from the proposer. The permission to approve is checked by the caller. */
export async function approveWriteOff(id: string, actor: Actor): Promise<Result> {
  const c = await woCollection();
  const existing = await c.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, error: "Write-off not found." };
  if (existing.status !== "proposed") return { ok: false, error: "This write-off has already been approved." };
  if (existing.proposedBy === actor.id) return { ok: false, error: "A different person must approve this: you proposed it." };
  const res = await c.updateOne(
    { _id: id, status: "proposed", proposedBy: { $ne: actor.id }, ...notDeleted },
    { $set: { status: "approved", approvedBy: actor.id, approvedByEmail: actor.email, approvedAt: new Date(), ...updateStamp(actor.id) } }
  );
  if (res.modifiedCount !== 1) return { ok: false, error: "This write-off was just changed by someone else. Refresh and look again." };
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "approve", entity: existing.kind, entityId: existing.partyId, entityLabel: existing.partyName, summary: `write-off approved: ${existing.amount.toFixed(2)} on ${existing.docNumber}`, metadata: { writeOffId: id } });
  return { ok: true };
}

/** Takes back a proposal nobody has approved. An approved entry stays on the register as the record of the decision. */
export async function withdrawWriteOff(id: string, actor: Actor): Promise<Result> {
  const c = await woCollection();
  const existing = await c.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, error: "Write-off not found." };
  const res = await c.updateOne({ _id: id, status: "proposed", ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actor.id) } });
  if (res.modifiedCount !== 1) return { ok: false, error: "An approved write-off cannot be withdrawn." };
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "delete", entity: existing.kind, entityId: existing.partyId, entityLabel: existing.partyName, summary: `write-off withdrawn: ${existing.amount.toFixed(2)} on ${existing.docNumber}`, metadata: { writeOffId: id } });
  return { ok: true };
}
