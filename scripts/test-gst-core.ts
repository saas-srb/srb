import assert from "node:assert/strict";
import { creditNoteAdjustment, debitNoteAsInward, gstr3bWorking, headsFor, inwardRow, outwardRow, supplierState, countsForGst, isMonth, type BillLike, type InvoiceLike } from "../src/lib/products/cashflow-ai/gst/core";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
// valid GSTINs (check digit verified by the platform helper): Maharashtra and Karnataka
const MH = "27AAPFU0939F1ZV";
const KA = "29AAACH7409R1ZX";
const reg = { gstin: MH, state: "" };
const inv = (o: Partial<InvoiceLike> = {}): InvoiceLike => ({ id: "i1", invoiceNumber: "INV-1", invoiceDate: "2026-10-05", customerId: "c1", customerName: "Acme", currency: "INR", items: [{ description: "Service", taxRate: 18, lineTotal: 1000, taxAmount: 180, hsnSac: "998314" }], discount: 0, subtotal: 1000, taxAmount: 180, totalAmount: 1180, status: "sent", ...o });
const bill = (o: Partial<BillLike> = {}): BillLike => ({ id: "b1", billNumber: "BILL-1", vendorInvoiceNumber: "V-1", invoiceDate: "2026-10-06", vendorId: "v1", vendorName: "Beta", currency: "INR", subtotal: 1000, gstAmount: 180, totalAmount: 1180, status: "pending", ...o });

t("the supplier's state comes from its GSTIN, else its stated state", () => {
  assert.equal(supplierState(reg).code, "27");
  assert.equal(supplierState({ gstin: "", state: "Karnataka" }).code, "29");
  assert.equal(supplierState({ gstin: "", state: "" }).code, null);
});

t("a sale to a customer in the same state is CGST + SGST halves, to another state IGST", () => {
  const same = outwardRow(inv(), { gstin: MH, state: null }, reg);
  assert.equal(same.supply, "intra");
  assert.deepEqual(same.heads, { cgst: 90, sgst: 90, igst: 0 });
  const other = outwardRow(inv(), { gstin: KA, state: null }, reg);
  assert.equal(other.supply, "inter");
  assert.deepEqual(other.heads, { cgst: 0, sgst: 0, igst: 180 });
  assert.equal(other.kind, "b2b");
  assert.equal(other.placeOfSupply!.code, "29");
});

t("an odd paisa goes to SGST so the halves add back to the tax", () => {
  const h = headsFor(0.05, "intra");
  const round = (n: number) => Math.round(n * 100) / 100;
  assert.equal(round(h.cgst + h.sgst), 0.05);
  assert.equal(round(headsFor(100.01, "intra").cgst + headsFor(100.01, "intra").sgst), 100.01);
  assert.ok(headsFor(100.01, "intra").sgst >= headsFor(100.01, "intra").cgst, "SGST takes the odd paisa");
});

t("a customer with no GSTIN is B2C; no state either means the place of supply is unknown and is flagged", () => {
  const r = outwardRow(inv(), { gstin: null, state: null }, reg);
  assert.equal(r.kind, "b2c");
  assert.ok(r.flags.includes("place_of_supply_unknown"));
  assert.equal(r.supply, "intra", "falls back to the supplier's own state");
  const known = outwardRow(inv(), { gstin: null, state: "Karnataka" }, reg);
  assert.equal(known.supply, "inter");
  assert.ok(!known.flags.includes("place_of_supply_unknown"));
});

t("an invalid GSTIN is not trusted and is flagged", () => {
  const r = outwardRow(inv(), { gstin: "27AAPFU0939F1ZZ", state: null }, reg);
  assert.equal(r.recipientGstin, null);
  assert.equal(r.kind, "b2c");
  assert.ok(r.flags.includes("recipient_gstin_invalid"));
});

t("missing HSN / SAC and foreign currency are flagged, not guessed", () => {
  const r = outwardRow(inv({ currency: "USD", items: [{ description: "x", taxRate: 18, lineTotal: 1000, taxAmount: 180 }] }), { gstin: MH, state: null }, reg);
  assert.ok(r.flags.includes("hsn_sac_missing") && r.flags.includes("foreign_currency"));
});

t("discount is spread over the lines before the taxable value is worked out, and rates stay apart", () => {
  const r = outwardRow(
    inv({ discount: 200, subtotal: 2000, taxAmount: 144 + 0, totalAmount: 1944, items: [
      { description: "a", taxRate: 18, lineTotal: 1000, taxAmount: 90, hsnSac: "9983" },
      { description: "b", taxRate: 5, lineTotal: 1000, taxAmount: 45, hsnSac: "9984" },
    ] }),
    { gstin: MH, state: null },
    reg
  );
  assert.equal(r.taxable, 1800);
  assert.deepEqual(r.lines.map((l) => [l.rate, l.taxable]), [[5, 900], [18, 900]]);
});

t("only issued, uncancelled invoices count", () => {
  assert.ok(countsForGst("sent") && countsForGst("paid") && countsForGst("overdue"));
  assert.ok(!countsForGst("draft") && !countsForGst("cancelled") && !countsForGst("void"));
});

t("a purchase from a vendor in the same state is CGST + SGST, from another state IGST", () => {
  assert.deepEqual(inwardRow(bill(), { gstin: MH, state: null }, "eligible", reg).heads, { cgst: 90, sgst: 90, igst: 0 });
  assert.deepEqual(inwardRow(bill(), { gstin: KA, state: null }, "eligible", reg).heads, { cgst: 0, sgst: 0, igst: 180 });
});

t("tax on a bill from a vendor with no valid GSTIN is flagged; an undecided bill is 'review'", () => {
  const r = inwardRow(bill(), { gstin: null, state: null }, undefined, reg);
  assert.equal(r.decision, "review");
  assert.ok(r.flags.includes("vendor_gstin_missing") && r.flags.includes("gst_without_vendor_gstin"));
});

t("GSTR-3B working: liability, claimed credit only for decided bills, no set-off across heads", () => {
  const out = [outwardRow(inv(), { gstin: MH, state: null }, reg), outwardRow(inv({ id: "i2", invoiceNumber: "INV-2" }), { gstin: KA, state: null }, reg)];
  const inw = [
    inwardRow(bill({ id: "b1" }), { gstin: MH, state: null }, "eligible", reg),
    inwardRow(bill({ id: "b2" }), { gstin: MH, state: null }, "blocked", reg),
    inwardRow(bill({ id: "b3" }), { gstin: KA, state: null }, "review", reg),
    inwardRow(bill({ id: "b4", gstAmount: 100, subtotal: 500, totalAmount: 600 }), { gstin: KA, state: null }, "reverse_charge", reg),
  ];
  const w = gstr3bWorking(out, inw);
  assert.equal(w.outward.taxable, 2000);
  assert.deepEqual(w.outward.heads, { cgst: 90, sgst: 90, igst: 180 });
  assert.deepEqual(w.itc.claimed, { cgst: 90, sgst: 90, igst: 100 });
  assert.deepEqual(w.itc.blocked, { cgst: 90, sgst: 90, igst: 0 });
  assert.deepEqual(w.itc.toReview, { cgst: 0, sgst: 0, igst: 180 });
  assert.equal(w.itc.toReviewBills, 1);
  assert.deepEqual(w.netByHead, { cgst: 0, sgst: 0, igst: 180 }, "reverse charge is added to what is owed (paid in cash) and also counted as credit");
  assert.deepEqual(w.reverseChargeLiability, { cgst: 0, sgst: 0, igst: 100 });
  assert.deepEqual(w.outward.byRate.map((r) => r.rate), [18]);
});

t("months are checked as YYYY-MM", () => {
  assert.ok(isMonth("2026-10") && isMonth("2026-01") && !isMonth("2026-13") && !isMonth("2026-1") && !isMonth("26-10"));
});

t("CGST and SGST are split once per rate, so three lines with an odd paisa still differ by at most one paisa", () => {
  const items = [1, 2, 3].map((n) => ({ description: `l${n}`, taxRate: 18, lineTotal: 5.62, taxAmount: 1.01, hsnSac: "9983" }));
  const r = outwardRow(inv({ items, subtotal: 16.86, taxAmount: 3.03, totalAmount: 19.89 }), { gstin: MH, state: null }, reg);
  assert.ok(Math.abs(r.heads.cgst - r.heads.sgst) <= 0.01 + 1e-9, `cgst ${r.heads.cgst} sgst ${r.heads.sgst}`);
  assert.equal(Math.round((r.heads.cgst + r.heads.sgst) * 100), 303);
  assert.equal(r.taxable, 16.86, "taxable is exactly subtotal less discount");
});

t("the taxable value of an invoice is exactly subtotal less discount even when lines round differently", () => {
  const r = outwardRow(inv({ discount: 0.01, subtotal: 30, taxAmount: 0, totalAmount: 29.99, items: [1, 2, 3].map((n) => ({ description: `l${n}`, taxRate: 0, lineTotal: 10, taxAmount: 0, hsnSac: "9983" })) }), { gstin: MH, state: null }, reg);
  assert.equal(r.taxable, 29.99);
});

t("an unknown company state and an unknown vendor state are flagged, not silent", () => {
  const o = outwardRow(inv(), { gstin: null, state: null }, { gstin: "", state: "" });
  assert.ok(o.flags.includes("company_state_unknown"));
  const i = inwardRow(bill(), { gstin: null, state: null }, "eligible", reg);
  assert.ok(i.flags.includes("vendor_state_unknown"));
});

t("a credit note is spread over the invoice's rate lines, adds back to the note and comes off the month's sales and tax", () => {
  const two = outwardRow(
    inv({ subtotal: 2000, taxAmount: 180, totalAmount: 2180, items: [
      { description: "a", taxRate: 18, lineTotal: 1000, taxAmount: 180, hsnSac: "9983" },
      { description: "b", taxRate: 0, lineTotal: 1000, taxAmount: 0, hsnSac: "9984" },
    ] }),
    { gstin: MH, state: null },
    reg
  );
  const adj = creditNoteAdjustment({ id: "cn1", number: "CN-1", issuedOn: "2026-10-20", amount: 1180 }, two)!;
  assert.equal(Math.round((adj.taxable + adj.heads.cgst + adj.heads.sgst + adj.heads.igst) * 100), 118000);
  assert.ok(adj.heads.cgst + adj.heads.sgst > 0);
  const w = gstr3bWorking([two], [], { creditNotes: [adj] });
  assert.equal(Math.round(w.outward.heads.cgst * 100 + w.outward.heads.sgst * 100), Math.round((two.heads.cgst + two.heads.sgst - adj.heads.cgst - adj.heads.sgst) * 100));
  assert.equal(w.outward.creditNotes.count, 1);
  assert.equal(creditNoteAdjustment({ id: "x", number: "x", issuedOn: "2026-10-20", amount: 0 }, two), null);
});

t("a debit note is an extra purchase with the same tax mix and credit decision as its bill", () => {
  const b = inwardRow(bill(), { gstin: MH, state: null }, "eligible", reg);
  const dn = debitNoteAsInward({ id: "d1", number: "DN-1", issuedOn: "2026-10-22", amount: 118 }, b)!;
  assert.equal(dn.decision, "eligible");
  assert.deepEqual(dn.heads, { cgst: 9, sgst: 9, igst: 0 });
  const w = gstr3bWorking([], [b], { debitNotes: [dn] });
  assert.deepEqual(w.itc.claimed, { cgst: 99, sgst: 99, igst: 0 });
});

console.log("gst core tests passed");
