import assert from "node:assert/strict";
import { AMOUNT_TOLERANCE, monthsToCompare, parseDate, parseGstr2b, reconcile, splitCsv, suggestionFor, type ParsedRow } from "../src/lib/products/cashflow-ai/gst/gstr2b-core";
import type { InwardRow } from "../src/lib/products/cashflow-ai/gst/core";

// Pure tests, no database.
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const ME = "27AAPFU0939F1ZV";
const SUP = "29AAACH7409R1ZX";
const ctx = { month: "2026-10", companyGstin: ME };

const json = (over: Record<string, unknown> = {}, inv: Record<string, unknown>[] = [{ inum: "INV/001", dt: "05-10-2026", val: 1180, txval: 1000, igst: 180, cgst: 0, sgst: 0, itcavl: "Y", rev: "N" }]) =>
  JSON.stringify({ data: { gstin: ME, rtnprd: "102026", version: "1.0", docdata: { b2b: [{ ctin: SUP, trdnm: "Far Vendor", inv }], cdnr: [{ ctin: SUP, trdnm: "Far Vendor", nt: [{ ntnum: "CN1", typ: "C", dt: "20-10-2026", val: 118, txval: 100, igst: 18 }] }] }, ...over } });

const bill = (id: string, ref: string | null, o: Partial<InwardRow> = {}): InwardRow => ({
  billId: id, billNumber: `BILL-${id}`, vendorInvoiceNumber: ref, invoiceDate: "2026-10-05", vendorName: "Far Vendor", vendorGstin: SUP, supply: "inter",
  taxable: 1000, heads: { cgst: 0, sgst: 0, igst: 180 }, invoiceValue: 1180, decision: "review", currency: "INR", flags: [], ...o,
});
const row = (ref: string, o: Partial<ParsedRow> = {}): ParsedRow => ({ supplierGstin: SUP, supplierName: "Far Vendor", invoiceNumber: ref, invoiceDate: "2026-10-05", invoiceValue: 1180, taxable: 1000, igst: 180, cgst: 0, sgst: 0, itcAvailable: null, reverseCharge: null, ...o });

console.log("parser");
t("portal-shaped JSON: invoices and notes kept apart, date turned to YYYY-MM-DD", () => {
  const r = parseGstr2b(json(), ctx);
  assert.ok(r.ok && r.source === "json");
  if (!r.ok) return;
  assert.equal(r.rows.length, 1);
  assert.deepEqual([r.rows[0].supplierGstin, r.rows[0].invoiceNumber, r.rows[0].invoiceDate, r.rows[0].taxable, r.rows[0].igst, r.rows[0].itcAvailable], [SUP, "INV/001", "2026-10-05", 1000, 180, true]);
  assert.equal(r.notes.length, 1);
  assert.equal(r.notes[0].noteType, "credit");
  assert.equal(r.rejectedCount, 0);
});
t("a file for another GSTIN, another month, or without those is refused", () => {
  assert.match((parseGstr2b(json({ gstin: SUP }), ctx) as { error: string }).error, /not your company/);
  assert.match((parseGstr2b(json({ rtnprd: "092026" }), ctx) as { error: string }).error, /2026-09/);
  assert.equal(parseGstr2b(json({ rtnprd: "132026" }), ctx).ok, false);
  assert.equal(parseGstr2b(json({ gstin: "NOTAGSTIN" }), ctx).ok, false);
  assert.equal(parseGstr2b(json({ rtnprd: undefined }), ctx).ok, false);
});
t("hostile and malformed input is refused, not guessed", () => {
  assert.equal(parseGstr2b("", ctx).ok, false);
  assert.equal(parseGstr2b("{not json", ctx).ok, false);
  assert.equal(parseGstr2b("[1,2,3]", ctx).ok, false);
  assert.equal(parseGstr2b("{}", ctx).ok, false);
  assert.equal(parseGstr2b('{"data":{"docdata":"x"}}', ctx).ok, false);
  assert.equal(parseGstr2b("a,b\u0000c\n1,2", ctx).ok, false);
  assert.equal(parseGstr2b("x".repeat(5 * 1024 * 1024 + 1), ctx).ok, false);
  assert.equal(parseGstr2b('{"__proto__":{"x":1},"data":{"gstin":"' + ME + '","rtnprd":"102026","docdata":{"b2b":"nope"}}}', ctx).ok, false);
});
t("bad rows are rejected with a counted reason and the good ones stay", () => {
  const r = parseGstr2b(json({}, [
    { inum: "A1", dt: "05-10-2026", txval: 100, igst: 18 },
    { inum: "", dt: "05-10-2026", txval: 100, igst: 18 },
    { inum: "A3", dt: "31-02-2026", txval: 100, igst: 18 },
    { inum: "A4", dt: "05-10-2026", txval: "abc", igst: 18 },
    { inum: "A5", dt: "05-10-2026", txval: 100 },
    { inum: "A6", dt: "05-10-2026", txval: 100, igst: -5 },
    { inum: "A7", dt: "05-10-2026", txval: 100, igst: 1e30 },
    "garbage",
  ]), ctx);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.rows.length, 1);
  assert.equal(r.rejectedCount, 7);
  assert.ok(r.rejected.some((x) => /no IGST/.test(x.reason)));
});
t("paise-safe amounts: 0.1 + 0.2 style sums stay exact", () => {
  const r = parseGstr2b(json({}, [{ inum: "X", dt: "05-10-2026", txval: "1,000.10", cgst: 0.1, sgst: 0.2 }]), ctx);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.rows[0].taxable, 1000.1); assert.equal(r.rows[0].cgst + 0, 0.1); }
  const rec = reconcile([row("X", { taxable: 1000.1, igst: 0, cgst: 0.1, sgst: 0.2 })], [bill("1", "X", { taxable: 1000.1, heads: { cgst: 0.2, sgst: 0.1, igst: 0 } })]);
  assert.equal(rec.rows[0].status, "matched");
  assert.equal(rec.rows[0].taxDiff, 0);
});
t("dates", () => {
  assert.equal(parseDate("05-10-2026"), "2026-10-05");
  assert.equal(parseDate("5/10/2026"), "2026-10-05");
  assert.equal(parseDate("2026-10-05"), "2026-10-05");
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("1999-01-01"), null);
  assert.equal(parseDate(20261005), null);
});
t("CSV: synonyms, quotes, BOM, blank tax cells; same type as JSON", () => {
  const csv = `﻿Supplier GSTIN,Supplier Name,Invoice Number,Invoice Date,Taxable Value,IGST,CGST,SGST\r\n${SUP},"Far, Vendor ""Ltd""",INV-9,05/10/2026,"1,000.00",180,,\r\n${SUP},X,,05/10/2026,10,1,,\r\nBADGSTIN,X,Z1,05/10/2026,10,1,,\r\n`;
  const r = parseGstr2b(csv, ctx);
  assert.ok(r.ok && r.source === "csv");
  if (!r.ok) return;
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].supplierName, 'Far, Vendor "Ltd"');
  assert.deepEqual([r.rows[0].taxable, r.rows[0].igst, r.rows[0].cgst, r.rows[0].invoiceDate, r.rows[0].invoiceValue], [1000, 180, 0, "2026-10-05", null]);
  assert.equal(r.rejectedCount, 2);
  assert.equal(parseGstr2b("Supplier GSTIN,Invoice Number\nx,y", ctx).ok, false, "missing columns");
  assert.equal(parseGstr2b("Supplier GSTIN,Invoice Number,Invoice Date,Taxable Value\nx,y,z,1", ctx).ok, false, "no tax column");
  assert.deepEqual(splitCsv('a;b\n"x;y";2'), [["a", "b"], ["x;y", "2"]]);
});

console.log("reconciler");
t("exact match; case, spaces, dashes and slashes ignored", () => {
  const rec = reconcile([row("INV/001")], [bill("1", "inv 001")]);
  assert.equal(rec.rows.length, 1);
  assert.equal(rec.rows[0].status, "matched");
});
t("leading zeros are kept: A01 is not A1", () => {
  const rec = reconcile([row("A01")], [bill("1", "A1")]);
  assert.deepEqual(rec.rows.map((r) => r.status).sort(), ["in_2b_not_in_books", "in_books_not_in_2b"]);
});
t("tolerance is inclusive of 1 rupee; beyond it the amount differs, with both sides and the difference", () => {
  assert.equal(AMOUNT_TOLERANCE, 1);
  assert.equal(reconcile([row("A")], [bill("1", "A", { heads: { cgst: 0, sgst: 0, igst: 181 } })]).rows[0].status, "matched");
  const d = reconcile([row("A")], [bill("1", "A", { heads: { cgst: 0, sgst: 0, igst: 190 }, taxable: 1050 })]).rows[0];
  assert.equal(d.status, "amount_differs");
  assert.equal(d.taxDiff, 10);
  assert.equal(d.taxableDiff, 50);
  assert.ok(d.twoB && d.book);
  assert.ok(suggestionFor(d)?.includes("Check the bill"));
});
t("a different supplier GSTIN with the same number does not match", () => {
  const rec = reconcile([row("A")], [bill("1", "A", { vendorGstin: ME })]);
  assert.deepEqual(rec.rows.map((r) => r.status).sort(), ["in_2b_not_in_books", "in_books_not_in_2b"]);
});
t("one-to-one: duplicates in 2B and in books, closest amounts paired, order does not matter", () => {
  const a = [row("D", { igst: 180 }), row("D", { igst: 90, taxable: 500 })];
  const b = [bill("1", "D", { heads: { cgst: 0, sgst: 0, igst: 90 }, taxable: 500 }), bill("2", "D", { heads: { cgst: 0, sgst: 0, igst: 180 } }), bill("3", "D")];
  const r1 = reconcile(a, b);
  const r2 = reconcile([...a].reverse(), [...b].reverse());
  assert.deepEqual(r1.rows, r2.rows);
  assert.equal(r1.totals.matched.count, 2);
  assert.equal(r1.totals.duplicate_in_books.count, 1);
  assert.equal(r1.totals.duplicate_in_2b.count, 0);
  const r3 = reconcile([row("E"), row("E")], [bill("9", "E")]);
  assert.equal(r3.totals.matched.count, 1);
  assert.equal(r3.totals.duplicate_in_2b.count, 1);
  const used = new Set(r1.rows.filter((r) => r.book).map((r) => r.book!.billId));
  assert.equal(used.size, 3, "no bill used twice");
});
t("bills: only those with GST are expected; no GSTIN, no number and foreign currency are listed apart", () => {
  const rec = reconcile([], [
    bill("1", "A"),
    bill("2", "B", { vendorGstin: null, flags: ["gst_without_vendor_gstin"] }),
    bill("3", null),
    bill("4", "C", { heads: { cgst: 0, sgst: 0, igst: 0 } }),
    bill("5", "D", { currency: "USD" }),
  ]);
  assert.equal(rec.totals.in_books_not_in_2b.count, 1);
  assert.deepEqual(rec.cannotMatch.map((c) => c.reason).sort(), ["foreign_currency", "no_gstin", "no_invoice_number"]);
  assert.equal(rec.noTaxBills, 1);
});
t("suggestion is advice only and only for an undecided matched bill", () => {
  const m = reconcile([row("A")], [bill("1", "A")]).rows[0];
  assert.ok(suggestionFor(m)?.includes("mark it Eligible"));
  assert.equal(suggestionFor(reconcile([row("A")], [bill("1", "A", { decision: "eligible" })]).rows[0]), null);
});
t("months compared: the month and the two before, across a year end", () => {
  assert.deepEqual(monthsToCompare("2026-10"), ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(monthsToCompare("2026-01"), ["2025-11", "2025-12", "2026-01"]);
});

console.log("gst 2b pure tests passed");
