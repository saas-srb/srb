"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Eye, Trash2, Paperclip, Download, Calendar, Briefcase } from "lucide-react";
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
import { CAREER_APPLICATION_STATUSES } from "@/lib/career-application-status";
import { offerStatusMeta } from "@/lib/products/talentos/offers-status";
import { formatDate, formatDateTime } from "@/lib/utils";
import ApplicantStatusSelect from "./ApplicantStatusSelect";
import { deleteApplicantAction, bulkUpdateApplicantStatusAction, bulkDeleteApplicantsAction } from "./actions";

export interface AdminApplicantRow {
  _id: string;
  name: string;
  email: string;
  phone: string;
  positionTitle: string;
  status: string;
  hasResume: boolean;
  createdAt: string;
  offerStatus: string | null;
  nextInterview: { title: string; mode: string; status: string; scheduledAt: string } | null;
}

import LoginAsPortalUserButton from "@/app/(products)/dealflow-ai/(protected)/leads/list/LoginAsPortalUserButton";

function RowActions({ row }: { row: AdminApplicantRow }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteApplicantAction(row._id);
      if (!result.ok) toast.error("Could not delete applicant.");
      else toast.success("Applicant deleted");
      setOpen(false);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <LoginAsPortalUserButton applicationId={row._id} displayName={row.name} variant="icon" />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Row actions">
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <LoginAsPortalUserButton applicationId={row._id} displayName={row.name} variant="dropdown-item" />
          <DropdownMenuItem
            render={
              <Link href={`/dealflow-ai/careers/applicants/${row._id}`}>
                <Eye className="size-3.5" />
                View full details
              </Link>
            }
          />
          {row.hasResume && (
            <DropdownMenuItem
              render={
                <a href={`/api/commandos/careers/applicants/${row._id}/resume`}>
                  <Download className="size-3.5" />
                  Download resume
                </a>
              }
            />
          )}
          <DropdownMenuItem variant="destructive" onClick={() => setOpen(true)}>
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this applicant?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the application and its resume file. This cannot be undone.
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
    const result = await bulkUpdateApplicantStatusAction(ctx.selectedIds, status);
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Updated ${result.updated} applicant${result.updated === 1 ? "" : "s"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  async function handleBulkDelete() {
    setPending(true);
    const result = await bulkDeleteApplicantsAction(ctx.selectedIds);
    setPending(false);
    toast.success(`Deleted ${result.deleted} applicant${result.deleted === 1 ? "" : "s"}`);
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
          {CAREER_APPLICATION_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <a
        href={`/api/commandos/careers/applicants/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
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
            <AlertDialogTitle>Delete {ctx.selectedIds.length} applicant{ctx.selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the selected applications and their resume files. This cannot be undone.</AlertDialogDescription>
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

export default function ApplicantsGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminApplicantRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const columns: AdminDataGridColumn<AdminApplicantRow>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (row) => (
        <div>
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            {row.name}
            {row.hasResume && <Paperclip className="size-3 text-muted-foreground" />}
          </p>
          <p className="text-xs">{row.email}</p>
        </div>
      ),
    },
    { key: "positionTitle", label: "Position", render: (row) => row.positionTitle },
    {
      key: "status",
      label: "Hiring Stage",
      render: (row) => <ApplicantStatusSelect id={row._id} initialStatus={row.status} />,
    },
    {
      key: "nextInterview",
      label: "Interview Schedule",
      render: (row) =>
        row.nextInterview ? (
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            <div>
              <p className="text-foreground">{formatDateTime(row.nextInterview.scheduledAt)}</p>
              <p className="text-xs capitalize">{row.nextInterview.mode} · {row.nextInterview.status}</p>
            </div>
          </div>
        ) : (
          "—"
        ),
    },
    {
      key: "offerStatus",
      label: "Offer Status",
      render: (row) => (row.offerStatus ? <Badge variant="outline">{offerStatusMeta(row.offerStatus).label}</Badge> : "—"),
    },
    { key: "createdAt", label: "Applied", sortable: true, render: (row) => formatDate(row.createdAt) },
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
      emptyLabel="No applicants match these filters."
      filters={filters}
      filterTitle="Applicant Filters"
      filterSubtitle="Narrow down job applicants by role and status"
      filterIcon={Briefcase}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
