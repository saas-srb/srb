import assert from "node:assert/strict";
import { checkReceiptRules, CASH_LIMIT_PER_DAY } from "../src/lib/products/cashflow-ai/receipt-rules";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const base = { method: "bank_transfer", amount: 50000, currency: "INR", receiptDate: "2026-10-27", reference: "UTR123456789" };

t("a bank transfer needs the bank's reference", () => {
  assert.equal(checkReceiptRules(base), null);
  for (const m of ["bank_transfer", "neft", "rtgs", "imps", "upi"]) assert.ok(checkReceiptRules({ ...base, method: m, reference: "" })?.includes("bank's reference"), m);
  assert.ok(checkReceiptRules({ ...base, reference: "12" })?.includes("at least 6"));
});

t("cash: the section 269ST limit counts everything received from that customer that day", () => {
  assert.equal(CASH_LIMIT_PER_DAY, 200000);
  const cash = { ...base, method: "cash", reference: null };
  assert.equal(checkReceiptRules({ ...cash, amount: 199999 }), null);
  assert.ok(checkReceiptRules({ ...cash, amount: 200000 })?.includes("269ST"));
  assert.ok(checkReceiptRules({ ...cash, amount: 100000, cashToday: 100000 })?.includes("already been received"));
  assert.equal(checkReceiptRules({ ...cash, amount: 150000, cashToday: 40000 }), null);
  assert.equal(checkReceiptRules({ ...cash, amount: 500000, currency: "USD" }), null, "the limit is for rupees");
});

t("a cheque needs its number, bank and date, and must still be valid", () => {
  const chq = { ...base, method: "cheque", reference: null, chequeNumber: "123456", chequeBank: "HDFC Bank", chequeDate: "2026-10-20" };
  assert.equal(checkReceiptRules(chq), null);
  assert.ok(checkReceiptRules({ ...chq, chequeNumber: "12345" })?.includes("six digits"));
  assert.ok(checkReceiptRules({ ...chq, chequeBank: " " })?.includes("bank"));
  assert.ok(checkReceiptRules({ ...chq, chequeDate: null })?.includes("date"));
  assert.ok(checkReceiptRules({ ...chq, chequeDate: "2026-06-01" })?.includes("three months"), "stale cheque");
  assert.equal(checkReceiptRules({ ...chq, chequeDate: "2026-11-30" }), null, "a post-dated cheque is fine");
  assert.ok(checkReceiptRules({ ...chq, chequeDate: "2027-03-01" })?.includes("ahead"));
});

console.log("receipt rule tests passed");
