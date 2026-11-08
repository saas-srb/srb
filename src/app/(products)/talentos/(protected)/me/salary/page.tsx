import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Badge } from "@/components/ui/badge";
import SalaryStructureView from "@/components/products/talentos/SalaryStructureView";
import BankAccountBadge from "@/components/products/talentos/BankAccountBadge";
import PayoutStatusBadge from "@/components/products/talentos/PayoutStatusBadge";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { getPayrollProfile } from "@/lib/products/talentos/payroll";
import { payslipsForEmployee } from "@/lib/products/talentos/payroll-run";
import { getPrimaryBankAccount, serializeBankAccount } from "@/lib/products/talentos/bank-accounts";
import { payoutsForEmployee, serializePayout } from "@/lib/products/talentos/salary-payouts";
import { payrollRunStatusMeta, monthLabelLong } from "@/lib/products/talentos/payroll-status";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function MySalaryPage() {
  const user = await getCurrentHrmsUser();
  const employeeId = user!.employeeId!;

  const [profile, payslips, primaryBank, payouts] = await Promise.all([
    getPayrollProfile(employeeId),
    payslipsForEmployee(employeeId),
    getPrimaryBankAccount(employeeId),
    payoutsForEmployee(employeeId),
  ]);
  const bank = primaryBank ? serializeBankAccount(primaryBank) : null;

  return (
    <div className="space-y-5">
      <PanelPageHeader
        title={<>Salary &amp; Payments</>}
        description={<>Your structure, payslips and salary payment history.</>}
      />

      <PanelListFilters>
<GlassCard interactive={false}>
        <CardHeader><CardTitle>Salary Bank Account</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {bank ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{bank.bankName}</span>
              <span className="font-mono text-xs text-muted-foreground">{bank.accountNumberMasked}</span>
              <span className="text-xs text-muted-foreground">{bank.ifsc}</span>
              <BankAccountBadge status={bank.verificationStatus} />
            </div>
          ) : (
            <p className="text-muted-foreground">No bank account on file — contact HR to add one.</p>
          )}
        </CardContent>
      </GlassCard>

      {profile ? (
        <SalaryStructureView basic={profile.basic} da={profile.da} hra={profile.hra} allowances={profile.allowances} deductions={profile.deductions} />
      ) : (
        <GlassCard interactive={false}>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Your salary structure has not been set up yet.</CardContent>
        </GlassCard>
      )}

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Payslips</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {payslips.length === 0 && <p className="text-sm text-muted-foreground">No payslips have been published yet.</p>}
          {payslips.map(({ payslip, run }) => {
            const meta = payrollRunStatusMeta(run.status);
            return (
              <div
                key={payslip._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3 text-sm"
              >
                <Link href={`/talentos/me/salary/${payslip.month}`} className="min-w-0 flex-1 hover:underline">
                  <p className="font-medium">{monthLabelLong(payslip.month)}</p>
                  <p className="text-xs text-muted-foreground">
                    {run.paidAt ? `Paid ${formatDate(run.paidAt)}` : `Approved ${run.approvedAt ? formatDate(run.approvedAt) : ""}`}
                  </p>
                </Link>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-foreground tabular-nums">{formatCurrency(payslip.netPay)}</span>
                  <Badge className={meta.badgeClass}>{meta.label}</Badge>
                  <a
                    href={`/api/talentos/payslips/${payslip._id}/pdf`}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                    title="Download PDF"
                    aria-label={`Download ${monthLabelLong(payslip.month)} payslip PDF`}
                  >
                    <FileDown className="size-4" />
                  </a>
                </div>
              </div>
            );
          })}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Payment History</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {payouts.length === 0 && <p className="text-sm text-muted-foreground">No salary payments yet.</p>}
          {payouts.map(serializePayout).map((p) => (
            <div key={p._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3 text-sm">
              <div>
                <p className="font-medium">{monthLabelLong(p.month)}</p>
                <p className="text-xs text-muted-foreground">
                  {p.bankAccountMasked}
                  {p.utr ? ` · UTR ${p.utr}` : ""}
                  {p.paidAt ? ` · ${formatDate(p.paidAt)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-foreground tabular-nums">{formatCurrency(p.paymentAmount)}</span>
                <PayoutStatusBadge status={p.status} />
              </div>
            </div>
          ))}
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
