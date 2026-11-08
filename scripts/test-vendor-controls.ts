import assert from "node:assert/strict";
import { addDaysISO, adjustProblem, bankStatus, daysBetweenISO, istToday, last4Of, msmeBill, normalizeUdyam, parsePaymentDays, sameDetails, validateAdvance, validateMsme, validateVerification, verifierProblem } from "../src/lib/products/cashflow-ai/vendor-controls/core";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const d = (o: Partial<{ name: string; account: string; ifsc: string; upi: string }> = {}) => ({ name: "Acme", account: "50100012345678", ifsc: "HDFC0000001", upi: null as string | null, ...o });

t("details are the same ignoring spacing and case, different when anything that routes money differs", () => {
  assert.ok(sameDetails(d(), d({ account: "5010 0012 345678", ifsc: "hdfc0000001", name: " acme " })));
  assert.ok(!sameDetails(d(), d({ account: "50100012345679" })));
  assert.ok(!sameDetails(d(), d({ ifsc: "HDFC0000002" })));
  assert.ok(!sameDetails(d(), d({ upi: "a@okbank" })));
  assert.ok(!sameDetails(d(), d({ name: "Acme Traders" })));
  assert.equal(last4Of("5010 0012 345678"), "5678");
});

t("bank status: none, verified, awaiting (old stays in force)", () => {
  assert.equal(bankStatus(false, false, false), "none");
  assert.equal(bankStatus(true, false, false), "awaiting");
  assert.equal(bankStatus(true, true, false), "awaiting");
  assert.equal(bankStatus(true, true, true), "verified");
});

t("the person who made the change cannot verify it; someone else can", () => {
  assert.ok(verifierProblem("u1", "u1"));
  assert.equal(verifierProblem("u2", "u1"), null);
  assert.equal(verifierProblem("u2", null), null);
});

t("a verification needs a known method and a real note", () => {
  assert.ok(!validateVerification({ method: "sms", note: "spoke to the accountant" }).ok);
  assert.ok(!validateVerification({ method: "in_writing", note: "ok" }).ok);
  assert.ok(!validateVerification({ method: "in_writing", note: "x".repeat(501) }).ok);
  assert.ok(validateVerification({ method: "phone_known_number", note: "Spoke to Mr Rao in accounts" }).ok);
});

t("Udyam numbers are checked by format and written one way", () => {
  assert.equal(normalizeUdyam("udyam-mh-01-1234567"), "UDYAM-MH-01-1234567");
  assert.equal(normalizeUdyam("UDYAMMH011234567"), "UDYAM-MH-01-1234567");
  for (const bad of ["UDYAM-MH-01-123456", "UDYAM-M1-01-1234567", "MH-01-1234567", "", null]) assert.equal(normalizeUdyam(bad), null);
  assert.ok(validateMsme({ category: "micro", udyam: "UDYAM-MH-01-1234567" }).ok);
  assert.ok(!validateMsme({ category: "micro", udyam: "" }).ok, "a micro/small/medium vendor needs its registration number");
  assert.ok(validateMsme({ category: "none", udyam: "" }).ok);
  assert.ok(!validateMsme({ category: "large", udyam: "UDYAM-MH-01-1234567" }).ok);
});

t("payment days: empty means not confirmed; nothing is assumed", () => {
  assert.deepEqual(parsePaymentDays(""), { ok: true, days: null });
  assert.deepEqual(parsePaymentDays(undefined), { ok: true, days: null });
  assert.deepEqual(parsePaymentDays("45"), { ok: true, days: 45 });
  for (const bad of ["0", "-5", "4.5", "abc", "400"]) assert.equal(parsePaymentDays(bad).ok, false, bad);
});

t("date maths crosses month ends, year ends and leap days", () => {
  assert.equal(addDaysISO("2026-01-31", 30), "2026-03-02");
  assert.equal(addDaysISO("2026-01-31", 28), "2026-02-28");
  assert.equal(addDaysISO("2028-01-31", 29), "2028-02-29");
  assert.equal(addDaysISO("2028-02-28", 2), "2028-03-01");
  assert.equal(addDaysISO("2027-02-28", 1), "2027-03-01");
  assert.equal(addDaysISO("2026-12-20", 45), "2027-02-03");
  assert.equal(addDaysISO("2026-02-30", 1), null, "an impossible date is refused");
  assert.equal(daysBetweenISO("2026-02-28", "2026-03-01"), 1);
});

t("an MSME bill is unconfirmed without days, then on time / due soon / overdue, with the due day itself still on time", () => {
  assert.deepEqual(msmeBill("2026-09-01", null, "2026-12-31"), { dueBy: null, state: "unconfirmed", daysLate: 0 });
  assert.deepEqual(msmeBill("2026-10-01", 45, "2026-10-28"), { dueBy: "2026-11-15", state: "on_time", daysLate: 0 });
  assert.equal(msmeBill("2026-10-01", 45, "2026-11-08").state, "due_soon");
  assert.equal(msmeBill("2026-10-01", 45, "2026-11-15").state, "due_soon", "due today is not late");
  assert.deepEqual(msmeBill("2026-10-01", 45, "2026-11-16"), { dueBy: "2026-11-15", state: "overdue", daysLate: 1 });
  assert.deepEqual(msmeBill("2026-01-31", 30, "2026-03-05"), { dueBy: "2026-03-02", state: "overdue", daysLate: 3 });
  assert.equal(msmeBill("garbage", 45, "2026-11-16").state, "unconfirmed");
});

t("India date is used for today", () => {
  assert.equal(istToday(new Date("2026-10-27T19:00:00Z")), "2026-10-28");
  assert.equal(istToday(new Date("2026-10-27T18:29:00Z")), "2026-10-27");
});

t("an advance needs a kind, a sensible amount, a real past date and a purpose", () => {
  const ok = { kind: "advance", amount: "1,25,000.50", paidOn: "2026-10-01", purpose: "Advance for fabrication" };
  const r = validateAdvance(ok, "2026-10-28");
  assert.ok(r.ok && r.data.amountPaise === 12500050);
  for (const bad of [{ kind: "loan" }, { amount: "0" }, { amount: "1.005" }, { amount: "abc" }, { paidOn: "2026-10-29" }, { paidOn: "2026-02-30" }, { purpose: "x" }]) assert.equal(validateAdvance({ ...ok, ...bad }, "2026-10-28").ok, false, JSON.stringify(bad));
});

t("an adjustment cannot exceed the open amount or the bill's outstanding", () => {
  assert.equal(adjustProblem(5000_00, 10000_00, 8000_00), null);
  assert.equal(adjustProblem(10000_00, 10000_00, 10000_00), null);
  assert.ok(adjustProblem(10000_01, 10000_00, 90000_00));
  assert.ok(adjustProblem(9000_00, 10000_00, 8000_00));
  assert.ok(adjustProblem(1000_00, 10000_00, 0));
  assert.ok(adjustProblem(50, 10000_00, 10000_00));
  assert.ok(adjustProblem(10.5, 10000_00, 10000_00));
});

console.log("vendor controls (pure): all passed");
