"use client";

import { MessageCircle } from "lucide-react";
import AdminDataGrid, { type AdminDataGridColumn } from "@/components/products/commandos/data-grid/AdminDataGrid";
import { formatDateTime } from "@/lib/utils";

export interface AdminDirectConversationRow {
  _id: string;
  participantA: string;
  participantB: string;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  createdAt: string;
}

export default function DirectMessagesGrid({
  rows,
  total,
  page,
  totalPages,
  filters,
  hasActiveFilters,
  exportHref,
}: {
  rows: AdminDirectConversationRow[];
  total: number;
  page: number;
  totalPages: number;
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
  exportHref: string;
}) {
  const columns: AdminDataGridColumn<AdminDirectConversationRow>[] = [
    {
      key: "participants",
      label: "Conversation",
      render: (row) => (
        <p className="font-medium text-foreground">
          {row.participantA} <span className="text-muted-foreground">&amp;</span> {row.participantB}
        </p>
      ),
    },
    { key: "lastMessagePreview", label: "Last message", render: (row) => row.lastMessagePreview ?? "—" },
    { key: "lastMessageAt", label: "Last activity", render: (row) => formatDateTime(row.lastMessageAt) },
    { key: "createdAt", label: "Started", defaultVisible: false, render: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <AdminDataGrid
      columns={columns}
      rows={rows}
      getRowId={(row) => row._id}
      total={total}
      page={page}
      totalPages={totalPages}
      emptyLabel="No direct message conversations match these filters."
      filters={filters}
      filterTitle="Direct Message Filters"
      filterSubtitle="Search and filter direct message threads"
      filterIcon={MessageCircle}
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
