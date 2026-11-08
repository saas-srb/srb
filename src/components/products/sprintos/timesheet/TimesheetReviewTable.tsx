"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Loader2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { getTimesheetStatusMeta } from "@/lib/products/sprintos/constants";
import { cn, formatDate } from "@/lib/utils";
import { reviewTimesheetAction, bulkReviewTimesheetsAction } from "@/app/(products)/sprintos/(protected)/(staff)/timesheets/review-actions";
import type { SerializedTimesheetEntry } from "@/lib/products/sprintos/timesheets";

interface Row extends SerializedTimesheetEntry {
  employeeName: string;
  projectName: string;
  taskTitle: string | null;
}

export default function TimesheetReviewTable({ entries }: { entries: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});

  const pendingRows = entries.filter((e) => e.status === "submitted");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function decide(id: string, decision: "approved" | "rejected") {
    startTransition(async () => {
      const result = await reviewTimesheetAction(id, decision, notes[id] ?? "");
      if (!result.ok) {
        toast.error(result.error ?? "Could not update entry.");
        return;
      }
      toast.success(decision === "approved" ? "Approved" : "Rejected");
      router.refresh();
    });
  }

  function bulk(decision: "approved" | "rejected") {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      const result = await bulkReviewTimesheetsAction(ids, decision);
      if (result.error) toast.error(result.error);
      else toast.success(`${decision === "approved" ? "Approved" : "Rejected"} ${ids.length}`);
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {pendingRows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{selected.size} selected of {pendingRows.length} awaiting review</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => bulk("rejected")} disabled={pending || selected.size === 0}>
              <X className="size-3.5" data-icon="inline-start" /> Reject
            </Button>
            <Button type="button" size="sm" onClick={() => bulk("approved")} disabled={pending || selected.size === 0}>
              {pending ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Check className="size-3.5" data-icon="inline-start" />}
              Approve
            </Button>
          </div>
        </div>
      )}

      <GlassCard interactive={false}>
        <CardContent className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Date</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Project / Task</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Billable</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-64" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nothing to review.</TableCell></TableRow>
              )}
              {entries.map((e) => {
                const meta = getTimesheetStatusMeta(e.status);
                const isPending = e.status === "submitted";
                return (
                  <TableRow key={e._id}>
                    <TableCell>
                      {isPending && <Checkbox checked={selected.has(e._id)} onCheckedChange={() => toggle(e._id)} aria-label="Select" />}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(e.date)}</TableCell>
                    <TableCell className="font-medium">{e.employeeName}</TableCell>
                    <TableCell>
                      {e.projectName}
                      {e.taskTitle && <div className="text-xs text-muted-foreground">{e.taskTitle}</div>}
                      {e.description && <div className="text-xs text-muted-foreground/80">{e.description}</div>}
                    </TableCell>
                    <TableCell className="tabular-nums font-medium">{e.hours}</TableCell>
                    <TableCell className="text-muted-foreground">{e.billable ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs", meta.badgeClass)}>
                        <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      {isPending && (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={notes[e._id] ?? ""}
                            onChange={(ev) => setNotes((n) => ({ ...n, [e._id]: ev.target.value }))}
                            placeholder="Note (optional)"
                            className="h-8 w-32"
                          />
                          <Button type="button" size="icon-sm" variant="ghost" onClick={() => decide(e._id, "approved")} disabled={pending} aria-label="Approve">
                            <Check className="size-3.5 text-green-600" />
                          </Button>
                          <Button type="button" size="icon-sm" variant="ghost" onClick={() => decide(e._id, "rejected")} disabled={pending} aria-label="Reject">
                            <X className="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>
    </div>
  );
}
