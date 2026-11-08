"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import AdminDataGrid, { type AdminDataGridColumn, type BulkActionsContext } from "@/components/products/commandos/data-grid/AdminDataGrid";
import { STUDENT_STATUSES } from "@/lib/products/cohort-ai/constants";
import { formatDate } from "@/lib/utils";
import StudentStatusSelect from "./StudentStatusSelect";
import { bulkUpdateStudentStatusAction } from "./actions";

import LoginAsPortalUserButton from "@/app/(products)/dealflow-ai/(protected)/leads/list/LoginAsPortalUserButton";

export interface AdminStudentRow {
  _id: string;
  studentCode: string;
  fullName: string;
  email: string | null;
  mobile: string | null;
  status: string;
  enrollmentCount: number;
  createdAt: string;
}

function RowActions({ row }: { row: AdminStudentRow }) {
  return (
    <div className="flex items-center gap-1">
      <LoginAsPortalUserButton
        studentId={row._id}
        email={row.email ?? undefined}
        displayName={row.fullName}
        variant="icon"
      />
      <Button variant="ghost" size="icon-sm" aria-label="View full details" nativeButton={false} render={<Link href={`/cohort-ai/students/${row._id}`} />}>
        <Eye className="size-3.5" />
      </Button>
    </div>
  );
}

function BulkActions({ ctx }: { ctx: BulkActionsContext }) {
  const [pending, setPending] = useState(false);

  async function handleBulkStatus(status: string) {
    setPending(true);
    const result = await bulkUpdateStudentStatusAction(ctx.selectedIds, status);
    setPending(false);
    toast.success(`Updated ${result.updated} student${result.updated === 1 ? "" : "s"}`);
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
          {STUDENT_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <a
        href={`/api/commandos/cohort-ai/students/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
      >
        Export
      </a>
    </>
  );
}

export default function StudentsGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminStudentRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const columns: AdminDataGridColumn<AdminStudentRow>[] = [
    {
      key: "fullName",
      label: "Name",
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.fullName}</p>
          <p className="text-xs">{row.studentCode}</p>
        </div>
      ),
    },
    {
      key: "contact",
      label: "Contact",
      render: (row) => (
        <div>
          <p>{row.email ?? "—"}</p>
          <p className="text-xs">{row.mobile ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <StudentStatusSelect id={row._id} initialStatus={row.status} />,
    },
    {
      key: "enrollmentCount",
      label: "Enrollments",
      render: (row) => <Badge variant="outline">{row.enrollmentCount}</Badge>,
    },
    { key: "createdAt", label: "Joined", sortable: true, render: (row) => formatDate(row.createdAt) },
  ];

  return (
    <AdminDataGrid
      filterTitle="Student Filters"
      filterSubtitle="Search and filter enrolled students"
      filterIcon={UserCheck}
      columns={columns}
      rows={rows}
      getRowId={(row) => row._id}
      total={total}
      page={page}
      totalPages={totalPages}
      sortBy={sortBy}
      sortDir={sortDir}
      emptyLabel="No students match these filters."
      filters={filters}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
