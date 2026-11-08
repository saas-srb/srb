"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History, Loader2, RotateCcw, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { SnapshotView } from "@/components/products/viralpulse-ai/StructuredEditor";
import { getVersionAction, restoreVersionAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import type { VersionListItem, TargetType } from "@/lib/products/viralpulse-ai/generations";
import { formatDateTime } from "@/lib/utils";

const SOURCE = { ai: "AI generated", edit: "Edited", restore: "Restored" } as const;

export default function VersionHistory({ targetType, targetId, campaignId, versions, canRestore }: { targetType: TargetType; targetId: string; campaignId?: string; versions: VersionListItem[]; canRestore: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<VersionListItem | null>(null);
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [loading, startLoad] = useTransition();
  const [restoring, startRestore] = useTransition();

  function view(v: VersionListItem) {
    setOpen(v);
    setSnapshot(null);
    startLoad(async () => {
      const res = await getVersionAction(targetType, targetId, v._id);
      if (!res.ok) {
        toast.error(res.error);
        setOpen(null);
      } else setSnapshot(res.snapshot);
    });
  }

  function restore(v: VersionListItem) {
    startRestore(async () => {
      const res = await restoreVersionAction(targetType, targetId, v._id, campaignId);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(`Version ${v.version} restored (saved as v${res.version}).`);
        setOpen(null);
        router.refresh();
      }
    });
  }

  if (versions.length === 0) return <p className="py-4 text-center text-xs text-muted-foreground">No versions yet — generate or save to start the history.</p>;
  return (
    <>
      <ul className="divide-y divide-border/50">
        {versions.map((v) => (
          <li key={v._id} className="flex items-center gap-2 py-2">
            <History className="size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{`v${v.version} · ${SOURCE[v.source]}`}</p>
              <p className="truncate text-[11px] text-muted-foreground">{`${formatDateTime(v.createdAt)} · ${v.userEmail ?? "system"}${v.model ? ` · ${v.model}` : ""}${v.instruction ? ` · “${v.instruction}”` : ""}`}</p>
            </div>
            <Button type="button" variant="ghost" size="xs" onClick={() => view(v)}>
              <Eye className="size-3.5" /> View
            </Button>
          </li>
        ))}
      </ul>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{open ? `Version ${open.version}` : "Version"}</DialogTitle>
            <DialogDescription>{open ? `${SOURCE[open.source]} · ${formatDateTime(open.createdAt)}` : ""}</DialogDescription>
          </DialogHeader>
          {loading || snapshot === null ? <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /> : <SnapshotView value={snapshot} />}
          {canRestore && open && (
            <DialogFooter>
              <Button type="button" onClick={() => restore(open)} disabled={restoring || loading}>
                {restoring ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Restore this version
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
