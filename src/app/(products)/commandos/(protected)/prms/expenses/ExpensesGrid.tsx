"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Trash2, Check, X as XIcon, Banknote, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import AdminDataGrid, { type AdminDataGridColumn, type BulkActionsContext } from "@/components/products/commandos/data-grid/AdminDataGrid";
import { getExpenseStatusMeta } from "@/lib/products/spendiq/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { decideExpenseAction, markExpenseReimbursedAction, deleteExpenseAction, bulkDecideExpensesAction, bulkDeleteExpensesAction } from "./actions";

export interface AdminExpenseRow {
  _id: string;
  expenseCode: string;
  category: string;
  vendorName: string | null;
  departmentName: string | null;
  totalAmount: number;
  currency: string;
  approvalStatus: string;
  expenseDate: string;
}

function RowActions({ row }: { row: AdminExpenseRow }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function decide(approve: boolean) {
    startTransition(async () => {
      const result = await decideExpenseAction(row._id, approve);
      if (!result.ok) toast.error(result.error ?? "Could not update expense.");
      else toast.success(approve ? "Expense approved" : "Expense rejected");
    });
  }

  function reimburse() {
    startTransition(async () => {
      const result = await markExpenseReimbursedAction(row._id);
      if (!result.ok) toast.error(result.error ?? "Could not mark reimbursed.");
      else toast.success("Marked reimbursed");
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteExpenseAction(row._id);
      if (!result.ok) toast.error(result.error ?? "Could not delete expense.");
      else toast.success("Expense deleted");
      setConfirmOpen(false);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Row actions">
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {row.approvalStatus === "pending" && (
            <>
              <DropdownMenuItem onClick={() => decide(true)} disabled={isPending}>
                <Check className="size-3.5" />
                Approve
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => decide(false)} disabled={isPending}>
                <XIcon className="size-3.5" />
                Reject
              </DropdownMenuItem>
            </>
          )}
          {row.approvalStatus === "approved" && (
            <DropdownMenuItem onClick={reimburse} disabled={isPending}>
              <Banknote className="size-3.5" />
              Mark reimbursed
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {row.expenseCode}?</AlertDialogTitle>
            <AlertDialogDescription>Reimbursed expenses cannot be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending}>
              {isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BulkActions({ ctx }: { ctx: BulkActionsContext }) {
  const [pending, setPending] = useState(false);

  async function handleBulkDecide(approve: boolean) {
    setPending(true);
    const result = await bulkDecideExpensesAction(ctx.selectedIds, approve);
    setPending(false);
    if (result.skipped > 0) {
      toast.warning(`${result.updated} updated. ${result.skipped} skipped (not pending).`);
    } else {
      toast.success(`${result.updated} expense${result.updated === 1 ? "" : "s"} ${approve ? "approved" : "rejected"}`);
    }
    ctx.clearSelection();
    ctx.refresh();
  }

  async function handleBulkDelete() {
    setPending(true);
    const result = await bulkDeleteExpensesAction(ctx.selectedIds);
    setPending(false);
    if (result.skipped.length > 0) {
      toast.warning(`${result.deleted} deleted. Skipped (reimbursed): ${result.skipped.join(", ")}`);
    } else {
      toast.success(`Deleted ${result.deleted} expense${result.deleted === 1 ? "" : "s"}`);
    }
    ctx.clearSelection();
    ctx.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => handleBulkDecide(true)}>
        <Check className="size-3.5" data-icon="inline-start" />
        Approve
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => handleBulkDecide(false)}>
        <XIcon className="size-3.5" data-icon="inline-start" />
        Reject
      </Button>
      <a
        href={`/api/commandos/spendiq/expenses/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
      >
        Export
      </a>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button type="button" variant="destructive" size="sm" disabled={pending}>
              <Trash2 className="size-3.5" data-icon="inline-start" />
              Delete
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {ctx.selectedIds.length} expense{ctx.selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>Reimbursed expenses are skipped, not deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function ExpensesGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminExpenseRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const columns: AdminDataGridColumn<AdminExpenseRow>[] = [
    {
      key: "expenseCode",
      label: "Expense",
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.category}</p>
          <p className="text-xs">{row.expenseCode}</p>
        </div>
      ),
    },
    { key: "vendorName", label: "Vendor", render: (row) => row.vendorName ?? "—" },
    { key: "departmentName", label: "Department", render: (row) => row.departmentName ?? "—" },
    { key: "totalAmount", label: "Amount", sortable: true, render: (row) => formatCurrency(row.totalAmount, row.currency) },
    {
      key: "approvalStatus",
      label: "Status",
      render: (row) => {
        const meta = getExpenseStatusMeta(row.approvalStatus);
        return <Badge className={meta.badgeClass}>{meta.label}</Badge>;
      },
    },
    { key: "expenseDate", label: "Date", sortable: true, render: (row) => formatDate(row.expenseDate) },
  ];

  return (
    <AdminDataGrid
      filterTitle="Expense Filters"
      filterSubtitle="Search and filter recorded expenses"
      filterIcon={Receipt}
      columns={columns}
      rows={rows}
      getRowId={(row) => row._id}
      total={total}
      page={page}
      totalPages={totalPages}
      sortBy={sortBy}
      sortDir={sortDir}
      emptyLabel="No expenses match these filters."
      filters={filters}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
