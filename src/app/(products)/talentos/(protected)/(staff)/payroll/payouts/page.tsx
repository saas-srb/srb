import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import PayoutsDashboard from "@/components/products/talentos/PayoutsDashboard";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canRunPayroll } from "@/lib/hrms-roles";
import { searchPayouts, distinctPayoutMonths, refreshStaleSalaryPayouts } from "@/lib/products/talentos/salary-payouts";
import { isValidPayoutStatus, type PayoutStatus } from "@/lib/products/talentos/payout-status";
import { listDepartments } from "@/lib/products/talentos/departments";

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; status?: string; department?: string; q?: string; page?: string }>;
}) {
  const user = await getCurrentHrmsUser();
  if (!user || !canRunPayroll(user)) redirect("/talentos");

  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidPayoutStatus(sp.status) ? (sp.status as PayoutStatus) : undefined;

  await refreshStaleSalaryPayouts();
  const [result, months, departments] = await Promise.all([
    searchPayouts({ month: sp.month, status, departmentId: sp.department, q: sp.q, page, pageSize: 30 }),
    distinctPayoutMonths(),
    listDepartments(),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/talentos/payroll" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Payroll runs
      </Link>
      <PanelPageHeader
        title={<>Salary Payouts</>}
        description={<>Initiate, track and reconcile employee salary disbursements.</>}
      />

      <PayoutsDashboard
        items={result.items.map((p) => ({
          _id: p._id,
          runId: p.runId,
          month: p.month,
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
          reconciledAt: p.reconciledAt,
        }))}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
        byStatus={result.byStatus}
        months={months}
        departments={departments.map((d) => ({ _id: d._id, name: d.name }))}
        filters={{ month: sp.month ?? "", status: status ?? "", department: sp.department ?? "", q: sp.q ?? "" }}
      />
    </div>
  );
}
