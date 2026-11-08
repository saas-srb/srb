import assert from "node:assert/strict";
import {
  billLines, creditNoteLines, receiptTdsLines, debitNoteLines, invoiceLines, openingLines, openingPayable, openingReceivable, postingDate, signatureOf, taxShare, r2,
  type AccrualAccounts, type PostingLine,
} from "../src/lib/products/cashflow-ai/accrual/core";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const acc = (code: string) => ({ _id: `id_${code}`, code, name: code });
const A: AccrualAccounts = { receivable: acc("1100"), payable: acc("2000"), revenue: acc("4000"), expense: acc("5900"), gstOutput: acc("2210"), gstInput: acc("1500"), tdsPayable: acc("2220"), openingEquity: acc("3100"), tdsReceivable: acc("1510") };
const sum = (l: PostingLine[], side: "debit" | "credit") => r2(l.filter((x) => x.side === side).reduce((n, x) => n + x.amount, 0));
const get = (l: PostingLine[], code: string, side: "debit" | "credit") => l.filter((x) => x.account.code === code && x.side === side).reduce((n, x) => n + x.amount, 0);

t("an invoice debits the receivable for the total and credits revenue and GST output", () => {
  const l = invoiceLines({ totalAmount: 1180, taxAmount: 180 }, A)!;
  assert.equal(get(l, "1100", "debit"), 1180);
  assert.equal(get(l, "4000", "credit"), 1000);
  assert.equal(get(l, "2210", "credit"), 180);
  assert.equal(sum(l, "debit"), sum(l, "credit"));
});

t("an invoice with no tax has no GST line, and one with nothing to post posts nothing", () => {
  const l = invoiceLines({ totalAmount: 500, taxAmount: 0 }, A)!;
  assert.equal(l.length, 2);
  assert.equal(invoiceLines({ totalAmount: 0, taxAmount: 0 }, A), null);
});

t("rupee fractions still balance", () => {
  const l = invoiceLines({ totalAmount: 1180.01, taxAmount: 180.005 }, A);
  if (l) assert.equal(sum(l, "debit"), sum(l, "credit"));
  const m = invoiceLines({ totalAmount: 33.33, taxAmount: 5.08 }, A)!;
  assert.equal(sum(m, "debit"), 33.33);
});

t("a credit note takes back revenue and GST in the invoice's own proportion", () => {
  const l = creditNoteLines(590, { totalAmount: 1180, taxAmount: 180 }, A)!;
  assert.equal(get(l, "1100", "credit"), 590);
  assert.equal(get(l, "2210", "debit"), 90);
  assert.equal(get(l, "4000", "debit"), 500);
  assert.equal(sum(l, "debit"), sum(l, "credit"));
  assert.equal(taxShare(1180, { totalAmount: 1180, taxAmount: 180 }), 180);
  assert.equal(taxShare(100, { totalAmount: 0, taxAmount: 0 }), 0);
  assert.equal(taxShare(100, { totalAmount: 100, taxAmount: 100 }), 100);
});

t("a vendor bill books cost and GST input, and owes the vendor the amount after TDS", () => {
  const l = billLines({ subtotal: 1000, gstAmount: 180, tdsAmount: 100, totalAmount: 1180, netPayable: 1080 }, A)!;
  assert.equal(get(l, "5900", "debit"), 1000);
  assert.equal(get(l, "1500", "debit"), 180);
  assert.equal(get(l, "2000", "credit"), 1080);
  assert.equal(get(l, "2220", "credit"), 100);
  assert.equal(sum(l, "debit"), sum(l, "credit"));
});

t("a bill with no GST and no TDS is two lines", () => {
  assert.equal(billLines({ subtotal: 700, gstAmount: 0, tdsAmount: 0, totalAmount: 700, netPayable: 700 }, A)!.length, 2);
});

t("a bill whose figures do not add up is refused, not posted unbalanced", () => {
  assert.equal(billLines({ subtotal: 1000, gstAmount: 180, tdsAmount: 100, totalAmount: 1180, netPayable: 1000 }, A), null);
});

t("a debit note (an extra charge from the vendor) books cost and GST input and increases the payable", () => {
  const l = debitNoteLines(118, { subtotal: 1000, gstAmount: 180, tdsAmount: 0, totalAmount: 1180, netPayable: 1180 }, A)!;
  assert.equal(get(l, "2000", "credit"), 118);
  assert.equal(get(l, "1500", "debit"), 18);
  assert.equal(get(l, "5900", "debit"), 100);
  assert.equal(sum(l, "debit"), sum(l, "credit"));
});

t("the same posting has the same signature, a different one does not", () => {
  const a = invoiceLines({ totalAmount: 1180, taxAmount: 180 }, A)!;
  const b = invoiceLines({ totalAmount: 1180, taxAmount: 180 }, A)!;
  assert.equal(signatureOf("2026-10-28", a), signatureOf("2026-10-28", b));
  assert.notEqual(signatureOf("2026-10-28", a), signatureOf("2026-10-29", a));
  assert.notEqual(signatureOf("2026-10-28", a), signatureOf("2026-10-28", invoiceLines({ totalAmount: 1181, taxAmount: 180 }, A)!));
});

t("a document is never posted before accrual books started", () => {
  assert.equal(postingDate("2026-03-15", "2026-10-28"), "2026-10-28");
  assert.equal(postingDate("2026-10-28", "2026-10-28"), "2026-10-28");
  assert.equal(postingDate("2026-11-02", "2026-10-28"), "2026-11-02");
});

t("opening receivable counts issued, uncancelled invoices at what is still owed, never below zero", () => {
  assert.equal(
    openingReceivable([
      { status: "sent", totalAmount: 1000, amountPaid: 0, amountCredited: 0 },
      { status: "partially_paid", totalAmount: 1000, amountPaid: 400, amountCredited: 100 },
      { status: "paid", totalAmount: 500, amountPaid: 500, amountCredited: 0 },
      { status: "draft", totalAmount: 9999, amountPaid: 0, amountCredited: 0 },
      { status: "cancelled", totalAmount: 800, amountPaid: 0, amountCredited: 0 },
      { status: "void", totalAmount: 800, amountPaid: 0, amountCredited: 0 },
      { status: "sent", totalAmount: 100, amountPaid: 150, amountCredited: 0 },
    ]),
    1000 + 500
  );
});

t("opening payable is what the bills leave unpaid plus issued debit notes, never below zero per bill", () => {
  assert.equal(
    openingPayable(
      [
        { status: "pending", netPayable: 1080, amountPaid: 0 },
        { status: "partially_paid", netPayable: 1000, amountPaid: 300 },
        { status: "cancelled", netPayable: 5000, amountPaid: 0 },
        { status: "paid", netPayable: 200, amountPaid: 200 },
        { status: "paid", netPayable: 100, amountPaid: 150 },
      ],
      250
    ),
    1080 + 700 + 250
  );
});

t("opening entry balances, and is nothing when there is nothing to bring in", () => {
  const l = openingLines(1500, 700, A)!;
  assert.equal(sum(l, "debit"), 2200);
  assert.equal(sum(l, "debit"), sum(l, "credit"));
  assert.equal(get(l, "1100", "debit"), 1500);
  assert.equal(get(l, "2000", "credit"), 700);
  assert.equal(openingLines(0, 0, A), null);
  assert.equal(openingLines(300, 0, A)!.length, 2);
});

t("TDS a customer deducted becomes a tax credit and settles the receivable", () => {
  const l = receiptTdsLines(100, A)!;
  assert.equal(get(l, "1510", "debit"), 100);
  assert.equal(get(l, "1100", "credit"), 100);
  assert.equal(receiptTdsLines(0, A), null);
});

t("a one-paisa rounding gap between a bill's figures is absorbed; a real gap is refused", () => {
  const l = billLines({ subtotal: 100.01, gstAmount: 18.02, tdsAmount: 10, totalAmount: 118.03, netPayable: 108.02 }, A)!;
  assert.ok(l, "off by a paisa");
  assert.equal(sum(l, "debit"), sum(l, "credit"));
  assert.equal(billLines({ subtotal: 100, gstAmount: 18, tdsAmount: 10, totalAmount: 118, netPayable: 100 }, A), null, "ten rupees apart is not rounding");
});

console.log("accrual core tests passed");
