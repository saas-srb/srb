"use client";

import { Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import AdminDataGrid, { type AdminDataGridColumn } from "@/components/products/commandos/data-grid/AdminDataGrid";
import { formatDateTime } from "@/lib/utils";

export interface AdminMeetingRow {
  _id: string;
  title: string;
  hostName: string;
  kind: string;
  status: string;
  startAt: string;
  durationMins: number;
  participantCount: number;
  recordingEnabled: boolean;
}

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  live: "bg-green-500/10 text-green-600 dark:text-green-400",
  ended: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export default function MeetingsGrid({
  rows,
  total,
  page,
  totalPages,
  filters,
  hasActiveFilters,
  exportHref,
}: {
  rows: AdminMeetingRow[];
  total: number;
  page: number;
  totalPages: number;
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
  exportHref: string;
}) {
  const columns: AdminDataGridColumn<AdminMeetingRow>[] = [
    { key: "title", label: "Meeting", render: (row) => <p className="font-medium text-foreground">{row.title}</p> },
    { key: "hostName", label: "Host", render: (row) => row.hostName },
    { key: "kind", label: "Kind", render: (row) => <span className="capitalize">{row.kind}</span> },
    {
      key: "status",
      label: "Status",
      render: (row) => <Badge className={`capitalize ${STATUS_BADGE[row.status] ?? ""}`}>{row.status}</Badge>,
    },
    { key: "startAt", label: "Start", render: (row) => formatDateTime(row.startAt) },
    { key: "durationMins", label: "Duration", render: (row) => `${row.durationMins} min` },
    { key: "participantCount", label: "Participants", render: (row) => row.participantCount },
  ];

  return (
    <AdminDataGrid
      columns={columns}
      rows={rows}
      getRowId={(row) => row._id}
      total={total}
      page={page}
      totalPages={totalPages}
      emptyLabel="No meetings match these filters."
      filters={filters}
      filterTitle="Meeting Filters"
      filterSubtitle="Search and filter scheduled meetings"
      filterIcon={Video}
      hasActiveFilters={hasActiveFilters}
      toolbarExtra={
        <a
          href={exportHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
        >
          Export
        </a>
      }
    />
  );
}
