"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Eye, Trash2, ClipboardList } from "lucide-react";
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
import { getRequisitionStatusMeta, getPriorityMeta } from "@/lib/products/spendiq/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { deleteRequisitionAction, bulkDeleteRequisitionsAction } from "./actions";

export interface AdminRequisitionRow {
  _id: string;
  prCode: string;
  itemName: string;
  departmentName: string | null;
  requesterName: string;
  status: string;
  priority: string;
  estimatedCost: number;
  currency: string;
  requiredDate: string | null;
}

function RowActions({ row }: { row: AdminRequisitionRow }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteRequisitionAction(row._id);
      if (!result.ok) toast.error(result.error ?? "Could not delete requisition.");
      else toast.success("Requisition deleted");
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
          <DropdownMenuItem
            render={
              <Link href={`/spendiq/requisitions/${row._id}`}>
                <Eye className="size-3.5" />
                View / decide
              </Link>
            }
          />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {row.prCode}?</AlertDialogTitle>
            <AlertDialogDescription>Only draft or rejected requisitions can be deleted.</AlertDialogDescription>
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
    const result = await bulkDeleteRequisitionsAction(ctx.selectedIds);
    setPending(false);
    if (result.skipped.length > 0) {
      toast.warning(`${result.deleted} deleted. Skipped (not draft/rejected): ${result.skipped.join(", ")}`);
    } else {
      toast.success(`Deleted ${result.deleted} requisition${result.deleted === 1 ? "" : "s"}`);
    }
    ctx.clearSelection();
    ctx.refresh();
  }

  return (
    <>
      <a
        href={`/api/commandos/spendiq/requisitions/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
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
            <AlertDialogTitle>Delete {ctx.selectedIds.length} requisition{ctx.selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>Only draft or rejected requisitions are deleted; others are skipped.</AlertDialogDescription>
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

export default function RequisitionsGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminRequisitionRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const columns: AdminDataGridColumn<AdminRequisitionRow>[] = [
    {
      key: "itemName",
      label: "Requisition",
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.itemName}</p>
          <p className="text-xs">{row.prCode}</p>
        </div>
      ),
    },
    { key: "departmentName", label: "Department", render: (row) => row.departmentName ?? "—" },
    { key: "requesterName", label: "Requested By", render: (row) => row.requesterName },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => {
        const meta = getRequisitionStatusMeta(row.status);
        return <Badge className={meta.badgeClass}>{meta.label}</Badge>;
      },
    },
    {
      key: "priority",
      label: "Priority",
      render: (row) => {
        const meta = getPriorityMeta(row.priority);
        return <Badge className={meta.badgeClass}>{meta.label}</Badge>;
      },
    },
    { key: "estimatedCost", label: "Est. Cost", sortable: true, render: (row) => formatCurrency(row.estimatedCost, row.currency) },
    { key: "requiredDate", label: "Required By", sortable: true, defaultVisible: false, render: (row) => (row.requiredDate ? formatDate(row.requiredDate) : "—") },
  ];

  return (
    <AdminDataGrid
      filterTitle="Requisition Filters"
      filterSubtitle="Search and filter requisitions"
      filterIcon={ClipboardList}
      columns={columns}
      rows={rows}
      getRowId={(row) => row._id}
      total={total}
      page={page}
      totalPages={totalPages}
      sortBy={sortBy}
      sortDir={sortDir}
      emptyLabel="No requisitions match these filters."
      filters={filters}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
