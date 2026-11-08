import assert from "node:assert/strict";
import { BUILTIN_PT, BUILTIN_STATUTORY, normaliseState, ptRuleFor, type LwfRule, type PtRule } from "../src/lib/products/talentos/payroll/rates";
import {
  computeEsi, computeGratuity, computeLeaveEncashment, computeLwf, computePf, computePt, esiCovered, esiPeriodStart, gratuityMonthlyProvision, statutoryBonusMonthly,
} from "../src/lib/products/talentos/payroll/statutory";

// Pure: no database. Run with: npx tsx scripts/test-payroll-statutory.ts
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const PF = BUILTIN_STATUTORY.providentFund;
const ESI = BUILTIN_STATUTORY.esi;
const rule = (state: string) => ptRuleFor(state, BUILTIN_PT);

t("PF on wages above the ceiling: 12% of 15,000, EPS 8.33% capped at 1,250, the rest to EPF", () => {
  const r = computePf({ pfWages: 20000, mode: "ceiling", epsEligible: true, rates: PF });
  assert.deepEqual([r.contributionWages, r.employee, r.employerEps, r.employerEpf, r.employerTotal, r.edli, r.admin], [15000, 1800, 1250, 550, 1800, 75, 75]);
});
t("PF below the ceiling: contributions on the actual wages", () => {
  const r = computePf({ pfWages: 12000, mode: "ceiling", epsEligible: true, rates: PF });
  assert.deepEqual([r.employee, r.employerEps, r.employerEpf, r.edli, r.admin], [1440, 1000, 440, 60, 60]);
});
t("PF on actual wages above the ceiling (higher contribution): EPS stays capped, admin is on the full wage", () => {
  const r = computePf({ pfWages: 20000, mode: "actual", epsEligible: true, rates: PF });
  assert.deepEqual([r.contributionWages, r.employee, r.employerEps, r.employerEpf, r.edli, r.admin], [20000, 2400, 1250, 1150, 75, 100]);
});
t("a member who is not in the pension scheme: the employer's whole 12% goes to EPF", () => {
  const r = computePf({ pfWages: 20000, mode: "ceiling", epsEligible: false, rates: PF });
  assert.deepEqual([r.employerEps, r.employerEpf, r.epsWages], [0, 1800, 0]);
});
t("PF on nothing is nothing", () => {
  assert.equal(computePf({ pfWages: 0, mode: "ceiling", epsEligible: true, rates: PF }).employee, 0);
});
t("ESI contributions round up to the next rupee", () => {
  const r = computeEsi({ covered: true, esiWages: 18500, paidDays: 30, rates: ESI });
  assert.deepEqual([r.employee, r.employer], [139, 602]); // 138.75 and 601.25
});
t("ESI: an employee earning no more than 176 a day pays nothing, the employer still pays", () => {
  const r = computeEsi({ covered: true, esiWages: 5000, paidDays: 30, rates: ESI });
  assert.deepEqual([r.employee, r.employer, r.employeeExempt], [0, 163, true]);
});
t("ESI is not charged to someone who is not covered", () => {
  assert.equal(computeEsi({ covered: false, esiWages: 18000, paidDays: 30, rates: ESI }).employer, 0);
});
t("ESI coverage: decided on the first month of a contribution period and kept to its end", () => {
  const c = (monthlyWages: number, decidedEarlierInPeriod: boolean | null, disabled = false) => esiCovered({ monthlyWages, disabled, decidedEarlierInPeriod, rates: ESI });
  assert.equal(c(21000, null), true);
  assert.equal(c(21001, null), false);
  assert.equal(c(24000, null, true), true);
  assert.equal(c(25001, null, true), false);
  assert.equal(c(30000, true), true, "covered at the start of the period stays covered when wages rise");
  assert.equal(c(15000, false), false, "not covered at the start stays out until the next period");
  assert.equal(c(0, null), false);
});
t("ESI contribution periods", () => {
  assert.equal(esiPeriodStart("2026-04"), "2026-04");
  assert.equal(esiPeriodStart("2026-09"), "2026-04");
  assert.equal(esiPeriodStart("2026-10"), "2026-10");
  assert.equal(esiPeriodStart("2027-02"), "2026-10");
  assert.equal(esiPeriodStart("2026-03"), "2025-10");
});
t("professional tax, Maharashtra: men by slab, women exempt to 25,000, February is ₹300, the year never exceeds ₹2,500", () => {
  const pt = (wages: number, month: string, gender: "male" | "female", done = 0) => computePt({ state: "Maharashtra", gender, wages, month, deductedThisYear: done, rule: rule("Maharashtra") }).amount;
  assert.equal(pt(7500, "2026-05", "male"), 0);
  assert.equal(pt(7501, "2026-05", "male"), 175);
  assert.equal(pt(10000, "2026-05", "male"), 175);
  assert.equal(pt(10001, "2026-05", "male"), 200);
  assert.equal(pt(12000, "2027-02", "male"), 300);
  assert.equal(pt(20000, "2026-05", "female"), 0);
  assert.equal(pt(26000, "2026-05", "female"), 200);
  assert.equal(pt(12000, "2027-02", "male", 2200), 300);
  assert.equal(pt(12000, "2027-02", "male", 2400), 100, "capped so the year ends at 2,500");
  assert.equal(pt(12000, "2027-03", "male", 2500), 0);
});
t("professional tax, West Bengal slabs", () => {
  const pt = (wages: number) => computePt({ state: "West Bengal", gender: null, wages, month: "2026-05", deductedThisYear: 0, rule: rule("West Bengal") }).amount;
  assert.deepEqual([pt(10000), pt(12000), pt(20000), pt(30000), pt(45000)], [0, 110, 130, 150, 200]);
});
t("professional tax: unknown state, state without a rule, state without the tax, and an unconfirmed rule are each reported", () => {
  assert.equal(computePt({ state: null, gender: null, wages: 30000, month: "2026-05", deductedThisYear: 0, rule: null }).issue, "no_state");
  assert.equal(computePt({ state: "Nagaland", gender: null, wages: 30000, month: "2026-05", deductedThisYear: 0, rule: rule("Nagaland") }).issue, "no_rule");
  const delhi = computePt({ state: "Delhi", gender: null, wages: 90000, month: "2026-05", deductedThisYear: 0, rule: rule("Delhi") });
  assert.deepEqual([delhi.amount, delhi.issue], [0, null]);
  assert.equal(computePt({ state: "Karnataka", gender: null, wages: 30000, month: "2026-05", deductedThisYear: 0, rule: rule("Karnataka") }).issue, "not_confirmed");
  const confirmed: PtRule = { ...rule("Karnataka")!, confirmed: true };
  assert.equal(computePt({ state: "Karnataka", gender: null, wages: 30000, month: "2026-05", deductedThisYear: 0, rule: confirmed }).issue, null);
});
t("professional tax in a half-yearly state is deducted only in its months, on the half-year's wages", () => {
  const half: PtRule = { state: "Kerala", frequency: "half_yearly", payMonths: ["09", "03"], slabs: [{ from: 0, to: 11999, amount: 0 }, { from: 12000, to: null, amount: 120 }], annualCap: 2500, confirmed: true, source: "test" };
  assert.equal(computePt({ state: "Kerala", gender: null, wages: 90000, month: "2026-08", deductedThisYear: 0, rule: half }).amount, 0);
  assert.equal(computePt({ state: "Kerala", gender: null, wages: 90000, month: "2026-09", deductedThisYear: 0, rule: half }).amount, 120);
});
t("labour welfare fund: only in its months, only when switched on and a rule exists", () => {
  const lwf: LwfRule = { state: "Maharashtra", payMonths: ["06", "12"], employee: 12, employer: 36, wageCeiling: 0, confirmed: true, source: "test" };
  assert.deepEqual(computeLwf({ state: "Maharashtra", month: "2026-06", wages: 30000, rule: lwf, enabled: true }), { employee: 12, employer: 36, issue: null });
  assert.equal(computeLwf({ state: "Maharashtra", month: "2026-07", wages: 30000, rule: lwf, enabled: true }).employee, 0);
  assert.equal(computeLwf({ state: "Maharashtra", month: "2026-06", wages: 30000, rule: lwf, enabled: false }).employee, 0);
  assert.equal(computeLwf({ state: "Maharashtra", month: "2026-06", wages: 30000, rule: null, enabled: true }).issue, "no_rule");
});
t("statutory bonus: percentage of the wage up to the ceiling, only for wages up to 21,000", () => {
  const B = BUILTIN_STATUTORY.bonus;
  assert.equal(statutoryBonusMonthly({ basicPlusDa: 15000, percent: 8.33, minimumWage: 0, rates: B }), 583);
  assert.equal(statutoryBonusMonthly({ basicPlusDa: 15000, percent: 8.33, minimumWage: 10000, rates: B }), 833);
  assert.equal(statutoryBonusMonthly({ basicPlusDa: 25000, percent: 8.33, minimumWage: 0, rates: B }), 0);
  assert.equal(statutoryBonusMonthly({ basicPlusDa: 15000, percent: 5, minimumWage: 0, rates: B }), 583, "never below 8.33%");
  assert.equal(statutoryBonusMonthly({ basicPlusDa: 15000, percent: 30, minimumWage: 0, rates: B }), 1400, "never above 20%");
});
t("gratuity: 15/26 of last basic + DA for each year, a part-year over six months counts as a year", () => {
  const G = BUILTIN_STATUTORY.gratuity;
  const a = computeGratuity({ lastBasicPlusDa: 30000, joinDate: "2015-01-01", exitDate: "2025-03-31", coveredByAct: true, rates: G });
  assert.deepEqual([a.eligible, a.years, a.amount, a.exempt, a.taxable], [true, 10, 173077, 173077, 0]);
  const b = computeGratuity({ lastBasicPlusDa: 30000, joinDate: "2015-01-01", exitDate: "2025-08-15", coveredByAct: true, rates: G });
  assert.deepEqual([b.years, b.amount], [11, 190385]);
});
t("gratuity: not payable before five years (unless death, disability or a fixed-term contract of a year), capped at 20 lakh", () => {
  const G = BUILTIN_STATUTORY.gratuity;
  assert.equal(computeGratuity({ lastBasicPlusDa: 30000, joinDate: "2022-01-01", exitDate: "2025-01-01", coveredByAct: true, rates: G }).eligible, false);
  assert.equal(computeGratuity({ lastBasicPlusDa: 30000, joinDate: "2022-01-01", exitDate: "2025-01-01", deathOrDisability: true, coveredByAct: true, rates: G }).eligible, true);
  assert.equal(computeGratuity({ lastBasicPlusDa: 30000, joinDate: "2022-01-01", exitDate: "2025-01-01", fixedTerm: true, coveredByAct: true, rates: G }).eligible, true);
  const big = computeGratuity({ lastBasicPlusDa: 500000, joinDate: "2000-01-01", exitDate: "2025-01-01", coveredByAct: true, rates: G });
  assert.deepEqual([big.amount, big.exempt, big.taxable], [2000000, 2000000, 0]);
  assert.equal(gratuityMonthlyProvision(30000, G), 1442);
});
t("gratuity outside the Act: exempt is half a month's salary per year, the rest is taxable", () => {
  const r = computeGratuity({ lastBasicPlusDa: 30000, joinDate: "2015-01-01", exitDate: "2025-03-31", coveredByAct: false, rates: BUILTIN_STATUTORY.gratuity });
  assert.deepEqual([r.amount, r.exempt, r.taxable], [173077, 150000, 23077]);
});
t("leave encashment: exempt only on leaving, up to ten months' average salary", () => {
  const L = BUILTIN_STATUTORY.leaveEncashment;
  assert.deepEqual(computeLeaveEncashment({ days: 10, basicPlusDa: 30000, daysInMonth: 30, averageMonthlySalary: 40000, onLeaving: true, rates: L }), { amount: 10000, exempt: 10000, taxable: 0 });
  assert.deepEqual(computeLeaveEncashment({ days: 10, basicPlusDa: 30000, daysInMonth: 30, averageMonthlySalary: 40000, onLeaving: false, rates: L }), { amount: 10000, exempt: 0, taxable: 10000 });
  assert.equal(computeLeaveEncashment({ days: 400, basicPlusDa: 90000, daysInMonth: 30, averageMonthlySalary: 100000, onLeaving: true, rates: L }).exempt, 1000000, "capped at ten months of average salary");
});
t("states are recognised from free text", () => {
  assert.equal(normaliseState("maharashtra "), "Maharashtra");
  assert.equal(normaliseState("MH"), "Maharashtra");
  assert.equal(normaliseState("Orissa"), "Odisha");
  assert.equal(normaliseState("new delhi"), "Delhi");
  assert.equal(normaliseState("Tamilnadu"), "Tamil Nadu");
  assert.equal(normaliseState("Atlantis"), null);
  assert.equal(normaliseState(""), null);
});
console.log("payroll statutory tests passed");
