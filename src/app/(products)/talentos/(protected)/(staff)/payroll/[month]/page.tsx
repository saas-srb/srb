import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import PayrollRunDetail from "@/components/products/talentos/PayrollRunDetail";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canRunPayroll } from "@/lib/hrms-roles";
import { getRunByMonth, getPayslipsForRun, serializeRun, serializePayslip } from "@/lib/products/talentos/payroll-run";
import { payoutsForRun, refreshStaleSalaryPayouts, serializePayout } from "@/lib/products/talentos/salary-payouts";
import { getPayrollConfig } from "@/lib/products/talentos/payroll-config";
import { getPayoutProvider } from "@/lib/products/talentos/payout-provider";

export default async function PayrollRunPage({ params }: { params: Promise<{ month: string }> }) {
  const user = await getCurrentHrmsUser();
  if (!user || !canRunPayroll(user)) redirect("/talentos");

  const { month } = await params;
  const run = await getRunByMonth(month);
  if (!run) notFound();
  await refreshStaleSalaryPayouts();
  const config = await getPayrollConfig();
  const [slips, payouts] = await Promise.all([
    getPayslipsForRun(run._id).then((s) => s.map(serializePayslip)),
    payoutsForRun(run._id).then((p) => p.map(serializePayout)),
  ]);
  const provider = await getPayoutProvider();
  const r = serializeRun(run);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "Payroll", href: "/talentos/payroll" }, { label: month }]}
        title={<>Payroll · {month}</>}
        description={<>Review, approve and pay this payroll run.</>}
        actions={
          <Link href="/talentos/payroll" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" /> All runs
          </Link>
        }
      />

      <PayrollRunDetail
        run={{
          _id: r._id,
          month: r.month,
          status: r.status,
          totalGross: r.totalGross,
          totalNet: r.totalNet,
          totalDeductions: r.totalDeductions,
          totalEmployerCost: r.totalEmployerCost,
          checks: r.checks,
          totals: r.totals,
          generatedBy: r.generatedBy,
          requireSeparateApprover: config.requireSeparateApprover,
        }}
        slips={slips.map((s) => ({
          _id: s._id,
          employeeId: s.employeeId,
          employeeName: s.employeeName,
          employeeCode: s.employeeCode,
          workingDays: s.workingDays,
          lopDays: s.lopDays,
          earnings: s.earnings,
          grossPay: s.grossPay,
          deductions: s.deductions,
          totalDeductions: s.totalDeductions,
          employerContributions: s.employerContributions,
          employerCost: s.employerCost,
          netPay: s.netPay,
          overrides: s.overrides,
          bankAccountLast4: s.bankAccountLast4,
          bankName: s.bankName,
          ifsc: s.ifsc,
          paidDays: s.paidDays,
          monthDays: s.monthDays,
          daysNotes: s.daysNotes,
          warnings: s.warnings,
          held: s.held,
          holdReason: s.holdReason,
          tds: (s.deductions.find((d) => d.code === "TDS" || (!d.code && d.name === "TDS"))?.amount) ?? 0,
          tax: s.tax?.annual ? { regime: s.tax.regime, fy: s.tax.fy, taxableIncome: s.tax.annual.taxableIncome, yearTax: s.tax.annual.totalTax, thisMonth: (s.deductions.find((d) => d.code === "TDS")?.amount) ?? 0, deductedSoFar: 0 } : null,
        }))}
        payouts={payouts.map((p) => ({
          _id: p._id,
          employeeName: p.employeeName,
          employeeCode: p.employeeCode,
          netPayable: p.netPayable,
          paymentAmount: p.paymentAmount,
          bankAccountMasked: p.bankAccountMasked,
          bankName: p.bankName,
          status: p.status,
          paymentProvider: p.paymentProvider,
          utr: p.utr,
          failureReason: p.failureReason,
        }))}
        razorpayConnected={provider.key === "razorpay"}
      />
    </div>
  );
}
