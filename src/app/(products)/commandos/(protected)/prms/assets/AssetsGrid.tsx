"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Trash2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { ASSET_STATUSES } from "@/lib/products/spendiq/constants";
import { formatCurrency } from "@/lib/utils";
import AssetStatusSelect from "./AssetStatusSelect";
import { deleteAssetAction, bulkUpdateAssetStatusAction, bulkDeleteAssetsAction } from "./actions";

export interface AdminAssetRow {
  _id: string;
  assetCode: string;
  name: string;
  category: string;
  status: string;
  assignedEmployeeName: string | null;
  currentValue: number;
  currency: string;
}

function RowActions({ row }: { row: AdminAssetRow }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAssetAction(row._id);
      if (!result.ok) toast.error(result.error ?? "Could not delete asset.");
      else toast.success("Asset archived");
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
            <AlertDialogTitle>Delete {row.name}?</AlertDialogTitle>
            <AlertDialogDescription>Soft-deletes the asset. Return it from its assignee first if assigned.</AlertDialogDescription>
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
    const result = await bulkUpdateAssetStatusAction(ctx.selectedIds, status);
    setPending(false);
    toast.success(`Updated ${result.updated} asset${result.updated === 1 ? "" : "s"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  async function handleBulkDelete() {
    setPending(true);
    const result = await bulkDeleteAssetsAction(ctx.selectedIds);
    setPending(false);
    if (result.skipped.length > 0) {
      toast.warning(`${result.deleted} deleted. Skipped (still assigned): ${result.skipped.join(", ")}`);
    } else {
      toast.success(`Deleted ${result.deleted} asset${result.deleted === 1 ? "" : "s"}`);
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
          {ASSET_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <a
        href={`/api/commandos/spendiq/assets/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
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
            <AlertDialogTitle>Delete {ctx.selectedIds.length} asset{ctx.selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>Soft-deletes each asset. Any still assigned is skipped, not deleted.</AlertDialogDescription>
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

export default function AssetsGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminAssetRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const columns: AdminDataGridColumn<AdminAssetRow>[] = [
    {
      key: "name",
      label: "Asset",
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.name}</p>
          <p className="text-xs">{row.assetCode}</p>
        </div>
      ),
    },
    { key: "category", label: "Category", render: (row) => row.category },
    { key: "status", label: "Status", render: (row) => <AssetStatusSelect id={row._id} initialStatus={row.status} /> },
    { key: "assignedEmployeeName", label: "Assigned To", render: (row) => row.assignedEmployeeName ?? "—" },
    { key: "currentValue", label: "Current Value", sortable: true, render: (row) => formatCurrency(row.currentValue, row.currency) },
  ];

  return (
    <AdminDataGrid
      filterTitle="Asset Filters"
      filterSubtitle="Search and filter tracked assets"
      filterIcon={Package}
      columns={columns}
      rows={rows}
      getRowId={(row) => row._id}
      total={total}
      page={page}
      totalPages={totalPages}
      sortBy={sortBy}
      sortDir={sortDir}
      emptyLabel="No assets match these filters."
      filters={filters}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
