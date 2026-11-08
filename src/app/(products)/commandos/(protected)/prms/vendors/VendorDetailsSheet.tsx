"use client";

import { useEffect, useState } from "react";
import { Loader2, History, Receipt } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/utils";
import { getVendorActivityAction, getVendorPurchaseHistoryAction } from "./actions";
import type { SerializedAuditLog } from "@/lib/products/spendiq/audit";

type PurchaseHistoryRow = { type: string; code: string; date: string; amount: number; status: string };

export default function VendorDetailsSheet({
  vendorId,
  vendorName,
  open,
  onOpenChange,
}: {
  vendorId: string | null;
  vendorName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [activity, setActivity] = useState<SerializedAuditLog[] | null>(null);
  const [history, setHistory] = useState<PurchaseHistoryRow[] | null>(null);

  useEffect(() => {
    if (!open || !vendorId) return;
    let cancelled = false;
    Promise.all([getVendorActivityAction(vendorId), getVendorPurchaseHistoryAction(vendorId)]).then(([a, h]) => {
      if (!cancelled) {
        setActivity(a);
        setHistory(h);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, vendorId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{vendorName ?? "Vendor"}</SheetTitle>
          <SheetDescription>Purchase history and activity log.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 overflow-y-auto px-4 pb-4">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <Receipt className="size-3.5" />
              Purchase History
            </p>
            {history === null && (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </div>
            )}
            {history !== null && history.length === 0 && (
              <p className="text-sm text-muted-foreground">No purchase orders, invoices, or expenses yet.</p>
            )}
            <div className="space-y-1.5">
              {history?.map((h, i) => (
                <div key={`${h.type}-${h.code}-${i}`} className="flex items-center justify-between rounded-lg border border-border/60 p-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground capitalize">{h.type} · {h.code}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(h.date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium tabular-nums">{formatCurrency(h.amount)}</p>
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">{h.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <History className="size-3.5" />
              Activity Log
            </p>
            {activity === null && (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </div>
            )}
            {activity !== null && activity.length === 0 && <p className="text-sm text-muted-foreground">No activity recorded yet.</p>}
            <div className="space-y-1.5">
              {activity?.map((log) => (
                <div key={log._id} className="rounded-lg border border-border/60 p-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground capitalize">{log.action.replace(/_/g, " ")}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</span>
                  </div>
                  {log.summary && <p className="mt-0.5 text-muted-foreground">{log.summary}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground/80">{log.actorEmail ?? "System"}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
