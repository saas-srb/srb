"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Eye, Trash2, FolderKanban } from "lucide-react";
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
import { PROJECT_STATUSES, getPriorityMeta } from "@/lib/products/sprintos/constants";
import { formatDate } from "@/lib/utils";
import ProjectStatusSelect from "./ProjectStatusSelect";
import { deleteProjectAction, bulkChangeProjectStatusAction, bulkDeleteProjectsAction } from "./actions";

export interface AdminProjectRow {
  _id: string;
  projectCode: string;
  name: string;
  clientName: string;
  status: string;
  priority: string;
  progressPercent: number;
  managerName: string | null;
  endDate: string | null;
  createdAt: string;
}

function RowActions({ row }: { row: AdminProjectRow }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteProjectAction(row._id);
      if (!result.ok) toast.error(result.error ?? "Could not delete project.");
      else toast.success("Project archived");
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
              <Link href={`/sprintos/projects/${row._id}`}>
                <Eye className="size-3.5" />
                View full details
              </Link>
            }
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
            <AlertDialogTitle>Delete {row.name}?</AlertDialogTitle>
            <AlertDialogDescription>Soft-deletes the project and its membership rows. It disappears from listings but stays in the database.</AlertDialogDescription>
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
    const result = await bulkChangeProjectStatusAction(ctx.selectedIds, status);
    setPending(false);
    if (result.failed.length > 0) {
      toast.warning(`${result.updated} updated. Blocked by an illegal transition: ${result.failed.join(", ")}`);
    } else {
      toast.success(`Updated ${result.updated} project${result.updated === 1 ? "" : "s"}`);
    }
    ctx.clearSelection();
    ctx.refresh();
  }

  async function handleBulkDelete() {
    setPending(true);
    const result = await bulkDeleteProjectsAction(ctx.selectedIds);
    setPending(false);
    toast.success(`Deleted ${result.deleted} project${result.deleted === 1 ? "" : "s"}`);
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
          {PROJECT_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <a
        href={`/api/commandos/sprintos/projects/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
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
            <AlertDialogTitle>Delete {ctx.selectedIds.length} project{ctx.selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>Soft-deletes each project and its membership rows.</AlertDialogDescription>
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

export default function ProjectsGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminProjectRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const columns: AdminDataGridColumn<AdminProjectRow>[] = [
    {
      key: "name",
      label: "Project",
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.name}</p>
          <p className="text-xs">{row.projectCode}</p>
        </div>
      ),
    },
    { key: "clientName", label: "Client", render: (row) => row.clientName },
    {
      key: "status",
      label: "Status",
      render: (row) => <ProjectStatusSelect id={row._id} initialStatus={row.status} />,
    },
    {
      key: "priority",
      label: "Priority",
      sortable: true,
      render: (row) => {
        const meta = getPriorityMeta(row.priority);
        return <Badge className={meta.badgeClass}>{meta.label}</Badge>;
      },
    },
    {
      key: "progressPercent",
      label: "Progress",
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${row.progressPercent}%` }} />
          </div>
          <span className="text-xs tabular-nums">{row.progressPercent}%</span>
        </div>
      ),
    },
    { key: "managerName", label: "Manager", render: (row) => row.managerName ?? "—" },
    { key: "endDate", label: "End Date", sortable: true, render: (row) => (row.endDate ? formatDate(row.endDate) : "—") },
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
      emptyLabel="No projects match these filters."
      filters={filters}
      filterTitle="Project Filters"
      filterSubtitle="Search and filter projects"
      filterIcon={FolderKanban}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
