"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
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
import { INVOICE_STATUSES } from "@/lib/products/spendiq/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import InvoiceStatusSelect from "./InvoiceStatusSelect";
import { deleteInvoiceAction, bulkUpdateInvoiceStatusAction, bulkDeleteInvoicesAction } from "./actions";

export interface AdminInvoiceRow {
  _id: string;
  invoiceNumber: string;
  vendorName: string;
  poNumber: string | null;
  status: string;
  netPayable: number;
  amountPaid: number;
  currency: string;
  dueDate: string;
  poMatched: boolean;
  grnMatched: boolean;
}

function RowActions({ row }: { row: AdminInvoiceRow }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteInvoiceAction(row._id);
      if (!result.ok) toast.error(result.error ?? "Could not delete invoice.");
      else toast.success("Invoice deleted");
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
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {row.invoiceNumber}?</AlertDialogTitle>
            <AlertDialogDescription>Invoices with recorded payments cannot be deleted.</AlertDialogDescription>
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

  async function handleBulkStatus(status: string) {
    setPending(true);
    const result = await bulkUpdateInvoiceStatusAction(ctx.selectedIds, status);
    setPending(false);
    toast.success(`Updated ${result.updated} invoice${result.updated === 1 ? "" : "s"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  async function handleBulkDelete() {
    setPending(true);
    const result = await bulkDeleteInvoicesAction(ctx.selectedIds);
    setPending(false);
    if (result.skipped.length > 0) {
      toast.warning(`${result.deleted} deleted. Skipped (has payments): ${result.skipped.join(", ")}`);
    } else {
      toast.success(`Deleted ${result.deleted} invoice${result.deleted === 1 ? "" : "s"}`);
    }
    ctx.clearSelection();
    ctx.refresh();
  }

  return (
    <>
      <Select onValueChange={(v: string | null) => { if (v) handleBulkStatus(v); }} disabled={pending}>
        <SelectTrigger size="sm">
          <SelectValue placeholder="Mark as…" />
        </SelectTrigger>
        <SelectContent>
          {INVOICE_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <a
        href={`/api/commandos/spendiq/invoices/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
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
            <AlertDialogTitle>Delete {ctx.selectedIds.length} invoice{ctx.selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>Invoices with recorded payments are skipped, not deleted.</AlertDialogDescription>
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

export default function InvoicesGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminInvoiceRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const columns: AdminDataGridColumn<AdminInvoiceRow>[] = [
    { key: "invoiceNumber", label: "Invoice", sortable: true, render: (row) => <p className="font-medium text-foreground">{row.invoiceNumber}</p> },
    { key: "vendorName", label: "Vendor", render: (row) => row.vendorName },
    { key: "poNumber", label: "PO", render: (row) => row.poNumber ?? "—" },
    { key: "status", label: "Status", render: (row) => <InvoiceStatusSelect id={row._id} initialStatus={row.status} /> },
    { key: "netPayable", label: "Net Payable", sortable: true, render: (row) => formatCurrency(row.netPayable, row.currency) },
    { key: "amountPaid", label: "Paid", render: (row) => formatCurrency(row.amountPaid, row.currency) },
    { key: "dueDate", label: "Due Date", sortable: true, render: (row) => formatDate(row.dueDate) },
    {
      key: "matched",
      label: "Matching",
      defaultVisible: false,
      render: (row) => (
        <div className="flex gap-1">
          <Badge variant={row.poMatched ? "default" : "outline"} className="text-[10px]">PO</Badge>
          <Badge variant={row.grnMatched ? "default" : "outline"} className="text-[10px]">GRN</Badge>
        </div>
      ),
    },
  ];

  return (
    <AdminDataGrid
      filterTitle="Invoice Filters"
      filterSubtitle="Search and filter invoices"
      filterIcon={FileText}
      columns={columns}
      rows={rows}
      getRowId={(row) => row._id}
      total={total}
      page={page}
      totalPages={totalPages}
      sortBy={sortBy}
      sortDir={sortDir}
      emptyLabel="No invoices match these filters."
      filters={filters}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
