import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Wallet, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import { listSalaryPayments, totalSalaryPayable } from "@/lib/products/cashflow-ai/payroll";
import { payoutStatusMeta, PAYOUT_STATUSES, isValidPayoutStatus } from "@/lib/products/talentos/payout-status";
import { monthLabelLong } from "@/lib/products/talentos/payroll-status";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

export default async function SalaryPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidPayoutStatus(sp.status) ? sp.status : undefined;

  const [result, payable] = await Promise.all([
    listSalaryPayments({ status, q: sp.search, page, pageSize: 20 }),
    totalSalaryPayable(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Salary Payments" }]}
        title={<>Salary Payments</>}
        description={<>Read-only financial view over TalentOS&apos;s real salary payouts — {result.total} payment{result.total === 1 ? "" : "s"}.</>}
      />

      <KpiGrid>
        <KpiCard label="Total Payments" value={result.total} accent icon={<Wallet className="size-4" />} />
        <KpiCard label="Salary Payable" value={<span>{formatMoney(payable)}</span>} tone={payable > 0 ? "down" : undefined} icon={<Clock className="size-4" />} />
      </KpiGrid>

      <FmsDataTable
        columns={[
          { key: "employee", header: "Employee" },
          { key: "month", header: "Month" },
          { key: "net", header: "Net Payable", align: "right" },
          { key: "utr", header: "Reference" },
          { key: "status", header: "Status" },
        ]}
        rows={result.items.map((p) => ({
          id: p._id,
          cells: {
            employee: `${p.employeeName} (${p.employeeCode})`,
            month: monthLabelLong(p.month),
            net: formatMoney(p.netPayable),
            utr: p.utr ?? "—",
            status: <Badge className={payoutStatusMeta(p.status).badgeClass}>{payoutStatusMeta(p.status).label}</Badge>,
          },
        }))}
        filters={[{ key: "status", label: "Status", value: sp.status ?? "", options: PAYOUT_STATUSES.map((s) => ({ value: s.value, label: s.label })) }]}
        search={sp.search ?? ""}
        searchPlaceholder="Employee name, code"
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No salary payments found — payments are executed in TalentOS."
      />

      <p className="text-xs text-muted-foreground">Initiate or reconcile payouts at /talentos/payroll.</p>
    </div>
  );
}
