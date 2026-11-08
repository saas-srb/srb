import assert from "node:assert/strict";
import { buildDues, dueDate, monthsOrPart, tdsInterest, upcomingReturns, type DuePayment, type DueSlip } from "../src/lib/products/talentos/payroll/dues";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const slip = (o: Partial<DueSlip> = {}): DueSlip => ({ state: "Maharashtra", pfEmployee: 1800, pfEmployer: 1800, pfEdli: 75, pfAdmin: 75, esiEmployee: 0, esiEmployer: 0, tds: 2000, pt: 200, lwfEmployee: 0, lwfEmployer: 0, ...o });
const pay = (o: Partial<DuePayment>): DuePayment => ({ id: "p", kind: "pf", state: null, amount: 0, paidOn: "2026-09-14", reference: "TRRN1", bsrCode: null, challanSerial: null, note: null, ...o });

t("central due dates", () => {
  assert.equal(dueDate("pf", "2026-08"), "2026-09-15");
  assert.equal(dueDate("esi", "2026-12"), "2027-01-15");
  assert.equal(dueDate("tds", "2026-08"), "2026-09-07");
  assert.equal(dueDate("tds", "2027-03"), "2027-04-30", "March tax is due on 30 April");
  assert.equal(dueDate("pt", "2026-08"), null);
});

t("a part month counts as a whole month", () => {
  assert.equal(monthsOrPart("2026-08-31", "2026-09-07"), 1);
  assert.equal(monthsOrPart("2026-08-31", "2026-09-30"), 1);
  assert.equal(monthsOrPart("2026-08-31", "2026-10-01"), 2);
  assert.equal(monthsOrPart("2026-08-31", "2026-08-31"), 0);
  assert.equal(tdsInterest(10000, "2026-08", "2026-09-20"), 150);
  assert.equal(tdsInterest(10000, "2026-08", "2026-10-20"), 300);
  assert.equal(tdsInterest(10000, "2026-08", "2026-09-07"), 150, "even a day late costs a month's interest");
});

t("amounts are summed per payment and state", () => {
  const dues = buildDues("2026-08", [slip(), slip({ state: "Karnataka", pt: 200 }), slip({ state: "Karnataka", pt: 0 })], [], "2026-09-01");
  const pf = dues.find((d) => d.kind === "pf")!;
  assert.equal(pf.amount, 3 * (1800 + 1800 + 75 + 75));
  assert.equal(pf.status, "due");
  assert.equal(dues.find((d) => d.kind === "tds")!.amount, 6000);
  const pts = dues.filter((d) => d.kind === "pt");
  assert.deepEqual(pts.map((d) => [d.state, d.amount]), [["Karnataka", 200], ["Maharashtra", 200]]);
  assert.ok(!dues.some((d) => d.kind === "esi" && d.amount > 0) && dues.find((d) => d.kind === "esi")!.status === "nothing_due");
  assert.ok(!dues.some((d) => d.kind === "lwf"), "no labour welfare fund, no line");
});

t("status follows payments and the due date", () => {
  const slips = [slip()];
  const total = 1800 + 1800 + 75 + 75;
  assert.equal(buildDues("2026-08", slips, [], "2026-09-16").find((d) => d.kind === "pf")!.status, "overdue");
  assert.equal(buildDues("2026-08", slips, [pay({ amount: total })], "2026-09-16").find((d) => d.kind === "pf")!.status, "paid");
  const part = buildDues("2026-08", slips, [pay({ amount: 1000 })], "2026-09-10").find((d) => d.kind === "pf")!;
  assert.equal(part.status, "part_paid");
  assert.equal(part.balance, total - 1000);
  assert.equal(buildDues("2026-08", slips, [pay({ amount: 1000 })], "2026-09-16").find((d) => d.kind === "pf")!.status, "overdue");
  // A payment for one state's professional tax does not settle another's.
  const pts = buildDues("2026-08", [slip(), slip({ state: "Karnataka" })], [pay({ kind: "pt", state: "Karnataka", amount: 200 })], "2026-09-10").filter((d) => d.kind === "pt");
  assert.equal(pts.find((d) => d.state === "Karnataka")!.status, "paid");
  assert.equal(pts.find((d) => d.state === "Maharashtra")!.status, "due");
});

t("late tax payment shows interest; on-time shows one month at most", () => {
  const late = buildDues("2026-08", [slip()], [], "2026-10-02").find((d) => d.kind === "tds")!;
  assert.equal(late.interestEstimate, Math.round(2000 * 0.015 * 2));
  const paidLate = buildDues("2026-08", [slip()], [pay({ kind: "tds", amount: 2000, paidOn: "2026-09-20" })], "2026-12-01").find((d) => d.kind === "tds")!;
  assert.equal(paidLate.status, "paid");
  assert.equal(paidLate.interestEstimate, 30);
});

t("return calendar looks four months ahead", () => {
  const d = upcomingReturns("2026-10-27");
  assert.ok(d.some((x) => x.date === "2027-01-31" && x.title.includes("quarter 3")));
  assert.ok(d.some((x) => x.date === "2026-10-31" && x.title.includes("quarter 2")), "31 October is still ahead on 27 October");
  assert.ok(d.every((x, i) => i === 0 || d[i - 1].date <= x.date));
});

console.log("payroll dues tests passed");
