import assert from "node:assert/strict";
import { challanProblem, deductionRows, deductedByMonth, depositPosition, expectedTds, financialYearOf, fyRange, isFinancialYear, panError, quarterOf, quarterRange, sectionProblem, totalsOf, validPan, type BillForTds, type SectionConfig } from "../src/lib/products/cashflow-ai/tds/core";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
// Numbers below are test inputs a company might type from its CA; the code under test contains none of them.
const cfg = (o: Partial<SectionConfig> = {}): SectionConfig => ({ code: "194J", label: "Professional fees", rate: 10, singleThreshold: null, annualThreshold: 30000, noPanRate: 20, confirmed: true, active: true, ...o });
const bill = (o: Partial<BillForTds> = {}): BillForTds => ({ billId: "b1", billNumber: "BILL-1", vendorId: "v1", vendorName: "Acme", vendorPan: "ABCPE1234F", date: "2026-10-05", base: 50000, tdsRate: 10, tdsAmount: 5000, section: "194J", status: "pending", ...o });
const map = (...c: SectionConfig[]) => new Map(c.map((x) => [x.code.toUpperCase(), x]));

t("a PAN has the right shape and holder letter", () => {
  assert.equal(panError("ABCPE1234F"), null);
  assert.equal(validPan(" abcpe1234f "), "ABCPE1234F");
  assert.ok(panError("ABCPE1234"));
  assert.ok(panError("ABCDX1234F"), "4th letter X is not a holder type");
  assert.ok(panError(""));
  assert.equal(validPan("123"), null);
});

t("the financial year runs April to March and quarters follow it", () => {
  assert.equal(financialYearOf("2026-04-01"), "2026-27");
  assert.equal(financialYearOf("2027-03-31"), "2026-27");
  assert.equal(financialYearOf("2026-03-31"), "2025-26");
  assert.equal(financialYearOf("2099-12-31"), "2099-00");
  assert.deepEqual([quarterOf("2026-04-10"), quarterOf("2026-09-30"), quarterOf("2026-10-01"), quarterOf("2027-01-01"), quarterOf("2027-03-31")], [1, 2, 3, 4, 4]);
  assert.deepEqual(quarterRange("2026-27", 4), { from: "2027-01-01", to: "2027-03-31" });
  assert.deepEqual(fyRange("2026-27"), { from: "2026-04-01", to: "2027-03-31" });
  assert.ok(isFinancialYear("2026-27") && !isFinancialYear("2026-28") && !isFinancialYear("26-27") && isFinancialYear("2099-00"));
});

t("a section needs a code, a name and sane numbers", () => {
  assert.equal(sectionProblem(cfg()), null);
  assert.ok(sectionProblem(cfg({ code: "" })));
  assert.ok(sectionProblem(cfg({ code: "bad code!" })));
  assert.ok(sectionProblem(cfg({ label: " " })));
  assert.ok(sectionProblem(cfg({ rate: 120 })));
  assert.ok(sectionProblem(cfg({ rate: -1 })));
  assert.ok(sectionProblem(cfg({ annualThreshold: -5 })));
  assert.equal(sectionProblem(cfg({ rate: null, annualThreshold: null })), null, "a section may be set up before its numbers are known");
});

t("with no limits every payment is taxed; with a single limit only a bigger payment; rate comes only from the settings", () => {
  const free = cfg({ singleThreshold: null, annualThreshold: null });
  assert.deepEqual(expectedTds(free, true, 1000, { paid: 0, taxedBase: 0 }), { amount: 100, rate: 10, taxableBase: 1000 });
  const single = cfg({ singleThreshold: 30000, annualThreshold: null });
  assert.equal(expectedTds(single, true, 30000, { paid: 0, taxedBase: 0 })!.amount, 0, "at the limit is not above it");
  assert.equal(expectedTds(single, true, 30001, { paid: 0, taxedBase: 0 })!.amount, 3000.1);
  assert.equal(expectedTds(cfg({ rate: null }), true, 1000, { paid: 0, taxedBase: 0 }), null, "no rate entered: nothing is guessed");
});

t("a missing PAN uses the company's no-PAN rate, and none is assumed when it was not entered", () => {
  assert.equal(expectedTds(cfg({ annualThreshold: null }), false, 1000, { paid: 0, taxedBase: 0 })!.rate, 20);
  assert.equal(expectedTds(cfg({ annualThreshold: null, noPanRate: null }), false, 1000, { paid: 0, taxedBase: 0 })!.rate, 10);
});

t("once the yearly limit is crossed, tax is due on everything not yet taxed", () => {
  const rows = deductionRows(
    [
      bill({ billId: "b1", billNumber: "B1", date: "2026-05-01", base: 20000, tdsAmount: 0, tdsRate: 0 }),
      bill({ billId: "b2", billNumber: "B2", date: "2026-06-01", base: 20000, tdsAmount: 4000, tdsRate: 10 }),
    ],
    map(cfg({ annualThreshold: 30000 }))
  );
  const b2 = rows.find((r) => r.bill.billId === "b2")!;
  assert.equal(b2.expected, 4000, "10% of the 40,000 paid so far, none of which was taxed");
  assert.ok(!b2.flags.includes("short_deduction") && !b2.flags.includes("excess_deduction"));
  assert.equal(rows.find((r) => r.bill.billId === "b1"), undefined, "the first bill is under the limit, nothing deducted, nothing expected: no row");
});

t("short, excess and missing deductions are flagged", () => {
  const s = map(cfg({ annualThreshold: null }));
  assert.ok(deductionRows([bill({ base: 10000, tdsAmount: 500 })], s)[0].flags.includes("short_deduction"));
  assert.ok(deductionRows([bill({ base: 10000, tdsAmount: 1500 })], s)[0].flags.includes("excess_deduction"));
  assert.ok(deductionRows([bill({ base: 10000, tdsAmount: 0, tdsRate: 0 })], s)[0].flags.includes("not_deducted_but_expected"));
  assert.deepEqual(deductionRows([bill({ base: 10000, tdsAmount: 1000 })], s)[0].flags, []);
});

t("deducted below the limit is flagged, not called an error", () => {
  const r = deductionRows([bill({ base: 1000, tdsAmount: 100 })], map(cfg({ annualThreshold: 30000 })))[0];
  assert.ok(r.flags.includes("deducted_below_limit"));
});

t("a section that is missing, unset, or unconfirmed is said so and the check is not pretended", () => {
  assert.ok(deductionRows([bill({ section: null })], map(cfg()))[0].flags.includes("no_section"));
  assert.ok(deductionRows([bill({ section: "194C" })], map(cfg()))[0].flags.includes("section_not_set_up"));
  assert.ok(deductionRows([bill()], map(cfg({ rate: null })))[0].flags.includes("rate_not_entered"));
  assert.ok(deductionRows([bill()], map(cfg({ confirmed: false })))[0].flags.includes("numbers_unconfirmed"));
});

t("PAN problems on a bill with a section are flagged", () => {
  const s = map(cfg({ annualThreshold: null }));
  assert.ok(deductionRows([bill({ vendorPan: null })], s)[0].flags.includes("pan_missing"));
  assert.ok(deductionRows([bill({ vendorPan: "NOPE" })], s)[0].flags.includes("pan_invalid"));
});

t("cancelled bills are left out and a vendor's running total is per section and per year", () => {
  const s = map(cfg({ annualThreshold: 30000 }));
  const rows = deductionRows(
    [
      bill({ billId: "c", billNumber: "C", status: "cancelled", base: 99999, tdsAmount: 9999 }),
      bill({ billId: "x", billNumber: "X", date: "2027-04-01", base: 25000, tdsAmount: 0, tdsRate: 0 }), // next financial year: starts again
      bill({ billId: "y", billNumber: "Y", date: "2026-10-01", base: 25000, tdsAmount: 0, tdsRate: 0 }),
    ],
    s
  );
  assert.deepEqual(rows, [], "neither is over 30,000 on its own in its own year");
});

t("totals and the month-by-month deposit position add up from the rows", () => {
  const s = map(cfg({ annualThreshold: null }));
  const rows = deductionRows([bill({ billId: "a", billNumber: "A", date: "2026-10-05", base: 10000, tdsAmount: 1000 }), bill({ billId: "b", billNumber: "B", date: "2026-10-20", base: 20000, tdsAmount: 2000 }), bill({ billId: "c", billNumber: "C", date: "2026-11-02", base: 5000, tdsAmount: 500 })], s);
  assert.deepEqual(totalsOf(rows), { paidOrCredited: 35000, deducted: 3500, expected: 3500 });
  const pos = depositPosition(deductedByMonth(rows), [{ forMonth: "2026-10", amount: 3000, status: "deposited" }, { forMonth: "2026-11", amount: 600, status: "deposited" }, { forMonth: "2026-10", amount: 999, status: "cancelled" }]);
  assert.deepEqual(pos, [{ month: "2026-10", deducted: 3000, deposited: 3000, difference: 0 }, { month: "2026-11", deducted: 500, deposited: 600, difference: -100 }]);
});

t("a challan needs the bank's BSR code, a serial number, an amount and a date", () => {
  const ok = { forMonth: "2026-10", amount: 3000, paidOn: "2026-11-07", bsrCode: "0510308", serial: "12345" };
  assert.equal(challanProblem(ok), null);
  for (const bad of [{ forMonth: "2026-13" }, { amount: 0 }, { paidOn: "07-11-2026" }, { paidOn: "2026-11-31" }, { bsrCode: "123" }, { serial: "123456" }, { serial: "" }]) assert.ok(challanProblem({ ...ok, ...bad }), JSON.stringify(bad));
});

t("after a catch-up deduction the next bill is not called short (the catch-up counts as taxed)", () => {
  const rows = deductionRows(
    [
      bill({ billId: "b1", billNumber: "B1", date: "2026-05-01", base: 20000, tdsAmount: 0, tdsRate: 0 }),
      bill({ billId: "b2", billNumber: "B2", date: "2026-06-01", base: 20000, tdsAmount: 4000 }),
      bill({ billId: "b3", billNumber: "B3", date: "2026-07-01", base: 20000, tdsAmount: 2000 }),
    ],
    map(cfg({ annualThreshold: 30000 }))
  );
  const b3 = rows.find((r) => r.bill.billId === "b3")!;
  assert.equal(b3.expected, 2000, "only the new 20,000 is untaxed");
  assert.deepEqual(b3.flags, []);
});

t("a bill in a foreign currency is listed, not worked on, and kept out of totals and running totals", () => {
  const s = map(cfg({ annualThreshold: 30000 }));
  const rows = deductionRows([bill({ billId: "usd", billNumber: "USD", base: 1000, tdsAmount: 0, tdsRate: 0, currency: "USD", date: "2026-05-01" }), bill({ billId: "inr", billNumber: "INR", base: 25000, tdsAmount: 0, tdsRate: 0, date: "2026-06-01" })], s);
  assert.deepEqual(rows.map((r) => [r.bill.billId, r.flags]), [["usd", ["foreign_currency"]]]);
  assert.equal(totalsOf(rows).paidOrCredited, 0);
});

console.log("tds core tests passed");
