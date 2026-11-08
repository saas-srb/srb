import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound, redirect } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ExpenseSummary from "@/components/products/spendiq/ExpenseSummary";
import ExpenseWorkflow from "@/components/products/spendiq/ExpenseWorkflow";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { hasPrmsStaffRole } from "@/lib/prms-roles";
import { getExpense, serializeExpense } from "@/lib/products/spendiq/expenses";

export default async function MyExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentPrmsUser();
  if (!user) notFound();

  const expense = await getExpense(id);
  if (!expense) notFound();
  const isOwner = expense.raisedByUserId === user.id;
  if (!isOwner && !hasPrmsStaffRole(user.roles)) redirect("/spendiq/me/expenses");

  const e = serializeExpense(expense);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq/me" }, { label: "My Expenses", href: "/spendiq/me/expenses" }, { label: e.expenseCode }]}
        title={<>{e.expenseCode}</>}
      />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <ExpenseSummary expense={e} />
        <ExpenseWorkflow expense={e} isOwner={isOwner} canApprove={false} backPath="/spendiq/me/expenses" />
      </div>
    </div>
  );
}
