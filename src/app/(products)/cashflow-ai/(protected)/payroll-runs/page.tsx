import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Users, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import { listPayrollRuns } from "@/lib/products/cashflow-ai/payroll";
import { payrollRunStatusMeta, monthLabelLong } from "@/lib/products/talentos/payroll-status";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

export default async function PayrollRunsPage() {
  const runs = await listPayrollRuns();
  const totalNetThisRun = runs[0]?.totalNet ?? 0;
  const totalPayslips = runs.reduce((s, r) => s + r.payslipCount, 0);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Payroll Runs" }]}
        title={<>Payroll Runs</>}
        description={<>Read-only financial view over TalentOS&apos;s real payroll runs — {runs.length} run{runs.length === 1 ? "" : "s"}.</>}
      />

      <KpiGrid>
        <KpiCard label="Total Runs" value={runs.length} accent icon={<Users className="size-4" />} />
        <KpiCard label="Latest Run Net Pay" value={<span>{formatMoney(totalNetThisRun)}</span>} icon={<Coins className="size-4" />} />
        <KpiCard label="Total Payslips" value={totalPayslips} icon={<Users className="size-4" />} />
      </KpiGrid>

      <FmsDataTable
        columns={[
          { key: "month", header: "Month" },
          { key: "employees", header: "Employees", align: "right" },
          { key: "gross", header: "Gross", align: "right" },
          { key: "deductions", header: "Deductions", align: "right" },
          { key: "net", header: "Net", align: "right" },
          { key: "status", header: "Status" },
        ]}
        rows={runs.map((r) => ({
          id: r._id,
          href: `/cashflow-ai/payroll-runs/${r._id}`,
          cells: {
            month: monthLabelLong(r.month),
            employees: r.payslipCount,
            gross: formatMoney(r.totalGross),
            deductions: formatMoney(r.totalDeductions),
            net: formatMoney(r.totalNet),
            status: <Badge className={payrollRunStatusMeta(r.status).badgeClass}>{payrollRunStatusMeta(r.status).label}</Badge>,
          },
        }))}
        page={1}
        totalPages={1}
        total={runs.length}
        emptyLabel="No payroll runs found — runs are created in TalentOS."
      />

      <p className="text-xs text-muted-foreground">Manage payroll runs at /talentos/payroll.</p>
    </div>
  );
}
