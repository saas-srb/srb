import assert from "node:assert/strict";
import { BUILTIN_INCOME_TAX, financialYearOf, incomeTaxFor, monthsOfFy } from "../src/lib/products/talentos/payroll/rates";
import { NO_DEDUCTIONS, ageOn, computeAnnualTax, hraExemption, monthlyTds, roundToTen, slabTax, type AnnualTaxInput, type DeductionAmounts } from "../src/lib/products/talentos/payroll/tax";

// Pure: no database. Run with: npx tsx scripts/test-payroll-tax.ts
// Every expected figure below was worked out by hand from the slabs of the Finance Act for the year, not copied from the code's output.
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const Y25 = incomeTaxFor("2025-26");
const base = (o: Partial<AnnualTaxInput> = {}): AnnualTaxInput => ({
  year: Y25, regime: "new", age: 30, taxableSalary: 0, basicPlusDa: 0, hraReceived: 0, employerPf: 0, employerNps: 0, employerSuperannuation: 0,
  employeePf: 0, professionalTax: 0, declared: NO_DEDUCTIONS, ...o,
});
const decl = (o: Partial<DeductionAmounts>): DeductionAmounts => ({ ...NO_DEDUCTIONS, ...o });

t("financial year helpers", () => {
  assert.equal(financialYearOf("2026-03"), "2025-26");
  assert.equal(financialYearOf("2026-04"), "2026-27");
  assert.equal(financialYearOf("2025-12"), "2025-26");
  assert.deepEqual(monthsOfFy("2025-26"), ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]);
  assert.equal(ageOn("1990-06-15", "2026-03-31"), 35);
  assert.equal(ageOn("1966-04-01", "2026-03-31"), 59);
  assert.equal(ageOn("1966-03-31", "2026-03-31"), 60);
  assert.equal(ageOn(null, "2026-03-31"), null);
});
t("rounding to ten rupees", () => {
  assert.equal(roundToTen(1204), 1200);
  assert.equal(roundToTen(1205), 1210);
  assert.equal(roundToTen(1206), 1210);
});
t("slab tax is cumulative by band", () => {
  assert.equal(slabTax(400000, Y25.newRegime.slabs), 0);
  assert.equal(slabTax(800000, Y25.newRegime.slabs), 20000);
  assert.equal(slabTax(1200000, Y25.newRegime.slabs), 60000);
  assert.equal(slabTax(1425000, Y25.newRegime.slabs), 93750);
  assert.equal(slabTax(2325000, Y25.newRegime.slabs), 281250);
});
t("new regime FY 2025-26: nothing to pay up to 12.75 lakh of salary (87A rebate + 75,000 standard deduction)", () => {
  const r = computeAnnualTax(base({ taxableSalary: 1275000 }));
  assert.equal(r.standardDeduction, 75000);
  assert.equal(r.taxableIncome, 1200000);
  assert.equal(r.taxOnIncome, 60000);
  assert.equal(r.rebate, 60000);
  assert.equal(r.totalTax, 0);
});
t("new regime: 15 lakh of salary → 97,500 including 4% cess", () => {
  const r = computeAnnualTax(base({ taxableSalary: 1500000 }));
  assert.equal(r.taxableIncome, 1425000);
  assert.equal(r.taxOnIncome, 93750);
  assert.equal(r.cess, 3750);
  assert.equal(r.totalTax, 97500);
});
t("new regime: 24 lakh of salary → 2,92,500", () => {
  assert.equal(computeAnnualTax(base({ taxableSalary: 2400000 })).totalTax, 292500);
});
t("new regime marginal relief just above 12 lakh: tax is capped at the income above 12 lakh", () => {
  const r = computeAnnualTax(base({ taxableSalary: 1285000 })); // taxable 12,10,000; slab tax 61,500; capped at 10,000; +4% cess
  assert.equal(r.taxableIncome, 1210000);
  assert.equal(r.taxOnIncome, 61500);
  assert.equal(r.totalTax, 10400);
  const edge = computeAnnualTax(base({ taxableSalary: 1275000 + 25000 })); // 12,25,000 taxable: relief ends where slab tax 63,750 = 25,000? no: capped at 25,000
  assert.equal(edge.totalTax, 26000);
});
t("new regime: relief ends once the slab tax is lower than the excess income", () => {
  // At 14,00,000 taxable the slab tax is 90,000 − 0.. compute: 20,000 + 40,000 + 15% of 2,00,000 = 90,000 > excess 2,00,000? no, 90,000 < 2,00,000, so full slab tax applies.
  const r = computeAnnualTax(base({ taxableSalary: 1475000 }));
  assert.equal(r.taxableIncome, 1400000);
  assert.equal(r.totalTax, Math.round(90000 * 1.04 / 10) * 10);
});
t("new regime: surcharge 10% above 50 lakh, with marginal relief just above the threshold", () => {
  const big = computeAnnualTax(base({ taxableSalary: 6075000 })); // taxable 60,00,000
  assert.equal(big.taxOnIncome, 1380000);
  assert.equal(big.surcharge, 138000);
  assert.equal(big.totalTax, 1578720);
  const edge = computeAnnualTax(base({ taxableSalary: 5085000 })); // taxable 50,10,000
  assert.equal(edge.taxableIncome, 5010000);
  assert.equal(edge.taxOnIncome, 1083000);
  assert.equal(edge.surcharge, 7000); // tax + surcharge may not exceed 10,80,000 + 10,000
  assert.equal(edge.totalTax, 1133600);
});
t("new regime: surcharge never exceeds 25%, old regime goes to 37%", () => {
  const nw = computeAnnualTax(base({ taxableSalary: 80000000 }));
  assert.equal(Math.round((nw.surcharge / nw.taxOnIncome) * 100), 25);
  const od = computeAnnualTax(base({ regime: "old", taxableSalary: 80000000 }));
  assert.equal(Math.round((od.surcharge / od.taxOnIncome) * 100), 37);
});
t("old regime: 80C and the 50,000 standard deduction, 10 lakh salary → 75,400", () => {
  const r = computeAnnualTax(base({ regime: "old", taxableSalary: 1000000, declared: decl({ section80C: 150000 }) }));
  assert.equal(r.standardDeduction, 50000);
  assert.equal(r.taxableIncome, 800000);
  assert.equal(r.totalTax, 75400); // 12,500 + 3,00,000 × 20% = 72,500, + 4% cess
});
t("old regime: employee PF counts towards the 1.5 lakh limit of 80C and the limit is not exceeded", () => {
  const r = computeAnnualTax(base({ regime: "old", taxableSalary: 1000000, employeePf: 100000, declared: decl({ section80C: 120000 }) }));
  assert.equal(r.deductions.find((d) => d.section === "80C")?.amount, 150000);
});
t("old regime rebate: nil tax up to 5 lakh, and no relief above it", () => {
  assert.equal(computeAnnualTax(base({ regime: "old", taxableSalary: 550000 })).totalTax, 0);
  const r = computeAnnualTax(base({ regime: "old", taxableSalary: 560000 })); // taxable 5,10,000: 12,500 + 2,000 = 14,500; cess 580
  assert.equal(r.totalTax, 15080);
});
t("old regime by age: senior citizens have a 3 lakh exemption, super seniors 5 lakh", () => {
  assert.equal(computeAnnualTax(base({ regime: "old", age: 62, taxableSalary: 850000 })).totalTax, 72800); // taxable 8,00,000: 10,000 + 60,000 = 70,000 + cess
  assert.equal(computeAnnualTax(base({ regime: "old", age: 82, taxableSalary: 850000 })).totalTax, 62400); // 3,00,000 × 20% = 60,000 + cess
});
t("old regime: professional tax, HRA, home-loan interest and savings interest", () => {
  const r = computeAnnualTax(base({
    regime: "old", taxableSalary: 1500000, basicPlusDa: 600000, hraReceived: 300000, professionalTax: 2500,
    declared: decl({ rentPaidAnnual: 240000, rentInMetro: true, homeLoanInterest: 250000, interestSavings: 15000 }),
  }));
  assert.equal(r.hraExemption, 180000);
  assert.equal(r.professionalTax, 2500);
  assert.equal(r.incomeFromSalary, 1500000 - 180000 - 50000 - 2500);
  assert.equal(r.otherIncome, -200000); // loss from house property is limited to 2 lakh
  assert.equal(r.deductions.find((d) => d.section === "80TTA")?.amount, 10000);
});
t("new regime allows neither HRA, 80C, nor professional tax, but does allow employer NPS", () => {
  const r = computeAnnualTax(base({
    taxableSalary: 1500000, basicPlusDa: 800000, hraReceived: 300000, professionalTax: 2500, employerNps: 120000,
    declared: decl({ section80C: 150000, rentPaidAnnual: 240000, rentInMetro: true }),
  }));
  assert.equal(r.hraExemption, 0);
  assert.equal(r.professionalTax, 0);
  assert.equal(r.deductions.length, 1);
  assert.equal(r.deductions[0].section, "80CCD(2)");
  assert.equal(r.deductions[0].amount, 112000); // 14% of basic + DA
});
t("employer PF/NPS/superannuation above 7.5 lakh a year is taxed as a perquisite (the NPS part is already in salary)", () => {
  const pf = computeAnnualTax(base({ taxableSalary: 3000000, employerPf: 800000 }));
  assert.equal(pf.perquisiteOnEmployerFunds, 50000);
  assert.equal(pf.grossSalary, 3050000);
  const nps = computeAnnualTax(base({ taxableSalary: 3000000, employerPf: 500000, employerNps: 300000 }));
  assert.equal(nps.perquisiteOnEmployerFunds, 0);
  assert.equal(nps.grossSalary, 3300000, "the employer's NPS contribution is part of salary");
  const both = computeAnnualTax(base({ taxableSalary: 3000000, employerPf: 900000, employerNps: 100000 }));
  assert.equal(both.perquisiteOnEmployerFunds, 150000); // 10 lakh − 7.5 lakh = 2.5 lakh over the limit, 1 lakh of which (the NPS) is already in salary
});
t("HRA exemption: least of HRA, rent − 10% of basic+DA, and 50% / 40% of basic+DA", () => {
  assert.equal(hraExemption({ hraReceived: 300000, basicPlusDa: 600000, rentPaidAnnual: 240000, metro: true }, Y25), 180000);
  assert.equal(hraExemption({ hraReceived: 100000, basicPlusDa: 600000, rentPaidAnnual: 240000, metro: true }, Y25), 100000);
  assert.equal(hraExemption({ hraReceived: 300000, basicPlusDa: 600000, rentPaidAnnual: 600000, metro: false }, Y25), 240000);
  assert.equal(hraExemption({ hraReceived: 300000, basicPlusDa: 600000, rentPaidAnnual: 50000, metro: true }, Y25), 0);
  assert.equal(hraExemption({ hraReceived: 300000, basicPlusDa: 600000, rentPaidAnnual: 0, metro: true }, Y25), 0);
});
t("health insurance limits depend on the age of the person insured", () => {
  const r = computeAnnualTax(base({ regime: "old", taxableSalary: 1500000, declared: decl({ section80DSelf: 40000, section80DParents: 70000, section80DParentsSenior: true }) }));
  const d = r.deductions.filter((x) => x.section === "80D").map((x) => x.amount);
  assert.deepEqual(d, [25000, 50000]);
});
t("monthly TDS: what is still due spread over the months that remain", () => {
  const r = monthlyTds({ ...base({ taxableSalary: 1500000 }), tdsDeductedSoFar: 40000, tdsPreviousEmployer: 0, monthsRemaining: 4 });
  assert.equal(r.annual.totalTax, 97500);
  assert.equal(r.balanceTax, 57500);
  assert.equal(r.tds, 14375);
});
t("monthly TDS: a previous employer's tax is credited, nothing negative, the last month clears the balance", () => {
  const r = monthlyTds({ ...base({ taxableSalary: 1500000 }), tdsDeductedSoFar: 0, tdsPreviousEmployer: 30000, monthsRemaining: 9 });
  assert.equal(r.tds, Math.round(67500 / 9));
  assert.equal(monthlyTds({ ...base({ taxableSalary: 500000 }), tdsDeductedSoFar: 5000, tdsPreviousEmployer: 0, monthsRemaining: 3 }).tds, 0);
  assert.equal(monthlyTds({ ...base({ taxableSalary: 1500000 }), tdsDeductedSoFar: 40000, tdsPreviousEmployer: 0, monthsRemaining: 4, isFinalMonth: true }).tds, 57500);
});
t("a year without a table falls back to the nearest earlier year and is marked unconfirmed", () => {
  const y = incomeTaxFor("2030-31");
  assert.equal(y.confirmed, false);
  assert.equal(y.fy, "2030-31");
  assert.ok(BUILTIN_INCOME_TAX.find((x) => x.fy === "2026-27" && !x.confirmed), "FY 2026-27 is carried over and unconfirmed until an administrator checks it");
});
console.log("payroll tax tests passed");
