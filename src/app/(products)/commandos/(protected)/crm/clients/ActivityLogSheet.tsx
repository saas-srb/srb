"use client";

import { useEffect, useState } from "react";
import { Loader2, History } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { formatDateTime } from "@/lib/utils";
import { getClientActivityAction } from "./actions";
import type { SerializedActivityLog } from "@/lib/products/sprintos/activity";

export default function ActivityLogSheet({
  clientId,
  clientName,
  open,
  onOpenChange,
}: {
  clientId: string | null;
  clientName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [items, setItems] = useState<SerializedActivityLog[] | null>(null);

  useEffect(() => {
    if (!open || !clientId) return;
    let cancelled = false;
    getClientActivityAction(clientId).then((result) => {
      if (!cancelled) setItems(result);
    });
    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="size-4" />
            Activity Log
          </SheetTitle>
          <SheetDescription>{clientName ?? "Client"} — every recorded change, most recent first.</SheetDescription>
        </SheetHeader>
        <div className="space-y-2 overflow-y-auto px-4 pb-4">
          {items === null && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          )}
          {items !== null && items.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No activity recorded yet.</p>
          )}
          {items?.map((log) => (
            <div key={log._id} className="rounded-lg border border-border/60 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground capitalize">{log.action.replace(/_/g, " ")}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</span>
              </div>
              {log.summary && <p className="mt-1 text-muted-foreground">{log.summary}</p>}
              <p className="mt-1 text-xs text-muted-foreground/80">{log.actorEmail ?? "System"}</p>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
