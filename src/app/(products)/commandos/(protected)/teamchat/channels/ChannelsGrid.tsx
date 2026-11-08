"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Archive, ArchiveRestore, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import AdminDataGrid, { type AdminDataGridColumn, type BulkActionsContext } from "@/components/products/commandos/data-grid/AdminDataGrid";
import { formatDateTime } from "@/lib/utils";
import { setChannelArchivedAction, bulkSetChannelArchivedAction } from "./actions";

export interface AdminChannelRow {
  _id: string;
  name: string;
  kind: string;
  visibility: string;
  memberCount: number;
  archived: boolean;
  lastActivityAt: string;
  createdAt: string;
}

function RowActions({ row }: { row: AdminChannelRow }) {
  const [isPending, startTransition] = useTransition();

  function toggleArchived() {
    startTransition(async () => {
      const result = await setChannelArchivedAction(row._id, !row.archived);
      if (!result.ok) toast.error(result.error ?? "Could not update channel.");
      else toast.success(row.archived ? "Channel unarchived" : "Channel archived");
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Row actions">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={toggleArchived} disabled={isPending}>
          {row.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
          {row.archived ? "Unarchive" : "Archive"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkActions({ ctx }: { ctx: BulkActionsContext }) {
  const [pending, setPending] = useState(false);

  async function handleBulk(archived: boolean) {
    setPending(true);
    const result = await bulkSetChannelArchivedAction(ctx.selectedIds, archived);
    setPending(false);
    toast.success(`Updated ${result.updated} channel${result.updated === 1 ? "" : "s"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => handleBulk(true)}>
        <Archive className="size-3.5" data-icon="inline-start" />
        Archive
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => handleBulk(false)}>
        <ArchiveRestore className="size-3.5" data-icon="inline-start" />
        Unarchive
      </Button>
      <a
        href={`/api/commandos/teamchat/channels/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
      >
        Export
      </a>
    </>
  );
}

export default function ChannelsGrid({
  rows,
  total,
  page,
  totalPages,
  filters,
  hasActiveFilters,
  exportHref,
}: {
  rows: AdminChannelRow[];
  total: number;
  page: number;
  totalPages: number;
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
  exportHref: string;
}) {
  const columns: AdminDataGridColumn<AdminChannelRow>[] = [
    { key: "name", label: "Channel", render: (row) => <p className="font-medium text-foreground">#{row.name}</p> },
    { key: "kind", label: "Kind", render: (row) => <span className="capitalize">{row.kind}</span> },
    { key: "visibility", label: "Visibility", render: (row) => <span className="capitalize">{row.visibility}</span> },
    { key: "memberCount", label: "Members", render: (row) => row.memberCount },
    {
      key: "archived",
      label: "Status",
      render: (row) => <Badge variant={row.archived ? "outline" : "default"}>{row.archived ? "Archived" : "Active"}</Badge>,
    },
    { key: "lastActivityAt", label: "Last activity", render: (row) => formatDateTime(row.lastActivityAt) },
  ];

  return (
    <AdminDataGrid
      columns={columns}
      rows={rows}
      getRowId={(row) => row._id}
      total={total}
      page={page}
      totalPages={totalPages}
      emptyLabel="No channels match these filters."
      filters={filters}
      filterTitle="Channel Filters"
      filterSubtitle="Search and filter Team Chat channels"
      filterIcon={Hash}
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
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
