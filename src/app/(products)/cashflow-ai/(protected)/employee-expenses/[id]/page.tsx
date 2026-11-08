import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { ExpenseStatusBadge, ExpenseCategoryBadge } from "@/components/products/spendiq/StatusBadges";
import RecordReimbursementForm from "@/components/products/cashflow-ai/RecordReimbursementForm";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-roles";
import { getEmployeeExpenseDetail } from "@/lib/products/cashflow-ai/employee-expenses";
import { listReimbursementsForExpense, serializeReimbursement } from "@/lib/products/cashflow-ai/reimbursements";
import { listFundAccountOptions } from "@/lib/products/cashflow-ai/fund-accounts";
import { formatMoney } from "@/lib/products/spendiq/constants";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function EmployeeExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentFmsUser();
  const detail = await getEmployeeExpenseDetail(id);
  if (!detail) notFound();
  const { expense, reimbursedTotal } = detail;
  const [reimbursementsRaw, fundAccounts] = await Promise.all([listReimbursementsForExpense(id), listFundAccountOptions()]);
  const reimbursements = reimbursementsRaw.map(serializeReimbursement);
  const canManage = user ? canManageTransactions(user) : false;
  const outstanding = Math.max(0, expense.totalAmount - reimbursedTotal);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Employee Expenses", href: "/cashflow-ai/employee-expenses" }, { label: expense.expenseCode }]}
        title={<>{expense.expenseCode}</>}
        description={<>{expense.raisedByName} · {formatMoney(expense.totalAmount, expense.currency)}</>}
        actions={<><div className="flex items-center gap-2">
          <ExpenseCategoryBadge category={expense.category} />
          <ExpenseStatusBadge status={expense.approvalStatus} />
        </div></>}
      />

      {canManage && expense.approvalStatus === "approved" && outstanding > 0.01 && (
        <GlassCard>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent>
            <RecordReimbursementForm
              expenseId={expense._id}
              expenseCode={expense.expenseCode}
              outstanding={outstanding}
              currency={expense.currency}
              fundAccounts={fundAccounts}
              trigger={
                <Button type="button" size="sm">
                  <Plus className="size-3.5" data-icon="inline-start" />
                  Record Reimbursement
                </Button>
              }
            />
          </CardContent>
        </GlassCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Claim Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Description" value={expense.description ?? "—"} />
            <Row label="Expense Date" value={formatDate(expense.expenseDate)} />
            <Row label="Project" value={expense.projectName ?? "—"} />
            <Row label="Department" value={expense.departmentName ?? "—"} />
            <Row label="Payment Method" value={expense.paymentMethod.replace(/_/g, " ")} />
            {expense.rejectionReason && <Row label="Rejection Reason" value={expense.rejectionReason} />}
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Reimbursement</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Claim Total" value={formatMoney(expense.totalAmount, expense.currency)} />
            <Row label="Reimbursed" value={formatMoney(reimbursedTotal, expense.currency)} />
            <Row label="Outstanding" value={formatMoney(outstanding, expense.currency)} />
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard>
        <CardHeader><CardTitle>Reimbursement History</CardTitle></CardHeader>
        <CardContent>
          {reimbursements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reimbursements recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {reimbursements.map((r) => (
                <li key={r._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-medium">{r.reimbursementNumber}</span>
                  <span className="text-muted-foreground">{formatDate(r.paymentDate)} · {formatMoney(r.amount, expense.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>

      <p className="text-xs text-muted-foreground">
        Created {formatDateTime(expense.createdAt)}. Claim data is owned by SpendIQ — approve/reject at{" "}
        <Link href={`/spendiq/expenses/${expense._id}`} className="text-primary hover:underline">/spendiq/expenses/{expense._id}</Link>.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
