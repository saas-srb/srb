/**
 * The files payroll hands to other people: the provident fund return (ECR), the ESI contribution file, the professional tax and TDS
 * registers, the payroll register and the accounting journal (pure: strings in, strings out). A figure here is taken from the approved
 * payslip, never recomputed, so the returns always agree with what was paid.
 */

export interface ExportSlip {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  grossPay: number;
  netPay: number;
  lopDays: number;
  paidDays: number;
  monthDays: number;
  earnings: { code?: string; name: string; amount: number }[];
  deductions: { code?: string; name: string; amount: number }[];
  employerContributions: { code?: string; name: string; amount: number }[];
  pfWages: number;
  esiWages: number;
  esiCovered: boolean;
  epsWages: number;
  edliWages: number;
  contributionWages: number;
  taxableEarnings: number;
  regime: string;
  annualTax: number | null;
  state: string | null;
  // From the employee's payroll profile
  uan: string | null;
  esiNumber: string | null;
  pan: string | null;
  exitDate: string | null;
  held: boolean;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const amountOf = (rows: { code?: string; name: string; amount: number }[], codes: string[], names: string[] = []) =>
  sum(rows.filter((r) => (r.code && codes.includes(r.code)) || (!r.code && names.includes(r.name))).map((r) => r.amount));

const csvCell = (v: string | number | null | undefined): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const csv = (rows: (string | number | null | undefined)[][]): string => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** "RAVI KUMAR-SHARMA" → "RAVI KUMAR SHARMA": the ECR accepts capital letters, spaces and dots in a name. */
export function ecrName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z .]/g, " ").replace(/\s+/g, " ").trim().slice(0, 85);
}

export interface EcrResult {
  text: string;
  lines: number;
  /** Employees left out and why (no UAN, no PF wages). */
  skipped: { employee: string; reason: string }[];
  totals: { epfWages: number; epsWages: number; edliWages: number; employee: number; employerEpf: number; employerEps: number };
}

/**
 * The monthly EPFO return, in the ECR text format: one line per member,
 * UAN#~#name#~#gross wages#~#EPF wages#~#EPS wages#~#EDLI wages#~#EPF contribution#~#EPS contribution#~#EPF-EPS difference#~#NCP days#~#refund of advances.
 */
export function ecrFile(slips: ExportSlip[]): EcrResult {
  const lines: string[] = [];
  const skipped: EcrResult["skipped"] = [];
  const totals = { epfWages: 0, epsWages: 0, edliWages: 0, employee: 0, employerEpf: 0, employerEps: 0 };
  for (const s of slips) {
    const employee = amountOf(s.deductions, ["PF"], ["Provident Fund"]);
    if (employee === 0 && s.contributionWages === 0) continue;
    if (!s.uan) {
      skipped.push({ employee: `${s.employeeName} (${s.employeeCode})`, reason: "no UAN" });
      continue;
    }
    const employerEps = amountOf(s.employerContributions, ["ER_EPS"], ["Employer EPS"]);
    const employerEpf = amountOf(s.employerContributions, ["ER_EPF"], ["Employer PF"]);
    lines.push([s.uan, ecrName(s.employeeName), Math.round(s.grossPay), Math.round(s.contributionWages), Math.round(s.epsWages), Math.round(s.edliWages), employee, employerEps, employerEpf, Math.round(s.lopDays), 0].join("#~#"));
    totals.epfWages += s.contributionWages;
    totals.epsWages += s.epsWages;
    totals.edliWages += s.edliWages;
    totals.employee += employee;
    totals.employerEpf += employerEpf;
    totals.employerEps += employerEps;
  }
  return { text: lines.join("\r\n") + (lines.length ? "\r\n" : ""), lines: lines.length, skipped, totals };
}

/** ESI monthly contribution file: IP number, name, days wages were paid for, wages, reason code for a zero-wage month, last working day (dd/mm/yyyy). */
export function esiFile(slips: ExportSlip[]): { text: string; skipped: { employee: string; reason: string }[]; employee: number; employer: number } {
  const rows: (string | number)[][] = [["IP Number", "IP Name", "No of Days for which wages paid/payable during the month", "Total Monthly Wages", "Reason Code for Zero workings days (numeric only; provide 0 for all other reasons)", "Last Working Day (Format DD/MM/YYYY or DD-MM-YYYY)"]];
  const skipped: { employee: string; reason: string }[] = [];
  let employee = 0;
  let employer = 0;
  for (const s of slips) {
    if (!s.esiCovered) continue;
    if (!s.esiNumber) {
      skipped.push({ employee: `${s.employeeName} (${s.employeeCode})`, reason: "no ESI (IP) number" });
      continue;
    }
    const days = Math.round(s.paidDays);
    const reason = days > 0 ? 0 : s.exitDate ? 3 : 1;
    const last = s.exitDate ? `${s.exitDate.slice(8, 10)}/${s.exitDate.slice(5, 7)}/${s.exitDate.slice(0, 4)}` : "";
    rows.push([s.esiNumber, s.employeeName, days, Math.round(s.esiWages), reason, last]);
    employee += amountOf(s.deductions, ["ESI"], ["ESI"]);
    employer += amountOf(s.employerContributions, ["ER_ESI"], ["Employer ESI"]);
  }
  return { text: csv(rows), skipped, employee, employer };
}

export function professionalTaxReport(slips: ExportSlip[]): string {
  const rows: (string | number)[][] = [["State", "Employee code", "Employee", "Gross wages", "Professional tax"]];
  for (const s of [...slips].sort((a, b) => (a.state ?? "").localeCompare(b.state ?? "") || a.employeeName.localeCompare(b.employeeName))) {
    const pt = amountOf(s.deductions, ["PT"], ["Professional Tax"]);
    if (pt > 0) rows.push([s.state ?? "Not set", s.employeeCode, s.employeeName, Math.round(s.grossPay), pt]);
  }
  const total = sum(slips.map((s) => amountOf(s.deductions, ["PT"], ["Professional Tax"])));
  rows.push(["", "", "Total", "", total]);
  return csv(rows);
}

export function tdsRegister(slips: ExportSlip[]): string {
  const rows: (string | number)[][] = [["Employee code", "Employee", "PAN", "Regime", "Taxable earnings this month", "Estimated tax for the year", "Tax deducted this month"]];
  for (const s of slips) {
    const tds = amountOf(s.deductions, ["TDS"], ["TDS"]);
    rows.push([s.employeeCode, s.employeeName, s.pan ?? "NOT AVAILABLE", s.regime, Math.round(s.taxableEarnings), s.annualTax ?? "", tds]);
  }
  rows.push(["", "Total", "", "", "", "", sum(slips.map((s) => amountOf(s.deductions, ["TDS"], ["TDS"])))]);
  return csv(rows);
}

/** Every earning and deduction head as a column, one row per employee. */
export function payrollRegister(slips: ExportSlip[]): string {
  const earningHeads = [...new Set(slips.flatMap((s) => s.earnings.map((e) => e.name)))];
  const deductionHeads = [...new Set(slips.flatMap((s) => s.deductions.map((d) => d.name)))];
  const employerHeads = [...new Set(slips.flatMap((s) => s.employerContributions.map((d) => d.name)))];
  const head = ["Employee code", "Employee", "Days in month", "Days paid", "Loss of pay days", ...earningHeads, "Gross", ...deductionHeads, "Net pay", ...employerHeads, "Held"];
  const rows: (string | number)[][] = [head];
  const col = (xs: { name: string; amount: number }[], name: string) => sum(xs.filter((x) => x.name === name).map((x) => x.amount));
  for (const s of slips) rows.push([s.employeeCode, s.employeeName, s.monthDays, s.paidDays, s.lopDays, ...earningHeads.map((h) => col(s.earnings, h)), s.grossPay, ...deductionHeads.map((h) => col(s.deductions, h)), s.netPay, ...employerHeads.map((h) => col(s.employerContributions, h)), s.held ? "Yes" : ""]);
  rows.push(["", "Total", "", "", "", ...earningHeads.map((h) => sum(slips.map((s) => col(s.earnings, h)))), sum(slips.map((s) => s.grossPay)), ...deductionHeads.map((h) => sum(slips.map((s) => col(s.deductions, h)))), sum(slips.map((s) => s.netPay)), ...employerHeads.map((h) => sum(slips.map((s) => col(s.employerContributions, h)))), ""]);
  return csv(rows);
}

export interface JournalLine {
  account: string;
  debit: number;
  credit: number;
}

/**
 * The accounting entry for a payroll run, for the accountant: salary and the employer's contributions as expenses, and what is owed to
 * the employees, the provident fund, ESIC, the tax authorities and the state as liabilities. Debits equal credits.
 */
export function payrollJournal(slips: ExportSlip[]): { lines: JournalLine[]; balanced: boolean } {
  const gross = sum(slips.map((s) => s.grossPay));
  const net = sum(slips.map((s) => s.netPay));
  const employeePf = sum(slips.map((s) => amountOf(s.deductions, ["PF"], ["Provident Fund"])));
  const esiEmployee = sum(slips.map((s) => amountOf(s.deductions, ["ESI"], ["ESI"])));
  const pt = sum(slips.map((s) => amountOf(s.deductions, ["PT"], ["Professional Tax"])));
  const lwfEmployee = sum(slips.map((s) => amountOf(s.deductions, ["LWF"], [])));
  const tds = sum(slips.map((s) => amountOf(s.deductions, ["TDS"], ["TDS"])));
  const loans = sum(slips.map((s) => sum(s.deductions.filter((d) => d.code?.startsWith("LOAN:") || d.code?.startsWith("ADJ:fnf-loan-")).map((d) => d.amount))));
  const otherRecoveries = sum(slips.map((s) => sum(s.deductions.map((d) => d.amount)))) - employeePf - esiEmployee - pt - lwfEmployee - tds - loans;
  const erPf = sum(slips.map((s) => amountOf(s.employerContributions, ["ER_EPF", "ER_EPS", "ER_EDLI", "ER_ADMIN"], ["Employer PF", "Employer EPS"])));
  const erEsi = sum(slips.map((s) => amountOf(s.employerContributions, ["ER_ESI"], ["Employer ESI"])));
  const erLwf = sum(slips.map((s) => amountOf(s.employerContributions, ["ER_LWF"], [])));
  const erNps = sum(slips.map((s) => amountOf(s.employerContributions, ["ER_NPS"], [])));
  const erGratuity = sum(slips.map((s) => amountOf(s.employerContributions, ["ER_GRATUITY"], [])));
  const lines: JournalLine[] = [
    { account: "Salaries and wages", debit: gross, credit: 0 },
    { account: "Employer contribution to provident fund (incl. EDLI and admin charges)", debit: erPf, credit: 0 },
    { account: "Employer contribution to ESI", debit: erEsi, credit: 0 },
    { account: "Employer contribution to labour welfare fund", debit: erLwf, credit: 0 },
    { account: "Employer contribution to NPS", debit: erNps, credit: 0 },
    { account: "Gratuity provision", debit: erGratuity, credit: 0 },
    { account: "Salary payable (net pay)", debit: 0, credit: net },
    { account: "Provident fund payable (employee + employer)", debit: 0, credit: employeePf + erPf },
    { account: "ESI payable (employee + employer)", debit: 0, credit: esiEmployee + erEsi },
    { account: "Professional tax payable", debit: 0, credit: pt },
    { account: "Labour welfare fund payable", debit: 0, credit: lwfEmployee + erLwf },
    { account: "TDS on salaries payable", debit: 0, credit: tds },
    { account: "NPS payable", debit: 0, credit: erNps },
    { account: "Gratuity provision (liability)", debit: 0, credit: erGratuity },
    { account: "Loans and advances to employees (recovered)", debit: 0, credit: loans },
    { account: "Other recoveries from employees", debit: 0, credit: Math.max(0, otherRecoveries) },
  ].filter((l) => l.debit !== 0 || l.credit !== 0);
  const debit = sum(lines.map((l) => l.debit));
  const credit = sum(lines.map((l) => l.credit));
  return { lines, balanced: debit === credit };
}

export function journalCsv(j: { lines: JournalLine[] }): string {
  const rows: (string | number)[][] = [["Account", "Debit", "Credit"], ...j.lines.map((l) => [l.account, l.debit || "", l.credit || ""])];
  rows.push(["Total", sum(j.lines.map((l) => l.debit)), sum(j.lines.map((l) => l.credit))]);
  return csv(rows);
}
