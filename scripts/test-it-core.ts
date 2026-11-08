import assert from "node:assert/strict";
import { adjustmentProblem, computeTax, instalmentStatus, ratesProblem, scheduleProblem, taxPaymentProblem, type Adjustment, type LossLine, type TaxRates } from "../src/lib/products/cashflow-ai/income-tax/core";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
// Rates below are inputs a company might type from its CA; the code under test holds none of them.
const rates = (o: Partial<TaxRates> = {}): TaxRates => ({ regimeLabel: "As told by CA", baseRate: 25, surchargeRate: 10, cessRate: 4, matRate: 15, matApplicable: false, confirmed: true, ...o });
const adj = (o: Partial<Adjustment> = {}): Adjustment => ({ id: "a1", kind: "add", head: "Penalties and fines", amount: 1000, scope: "both", basis: null, ...o });
const loss = (o: Partial<LossLine> = {}): LossLine => ({ id: "l1", fy: "2024-25", kind: "business", available: 50000, validUntilFy: null, ...o });
const base = { adjustments: [] as Adjustment[], losses: [] as LossLine[], setOffs: [] as { lossId: string; amount: number }[], credits: { advanceTax: 0, tdsCredit: 0, selfAssessment: 0 } };

t("rates must be percentages; an adjustment needs a kind, a head, an amount and a scope", () => {
  assert.equal(ratesProblem(rates()), null);
  assert.ok(ratesProblem(rates({ baseRate: 120 })));
  assert.ok(ratesProblem(rates({ cessRate: -1 })));
  assert.equal(ratesProblem({ baseRate: null }), null, "not entered is allowed");
  assert.equal(adjustmentProblem({ kind: "add", head: "x", amount: 5, scope: "normal" }), null);
  for (const bad of [{ kind: "x" }, { head: " " }, { amount: 0 }, { amount: NaN }, { scope: "all" }]) assert.ok(adjustmentProblem({ kind: "add", head: "x", amount: 5, scope: "normal", ...bad }), JSON.stringify(bad));
});

t("book profit plus additions less deductions gives the income; tax = rate, then surcharge on tax, then cess on both", () => {
  const r = computeTax({ ...base, bookProfit: 100000, adjustments: [adj({ amount: 20000 }), adj({ id: "a2", kind: "less", head: "Depreciation as per income-tax rules", amount: 30000 })], rates: rates() });
  assert.equal(r.incomeBeforeLosses, 90000);
  assert.equal(r.taxableIncome, 90000);
  assert.deepEqual(r.normal, { tax: 22500, surcharge: 2250, cess: 990, total: 25740 });
  assert.equal(r.balance, 25740);
});

t("with no rate entered nothing is invented: the tax and the balance are unknown", () => {
  const r = computeTax({ ...base, bookProfit: 100000, rates: rates({ baseRate: null }) });
  assert.equal(r.normal, null);
  assert.equal(r.taxForYear, null);
  assert.equal(r.balance, null);
  assert.ok(r.notes.includes("rates_not_entered"));
  assert.ok(computeTax({ ...base, bookProfit: 1, rates: rates({ confirmed: false }) }).notes.includes("rates_unconfirmed"));
});

t("a missing surcharge or cess counts as zero", () => {
  const r = computeTax({ ...base, bookProfit: 10000, rates: rates({ surchargeRate: null, cessRate: null }) });
  assert.deepEqual(r.normal, { tax: 2500, surcharge: 0, cess: 0, total: 2500 });
});

t("a loss for the year pays no tax, is reported, and cannot be 'set off' against nothing", () => {
  const r = computeTax({ ...base, bookProfit: -50000, adjustments: [adj({ amount: 10000 })], losses: [loss()], setOffs: [{ lossId: "l1", amount: 5000 }], rates: rates() });
  assert.equal(r.taxableIncome, 0);
  assert.equal(r.normal!.total, 0);
  assert.equal(r.lossOfTheYear, 40000);
  assert.equal(r.lossesSetOff, 0);
  assert.ok(r.notes.includes("loss_for_the_year"));
});

t("losses are set off up to what is available, up to the income, each once", () => {
  const losses = [loss({ id: "l1", available: 30000 }), loss({ id: "l2", fy: "2023-24", available: 100000 })];
  const r = computeTax({ ...base, bookProfit: 80000, losses, setOffs: [{ lossId: "l1", amount: 50000 }, { lossId: "l2", amount: 90000 }, { lossId: "l1", amount: 1 }, { lossId: "zz", amount: 5 }], rates: rates() });
  assert.deepEqual(r.setOffUsed, [{ lossId: "l1", amount: 30000 }, { lossId: "l2", amount: 50000 }]);
  assert.equal(r.taxableIncome, 0);
  for (const n of ["set_off_more_than_available", "set_off_more_than_income", "duplicate_set_off", "unknown_loss"] as const) assert.ok(r.notes.includes(n), n);
});

t("advance tax, TDS credit and self-assessment tax are subtracted; a refund shows as a negative balance", () => {
  const r = computeTax({ ...base, bookProfit: 100000, rates: rates({ surchargeRate: 0, cessRate: 0 }), credits: { advanceTax: 20000, tdsCredit: 8000, selfAssessment: 0 } });
  assert.equal(r.taxForYear!.total, 25000);
  assert.equal(r.balance, -3000);
  assert.equal(r.paid.total, 28000);
});

t("MAT: worked only when the CA says it applies and its rate is entered; the higher tax is the tax for the year", () => {
  const input = { ...base, bookProfit: 1000000, adjustments: [adj({ kind: "less", head: "Depreciation as per income-tax rules", amount: 900000, scope: "normal" })] };
  const off = computeTax({ ...input, rates: rates({ surchargeRate: 0, cessRate: 0 }) });
  assert.equal(off.mat, null);
  assert.equal(off.taxForYear!.total, 25000);
  const on = computeTax({ ...input, rates: rates({ matApplicable: true, surchargeRate: 0, cessRate: 0 }) });
  assert.equal(on.mat!.bookProfit, 1000000, "the normal-only deduction does not reduce book profit");
  assert.equal(on.mat!.total, 150000);
  assert.equal(on.taxForYear!.total, 150000);
  assert.equal(on.matExcess, 125000);
  const noRate = computeTax({ ...input, rates: rates({ matApplicable: true, matRate: null }) });
  assert.equal(noRate.taxForYear, null);
  assert.ok(noRate.notes.includes("mat_rate_not_entered"));
});

t("surcharge slabs: the highest slab strictly below the income applies (10,000,000 is not above, 10,000,001 is); MAT uses the same rule on its own base", () => {
  const slabs = [{ above: 10000000, rate: 7 }, { above: 100000000, rate: 12 }];
  const at = (profit: number) => computeTax({ ...base, bookProfit: profit, rates: rates({ baseRate: 30, cessRate: 0, surchargeSlabs: slabs }) });
  assert.equal(at(10000000).normal!.surcharge, 0, "exactly at the limit: no surcharge");
  assert.equal(at(10000001).normal!.surcharge, Math.round(10000001 * 0.3 * 0.07 * 100) / 100, "one rupee over: 7% on the tax");
  assert.equal(at(100000001).normal!.surcharge, Math.round(100000001 * 0.3 * 0.12 * 100) / 100, "over 10 crore: 12%");
  assert.equal(at(5000).normal!.surcharge, 0);
  // the flat rate is still used when no slabs are given
  assert.equal(computeTax({ ...base, bookProfit: 100000, rates: rates({ cessRate: 0, surchargeRate: 10 }) }).normal!.surcharge, 2500);
  // MAT base is tested on its own: normal income is small, book profit is over the limit
  const r = computeTax({ ...base, bookProfit: 20000000, adjustments: [adj({ kind: "less", head: "Depreciation as per income-tax rules", amount: 15000000, scope: "normal" })], rates: rates({ baseRate: 30, cessRate: 0, matRate: 15, matApplicable: true, surchargeSlabs: slabs }) });
  assert.equal(r.normal!.surcharge, 0, "normal income 5,000,000 is under the limit");
  assert.equal(r.mat!.tax, 3000000);
  assert.equal(r.mat!.surcharge, 210000, "book profit 20,000,000 is over the limit: 7%");
});

t("adjustments with scope MAT only do not touch the normal computation, and the reverse", () => {
  const r = computeTax({ ...base, bookProfit: 100000, adjustments: [adj({ amount: 5000, scope: "mat" }), adj({ id: "a2", amount: 7000, scope: "normal" })], rates: rates({ matApplicable: true, surchargeRate: 0, cessRate: 0 }) });
  assert.equal(r.incomeBeforeLosses, 107000);
  assert.equal(r.mat!.bookProfit, 105000);
});

t("the instalment schedule must be in order with cumulative percentages that grow", () => {
  assert.equal(scheduleProblem([{ dueDate: "2026-06-15", cumulativePercent: 15 }, { dueDate: "2026-09-15", cumulativePercent: 45 }]), null);
  assert.ok(scheduleProblem([{ dueDate: "2026-09-15", cumulativePercent: 45 }, { dueDate: "2026-06-15", cumulativePercent: 60 }]));
  assert.ok(scheduleProblem([{ dueDate: "2026-06-15", cumulativePercent: 45 }, { dueDate: "2026-09-15", cumulativePercent: 45 }]));
  assert.ok(scheduleProblem([{ dueDate: "2026-06-31", cumulativePercent: 10 }]));
  assert.ok(scheduleProblem([{ dueDate: "2026-06-15", cumulativePercent: 0 }]));
});

t("each instalment compares what should be paid by its date with what was paid by then", () => {
  const s = instalmentStatus(
    [{ dueDate: "2026-06-15", cumulativePercent: 15 }, { dueDate: "2026-09-15", cumulativePercent: 45 }, { dueDate: "2026-12-15", cumulativePercent: 75 }],
    100000,
    [{ paidOn: "2026-06-10", amount: 15000 }, { paidOn: "2026-09-20", amount: 20000 }],
    "2026-10-01"
  );
  assert.deepEqual(s.map((x) => [x.shouldHavePaid, x.paidByThen, x.shortfall, x.state]), [[15000, 15000, 0, "paid_up"], [45000, 15000, 30000, "short"], [75000, 35000, 40000, "upcoming"]]);
  assert.equal(instalmentStatus([{ dueDate: "2026-10-10", cumulativePercent: 50 }], 1000, [], "2026-10-01")[0].state, "due_soon");
});

t("a tax payment needs its kind, year, amount, date and the bank's challan details", () => {
  const ok = { kind: "advance", fy: "2026-27", amount: 1000, paidOn: "2026-09-14", bsrCode: "0510308", serial: "00012" };
  assert.equal(taxPaymentProblem(ok), null);
  for (const bad of [{ kind: "x" }, { fy: "26-27" }, { amount: 0 }, { paidOn: "2026-02-30" }, { bsrCode: "12" }, { serial: "" }]) assert.ok(taxPaymentProblem({ ...ok, ...bad }), JSON.stringify(bad));
});

console.log("income-tax core tests passed");
