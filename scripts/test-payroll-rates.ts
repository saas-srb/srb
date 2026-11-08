import assert from "node:assert/strict";
import { BUILTIN_INCOME_TAX, BUILTIN_PT, BUILTIN_STATUTORY, type IncomeTaxYear, type PtRule } from "../src/lib/products/talentos/payroll/rates";
import { validateIncomeTaxYear, validateLwfRule, validatePtRule, validateStatutory } from "../src/lib/products/talentos/payroll/rates-validate";

// Pure: no database. Run with: npx tsx scripts/test-payroll-rates.ts
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

t("every built-in table passes its own validation", () => {
  for (const y of BUILTIN_INCOME_TAX) assert.deepEqual(validateIncomeTaxYear(y), [], y.fy);
  assert.deepEqual(validateStatutory(BUILTIN_STATUTORY), []);
  for (const r of BUILTIN_PT) assert.deepEqual(validatePtRule(r), [], r.state);
});
t("tax slabs must increase and end open", () => {
  const y = clone(BUILTIN_INCOME_TAX[1]) as IncomeTaxYear;
  y.newRegime.slabs[2].upTo = 100;
  assert.ok(validateIncomeTaxYear(y).some((m) => m.includes("slab 3")));
  const open = clone(BUILTIN_INCOME_TAX[1]) as IncomeTaxYear;
  open.newRegime.slabs[open.newRegime.slabs.length - 1].upTo = 9999999;
  assert.ok(validateIncomeTaxYear(open).some((m) => m.includes("no upper limit")));
});
t("a rate outside 0 to 100 and a bad year are refused", () => {
  const y = clone(BUILTIN_INCOME_TAX[1]) as IncomeTaxYear;
  y.newRegime.slabs[1].rate = 120;
  y.fy = "2025-27";
  const errors = validateIncomeTaxYear(y);
  assert.ok(errors.some((m) => m.includes("rate")) && errors.some((m) => m.includes("2026-27")));
});
t("statutory rates: EPS cannot exceed the employer's PF, bonus minimum cannot exceed its maximum", () => {
  const s = clone(BUILTIN_STATUTORY);
  s.providentFund.epsPercent = 15;
  s.bonus.minPercent = 25;
  const errors = validateStatutory(s);
  assert.ok(errors.some((m) => m.includes("EPS")) && errors.some((m) => m.includes("Bonus minimum")));
});
t("professional-tax slabs may not have a gap or an overlap", () => {
  const r = clone(BUILTIN_PT.find((x) => x.state === "West Bengal")!) as PtRule;
  r.slabs[2].from = 15500;
  assert.ok(validatePtRule(r).some((m) => m.includes("gap or overlap")));
  const bad = clone(BUILTIN_PT.find((x) => x.state === "Maharashtra")!) as PtRule;
  bad.slabs[2].monthAmounts = { "13": 5 };
  assert.ok(validatePtRule(bad).some((m) => m.includes("not a month")));
  assert.ok(validatePtRule({ ...clone(BUILTIN_PT[0]), state: "Atlantis" }).some((m) => m.includes("Atlantis")));
});
t("a half-yearly state needs its months; a labour welfare rule needs real months", () => {
  const r: PtRule = { state: "Kerala", frequency: "half_yearly", slabs: [{ from: 0, to: null, amount: 100 }], annualCap: 2500, confirmed: false, source: "t" };
  assert.ok(validatePtRule(r).some((m) => m.includes("months")));
  assert.deepEqual(validateLwfRule({ state: "Maharashtra", payMonths: ["06", "12"], employee: 12, employer: 36, wageCeiling: 0, confirmed: false, source: "t" }), []);
  assert.ok(validateLwfRule({ state: "Maharashtra", payMonths: ["13"], employee: -1, employer: 36, wageCeiling: 0, confirmed: false, source: "t" }).length >= 2);
});
console.log("payroll rates tests passed");
