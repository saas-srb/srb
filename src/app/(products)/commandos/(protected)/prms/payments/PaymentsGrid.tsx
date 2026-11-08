"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Trash2, Check, CreditCard } from "lucide-react";
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
import { formatCurrency, formatDate } from "@/lib/utils";
import { markPaymentProcessedAction, deletePaymentAction, bulkDeletePaymentsAction } from "./actions";

export interface AdminPaymentRow {
  _id: string;
  paymentCode: string;
  invoiceNumber: string;
  vendorName: string;
  amount: number;
  method: string;
  status: string;
  paymentDate: string;
}

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  processed: "bg-green-500/10 text-green-600 dark:text-green-400",
  failed: "bg-destructive/10 text-destructive",
};

function RowActions({ row }: { row: AdminPaymentRow }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function markProcessed() {
    startTransition(async () => {
      const result = await markPaymentProcessedAction(row._id);
      if (!result.ok) toast.error(result.error ?? "Could not mark processed.");
      else toast.success("Payment marked processed");
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deletePaymentAction(row._id);
      if (!result.ok) toast.error(result.error ?? "Could not delete payment.");
      else toast.success("Payment deleted");
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
          {row.status === "scheduled" && (
            <DropdownMenuItem onClick={markProcessed} disabled={isPending}>
              <Check className="size-3.5" />
              Mark processed
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
            <AlertDialogTitle>Delete {row.paymentCode}?</AlertDialogTitle>
            <AlertDialogDescription>If processed, reverses the amount against the invoice&apos;s balance.</AlertDialogDescription>
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

  async function handleBulkDelete() {
    setPending(true);
    const result = await bulkDeletePaymentsAction(ctx.selectedIds);
    setPending(false);
    toast.success(`Deleted ${result.deleted} payment${result.deleted === 1 ? "" : "s"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  return (
    <>
      <a
        href={`/api/commandos/spendiq/payments/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
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
            <AlertDialogTitle>Delete {ctx.selectedIds.length} payment{ctx.selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>Processed payments have their amount reversed against the invoice balance.</AlertDialogDescription>
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

export default function PaymentsGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminPaymentRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const columns: AdminDataGridColumn<AdminPaymentRow>[] = [
    { key: "paymentCode", label: "Payment", render: (row) => <p className="font-medium text-foreground">{row.paymentCode}</p> },
    { key: "invoiceNumber", label: "Invoice", render: (row) => row.invoiceNumber },
    { key: "vendorName", label: "Vendor", render: (row) => row.vendorName },
    { key: "amount", label: "Amount", sortable: true, render: (row) => formatCurrency(row.amount) },
    { key: "method", label: "Method", render: (row) => <span className="capitalize">{row.method}</span> },
    {
      key: "status",
      label: "Status",
      render: (row) => <Badge className={`capitalize ${STATUS_BADGE[row.status] ?? ""}`}>{row.status}</Badge>,
    },
    { key: "paymentDate", label: "Date", sortable: true, render: (row) => formatDate(row.paymentDate) },
  ];

  return (
    <AdminDataGrid
      filterTitle="Payment Filters"
      filterSubtitle="Search and filter procurement payments"
      filterIcon={CreditCard}
      columns={columns}
      rows={rows}
      getRowId={(row) => row._id}
      total={total}
      page={page}
      totalPages={totalPages}
      sortBy={sortBy}
      sortDir={sortDir}
      emptyLabel="No payments match these filters."
      filters={filters}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
