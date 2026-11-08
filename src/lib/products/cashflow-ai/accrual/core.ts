/**
 * Accrual posting, the pure part: which journal lines a business document
 * produces. No DB, no network.
 *
 * Until the company switches accrual books on, the ledger records money only
 * when it moves (cash basis). From the day they switch on, every invoice,
 * credit note, vendor bill and debit note is posted when it is raised, and
 * receipts / vendor payments settle the receivable / payable instead of
 * booking income or expense a second time:
 *
 *   invoice        Dr Receivable                 Cr Revenue, Cr GST output
 *   credit note    Dr Revenue, Dr GST output     Cr Receivable
 *   receipt        Dr Bank                       Cr Receivable
 *   vendor bill    Dr Expense, Dr GST input      Cr Payable, Cr TDS payable
 *   debit note     Dr Expense, Dr GST input      Cr Payable      (an extra charge or correction the vendor is owed)
 *   vendor payment Dr Payable                    Cr Bank
 */
import { createHash } from "node:crypto";

/** India's date today (YYYY-MM-DD): the company's books run on it. */
export function istToday(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/** The calendar day of an entry date (entries are stored at the server's local midnight of their day). */
export function dayOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The calendar day of a stored date that may be a Date, an ISO string, or missing/damaged (then null): old or hand-made records must not crash a page. */
export function safeDay(d: unknown): string | null {
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : dayOf(d);
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  return null;
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface AccountRef {
  _id: string;
  code: string;
  name: string;
}

export interface AccrualAccounts {
  receivable: AccountRef;
  payable: AccountRef;
  revenue: AccountRef;
  expense: AccountRef;
  gstOutput: AccountRef;
  gstInput: AccountRef;
  tdsPayable: AccountRef;
  openingEquity: AccountRef;
  /** Income tax a customer deducted when paying us: a credit we claim against our own tax. */
  tdsReceivable: AccountRef;
}

export type Side = "debit" | "credit";
export interface PostingLine {
  account: AccountRef;
  side: Side;
  amount: number;
}

/** The ledger accounts the engine needs, by code. 1100, 2000 and the one the company picks for revenue / expense come from the chart of accounts; the rest are created when accrual books are switched on. */
export const ENGINE_ACCOUNTS = {
  gstInput: { code: "1500", name: "GST input credit (ITC)", type: "asset" as const },
  gstOutput: { code: "2210", name: "GST output payable", type: "liability" as const },
  tdsPayable: { code: "2220", name: "TDS payable", type: "liability" as const },
  openingEquity: { code: "3100", name: "Opening balance equity", type: "equity" as const },
  tdsReceivable: { code: "1510", name: "TDS receivable (deducted by customers)", type: "asset" as const },
  /** Income tax the company itself has paid (advance tax, self-assessment tax), waiting to be set against the year's tax. */
  advanceTax: { code: "1520", name: "Advance tax paid", type: "asset" as const },
  taxProvision: { code: "2230", name: "Provision for income tax", type: "liability" as const },
  taxExpense: { code: "5950", name: "Income tax expense", type: "expense" as const },
};

export interface InvoiceFigures {
  totalAmount: number;
  taxAmount: number;
}

/** Share of a document's gross amount that is tax, used to split a note that carries one amount. */
export function taxShare(amount: number, doc: { totalAmount: number; taxAmount: number }): number {
  if (!(doc.totalAmount > 0) || !(doc.taxAmount > 0)) return 0;
  return Math.min(r2(amount), r2((amount * doc.taxAmount) / doc.totalAmount));
}

/** Drops empty lines and makes the entry balance. A gap of up to two paise (each figure on a document is rounded on its own) is put on the largest line of the lighter side; a bigger gap means the document's figures do not add up and nothing is posted. */
function clean(lines: PostingLine[]): PostingLine[] | null {
  const kept = lines.map((l) => ({ ...l, amount: r2(l.amount) })).filter((l) => l.amount > 0);
  const sideTotal = (side: Side) => r2(kept.filter((l) => l.side === side).reduce((n, l) => n + l.amount, 0));
  const dr = sideTotal("debit");
  const cr = sideTotal("credit");
  if (kept.length < 2) return null;
  if (dr === cr) return kept;
  if (Math.abs(dr - cr) > 0.02) return null;
  const lighter: Side = dr < cr ? "debit" : "credit";
  const target = kept.filter((l) => l.side === lighter).sort((a, b) => b.amount - a.amount)[0];
  if (!target) return null;
  target.amount = r2(target.amount + Math.abs(dr - cr));
  return kept;
}

export function invoiceLines(inv: InvoiceFigures, a: AccrualAccounts): PostingLine[] | null {
  const total = r2(inv.totalAmount);
  const tax = r2(inv.taxAmount);
  return clean([
    { account: a.receivable, side: "debit", amount: total },
    { account: a.revenue, side: "credit", amount: total - tax },
    { account: a.gstOutput, side: "credit", amount: tax },
  ]);
}

export function creditNoteLines(amount: number, inv: InvoiceFigures, a: AccrualAccounts): PostingLine[] | null {
  const gross = r2(amount);
  const tax = taxShare(gross, inv);
  return clean([
    { account: a.revenue, side: "debit", amount: gross - tax },
    { account: a.gstOutput, side: "debit", amount: tax },
    { account: a.receivable, side: "credit", amount: gross },
  ]);
}

export interface BillFigures {
  subtotal: number;
  gstAmount: number;
  tdsAmount: number;
  totalAmount: number;
  netPayable: number;
}

export function billLines(bill: BillFigures, a: AccrualAccounts): PostingLine[] | null {
  return clean([
    { account: a.expense, side: "debit", amount: bill.subtotal },
    { account: a.gstInput, side: "debit", amount: bill.gstAmount },
    { account: a.payable, side: "credit", amount: bill.netPayable },
    { account: a.tdsPayable, side: "credit", amount: bill.tdsAmount },
  ]);
}

/** A debit note in this product is an additional charge or correction against a vendor bill: it increases what is owed to the vendor. */
export function debitNoteLines(amount: number, bill: BillFigures, a: AccrualAccounts): PostingLine[] | null {
  const gross = r2(amount);
  const tax = taxShare(gross, { totalAmount: bill.totalAmount, taxAmount: bill.gstAmount });
  return clean([
    { account: a.expense, side: "debit", amount: gross - tax },
    { account: a.gstInput, side: "debit", amount: tax },
    { account: a.payable, side: "credit", amount: gross },
  ]);
}

/** Same lines and date give the same signature: a document whose posting has not changed is left alone. */
export function signatureOf(date: string, lines: PostingLine[]): string {
  const body = lines
    .map((l) => `${l.account._id}|${l.side}|${l.amount.toFixed(2)}`)
    .sort()
    .join(";");
  return createHash("sha256").update(`${date}#${body}`).digest("hex").slice(0, 24);
}

/** A document is posted on its own date, but never before accrual books started. */
export function postingDate(documentDate: string, startDate: string): string {
  return documentDate < startDate ? startDate : documentDate;
}

/** A customer paid less than the invoice because it deducted TDS: that part settles the receivable too, as a tax credit we are owed. */
export function receiptTdsLines(tds: number, a: AccrualAccounts): PostingLine[] | null {
  return clean([
    { account: a.tdsReceivable, side: "debit", amount: tds },
    { account: a.receivable, side: "credit", amount: tds },
  ]);
}

// ───────────────────────── opening balances ─────────────────────────

export interface OpenInvoice {
  status: string;
  totalAmount: number;
  amountPaid: number;
  amountCredited: number;
}
/** What customers still owe on invoices that have been issued, not cancelled, when accrual books start. */
export function openingReceivable(invoices: OpenInvoice[]): number {
  return r2(
    invoices
      .filter((i) => i.status !== "draft" && i.status !== "cancelled" && i.status !== "void")
      .reduce((n, i) => n + Math.max(0, r2(i.totalAmount - i.amountPaid - i.amountCredited)), 0)
  );
}

export interface OpenBill {
  status: string;
  netPayable: number;
  amountPaid: number;
}
/** What is still owed to vendors when accrual books start: entered, not cancelled bills at what is unpaid, plus issued debit notes (extra charges owed). */
export function openingPayable(bills: OpenBill[], issuedDebitNotes = 0): number {
  return r2(
    bills
      .filter((b) => b.status !== "cancelled")
      .reduce((n, b) => n + Math.max(0, r2(b.netPayable - b.amountPaid)), 0) + issuedDebitNotes
  );
}

export function openingLines(receivable: number, payable: number, a: AccrualAccounts): PostingLine[] | null {
  return clean([
    { account: a.receivable, side: "debit", amount: receivable },
    { account: a.openingEquity, side: "credit", amount: receivable },
    { account: a.openingEquity, side: "debit", amount: payable },
    { account: a.payable, side: "credit", amount: payable },
  ]);
}
