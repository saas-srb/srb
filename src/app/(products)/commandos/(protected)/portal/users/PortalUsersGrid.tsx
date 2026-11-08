"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, ShieldOff, ShieldCheck, LogOut, ExternalLink, Lock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import AdminDataGrid, { type AdminDataGridColumn, type BulkActionsContext } from "@/components/products/commandos/data-grid/AdminDataGrid";
import { PORTAL_ROLE_META, type PortalRole } from "@/lib/portal-roles";
import { formatDate, formatDateTime } from "@/lib/utils";
import { updatePortalUserStatusAction, bulkUpdatePortalUserStatusAction, forceLogoutPortalUserAction } from "./actions";

export interface AdminPortalUserRow {
  _id: string;
  email: string;
  phone: string;
  displayName: string;
  role: PortalRole;
  status: "active" | "suspended";
  locked: boolean;
  activeSessions: number;
  unreadNotifications: number;
  lastLoginAt: string | null;
  createdAt: string;
  /** Deep-link to the real underlying record this login is tied to. */
  linkedRecordHref: string | null;
}

import LoginAsPortalUserButton from "@/app/(products)/dealflow-ai/(protected)/leads/list/LoginAsPortalUserButton";

function RowActions({ row }: { row: AdminPortalUserRow }) {
  const [isPending, startTransition] = useTransition();

  function toggleStatus() {
    const next = row.status === "active" ? "suspended" : "active";
    startTransition(async () => {
      const result = await updatePortalUserStatusAction(row._id, next);
      if (!result.ok) toast.error("Could not update status.");
      else toast.success(next === "suspended" ? "Account suspended" : "Account reactivated");
    });
  }

  function forceLogout() {
    startTransition(async () => {
      const result = await forceLogoutPortalUserAction(row._id);
      toast.success(`Signed out ${result.sessionsCleared} active session${result.sessionsCleared === 1 ? "" : "s"}`);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <LoginAsPortalUserButton externalUserId={row._id} displayName={row.displayName} variant="icon" />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Row actions">
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <LoginAsPortalUserButton externalUserId={row._id} displayName={row.displayName} variant="dropdown-item" />
          <DropdownMenuItem onClick={toggleStatus} disabled={isPending}>
            {row.status === "active" ? <ShieldOff className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
            {row.status === "active" ? "Suspend" : "Reactivate"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={forceLogout} disabled={isPending || row.activeSessions === 0}>
            <LogOut className="size-3.5" />
            Force logout ({row.activeSessions})
          </DropdownMenuItem>
          {row.linkedRecordHref && (
            <DropdownMenuItem
              render={
                <a href={row.linkedRecordHref}>
                  <ExternalLink className="size-3.5" />
                  View linked record
                </a>
              }
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function BulkActions({ ctx }: { ctx: BulkActionsContext }) {
  const [pending, setPending] = useState(false);

  async function handleBulkStatus(status: "active" | "suspended") {
    setPending(true);
    const result = await bulkUpdatePortalUserStatusAction(ctx.selectedIds, status);
    setPending(false);
    toast.success(`Updated ${result.updated} account${result.updated === 1 ? "" : "s"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => handleBulkStatus("suspended")}>
        <ShieldOff className="size-3.5" data-icon="inline-start" />
        Suspend
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => handleBulkStatus("active")}>
        <ShieldCheck className="size-3.5" data-icon="inline-start" />
        Reactivate
      </Button>
      <a
        href={`/api/commandos/clientos/users/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
      >
        Export
      </a>
    </>
  );
}

export default function PortalUsersGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminPortalUserRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const columns: AdminDataGridColumn<AdminPortalUserRow>[] = [
    {
      key: "displayName",
      label: "Name",
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.displayName}</p>
          <p className="text-xs">{row.email}</p>
        </div>
      ),
    },
    { key: "role", label: "Role Type", sortable: true, render: (row) => PORTAL_ROLE_META[row.role].label },
    {
      key: "status",
      label: "Login Status",
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          <Badge className={row.status === "active" ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-destructive/15 text-destructive"}>
            {row.status === "active" ? "Active" : "Suspended"}
          </Badge>
          {row.locked && <Lock className="size-3.5 text-amber-500" aria-label="Temporarily locked out" />}
        </span>
      ),
    },
    {
      key: "activeSessions",
      label: "Active Sessions",
      render: (row) => <Badge variant="outline">{row.activeSessions}</Badge>,
    },
    {
      key: "unreadNotifications",
      label: "Notifications",
      defaultVisible: false,
      render: (row) => <Badge variant="outline">{row.unreadNotifications} unread</Badge>,
    },
    {
      key: "lastLoginAt",
      label: "Last Login",
      sortable: true,
      render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt) : "Never"),
    },
    { key: "createdAt", label: "Registered", sortable: true, defaultVisible: false, render: (row) => formatDate(row.createdAt) },
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
      emptyLabel="No portal users match these filters."
      filters={filters}
      filterTitle="Portal User Filters"
      filterSubtitle="Search external portal accounts"
      filterIcon={Users}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
