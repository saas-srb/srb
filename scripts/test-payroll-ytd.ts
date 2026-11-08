import assert from "node:assert/strict";
import { esiDecisionEarlier, yearToDate, type PayslipLike } from "../src/lib/products/talentos/payroll/ytd";

// Pure: no database. Run with: npx tsx scripts/test-payroll-ytd.ts
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const v2 = (month: string, o: Partial<PayslipLike> = {}): PayslipLike => ({
  month, grossPay: 100000, schemaVersion: 2,
  earnings: [], deductions: [{ code: "PF", name: "Provident Fund", amount: 1800 }, { code: "PT", name: "Professional Tax", amount: 200 }, { code: "TDS", name: "Income Tax (TDS)", amount: 5000 }],
  employerContributions: [{ code: "ER_EPF", name: "x", amount: 550 }, { code: "ER_EPS", name: "x", amount: 1250 }, { code: "ER_NPS", name: "x", amount: 3000 }],
  bases: { taxableEarnings: 95000, basicPlusDa: 40000, hra: 20000 }, statutory: { esiCoveredDecision: true }, ...o,
});
const v1 = (month: string): PayslipLike => ({
  month, grossPay: 60000, earnings: [{ name: "Basic", amount: 30000 }, { name: "HRA", amount: 15000 }, { name: "Special", amount: 15000 }],
  deductions: [{ name: "Provident Fund", amount: 1800 }, { name: "ESI", amount: 100 }, { name: "Professional Tax", amount: 200 }, { name: "TDS", amount: 4000 }],
  employerContributions: [{ name: "Employer PF", amount: 550 }, { name: "Employer EPS", amount: 1250 }],
});

t("nothing earlier in the year gives zero totals", () => {
  assert.equal(yearToDate("2026-04", [v2("2026-03")]).taxableEarnings, 0, "March belongs to the previous year");
  assert.equal(yearToDate("2026-04", []).tds, 0);
});
t("totals from payslips of the same financial year only, and only earlier months", () => {
  const y = yearToDate("2026-07", [v2("2026-04"), v2("2026-05"), v2("2026-06"), v2("2026-07"), v2("2026-08")]);
  assert.deepEqual([y.taxableEarnings, y.basicPlusDa, y.hra, y.employeePf, y.professionalTax, y.tds, y.employerPf, y.employerNps], [285000, 120000, 60000, 5400, 600, 15000, 5400, 9000]);
});
t("half-year gross covers the half of the year the month is in", () => {
  assert.equal(yearToDate("2026-08", [v2("2026-04"), v2("2026-05")]).halfYearGross, 200000);
  assert.equal(yearToDate("2026-11", [v2("2026-04"), v2("2026-09"), v2("2026-10")]).halfYearGross, 100000, "only October is in the October to March half");
});
t("payslips from before the engine kept totals are read from their lines", () => {
  const y = yearToDate("2026-06", [v1("2026-04"), v1("2026-05")]);
  assert.deepEqual([y.taxableEarnings, y.basicPlusDa, y.hra, y.employeePf, y.professionalTax, y.tds, y.employerPf], [120000, 60000, 30000, 3600, 400, 8000, 3600]);
});
t("ESI: the first payslip of the contribution period decides, new and old", () => {
  assert.equal(esiDecisionEarlier("2026-04", [v2("2026-03")]), null, "a new period has no decision yet");
  assert.equal(esiDecisionEarlier("2026-06", [v2("2026-04", { statutory: { esiCoveredDecision: true } }), v2("2026-05", { statutory: { esiCoveredDecision: false } })]), true);
  assert.equal(esiDecisionEarlier("2026-06", [v2("2026-05", { statutory: { esiCoveredDecision: false } })]), false);
  assert.equal(esiDecisionEarlier("2026-06", [v1("2026-05")]), true, "an old payslip with an ESI line was covered");
  assert.equal(esiDecisionEarlier("2026-11", [v2("2026-09"), v2("2026-10", { statutory: { esiCoveredDecision: null } })]), null);
});
console.log("payroll ytd tests passed");
