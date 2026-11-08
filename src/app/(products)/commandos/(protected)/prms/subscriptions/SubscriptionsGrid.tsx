"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Trash2, Repeat } from "lucide-react";
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
import SubscriptionStatusSelect from "./SubscriptionStatusSelect";
import { deleteSubscriptionAction, bulkDeleteSubscriptionsAction } from "./actions";

export interface AdminSubscriptionRow {
  _id: string;
  serviceName: string;
  provider: string;
  licenseCount: number;
  monthlyCost: number;
  annualCost: number;
  currency: string;
  ownerName: string | null;
  renewalDate: string | null;
  autoRenew: boolean;
  status: string;
}

function RowActions({ row }: { row: AdminSubscriptionRow }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteSubscriptionAction(row._id);
      if (!result.ok) toast.error(result.error ?? "Could not delete subscription.");
      else toast.success("Subscription deleted");
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
            <AlertDialogTitle>Delete {row.serviceName}?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
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
    const result = await bulkDeleteSubscriptionsAction(ctx.selectedIds);
    setPending(false);
    toast.success(`Deleted ${result.deleted} subscription${result.deleted === 1 ? "" : "s"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  return (
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
          <AlertDialogTitle>Delete {ctx.selectedIds.length} subscription{ctx.selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleBulkDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function SubscriptionsGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
  exportHref,
}: {
  rows: AdminSubscriptionRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
  exportHref: string;
}) {
  const columns: AdminDataGridColumn<AdminSubscriptionRow>[] = [
    { key: "serviceName", label: "Service", sortable: true, render: (row) => <p className="font-medium text-foreground">{row.serviceName}</p> },
    { key: "provider", label: "Provider", render: (row) => row.provider },
    { key: "licenseCount", label: "Licenses", render: (row) => row.licenseCount },
    { key: "monthlyCost", label: "Monthly Cost", sortable: true, render: (row) => formatCurrency(row.monthlyCost, row.currency) },
    { key: "annualCost", label: "Annual Cost", defaultVisible: false, render: (row) => formatCurrency(row.annualCost, row.currency) },
    { key: "ownerName", label: "Owner", render: (row) => row.ownerName ?? "—" },
    { key: "renewalDate", label: "Renewal", render: (row) => (row.renewalDate ? formatDate(row.renewalDate) : "—") },
    { key: "autoRenew", label: "Auto-Renew", render: (row) => <Badge variant={row.autoRenew ? "default" : "outline"}>{row.autoRenew ? "Yes" : "No"}</Badge> },
    { key: "status", label: "Status", render: (row) => <SubscriptionStatusSelect id={row._id} initialStatus={row.status} /> },
  ];

  return (
    <AdminDataGrid
      filterTitle="Subscription Filters"
      filterSubtitle="Search and filter recurring subscriptions"
      filterIcon={Repeat}
      columns={columns}
      rows={rows}
      getRowId={(row) => row._id}
      total={total}
      page={page}
      totalPages={totalPages}
      sortBy={sortBy}
      sortDir={sortDir}
      emptyLabel="No subscriptions match these filters."
      filters={filters}
      hasActiveFilters={hasActiveFilters}
      toolbarExtra={
        <a
          href={exportHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
        >
          Export
        </a>
      }
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
