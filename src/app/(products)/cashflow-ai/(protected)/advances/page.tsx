import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, Wallet, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import AdvanceForm from "@/components/products/cashflow-ai/AdvanceForm";
import { AdvanceStatusBadge } from "@/components/products/cashflow-ai/StatusBadges";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-roles";
import { searchAdvances, outstandingBalance, totalOutstandingAdvances } from "@/lib/products/cashflow-ai/employee-advances";
import { listEmployeeOptions } from "@/lib/products/talentos/employees";
import { ADVANCE_STATUSES, isValidAdvanceStatus, formatMoney } from "@/lib/products/cashflow-ai/constants";

export default async function AdvancesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentFmsUser();
  const canManage = user ? canManageTransactions(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidAdvanceStatus(sp.status) ? sp.status : undefined;

  const [result, employees, totalOutstanding] = await Promise.all([
    searchAdvances({ status, page, pageSize: 20 }),
    listEmployeeOptions(),
    totalOutstandingAdvances(),
  ]);
  const employeeOpts = employees.map((e) => ({ _id: e._id, label: `${e.name} (${e.employeeCode})` }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Advances" }]}
        title={<>Employee Advances</>}
        description={<>{result.total} advance{result.total === 1 ? "" : "s"} requested.</>}
        actions={<>{canManage && (
          <AdvanceForm
            employees={employeeOpts}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                Request Advance
              </Button>
            }
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Total Advances" value={result.total} accent icon={<Wallet className="size-4" />} />
        <KpiCard label="Outstanding Balance" value={<span>{formatMoney(totalOutstanding)}</span>} tone={totalOutstanding > 0 ? "down" : undefined} icon={<Clock className="size-4" />} />
      </KpiGrid>

      <FmsDataTable
        columns={[
          { key: "number", header: "Advance" },
          { key: "employee", header: "Employee" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "outstanding", header: "Outstanding", align: "right" },
          { key: "status", header: "Status" },
        ]}
        rows={result.items.map((a) => ({
          id: a._id,
          href: `/cashflow-ai/advances/${a._id}`,
          cells: {
            number: a.advanceNumber,
            employee: a.employeeName,
            amount: formatMoney(a.amount),
            outstanding: formatMoney(outstandingBalance(a)),
            status: <AdvanceStatusBadge status={a.status} />,
          },
        }))}
        filters={[{ key: "status", label: "Status", value: sp.status ?? "", options: ADVANCE_STATUSES.map((s) => ({ value: s.value, label: s.label })) }]}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No employee advances requested yet."
      />
    </div>
  );
}
