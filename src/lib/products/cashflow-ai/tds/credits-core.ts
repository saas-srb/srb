/**
 * TDS credit check, the pure part (no DB): reads a simple CSV of the tax credits shown in the company's Form 26AS / AIS and compares it
 * with the TDS the company recorded on customer receipts.
 *
 * NOT VERIFIED AGAINST A REAL 26AS FILE. This version reads ONLY the plain CSV described by CSV_COLUMNS (the company or its CA prepares
 * it, or exports it from their own tool). It does not read the tax portal's own 26AS text or PDF download, and the layout of that file
 * has not been checked here. A row that is not clear is rejected with a counted reason; nothing is guessed.
 *
 * Nothing here changes a receipt or a ledger entry. The result is a list of things to look at.
 */
import { fyRange, isFinancialYear } from "@/lib/products/cashflow-ai/tds/core";
import { MAX_FILE_BYTES, MAX_ROWS, parseDate, splitCsv, type RejectedReason } from "@/lib/products/cashflow-ai/gst/gstr2b-core";
import { csvField } from "@/lib/products/cashflow-ai/gst/csv";

export { MAX_FILE_BYTES, MAX_ROWS };
export type { RejectedReason };

// ───────────────────────────── matching aids (not legal rules) ─────────────────────────────

/** Two tax amounts within this many rupees are "the same". */
export const TAX_TOLERANCE = 1;
/** A receipt and a 26AS entry this many days apart or less can be the same deduction. A matching aid only: the law sets no such window. */
export const DATE_WINDOW_DAYS = 45;
/** Share of the longer name's words that must also be in the other name (after tidying) for two names to count as the same party. */
export const NAME_OVERLAP = 0.6;

// ───────────────────────────── the CSV ─────────────────────────────

export const CSV_COLUMNS = [
  { key: "name", header: "Deductor name", required: true, help: "Name of the customer who deducted the tax." },
  { key: "tan", header: "Deductor TAN", required: false, help: "10 characters, e.g. ABCD12345E. Optional; shown, not used for matching." },
  { key: "section", header: "Section", required: false, help: "e.g. 194J. Optional; shown, not used for matching." },
  { key: "date", header: "Transaction date", required: true, help: "dd/mm/yyyy or yyyy-mm-dd." },
  { key: "paid", header: "Amount paid or credited", required: false, help: "What the customer paid or credited before deducting. Optional." },
  { key: "deducted", header: "Tax deducted", required: true, help: "Amount of TDS deducted." },
  { key: "deposited", header: "Tax deposited", required: false, help: "Amount the customer deposited with the government. When given, this is the credit; otherwise the tax deducted is." },
] as const;

type ColKey = (typeof CSV_COLUMNS)[number]["key"];

/** Headings are compared with everything except letters and digits removed. Unknown headings are ignored, never mapped. */
const SYNONYMS: Record<ColKey, string[]> = {
  name: ["deductorname", "nameofdeductor", "deductor", "customername", "customer", "name"],
  tan: ["deductortan", "tanofdeductor", "tan"],
  section: ["section", "sectioncode"],
  date: ["transactiondate", "dateoftransaction", "dateofbooking", "bookingdate", "datebooked", "paymentdate", "date"],
  paid: ["amountpaidorcredited", "amountpaid", "amountcredited", "paidamount", "grossamount", "amount"],
  deducted: ["taxdeducted", "tdsdeducted", "totaltaxdeducted", "taxdeductedtds", "tds", "incometaxdeducted"],
  deposited: ["taxdeposited", "tdsdeposited", "totaltdsdeposited", "totaltaxdeposited", "taxdepositedtds"],
};

const normHeader = (h: string) => h.replace(/^﻿/, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** The empty template: headings only, so an upload of the untouched file cannot add a made-up credit. */
export function templateCsv(): string {
  return CSV_COLUMNS.map((c) => csvField(c.header)).join(",") + "\r\n";
}

export interface ParsedCredit {
  deductorName: string;
  tan: string | null;
  section: string | null;
  /** YYYY-MM-DD */
  date: string;
  amountPaid: number | null;
  taxDeducted: number;
  /** null when the file has no such column or the cell is empty. */
  taxDeposited: number | null;
  /** What counts as credit: tax deposited when the file gives it, otherwise tax deducted. */
  credit: number;
}

export type ParseResult =
  | { ok: false; error: string }
  | { ok: true; rows: ParsedCredit[]; rejected: RejectedReason[]; rejectedCount: number };

const paise = (n: number) => Math.round((n + Number.EPSILON) * 100);
const rupees = (p: number) => p / 100;

/** "1,23,456.50" -> 123456.5. Blank, text, negative or absurd -> null. Indian and western grouping both fine. */
function amount(v: string | undefined): number | null {
  if (v === undefined) return null;
  const s = v.replace(/[,\s]/g, "").replace(/^(?:₹|rs\.?|inr)/i, "");
  if (!/^\d{1,13}(\.\d{1,4})?$/.test(s)) return null;
  return Number(s);
}

const tidy = (v: string | undefined, max: number) => (v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

class Rejects {
  private m = new Map<string, number>();
  add(reason: string) { this.m.set(reason, (this.m.get(reason) ?? 0) + 1); }
  get total() { return [...this.m.values()].reduce((a, b) => a + b, 0); }
  list(): RejectedReason[] { return [...this.m.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)); }
}

/** Reads the CSV for one financial year. A row dated outside that year is rejected, not moved. */
export function parseTdsCredits(text: string, ctx: { fy: string }): ParseResult {
  if (!isFinancialYear(ctx.fy)) return { ok: false, error: "Choose a financial year like 2026-27." };
  if (typeof text !== "string" || text.trim().length === 0) return { ok: false, error: "The file is empty." };
  if (Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES) return { ok: false, error: `The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB. A CSV of tax credits is normally much smaller; check it is the right file.` };
  if (text.includes("\u0000")) return { ok: false, error: "This is not a CSV text file. This version reads only the CSV described on the page, not the portal's own 26AS file." };
  const head = text.replace(/^﻿/, "").trimStart()[0];
  if (head === "{" || head === "[" || head === "<" || text.startsWith("%PDF")) return { ok: false, error: "This does not look like a CSV. This version reads only the CSV described on the page, not the portal's own 26AS file or a PDF." };

  const lines = splitCsv(text);
  if (lines.length < 2) return { ok: false, error: "The CSV needs a heading line and at least one row." };
  if (lines.length - 1 > MAX_ROWS) return { ok: false, error: `Too many rows (more than ${MAX_ROWS}). Please send fewer.` };

  const header = lines[0].map(normHeader);
  const idx: Partial<Record<ColKey, number>> = {};
  for (const col of CSV_COLUMNS) {
    const i = header.findIndex((h) => SYNONYMS[col.key].includes(h));
    if (i >= 0) idx[col.key] = i;
  }
  const missing = CSV_COLUMNS.filter((c) => c.required && idx[c.key] === undefined).map((c) => c.header);
  if (missing.length) return { ok: false, error: `The CSV is missing a column: ${missing.join(", ")}. Download the template to see the columns.` };

  const range = fyRange(ctx.fy);
  const rejects = new Rejects();
  const rows: ParsedCredit[] = [];
  for (const cells of lines.slice(1)) {
    const get = (k: ColKey) => (idx[k] === undefined ? undefined : (cells[idx[k]!] ?? "").trim());
    const name = tidy(get("name"), 120);
    if (!name) { rejects.add("deductor name missing"); continue; }
    const date = parseDate(get("date"));
    if (!date) { rejects.add("transaction date missing or not a real date"); continue; }
    if (date < range.from || date > range.to) { rejects.add(`transaction date is outside ${ctx.fy}`); continue; }
    const deducted = amount(get("deducted"));
    if (deducted === null) { rejects.add("tax deducted missing or not a valid amount"); continue; }
    let deposited: number | null = null;
    if (idx.deposited !== undefined && get("deposited") !== "") {
      deposited = amount(get("deposited"));
      if (deposited === null) { rejects.add("tax deposited is not a valid amount"); continue; }
    }
    let paid: number | null = null;
    if (idx.paid !== undefined && get("paid") !== "") {
      paid = amount(get("paid"));
      if (paid === null) { rejects.add("amount paid or credited is not a valid amount"); continue; }
    }
    const tanRaw = tidy(get("tan"), 20).toUpperCase();
    if (tanRaw && !/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(tanRaw)) { rejects.add("TAN is not in the right format (4 letters, 5 digits, 1 letter)"); continue; }
    rows.push({
      deductorName: name, tan: tanRaw || null, section: tidy(get("section"), 10).toUpperCase() || null, date,
      amountPaid: paid, taxDeducted: deducted, taxDeposited: deposited, credit: deposited ?? deducted,
    });
  }
  if (rows.length === 0) return { ok: false, error: `None of the rows could be read: ${rejects.list().map((r) => `${r.count} × ${r.reason}`).join("; ")}.` };
  return { ok: true, rows, rejected: rejects.list(), rejectedCount: rejects.total };
}

// ───────────────────────────── names ─────────────────────────────

/** Words that say what kind of company it is, not which one. */
const SUFFIX_WORDS = new Set(["pvt", "private", "ltd", "limited", "llp", "inc", "co", "company", "corp", "corporation", "the", "and"]);

/** Lower case, punctuation to spaces, company-type words removed. If that leaves nothing, the plain words are kept. */
export function nameTokens(name: string): string[] {
  const words = name.toLowerCase().replace(/\bm\/s\b/g, " ").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const core = words.filter((w) => !SUFFIX_WORDS.has(w));
  return core.length ? core : words;
}

/** The words of a name, worked out once and reused for every comparison. */
export interface PreparedName { tokens: string[]; joined: string; set: Set<string> }
export function prepareName(name: string): PreparedName {
  const tokens = nameTokens(name);
  return { tokens, joined: tokens.join(""), set: new Set(tokens) };
}
function scorePrepared(a: PreparedName, b: PreparedName): number {
  if (!a.tokens.length || !b.tokens.length) return 0;
  if (a.joined === b.joined) return 1;
  let shared = 0;
  for (const w of a.set) if (b.set.has(w)) shared++;
  return shared / Math.max(a.set.size, b.set.size);
}

/** 1 when the names are the same once tidied (spaces ignored too), else the share of the longer name's words found in the other. */
export function nameScore(a: string, b: string): number {
  return scorePrepared(prepareName(a), prepareName(b));
}

/** The most receipt-and-entry pairs one comparison will look at. Beyond it the page asks for a smaller year or quarter instead of tying the server up. */
export const MAX_COMPARISONS = 4_000_000;

// ───────────────────────────── comparing ─────────────────────────────

export interface BookCredit {
  receiptId: string;
  receiptNumber: string;
  customerName: string;
  /** YYYY-MM-DD */
  date: string;
  tds: number;
  section: string | null;
}

export type MatchStatus = "matched" | "amount_differs" | "in_books_not_in_26as" | "in_26as_not_in_books";

export const MATCH_STATUSES: { value: MatchStatus; label: string; help: string }[] = [
  { value: "matched", label: "Matched", help: "The same customer, a close date and the same tax amount in your books and in 26AS. Nothing to do." },
  { value: "amount_differs", label: "Amount differs", help: "The customer and date fit, but the tax amount is not the same. Check the receipt against the customer's TDS certificate (Form 16A) and 26AS; only the amount in 26AS counts as credit." },
  { value: "in_books_not_in_26as", label: "In your books, not in 26AS", help: "You recorded this TDS but 26AS does not show it. The customer has not reported or deposited it: ask them." },
  { value: "in_26as_not_in_books", label: "In 26AS, not in your books", help: "26AS shows a credit for you that you have not recorded. Find the receipt, or the invoice it belongs to." },
];

export interface CreditRow {
  status: MatchStatus;
  book: BookCredit | null;
  c26: ParsedCredit | null;
  /** books TDS − 26AS credit, when both sides exist. */
  difference: number | null;
  /** Days between the two dates, when both sides exist. */
  daysApart: number | null;
  /** Short plain notes for this row (section differs, deposited less than deducted). */
  notes: string[];
}

export interface Reconciliation {
  rows: CreditRow[];
  totals: {
    booksTotal: number;
    credit26asTotal: number;
    /** books − 26AS: positive means you have recorded more than 26AS shows. */
    difference: number;
    byStatus: Record<MatchStatus, { count: number; books: number; credit26as: number }>;
  };
}

const dayNumber = (iso: string) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000);

/**
 * One receipt pairs with at most one 26AS entry and the other way round. Candidates are the pairs whose names fit and whose dates are
 * within DATE_WINDOW_DAYS. Pass 1 pairs those with the same tax amount; pass 2 pairs what is left as "amount differs". In each pass the
 * best candidate goes first (best name, then closest amount, then closest date, then input order), so the same input always gives the
 * same answer. It is a greedy pairing, not a global optimum; the page says these are suggestions to check.
 */
export function reconcileCredits(books: BookCredit[], entries: ParsedCredit[]): Reconciliation {
  const bs = [...books].sort((a, b) => a.date.localeCompare(b.date) || a.receiptNumber.localeCompare(b.receiptNumber) || a.receiptId.localeCompare(b.receiptId));
  const es = entries.map((e, i) => ({ e, i }));
  interface Cand { bi: number; ei: number; score: number; amt: number; days: number }
  const cands: Cand[] = [];
  if (bs.length * es.length > MAX_COMPARISONS) throw new Error("Too many receipts and 26AS rows to compare at once. Upload one financial year at a time.");
  const eName = entries.map((e) => prepareName(e.deductorName));
  const eDay = entries.map((e) => dayNumber(e.date));
  bs.forEach((b, bi) => {
    const bName = prepareName(b.customerName);
    const bDay = dayNumber(b.date);
    for (const { i } of es) {
      const e = entries[i];
      const days = Math.abs(bDay - eDay[i]);
      if (days > DATE_WINDOW_DAYS) continue;
      const score = scorePrepared(bName, eName[i]);
      if (score < NAME_OVERLAP) continue;
      cands.push({ bi, ei: i, score, amt: Math.abs(paise(b.tds) - paise(e.credit)), days });
    }
  });
  const order = (x: Cand, y: Cand) => y.score - x.score || x.amt - y.amt || x.days - y.days || x.bi - y.bi || x.ei - y.ei;
  const usedB = new Set<number>(), usedE = new Set<number>();
  const pairs: { c: Cand; status: "matched" | "amount_differs" }[] = [];
  const pass = (pool: Cand[], status: "matched" | "amount_differs") => {
    for (const c of pool.sort(order)) {
      if (usedB.has(c.bi) || usedE.has(c.ei)) continue;
      usedB.add(c.bi); usedE.add(c.ei);
      pairs.push({ c, status });
    }
  };
  const tol = paise(TAX_TOLERANCE);
  pass(cands.filter((c) => c.amt <= tol), "matched");
  pass(cands.filter((c) => !usedB.has(c.bi) && !usedE.has(c.ei)), "amount_differs");

  const rows: CreditRow[] = [];
  const noteFor = (b: BookCredit | null, e: ParsedCredit | null) => {
    const n: string[] = [];
    if (b && e && b.section && e.section && b.section.trim().toUpperCase() !== e.section) n.push(`Section differs: receipt says ${b.section}, 26AS says ${e.section}.`);
    if (e && e.taxDeposited !== null && paise(e.taxDeposited) < paise(e.taxDeducted) - tol) n.push("The customer deducted more than it deposited: only the deposited amount is credit.");
    return n;
  };
  for (const { c, status } of pairs) {
    const b = bs[c.bi], e = entries[c.ei];
    rows.push({ status, book: b, c26: e, difference: rupees(paise(b.tds) - paise(e.credit)), daysApart: c.days, notes: noteFor(b, e) });
  }
  bs.forEach((b, bi) => { if (!usedB.has(bi)) rows.push({ status: "in_books_not_in_26as", book: b, c26: null, difference: null, daysApart: null, notes: noteFor(b, null) }); });
  es.forEach(({ e, i }) => { if (!usedE.has(i)) rows.push({ status: "in_26as_not_in_books", book: null, c26: e, difference: null, daysApart: null, notes: noteFor(null, e) }); });
  const when = (r: CreditRow) => r.book?.date ?? r.c26?.date ?? "";
  rows.sort((a, b) => when(a).localeCompare(when(b)) || (a.book?.receiptNumber ?? "").localeCompare(b.book?.receiptNumber ?? "") || (a.c26?.deductorName ?? "").localeCompare(b.c26?.deductorName ?? ""));

  const byStatus = Object.fromEntries(MATCH_STATUSES.map((s) => [s.value, { count: 0, books: 0, credit26as: 0 }])) as Reconciliation["totals"]["byStatus"];
  let booksP = 0, creditP = 0;
  for (const r of rows) {
    const t = byStatus[r.status];
    t.count++;
    if (r.book) { t.books += paise(r.book.tds); booksP += paise(r.book.tds); }
    if (r.c26) { t.credit26as += paise(r.c26.credit); creditP += paise(r.c26.credit); }
  }
  for (const s of MATCH_STATUSES) { byStatus[s.value].books = rupees(byStatus[s.value].books); byStatus[s.value].credit26as = rupees(byStatus[s.value].credit26as); }
  return { rows, totals: { booksTotal: rupees(booksP), credit26asTotal: rupees(creditP), difference: rupees(booksP - creditP), byStatus } };
}
