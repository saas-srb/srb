import assert from "node:assert/strict";
import { outwardRow, type InvoiceLike } from "../src/lib/products/cashflow-ai/gst/core";
import { hsnSacError, normalizeHsnSac } from "../src/lib/products/cashflow-ai/gst/hsn";
import { csvField, salesCsv, SALES_CSV_HEADER } from "../src/lib/products/cashflow-ai/gst/csv";
import { buildSalesRegister, totalsOf } from "../src/lib/products/cashflow-ai/gst/register";
import { priceLineItems } from "../src/lib/products/cashflow-ai/pricing";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const MH = "27AAPFU0939F1ZV";
const KA = "29AAACH7409R1ZX";
const reg = { gstin: MH, state: "" };
const inv = (o: Partial<InvoiceLike> = {}): InvoiceLike => ({ id: "i1", invoiceNumber: "INV-1", invoiceDate: "2026-10-05", customerId: "c1", customerName: "Acme", currency: "INR", items: [{ description: "Service", taxRate: 18, lineTotal: 1000, taxAmount: 180, hsnSac: "998314" }], discount: 0, subtotal: 1000, taxAmount: 180, totalAmount: 1180, status: "sent", ...o });

t("HSN/SAC: empty is fine, 4/6/8 digits pass, anything else is refused", () => {
  for (const ok of ["", "  ", null, undefined, "1234", "998314", "12345678", " 9983 "]) assert.equal(hsnSacError(ok), null, String(ok));
  for (const bad of ["123", "12345", "1234567", "123456789", "99A314", "9983.1", "-998314"]) assert.ok(hsnSacError(bad), bad);
  assert.equal(normalizeHsnSac(" 9983 "), "9983");
  assert.equal(normalizeHsnSac("  "), null);
});

t("priceLineItems keeps hsnSac and leaves it off lines without one", () => {
  const p = priceLineItems([{ description: "a", quantity: 1, unitPrice: 100, taxRate: 18, hsnSac: " 998314 " }, { description: "b", quantity: 1, unitPrice: 100, taxRate: 18 }], 0);
  assert.equal(p.items[0].hsnSac, "998314");
  assert.ok(!("hsnSac" in p.items[1]));
});

t("CSV quoting: commas, quotes and line breaks are quoted; quotes doubled", () => {
  assert.equal(csvField("plain"), "plain");
  assert.equal(csvField("a,b"), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField("two\nlines"), '"two\nlines"');
});

t("CSV injection: values a spreadsheet would run as a formula get a leading apostrophe", () => {
  for (const v of ["=1+1", "+91 98", "-5", "@SUM(A1)", "\tx", "\rx"]) assert.ok(csvField(v).startsWith("'") || csvField(v).startsWith("\"'"), v);
  assert.equal(csvField("=HYPERLINK(\"http://x\",\"y\")"), '"\'=HYPERLINK(""http://x"",""y"")"');
  assert.equal(csvField("Acme = good"), "Acme = good");
});

t("CSV: one row per invoice per rate line; names that look like formulas are defused; amounts stay numbers", () => {
  const a = outwardRow(inv({ customerName: "=cmd|' /C calc'!A0", items: [
    { description: "x", taxRate: 18, lineTotal: 1000, taxAmount: 180, hsnSac: "998314" },
    { description: "y", taxRate: 5, lineTotal: 400, taxAmount: 20, hsnSac: null },
  ], subtotal: 1400, taxAmount: 200, totalAmount: 1600 }), { gstin: KA, state: null }, reg);
  const lines = salesCsv([a]).trimEnd().split("\r\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], SALES_CSV_HEADER.join(","));
  assert.ok(lines[1].includes("'=cmd"));
  assert.ok(lines[1].startsWith(`${KA},`));
  assert.ok(lines[2].includes(",29-Karnataka,18,1000.00,180.00,0.00,0.00,998314,B2B,INR"));
  assert.ok(lines[1].includes(",5,400.00,20.00,0.00,0.00,,B2B,INR"), "rate lines are in rate order");
});

t("register: B2B / B2C split, totals equal the sum of rows and of the rate-wise lines, no threshold applied", () => {
  const rows = [
    outwardRow(inv({ id: "1", invoiceNumber: "A" }), { gstin: MH, state: null }, reg),
    outwardRow(inv({ id: "2", invoiceNumber: "B", items: [{ description: "x", taxRate: 5, lineTotal: 333.33, taxAmount: 16.67, hsnSac: null }], subtotal: 333.33, taxAmount: 16.67, totalAmount: 350 }), { gstin: null, state: "Maharashtra" }, reg),
    outwardRow(inv({ id: "3", invoiceNumber: "C", totalAmount: 99999999, subtotal: 1000 }), { gstin: "BAD", state: null }, reg),
  ];
  const r = buildSalesRegister(rows);
  assert.deepEqual(r.b2b.map((x) => x.invoiceNumber), ["A"]);
  assert.deepEqual(r.b2c.map((x) => x.invoiceNumber), ["B", "C"], "a huge B2C invoice is still just B2C");
  assert.equal(r.totals.invoices, 3);
  const sum = (f: (x: typeof rows[number]) => number) => Math.round(rows.reduce((n, x) => n + f(x), 0) * 100) / 100;
  assert.equal(r.totals.taxable, sum((x) => x.taxable));
  assert.equal(r.totals.invoiceValue, sum((x) => x.invoiceValue));
  assert.equal(r.totals.heads.cgst, sum((x) => x.heads.cgst));
  assert.equal(Math.round((r.b2bTotals.taxable + r.b2cTotals.taxable) * 100), Math.round(r.totals.taxable * 100));
  assert.equal(Math.round(r.byRate.reduce((n, x) => n + x.taxable, 0) * 100), Math.round(r.totals.taxable * 100));
  assert.deepEqual(r.byRate.map((x) => x.rate), [5, 18]);
  assert.equal(r.attention.length, 2, "B has no HSN, C has a bad GSTIN; A is clean");
  assert.deepEqual(totalsOf([]).heads, { cgst: 0, sgst: 0, igst: 0 });
});

console.log("gst sales tests passed");
