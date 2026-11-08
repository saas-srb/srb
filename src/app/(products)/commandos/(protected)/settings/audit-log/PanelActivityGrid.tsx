"use client";

import { usePanelLabel } from "@/components/platform/PanelsProvider";

import { Download, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import AdminDataGrid, { type AdminDataGridColumn } from "@/components/products/commandos/data-grid/AdminDataGrid";
import { formatDateTime } from "@/lib/utils";
import { activityModuleLabel } from "@/lib/products/commandos/activity-log-shared";

export interface AdminActivityRow {
  _id: string;
  module: string;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string;
  entityLabel: string | null;
  summary: string | null;
  createdAt: string;
}

const ACTION_BADGE: Record<string, string> = {
  create: "bg-green-500/10 text-green-600 dark:text-green-400",
  status_change: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  update: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  delete: "bg-destructive/10 text-destructive",
  login: "bg-muted text-muted-foreground",
  logout: "bg-muted text-muted-foreground",
};

export default function PanelActivityGrid({
  rows,
  total,
  page,
  totalPages,
  filters,
  hasActiveFilters,
  exportHref,
}: {
  rows: AdminActivityRow[];
  total: number;
  page: number;
  totalPages: number;
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
  exportHref: string;
}) {
  const panelLabel = usePanelLabel();
  const columns: AdminDataGridColumn<AdminActivityRow>[] = [
    { key: "module", label: "Module", render: (row) => <Badge variant="outline">{panelLabel(row.module, activityModuleLabel(row.module))}</Badge> },
    {
      key: "action",
      label: "Action",
      render: (row) => (
        <Badge className={`capitalize ${ACTION_BADGE[row.action] ?? "bg-muted text-muted-foreground"}`}>
          {row.action.replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      key: "entity",
      label: "Entity",
      render: (row) => (
        <div>
          <p className="font-medium text-foreground capitalize">{row.entity.replace(/_/g, " ")}</p>
          <p className="text-xs">{row.entityLabel ?? row.entityId.slice(0, 12)}</p>
        </div>
      ),
    },
    { key: "summary", label: "Summary", render: (row) => row.summary ?? "—" },
    { key: "actorEmail", label: "Actor", render: (row) => row.actorEmail ?? "System" },
    { key: "createdAt", label: "When", sortable: false, render: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <AdminDataGrid
      columns={columns}
      rows={rows}
      getRowId={(row) => `${row.module}:${row._id}`}
      total={total}
      page={page}
      totalPages={totalPages}
      emptyLabel="No activity matches these filters."
      filters={filters}
      filterTitle="Activity Log Filters"
      filterSubtitle="Trace platform activity by actor, action, and date"
      filterIcon={History}
      hasActiveFilters={hasActiveFilters}
      toolbarExtra={
        <a
          href={exportHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
        >
          <Download className="size-3.5" />
          Export
        </a>
      }
    />
  );
}
