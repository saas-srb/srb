import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ExpenseSummary from "@/components/products/spendiq/ExpenseSummary";
import ExpenseWorkflow from "@/components/products/spendiq/ExpenseWorkflow";
import ExpenseForm from "@/components/products/spendiq/ExpenseForm";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageExpenses } from "@/lib/prms-roles";
import { getExpense, serializeExpense } from "@/lib/products/spendiq/expenses";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { listDepartments, listProjectOptions } from "@/lib/products/spendiq/pickers";

export default async function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentPrmsUser();
  if (!user) notFound();

  const expense = await getExpense(id);
  if (!expense) notFound();
  const e = serializeExpense(expense);

  const canApprove = canManageExpenses(user);
  const isOwner = e.raisedByUserId === user.id;

  const [vendors, departments, projects] = e.approvalStatus === "pending"
    ? await Promise.all([listVendorOptions({ activeOnly: true }), listDepartments(), listProjectOptions()])
    : [[], [], []];

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Expense Management", href: "/spendiq/expenses" }, { label: e.expenseCode }]}
        title={<>{e.expenseCode}</>}
        actions={<>{e.approvalStatus === "pending" && (isOwner || canApprove) && (
          <ExpenseForm
            expense={e}
            vendors={vendors.map((v) => ({ _id: v._id, companyName: v.companyName }))}
            departments={departments.map((d) => ({ _id: d._id, name: d.name }))}
            projects={projects.map((p) => ({ _id: p._id, name: p.name }))}
            canApprove={canApprove}
            trigger={
              <Button type="button" size="sm" variant="outline">
                <Pencil className="size-3.5" data-icon="inline-start" />
                Edit
              </Button>
            }
          />
        )}</>}
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <ExpenseSummary expense={e} />
        <ExpenseWorkflow expense={e} isOwner={isOwner} canApprove={canApprove} backPath="/spendiq/expenses" />
      </div>
    </div>
  );
}
