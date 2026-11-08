import assert from "node:assert/strict";
import { DATE_WINDOW_DAYS, MAX_ROWS, NAME_OVERLAP, nameScore, nameTokens, parseTdsCredits, reconcileCredits, templateCsv, TAX_TOLERANCE, type BookCredit, type ParsedCredit } from "../src/lib/products/cashflow-ai/tds/credits-core";

// Pure tests, no database.
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const H = "Deductor Name,Deductor TAN,Section,Transaction Date,Amount Paid or Credited,Tax Deducted,Tax Deposited";
const ok = (text: string, fy = "2026-27") => { const r = parseTdsCredits(text, { fy }); assert.ok(r.ok, JSON.stringify(r)); return r.ok ? r : (undefined as never); };

console.log("parser");
t("good file", () => {
  const r = ok(`${H}\nAcme Pvt Ltd,ABCD12345E,194J,15/06/2026,100000,10000,10000\nBeta,,194C,2026-07-01,"1,00,000.50","2,000.50",\n`);
  assert.equal(r.rows.length, 2);
  assert.deepEqual([r.rows[0].date, r.rows[0].tan, r.rows[0].credit], ["2026-06-15", "ABCD12345E", 10000]);
  assert.deepEqual([r.rows[1].amountPaid, r.rows[1].taxDeducted, r.rows[1].taxDeposited, r.rows[1].credit], [100000.5, 2000.5, null, 2000.5]);
});
t("quoted cells, commas and doubled quotes in a name; BOM; CRLF; synonyms", () => {
  const r = ok(`﻿Name of Deductor,Date of Booking,TDS Deducted\r\n"Acme, ""The"" Co",31/03/2027,500\r\n`);
  assert.equal(r.rows[0].deductorName, 'Acme, "The" Co');
  assert.equal(r.rows[0].date, "2027-03-31");
});
t("Indian dates and FY edges: 1 April in, 31 March in, 31 March of the year before out", () => {
  const r = ok(`${H}\nA,,,01/04/2026,,10,\nA,,,31/03/2027,,10,\nA,,,31/03/2026,,10,\nA,,,01/04/2027,,10,\n`);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rejected, [{ reason: "transaction date is outside 2026-27", count: 2 }]);
});
t("the empty template has headings only and no rows", () => {
  const r = parseTdsCredits(templateCsv(), { fy: "2026-27" });
  assert.equal(r.ok, false);
  assert.ok(templateCsv().startsWith("Deductor name,Deductor TAN"));
});
t("rejected rows are counted by reason, never guessed", () => {
  const r = ok(`${H}\nOk,,,10/05/2026,,10,\n,,,10/05/2026,,10,\nNoDate,,,31/02/2026,,10,\nBadAmt,,,10/05/2026,,ten,\nNeg,,,10/05/2026,,-5,\nBadTan,abc,,10/05/2026,,10,\nBadDep,,,10/05/2026,,10,x\n`);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rejectedCount, 6);
  assert.equal(r.rejected.reduce((n, x) => n + x.count, 0), 6);
});
t("hostile input is refused with a reason", () => {
  const bad = ["", "   ", "{\"a\":1}", "%PDF-1.4 x", "<html>", "a\u0000b,c\n1,2", "Name,Date\nA,10/05/2026\n", `${H}\n`, "x".repeat(5 * 1024 * 1024 + 1), `${H}\n` + "A,,,10/05/2026,,10,\n".repeat(MAX_ROWS + 1)];
  for (const b of bad) assert.equal(parseTdsCredits(b, { fy: "2026-27" }).ok, false);
  assert.equal(parseTdsCredits(`${H}\nA,,,10/05/2026,,10,\n`, { fy: "2026-28" }).ok, false);
  const big = parseTdsCredits(`${H}\n` + "A,,,10/05/2026,,10,\n".repeat(MAX_ROWS), { fy: "2026-27" });
  assert.ok(big.ok && big.rows.length === MAX_ROWS);
});
t("formula-looking and control characters in names are kept as text, trimmed", () => {
  const r = ok(`${H}\n"=cmd|' /C calc'!A0\u0007",,,10/05/2026,,10,\n`);
  assert.ok(!/\u0007/.test(r.rows[0].deductorName));
});

console.log("names");
t("normalisation", () => {
  assert.deepEqual(nameTokens("M/s. Acme Pvt. Ltd."), ["acme"]);
  assert.equal(nameScore("ACME  PRIVATE LIMITED", "acme pvt ltd"), 1);
  assert.equal(nameScore("Info Sys", "Infosys Ltd"), 1);
  assert.equal(nameScore("Acme Traders", "Acme Industries"), 0.5);
  assert.ok(nameScore("Acme Traders", "Zenith Traders") < NAME_OVERLAP, "one shared generic word is not enough");
  assert.ok(nameScore("Tata Consultancy Services", "Tata Consultancy Services Ltd") >= NAME_OVERLAP);
  assert.ok(nameScore("Tata Consultancy Services", "Tata Consultancy") >= NAME_OVERLAP);
  assert.equal(nameScore("Pvt Ltd", "Pvt Ltd"), 1);
  assert.equal(nameScore("", "Acme"), 0);
});

console.log("reconciler");
const book = (id: string, name: string, date: string, tds: number, section: string | null = null): BookCredit => ({ receiptId: id, receiptNumber: `R-${id}`, customerName: name, date, tds, section });
const e26 = (name: string, date: string, ded: number, o: Partial<ParsedCredit> = {}): ParsedCredit => ({ deductorName: name, tan: null, section: null, date, amountPaid: null, taxDeducted: ded, taxDeposited: null, credit: ded, ...o });
const statuses = (r: ReturnType<typeof reconcileCredits>) => r.rows.map((x) => `${x.status}:${x.book?.receiptId ?? "-"}:${x.c26?.date ?? "-"}`);

t("matched, differs, in books only, in 26AS only, with totals", () => {
  const r = reconcileCredits(
    [book("1", "Acme Pvt Ltd", "2026-05-10", 1000), book("2", "Beta Ltd", "2026-06-10", 500), book("3", "Gamma", "2026-07-10", 300)],
    [e26("ACME PRIVATE LIMITED", "2026-05-20", 1000), e26("Beta Limited", "2026-06-12", 450), e26("Delta", "2026-08-01", 200)]
  );
  assert.deepEqual(r.rows.map((x) => x.status), ["matched", "amount_differs", "in_books_not_in_26as", "in_26as_not_in_books"]);
  assert.equal(r.totals.booksTotal, 1800);
  assert.equal(r.totals.credit26asTotal, 1650);
  assert.equal(r.totals.difference, 150);
  assert.equal(r.totals.byStatus.amount_differs.count, 1);
});
t("one-to-one: two near-identical receipts and two identical 26AS rows pair once each; a third receipt is left over", () => {
  const r = reconcileCredits(
    [book("a", "Acme", "2026-05-10", 1000), book("b", "Acme", "2026-05-10", 1000), book("c", "Acme", "2026-05-10", 1000)],
    [e26("Acme", "2026-05-12", 1000), e26("Acme", "2026-05-12", 1000)]
  );
  assert.equal(r.rows.filter((x) => x.status === "matched").length, 2);
  assert.equal(r.rows.filter((x) => x.status === "in_books_not_in_26as").length, 1);
  assert.equal(new Set(r.rows.filter((x) => x.book && x.c26).map((x) => x.book!.receiptId)).size, 2);
});
t("the exact-amount pair wins over a closer date with a different amount", () => {
  const r = reconcileCredits([book("a", "Acme", "2026-05-10", 1000)], [e26("Acme", "2026-05-10", 900), e26("Acme", "2026-06-20", 1000)]);
  assert.deepEqual(statuses(r).sort(), ["in_26as_not_in_books:-:2026-05-10", "matched:a:2026-06-20"]);
});
t("deterministic: input order does not change the result", () => {
  const bs = [book("a", "Acme", "2026-05-10", 1000), book("b", "Acme", "2026-05-11", 1000)];
  const es = [e26("Acme", "2026-05-10", 1000), e26("Acme", "2026-05-11", 1000)];
  const x = reconcileCredits(bs, es), y = reconcileCredits([...bs].reverse(), [...es].reverse());
  assert.deepEqual(statuses(x), statuses(y));
});
t("tax tolerance is inclusive: 1.00 matches, 1.01 differs", () => {
  assert.equal(TAX_TOLERANCE, 1);
  assert.equal(reconcileCredits([book("a", "Acme", "2026-05-10", 1000)], [e26("Acme", "2026-05-10", 1001)]).rows[0].status, "matched");
  assert.equal(reconcileCredits([book("a", "Acme", "2026-05-10", 1000)], [e26("Acme", "2026-05-10", 1001.01)]).rows[0].status, "amount_differs");
  assert.equal(reconcileCredits([book("a", "Acme", "2026-05-10", 1000)], [e26("Acme", "2026-05-10", 999)]).rows[0].status, "matched");
});
t("date window is inclusive: 45 days pairs, 46 does not", () => {
  assert.equal(DATE_WINDOW_DAYS, 45);
  assert.equal(reconcileCredits([book("a", "Acme", "2026-05-01", 1000)], [e26("Acme", "2026-06-15", 1000)]).rows[0].status, "matched");
  assert.equal(reconcileCredits([book("a", "Acme", "2026-05-01", 1000)], [e26("Acme", "2026-06-16", 1000)]).rows.length, 2);
});
t("FY edge dates: 31 March receipt pairs with a 1 April entry only if the caller gives both (the FY filter is the loader's and parser's job)", () => {
  assert.equal(reconcileCredits([book("a", "Acme", "2027-03-31", 1000)], [e26("Acme", "2027-03-30", 1000)]).rows[0].status, "matched");
  assert.equal(reconcileCredits([book("a", "Acme", "2026-04-01", 1000)], [e26("Acme", "2026-04-01", 1000)]).rows[0].status, "matched");
});
t("different customers never pair; 26AS credit uses deposited when given and notes a short deposit; section difference noted", () => {
  assert.equal(reconcileCredits([book("a", "Acme", "2026-05-10", 1000)], [e26("Zenith", "2026-05-10", 1000)]).rows.length, 2);
  const r = reconcileCredits([book("a", "Acme", "2026-05-10", 1000, "194C")], [e26("Acme", "2026-05-10", 1000, { taxDeposited: 600, credit: 600, section: "194J" })]);
  assert.equal(r.rows[0].status, "amount_differs");
  assert.equal(r.rows[0].difference, 400);
  assert.equal(r.rows[0].notes.length, 2);
});
t("empty sides", () => {
  assert.equal(reconcileCredits([], []).rows.length, 0);
  assert.equal(reconcileCredits([book("a", "Acme", "2026-05-10", 5)], []).totals.difference, 5);
});

console.log("tds credits tests passed");
