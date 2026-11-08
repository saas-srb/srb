import assert from "node:assert/strict";
import { AGEING_EDGES, AGEING_LABELS, OLD_ITEM_DAYS, ageingBucketIndex, analyseParty, balanceAt, buildAgeing, buildStatement, compareWithConfirmation, daysPastDue, findFlags, isYmd, signedEffect, type PartyDoc } from "../src/lib/products/cashflow-ai/party-recon/core";
import { agingBucketFor, AGING_BUCKET_LABELS } from "../src/lib/products/cashflow-ai/constants";

// Pure core: no database.
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const doc = (o: Partial<PartyDoc> & Pick<PartyDoc, "id" | "type" | "date" | "amount">): PartyDoc => ({ number: o.id.toUpperCase(), dueDate: null, vendorRef: null, reference: null, currency: "INR", allocations: [], unallocated: 0, recordedSettled: null, ...o });

const customer: PartyDoc[] = [
  doc({ id: "a", type: "invoice", date: "2026-01-10", dueDate: "2026-02-09", amount: 10000 }),
  doc({ id: "b", type: "invoice", date: "2026-03-01", dueDate: "2026-03-31", amount: 5000 }),
  doc({ id: "r1", type: "receipt", date: "2026-02-15", amount: 4000, allocations: [{ docId: "a", amount: 4000 }] }),
  doc({ id: "cn", type: "credit_note", date: "2026-02-20", amount: 1000, allocations: [{ docId: "a", amount: 1000 }] }),
  doc({ id: "r2", type: "receipt", date: "2026-03-10", amount: 6000, allocations: [{ docId: "a", amount: 5000 }], unallocated: 1000 }),
  doc({ id: "rf", type: "refund", date: "2026-04-01", amount: 500 }),
];

t("bucket edges are the constants and agree with the app-wide ageing buckets", () => {
  assert.deepEqual([...AGEING_EDGES], [0, 30, 60, 90]);
  assert.deepEqual([...AGEING_LABELS], [...AGING_BUCKET_LABELS].map((l, i) => (i === 0 ? "Not yet due" : l === "90+ days" ? "Over 90 days" : l)));
  for (const d of [-5, 0, 1, 30, 31, 60, 61, 90, 91, 400]) assert.equal(AGEING_LABELS[ageingBucketIndex(d)] === "Not yet due" ? "Current" : AGEING_LABELS[ageingBucketIndex(d)].replace("Over 90 days", "90+ days"), agingBucketFor(d), `day ${d}`);
});

t("ageing edges: due today is not yet due, one day late is 1-30, day 30 / 31 and 90 / 91 split correctly", () => {
  assert.equal(ageingBucketIndex(0), 0);
  assert.equal(ageingBucketIndex(1), 1);
  assert.equal(ageingBucketIndex(30), 1);
  assert.equal(ageingBucketIndex(31), 2);
  assert.equal(ageingBucketIndex(60), 2);
  assert.equal(ageingBucketIndex(61), 3);
  assert.equal(ageingBucketIndex(90), 3);
  assert.equal(ageingBucketIndex(91), 4);
  assert.equal(daysPastDue("2026-02-28", "2026-03-01"), 1, "across a month end");
  assert.equal(daysPastDue("2024-02-28", "2024-03-01"), 2, "leap year");
});

t("date validation rejects impossible dates", () => {
  assert.ok(isYmd("2026-02-28"));
  assert.ok(!isYmd("2026-02-30"));
  assert.ok(!isYmd("26-02-28"));
  assert.ok(!isYmd(undefined));
});

t("statement: opening balance for a range, running balance, closing", () => {
  const s = buildStatement(customer, { from: "2026-03-01", to: "2026-12-31" });
  assert.equal(s.opening, 5000, "A after receipt 1 and the credit note");
  assert.deepEqual(s.lines.map((l) => l.docId), ["b", "r2", "rf"]);
  assert.deepEqual(s.lines.map((l) => l.balance), [10000, 4000, 4500]);
  assert.equal(s.closing, 4500);
  assert.equal(s.totalCharges, 5500);
  assert.equal(s.totalSettlements, 6000);
  assert.equal(s.opening + s.totalCharges - s.totalSettlements, s.closing);
  const whole = buildStatement(customer, { from: "2000-01-01", to: "2026-12-31" });
  assert.equal(whole.opening, 0);
  assert.equal(whole.closing, 4500, "the same closing whatever the start date");
  assert.equal(buildStatement(customer, { from: "2026-02-16", to: "2026-02-28" }).closing, 5000 , "closing at 28 Feb: 10000 - 4000 - 1000");
});

t("same-day documents list charges before settlements, so a balance never dips below the truth mid-day", () => {
  const s = buildStatement([doc({ id: "r", type: "receipt", date: "2026-01-01", amount: 100 }), doc({ id: "i", type: "invoice", date: "2026-01-01", amount: 100 })], { from: "2026-01-01", to: "2026-01-01" });
  assert.deepEqual(s.lines.map((l) => l.docId), ["i", "r"]);
  assert.deepEqual(s.lines.map((l) => l.balance), [100, 0]);
});

t("ageing is counted from the due date and the pieces add up to the balance", () => {
  const a = buildAgeing(customer, "2026-04-30");
  assert.deepEqual(a.items.map((i) => [i.docId, i.outstanding]), [["b", 5000]], "A is fully settled");
  assert.equal(a.items[0].daysPastDue, 30);
  assert.deepEqual(a.buckets, [0, 5000, 0, 0, 0]);
  assert.equal(a.totalOpen, 5000);
  assert.equal(a.overdue, 5000);
  assert.equal(a.onAccount, 500, "1000 advance less 500 refunded");
  assert.equal(a.net, 4500);
  assert.equal(a.totalOpen - a.onAccount, a.net);
  const earlier = buildAgeing(customer, "2026-02-28");
  assert.deepEqual(earlier.items.map((i) => [i.docId, i.outstanding, i.bucket]), [["a", 5000, 1]], "as it stood then: B did not exist, R2 not yet received");
  assert.equal(earlier.net, 5000);
  const notDue = buildAgeing(customer, "2026-03-15");
  assert.equal(notDue.items.find((i) => i.docId === "b")!.bucket, 0, "due 31 March, still current on 15 March");
  assert.equal(notDue.overdue, 0);
});

t("an item with no due date is due on its own date", () => {
  const a = buildAgeing([doc({ id: "x", type: "invoice", date: "2026-01-01", amount: 100 })], "2026-01-31");
  assert.equal(a.items[0].daysPastDue, 30);
  assert.equal(a.items[0].bucket, 1);
});

t("rupee rounding: paise add up exactly, no float drift", () => {
  const docs = Array.from({ length: 10 }, (_, i) => doc({ id: `i${i}`, type: "invoice", date: "2026-01-01", amount: 0.1 }));
  assert.equal(balanceAt(docs, "2026-01-01"), 1);
  const s = buildStatement([doc({ id: "i", type: "invoice", date: "2026-01-01", amount: 1234.56 }), doc({ id: "r", type: "receipt", date: "2026-01-02", amount: 1234.55, allocations: [{ docId: "i", amount: 1234.55 }] })], { from: "2026-01-01", to: "2026-01-31" });
  assert.equal(s.closing, 0.01);
  assert.equal(signedEffect(doc({ id: "z", type: "payment", date: "2026-01-01", amount: 19.99 })), -19.99);
});

t("a customer with nothing has an empty, zero statement", () => {
  const a = analyseParty([], "customer", { from: "2026-01-01", to: "2026-12-31" });
  assert.equal(a.balance, 0);
  assert.deepEqual(a.statement.lines, []);
  assert.deepEqual(a.ageing.items, []);
  assert.deepEqual(a.flags, []);
});

t("documents in another currency are left out of every figure and named in a flag", () => {
  const docs = [...customer, doc({ id: "usd", type: "invoice", date: "2026-01-05", amount: 999, currency: "USD" })];
  const a = analyseParty(docs, "customer", { from: "2026-01-01", to: "2026-12-31" });
  assert.equal(a.balance, 4500);
  assert.deepEqual(a.statement.otherCurrency, [{ currency: "USD", count: 1 }]);
  assert.ok(!a.statement.lines.some((l) => l.docId === "usd"));
  assert.ok(a.flags.some((f) => f.code === "other_currency" && f.message.includes("USD")));
});

t("unusual balances: a credit balance for a customer, a debit balance for a vendor, nothing for the normal direction", () => {
  const over = [doc({ id: "i", type: "invoice", date: "2026-01-01", amount: 100 }), doc({ id: "r", type: "receipt", date: "2026-01-02", amount: 150, allocations: [{ docId: "i", amount: 100 }], unallocated: 50 })];
  const c = findFlags(over, "customer", "2026-12-31");
  const u = c.find((f) => f.code === "unusual_balance")!;
  assert.ok(u && u.level === "bad" && u.message.includes("credit balance of Rs 50.00"));
  assert.ok(c.some((f) => f.code === "unallocated" && f.message.includes("Rs 50.00")));
  const vendor = [doc({ id: "b", type: "bill", date: "2026-01-01", amount: 100 }), doc({ id: "p", type: "payment", date: "2026-01-02", amount: 130, allocations: [{ docId: "b", amount: 100 }] })];
  const v = findFlags(vendor, "vendor", "2026-12-31").find((f) => f.code === "unusual_balance")!;
  assert.ok(v.message.includes("debit balance of Rs 30.00"));
  assert.equal(findFlags([doc({ id: "i", type: "invoice", date: "2026-01-01", amount: 100 })], "customer", "2026-12-31").some((f) => f.code === "unusual_balance"), false);
  assert.equal(findFlags(over, "customer", "2026-01-01").some((f) => f.code === "unusual_balance"), false, "as of before the receipt it was normal");
});

t("duplicate vendor bills use the shared normaliser (INV-001 = inv 001 = INV/001) and a different number is not a duplicate", () => {
  const bills = [
    doc({ id: "b1", type: "bill", date: "2026-01-01", amount: 100, vendorRef: "INV-001" }),
    doc({ id: "b2", type: "bill", date: "2026-01-05", amount: 120, vendorRef: "inv 001" }),
    doc({ id: "b3", type: "bill", date: "2026-01-06", amount: 130, vendorRef: "INV/001" }),
    doc({ id: "b4", type: "bill", date: "2026-01-07", amount: 140, vendorRef: "INV-0010" }),
  ];
  const f = findFlags(bills, "vendor", "2026-12-31").filter((x) => x.code === "duplicate");
  assert.equal(f.length, 1);
  assert.deepEqual(f[0].docIds.sort(), ["b1", "b2", "b3"]);
});

t("same type, date and amount is a possible duplicate, but two payments with different references are not", () => {
  const same = [doc({ id: "p1", type: "payment", date: "2026-01-01", amount: 500 }), doc({ id: "p2", type: "payment", date: "2026-01-01", amount: 500 })];
  assert.ok(findFlags(same, "vendor", "2026-12-31").some((f) => f.code === "possible_duplicate"));
  const diff = [doc({ id: "p1", type: "payment", date: "2026-01-01", amount: 500, reference: "UTR1" }), doc({ id: "p2", type: "payment", date: "2026-01-01", amount: 500, reference: "UTR2" })];
  assert.equal(findFlags(diff, "vendor", "2026-12-31").some((f) => f.code === "possible_duplicate"), false);
  const sameRef = [doc({ id: "p1", type: "payment", date: "2026-01-01", amount: 500, reference: "UTR1" }), doc({ id: "p2", type: "payment", date: "2026-01-01", amount: 500, reference: "utr1" })];
  assert.ok(findFlags(sameRef, "vendor", "2026-12-31").some((f) => f.code === "possible_duplicate"));
});

t("old unsettled items: only beyond the review limit, counted from the due date", () => {
  const inv = (due: string) => [doc({ id: "i", type: "invoice", date: "2025-01-01", dueDate: due, amount: 100 })];
  const asOf = "2026-06-30";
  const dueOn = (days: number) => new Date(Date.parse(`${asOf}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  assert.equal(findFlags(inv(dueOn(OLD_ITEM_DAYS)), "customer", asOf).some((f) => f.code === "old_unsettled"), false, "exactly at the limit is not yet old");
  assert.equal(findFlags(inv(dueOn(OLD_ITEM_DAYS + 1)), "customer", asOf).some((f) => f.code === "old_unsettled"), true);
});

t("a payment applied beyond a bill's value is flagged, and a record that disagrees with its documents is flagged", () => {
  const docs = [doc({ id: "b", type: "bill", date: "2026-01-01", amount: 100, recordedSettled: 100 }), doc({ id: "p", type: "payment", date: "2026-01-02", amount: 150, allocations: [{ docId: "b", amount: 150 }] })];
  const f = findFlags(docs, "vendor", "2026-12-31");
  assert.ok(f.some((x) => x.code === "over_settled"));
  assert.ok(f.some((x) => x.code === "record_mismatch"), "bill says 100 settled, payments say 150");
  const ok = [doc({ id: "b", type: "bill", date: "2026-01-01", amount: 100, recordedSettled: 100 }), doc({ id: "p", type: "payment", date: "2026-01-02", amount: 100, allocations: [{ docId: "b", amount: 100 }] })];
  assert.equal(findFlags(ok, "vendor", "2026-12-31").some((x) => x.code === "record_mismatch"), false);
  assert.equal(findFlags(docs, "vendor", "2026-01-01", [], "2026-12-31").some((x) => x.code === "record_mismatch"), false, "a back-dated run does not compare today's totals");
});

t("held documents (uncleared cheques) are named but never counted", () => {
  const f = findFlags(customer, "customer", "2026-12-31", [{ number: "REC-9", date: "2026-04-02", amount: 700, reason: "cheque not yet cleared" }]);
  assert.ok(f.some((x) => x.code === "held" && x.message.includes("REC-9") && x.message.includes("Rs 700.00")));
  assert.equal(balanceAt(customer, "2026-12-31"), 4500);
});

t("a debit note tied to a bill makes that bill larger; one with no bill stands alone", () => {
  const docs = [
    doc({ id: "b", type: "bill", date: "2026-01-01", dueDate: "2026-01-31", amount: 1000 }),
    doc({ id: "d", type: "debit_note", date: "2026-01-10", amount: 100, allocations: [{ docId: "b", amount: 100 }] }),
    doc({ id: "d2", type: "debit_note", date: "2026-01-12", amount: 50, allocations: [{ docId: "gone", amount: 50 }] }),
    doc({ id: "p", type: "payment", date: "2026-02-01", amount: 1100, allocations: [{ docId: "b", amount: 1100 }] }),
  ];
  const a = buildAgeing(docs, "2026-02-15");
  assert.equal(a.items.length, 1);
  assert.equal(a.items[0].docId, "d2");
  assert.equal(a.net, 50);
  assert.equal(a.onAccount, 0);
});

// ---- comparing with the other side's figure
const vendorDocs: PartyDoc[] = [
  doc({ id: "b1", type: "bill", date: "2026-01-01", amount: 1000, vendorRef: "V-1" }),
  doc({ id: "b2", type: "bill", date: "2026-02-01", amount: 2000, vendorRef: "V-2" }),
  doc({ id: "p1", type: "payment", date: "2026-02-10", amount: 500, allocations: [{ docId: "b1", amount: 500 }], reference: "UTR9" }),
  doc({ id: "b3", type: "bill", date: "2026-03-05", amount: 750, vendorRef: "V-3" }),
];

t("agreement: no difference, no explanations", () => {
  const c = compareWithConfirmation(vendorDocs, { kind: "vendor", theirBalance: 2500, theirAsOf: "2026-02-28", ourAsOf: "2026-02-28" });
  assert.equal(c.ourBalance, 2500);
  assert.equal(c.difference, 0);
  assert.equal(c.matches, true);
  assert.deepEqual(c.explanations, []);
});

t("a document dated after their statement explains the gap exactly", () => {
  const c = compareWithConfirmation(vendorDocs, { kind: "vendor", theirBalance: 2500, theirAsOf: "2026-02-28", ourAsOf: "2026-03-31" });
  assert.equal(c.ourBalance, 3250);
  assert.equal(c.difference, 750);
  const timing = c.explanations.find((e) => e.code === "timing")!;
  assert.equal(timing.confidence, "exact");
  assert.deepEqual(timing.docIds, ["b3"]);
});

t("a receipt/payment we recorded that they did not: difference equals that document", () => {
  // they never booked our 500 payment, so they show 3000
  const c = compareWithConfirmation(vendorDocs, { kind: "vendor", theirBalance: 3000, theirAsOf: "2026-02-28", ourAsOf: "2026-02-28" });
  assert.equal(c.difference, -500);
  const e = c.explanations.find((x) => x.code === "single_document")!;
  assert.deepEqual(e.docIds, ["p1"]);
  assert.ok(e.message.includes("may not be in their books"));
  assert.ok(c.explanations.some((x) => x.code === "they_hold_more"));
});

t("a gap equal to the sum of two documents is found, one of two is not invented", () => {
  const c = compareWithConfirmation(vendorDocs, { kind: "vendor", theirBalance: -500, theirAsOf: "2026-02-28", ourAsOf: "2026-02-28" });
  assert.equal(c.difference, 3000);
  assert.deepEqual(c.explanations.filter((x) => x.code === "two_documents").map((x) => [...x.docIds].sort().join()), ["b1,b2"]);
  const odd = compareWithConfirmation(vendorDocs, { kind: "vendor", theirBalance: 2111, theirAsOf: "2026-02-28", ourAsOf: "2026-02-28" });
  assert.equal(odd.difference, 389);
  assert.equal(odd.explanations.filter((x) => x.code === "single_document" || x.code === "two_documents").length, 0, "no document matches 389");
});

t("a bill entered twice that equals the difference is named as a duplicate", () => {
  const docs = [...vendorDocs, doc({ id: "b2dup", type: "bill", date: "2026-02-02", amount: 2000, vendorRef: "v 2" })];
  const c = compareWithConfirmation(docs, { kind: "vendor", theirBalance: 2500, theirAsOf: "2026-02-28", ourAsOf: "2026-02-28" });
  assert.equal(c.difference, 2000);
  const d = c.explanations.find((x) => x.code === "duplicate")!;
  assert.equal(d.confidence, "exact");
  assert.deepEqual(d.docIds.sort(), ["b2", "b2dup"]);
});

t("under a rupee is called rounding; a customer who pays short gets the TDS hint without any rate", () => {
  const c = compareWithConfirmation(customer, { kind: "customer", theirBalance: 4499.6, theirAsOf: "2026-12-31", ourAsOf: "2026-12-31" });
  assert.equal(c.difference, 0.4);
  assert.ok(c.explanations.some((x) => x.code === "rounding"));
  const short = compareWithConfirmation(customer, { kind: "customer", theirBalance: 4000, theirAsOf: "2026-12-31", ourAsOf: "2026-12-31" });
  assert.equal(short.difference, 500);
  const hint = short.explanations.find((x) => x.code === "tds_hint")!;
  assert.ok(hint && !/\d+\s?%/.test(hint.message), "no percentage is quoted");
  assert.ok(short.explanations.some((x) => x.code === "single_document" && x.docIds[0] === "rf"), "the refund equals the gap");
});

t("a difference of one paisa counts as agreement; two paise does not", () => {
  assert.equal(compareWithConfirmation(customer, { kind: "customer", theirBalance: 4500.01, theirAsOf: "2026-12-31", ourAsOf: "2026-12-31" }).matches, true);
  assert.equal(compareWithConfirmation(customer, { kind: "customer", theirBalance: 4500.02, theirAsOf: "2026-12-31", ourAsOf: "2026-12-31" }).matches, false);
});

console.log("party reconciliation core tests passed");
