"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, History, Trash2, ExternalLink, Building2 } from "lucide-react";
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
import { CLIENT_STATUSES } from "@/lib/products/sprintos/constants";
import { formatDate } from "@/lib/utils";
import type { SerializedClient } from "@/lib/products/sprintos/clients";
import ClientStatusSelect from "./ClientStatusSelect";
import ClientEditSheet from "./ClientEditSheet";
import ActivityLogSheet from "./ActivityLogSheet";
import { deleteClientAction, bulkUpdateClientStatusAction, bulkDeleteClientsAction } from "./actions";
import LoginAsPortalUserButton from "@/app/(products)/dealflow-ai/(protected)/leads/list/LoginAsPortalUserButton";

export type AdminClientRow = SerializedClient & { projectCount: number };

function RowActions({ row, onViewActivity }: { row: AdminClientRow; onViewActivity: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteClientAction(row._id);
      if (!result.ok) toast.error(result.error ?? "Could not delete client.");
      else toast.success("Client archived");
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
          <ClientEditSheet
            client={row}
            trigger={
              <DropdownMenuItem closeOnClick={false}>
                <Pencil className="size-3.5" />
                Edit record
              </DropdownMenuItem>
            }
          />
          <LoginAsPortalUserButton
            clientId={row._id}
            email={row.primaryContact?.email || undefined}
            displayName={row.companyName}
            variant="dropdown-item"
          />
          <DropdownMenuItem onClick={onViewActivity}>
            <History className="size-3.5" />
            View activity log
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <a href={`/sprintos/clients/${row._id}`}>
                <ExternalLink className="size-3.5" />
                Open in SprintOS
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
              Soft-deletes the client — it disappears from listings but stays in the database. Refused if any
              project still references it.
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
    const result = await bulkUpdateClientStatusAction(ctx.selectedIds, status);
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Updated ${result.updated} client${result.updated === 1 ? "" : "s"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  async function handleBulkDelete() {
    setPending(true);
    const result = await bulkDeleteClientsAction(ctx.selectedIds);
    setPending(false);
    if (result.skipped.length > 0) {
      toast.warning(`${result.deleted} deleted. Skipped (still has projects): ${result.skipped.join(", ")}`);
    } else {
      toast.success(`Deleted ${result.deleted} client${result.deleted === 1 ? "" : "s"}`);
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
          {CLIENT_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <a
        href={`/api/commandos/crm/clients/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
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
            <AlertDialogTitle>Delete {ctx.selectedIds.length} client{ctx.selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>Soft-deletes each client. Any client with active projects is skipped, not deleted.</AlertDialogDescription>
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

export default function ClientsGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminClientRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const [activityFor, setActivityFor] = useState<AdminClientRow | null>(null);

  const columns: AdminDataGridColumn<AdminClientRow>[] = [
    {
      key: "companyName",
      label: "Company",
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.companyName}</p>
          <p className="text-xs">{row.clientCode}</p>
        </div>
      ),
    },
    {
      key: "contact",
      label: "Contact",
      render: (row) => (
        <div>
          <p>{row.primaryContact.name}</p>
          <p className="text-xs">{row.primaryContact.email || row.primaryContact.phone || "—"}</p>
        </div>
      ),
    },
    { key: "industry", label: "Industry", render: (row) => row.industry ?? "—" },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => <ClientStatusSelect id={row._id} initialStatus={row.status} />,
    },
    {
      key: "projectCount",
      label: "Projects",
      render: (row) => <Badge variant="outline">{row.projectCount}</Badge>,
    },
    { key: "createdAt", label: "Created", sortable: true, render: (row) => formatDate(row.createdAt) },
  ];

  return (
    <>
      <AdminDataGrid
        columns={columns}
        rows={rows}
        getRowId={(row) => row._id}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        emptyLabel="No clients match these filters."
        filters={filters}
        filterTitle="Client Filters"
        filterSubtitle="Search and segment your client accounts"
        filterIcon={Building2}
        hasActiveFilters={hasActiveFilters}
        rowActions={(row) => <RowActions row={row} onViewActivity={() => setActivityFor(row)} />}
        renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
      />
      <ActivityLogSheet
        key={activityFor?._id ?? "none"}
        clientId={activityFor?._id ?? null}
        clientName={activityFor?.companyName ?? null}
        open={activityFor !== null}
        onOpenChange={(open) => !open && setActivityFor(null)}
      />
    </>
  );
}
