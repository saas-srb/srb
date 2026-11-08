import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Receipt, Clock } from "lucide-react";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import { ExpenseStatusBadge, ExpenseCategoryBadge } from "@/components/products/spendiq/StatusBadges";
import { listEmployeeExpenses } from "@/lib/products/cashflow-ai/employee-expenses";
import { EXPENSE_STATUSES, isValidExpenseStatus, formatMoney } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";

export default async function EmployeeExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const approvalStatus = sp.status && isValidExpenseStatus(sp.status) ? sp.status : undefined;

  const result = await listEmployeeExpenses({ search: sp.search, approvalStatus, page, pageSize: 20 });
  const pendingCount = result.items.filter((e) => e.approvalStatus === "pending").length;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Employee Expenses" }]}
        title={<>Employee Expenses</>}
        description={<>Financial view over SpendIQ&apos;s personal expense claims — {result.total} claim{result.total === 1 ? "" : "s"}.</>}
      />

      <KpiGrid>
        <KpiCard label="Total Claims" value={result.total} accent icon={<Receipt className="size-4" />} />
        <KpiCard label="Pending (this page)" value={pendingCount} tone={pendingCount > 0 ? "down" : undefined} icon={<Clock className="size-4" />} />
      </KpiGrid>

      <FmsDataTable
        columns={[
          { key: "code", header: "Claim" },
          { key: "employee", header: "Employee" },
          { key: "category", header: "Category" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "status", header: "Status" },
          { key: "date", header: "Date" },
        ]}
        rows={result.items.map((e) => ({
          id: e._id,
          href: `/cashflow-ai/employee-expenses/${e._id}`,
          cells: {
            code: e.expenseCode,
            employee: e.raisedByName,
            category: <ExpenseCategoryBadge category={e.category} />,
            amount: formatMoney(e.totalAmount, e.currency),
            status: <ExpenseStatusBadge status={e.approvalStatus} />,
            date: formatDate(e.expenseDate),
          },
        }))}
        filters={[{ key: "status", label: "Status", value: sp.status ?? "", options: EXPENSE_STATUSES.map((s) => ({ value: s.value, label: s.label })) }]}
        search={sp.search ?? ""}
        searchPlaceholder="Claim code, description"
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No employee expense claims found — claims are submitted in SpendIQ."
      />
    </div>
  );
}
