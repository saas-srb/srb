import "server-only";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { getAccount } from "@/lib/products/cashflow-ai/accounts";
import { isDateInClosedPeriod } from "@/lib/products/cashflow-ai/fiscal-periods";
import { liveDocumentEntry, liveDocumentIds, linesForAccount, postDocumentEntry, reverseDocumentEntry } from "@/lib/products/cashflow-ai/journal";
import { ACCRUAL_SETTINGS_COLLECTION, getAccrualSettings, resolveAccrualAccounts, saveAccrualSettingsIfAbsent, type AccrualSettings } from "@/lib/products/cashflow-ai/accrual/settings";
import { istToday, openingLines, openingPayable, openingReceivable, r2, signatureOf, type AccrualAccounts } from "@/lib/products/cashflow-ai/accrual/core";
import {
  BILLS,
  CREDIT_NOTES,
  DEBIT_NOTES,
  INVOICES,
  syncBillAccrual,
  syncCreditNoteAccrual,
  syncDebitNoteAccrual,
  syncInvoiceAccrual,
  trySync,
  type Actor,
} from "@/lib/products/cashflow-ai/accrual/posting";

export { istToday };

type Row = Record<string, unknown> & { _id: string };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export type ActivateResult = { ok: true; startDate: string; openingReceivable: number; openingPayable: number; posted: number } | { ok: false; error: string };

/**
 * Switches accrual books on, from today. What customers still owe on invoices already issued, and what is still owed to vendors on bills
 * already entered, are brought in as opening balances (against "Opening balance equity", for the CA to place); those documents are marked
 * so they are never posted a second time. Everything recorded from now on is posted when it is raised.
 */
export async function activateAccrual(input: { revenueAccountId: string; expenseAccountId: string }, actor: Actor): Promise<ActivateResult> {
  if (await getAccrualSettings()) return { ok: false, error: "Accrual books are already on." };
  const [revenue, expense] = await Promise.all([getAccount(input.revenueAccountId), getAccount(input.expenseAccountId)]);
  if (!revenue || revenue.type !== "income" || revenue.deletedAt) return { ok: false, error: "Choose an income account for sales revenue." };
  if (!expense || expense.type !== "expense" || expense.deletedAt) return { ok: false, error: "Choose an expense account for vendor bills." };
  const accounts = await resolveAccrualAccounts({ revenueAccountId: revenue._id, expenseAccountId: expense._id }, actor.id);
  if (!accounts) return { ok: false, error: "Create the default chart of accounts first: Accounts Receivable and Accounts Payable are needed." };

  const startDate = istToday();
  if (await isDateInClosedPeriod(new Date(`${startDate}T00:00:00`))) return { ok: false, error: "Today falls in a closed fiscal period. Reopen it, or switch on accrual books after it ends." };

  const db = await getDb();
  const [invoices, bills, debitNotes, creditNotes] = await Promise.all([
    db.collection(INVOICES).find({ ...notDeleted, status: { $ne: "draft" } }, { projection: { status: 1, totalAmount: 1, amountPaid: 1, amountCredited: 1 } }).toArray() as unknown as Promise<Row[]>,
    db.collection(BILLS).find({ ...notDeleted }, { projection: { status: 1, netPayable: 1, amountPaid: 1 } }).toArray() as unknown as Promise<Row[]>,
    db.collection(DEBIT_NOTES).find({ ...notDeleted, status: { $ne: "draft" } }, { projection: { billId: 1, amount: 1, status: 1 } }).toArray() as unknown as Promise<Row[]>,
    db.collection(CREDIT_NOTES).find({ ...notDeleted, status: { $ne: "draft" } }, { projection: { _id: 1 } }).toArray() as unknown as Promise<Row[]>,
  ]);
  const issuedDebitNotes = r2(debitNotes.filter((d) => d.status === "issued").reduce((n, d) => n + num(d.amount), 0));

  const receivable = openingReceivable(invoices.map((i) => ({ status: String(i.status), totalAmount: num(i.totalAmount), amountPaid: num(i.amountPaid), amountCredited: num(i.amountCredited) })));
  const payable = openingPayable(bills.map((b) => ({ status: String(b.status), netPayable: num(b.netPayable), amountPaid: num(b.amountPaid) })), issuedDebitNotes);

  const claimed = await saveAccrualSettingsIfAbsent({
    startDate,
    activatedAt: new Date(),
    activatedBy: actor.id,
    revenueAccountId: revenue._id,
    expenseAccountId: expense._id,
    openingReceivable: receivable,
    openingPayable: payable,
  });
  if (!claimed) return { ok: false, error: "Accrual books were just switched on by someone else." };

  // Everything that exists now is either in the opening balances or (a draft) will be posted when it is issued. Each document keeps what it
  // contributed to the opening balances, so cancelling it later takes out exactly that.
  const flagged: { collection: string; ids: string[] }[] = [];
  const flag = async (collection: string, docs: { id: string; set: Record<string, number> }[]) => {
    if (docs.length === 0) return;
    await db.collection(collection).bulkWrite(docs.map((d) => ({ updateOne: { filter: { _id: d.id as never }, update: { $set: { openingAccrued: true, ...d.set } } } })));
    flagged.push({ collection, ids: docs.map((d) => d.id) });
  };
  try {
    await flag(INVOICES, invoices.map((r) => ({ id: r._id, set: { openingAmount: Math.max(0, r2(num(r.totalAmount) - num(r.amountPaid) - num(r.amountCredited))), openingPaid: num(r.amountPaid) } })));
    await flag(BILLS, bills.map((r) => ({ id: r._id, set: { openingAmount: Math.max(0, r2(num(r.netPayable) - num(r.amountPaid))), openingPaid: num(r.amountPaid) } })));
    await flag(CREDIT_NOTES, creditNotes.map((r) => ({ id: r._id, set: {} })));
    await flag(DEBIT_NOTES, debitNotes.map((r) => ({ id: r._id, set: { openingAmount: num(r.amount) } })));
    await ensureOpeningEntry(accounts, startDate, receivable, payable, actor);
  } catch (err) {
    // Leave nothing half-done: take the switch-on back so it can be tried again.
    for (const f of flagged) await db.collection(f.collection).updateMany({ _id: { $in: f.ids as never[] } }, { $unset: { openingAccrued: "", openingAmount: "", openingPaid: "" } }).catch(() => {});
    await db.collection(ACCRUAL_SETTINGS_COLLECTION).deleteOne({ _id: "main" as never }).catch(() => {});
    const live = await liveDocumentEntry("accrual_opening", "main");
    if (live) await reverseDocumentEntry(live, new Date(`${startDate}T00:00:00`), "Switch-on taken back", actor.id).catch(() => {});
    return { ok: false, error: `Accrual books could not be switched on (${err instanceof Error ? err.message : "unknown error"}). Nothing was changed; try again.` };
  }
  const { posted } = await postMissingAccruals(actor);
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "settings", entityId: "accrual", entityLabel: "Accrual books", summary: `switched on from ${startDate}; opening receivable ${receivable}, payable ${payable}` });
  return { ok: true, startDate, openingReceivable: receivable, openingPayable: payable, posted };
}

async function ensureOpeningEntry(accounts: AccrualAccounts, startDate: string, receivable: number, payable: number, actor: Actor): Promise<void> {
  const lines = openingLines(receivable, payable, accounts);
  if (!lines) return;
  await postDocumentEntry({
    sourceType: "accrual_opening",
    sourceId: "main",
    signature: signatureOf(startDate, lines),
    entryDate: new Date(`${startDate}T00:00:00`),
    description: "Opening receivable and payable when accrual books started",
    currency: "INR",
    actorId: actor.id,
    lines: lines.map((l) => ({ account: l.account, side: l.side, amount: l.amount })),
  });
}

/** Posts every document the ledger is missing (a path that could not post at the time, or one recorded while the switch-on was running). Safe to run any time. */
export async function postMissingAccruals(actor: Actor): Promise<{ posted: number; failed: { kind: string; id: string; error: string }[] }> {
  const settings = await getAccrualSettings();
  if (!settings) return { posted: 0, failed: [] };
  const db = await getDb();
  // the opening entry first: if switching on stopped before it was written, it is written now
  const accounts = await resolveAccrualAccounts(settings, actor.id);
  let openingFixed = 0;
  if (accounts && !(await liveDocumentEntry("accrual_opening", "main"))) {
    await ensureOpeningEntry(accounts, settings.startDate, settings.openingReceivable, settings.openingPayable, actor);
    if (await liveDocumentEntry("accrual_opening", "main")) openingFixed = 1;
  }
  const [liveInv, liveCn, liveBill, liveDn] = await Promise.all([liveDocumentIds("invoice"), liveDocumentIds("credit_note"), liveDocumentIds("bill"), liveDocumentIds("debit_note")]);
  const [inv, cn, bill, dn] = await Promise.all([
    db.collection(INVOICES).find({ ...notDeleted, status: { $nin: ["draft", "cancelled", "void"] }, openingAccrued: { $ne: true } }, { projection: { _id: 1 } }).toArray(),
    db.collection(CREDIT_NOTES).find({ ...notDeleted, status: "issued", openingAccrued: { $ne: true } }, { projection: { _id: 1 } }).toArray(),
    db.collection(BILLS).find({ ...notDeleted, status: { $ne: "cancelled" }, openingAccrued: { $ne: true } }, { projection: { _id: 1 } }).toArray(),
    db.collection(DEBIT_NOTES).find({ ...notDeleted, status: "issued", openingAccrued: { $ne: true } }, { projection: { _id: 1 } }).toArray(),
  ]);
  const todo: { kind: string; id: string; run: () => ReturnType<typeof syncInvoiceAccrual> }[] = [
    ...inv.filter((d) => !liveInv.has(String(d._id))).map((d) => ({ kind: "invoice", id: String(d._id), run: () => syncInvoiceAccrual(String(d._id), actor) })),
    ...cn.filter((d) => !liveCn.has(String(d._id))).map((d) => ({ kind: "credit note", id: String(d._id), run: () => syncCreditNoteAccrual(String(d._id), actor) })),
    ...bill.filter((d) => !liveBill.has(String(d._id))).map((d) => ({ kind: "bill", id: String(d._id), run: () => syncBillAccrual(String(d._id), actor) })),
    ...dn.filter((d) => !liveDn.has(String(d._id))).map((d) => ({ kind: "debit note", id: String(d._id), run: () => syncDebitNoteAccrual(String(d._id), actor) })),
  ];
  let posted = openingFixed;
  const failed: { kind: string; id: string; error: string }[] = [];
  for (const t of todo) {
    const r = await trySync(t.run);
    if (r.ok) posted += r.changed ? 1 : 0;
    else failed.push({ kind: t.kind, id: t.id, error: r.error });
  }
  return { posted, failed };
}

export async function countMissingAccruals(): Promise<number | null> {
  if (!(await getAccrualSettings())) return null;
  const db = await getDb();
  const settings = await getAccrualSettings();
  const openingMissing = settings && (settings.openingReceivable > 0 || settings.openingPayable > 0) && !(await liveDocumentEntry("accrual_opening", "main")) ? 1 : 0;
  const [liveInv, liveCn, liveBill, liveDn] = await Promise.all([liveDocumentIds("invoice"), liveDocumentIds("credit_note"), liveDocumentIds("bill"), liveDocumentIds("debit_note")]);
  const ids = async (collection: string, filter: Record<string, unknown>) => (await db.collection(collection).find({ ...notDeleted, openingAccrued: { $ne: true }, ...filter }, { projection: { _id: 1 } }).toArray()).map((d) => String(d._id));
  const [a, b, c, d] = await Promise.all([
    ids(INVOICES, { status: { $nin: ["draft", "cancelled", "void"] } }),
    ids(CREDIT_NOTES, { status: "issued" }),
    ids(BILLS, { status: { $ne: "cancelled" } }),
    ids(DEBIT_NOTES, { status: "issued" }),
  ]);
  return openingMissing + a.filter((x) => !liveInv.has(x)).length + b.filter((x) => !liveCn.has(x)).length + c.filter((x) => !liveBill.has(x)).length + d.filter((x) => !liveDn.has(x)).length;
}

// ───────────────────────── does the ledger agree with the records? ─────────────────────────

export interface TieOut {
  startDate: string;
  receivable: { ledger: number; records: number; difference: number };
  payable: { ledger: number; records: number; difference: number };
}

/** The receivable and payable accounts in the ledger against the invoice / bill records they should add up to. Zero difference = the books agree. */
export async function accrualTieOut(): Promise<TieOut | null> {
  const settings = await getAccrualSettings();
  if (!settings) return null;
  const accounts = await resolveAccrualAccounts(settings, "system");
  if (!accounts) return null;
  const db = await getDb();
  const from = new Date(`${settings.startDate}T00:00:00`);
  const [arLines, apLines] = await Promise.all([linesForAccount(accounts.receivable._id, { dateFrom: from }), linesForAccount(accounts.payable._id, { dateFrom: from })]);
  const net = (lines: { side: string; amount: number }[], positive: "debit" | "credit") => r2(lines.reduce((n, l) => n + (l.side === positive ? l.amount : -l.amount), 0));
  const arLedger = net(arLines, "debit");
  const apLedger = net(apLines, "credit");

  const [invoices, receipts, bills, debitNotes] = await Promise.all([
    db.collection(INVOICES).find({ ...notDeleted, status: { $ne: "draft" } }, { projection: { status: 1, totalAmount: 1, amountPaid: 1, amountCredited: 1, openingAccrued: 1, openingPaid: 1 } }).toArray() as unknown as Promise<Row[]>,
    db.collection("fms_receipts").find({ ...notDeleted, status: "completed", createdAt: { $gte: settings.activatedAt } }, { projection: { advanceAmount: 1 } }).toArray() as unknown as Promise<Row[]>,
    db.collection(BILLS).find({ ...notDeleted }, { projection: { status: 1, netPayable: 1, amountPaid: 1, openingAccrued: 1, openingPaid: 1 } }).toArray() as unknown as Promise<Row[]>,
    db.collection(DEBIT_NOTES).find({ ...notDeleted, status: "issued" }, { projection: { billId: 1, amount: 1 } }).toArray() as unknown as Promise<Row[]>,
  ]);
  // an invoice cancelled after it was paid leaves the customer's money with us: it is a credit in the receivable
  const owed = invoices.reduce((n, i) => {
    const st = String(i.status);
    return st === "cancelled" || st === "void" ? n - Math.max(0, num(i.amountPaid) - (i.openingAccrued === true ? num(i.openingPaid) : 0)) : n + Math.max(num(i.totalAmount) - num(i.amountPaid) - num(i.amountCredited), 0);
  }, 0);
  const advances = receipts.reduce((n, r) => n + num(r.advanceAmount), 0);
  const arRecords = r2(owed - advances);

  // the payables report adds issued debit notes (extra charges) to what the bills still leave unpaid
  // a cancelled bill that was paid leaves a debit in the payable (money we hold with the vendor)
  const apRecords = r2(bills.reduce((n, b) => n + (b.status === "cancelled" ? -Math.max(0, num(b.amountPaid) - (b.openingAccrued === true ? num(b.openingPaid) : 0)) : Math.max(num(b.netPayable) - num(b.amountPaid), 0)), 0) + debitNotes.reduce((n, d) => n + num(d.amount), 0));

  return {
    startDate: settings.startDate,
    receivable: { ledger: arLedger, records: arRecords, difference: r2(arLedger - arRecords) },
    payable: { ledger: apLedger, records: apRecords, difference: r2(apLedger - apRecords) },
  };
}

export type { AccrualSettings };
