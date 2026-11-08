import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { ExpenseStatusBadge, ExpenseCategoryBadge } from "@/components/products/spendiq/StatusBadges";
import { formatMoney, getExpenseCategoryLabel } from "@/lib/products/spendiq/constants";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { SerializedExpense } from "@/lib/products/spendiq/expenses";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

export default function ExpenseSummary({ expense }: { expense: SerializedExpense }) {
  const e = expense;
  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">{e.expenseCode}</span>
          {getExpenseCategoryLabel(e.category)}
        </CardTitle>
        <div className="flex flex-wrap gap-2 pt-1">
          <ExpenseStatusBadge status={e.approvalStatus} />
          <ExpenseCategoryBadge category={e.category} />
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Amount (pre-tax)" value={formatMoney(e.amount, e.currency)} />
        <Field label={`GST (${e.gstRate}%)`} value={formatMoney(e.gstAmount, e.currency)} />
        <Field label="Total" value={formatMoney(e.totalAmount, e.currency)} />
        <Field label="Subcategory" value={e.subcategory} />
        <Field label="Vendor" value={e.vendorName} />
        <Field label="Payment method" value={e.paymentMethod.replace(/_/g, " ")} />
        <Field label="Department" value={e.departmentName} />
        <Field label="Project" value={e.projectName} />
        <Field label="Invoice #" value={e.invoiceNumber} />
        <Field label="Expense date" value={formatDate(e.expenseDate)} />
        <Field label="Raised by" value={e.raisedByName} />
        <Field label="Logged" value={formatDateTime(e.createdAt)} />
        {e.recurrence && (
          <Field label="Recurrence" value={`${e.recurrence.interval} · next ${e.recurrence.nextRunDate} · ${e.recurrence.active ? "active" : "paused"}`} />
        )}
        {e.approvedAt && <Field label="Decided" value={formatDateTime(e.approvedAt)} />}
      </CardContent>
      {e.description && (
        <CardContent>
          <p className="text-xs text-muted-foreground">Description</p>
          <p className="text-sm whitespace-pre-wrap text-foreground">{e.description}</p>
        </CardContent>
      )}
    </GlassCard>
  );
}
