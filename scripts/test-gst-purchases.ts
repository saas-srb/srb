import assert from "node:assert/strict";
import { gstr3bWorking, inwardRow, type BillLike, type InwardRow, type ItcDecision } from "../src/lib/products/cashflow-ai/gst/core";
import { buildPurchasesCsv, csvField, csvText, neutraliseFormula, PURCHASES_CSV_HEADER } from "../src/lib/products/cashflow-ai/gst/purchases-csv";
import { carriesGst, previousMonthOf, summarisePurchases } from "../src/lib/products/cashflow-ai/gst/purchases-core";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const MH = "27AAPFU0939F1ZV";
const KA = "29AAACH7409R1ZX";
const reg = { gstin: MH, state: "" };
const row = (id: string, gst: number, decision?: ItcDecision, o: Partial<BillLike> = {}, gstin: string | null = KA): InwardRow =>
  inwardRow({ id, billNumber: `B-${id}`, vendorInvoiceNumber: `V-${id}`, invoiceDate: "2026-10-06", vendorId: "v", vendorName: "Vendor", currency: "INR", subtotal: 1000, gstAmount: gst, totalAmount: 1000 + gst, status: "pending", ...o }, { gstin, state: null }, decision, reg);

t("text that a spreadsheet would run as a formula gets a leading apostrophe", () => {
  for (const v of ["=1+1", "+91", "-5", "@SUM(A1)", "\tx", "\rx"]) assert.equal(neutraliseFormula(v), `'${v}`);
  assert.equal(neutraliseFormula("INV-1"), "INV-1");
  assert.equal(neutraliseFormula(""), "");
});

t("fields are quoted per RFC 4180", () => {
  assert.equal(csvField("plain"), "plain");
  assert.equal(csvField("a,b"), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField("two\nlines"), '"two\nlines"');
  assert.equal(csvText('=HYPERLINK("x","y")'), `"'=HYPERLINK(""x"",""y"")"`);
  assert.equal(csvText(null), "");
});

t("the CSV has the agreed columns, one line per bill, CRLF endings", () => {
  const rows = [row("a", 180, "eligible"), row("b", 0), row("c", 180, "blocked", { vendorInvoiceNumber: "=cmd|' /C calc'!A0" })];
  const csv = buildPurchasesCsv(rows, new Map([["a", "office, rent"], ["c", "+note"]]));
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 5);
  assert.equal(lines[4], "");
  assert.equal(lines[0], PURCHASES_CSV_HEADER.join(","));
  assert.deepEqual(PURCHASES_CSV_HEADER, ["Vendor GSTIN", "Vendor invoice number", "Date", "Taxable value", "IGST", "CGST", "SGST", "Input credit decision", "Note"]);
  assert.equal(lines[1], `${KA},V-a,2026-10-06,1000.00,180.00,0.00,0.00,Eligible,"office, rent"`);
  assert.equal(lines[2], `${KA},V-b,2026-10-06,1000.00,0.00,0.00,0.00,,`, "no GST: no decision");
  assert.ok(lines[3].includes(`'=cmd|' /C calc'!A0`), "formula in a vendor invoice number is neutralised");
  assert.ok(lines[3].endsWith(",Blocked,'+note"));
});

t("a bill that is not in the register has no vendor GSTIN cell", () => {
  const csv = buildPurchasesCsv([row("x", 180, undefined, {}, null)]);
  assert.ok(csv.split("\r\n")[1].startsWith(",V-x,"));
});

t("summary: buckets by decision, only bills with GST, and add up to the rows", () => {
  const rows = [row("a", 180, "eligible"), row("b", 180, "reverse_charge"), row("c", 118, "blocked"), row("d", 50, "ineligible"), row("e", 18), row("f", 0, "eligible")];
  const s = summarisePurchases(rows);
  assert.equal(s.claimed.count, 2);
  assert.equal(s.claimed.total, 360);
  assert.equal(s.blocked.total, 118);
  assert.equal(s.ineligible.total, 50);
  assert.equal(s.toReview.count, 1);
  assert.equal(s.toReview.total, 18);
  assert.equal(s.billsWithoutGst, 1);
  assert.equal(s.bills, 6);
  assert.equal(Math.round((s.claimed.total + s.blocked.total + s.ineligible.total + s.toReview.total) * 100), Math.round(s.all.total * 100));
  const rowsTotal = rows.reduce((n, r) => n + r.heads.cgst + r.heads.sgst + r.heads.igst, 0);
  assert.ok(Math.abs(rowsTotal - s.all.total) < 0.005);
  // the same numbers gstr3bWorking gives
  const w = gstr3bWorking([], rows);
  assert.deepEqual(s.claimed.heads, w.itc.claimed);
  assert.deepEqual(s.blocked.heads, w.itc.blocked);
  assert.deepEqual(s.toReview.heads, w.itc.toReview);
  assert.equal(s.toReview.count, w.itc.toReviewBills);
});

t("carriesGst and previousMonthOf", () => {
  assert.equal(carriesGst(row("a", 0)), false);
  assert.equal(carriesGst(row("a", 5)), true);
  assert.equal(previousMonthOf("2026-10-28"), "2026-09");
  assert.equal(previousMonthOf("2027-01-02"), "2026-12");
});

console.log("gst purchases tests passed");
