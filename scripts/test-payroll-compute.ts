import assert from "node:assert/strict";
import { BUILTIN_INCOME_TAX, BUILTIN_PT, BUILTIN_STATUTORY, incomeTaxFor, ptRuleFor, type LwfRule } from "../src/lib/products/talentos/payroll/rates";
import { DEFAULT_PAID_DAYS_POLICY, computePaidDays, type PaidDaysDay } from "../src/lib/products/talentos/payroll/paid-days";
import { DEFAULT_ENGINE_POLICY, ZERO_YTD, computePayslip, type PayslipInput, type StructureComponent } from "../src/lib/products/talentos/payroll/compute";
import { NO_DEDUCTIONS } from "../src/lib/products/talentos/payroll/tax";

// Pure: no database. Run with: npx tsx scripts/test-payroll-compute.ts
// Expected figures are worked out by hand from the statutory rules, not copied from the engine.
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };

const comp = (code: string, name: string, amount: number, kind: StructureComponent["kind"], o: Partial<StructureComponent> = {}): StructureComponent => ({
  code, name, amount, kind, taxable: true, pf: kind === "basic" || kind === "da", esi: true, prorate: true, ...o,
});
const fullMonth = (month: string, o: { absent?: string[] } = {}) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days: PaidDaysDay[] = [];
  for (let d = 1; d <= last; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const working = dow !== 0 && dow !== 6;
    days.push({ date, kind: working ? "working" : "weekly_off", attendance: working ? (o.absent?.includes(date) ? "absent" : "present") : "none", leave: null, workedMinutes: working ? 480 : 0 });
  }
  return days;
};
function input(month: string, components: StructureComponent[], o: Partial<PayslipInput> & { absent?: string[]; state?: string | null } = {}): PayslipInput {
  const days = computePaidDays({ month, joinDate: null, exitDate: null, days: fullMonth(month, { absent: o.absent }), policy: DEFAULT_PAID_DAYS_POLICY });
  return {
    month,
    employee: { id: "e1", gender: "male", dateOfBirth: "1990-01-01", state: o.state === undefined ? "Maharashtra" : o.state, joinDate: null, exitDate: null, pan: "ABCDE1234F", hasUan: true, hasEsiNumber: true, hasBankAccount: true },
    profile: { pfApplicable: true, pfMode: "ceiling", epsEligible: true, esiApplicable: true, esiDisabled: false, ptApplicable: true, lwfApplicable: false, tdsApplicable: true },
    structure: { components, fixedDeductions: [], employerNps: 0 },
    days,
    monthWorkingDays: days.workingDays,
    adjustments: [],
    loans: [],
    declaration: { regime: "new", amounts: NO_DEDUCTIONS, previousEmployer: { taxableSalary: 0, employeePf: 0, professionalTax: 0, tds: 0 } },
    ytd: ZERO_YTD,
    esiDecidedEarlierInPeriod: null,
    overrides: { arrears: 0, manualTds: null, otherDeductions: 0 },
    policy: DEFAULT_ENGINE_POLICY,
    rates: { statutory: BUILTIN_STATUTORY, incomeTax: incomeTaxFor("2026-27", BUILTIN_INCOME_TAX), pt: ptRuleFor(o.state === undefined ? "Maharashtra" : o.state, BUILTIN_PT), lwf: null },
    ...o,
  };
}
const line = (arr: { code: string; amount: number }[], code: string) => arr.find((x) => x.code === code)?.amount ?? 0;
const STD = [comp("BASIC", "Basic", 30000, "basic"), comp("HRA", "HRA", 15000, "hra"), comp("SPL", "Special allowance", 20000, "allowance")];

t("a ₹65,000 salary in Maharashtra: PF on the 15,000 ceiling, ₹200 professional tax, no income tax under the new regime", () => {
  const s = input("2026-05", STD);
  const p = computePayslip(s);
  assert.equal(p.grossEarned, 65000);
  assert.equal(p.statutory.pfWages, 30000);
  assert.equal(line(p.deductions, "PF"), 1800);
  assert.equal(line(p.deductions, "PT"), 200);
  assert.equal(line(p.deductions, "TDS"), 0, "annual 7.8 lakh − 75,000 = 7.05 lakh: tax 15,250, all rebated");
  assert.equal(p.netPay, 65000 - 1800 - 200);
  assert.deepEqual([line(p.employerContributions, "ER_EPF"), line(p.employerContributions, "ER_EPS"), line(p.employerContributions, "ER_EDLI"), line(p.employerContributions, "ER_ADMIN")], [550, 1250, 75, 75]);
  assert.equal(line(p.employerContributions, "ER_GRATUITY"), 1442);
  assert.equal(p.employerCost, 65000 + 550 + 1250 + 75 + 75 + 1442);
});
t("income tax is the year's tax spread over the months left: ₹1,50,000 a month in April → 12,567", () => {
  const p = computePayslip(input("2026-04", [comp("BASIC", "Basic", 60000, "basic"), comp("HRA", "HRA", 30000, "hra"), comp("SPL", "Special", 60000, "allowance")]));
  assert.equal(p.tax.annual?.taxableIncome, 1725000);
  assert.equal(p.tax.annual?.totalTax, 150800);
  assert.equal(p.tax.monthsRemaining, 12);
  assert.equal(line(p.deductions, "TDS"), 12567);
});
t("income tax later in the year: tax already deducted is credited and the rest spread over what remains", () => {
  const s = input("2026-10", [comp("BASIC", "Basic", 60000, "basic"), comp("HRA", "HRA", 30000, "hra"), comp("SPL", "Special", 60000, "allowance")], {
    ytd: { ...ZERO_YTD, taxableEarnings: 150000 * 6, basicPlusDa: 60000 * 6, hra: 30000 * 6, employerPf: 1800 * 6, employeePf: 1800 * 6, professionalTax: 1200, tds: 12567 * 6 },
  });
  const p = computePayslip(s);
  assert.equal(p.tax.monthsRemaining, 6);
  assert.equal(p.tax.annual?.totalTax, 150800);
  assert.equal(line(p.deductions, "TDS"), Math.round((150800 - 12567 * 6) / 6));
});
t("a bonus in a month raises the projected year and so that month's tax", () => {
  const s = input("2026-04", [comp("BASIC", "Basic", 60000, "basic"), comp("HRA", "HRA", 30000, "hra"), comp("SPL", "Special", 60000, "allowance")], {
    adjustments: [{ id: "b1", kind: "earning", name: "Annual bonus", amount: 300000, taxable: true, pf: false, esi: false }],
  });
  const p = computePayslip(s);
  assert.equal(p.grossEarned, 450000);
  assert.equal(p.tax.annual?.taxableIncome, 1725000 + 300000);
  assert.ok(line(p.deductions, "TDS") > 12567);
});
t("loss of pay: pay is pro-rated, PF is on the earned basic, and the payslip says why", () => {
  const p = computePayslip(input("2026-03", STD, { absent: ["2026-03-10", "2026-03-11"] }));
  assert.equal(p.daysSummary.lopDays, 2);
  assert.equal(p.earnings.find((e) => e.code === "BASIC")?.amount, 28065); // 30,000 × 29 / 31
  assert.equal(p.earnings.find((e) => e.code === "BASIC")?.fixedAmount, 30000);
  assert.equal(p.statutory.pfWages, 28065);
  assert.equal(p.daysSummary.notes[0], "2 day(s) absent.");
});
t("ESI applies up to 21,000: wages, rounding up, and the decision is kept for the period", () => {
  const s = input("2026-06", [comp("BASIC", "Basic", 10000, "basic"), comp("HRA", "HRA", 4000, "hra"), comp("OTH", "Other", 6000, "allowance")]);
  const p = computePayslip(s);
  assert.deepEqual([p.statutory.esi.covered, p.statutory.esi.wages, p.statutory.esi.employee, p.statutory.esi.employer], [true, 20000, 150, 650]);
  assert.equal(p.statutory.esiCoveredDecision, true);
  assert.equal(line(p.deductions, "ESI"), 150);
  // Next month the pay rises above 21,000, but the person stays covered to the end of the period.
  const raised = computePayslip(input("2026-07", [comp("BASIC", "Basic", 12000, "basic"), comp("HRA", "HRA", 6000, "hra"), comp("OTH", "Other", 8000, "allowance")], { esiDecidedEarlierInPeriod: true }));
  assert.equal(raised.statutory.esi.covered, true);
  const fresh = computePayslip(input("2026-07", [comp("BASIC", "Basic", 12000, "basic"), comp("HRA", "HRA", 6000, "hra"), comp("OTH", "Other", 8000, "allowance")]));
  assert.equal(fresh.statutory.esi.covered, false);
});
t("overtime is not ESI wages but is taxable gross", () => {
  const days: PaidDaysDay[] = fullMonth("2026-06").map((d) => (d.date === "2026-06-02" ? { ...d, workedMinutes: 600 } : d));
  const s = input("2026-06", [comp("BASIC", "Basic", 10400, "basic"), comp("OTH", "Other", 5200, "allowance")]);
  s.policy = { ...s.policy, paidDays: { overtime: { enabled: true, afterMinutesPerDay: 480, multiplier: 2, holidayMultiplier: 2 } } };
  s.days = computePaidDays({ month: "2026-06", joinDate: null, exitDate: null, days, policy: { ...DEFAULT_PAID_DAYS_POLICY, overtime: s.policy.paidDays.overtime } });
  s.monthWorkingDays = 22;
  const p = computePayslip(s);
  // 2 hours at 10,400 / 22 / 8 = 59.09 an hour, twice
  assert.equal(p.earnings.find((e) => e.code === "OT")?.amount, 236);
  assert.equal(p.statutory.esiWages, 15600);
});
t("deductions are kept within 50% of wages and what could not be taken stays due", () => {
  const s = input("2026-06", [comp("BASIC", "Basic", 12000, "basic"), comp("OTH", "Other", 8000, "allowance")], {
    loans: [{ loanId: "L1", name: "Salary advance", emi: 15000 }],
  });
  const p = computePayslip(s);
  const statutory = p.deductions.filter((d) => d.group !== "loan").reduce((a, d) => a + d.amount, 0);
  assert.equal(line(p.deductions, "LOAN:L1"), 10000 - statutory);
  assert.equal(p.carriedForward, 15000 - (10000 - statutory));
  assert.ok(p.warnings.some((w) => w.code === "deduction_deferred"));
});
t("net pay is never negative: a blocking warning instead", () => {
  const s = input("2026-06", [comp("BASIC", "Basic", 12000, "basic")], { overrides: { arrears: 0, manualTds: 20000, otherDeductions: 0 } });
  const p = computePayslip(s);
  assert.equal(p.netPay, 0);
  assert.ok(p.warnings.some((w) => w.code === "negative_net" && w.level === "blocking"));
});
t("old regime with declarations: 80C and HRA reduce the tax", () => {
  const components = [comp("BASIC", "Basic", 50000, "basic"), comp("HRA", "HRA", 25000, "hra"), comp("SPL", "Special", 25000, "allowance")];
  const nw = computePayslip(input("2026-04", components));
  const od = computePayslip(input("2026-04", components, { declaration: { regime: "old", amounts: { ...NO_DEDUCTIONS, section80C: 150000, rentPaidAnnual: 360000, rentInMetro: true }, previousEmployer: { taxableSalary: 0, employeePf: 0, professionalTax: 0, tds: 0 } } }));
  assert.ok(od.tax.annual!.hraExemption > 0);
  assert.equal(od.tax.annual!.deductions.find((d) => d.section === "80C")?.amount, 150000);
  assert.notEqual(od.tax.tds, nw.tax.tds);
});
t("previous employer's salary and tax are taken into account", () => {
  const components = [comp("BASIC", "Basic", 60000, "basic"), comp("HRA", "HRA", 30000, "hra"), comp("SPL", "Special", 60000, "allowance")];
  const none = computePayslip(input("2026-10", components));
  const withPrev = computePayslip(input("2026-10", components, { declaration: { regime: "new", amounts: NO_DEDUCTIONS, previousEmployer: { taxableSalary: 900000, employeePf: 0, professionalTax: 0, tds: 20000 } } }));
  assert.ok(withPrev.tax.annual!.taxableIncome > none.tax.annual!.taxableIncome);
});
t("a person leaving this month: all the year's remaining tax is deducted now", () => {
  const s = input("2026-09", [comp("BASIC", "Basic", 120000, "basic"), comp("HRA", "HRA", 60000, "hra"), comp("SPL", "Special", 120000, "allowance")], {
    ytd: { ...ZERO_YTD, taxableEarnings: 300000 * 5, basicPlusDa: 600000, hra: 300000, tds: 12567 * 5 },
  });
  s.employee = { ...s.employee, exitDate: "2026-09-30" };
  const p = computePayslip(s);
  assert.equal(p.tax.monthsRemaining, 1, "months left run only to the month of leaving");
  assert.equal(p.tax.annual?.taxableIncome, 1725000, "five months paid + this month, nothing projected after leaving");
  assert.equal(line(p.deductions, "TDS"), 150800 - 12567 * 5);
});
t("employee not covered by PF, ESI or PT: nothing is deducted", () => {
  const s = input("2026-05", STD);
  s.profile = { ...s.profile, pfApplicable: false, esiApplicable: false, ptApplicable: false };
  const p = computePayslip(s);
  assert.deepEqual([line(p.deductions, "PF"), line(p.deductions, "ESI"), line(p.deductions, "PT")], [0, 0, 0]);
  assert.equal(p.employerContributions.some((c) => c.code === "ER_EPF"), false);
});
t("a work state without a rule, a missing PAN, UAN and bank account are all raised for review", () => {
  const s = input("2026-05", STD, { state: "Nagaland" });
  s.employee = { ...s.employee, pan: null, hasUan: false, hasBankAccount: false };
  const codes = computePayslip(s).warnings.map((w) => w.code);
  for (const c of ["no_pan", "no_uan", "no_bank", "pt_no_rule"]) assert.ok(codes.includes(c), c);
});
t("the labour welfare fund is deducted in its months when a rule exists", () => {
  const lwf: LwfRule = { state: "Maharashtra", payMonths: ["06", "12"], employee: 12, employer: 36, wageCeiling: 0, confirmed: true, source: "test" };
  const s = input("2026-06", STD);
  s.profile = { ...s.profile, lwfApplicable: true };
  s.rates = { ...s.rates, lwf };
  const p = computePayslip(s);
  assert.equal(line(p.deductions, "LWF"), 12);
  assert.equal(line(p.employerContributions, "ER_LWF"), 36);
});
t("the Code on Wages 50% rule lifts PF wages when basic is low", () => {
  const s = input("2026-05", [comp("BASIC", "Basic", 20000, "basic"), comp("SPL", "Special", 60000, "allowance")]);
  s.policy = { ...s.policy, wageDefinition: "fifty_percent_rule" };
  assert.equal(computePayslip(s).statutory.pfWages, 40000);
  assert.equal(computePayslip(input("2026-05", [comp("BASIC", "Basic", 20000, "basic"), comp("SPL", "Special", 60000, "allowance")])).statutory.pfWages, 20000);
});
t("PF on actual wages when the company and employee agree to contribute more", () => {
  const s = input("2026-05", STD);
  s.profile = { ...s.profile, pfMode: "actual" };
  assert.equal(line(computePayslip(s).deductions, "PF"), 3600);
});
t("arrears and one-off earnings are earnings; fixed and one-off deductions are recovered", () => {
  const s = input("2026-05", STD, {
    overrides: { arrears: 5000, manualTds: null, otherDeductions: 300 },
    adjustments: [{ id: "x", kind: "deduction", name: "Damaged laptop", amount: 700, taxable: false, pf: false, esi: false }],
  });
  s.structure = { ...s.structure, fixedDeductions: [{ name: "Canteen", amount: 500 }] };
  const p = computePayslip(s);
  assert.equal(p.earnings.find((e) => e.code === "ARREARS")?.amount, 5000);
  assert.deepEqual([line(p.deductions, "FIXED:Canteen"), line(p.deductions, "ADJ:x"), line(p.deductions, "OTHER")], [500, 700, 300]);
});
t("the statutory bonus is an earning for low-paid employees only", () => {
  const s = input("2026-05", [comp("BASIC", "Basic", 12000, "basic"), comp("OTH", "Other", 6000, "allowance")]);
  s.policy = { ...s.policy, statutoryBonus: { enabled: true, percent: 8.33, minimumWage: 0 } };
  assert.equal(computePayslip(s).earnings.find((e) => e.code === "BONUS")?.amount, 583);
  const high = input("2026-05", STD);
  high.policy = s.policy;
  assert.equal(computePayslip(high).earnings.some((e) => e.code === "BONUS"), false);
});
t("a person already employed earlier in the year but with no payslips in the system is flagged, because their tax would come out too low", () => {
  const codes = (p: ReturnType<typeof computePayslip>) => p.warnings.map((w) => w.code);
  assert.ok(codes(computePayslip(input("2026-09", STD))).includes("no_opening_balance"));
  assert.ok(!codes(computePayslip(input("2026-04", STD))).includes("no_opening_balance"), "April is the first month: nothing is missing");
  const joined = input("2026-09", STD);
  joined.employee = { ...joined.employee, joinDate: "2026-09-01" };
  assert.ok(!codes(computePayslip(joined)).includes("no_opening_balance"), "joined this month");
  const entered = input("2026-09", STD);
  entered.declaration = { ...entered.declaration, previousEmployer: { taxableSalary: 325000, employeePf: 9000, professionalTax: 1000, tds: 0 } };
  assert.ok(!codes(computePayslip(entered)).includes("no_opening_balance"), "opening balance entered");
  const withHistory = input("2026-09", STD, { ytd: { ...ZERO_YTD, taxableEarnings: 325000 } });
  assert.ok(!codes(computePayslip(withHistory)).includes("no_opening_balance"), "earlier payslips exist");
});
console.log("payroll compute tests passed");
