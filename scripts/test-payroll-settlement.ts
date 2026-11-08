import assert from "node:assert/strict";
import { BUILTIN_STATUTORY } from "../src/lib/products/talentos/payroll/rates";
import { buildSettlement, type SettlementInput } from "../src/lib/products/talentos/payroll/settlement";

// Pure: no database. Run with: npx tsx scripts/test-payroll-settlement.ts
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const base = (o: Partial<SettlementInput> = {}): SettlementInput => ({
  reason: "resignation", joinDate: "2015-01-01", exitDate: "2025-03-31", lastBasicPlusDa: 30000, fixedMonthlyGross: 60000, leaveDaysToEncash: 10, leaveDaysInMonth: 30,
  averageMonthlySalary: 30000, noticeShortfallDays: 0, loansOutstanding: [], otherEarnings: [], otherRecoveries: [], gratuityCoveredByAct: true, fixedTerm: false, payGratuity: true,
  rates: BUILTIN_STATUTORY, ...o,
});
const find = (r: ReturnType<typeof buildSettlement>, name: string) => r.adjustments.find((a) => a.name.startsWith(name));

t("resignation after 10 years: leave encashment and gratuity, both exempt up to the limits", () => {
  const r = buildSettlement(base());
  assert.equal(find(r, "Leave encashment")?.amount, 10000);
  assert.equal(find(r, "Leave encashment")?.taxable, false);
  assert.equal(find(r, "Gratuity")?.amount, 173077);
  assert.equal(find(r, "Gratuity")?.taxable, false);
  assert.equal(r.netAdjustment, 183077);
});
t("a gratuity above the exempt amount is split, and only the balance is taxable", () => {
  const r = buildSettlement(base({ gratuityCoveredByAct: false }));
  assert.deepEqual([find(r, "Gratuity (exempt)")?.amount, r.adjustments.find((a) => a.id === "fnf-gratuity-taxable")?.amount, r.adjustments.find((a) => a.id === "fnf-gratuity-taxable")?.taxable], [150000, 23077, true]);
});
t("under five years: no gratuity", () => {
  const r = buildSettlement(base({ joinDate: "2022-01-01" }));
  assert.equal(find(r, "Gratuity"), undefined);
  assert.equal(r.gratuity?.eligible, false);
});
t("death: gratuity is paid whatever the service", () => {
  assert.ok(find(buildSettlement(base({ joinDate: "2024-01-01", reason: "death" })), "Gratuity"));
});
t("unserved notice is recovered at a day's gross for each day short", () => {
  const r = buildSettlement(base({ noticeShortfallDays: 15 }));
  assert.equal(r.noticeRecovery, 30000);
  assert.equal(find(r, "Notice period shortfall")?.kind, "deduction");
});
t("outstanding loans are recovered in full, and other dues and earnings are carried over", () => {
  const r = buildSettlement(base({
    loansOutstanding: [{ loanId: "L1", name: "Salary advance", balance: 40000 }],
    otherEarnings: [{ name: "Performance incentive", amount: 12000, taxable: true }],
    otherRecoveries: [{ name: "Laptop not returned", amount: 5000 }],
    payGratuity: false, leaveDaysToEncash: 0,
  }));
  assert.equal(r.loanRecovery, 40000);
  assert.equal(r.netAdjustment, 12000 - 40000 - 5000);
  assert.equal(find(r, "Performance incentive")?.taxable, true);
});
t("nothing to settle gives no adjustments", () => {
  assert.deepEqual(buildSettlement(base({ leaveDaysToEncash: 0, payGratuity: false })).adjustments, []);
});
console.log("payroll settlement tests passed");
