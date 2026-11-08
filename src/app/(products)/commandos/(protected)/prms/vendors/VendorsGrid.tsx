"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, History, Trash2, ExternalLink, Star, Truck } from "lucide-react";
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
import { VENDOR_STATUSES, getVendorCategoryLabel } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";
import VendorStatusSelect from "./VendorStatusSelect";
import VendorDetailsSheet from "./VendorDetailsSheet";
import { deleteVendorAction, bulkUpdateVendorStatusAction, bulkDeleteVendorsAction } from "./actions";

export interface AdminVendorRow {
  _id: string;
  vendorCode: string;
  companyName: string;
  category: string;
  status: string;
  contactPerson: string | null;
  email: string | null;
  rating: number | null;
  createdAt: string;
}

function RowActions({ row, onViewDetails }: { row: AdminVendorRow; onViewDetails: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteVendorAction(row._id);
      if (!result.ok) toast.error(result.error ?? "Could not delete vendor.");
      else toast.success("Vendor archived");
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
          <DropdownMenuItem onClick={onViewDetails}>
            <History className="size-3.5" />
            Purchase history &amp; activity
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <a href={`/spendiq/vendors/${row._id}`}>
                <ExternalLink className="size-3.5" />
                Open in SpendIQ
              </a>
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
            <AlertDialogTitle>Delete {row.companyName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Soft-deletes the vendor. Refused if any open requisition still references it.
            </AlertDialogDescription>
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
    const result = await bulkUpdateVendorStatusAction(ctx.selectedIds, status);
    setPending(false);
    toast.success(`Updated ${result.updated} vendor${result.updated === 1 ? "" : "s"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  async function handleBulkDelete() {
    setPending(true);
    const result = await bulkDeleteVendorsAction(ctx.selectedIds);
    setPending(false);
    if (result.skipped.length > 0) {
      toast.warning(`${result.deleted} deleted. Skipped (open requisitions): ${result.skipped.join(", ")}`);
    } else {
      toast.success(`Deleted ${result.deleted} vendor${result.deleted === 1 ? "" : "s"}`);
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
          {VENDOR_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <a
        href={`/api/commandos/spendiq/vendors/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
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
            <AlertDialogTitle>Delete {ctx.selectedIds.length} vendor{ctx.selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>Soft-deletes each vendor. Any vendor with open requisitions is skipped, not deleted.</AlertDialogDescription>
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

export default function VendorsGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminVendorRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const [detailsFor, setDetailsFor] = useState<AdminVendorRow | null>(null);
  const columns: AdminDataGridColumn<AdminVendorRow>[] = [
    {
      key: "companyName",
      label: "Vendor",
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.companyName}</p>
          <p className="text-xs">{row.vendorCode}</p>
        </div>
      ),
    },
    { key: "category", label: "Category", render: (row) => getVendorCategoryLabel(row.category) },
    {
      key: "contact",
      label: "Contact",
      render: (row) => (
        <div>
          <p>{row.contactPerson ?? "—"}</p>
          <p className="text-xs">{row.email ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <VendorStatusSelect id={row._id} initialStatus={row.status} />,
    },
    {
      key: "rating",
      label: "Rating",
      sortable: true,
      render: (row) =>
        row.rating != null ? (
          <span className="inline-flex items-center gap-1">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            {row.rating.toFixed(1)}
          </span>
        ) : (
          "—"
        ),
    },
    { key: "createdAt", label: "Onboarded", sortable: true, defaultVisible: false, render: (row) => formatDate(row.createdAt) },
  ];

  return (
    <>
      <AdminDataGrid
        filterTitle="Vendor Filters"
        filterSubtitle="Search and filter vendor records"
        filterIcon={Truck}
        columns={columns}
        rows={rows}
        getRowId={(row) => row._id}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        emptyLabel="No vendors match these filters."
        filters={filters}
        hasActiveFilters={hasActiveFilters}
        rowActions={(row) => <RowActions row={row} onViewDetails={() => setDetailsFor(row)} />}
        renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
      />
      <VendorDetailsSheet
        key={detailsFor?._id ?? "none"}
        vendorId={detailsFor?._id ?? null}
        vendorName={detailsFor?.companyName ?? null}
        open={detailsFor !== null}
        onOpenChange={(open) => !open && setDetailsFor(null)}
      />
    </>
  );
}
