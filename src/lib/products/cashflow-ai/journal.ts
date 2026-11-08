import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, nextYearSequence, formatYearCode } from "@/lib/products/cashflow-ai/db";
import { type FundAccountType } from "@/lib/products/cashflow-ai/constants";
import { getAccount, getAccountByCode, CONTROL_ACCOUNT_CODES } from "@/lib/products/cashflow-ai/accounts";
import type { Transaction } from "@/lib/products/cashflow-ai/transactions";
import { getAccrualSettings, accrualAppliesTo } from "@/lib/products/cashflow-ai/accrual/settings";
import { dayOf } from "@/lib/products/cashflow-ai/accrual/core";

/**
 * Double-entry journal (§28/§29 — Phase 5). One journal entry per settled
 * transaction, auto-generated from `fms/transactions.ts`'s
 * `insertTransaction`/`changeTransactionStatus` at the exact same
 * `SETTLED_STATUSES` boundary Phase 4's fund-balance logic already uses —
 * never hand-edited, never posted from a form. Correcting a mistake means
 * reversing the transaction (which reverses its entry), not editing a line.
 *
 * Every entry is exactly two lines and balances by construction — see
 * `postJournalEntryForTransaction` for the account-resolution rules.
 */

export const JOURNAL_ENTRIES_COLLECTION = "fms_journal_entries";
export const JOURNAL_LINES_COLLECTION = "fms_journal_lines";
const FUND_TRANSFERS_COLLECTION = "fms_fund_transfers";
const ENTRY_NUMBER_PREFIX = "JE";

export type JournalSide = "debit" | "credit";

export interface JournalEntry {
  _id: string;
  entryNumber: string;
  /** Null for a fiscal-period closing/reopening entry (see `fms/fiscal-periods.ts`) — every other entry has one. */
  transactionId: string | null;
  transactionNumber: string | null;
  /** Set only on a period closing/reopening entry. */
  periodId: string | null;
  entryDate: Date;
  description: string | null;
  /** Set only on the equal-and-opposite entry posted when a transaction leaves the settled state, or a period is reopened. */
  reversalOfEntryId: string | null;
  /** Set on an entry posted for a business document (invoice, bill, credit / debit note, opening balances) rather than a transaction. */
  sourceType?: string | null;
  sourceId?: string | null;
  /** Fingerprint of the lines and date, so an unchanged document is not posted again. */
  signature?: string | null;
  /** `<sourceType>:<sourceId>` while the entry is the live posting of its document; removed when it is reversed. Unique, so a document is never posted twice at once. */
  docKey?: string | null;
  createdAt: Date;
  createdBy: string | null;
}

export interface JournalLine {
  _id: string;
  entryId: string;
  entryDate: Date;
  accountId: string;
  accountCode: string;
  accountName: string;
  side: JournalSide;
  amount: number;
  /** The transaction's own currency, unconverted — see `fms/exchange-rates.ts` for base-currency conversion at report time. */
  currency: string;
  transactionId: string | null;
  transactionNumber: string | null;
  description: string | null;
  createdAt: Date;
}

export interface SerializedJournalEntry extends Omit<JournalEntry, "entryDate" | "createdAt"> {
  entryDate: string;
  createdAt: string;
}
export function serializeJournalEntry(e: JournalEntry): SerializedJournalEntry {
  return { ...e, entryDate: e.entryDate.toISOString(), createdAt: e.createdAt.toISOString() };
}

export interface SerializedJournalLine extends Omit<JournalLine, "entryDate" | "createdAt"> {
  entryDate: string;
  createdAt: string;
}
export function serializeJournalLine(l: JournalLine): SerializedJournalLine {
  return { ...l, entryDate: l.entryDate.toISOString(), createdAt: l.createdAt.toISOString() };
}

interface FundTransferLookup {
  _id: string;
  fromAccountId: string;
  fromAccountType: FundAccountType;
  toAccountId: string;
  toAccountType: FundAccountType;
  outTransactionId: string;
  inTransactionId: string;
}

let indexesEnsured = false;
async function getEntriesCollection() {
  const db = await getDb();
  const collection = db.collection<JournalEntry>(JOURNAL_ENTRIES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ transactionId: 1 }).catch(() => {}),
      collection.createIndex({ entryNumber: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ reversalOfEntryId: 1 }).catch(() => {}),
      collection.createIndex({ docKey: 1 }, { unique: true, partialFilterExpression: { docKey: { $type: "string" } } }).catch(() => {}),
      collection.createIndex({ sourceType: 1, sourceId: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

let lineIndexesEnsured = false;
async function getLinesCollection() {
  const db = await getDb();
  const collection = db.collection<JournalLine>(JOURNAL_LINES_COLLECTION);
  if (!lineIndexesEnsured) {
    lineIndexesEnsured = true;
    await Promise.all([
      collection.createIndex({ entryId: 1 }).catch(() => {}),
      collection.createIndex({ accountId: 1, entryDate: 1 }).catch(() => {}),
      collection.createIndex({ transactionId: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

async function generateEntryNumber(year: number): Promise<string> {
  const seq = await nextYearSequence(ENTRY_NUMBER_PREFIX, year);
  return formatYearCode(ENTRY_NUMBER_PREFIX, year, seq);
}

export async function entryForTransaction(transactionId: string): Promise<JournalEntry | null> {
  const collection = await getEntriesCollection();
  return collection.findOne({ transactionId });
}

export async function linesForEntry(entryId: string): Promise<JournalLine[]> {
  const collection = await getLinesCollection();
  return collection.find({ entryId }).sort({ side: 1 }).toArray();
}

export interface LedgerLineFilter {
  dateFrom?: Date;
  dateTo?: Date;
}

function dateRangeFilter(opts: LedgerLineFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (opts.dateFrom || opts.dateTo) {
    const range: Record<string, Date> = {};
    if (opts.dateFrom) range.$gte = opts.dateFrom;
    if (opts.dateTo) range.$lte = opts.dateTo;
    filter.entryDate = range;
  }
  return filter;
}

/** Every line for one account, oldest first — the raw material for a running-balance General Ledger view. */
export async function linesForAccount(accountId: string, opts: LedgerLineFilter = {}): Promise<JournalLine[]> {
  const collection = await getLinesCollection();
  return collection
    .find({ accountId, ...dateRangeFilter(opts) })
    .sort({ entryDate: 1, createdAt: 1 })
    .toArray();
}

/** Every line across every account in a date range — the raw material for Trial Balance / P&L / Balance Sheet. */
export async function allLinesInRange(opts: LedgerLineFilter & { excludeClosing?: boolean } = {}): Promise<JournalLine[]> {
  const collection = await getLinesCollection();
  const lines = await collection.find(dateRangeFilter(opts)).toArray();
  if (!opts.excludeClosing) return lines;
  // A period's closing entry (and its reversal when the period is reopened) moves profit into Retained Earnings: it is not income or cost.
  const closing = await (await getEntriesCollection()).find({ periodId: { $ne: null }, ...dateRangeFilter(opts) }, { projection: { _id: 1 } }).toArray();
  if (closing.length === 0) return lines;
  const skip = new Set(closing.map((e) => e._id));
  return lines.filter((l) => !skip.has(l.entryId));
}

export interface MiniAccount {
  _id: string;
  code: string;
  name: string;
}

async function accountByCode(code: string): Promise<MiniAccount | null> {
  const account = await getAccountByCode(code);
  return account ? { _id: account._id, code: account.code, name: account.name } : null;
}

async function controlAccountFor(fundType: FundAccountType): Promise<MiniAccount | null> {
  const code = fundType === "bank" ? CONTROL_ACCOUNT_CODES.bank : CONTROL_ACCOUNT_CODES.cash;
  return accountByCode(code);
}

/**
 * The settlement side of a normal income/expense entry — the real fund
 * account it moved through, mapped onto one shared control account per fund-
 * account *type* (not per literal bank/cash account — see the Phase 5 plan).
 * Falls back to Accounts Receivable / Accounts Payable when the transaction
 * doesn't carry a `fundAccountId` yet (still common for Phase 2/3 automated
 * postings that predate Phase 4's fund-account concept).
 */
async function resolveSettlementAccount(txn: Transaction): Promise<MiniAccount | null> {
  if (txn.fundAccountId && txn.fundAccountType) {
    const control = await controlAccountFor(txn.fundAccountType);
    if (control) return control;
  }
  const code = txn.type === "income" ? CONTROL_ACCOUNT_CODES.accountsReceivable : CONTROL_ACCOUNT_CODES.accountsPayable;
  return accountByCode(code);
}

/**
 * The category side — the transaction's own Chart-of-Accounts classification, or a catch-all fallback. A customer receipt or a vendor
 * payment recorded after accrual books were switched on settles the receivable / payable (the invoice or bill already booked the income
 * or cost), so its category is that control account.
 */
async function resolveCategoryAccount(txn: Transaction, accrual: boolean): Promise<MiniAccount | null> {
  if (accrual && txn.accrualRole === "receivable" && txn.type === "income") return accountByCode(CONTROL_ACCOUNT_CODES.accountsReceivable);
  if (accrual && txn.accrualRole === "payable" && txn.type === "expense") return accountByCode(CONTROL_ACCOUNT_CODES.accountsPayable);
  if (txn.accountId) {
    const account = await getAccount(txn.accountId);
    if (account) return { _id: account._id, code: account.code, name: account.name };
  }
  const code = txn.type === "income" ? CONTROL_ACCOUNT_CODES.otherIncome : CONTROL_ACCOUNT_CODES.otherExpense;
  return accountByCode(code);
}

interface PostEntryParams {
  entryDate: Date;
  description: string | null;
  transactionId: string | null;
  transactionNumber: string | null;
  periodId: string | null;
  reversalOfEntryId: string | null;
  actorId: string | null;
  lines: { account: MiniAccount; side: JournalSide; amount: number; currency: string }[];
  source?: { type: string; id: string; signature: string | null; live: boolean };
}

/**
 * The one place every journal entry is actually written. Transaction-based
 * postings (`writeEntry` below) and fiscal-period closing/reopening entries
 * (`fms/fiscal-periods.ts`) both funnel through here — never a second
 * parallel insert path.
 */
async function postEntry(params: PostEntryParams): Promise<JournalEntry> {
  const entriesCol = await getEntriesCollection();
  const linesCol = await getLinesCollection();
  const entryId = newId();
  const now = new Date();
  const entry: JournalEntry = {
    _id: entryId,
    entryNumber: await generateEntryNumber(params.entryDate.getFullYear()),
    transactionId: params.transactionId,
    transactionNumber: params.transactionNumber,
    periodId: params.periodId,
    entryDate: params.entryDate,
    description: params.description,
    reversalOfEntryId: params.reversalOfEntryId,
    ...(params.source ? { sourceType: params.source.type, sourceId: params.source.id, signature: params.source.signature, ...(params.source.live ? { docKey: `${params.source.type}:${params.source.id}` } : {}) } : {}),
    createdAt: now,
    createdBy: params.actorId,
  };
  await entriesCol.insertOne(entry);
  const lineDocs: JournalLine[] = params.lines.map((l) => ({
    _id: newId(),
    entryId,
    entryDate: params.entryDate,
    accountId: l.account._id,
    accountCode: l.account.code,
    accountName: l.account.name,
    side: l.side,
    amount: l.amount,
    currency: l.currency,
    transactionId: params.transactionId,
    transactionNumber: params.transactionNumber,
    description: params.description,
    createdAt: now,
  }));
  try {
    await linesCol.insertMany(lineDocs);
  } catch (err) {
    // an entry with no lines would block its document from ever being posted: take it back
    await entriesCol.deleteOne({ _id: entryId }).catch(() => {});
    throw err;
  }
  return entry;
}

async function writeEntry(
  txn: Transaction,
  lines: { account: MiniAccount; side: JournalSide }[],
  actorId: string | null,
  reversalOfEntryId: string | null,
  /** YYYY-MM-DD: the entry is dated no earlier than this. */
  notBefore: string | null = null,
  entryDateOverride?: Date
): Promise<JournalEntry> {
  const own = txn.postingDate ?? txn.transactionDate;
  const entryDate = entryDateOverride ?? (notBefore && dayOf(own) < notBefore ? new Date(`${notBefore}T00:00:00`) : own);
  return postEntry({
    entryDate,
    description: reversalOfEntryId ? `Reversal — ${txn.transactionNumber}` : txn.description,
    transactionId: txn._id,
    transactionNumber: txn.transactionNumber,
    periodId: null,
    reversalOfEntryId,
    actorId,
    lines: lines.map((l) => ({ ...l, amount: txn.amount, currency: txn.currency })),
  });
}

/**
 * A transfer's two linked `fms_transactions` legs (§19/§21, `fund-
 * transfers.ts`) represent one indivisible movement between two control
 * accounts — posted once, from the "out" leg, as Dr destination / Cr source,
 * never touching a revenue/expense account. The "in" leg is a no-op here
 * (its effect is already captured by the out leg's entry) so the pair never
 * double-posts.
 */
async function postTransferJournalEntry(txn: Transaction, actorId: string | null): Promise<JournalEntry | null> {
  const db = await getDb();
  const transfer = await db.collection<FundTransferLookup>(FUND_TRANSFERS_COLLECTION).findOne({ _id: txn.transferId as string });
  if (!transfer || txn._id !== transfer.outTransactionId) return null;
  const [fromControl, toControl] = await Promise.all([
    controlAccountFor(transfer.fromAccountType),
    controlAccountFor(transfer.toAccountType),
  ]);
  if (!fromControl || !toControl) return null;
  return writeEntry(
    txn,
    [
      { account: toControl, side: "debit" },
      { account: fromControl, side: "credit" },
    ],
    actorId,
    null
  );
}

/**
 * Posts the balanced two-line entry for a transaction that just became
 * settled (`completed`/`reconciled`). Idempotent — a transaction that
 * already has an entry is skipped, never double-posted. `adjustment`-typed
 * transactions have no defined GL treatment yet and are skipped (they also
 * carry no fund-balance effect — see `fundEffectSign` in `transactions.ts`).
 * Never throws — a posting failure must not break the transaction it's
 * attached to, mirroring `applyToFundAccount`'s fail-soft behavior.
 */
export async function postJournalEntryForTransaction(txn: Transaction, actorId: string | null): Promise<JournalEntry | null> {
  try {
    if (txn.amount <= 0) return null;
    if (await entryForTransaction(txn._id)) return null;
    if (txn.transferId) return await postTransferJournalEntry(txn, actorId);
    if (txn.type !== "income" && txn.type !== "expense") return null;

    const settings = txn.accrualRole ? await getAccrualSettings() : null;
    const accrual = accrualAppliesTo(settings, txn.createdAt);
    const [settlement, category] = await Promise.all([resolveSettlementAccount(txn), resolveCategoryAccount(txn, accrual)]);
    if (!settlement || !category) return null;
    // Books never go back before the day accrual started: a receipt dated earlier is posted on that day.
    const clampTo = accrual && settings ? settings.startDate : null;

    const lines: { account: MiniAccount; side: JournalSide }[] =
      txn.type === "income"
        ? [
            { account: settlement, side: "debit" },
            { account: category, side: "credit" },
          ]
        : [
            { account: category, side: "debit" },
            { account: settlement, side: "credit" },
          ];

    return await writeEntry(txn, lines, actorId, null, clampTo);
  } catch {
    return null;
  }
}

/**
 * Posts an equal-and-opposite entry when a settled transaction leaves the
 * settled state (e.g. `completed → reversed`). The original entry is never
 * edited or deleted — it stays in the General Ledger, and the reversal
 * entry nets it to zero. A no-op if no original entry exists, or if it was
 * already reversed once.
 */
export async function reverseJournalEntryForTransaction(txn: Transaction, actorId: string | null): Promise<JournalEntry | null> {
  try {
    let originalTxnId = txn._id;
    if (txn.transferId) {
      const db = await getDb();
      const transfer = await db.collection<FundTransferLookup>(FUND_TRANSFERS_COLLECTION).findOne({ _id: txn.transferId });
      if (transfer) originalTxnId = transfer.outTransactionId;
    }
    const original = await entryForTransaction(originalTxnId);
    if (!original) return null;

    const entriesCol = await getEntriesCollection();
    const alreadyReversed = await entriesCol.findOne({ reversalOfEntryId: original._id });
    if (alreadyReversed) return null;

    const originalLines = await linesForEntry(original._id);
    if (originalLines.length === 0) return null;

    const flipped = originalLines.map((l) => ({
      account: { _id: l.accountId, code: l.accountCode, name: l.accountName },
      side: (l.side === "debit" ? "credit" : "debit") as JournalSide,
    }));

    // the reversal is dated like the entry it undoes (which may have been moved forward to the day accrual started)
    return await writeEntry(txn, flipped, actorId, original._id, null, original.entryDate);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fiscal-period closing entries (§39 — Phase 7). Called only from
// `fms/fiscal-periods.ts`'s `closePeriod`/`reopenPeriod` — never posted from
// a transaction, so `transactionId` is null and `periodId` is set instead.
// ---------------------------------------------------------------------------

export async function entriesForPeriod(periodId: string): Promise<JournalEntry[]> {
  const collection = await getEntriesCollection();
  return collection.find({ periodId }).toArray();
}

export async function postClosingEntry(params: {
  periodId: string;
  entryDate: Date;
  description: string;
  currency: string;
  actorId: string | null;
  lines: { account: MiniAccount; side: JournalSide; amount: number }[];
}): Promise<JournalEntry> {
  return postEntry({
    entryDate: params.entryDate,
    description: params.description,
    transactionId: null,
    transactionNumber: null,
    periodId: params.periodId,
    reversalOfEntryId: null,
    actorId: params.actorId,
    lines: params.lines.map((l) => ({ ...l, currency: params.currency })),
  });
}

/** Equal-and-opposite of a period's closing entry, posted when the period is reopened. */
export async function reverseClosingEntry(periodId: string, actorId: string | null): Promise<JournalEntry | null> {
  const entries = await entriesForPeriod(periodId);
  const original = entries.find((e) => e.reversalOfEntryId === null);
  if (!original) return null;

  const entriesCol = await getEntriesCollection();
  const alreadyReversed = await entriesCol.findOne({ reversalOfEntryId: original._id });
  if (alreadyReversed) return null;

  const originalLines = await linesForEntry(original._id);
  if (originalLines.length === 0) return null;

  return postEntry({
    entryDate: new Date(),
    description: `Reopen — ${original.description ?? "Period closing entry"}`,
    transactionId: null,
    transactionNumber: null,
    periodId,
    reversalOfEntryId: original._id,
    actorId,
    lines: originalLines.map((l) => ({
      account: { _id: l.accountId, code: l.accountCode, name: l.accountName },
      side: (l.side === "debit" ? "credit" : "debit") as JournalSide,
      amount: l.amount,
      currency: l.currency,
    })),
  });
}


// ---------------------------------------------------------------------------
// Entries for business documents (accrual books). One live entry per document;
// changing a document reverses the live entry and posts a new one.
// ---------------------------------------------------------------------------

export async function liveDocumentEntry(sourceType: string, sourceId: string): Promise<JournalEntry | null> {
  const collection = await getEntriesCollection();
  return collection.findOne({ docKey: `${sourceType}:${sourceId}` });
}

/** Posts a document's entry. `exists` when it already has a live one (someone else posted it first). */
export async function postDocumentEntry(params: {
  sourceType: string;
  sourceId: string;
  signature: string;
  entryDate: Date;
  description: string;
  currency: string;
  actorId: string | null;
  lines: { account: MiniAccount; side: JournalSide; amount: number }[];
}): Promise<{ ok: true; entry: JournalEntry } | { ok: false; reason: "exists" }> {
  try {
    const entry = await postEntry({
      entryDate: params.entryDate,
      description: params.description,
      transactionId: null,
      transactionNumber: null,
      periodId: null,
      reversalOfEntryId: null,
      actorId: params.actorId,
      lines: params.lines.map((l) => ({ ...l, currency: params.currency })),
      source: { type: params.sourceType, id: params.sourceId, signature: params.signature, live: true },
    });
    return { ok: true, entry };
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { ok: false, reason: "exists" };
    throw err;
  }
}

/**
 * Takes back a document's live entry with an equal-and-opposite one. Only one caller can win; the rest get `false`. The lines are read
 * before the entry is released and the entry is put back live if the reversal cannot be written, so a failure never leaves the original
 * in the ledger without a live marker (which would let it be posted a second time).
 */
export async function reverseDocumentEntry(entry: JournalEntry, entryDate: Date, description: string, actorId: string | null): Promise<boolean> {
  const original = await linesForEntry(entry._id);
  if (original.length === 0) return false;
  const entriesCol = await getEntriesCollection();
  const claimed = await entriesCol.updateOne({ _id: entry._id, docKey: entry.docKey }, { $unset: { docKey: "" } });
  if (claimed.modifiedCount !== 1) return false;
  try {
    await postEntry({
      entryDate,
      description,
      transactionId: null,
      transactionNumber: null,
      periodId: null,
      reversalOfEntryId: entry._id,
      actorId,
      lines: original.map((l) => ({ account: { _id: l.accountId, code: l.accountCode, name: l.accountName }, side: (l.side === "debit" ? "credit" : "debit") as JournalSide, amount: l.amount, currency: l.currency })),
      source: { type: entry.sourceType ?? "", id: entry.sourceId ?? "", signature: null, live: false },
    });
  } catch (err) {
    await entriesCol.updateOne({ _id: entry._id }, { $set: { docKey: entry.docKey } }).catch(() => {});
    throw err;
  }
  return true;
}

/**
 * A live entry whose lines never arrived (the server stopped between the two writes) would block its document for ever. Entries older than
 * a minute with no lines are removed; younger ones may still be being written.
 */
export async function healEmptyDocumentEntry(entry: JournalEntry): Promise<boolean> {
  if (Date.now() - entry.createdAt.getTime() < 60_000) return false;
  if ((await linesForEntry(entry._id)).length > 0) return false;
  const entriesCol = await getEntriesCollection();
  await entriesCol.deleteOne({ _id: entry._id, docKey: entry.docKey });
  return true;
}

/** The ids of every document of one kind that has a live entry. */
export async function liveDocumentIds(sourceType: string): Promise<Set<string>> {
  const collection = await getEntriesCollection();
  const rows = await collection.find({ sourceType, docKey: { $type: "string" } }, { projection: { sourceId: 1 } }).toArray();
  return new Set(rows.map((r) => r.sourceId).filter((x): x is string => !!x));
}
