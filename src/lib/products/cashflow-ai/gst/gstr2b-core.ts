/**
 * GSTR-2B, the pure part (no DB): reads the statement of input tax credit that the GST portal drafts for the company, and compares it
 * with the vendor bills in the books.
 *
 * NOT VERIFIED AGAINST A LIVE DOWNLOAD. The JSON layout below follows the publicly documented GSTN shape
 * (data.gstin, data.rtnprd = MMYYYY, data.docdata.b2b[].{ctin, trdnm, inv[].{inum, dt, val, txval, igst, cgst, sgst}} and
 * data.docdata.cdnr[].nt[]). The portal can change it. So the reader is strict: a field it does not understand rejects that row with a
 * counted reason, nothing is guessed, and a heading it does not know is ignored, never mapped. The one assumption made is that a tax
 * head the portal leaves out (for example IGST on an intra-state invoice) is zero, and only when at least one head is present.
 *
 * Nothing here changes a bill or decides who may claim credit: it only shows what is on both sides.
 */
import { gstinError, normalizeGstin } from "@/lib/products/cashflow-ai/gst/core";
import { normalizeInvoiceRef } from "@/lib/products/cashflow-ai/hygiene-core";
import type { InwardRow, ItcDecision } from "@/lib/products/cashflow-ai/gst/core";

/** Largest file taken, and most rows kept. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 20000;
/** Two amounts within this many rupees are "the same" (rounding on the vendor's invoice). */
export const AMOUNT_TOLERANCE = 1;
/** A bill can show up in the GSTR-2B of a later month than its bill date, so the books are searched back this many months too. */
export const EXTRA_MONTHS_BACK = 2;

// ───────────────────────────── money, in paise ─────────────────────────────

const toPaise = (rupees: number) => Math.round((rupees + Number.EPSILON) * 100);
const toRupees = (p: number) => p / 100;

/** A number or a plain numeric string -> paise; anything else (blank, text, NaN, negative, absurdly large) -> null. */
function amountPaise(v: unknown): number | null {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && /^\s*-?\d{1,15}(\.\d{1,4})?\s*$/.test(v.replace(/,/g, ""))) n = Number(v.replace(/,/g, ""));
  else return null;
  if (!Number.isFinite(n) || n < 0 || n > 1e11) return null;
  return toPaise(n);
}

// ───────────────────────────── parsed rows ─────────────────────────────

export interface ParsedRow {
  supplierGstin: string;
  supplierName: string;
  invoiceNumber: string;
  /** YYYY-MM-DD */
  invoiceDate: string;
  /** Invoice value as the supplier reported it; null when the file does not carry it (the simple CSV). */
  invoiceValue: number | null;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  /** The portal's own "ITC available" flag, when present: shown, never used to decide. */
  itcAvailable: boolean | null;
  reverseCharge: boolean | null;
}

export interface ParsedNote {
  supplierGstin: string;
  supplierName: string;
  noteNumber: string;
  noteType: "credit" | "debit" | "unknown";
  invoiceDate: string;
  invoiceValue: number | null;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
}

export const taxOfRow = (r: { igst: number; cgst: number; sgst: number }) => toRupees(toPaise(r.igst) + toPaise(r.cgst) + toPaise(r.sgst));

export interface RejectedReason {
  reason: string;
  count: number;
}

export type ParseResult =
  | { ok: false; error: string }
  | { ok: true; source: "json" | "csv"; rows: ParsedRow[]; notes: ParsedNote[]; rejected: RejectedReason[]; rejectedCount: number };

export interface ParseContext {
  /** The month being matched, YYYY-MM. The JSON's return period must be this month. */
  month: string;
  /** The company's own GSTIN. The JSON must be for it. */
  companyGstin: string;
}

class Rejects {
  private m = new Map<string, number>();
  add(reason: string) { this.m.set(reason, (this.m.get(reason) ?? 0) + 1); }
  get total() { return [...this.m.values()].reduce((a, b) => a + b, 0); }
  list(): RejectedReason[] { return [...this.m.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)); }
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** DD-MM-YYYY (the portal), DD/MM/YYYY or YYYY-MM-DD -> YYYY-MM-DD, only for a date that exists. */
export function parseDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  let y: number, m: number, d: number;
  let mt = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (mt) { d = +mt[1]; m = +mt[2]; y = +mt[3]; }
  else if ((mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else return null;
  if (y < 2017 || y > 2100) return null; // GST began in 2017
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function flag(v: unknown): boolean | null {
  if (v === "Y" || v === "y" || v === true) return true;
  if (v === "N" || v === "n" || v === false) return false;
  return null;
}

interface Amounts { taxable: number; igst: number; cgst: number; sgst: number; value: number | null }

/** txval is required; at least one of igst / cgst / sgst must be present; value (invoice value) is optional. */
function readAmounts(o: Record<string, unknown>, keys: { taxable: string; value: string }): Amounts | string {
  const tx = amountPaise(o[keys.taxable]);
  if (tx === null) return "taxable value missing or not a valid amount";
  const heads: Record<"igst" | "cgst" | "sgst", number> = { igst: 0, cgst: 0, sgst: 0 };
  let present = 0;
  for (const h of ["igst", "cgst", "sgst"] as const) {
    if (o[h] === undefined || o[h] === null) continue;
    const p = amountPaise(o[h]);
    if (p === null) return `${h.toUpperCase()} is not a valid amount`;
    heads[h] = p;
    present++;
  }
  if (present === 0) return "no IGST, CGST or SGST amount";
  let value: number | null = null;
  if (o[keys.value] !== undefined && o[keys.value] !== null) {
    const p = amountPaise(o[keys.value]);
    if (p === null) return "invoice value is not a valid amount";
    value = toRupees(p);
  }
  return { taxable: toRupees(tx), igst: toRupees(heads.igst), cgst: toRupees(heads.cgst), sgst: toRupees(heads.sgst), value };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// ───────────────────────────── JSON ─────────────────────────────

function parseJson(text: string, ctx: ParseContext): ParseResult {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file is not valid JSON. Download the GSTR-2B JSON file again from the GST portal and upload it without opening or editing it." };
  }
  if (!isObj(root)) return { ok: false, error: "This does not look like a GSTR-2B file (expected a JSON object)." };
  const data = isObj(root.data) ? root.data : root;
  const docdata = data.docdata;
  if (!isObj(docdata)) return { ok: false, error: "This does not look like a GSTR-2B file: the document-wise section (docdata) is missing." };

  const fileGstin = normalizeGstin(typeof data.gstin === "string" ? data.gstin : "");
  if (!fileGstin || gstinError(fileGstin) !== null) return { ok: false, error: "The file has no valid GSTIN, so it cannot be checked against your company." };
  if (fileGstin !== normalizeGstin(ctx.companyGstin)) return { ok: false, error: `This GSTR-2B is for GSTIN ${fileGstin}, not your company's GSTIN ${normalizeGstin(ctx.companyGstin)}.` };

  const prd = typeof data.rtnprd === "string" ? /^(0[1-9]|1[0-2])(\d{4})$/.exec(data.rtnprd.trim()) : null;
  if (!prd) return { ok: false, error: "The file does not say which month it is for (return period), so it cannot be used." };
  const filePeriod = `${prd[2]}-${prd[1]}`;
  if (filePeriod !== ctx.month) return { ok: false, error: `This GSTR-2B is for ${filePeriod}, but you are matching ${ctx.month}. Choose the right month or upload the right file.` };

  const rejects = new Rejects();
  const rows: ParsedRow[] = [];
  const notes: ParsedNote[] = [];
  let seen = 0;
  const over = () => ++seen > MAX_ROWS;

  const b2b = docdata.b2b;
  if (b2b !== undefined && !Array.isArray(b2b)) return { ok: false, error: "The invoices section of this file is not in the expected form." };
  for (const sup of (b2b as unknown[] | undefined) ?? []) {
    if (!isObj(sup) || !Array.isArray(sup.inv)) { rejects.add("a supplier block without invoices or in an unexpected form"); continue; }
    const ctin = normalizeGstin(typeof sup.ctin === "string" ? sup.ctin : "");
    for (const inv of sup.inv as unknown[]) {
      if (over()) return { ok: false, error: `Too many rows (more than ${MAX_ROWS}). Please send fewer.` };
      if (!isObj(inv)) { rejects.add("an invoice entry in an unexpected form"); continue; }
      if (!ctin || gstinError(ctin) !== null) { rejects.add("supplier GSTIN missing or invalid"); continue; }
      const number = clean(inv.inum, 40);
      if (!normalizeInvoiceRef(number)) { rejects.add("invoice number missing"); continue; }
      const date = parseDate(inv.dt);
      if (!date) { rejects.add("invoice date missing or not a real date"); continue; }
      const a = readAmounts(inv, { taxable: "txval", value: "val" });
      if (typeof a === "string") { rejects.add(a); continue; }
      rows.push({
        supplierGstin: ctin, supplierName: clean(sup.trdnm, 120), invoiceNumber: number, invoiceDate: date, invoiceValue: a.value,
        taxable: a.taxable, igst: a.igst, cgst: a.cgst, sgst: a.sgst, itcAvailable: flag(inv.itcavl), reverseCharge: flag(inv.rev),
      });
    }
  }

  const cdnr = docdata.cdnr;
  if (cdnr !== undefined && !Array.isArray(cdnr)) return { ok: false, error: "The credit / debit notes section of this file is not in the expected form." };
  for (const sup of (cdnr as unknown[] | undefined) ?? []) {
    if (!isObj(sup) || !Array.isArray(sup.nt)) { rejects.add("a credit note block without notes or in an unexpected form"); continue; }
    const ctin = normalizeGstin(typeof sup.ctin === "string" ? sup.ctin : "");
    for (const nt of sup.nt as unknown[]) {
      if (over()) return { ok: false, error: `Too many rows (more than ${MAX_ROWS}). Please send fewer.` };
      if (!isObj(nt)) { rejects.add("a note entry in an unexpected form"); continue; }
      if (!ctin || gstinError(ctin) !== null) { rejects.add("note: supplier GSTIN missing or invalid"); continue; }
      const number = clean(nt.ntnum, 40);
      if (!normalizeInvoiceRef(number)) { rejects.add("note: number missing"); continue; }
      const date = parseDate(nt.dt);
      if (!date) { rejects.add("note: date missing or not a real date"); continue; }
      const a = readAmounts(nt, { taxable: "txval", value: "val" });
      if (typeof a === "string") { rejects.add(`note: ${a}`); continue; }
      const typ = nt.typ === "C" ? "credit" : nt.typ === "D" ? "debit" : "unknown";
      notes.push({ supplierGstin: ctin, supplierName: clean(sup.trdnm, 120), noteNumber: number, noteType: typ, invoiceDate: date, invoiceValue: a.value, taxable: a.taxable, igst: a.igst, cgst: a.cgst, sgst: a.sgst });
    }
  }

  if (rows.length === 0 && notes.length === 0 && rejects.total === 0) {
    return { ok: false, error: "No invoices were found in this file. If the month really has none, there is nothing to match." };
  }
  if (rows.length === 0 && notes.length === 0) return { ok: false, error: `None of the rows could be read: ${rejects.list().map((r) => `${r.count} × ${r.reason}`).join("; ")}.` };
  return { ok: true, source: "json", rows, notes, rejected: rejects.list(), rejectedCount: rejects.total };
}

// ───────────────────────────── CSV ─────────────────────────────

/** RFC-4180-ish: quotes, doubled quotes, commas / tabs / semicolons as the separator chosen from the header line. */
export function splitCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const first = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = [",", "\t", ";"].map((s) => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) out.push(row);
      row = [];
    } else cell += c;
    if (out.length > MAX_ROWS + 1) break;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) out.push(row);
  return out;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
const COLS: Record<string, string[]> = {
  gstin: ["suppliergstin", "gstinofsupplier", "gstin", "ctin", "gstinuin"],
  name: ["suppliername", "tradelegalname", "tradename", "supplier", "name", "trdnm"],
  number: ["invoicenumber", "invoiceno", "invoicenum", "inum", "invoice"],
  date: ["invoicedate", "date", "dt"],
  value: ["invoicevalue", "invoicevalueinr", "value", "val"],
  taxable: ["taxablevalue", "taxablevalueinr", "taxable", "txval"],
  igst: ["igst", "integratedtax", "integratedtaxinr"],
  cgst: ["cgst", "centraltax", "centraltaxinr"],
  sgst: ["sgst", "statetax", "stateuttax", "stateuttaxinr", "sgstutgst"],
};

function parseCsv(text: string): ParseResult {
  const lines = splitCsv(text);
  if (lines.length < 2) return { ok: false, error: "The CSV needs a header line and at least one row." };
  const header = lines[0].map(norm);
  const idx: Record<string, number> = {};
  for (const [k, names] of Object.entries(COLS)) {
    const i = header.findIndex((h) => names.includes(h));
    if (i >= 0) idx[k] = i;
  }
  const missing = ["gstin", "number", "date", "taxable"].filter((k) => idx[k] === undefined);
  if (missing.length) return { ok: false, error: `The CSV is missing a column: ${missing.map((m) => ({ gstin: "supplier GSTIN", number: "invoice number", date: "invoice date", taxable: "taxable value" })[m]).join(", ")}.` };
  if (idx.igst === undefined && idx.cgst === undefined && idx.sgst === undefined) return { ok: false, error: "The CSV needs at least one of the columns IGST, CGST, SGST." };
  if (lines.length - 1 > MAX_ROWS) return { ok: false, error: `Too many rows (more than ${MAX_ROWS}). Please send fewer.` };

  const rejects = new Rejects();
  const rows: ParsedRow[] = [];
  for (const cells of lines.slice(1)) {
    const get = (k: string) => (idx[k] === undefined ? undefined : (cells[idx[k]] ?? "").trim());
    const gstin = normalizeGstin(get("gstin"));
    if (!gstin || gstinError(gstin) !== null) { rejects.add("supplier GSTIN missing or invalid"); continue; }
    const number = clean(get("number"), 40);
    if (!normalizeInvoiceRef(number)) { rejects.add("invoice number missing"); continue; }
    const date = parseDate(get("date"));
    if (!date) { rejects.add("invoice date missing or not a real date"); continue; }
    // blank tax cells in the CSV count as zero only when the column exists: the CA's tool wrote the row
    const o: Record<string, unknown> = { txval: get("taxable") };
    for (const h of ["igst", "cgst", "sgst"]) if (idx[h] !== undefined) o[h] = get(h) === "" ? "0" : get(h);
    if (idx.value !== undefined && get("value")) o.val = get("value");
    const a = readAmounts(o, { taxable: "txval", value: "val" });
    if (typeof a === "string") { rejects.add(a); continue; }
    rows.push({ supplierGstin: gstin, supplierName: clean(get("name"), 120), invoiceNumber: number, invoiceDate: date, invoiceValue: a.value, taxable: a.taxable, igst: a.igst, cgst: a.cgst, sgst: a.sgst, itcAvailable: null, reverseCharge: null });
  }
  if (rows.length === 0) return { ok: false, error: `None of the rows could be read: ${rejects.list().map((r) => `${r.count} × ${r.reason}`).join("; ")}.` };
  return { ok: true, source: "csv", rows, notes: [], rejected: rejects.list(), rejectedCount: rejects.total };
}

/** Reads an uploaded file's text. JSON if it starts with { or [, otherwise CSV. */
export function parseGstr2b(text: string, ctx: ParseContext): ParseResult {
  if (typeof text !== "string" || text.length === 0) return { ok: false, error: "The file is empty." };
  if (Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES) return { ok: false, error: "The file is larger than 5 MB. A GSTR-2B JSON or CSV is normally much smaller; check it is the right file." };
  if (text.includes("\u0000")) return { ok: false, error: "This is not a text file. Upload the JSON file from the GST portal, or a CSV." };
  const head = text.replace(/^﻿/, "").trimStart()[0];
  return head === "{" || head === "[" ? parseJson(text.replace(/^﻿/, ""), ctx) : parseCsv(text);
}

// ───────────────────────────── matching ─────────────────────────────

export type MatchStatus = "matched" | "amount_differs" | "in_2b_not_in_books" | "in_books_not_in_2b" | "duplicate_in_2b" | "duplicate_in_books";
export const MATCH_STATUSES: { value: MatchStatus; label: string; help: string }[] = [
  { value: "matched", label: "Matched", help: "Same supplier GSTIN and invoice number on both sides, and the amounts agree within the tolerance." },
  { value: "amount_differs", label: "Amount differs", help: "Found on both sides, but the taxable value or the tax is different. Check the bill against the vendor's invoice." },
  { value: "in_2b_not_in_books", label: "In GSTR-2B, not in your books", help: "The vendor reported this invoice to you but no bill with that number is in the books for the months searched. Enter the bill, or ask the vendor if it is yours." },
  { value: "in_books_not_in_2b", label: "In your books, not in GSTR-2B", help: "You have the bill but the vendor has not reported it to you (yet). Ask the vendor whether they have filed their return. Your CA decides what to do about the credit." },
  { value: "duplicate_in_2b", label: "Repeated in GSTR-2B", help: "The same supplier and invoice number appears more than once in GSTR-2B. Only one was matched with your bill." },
  { value: "duplicate_in_books", label: "Repeated in your books", help: "Two bills in the books have the same vendor GSTIN and invoice number. Only one was matched. Check for a double entry." },
];

export interface ReconRow {
  status: MatchStatus;
  key: string;
  twoB: ParsedRow | null;
  book: InwardRow | null;
  /** Books minus GSTR-2B, in rupees; null when one side is missing. */
  taxableDiff: number | null;
  taxDiff: number | null;
}

export type CannotMatchReason = "no_gstin" | "no_invoice_number" | "foreign_currency";
export const CANNOT_MATCH_TEXT: Record<CannotMatchReason, string> = {
  no_gstin: "The vendor has no valid GSTIN on file, so this bill cannot appear in GSTR-2B.",
  no_invoice_number: "The bill has no vendor invoice number, so it cannot be matched.",
  foreign_currency: "The bill is in a foreign currency, which is not compared here.",
};
export interface CannotMatch { book: InwardRow; reason: CannotMatchReason }

export interface StatusTotal { count: number; tax2B: number; taxBooks: number }

export interface Reconciliation {
  rows: ReconRow[];
  cannotMatch: CannotMatch[];
  /** Bills with no GST amount: not expected in GSTR-2B at all. */
  noTaxBills: number;
  totals: Record<MatchStatus, StatusTotal>;
}

const p = (n: number) => toPaise(n);
const bookTaxPaise = (b: InwardRow) => p(b.heads.cgst) + p(b.heads.sgst) + p(b.heads.igst);
const twoBTaxPaise = (r: ParsedRow) => p(r.igst) + p(r.cgst) + p(r.sgst);
const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);

export function matchKey(gstin: string, number: string | null | undefined): string | null {
  const n = normalizeInvoiceRef(number);
  return n ? `${gstin}|${n}` : null;
}

export function reconcile(twoB: ParsedRow[], books: InwardRow[], toleranceRupees = AMOUNT_TOLERANCE): Reconciliation {
  const tol = p(toleranceRupees);
  const cannotMatch: CannotMatch[] = [];
  let noTaxBills = 0;
  const bookByKey = new Map<string, InwardRow[]>();
  for (const b of books) {
    if (bookTaxPaise(b) <= 0) { noTaxBills++; continue; }
    if (b.currency && b.currency !== "INR") { cannotMatch.push({ book: b, reason: "foreign_currency" }); continue; }
    if (!b.vendorGstin) { cannotMatch.push({ book: b, reason: "no_gstin" }); continue; }
    const k = matchKey(b.vendorGstin, b.vendorInvoiceNumber);
    if (!k) { cannotMatch.push({ book: b, reason: "no_invoice_number" }); continue; }
    (bookByKey.get(k) ?? bookByKey.set(k, []).get(k)!).push(b);
  }
  const twoBByKey = new Map<string, ParsedRow[]>();
  for (const r of twoB) {
    const k = matchKey(r.supplierGstin, r.invoiceNumber);
    if (!k) continue; // the parser already rejects these
    (twoBByKey.get(k) ?? twoBByKey.set(k, []).get(k)!).push(r);
  }

  const rows: ReconRow[] = [];
  const keys = [...new Set([...bookByKey.keys(), ...twoBByKey.keys()])].sort(cmp);
  for (const key of keys) {
    // sorted so the result never depends on the order the file or the database returned rows in
    const L2 = (twoBByKey.get(key) ?? []).slice().sort((a, b) => cmp(a.invoiceDate, b.invoiceDate) || cmp(twoBTaxPaise(a), twoBTaxPaise(b)) || cmp(p(a.taxable), p(b.taxable)) || cmp(a.invoiceNumber, b.invoiceNumber));
    const LB = (bookByKey.get(key) ?? []).slice().sort((a, b) => cmp(a.invoiceDate, b.invoiceDate) || cmp(bookTaxPaise(a), bookTaxPaise(b)) || cmp(a.billId, b.billId));

    // one-to-one: closest pairs first (smallest tax difference, then taxable difference, then sorted position)
    const pairs: { i: number; j: number; d: number; dt: number }[] = [];
    L2.forEach((r, i) => LB.forEach((b, j) => pairs.push({ i, j, d: Math.abs(bookTaxPaise(b) - twoBTaxPaise(r)), dt: Math.abs(p(b.taxable) - p(r.taxable)) })));
    pairs.sort((a, b) => a.d - b.d || a.dt - b.dt || a.i - b.i || a.j - b.j);
    const used2 = new Set<number>();
    const usedB = new Set<number>();
    for (const pr of pairs) {
      if (used2.has(pr.i) || usedB.has(pr.j)) continue;
      used2.add(pr.i); usedB.add(pr.j);
      const r = L2[pr.i], b = LB[pr.j];
      const taxDiff = toRupees(bookTaxPaise(b) - twoBTaxPaise(r));
      const taxableDiff = toRupees(p(b.taxable) - p(r.taxable));
      const same = pr.d <= tol && pr.dt <= tol;
      rows.push({ status: same ? "matched" : "amount_differs", key, twoB: r, book: b, taxableDiff, taxDiff });
    }
    L2.forEach((r, i) => { if (!used2.has(i)) rows.push({ status: LB.length > 0 ? "duplicate_in_2b" : "in_2b_not_in_books", key, twoB: r, book: null, taxableDiff: null, taxDiff: null }); });
    LB.forEach((b, j) => { if (!usedB.has(j)) rows.push({ status: L2.length > 0 ? "duplicate_in_books" : "in_books_not_in_2b", key, twoB: null, book: b, taxableDiff: null, taxDiff: null }); });
  }

  const totals = Object.fromEntries(MATCH_STATUSES.map((s) => [s.value, { count: 0, tax2B: 0, taxBooks: 0 }])) as Record<MatchStatus, StatusTotal>;
  const acc: Record<MatchStatus, { t2: number; tb: number }> = Object.fromEntries(MATCH_STATUSES.map((s) => [s.value, { t2: 0, tb: 0 }])) as never;
  for (const r of rows) {
    totals[r.status].count++;
    if (r.twoB) acc[r.status].t2 += twoBTaxPaise(r.twoB);
    if (r.book) acc[r.status].tb += bookTaxPaise(r.book);
  }
  for (const s of MATCH_STATUSES) { totals[s.value].tax2B = toRupees(acc[s.value].t2); totals[s.value].taxBooks = toRupees(acc[s.value].tb); }
  cannotMatch.sort((a, b) => cmp(a.book.invoiceDate, b.book.invoiceDate) || cmp(a.book.billId, b.book.billId));
  return { rows, cannotMatch, noTaxBills, totals };
}

/** Advice only. Never applied automatically. */
export function suggestionFor(r: ReconRow): string | null {
  const needsDecision = (d: ItcDecision) => d === "review";
  if (r.status === "matched" && r.book && needsDecision(r.book.decision)) return "This bill is in GSTR-2B: you can mark it Eligible on the Purchases page, if your CA agrees.";
  if (r.status === "amount_differs") return "Check the bill against the vendor's invoice before claiming the credit.";
  if (r.status === "in_books_not_in_2b" && r.book && r.book.decision === "eligible") return "Marked Eligible, but not in GSTR-2B. Ask your CA before claiming it.";
  return null;
}

/** The months whose bills are compared: the chosen month and the EXTRA_MONTHS_BACK before it. */
export function monthsToCompare(month: string, extraBack = EXTRA_MONTHS_BACK): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  for (let k = extraBack; k >= 0; k--) {
    const d = new Date(Date.UTC(y, m - 1 - k, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
