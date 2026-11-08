import assert from "node:assert/strict";
import { ecrFile, ecrName, esiFile, journalCsv, payrollJournal, payrollRegister, professionalTaxReport, tdsRegister, type ExportSlip } from "../src/lib/products/talentos/payroll/exports";

// Pure: no database. Run with: npx tsx scripts/test-payroll-exports.ts
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const slip = (o: Partial<ExportSlip> = {}): ExportSlip => ({
  employeeId: "e1", employeeCode: "E001", employeeName: "Ravi Kumar-Sharma", grossPay: 65000, netPay: 62000, lopDays: 2, paidDays: 29, monthDays: 31,
  earnings: [{ code: "BASIC", name: "Basic", amount: 30000 }, { code: "HRA", name: "HRA", amount: 15000 }, { code: "SPL", name: "Special", amount: 20000 }],
  deductions: [{ code: "PF", name: "Provident Fund", amount: 1800 }, { code: "PT", name: "Professional Tax", amount: 200 }, { code: "TDS", name: "Income Tax (TDS)", amount: 1000 }],
  employerContributions: [{ code: "ER_EPF", name: "Employer PF (EPF)", amount: 550 }, { code: "ER_EPS", name: "Employer pension (EPS)", amount: 1250 }, { code: "ER_EDLI", name: "EDLI", amount: 75 }, { code: "ER_ADMIN", name: "Admin", amount: 75 }],
  pfWages: 30000, esiWages: 0, esiCovered: false, epsWages: 15000, edliWages: 15000, contributionWages: 15000, taxableEarnings: 65000, regime: "new", annualTax: 0,
  state: "Maharashtra", uan: "100123456789", esiNumber: null, pan: "ABCDE1234F", exitDate: null, held: false, ...o,
});

t("ECR line: the fields in the order EPFO reads them, separated by #~#", () => {
  const r = ecrFile([slip()]);
  assert.equal(r.text, "100123456789#~#RAVI KUMAR SHARMA#~#65000#~#15000#~#15000#~#15000#~#1800#~#1250#~#550#~#2#~#0\r\n");
  assert.deepEqual(r.totals, { epfWages: 15000, epsWages: 15000, edliWages: 15000, employee: 1800, employerEpf: 550, employerEps: 1250 });
});
t("ECR leaves out, and reports, someone with PF but no UAN", () => {
  const r = ecrFile([slip({ uan: null, employeeName: "No Uan", employeeCode: "E002" }), slip()]);
  assert.equal(r.lines, 1);
  assert.deepEqual(r.skipped, [{ employee: "No Uan (E002)", reason: "no UAN" }]);
});
t("ECR ignores someone with no PF at all", () => {
  assert.equal(ecrFile([slip({ deductions: [], contributionWages: 0, epsWages: 0, edliWages: 0, employerContributions: [] })]).lines, 0);
});
t("ECR names are capital letters only", () => {
  assert.equal(ecrName("Ravi O'Neil-Kumar 2nd"), "RAVI O NEIL KUMAR ND");
});
t("ESI file: covered people only, with days, wages, reason code and last working day", () => {
  const covered = slip({ esiCovered: true, esiNumber: "1234567890", esiWages: 18000, deductions: [{ code: "ESI", name: "ESI", amount: 135 }], employerContributions: [{ code: "ER_ESI", name: "Employer ESI", amount: 585 }] });
  const left = slip({ esiCovered: true, esiNumber: "1234567891", employeeName: "Left Person", paidDays: 0, esiWages: 0, exitDate: "2026-06-15" });
  const r = esiFile([covered, left, slip()]);
  const lines = r.text.trim().split("\r\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[1], "1234567890,Ravi Kumar-Sharma,29,18000,0,");
  assert.equal(lines[2], "1234567891,Left Person,0,0,3,15/06/2026");
  assert.deepEqual([r.employee, r.employer], [135, 585]);
  assert.deepEqual(esiFile([slip({ esiCovered: true, esiNumber: null })]).skipped.length, 1);
});
t("professional tax report is grouped by state with a total", () => {
  const lines = professionalTaxReport([slip(), slip({ employeeName: "B", employeeCode: "E2", state: "Karnataka" })]).trim().split("\r\n");
  assert.equal(lines[1].startsWith("Karnataka"), true);
  assert.equal(lines.at(-1), ",,Total,,400");
});
t("TDS register marks a missing PAN and totals the tax", () => {
  const lines = tdsRegister([slip({ pan: null })]).trim().split("\r\n");
  assert.ok(lines[1].includes("NOT AVAILABLE"));
  assert.equal(lines.at(-1), ",Total,,,,,1000");
});
t("payroll register has a column for every head and a total row", () => {
  const lines = payrollRegister([slip(), slip({ employeeCode: "E2", grossPay: 35000, netPay: 33000 })]).trim().split("\r\n");
  assert.ok(lines[0].includes("Basic") && lines[0].includes("Provident Fund") && lines[0].includes("Employer PF (EPF)"));
  assert.ok(lines.at(-1)!.includes("100000"));
});
t("the journal balances: expenses equal what is owed", () => {
  const j = payrollJournal([slip({ grossPay: 65000, netPay: 62000 })]);
  assert.equal(j.balanced, true, JSON.stringify(j.lines));
  assert.ok(journalCsv(j).includes("TDS on salaries payable,,1000"));
});
console.log("payroll exports tests passed");
