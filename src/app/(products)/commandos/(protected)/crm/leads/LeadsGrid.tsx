"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Eye, Trash2, Filter } from "lucide-react";
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
import { getCategoryLabel } from "@/lib/categories";
import { LEAD_STATUSES } from "@/lib/lead-status";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { AdminLeadRow } from "@/lib/products/commandos/crm-leads";
import LeadStatusSelect from "./LeadStatusSelect";
import { deleteLeadAction, bulkUpdateLeadStatusAction, bulkDeleteLeadsAction } from "./actions";
import LoginAsPortalUserButton from "@/app/(products)/dealflow-ai/(protected)/leads/list/LoginAsPortalUserButton";

function RowActions({ row }: { row: AdminLeadRow }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteLeadAction(row.category, row._id);
      if (!result.ok) toast.error(result.error ?? "Could not delete lead.");
      else toast.success("Lead deleted");
      setOpen(false);
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
              <Link href={`/dealflow-ai/submissions/${row.category}/${row._id}`}>
                <Eye className="size-3.5" />
                View full details
              </Link>
            }
          />
          <LoginAsPortalUserButton
            leadId={row._id}
            email={row.email ?? undefined}
            displayName={row.name}
            variant="dropdown-item"
          />
          <DropdownMenuItem variant="destructive" onClick={() => setOpen(true)}>
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the lead and its resume file, if any. This cannot be undone.
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

  const selectedItems = ctx.selectedIds.map((composite) => {
    const [category, id] = composite.split(":");
    return { id, category };
  });
  const exportIds = ctx.selectedIds.join(",");

  async function handleBulkStatus(status: string) {
    setPending(true);
    const result = await bulkUpdateLeadStatusAction(selectedItems, status);
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Updated ${result.updated} lead${result.updated === 1 ? "" : "s"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  async function handleBulkDelete() {
    setPending(true);
    const result = await bulkDeleteLeadsAction(selectedItems);
    setPending(false);
    toast.success(`Deleted ${result.deleted} lead${result.deleted === 1 ? "" : "s"}`);
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
          {LEAD_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <a
        href={`/api/commandos/crm/leads/export?ids=${encodeURIComponent(exportIds)}`}
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
            <AlertDialogTitle>Delete {ctx.selectedIds.length} lead{ctx.selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the selected leads and their resume files, if any. This cannot be undone.</AlertDialogDescription>
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

export default function LeadsGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminLeadRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const columns: AdminDataGridColumn<AdminLeadRow>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.name}</p>
          <p className="text-xs">{row.email || row.phone}</p>
        </div>
      ),
    },
    { key: "category", label: "Category", render: (row) => getCategoryLabel(row.category) },
    {
      key: "status",
      label: "Status",
      render: (row) => <LeadStatusSelect category={row.category} id={row._id} initialStatus={row.status ?? "new"} />,
    },
    { key: "source", label: "Source", render: (row) => row.source ?? "—" },
    {
      key: "dealValue",
      label: "Deal Value",
      sortable: true,
      render: (row) => (row.dealValue ? formatCurrency(row.dealValue) : "—"),
    },
    { key: "createdAt", label: "Created", sortable: true, render: (row) => formatDate(row.createdAt) },
  ];

  return (
    <AdminDataGrid
      columns={columns}
      rows={rows}
      getRowId={(row) => `${row.category}:${row._id}`}
      total={total}
      page={page}
      totalPages={totalPages}
      sortBy={sortBy}
      sortDir={sortDir}
      emptyLabel="No leads match these filters."
      filters={filters}
      filterTitle="CRM Lead Filters"
      filterSubtitle="Refine leads by stage, source, and owner"
      filterIcon={Filter}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
