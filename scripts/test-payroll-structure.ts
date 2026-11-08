import assert from "node:assert/strict";
import { BUILTIN_STATUTORY } from "../src/lib/products/talentos/payroll/rates";
import { buildFromCtc, storedGross, toPayrollStructure } from "../src/lib/products/talentos/payroll/structure";

// Pure: no database. Run with: npx tsx scripts/test-payroll-structure.ts
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };

t("a stored structure becomes engine components, with sensible defaults for each allowance", () => {
  const s = toPayrollStructure({
    basic: 30000, da: 2000, hra: 15000,
    allowances: [{ name: "Special allowance", amount: 20000 }, { name: "Medical reimbursement", amount: 1250, taxable: false, esi: false, prorate: false }, { name: "Special allowance", amount: 500 }],
    deductions: [{ name: "Canteen", amount: 500 }, { name: "Zero", amount: 0 }], employerNps: 3000,
  });
  const by = (code: string) => s.components.find((c) => c.code === code)!;
  assert.equal(s.components.length, 6);
  assert.deepEqual([by("BASIC").pf, by("DA").pf, by("HRA").pf, by("SPECIAL_ALLOWANCE").pf], [true, true, false, false]);
  assert.deepEqual([by("SPECIAL_ALLOWANCE").taxable, by("SPECIAL_ALLOWANCE").esi, by("SPECIAL_ALLOWANCE").prorate], [true, true, true]);
  const medical = by("MEDICAL_REIMBURSEMENT");
  assert.deepEqual([medical.kind, medical.taxable, medical.esi, medical.prorate], ["reimbursement", false, false, false]);
  assert.ok(by("SPECIAL_ALLOWANCE_3"), "a repeated name gets its own code");
  assert.deepEqual(s.fixedDeductions, [{ name: "Canteen", amount: 500 }]);
  assert.equal(s.employerNps, 3000);
  assert.equal(storedGross({ basic: 30000, da: 2000, hra: 15000, allowances: [{ name: "x", amount: 20000 }] }), 67000);
});
t("CTC 12 lakh: basic 40%, HRA 50% of basic, PF on the ceiling, gratuity and EDLI/admin inside the CTC", () => {
  const b = buildFromCtc({ annualCtc: 1200000, basicPercentOfCtc: 40, hraPercentOfBasic: 50, otherAllowances: [], pfMode: "ceiling", employerNpsPercent: 0, includeGratuity: true, includeEdliAndAdmin: true, employerOtherCostMonthly: 0, rates: BUILTIN_STATUTORY });
  assert.deepEqual([b.monthlyCtc, b.basic, b.hra, b.employerPf, b.edliAndAdmin, b.gratuity], [100000, 40000, 20000, 1800, 150, 1923]);
  assert.equal(b.gross, 100000 - 1800 - 150 - 1923);
  assert.equal(b.specialAllowance, 96127 - 40000 - 20000);
  assert.equal(b.gross + b.employerPf + b.edliAndAdmin + b.gratuity + b.employerEsi, b.monthlyCtc, "gross plus the employer's contributions is exactly the CTC");
  assert.equal(b.feasible, true);
});
t("a low CTC brings in employer ESI, which is carved out of the gross", () => {
  const b = buildFromCtc({ annualCtc: 264000, basicPercentOfCtc: 50, hraPercentOfBasic: 40, otherAllowances: [], pfMode: "ceiling", employerNpsPercent: 0, includeGratuity: false, includeEdliAndAdmin: false, employerOtherCostMonthly: 0, rates: BUILTIN_STATUTORY });
  assert.ok(b.employerEsi > 0);
  assert.ok(b.gross <= 21000);
  assert.equal(b.gross + b.employerPf + b.employerEsi, b.monthlyCtc);
});
t("employer NPS and other fixed allowances come out of the CTC; an impossible split is reported", () => {
  const b = buildFromCtc({ annualCtc: 1200000, basicPercentOfCtc: 40, hraPercentOfBasic: 50, otherAllowances: [{ name: "Conveyance", amount: 1600 }], pfMode: "ceiling", employerNpsPercent: 10, includeGratuity: true, includeEdliAndAdmin: true, employerOtherCostMonthly: 500, rates: BUILTIN_STATUTORY });
  assert.equal(b.employerNps, 4000);
  assert.equal(b.specialAllowance, b.gross - 40000 - 20000 - 1600);
  const low = buildFromCtc({ annualCtc: 120000, basicPercentOfCtc: 90, hraPercentOfBasic: 50, otherAllowances: [{ name: "Conveyance", amount: 5000 }], pfMode: "ceiling", employerNpsPercent: 0, includeGratuity: true, includeEdliAndAdmin: true, employerOtherCostMonthly: 0, rates: BUILTIN_STATUTORY });
  assert.equal(low.feasible, false);
});
console.log("payroll structure tests passed");
