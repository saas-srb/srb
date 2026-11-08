"use client";

import { Printer, FileDown } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { monthLabelLong } from "@/lib/products/talentos/payroll-status";

interface Line {
  name: string;
  amount: number;
  /** For an earning cut for loss of pay: what it is at full pay. */
  fixed?: number;
}

export interface PayslipViewData {
  payslipId: string;
  month: string;
  employeeName: string;
  employeeCode: string;
  workingDays: number;
  lopDays: number;
  earnings: Line[];
  grossPay: number;
  deductions: Line[];
  totalDeductions: number;
  employerContributions: Line[];
  employerCost: number;
  netPay: number;
  bankAccountLast4: string | null;
  bankName: string | null;
  ifsc: string | null;
  runStatus: string;
  monthDays?: number | null;
  daysPaid?: number;
  notes?: string[];
  tax?: { regime: "new" | "old"; fy: string; taxableIncome: number; yearTax: number; thisMonth: number; deductedSoFar: number } | null;
  /** Present on the employee-facing page (assembled by getPayslipPdfData). */
  netInWords?: string;
  company?: {
    name: string;
    legalName: string;
    address: string;
    email: string;
    phone: string;
    registrations: { label: string; value: string }[];
  };
  employee?: {
    designation: string;
    department: string;
    location: string;
    joiningDate: string | null;
    pan: string;
    uan: string;
    pfNumber: string;
    esiNumber: string;
  };
  payment?: {
    mode: string;
    status: string;
    utr: string | null;
    paidOn: string | null;
  } | null;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

export default function PayslipView({ data, showPrint = true }: { data: PayslipViewData; showPrint?: boolean }) {
  const provisional = data.runStatus !== "paid";
  const daysPaid = data.daysPaid ?? Math.max(0, data.workingDays - data.lopDays);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        <a
          href={`/api/talentos/payslips/${data.payslipId}/pdf`}
          className={buttonVariants({ size: "sm" })}
        >
          <FileDown className="size-3.5" data-icon="inline-start" />
          Download PDF
        </a>
        {showPrint && (
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-3.5" data-icon="inline-start" />
            Print
          </Button>
        )}
      </div>

      <div className="payslip overflow-hidden rounded-2xl border border-border/60 bg-card text-sm text-card-foreground">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 bg-muted/30 p-6">
          <div className="flex items-start gap-3">
            <BrandMark className="mt-0.5 size-9 shrink-0" />
            <div>
              <p className="text-base font-black tracking-tight text-foreground">{data.company?.name ?? ""}</p>
              {data.company?.legalName && data.company.legalName !== data.company.name && (
                <p className="text-xs text-muted-foreground">{data.company.legalName}</p>
              )}
              {data.company?.address && <p className="text-xs text-muted-foreground">{data.company.address}</p>}
              {data.company && (
                <p className="text-xs text-muted-foreground">
                  {[data.company.email, data.company.phone].filter(Boolean).join("  ·  ")}
                </p>
              )}
              {data.company && data.company.registrations.length > 0 && (
                <p className="mt-1 text-[11px] text-foreground">
                  {data.company.registrations.map((r) => `${r.label}: ${r.value}`).join("   ")}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-black uppercase tracking-widest text-foreground">Payslip</p>
            <p className="text-sm font-semibold text-primary">{monthLabelLong(data.month)}</p>
            {provisional ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">Provisional — run {data.runStatus}</p>
            ) : (
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Confidential</p>
            )}
          </div>
        </div>

        <div className="space-y-5 p-6">
          {/* Employee */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border/60 p-4 sm:grid-cols-3">
            <Field label="Name" value={data.employeeName} />
            <Field label="Employee code" value={data.employeeCode} />
            <Field label="Designation" value={data.employee?.designation} />
            <Field label="Department" value={data.employee?.department} />
            <Field label="Location" value={data.employee?.location} />
            <Field label="Date of joining" value={data.employee?.joiningDate ? formatDate(data.employee.joiningDate) : undefined} />
            <Field label="PAN" value={data.employee?.pan} />
            <Field label="UAN" value={data.employee?.uan} />
            <Field
              label="PF / ESI No."
              value={data.employee ? [data.employee.pfNumber, data.employee.esiNumber].filter(Boolean).join(" / ") : undefined}
            />
          </div>

          {/* Pay period strip */}
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-center sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{data.monthDays ? "Days in month" : "Working days"}</p>
              <p className="text-sm font-semibold text-foreground">{data.monthDays ?? data.workingDays}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">LOP days</p>
              <p className="text-sm font-semibold text-foreground">{data.lopDays}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Days paid</p>
              <p className="text-sm font-semibold text-foreground">{daysPaid}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Bank A/C</p>
              <p className="text-sm font-semibold text-foreground">{data.bankAccountLast4 ? `XXXXXX${data.bankAccountLast4}` : "—"}</p>
            </div>
          </div>

          {data.notes && data.notes.length > 0 && <p className="text-xs text-muted-foreground">{data.notes.join(" ")}</p>}

          {/* Earnings / Deductions */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Earnings</p>
              <table className="w-full">
                <tbody>
                  {data.earnings.map((e, i) => (
                    <tr key={i} className="border-b border-border/40 last:border-0">
                      <td className="py-1.5">{e.name}{e.fixed !== undefined && <span className="ml-1 text-[11px] text-muted-foreground">(of {formatCurrency(e.fixed)})</span>}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatCurrency(e.amount)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold text-foreground">
                    <td className="pt-2">Gross Pay</td>
                    <td className="pt-2 text-right tabular-nums">{formatCurrency(data.grossPay)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deductions</p>
              <table className="w-full">
                <tbody>
                  {data.deductions.length === 0 && (
                    <tr><td className="py-1.5 text-muted-foreground">None</td><td /></tr>
                  )}
                  {data.deductions.map((d, i) => (
                    <tr key={i} className="border-b border-border/40 last:border-0">
                      <td className="py-1.5">{d.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatCurrency(d.amount)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold text-foreground">
                    <td className="pt-2">Total Deductions</td>
                    <td className="pt-2 text-right tabular-nums">{formatCurrency(data.totalDeductions)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Net pay */}
          <div className="rounded-xl bg-primary/10 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Net Pay</span>
              <span className="text-lg font-black text-foreground tabular-nums">{formatCurrency(data.netPay)}</span>
            </div>
            {data.netInWords && <p className="mt-1 text-xs text-muted-foreground">{data.netInWords}</p>}
          </div>

          {data.tax && (
            <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              Income tax ({data.tax.regime === "new" ? "new" : "old"} regime, FY {data.tax.fy}): estimated taxable income for the year {formatCurrency(data.tax.taxableIncome)}, tax for the year {formatCurrency(data.tax.yearTax)}, deducted this month {formatCurrency(data.tax.thisMonth)}, deducted so far this year {formatCurrency(data.tax.deductedSoFar)}.
            </p>
          )}

          {/* Employer contributions */}
          <div className="border-t border-border/60 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Employer Contributions (not deducted from pay)
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              {data.employerContributions.map((c, i) => (
                <span key={i}>
                  {c.name}: <span className="font-medium text-foreground">{formatCurrency(c.amount)}</span>
                </span>
              ))}
              <span>Total cost to company: <span className="font-medium text-foreground">{formatCurrency(data.employerCost)}</span></span>
            </div>
          </div>

          {/* Payment details */}
          {data.payment !== undefined && (
            <div className="border-t border-border/60 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment Details</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Field label="Mode" value={data.payment?.mode ?? "—"} />
                <Field label="Status" value={data.payment?.status ?? "—"} />
                <Field label="Bank" value={data.bankName} />
                <Field label="IFSC" value={data.ifsc} />
                <Field label="UTR / Reference" value={data.payment?.utr ?? "—"} />
                <Field label="Paid on" value={data.payment?.paidOn ? formatDate(data.payment.paidOn) : "—"} />
              </div>
            </div>
          )}

          <p className={cn("border-t border-border/60 pt-3 text-[11px] text-muted-foreground")}>
            This is a computer-generated payslip and does not require a signature. Statutory deductions follow the rates the law sets
            for the month, and income tax follows the employee&apos;s declared tax regime.
          </p>
        </div>
      </div>
    </div>
  );
}
