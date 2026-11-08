"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Trash2, ExternalLink, Mic } from "lucide-react";
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
import { deleteVoiceConversationAction, bulkDeleteVoiceConversationsAction } from "./actions";

export interface AdminVoiceConversationRow {
  _id: string;
  sessionId: string;
  visitorName: string | null;
  visitorEmail: string | null;
  device: string;
  sourcePage: string | null;
  voiceId: string;
  startedAt: string;
  lastActivityAt: string;
  durationMs: number;
  voiceMessageCount: number;
  status: string;
  preview: string;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function RowActions({ row }: { row: AdminVoiceConversationRow }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteVoiceConversationAction(row._id);
      if (!result.ok) toast.error("Could not delete conversation.");
      else toast.success("Conversation deleted");
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
          <DropdownMenuItem
            render={
              <a href={`/commandos/chatbot/voice-conversations/${row._id}`}>
                <ExternalLink className="size-3.5" />
                View transcript
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
            <AlertDialogTitle>Delete this voice conversation?</AlertDialogTitle>
            <AlertDialogDescription>Removes the session, its transcripts, and stored audio. This cannot be undone.</AlertDialogDescription>
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

  async function handleBulkDelete() {
    setPending(true);
    const result = await bulkDeleteVoiceConversationsAction(ctx.selectedIds);
    setPending(false);
    toast.success(`Deleted ${result.deleted} conversation${result.deleted === 1 ? "" : "s"}`);
    ctx.clearSelection();
    ctx.refresh();
  }

  return (
    <>
      <a
        href={`/api/commandos/chatbot/voice-conversations/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
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
            <AlertDialogTitle>Delete {ctx.selectedIds.length} conversation{ctx.selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>Removes each session, its transcripts, and stored audio. This cannot be undone.</AlertDialogDescription>
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

export default function VoiceConversationsGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
}: {
  rows: AdminVoiceConversationRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
}) {
  const columns: AdminDataGridColumn<AdminVoiceConversationRow>[] = [
    {
      key: "visitor",
      label: "Visitor",
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.visitorName ?? "Anonymous"}</p>
          <p className="text-xs">{row.visitorEmail ?? row.sessionId.slice(0, 12)}</p>
        </div>
      ),
    },
    { key: "preview", label: "First message", render: (row) => <span className="line-clamp-2">{row.preview}</span> },
    { key: "device", label: "Device", render: (row) => <span className="capitalize">{row.device}</span> },
    { key: "sourcePage", label: "Source page", render: (row) => row.sourcePage ?? "—" },
    { key: "durationMs", label: "Duration", sortable: true, render: (row) => formatDuration(row.durationMs) },
    { key: "voiceMessageCount", label: "Turns", sortable: true, render: (row) => row.voiceMessageCount },
    {
      key: "status",
      label: "Status",
      render: (row) => <Badge variant={row.status === "active" ? "default" : "outline"} className="capitalize">{row.status}</Badge>,
    },
    { key: "startedAt", label: "Started", sortable: true, render: (row) => formatDateTime(row.startedAt) },
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
      emptyLabel="No voice conversations match these filters."
      filters={filters}
      filterTitle="Voice Conversation Filters"
      filterSubtitle="Search voice-bot conversations in real time"
      filterIcon={Mic}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => <RowActions row={row} />}
      renderBulkActions={(ctx) => <BulkActions ctx={ctx} />}
    />
  );
}
