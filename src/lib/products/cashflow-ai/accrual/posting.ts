import "server-only";
import { getDb } from "@/lib/mongodb";
import { isDateInClosedPeriod } from "@/lib/products/cashflow-ai/fiscal-periods";
import { healEmptyDocumentEntry, liveDocumentEntry, postDocumentEntry, reverseDocumentEntry } from "@/lib/products/cashflow-ai/journal";
import { getAccrualSettings, resolveAccrualAccounts, type AccrualSettings } from "@/lib/products/cashflow-ai/accrual/settings";
import {
  billLines,
  creditNoteLines,
  dayOf,
  istToday,
  debitNoteLines,
  invoiceLines,
  postingDate,
  receiptTdsLines,
  r2,
  signatureOf,
  type AccrualAccounts,
  type PostingLine,
} from "@/lib/products/cashflow-ai/accrual/core";

/**
 * Keeps the ledger's entry for each business document in step with the
 * document. `sync…` is called whenever a document is created, changed,
 * issued or cancelled, and is safe to call any number of times: a document
 * whose posting has not changed is left alone, a changed one is reversed and
 * posted again, one that no longer counts (cancelled, draft, deleted) is
 * reversed. Nothing happens until accrual books are switched on.
 */
export const INVOICES = "fms_invoices";
export const CREDIT_NOTES = "fms_credit_notes";
export const BILLS = "prms_invoices";
export const DEBIT_NOTES = "fms_debit_notes";

export type Actor = { id: string; email: string | null };
export type SyncResult = { ok: true; changed: boolean; lost?: boolean } | { ok: false; error: string };

const isoDay = dayOf;
const today = () => istToday();

interface Desired {
  date: string;
  description: string;
  currency: string;
  lines: PostingLine[];
}

export async function applyDocumentEntry(sourceType: string, sourceId: string, desired: { date: string; description: string; currency: string; lines: PostingLine[] } | null, actor: Actor): Promise<SyncResult> {
  return again(() => apply(sourceType, sourceId, desired, actor));
}

async function apply(sourceType: string, sourceId: string, desired: Desired | null, actor: Actor): Promise<SyncResult> {
  let live = await liveDocumentEntry(sourceType, sourceId);
  if (live && (await healEmptyDocumentEntry(live))) live = null;

  if (!desired) {
    if (!live) return { ok: true, changed: false };
    const own = isoDay(live.entryDate);
    const date = (await isDateInClosedPeriod(live.entryDate)) ? today() : own;
    if (await isDateInClosedPeriod(new Date(`${date}T00:00:00`))) return { ok: false, error: "This is dated in a closed fiscal period. Reopen the period first." };
    const won = await reverseDocumentEntry(live, new Date(`${date}T00:00:00`), `Reversal — ${live.description ?? sourceType}`, actor.id);
    return won ? { ok: true, changed: true } : { ok: true, changed: false, lost: true };
  }

  const sig = signatureOf(desired.date, desired.lines);
  if (live && live.signature === sig) return { ok: true, changed: false };

  const entryDate = new Date(`${desired.date}T00:00:00`);
  if (await isDateInClosedPeriod(entryDate)) return { ok: false, error: `This is dated ${desired.date}, inside a closed fiscal period. Reopen the period first.` };

  if (live) {
    const own = isoDay(live.entryDate);
    const reverseOn = (await isDateInClosedPeriod(live.entryDate)) ? today() : own;
    if (await isDateInClosedPeriod(new Date(`${reverseOn}T00:00:00`))) return { ok: false, error: "The earlier posting is in a closed fiscal period. Reopen the period first." };
    const won = await reverseDocumentEntry(live, new Date(`${reverseOn}T00:00:00`), `Reversal — ${live.description ?? sourceType}`, actor.id);
    if (!won) return { ok: true, changed: false, lost: true }; // someone else is changing it right now: the caller looks again at the latest document
  }
  const posted = await postDocumentEntry({
    sourceType,
    sourceId,
    signature: sig,
    entryDate,
    description: desired.description,
    currency: desired.currency,
    actorId: actor.id,
    lines: desired.lines.map((l) => ({ account: l.account, side: l.side, amount: l.amount })),
  });
  // `exists` = someone else posted first: look again, our version may differ
  return posted.ok ? { ok: true, changed: true } : { ok: true, changed: false, lost: true };
}

async function context(actor: Actor): Promise<{ settings: AccrualSettings; accounts: AccrualAccounts } | { skip: true } | { error: string }> {
  const settings = await getAccrualSettings();
  if (!settings) return { skip: true };
  const accounts = await resolveAccrualAccounts(settings, actor.id);
  if (!accounts) return { error: "Accrual books are on, but the chart of accounts is missing Accounts Receivable, Accounts Payable or the revenue / expense account chosen for them." };
  return { settings, accounts };
}

type Doc = Record<string, unknown> & { _id: string };
async function load(collection: string, id: string): Promise<Doc | null> {
  const db = await getDb();
  return (await db.collection(collection).findOne({ _id: id as never })) as Doc | null;
}
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Lines that take an opening balance back out when a document that was in the opening balances is cancelled. */
function openingReversal(a: AccrualAccounts, kind: "receivable-down" | "payable-down" | "receivable-up" | "payable-up", amount: number): PostingLine[] | null {
  const amt = r2(amount);
  if (!(amt > 0)) return null;
  switch (kind) {
    case "receivable-down": return [{ account: a.openingEquity, side: "debit", amount: amt }, { account: a.receivable, side: "credit", amount: amt }];
    case "receivable-up": return [{ account: a.receivable, side: "debit", amount: amt }, { account: a.openingEquity, side: "credit", amount: amt }];
    case "payable-down": return [{ account: a.payable, side: "debit", amount: amt }, { account: a.openingEquity, side: "credit", amount: amt }];
    case "payable-up": return [{ account: a.openingEquity, side: "debit", amount: amt }, { account: a.payable, side: "credit", amount: amt }];
  }
}

// ───────────────────────────── invoices ─────────────────────────────

async function syncInvoiceAccrualOnce(id: string, actor: Actor): Promise<SyncResult> {
  const ctx = await context(actor);
  if ("skip" in ctx) return { ok: true, changed: false };
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { settings, accounts } = ctx;
  const inv = await load(INVOICES, id);
  const status = inv ? str(inv.status) : "";
  const gone = !inv || inv.deletedAt != null || status === "cancelled" || status === "void";

  if (inv && inv.openingAccrued === true) {
    // already in the opening receivable: only taking it out again needs a posting
    const lines = gone && inv ? openingReversal(accounts, "receivable-down", num(inv.openingAmount)) : null;
    return apply("invoice", id, lines && inv ? { date: today() < settings.startDate ? settings.startDate : today(), description: `Invoice ${str(inv.invoiceNumber)} cancelled (was in the opening balances)`, currency: str(inv.currency) || "INR", lines } : null, actor);
  }
  if (!inv || gone || status === "draft") return apply("invoice", id, null, actor);

  const lines = invoiceLines({ totalAmount: num(inv.totalAmount), taxAmount: num(inv.taxAmount) }, accounts);
  if (!lines) return num(inv.totalAmount) > 0 ? { ok: false, error: `Invoice ${str(inv.invoiceNumber)}: the amounts do not add up (tax is more than the total), so it cannot be posted.` } : apply("invoice", id, null, actor);
  return apply("invoice", id, { date: postingDate(str(inv.invoiceDate), settings.startDate), description: `Invoice ${str(inv.invoiceNumber)} — ${str(inv.customerName)}`, currency: str(inv.currency) || "INR", lines }, actor);
}

async function syncCreditNoteAccrualOnce(id: string, actor: Actor): Promise<SyncResult> {
  const ctx = await context(actor);
  if ("skip" in ctx) return { ok: true, changed: false };
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { settings, accounts } = ctx;
  const note = await load(CREDIT_NOTES, id);
  if (!note) return apply("credit_note", id, null, actor);
  const status = str(note.status);
  const issued = status === "issued" && note.deletedAt == null;

  if (note.openingAccrued === true) {
    const lines = status === "cancelled" ? openingReversal(accounts, "receivable-up", num(note.amount)) : null;
    return apply("credit_note", id, lines ? { date: today() < settings.startDate ? settings.startDate : today(), description: `Credit note ${str(note.creditNoteNumber)} cancelled (was in the opening balances)`, currency: "INR", lines } : null, actor);
  }
  if (!issued) return apply("credit_note", id, null, actor);
  const inv = await load(INVOICES, str(note.invoiceId));
  if (!inv) return { ok: false, error: "The invoice this credit note is for no longer exists." };
  const lines = creditNoteLines(num(note.amount), { totalAmount: num(inv.totalAmount), taxAmount: num(inv.taxAmount) }, accounts);
  if (!lines) return apply("credit_note", id, null, actor);
  const issuedAt = note.issuedAt instanceof Date ? istToday(note.issuedAt) : today();
  return apply("credit_note", id, { date: postingDate(issuedAt, settings.startDate), description: `Credit note ${str(note.creditNoteNumber)} against ${str(note.invoiceNumber)}`, currency: str(inv.currency) || "INR", lines }, actor);
}

// ───────────────────────────── vendor bills ─────────────────────────────

async function syncBillAccrualOnce(id: string, actor: Actor): Promise<SyncResult> {
  const ctx = await context(actor);
  if ("skip" in ctx) return { ok: true, changed: false };
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { settings, accounts } = ctx;
  const bill = await load(BILLS, id);
  const gone = !bill || bill.deletedAt != null || str(bill.status) === "cancelled";

  if (bill && bill.openingAccrued === true) {
    const lines = gone ? openingReversal(accounts, "payable-down", num(bill.openingAmount)) : null;
    return apply("bill", id, lines ? { date: today() < settings.startDate ? settings.startDate : today(), description: `Bill ${str(bill.invoiceNumber)} cancelled (was in the opening balances)`, currency: str(bill.currency) || "INR", lines } : null, actor);
  }
  if (!bill || gone) return apply("bill", id, null, actor);
  const lines = billLines({ subtotal: num(bill.subtotal), gstAmount: num(bill.gstAmount), tdsAmount: num(bill.tdsAmount), totalAmount: num(bill.totalAmount), netPayable: num(bill.netPayable) }, accounts);
  if (!lines) return num(bill.totalAmount) > 0 ? { ok: false, error: `Bill ${str(bill.invoiceNumber)}: the amounts do not add up (subtotal, GST, TDS and net payable disagree), so it cannot be posted.` } : apply("bill", id, null, actor);
  return apply("bill", id, { date: postingDate(str(bill.invoiceDate), settings.startDate), description: `Bill ${str(bill.invoiceNumber)} — ${str(bill.vendorName)}`, currency: str(bill.currency) || "INR", lines }, actor);
}

async function syncDebitNoteAccrualOnce(id: string, actor: Actor): Promise<SyncResult> {
  const ctx = await context(actor);
  if ("skip" in ctx) return { ok: true, changed: false };
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { settings, accounts } = ctx;
  const note = await load(DEBIT_NOTES, id);
  if (!note) return apply("debit_note", id, null, actor);
  const status = str(note.status);
  const issued = status === "issued" && note.deletedAt == null;

  if (note.openingAccrued === true) {
    const lines = status === "cancelled" ? openingReversal(accounts, "payable-down", num(note.amount)) : null;
    return apply("debit_note", id, lines ? { date: today() < settings.startDate ? settings.startDate : today(), description: `Debit note ${str(note.debitNoteNumber)} cancelled (was in the opening balances)`, currency: "INR", lines } : null, actor);
  }
  if (!issued) return apply("debit_note", id, null, actor);
  const bill = await load(BILLS, str(note.billId));
  if (!bill) return { ok: false, error: "The bill this debit note is for no longer exists." };
  const lines = debitNoteLines(num(note.amount), { subtotal: num(bill.subtotal), gstAmount: num(bill.gstAmount), tdsAmount: num(bill.tdsAmount), totalAmount: num(bill.totalAmount), netPayable: num(bill.netPayable) }, accounts);
  if (!lines) return apply("debit_note", id, null, actor);
  const issuedAt = note.issuedAt instanceof Date ? istToday(note.issuedAt) : today();
  return apply("debit_note", id, { date: postingDate(issuedAt, settings.startDate), description: `Debit note ${str(note.debitNoteNumber)} against ${str(note.billNumber)}`, currency: str(bill.currency) || "INR", lines }, actor);
}

// ───────────────────────────── TDS a customer deducted ─────────────────────────────

export const RECEIPTS = "fms_receipts";

/** The tax credit from TDS a customer deducted on a receipt, kept in step with the receipt (voided or not yet cleared = nothing). */
async function syncReceiptTdsAccrualOnce(id: string, actor: Actor): Promise<SyncResult> {
  const ctx = await context(actor);
  if ("skip" in ctx) return { ok: true, changed: false };
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { settings, accounts } = ctx;
  const r = await load(RECEIPTS, id);
  const tds = r ? num(r.tdsDeducted) : 0;
  if (!r || r.deletedAt != null || str(r.status) !== "completed" || !(tds > 0)) return apply("receipt_tds", id, null, actor);
  const lines = receiptTdsLines(tds, accounts);
  if (!lines) return apply("receipt_tds", id, null, actor);
  const on = r.clearedAt instanceof Date ? isoDay(r.clearedAt) : r.receiptDate instanceof Date ? isoDay(r.receiptDate) : today();
  return apply("receipt_tds", id, { date: postingDate(on, settings.startDate), description: `TDS deducted on receipt ${str(r.receiptNumber)} — ${str(r.customerName)}`, currency: str(r.currency) || "INR", lines }, actor);
}

/** Runs a sync again from a fresh read of the document when another request changed it at the same moment, so the newest state always wins. */
async function again(run: () => Promise<SyncResult>): Promise<SyncResult> {
  let last: SyncResult = { ok: true, changed: false };
  for (let i = 0; i < 4; i++) {
    last = await run();
    if (!(last.ok && last.lost)) return last;
  }
  return last;
}
export const syncInvoiceAccrual = (id: string, actor: Actor) => again(() => syncInvoiceAccrualOnce(id, actor));
export const syncCreditNoteAccrual = (id: string, actor: Actor) => again(() => syncCreditNoteAccrualOnce(id, actor));
export const syncBillAccrual = (id: string, actor: Actor) => again(() => syncBillAccrualOnce(id, actor));
export const syncDebitNoteAccrual = (id: string, actor: Actor) => again(() => syncDebitNoteAccrualOnce(id, actor));
export const syncReceiptTdsAccrual = (id: string, actor: Actor) => again(() => syncReceiptTdsAccrualOnce(id, actor));

/** For callers that cannot refuse and must not fail: runs a sync and reports a problem instead of throwing. */
export async function trySync(fn: () => Promise<SyncResult>): Promise<SyncResult> {
  try {
    return await fn();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not post to the ledger." };
  }
}

/** Why a document dated `documentDate` could not be posted right now (its posting day is in a closed period), or null when it can. */
export async function postingBlocked(documentDate: string): Promise<string | null> {
  const settings = await getAccrualSettings();
  if (!settings) return null;
  const on = postingDate(documentDate, settings.startDate);
  return (await isDateInClosedPeriod(new Date(`${on}T00:00:00`))) ? `Accrual books would post this on ${on}, which is in a closed fiscal period. Reopen the period or change the date.` : null;
}
