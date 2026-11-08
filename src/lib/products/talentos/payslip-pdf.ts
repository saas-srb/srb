import "server-only";
import { getPayslip, getRun, payslipsForEmployee, type PayComponentLine } from "@/lib/products/talentos/payroll-run";
import { getEmployee, employeeFullName } from "@/lib/products/talentos/employees";
import { getEmploymentTypeLabel, getGenderLabel } from "@/lib/products/talentos/employee-status";
import { masterLookups } from "@/lib/products/talentos/departments";
import { getPayrollProfile } from "@/lib/products/talentos/payroll";
import { getPayrollConfig, fyStartMonthString } from "@/lib/products/talentos/payroll-config";
import { getPayoutForPayslip } from "@/lib/products/talentos/salary-payouts";
import { getCompanyDetails, formatCompanyAddress, type CompanyDetails } from "@/lib/products/talentos/company";
import { rupeesInWords } from "@/lib/number-to-words";
import { monthLabelLong } from "@/lib/products/talentos/payroll-status";

/**
 * Assembles a fully-serialised payslip payload (no Dates, no ciphertext) shared
 * by the PDF renderer (`PayslipPdfDocument`) and the on-screen `PayslipView`.
 */

export interface PayLine {
  name: string;
  amount: number;
  ytd: number;
  /** For an earning cut for loss of pay: what it is at full pay for the month. */
  fixed?: number;
}

export interface PayslipPdfData {
  payslipId: string;
  month: string;
  monthLabel: string;
  runStatus: string;
  isProvisional: boolean;

  company: {
    name: string;
    legalName: string;
    address: string;
    email: string;
    phone: string;
    website: string;
    registrations: { label: string; value: string }[];
    signatoryName: string;
    signatoryDesignation: string;
    note: string;
  };

  employeeId: string;
  employee: {
    name: string;
    code: string;
    designation: string;
    department: string;
    team: string;
    location: string;
    employmentType: string;
    gender: string;
    dateOfBirth: string | null;
    joiningDate: string | null;
    pan: string;
    uan: string;
    pfNumber: string;
    esiNumber: string;
  };

  period: {
    workingDays: number;
    lopDays: number;
    daysPaid: number;
    payDate: string | null;
    monthDays: number | null;
    /** Why days were not paid, in words. */
    notes: string[];
  };
  /** How the income tax was worked out (payslips made by the statutory engine). */
  tax: { regime: "new" | "old"; fy: string; taxableIncome: number; yearTax: number; thisMonth: number; deductedSoFar: number } | null;

  earnings: PayLine[];
  deductions: PayLine[];
  employerContributions: PayComponentLine[];
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  employerCost: number;
  ytd: { gross: number; deductions: number; net: number; monthsCount: number };
  netInWords: string;

  payment: {
    mode: string;
    status: string;
    bankName: string | null;
    accountMasked: string | null;
    ifsc: string | null;
    utr: string | null;
    paidOn: string | null;
  } | null;

  generatedAt: string;
}

function registrationRows(c: CompanyDetails): { label: string; value: string }[] {
  return (
    [
      ["PAN", c.pan],
      ["GSTIN", c.gstin],
      ["CIN", c.cin],
      ["PF Code", c.pfEstablishmentCode],
      ["ESI Code", c.esiEstablishmentCode],
      ["LIN", c.lin],
    ] as const
  )
    .filter(([, v]) => v && v.trim())
    .map(([label, value]) => ({ label, value: value.trim() }));
}

export async function getPayslipPdfData(payslipId: string): Promise<PayslipPdfData | null> {
  const slip = await getPayslip(payslipId);
  if (!slip) return null;

  const [run, employee, profile, company, config, payout, lookups, history] = await Promise.all([
    getRun(slip.runId),
    getEmployee(slip.employeeId),
    getPayrollProfile(slip.employeeId),
    getCompanyDetails(),
    getPayrollConfig(),
    getPayoutForPayslip(payslipId),
    masterLookups(),
    payslipsForEmployee(slip.employeeId),
  ]);
  if (!run || !employee) return null;

  // YTD — same financial year, up to and including this month.
  const fyStart = fyStartMonthString(slip.month, config.financialYearStartMonth);
  const fySlips = history
    .map((h) => h.payslip)
    .filter((p) => p.month >= fyStart && p.month <= slip.month);

  const sumBy = (rows: { name: string; amount: number }[], name: string) =>
    rows.reduce((acc, r) => (r.name === name ? acc + r.amount : acc), 0);
  const ytdFor = (name: string, kind: "earnings" | "deductions") =>
    fySlips.reduce((acc, p) => acc + sumBy(p[kind], name), 0);

  const earnings: PayLine[] = slip.earnings.map((e) => ({ name: e.name, amount: e.amount, ytd: ytdFor(e.name, "earnings"), fixed: e.fixedAmount !== undefined && e.fixedAmount !== e.amount ? e.fixedAmount : undefined }));
  const tdsThisMonth = slip.deductions.filter((d) => d.code === "TDS" || (!d.code && d.name === "TDS")).reduce((n, d) => n + d.amount, 0);
  const tdsBefore = fySlips.filter((p) => p.month < slip.month).reduce((n, p) => n + p.deductions.filter((d) => d.code === "TDS" || (!d.code && d.name === "TDS")).reduce((m, d) => m + d.amount, 0), 0);
  const deductions: PayLine[] = slip.deductions.map((d) => ({ name: d.name, amount: d.amount, ytd: ytdFor(d.name, "deductions") }));

  const ytd = {
    gross: fySlips.reduce((a, p) => a + p.grossPay, 0),
    deductions: fySlips.reduce((a, p) => a + p.totalDeductions, 0),
    net: fySlips.reduce((a, p) => a + p.netPay, 0),
    monthsCount: fySlips.length,
  };

  const isProvisional = run.status !== "paid";
  const payDate = run.paidAt ?? run.approvedAt ?? null;

  return {
    payslipId: slip._id,
    month: slip.month,
    monthLabel: monthLabelLong(slip.month),
    runStatus: run.status,
    isProvisional,

    company: {
      name: company.name,
      legalName: company.legalName,
      address: formatCompanyAddress(company),
      email: company.email,
      phone: company.phone,
      website: company.website,
      registrations: registrationRows(company),
      signatoryName: company.signatoryName,
      signatoryDesignation: company.signatoryDesignation,
      note: company.payslipNote,
    },

    employeeId: employee._id,
    employee: {
      name: employeeFullName(employee),
      code: employee.employeeCode,
      designation: lookups.designationTitle(employee.professional?.designationId),
      department: lookups.departmentName(employee.professional?.departmentId),
      team: lookups.teamName(employee.professional?.teamId),
      location: [employee.personal?.city, employee.personal?.state].filter(Boolean).join(", ") || "—",
      employmentType: getEmploymentTypeLabel(employee.professional?.employmentType ?? undefined),
      gender: getGenderLabel(employee.personal?.gender ?? undefined),
      dateOfBirth: employee.personal?.dateOfBirth ?? null,
      joiningDate: employee.professional?.joiningDate ?? null,
      pan: profile?.panNumber ?? "",
      uan: profile?.uan ?? "",
      pfNumber: profile?.pfNumber ?? "",
      esiNumber: profile?.esiNumber ?? "",
    },

    period: {
      workingDays: slip.workingDays,
      lopDays: slip.lopDays,
      daysPaid: slip.paidDays ?? Math.max(0, slip.workingDays - slip.lopDays),
      payDate: payDate ? new Date(payDate).toISOString() : null,
      monthDays: slip.monthDays ?? null,
      notes: slip.daysNotes ?? [],
    },
    tax: slip.tax?.annual ? { regime: slip.tax.regime, fy: slip.tax.fy, taxableIncome: slip.tax.annual.taxableIncome, yearTax: slip.tax.annual.totalTax, thisMonth: tdsThisMonth, deductedSoFar: tdsBefore + tdsThisMonth } : null,

    earnings,
    deductions,
    employerContributions: slip.employerContributions.map((c) => ({ name: c.name, amount: c.amount })),
    grossPay: slip.grossPay,
    totalDeductions: slip.totalDeductions,
    netPay: slip.netPay,
    employerCost: slip.employerCost,
    ytd,
    netInWords: rupeesInWords(slip.netPay),

    payment: payout
      ? {
          mode: payout.paymentProvider === "razorpay" ? "Bank Transfer (RazorpayX)" : "Bank Transfer",
          status: payout.status,
          bankName: payout.bankName,
          accountMasked: payout.bankAccountLast4 ? `XXXXXX${payout.bankAccountLast4}` : null,
          ifsc: payout.ifsc,
          utr: payout.status === "paid" ? payout.utr : null,
          paidOn: payout.paidAt ? new Date(payout.paidAt).toISOString() : null,
        }
      : null,

    generatedAt: new Date().toISOString(),
  };
}
