"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Eye, Trash2, Milestone } from "lucide-react";
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
import { MILESTONE_STATUSES } from "@/lib/products/sprintos/constants";
import { formatDate } from "@/lib/utils";
import MilestoneStatusSelect from "./MilestoneStatusSelect";
import { deleteMilestoneAction, bulkUpdateMilestoneStatusAction, bulkDeleteMilestonesAction } from "./actions";

export interface AdminMilestoneRow {
  _id: string;
  name: string;
  projectId: string;
  projectName: string;
  status: string;
  manualProgressPercent: number;
  dueDate: string | null;
  createdAt: string;
}

function RowActions({ row }: { row: AdminMilestoneRow }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteMilestoneAction(row._id);
      if (!result.ok) toast.error("Could not delete milestone.");
      else toast.success("Milestone deleted");
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
              <Link href={`/sprintos/projects/${row.projectId}`}>
                <Eye className="size-3.5" />
                View in project
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
            <AlertDialogTitle>Delete this milestone?</AlertDialogTitle>
            <AlertDialogDescription>Soft-deletes the milestone. This cannot be undone from here.</AlertDialogDescription>
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
    const result = await bulkUpdateMilestoneStatusAction(ctx.selectedIds, status);
    setPending(false);
    toast.success(`Updated ${result.updated} milestone${result.updated === 1 ? "" : "s"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  async function handleBulkDelete() {
    setPending(true);
    const result = await bulkDeleteMilestonesAction(ctx.selectedIds);
    setPending(false);
    toast.success(`Deleted ${result.deleted} milestone${result.deleted === 1 ? "" : "s"}`);
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
          {MILESTONE_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <a
        href={`/api/commandos/sprintos/milestones/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
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
            <AlertDialogTitle>Delete {ctx.selectedIds.length} milestone{ctx.selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>Soft-deletes the selected milestones.</AlertDialogDescription>
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

export default function MilestonesGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminMilestoneRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const columns: AdminDataGridColumn<AdminMilestoneRow>[] = [
    { key: "name", label: "Milestone", sortable: true, render: (row) => <p className="font-medium text-foreground">{row.name}</p> },
    { key: "projectName", label: "Project", render: (row) => row.projectName },
    { key: "status", label: "Status", render: (row) => <MilestoneStatusSelect id={row._id} initialStatus={row.status} /> },
    {
      key: "manualProgressPercent",
      label: "Progress",
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${row.manualProgressPercent}%` }} />
          </div>
          <span className="text-xs tabular-nums">{row.manualProgressPercent}%</span>
        </div>
      ),
    },
    { key: "dueDate", label: "Due Date", sortable: true, render: (row) => (row.dueDate ? formatDate(row.dueDate) : "—") },
    { key: "createdAt", label: "Created", sortable: true, defaultVisible: false, render: (row) => formatDate(row.createdAt) },
  ];

  return (
    <AdminDataGrid
      columns={columns}
      rows={rows}
      getRowId={(row) => row._id}
      total={total}
      page={page}
      totalPages={totalPages}
      sortBy={sortBy}
      sortDir={sortDir}
      emptyLabel="No milestones match these filters."
      filters={filters}
      filterTitle="Milestone Filters"
      filterSubtitle="Search and filter project milestones"
      filterIcon={Milestone}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
