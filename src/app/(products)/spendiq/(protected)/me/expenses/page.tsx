import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import PrmsDataTable from "@/components/products/spendiq/PrmsDataTable";
import ExpenseForm from "@/components/products/spendiq/ExpenseForm";
import { ExpenseStatusBadge, ExpenseCategoryBadge } from "@/components/products/spendiq/StatusBadges";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { searchExpenses, serializeExpense } from "@/lib/products/spendiq/expenses";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { listDepartments, listProjectOptions } from "@/lib/products/spendiq/pickers";
import { EXPENSE_STATUSES, isValidExpenseStatus, formatMoney, type ExpenseStatus } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";

export default async function MyExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentPrmsUser();
  if (!user) return null;

  const page = Math.max(Number(sp.page) || 1, 1);
  const approvalStatus = sp.approvalStatus && isValidExpenseStatus(sp.approvalStatus) ? (sp.approvalStatus as ExpenseStatus) : undefined;

  const [result, vendors, departments, projects] = await Promise.all([
    searchExpenses({ raisedByUserId: user.id, search: sp.search, approvalStatus, page, pageSize: 20, sortBy: "expenseDate", sortDir: "desc" }),
    listVendorOptions({ activeOnly: true }),
    listDepartments(),
    listProjectOptions(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq/me" }, { label: "My Expenses" }]}
        title={<>My Expenses</>}
        description={<>{result.total} expense claims raised by you.</>}
        actions={<><ExpenseForm
          vendors={vendors.map((v) => ({ _id: v._id, companyName: v.companyName }))}
          departments={departments.map((d) => ({ _id: d._id, name: d.name }))}
          projects={projects.map((p) => ({ _id: p._id, name: p.name }))}
          trigger={
            <Button type="button" size="sm">
              <Plus className="size-3.5" data-icon="inline-start" />
              New Expense Claim
            </Button>
          }
        /></>}
      />

      <PrmsDataTable
        columns={[
          { key: "code", header: "Expense" },
          { key: "category", header: "Category" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "status", header: "Status" },
          { key: "date", header: "Date" },
        ]}
        rows={result.items.map(serializeExpense).map((e) => ({
          id: e._id,
          href: `/spendiq/me/expenses/${e._id}`,
          cells: {
            code: e.expenseCode,
            category: <ExpenseCategoryBadge category={e.category} />,
            amount: formatMoney(e.totalAmount, e.currency),
            status: <ExpenseStatusBadge status={e.approvalStatus} />,
            date: formatDate(e.expenseDate),
          },
        }))}
        filters={[{ key: "approvalStatus", label: "Status", value: sp.approvalStatus ?? "", options: EXPENSE_STATUSES.map((s) => ({ value: s.value, label: s.label })) }]}
        search={sp.search ?? ""}
        searchPlaceholder="Code, description"
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="You haven't logged any expenses yet."
      />
    </div>
  );
}
