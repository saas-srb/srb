import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, Receipt, Clock, Repeat, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PrmsDataTable from "@/components/products/spendiq/PrmsDataTable";
import ExpenseForm from "@/components/products/spendiq/ExpenseForm";
import { ExpenseStatusBadge, ExpenseCategoryBadge } from "@/components/products/spendiq/StatusBadges";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageExpenses } from "@/lib/prms-roles";
import { searchExpenses, countExpenses, sumExpenses, serializeExpense } from "@/lib/products/spendiq/expenses";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { listDepartments, listProjectOptions } from "@/lib/products/spendiq/pickers";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  EXPENSE_TYPES,
  isValidExpenseCategory,
  isValidExpenseStatus,
  formatMoney,
  type ExpenseStatus,
} from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";

import ItemPdfDownloadButtons from "@/components/products/spendiq/ItemPdfDownloadButtons";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentPrmsUser();
  const canApprove = user ? canManageExpenses(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const category = sp.category && isValidExpenseCategory(sp.category) ? sp.category : undefined;
  const approvalStatus = sp.approvalStatus && isValidExpenseStatus(sp.approvalStatus) ? (sp.approvalStatus as ExpenseStatus) : undefined;
  const expenseType = sp.expenseType === "one_time" || sp.expenseType === "recurring" ? sp.expenseType : undefined;
  const sortBy = sp.sortBy || "expenseDate";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const [result, vendors, departments, projects, total, pending, recurring, monthSpend] = await Promise.all([
    searchExpenses({ search: sp.search, category, approvalStatus, expenseType, vendorId: sp.vendorId, departmentId: sp.departmentId, page, pageSize: 20, sortBy, sortDir }),
    listVendorOptions({ activeOnly: true }),
    listDepartments(),
    listProjectOptions(),
    countExpenses(),
    countExpenses({ approvalStatus: "pending" }),
    countExpenses({ expenseType: "recurring" }),
    sumExpenses({ approvalStatus: "approved", dateFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }),
  ]);

  const vOpts = vendors.map((v) => ({ _id: v._id, companyName: v.companyName }));
  const dOpts = departments.map((d) => ({ _id: d._id, name: d.name }));
  const pOpts = projects.map((p) => ({ _id: p._id, name: p.name }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Expenses" }]}
        title={<>Expenses</>}
        description={<>Track and approve company expenses, reimbursements &amp; vendor payments. {total} record{total === 1 ? "" : "s"} total.</>}
        actions={<><ExpenseForm
          vendors={vOpts}
          departments={dOpts}
          projects={pOpts}
          canApprove={canApprove}
          trigger={
            <Button type="button" size="sm">
              <Plus className="size-3.5" data-icon="inline-start" />
              New Expense
            </Button>
          }
        /></>}
      />

      <KpiGrid>
        <KpiCard label="Total Expenses" value={total} accent icon={<Receipt className="size-4" />} />
        <KpiCard label="Pending Approval" value={pending} tone={pending > 0 ? "down" : undefined} icon={<Clock className="size-4" />} />
        <KpiCard label="Recurring" value={recurring} icon={<Repeat className="size-4" />} />
        <KpiCard label="Approved This Month" value={<span>{formatMoney(monthSpend)}</span>} icon={<Coins className="size-4" />} />
      </KpiGrid>

      <PrmsDataTable
        columns={[
          { key: "code", header: "Code / Ref", sortable: true },
          { key: "category", header: "Category" },
          { key: "vendor", header: "Vendor" },
          { key: "amount", header: "Amount", sortable: true, align: "right" },
          { key: "type", header: "Type" },
          { key: "status", header: "Status" },
          { key: "date", header: "Date", sortable: true },
          { key: "pdfDownloads", header: "PDF Downloads", align: "right" },
        ]}
        rows={result.items.map(serializeExpense).map((e) => ({
          id: e._id,
          href: `/spendiq/expenses/${e._id}`,
          cells: {
            code: e.expenseCode,
            category: <ExpenseCategoryBadge category={e.category} />,
            vendor: e.vendorName ?? "—",
            amount: formatMoney(e.totalAmount, e.currency),
            type: e.expenseType === "recurring" ? `Recurring · ${e.recurrence?.interval ?? ""}` : "One-time",
            status: <ExpenseStatusBadge status={e.approvalStatus} />,
            date: formatDate(e.expenseDate),
            pdfDownloads: <ItemPdfDownloadButtons itemId={e._id} code={e.expenseCode} variant="compact" />,
          },
        }))}
        filters={[
          { key: "approvalStatus", label: "Status", value: sp.approvalStatus ?? "", options: EXPENSE_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
          { key: "category", label: "Category", value: sp.category ?? "", options: EXPENSE_CATEGORIES },
          { key: "expenseType", label: "Type", value: sp.expenseType ?? "", options: EXPENSE_TYPES.map((t) => ({ value: t.value, label: t.label })) },
          { key: "vendorId", label: "Vendor", value: sp.vendorId ?? "", options: vOpts.map((v) => ({ value: v._id, label: v.companyName })) },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="Code, description, vendor, invoice"
        sortBy={sortBy}
        sortDir={sortDir}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        exportBase="/api/spendiq/export/expenses"
        emptyLabel="No expenses match these filters."
      />
    </div>
  );
}
