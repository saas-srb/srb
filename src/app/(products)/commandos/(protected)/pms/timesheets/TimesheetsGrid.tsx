"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Check, X as XIcon, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { getTimesheetStatusMeta } from "@/lib/products/sprintos/constants";
import { formatDate } from "@/lib/utils";
import {
  reviewTimesheetAction,
  bulkReviewTimesheetsAction,
  deleteTimesheetEntryAction,
  bulkDeleteTimesheetEntriesAction,
} from "./actions";

export interface AdminTimesheetRow {
  _id: string;
  date: string;
  employeeName: string;
  projectName: string;
  hours: number;
  billable: boolean;
  status: string;
  description: string | null;
}

function RowActions({ row }: { row: AdminTimesheetRow }) {
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState("");

  function approve() {
    startTransition(async () => {
      const result = await reviewTimesheetAction(row._id, "approved", "");
      if (!result.ok) toast.error(result.error ?? "Could not approve.");
      else toast.success("Timesheet entry approved");
    });
  }

  function reject() {
    startTransition(async () => {
      const result = await reviewTimesheetAction(row._id, "rejected", note);
      if (!result.ok) toast.error(result.error ?? "Could not reject.");
      else toast.success("Timesheet entry rejected");
      setRejectOpen(false);
      setNote("");
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTimesheetEntryAction(row._id);
      if (!result.ok) toast.error("Could not delete entry.");
      else toast.success("Entry deleted");
      setDeleteOpen(false);
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
          {row.status === "submitted" && (
            <>
              <DropdownMenuItem onClick={approve} disabled={isPending}>
                <Check className="size-3.5" />
                Approve
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRejectOpen(true)} disabled={isPending}>
                <XIcon className="size-3.5" />
                Reject
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {row.hours}h on {formatDate(row.date)} for {row.projectName}. Optionally explain why.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (optional)" rows={3} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={reject} disabled={isPending}>
              {isPending ? "Rejecting…" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>Soft-deletes the timesheet entry. This cannot be undone from here.</AlertDialogDescription>
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

  async function handleBulkReview(decision: "approved" | "rejected") {
    setPending(true);
    const result = await bulkReviewTimesheetsAction(ctx.selectedIds, decision);
    setPending(false);
    if (result.skipped > 0) {
      toast.warning(`${result.reviewed} ${decision}. ${result.skipped} skipped (not awaiting review).`);
    } else {
      toast.success(`${result.reviewed} entries ${decision}`);
    }
    ctx.clearSelection();
    ctx.refresh();
  }

  async function handleBulkDelete() {
    setPending(true);
    const result = await bulkDeleteTimesheetEntriesAction(ctx.selectedIds);
    setPending(false);
    toast.success(`Deleted ${result.deleted} entr${result.deleted === 1 ? "y" : "ies"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => handleBulkReview("approved")}>
        <Check className="size-3.5" data-icon="inline-start" />
        Approve
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => handleBulkReview("rejected")}>
        <XIcon className="size-3.5" data-icon="inline-start" />
        Reject
      </Button>
      <a
        href={`/api/commandos/sprintos/timesheets/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
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
            <AlertDialogTitle>Delete {ctx.selectedIds.length} entr{ctx.selectedIds.length === 1 ? "y" : "ies"}?</AlertDialogTitle>
            <AlertDialogDescription>Soft-deletes the selected timesheet entries.</AlertDialogDescription>
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

export default function TimesheetsGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminTimesheetRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const columns: AdminDataGridColumn<AdminTimesheetRow>[] = [
    { key: "date", label: "Date", sortable: true, render: (row) => formatDate(row.date) },
    { key: "employeeName", label: "Employee", render: (row) => row.employeeName },
    { key: "projectName", label: "Project", render: (row) => row.projectName },
    { key: "hours", label: "Hours", sortable: true, render: (row) => row.hours.toFixed(1) },
    {
      key: "billable",
      label: "Billable",
      render: (row) => <Badge variant={row.billable ? "default" : "outline"}>{row.billable ? "Yes" : "No"}</Badge>,
    },
    {
      key: "status",
      label: "Status",
      render: (row) => {
        const meta = getTimesheetStatusMeta(row.status);
        return <Badge className={meta.badgeClass}>{meta.label}</Badge>;
      },
    },
    { key: "description", label: "Description", defaultVisible: false, render: (row) => row.description ?? "—" },
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
      emptyLabel="No timesheet entries match these filters."
      filters={filters}
      filterTitle="Timesheet Filters"
      filterSubtitle="Search and filter logged timesheets"
      filterIcon={Clock}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
