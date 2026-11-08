"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Trash2, GraduationCap } from "lucide-react";
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
import { PROGRAM_STATUSES, getProgramCategoryMeta, getTrainingModeMeta } from "@/lib/products/cohort-ai/constants";
import { formatCurrency } from "@/lib/utils";
import ProgramStatusSelect from "./ProgramStatusSelect";
import { deleteProgramAction, bulkUpdateProgramStatusAction, bulkDeleteProgramsAction } from "./actions";

export interface AdminProgramRow {
  _id: string;
  programCode: string;
  name: string;
  category: string;
  mode: string;
  status: string;
  durationWeeks: number | null;
  fees: number | null;
}

function RowActions({ row }: { row: AdminProgramRow }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteProgramAction(row._id);
      if (!result.ok) toast.error(result.error ?? "Could not delete program.");
      else toast.success("Program archived");
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
            <AlertDialogDescription>Soft-deletes the program.</AlertDialogDescription>
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
    const result = await bulkUpdateProgramStatusAction(ctx.selectedIds, status);
    setPending(false);
    toast.success(`Updated ${result.updated} program${result.updated === 1 ? "" : "s"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  async function handleBulkDelete() {
    setPending(true);
    const result = await bulkDeleteProgramsAction(ctx.selectedIds);
    setPending(false);
    toast.success(`Deleted ${result.deleted} program${result.deleted === 1 ? "" : "s"}`);
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
          {PROGRAM_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <a
        href={`/api/commandos/cohort-ai/programs/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
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
            <AlertDialogTitle>Delete {ctx.selectedIds.length} program{ctx.selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>Soft-deletes the selected programs.</AlertDialogDescription>
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

export default function ProgramsGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminProgramRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const columns: AdminDataGridColumn<AdminProgramRow>[] = [
    {
      key: "name",
      label: "Program",
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.name}</p>
          <p className="text-xs">{row.programCode}</p>
        </div>
      ),
    },
    { key: "category", label: "Category", render: (row) => getProgramCategoryMeta(row.category).label },
    { key: "mode", label: "Mode", render: (row) => getTrainingModeMeta(row.mode).label },
    { key: "status", label: "Status", render: (row) => <ProgramStatusSelect id={row._id} initialStatus={row.status} /> },
    { key: "durationWeeks", label: "Duration", render: (row) => (row.durationWeeks ? `${row.durationWeeks}w` : "—") },
    { key: "fees", label: "Fees", sortable: true, render: (row) => (row.fees ? formatCurrency(row.fees) : "—") },
  ];

  return (
    <AdminDataGrid
      filterTitle="Program Filters"
      filterSubtitle="Search and filter training programs"
      filterIcon={GraduationCap}
      columns={columns}
      rows={rows}
      getRowId={(row) => row._id}
      total={total}
      page={page}
      totalPages={totalPages}
      sortBy={sortBy}
      sortDir={sortDir}
      emptyLabel="No programs match these filters."
      filters={filters}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
