import assert from "node:assert/strict";
import { findDuplicateBills, normalizeInvoiceRef, type BillLite } from "../src/lib/products/cashflow-ai/hygiene-core";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const bill = (id: string, o: Partial<BillLite> = {}): BillLite => ({ id, vendorId: "v1", vendorName: "Acme Supplies", vendorInvoiceNumber: "INV-001", invoiceDate: "2026-10-01", totalAmount: 1180, status: "pending", ...o });

t("invoice numbers are compared without spaces, dashes, slashes or case, but zeros count", () => {
  assert.equal(normalizeInvoiceRef("INV-001"), normalizeInvoiceRef(" inv/001 "));
  assert.notEqual(normalizeInvoiceRef("A01"), normalizeInvoiceRef("A1"));
  assert.equal(normalizeInvoiceRef("  "), null);
  assert.equal(normalizeInvoiceRef(null), null);
});

t("the same vendor and invoice number twice is an exact duplicate", () => {
  const g = findDuplicateBills([bill("a"), bill("b", { vendorInvoiceNumber: "inv 001", totalAmount: 99, invoiceDate: "2026-10-05" })]);
  assert.equal(g.length, 1);
  assert.equal(g[0].kind, "exact");
});

t("another vendor's bill with the same number is not a duplicate", () => {
  assert.equal(findDuplicateBills([bill("a"), bill("b", { vendorId: "v2", vendorName: "Other", totalAmount: 5 })]).length, 0);
});

t("same vendor, date and amount under a different number is only a possible duplicate", () => {
  const g = findDuplicateBills([bill("a"), bill("b", { vendorInvoiceNumber: "INV-002" })]);
  assert.equal(g.length, 1);
  assert.equal(g[0].kind, "possible");
});

t("an exact duplicate with the same date and amount is reported once, not twice", () => {
  assert.equal(findDuplicateBills([bill("a"), bill("b")]).length, 1);
});

t("cancelled bills never count", () => {
  assert.equal(findDuplicateBills([bill("a"), bill("b", { status: "cancelled" })]).length, 0);
});

t("bills with no number are only compared by vendor, date and amount", () => {
  assert.equal(findDuplicateBills([bill("a", { vendorInvoiceNumber: null }), bill("b", { vendorInvoiceNumber: null, totalAmount: 5 })]).length, 0);
  assert.equal(findDuplicateBills([bill("a", { vendorInvoiceNumber: null }), bill("b", { vendorInvoiceNumber: null })])[0].kind, "possible");
});

console.log("hygiene tests passed");
