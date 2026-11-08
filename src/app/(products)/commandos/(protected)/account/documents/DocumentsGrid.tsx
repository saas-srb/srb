"use client";

import { usePanelLabel } from "@/components/platform/PanelsProvider";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Trash2, FileText } from "lucide-react";
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
import { formatDateTime } from "@/lib/utils";
import { documentModuleLabel, type DocumentModule } from "@/lib/products/commandos/documents-shared";
import { deleteAdminDocumentAction, bulkDeleteAdminDocumentsAction } from "./actions";

export interface AdminDocumentRow {
  _id: string;
  module: DocumentModule;
  title: string;
  filename: string;
  category: string;
  size: number;
  ownerId: string;
  ownerLabel: string;
  createdAt: string;
}

function rowKey(row: Pick<AdminDocumentRow, "module" | "_id">): string {
  return `${row.module}:${row._id}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function RowActions({ row }: { row: AdminDocumentRow }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAdminDocumentAction(row.module, row._id, row.ownerId);
      if (!result.ok) toast.error("Could not delete document.");
      else toast.success("Document deleted");
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
            <AlertDialogTitle>Delete {row.title}?</AlertDialogTitle>
            <AlertDialogDescription>Removes the record and its stored file. This cannot be undone.</AlertDialogDescription>
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

function BulkActions({ ctx, rowsById }: { ctx: BulkActionsContext; rowsById: Map<string, AdminDocumentRow> }) {
  const [pending, setPending] = useState(false);

  async function handleBulkDelete() {
    setPending(true);
    const targets = ctx.selectedIds
      .map((id) => rowsById.get(id))
      .filter((r): r is AdminDocumentRow => Boolean(r))
      .map((r) => ({ module: r.module, id: r._id, ownerId: r.ownerId }));
    const result = await bulkDeleteAdminDocumentsAction(targets);
    setPending(false);
    toast.success(`Deleted ${result.deleted} document${result.deleted === 1 ? "" : "s"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  return (
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
          <AlertDialogTitle>Delete {ctx.selectedIds.length} document{ctx.selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
          <AlertDialogDescription>Removes each record and its stored file. This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleBulkDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function DocumentsGrid({
  rows,
  total,
  page,
  totalPages,
  filters,
  hasActiveFilters,
  exportHref,
}: {
  rows: AdminDocumentRow[];
  total: number;
  page: number;
  totalPages: number;
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
  exportHref: string;
}) {
  const panelLabel = usePanelLabel();
  const rowsById = useMemo(() => new Map(rows.map((r) => [rowKey(r), r])), [rows]);

  const columns: AdminDataGridColumn<AdminDocumentRow>[] = [
    {
      key: "title",
      label: "Document",
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.title}</p>
          <p className="text-xs">{row.filename}</p>
        </div>
      ),
    },
    { key: "module", label: "Module", render: (row) => <Badge variant="outline">{panelLabel(row.module, documentModuleLabel(row.module))}</Badge> },
    { key: "category", label: "Category", render: (row) => <span className="capitalize">{row.category.replace(/_/g, " ")}</span> },
    { key: "ownerLabel", label: "Owner", render: (row) => row.ownerLabel },
    { key: "size", label: "Size", render: (row) => formatBytes(row.size) },
    { key: "createdAt", label: "Uploaded", render: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <AdminDataGrid
      columns={columns}
      rows={rows}
      getRowId={rowKey}
      total={total}
      page={page}
      totalPages={totalPages}
      emptyLabel="No documents match these filters."
      filters={filters}
      filterTitle="Document Filters"
      filterSubtitle="Search and filter the shared document library"
      filterIcon={FileText}
      hasActiveFilters={hasActiveFilters}
      toolbarExtra={
        <a
          href={exportHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
        >
          Export
        </a>
      }
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} rowsById={rowsById} />}
    />
  );
}
