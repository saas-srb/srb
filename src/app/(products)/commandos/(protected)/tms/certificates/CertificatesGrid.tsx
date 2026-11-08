"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Trash2, ShieldOff, ShieldCheck, Award } from "lucide-react";
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
import { formatDate } from "@/lib/utils";
import { setCertificateRevokedAction, deleteCertificateAction, bulkSetCertificatesRevokedAction, bulkDeleteCertificatesAction } from "./actions";

export interface AdminCertificateRow {
  _id: string;
  certificateNumber: string;
  typeLabel: string;
  studentName: string;
  programName: string;
  issuedOn: string;
  grade: string | null;
  revoked: boolean;
}

function RowActions({ row }: { row: AdminCertificateRow }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function toggleRevoked() {
    startTransition(async () => {
      const result = await setCertificateRevokedAction(row._id, !row.revoked);
      if (!result.ok) toast.error("Could not update certificate.");
      else toast.success(row.revoked ? "Certificate reinstated" : "Certificate revoked");
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteCertificateAction(row._id);
      if (!result.ok) toast.error("Could not delete certificate.");
      else toast.success("Certificate deleted");
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
          <DropdownMenuItem onClick={toggleRevoked} disabled={isPending}>
            {row.revoked ? <ShieldCheck className="size-3.5" /> : <ShieldOff className="size-3.5" />}
            {row.revoked ? "Reinstate" : "Revoke"}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {row.certificateNumber}?</AlertDialogTitle>
            <AlertDialogDescription>Soft-deletes the certificate record.</AlertDialogDescription>
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

  async function handleBulkRevoke(revoked: boolean) {
    setPending(true);
    const result = await bulkSetCertificatesRevokedAction(ctx.selectedIds, revoked);
    setPending(false);
    toast.success(`Updated ${result.updated} certificate${result.updated === 1 ? "" : "s"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  async function handleBulkDelete() {
    setPending(true);
    const result = await bulkDeleteCertificatesAction(ctx.selectedIds);
    setPending(false);
    toast.success(`Deleted ${result.deleted} certificate${result.deleted === 1 ? "" : "s"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => handleBulkRevoke(true)}>
        <ShieldOff className="size-3.5" data-icon="inline-start" />
        Revoke
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => handleBulkRevoke(false)}>
        <ShieldCheck className="size-3.5" data-icon="inline-start" />
        Reinstate
      </Button>
      <a
        href={`/api/commandos/cohort-ai/certificates/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
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
            <AlertDialogTitle>Delete {ctx.selectedIds.length} certificate{ctx.selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>Soft-deletes the selected certificates.</AlertDialogDescription>
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

export default function CertificatesGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminCertificateRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const columns: AdminDataGridColumn<AdminCertificateRow>[] = [
    {
      key: "certificateNumber",
      label: "Certificate",
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.certificateNumber}</p>
          <p className="text-xs">{row.typeLabel}</p>
        </div>
      ),
    },
    { key: "studentName", label: "Student", render: (row) => row.studentName },
    { key: "programName", label: "Program", render: (row) => row.programName },
    { key: "issuedOn", label: "Issued On", sortable: true, render: (row) => formatDate(row.issuedOn) },
    { key: "grade", label: "Grade", defaultVisible: false, render: (row) => row.grade ?? "—" },
    {
      key: "revoked",
      label: "Status",
      render: (row) => (
        <Badge className={row.revoked ? "bg-destructive/15 text-destructive" : "bg-green-500/15 text-green-600 dark:text-green-400"}>
          {row.revoked ? "Revoked" : "Valid"}
        </Badge>
      ),
    },
  ];

  return (
    <AdminDataGrid
      filterTitle="Certificate Filters"
      filterSubtitle="Search and filter issued certificates"
      filterIcon={Award}
      columns={columns}
      rows={rows}
      getRowId={(row) => row._id}
      total={total}
      page={page}
      totalPages={totalPages}
      sortBy={sortBy}
      sortDir={sortDir}
      emptyLabel="No certificates match these filters."
      filters={filters}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
