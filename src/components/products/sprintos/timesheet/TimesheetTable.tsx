"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, Send, Loader2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
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
import TimesheetLogger from "@/components/products/sprintos/timesheet/TimesheetLogger";
import { getTimesheetStatusMeta, EDITABLE_TIMESHEET_STATUSES } from "@/lib/products/sprintos/constants";
import { cn, formatDate } from "@/lib/utils";
import { deleteTimesheetAction, submitTimesheetAction } from "@/app/(products)/sprintos/(protected)/me/timesheet/actions";
import type { SerializedTimesheetEntry } from "@/lib/products/sprintos/timesheets";

interface Row extends SerializedTimesheetEntry {
  projectName: string;
  taskTitle: string | null;
}

interface ProjectOption {
  _id: string;
  name: string;
  tasks: { _id: string; title: string }[];
}

export default function TimesheetTable({
  entries,
  projects,
}: {
  entries: Row[];
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const submittable = entries.filter((e) => (EDITABLE_TIMESHEET_STATUSES as string[]).includes(e.status));
  const editable = (s: string) => (EDITABLE_TIMESHEET_STATUSES as string[]).includes(s);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitSelected() {
    const ids = [...selected].filter((id) => submittable.some((e) => e._id === id));
    if (ids.length === 0) {
      toast.error("Select draft or rejected entries to submit.");
      return;
    }
    startTransition(async () => {
      const result = await submitTimesheetAction(ids);
      if (result.error) toast.error(result.error);
      else toast.success(`Submitted ${ids.length} ${ids.length === 1 ? "entry" : "entries"} for review`);
      setSelected(new Set());
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteTimesheetAction(id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete entry.");
        return;
      }
      toast.success("Entry deleted");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {submittable.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{selected.size} selected</span>
          <Button type="button" size="sm" onClick={submitSelected} disabled={pending || selected.size === 0}>
            {pending ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Send className="size-3.5" data-icon="inline-start" />}
            Submit for review
          </Button>
        </div>
      )}

      <GlassCard interactive={false}>
        <CardContent className="max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Date</TableHead>
                <TableHead>Project / Task</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Billable</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">No time entries yet.</TableCell>
                </TableRow>
              )}
              {entries.map((e) => {
                const meta = getTimesheetStatusMeta(e.status);
                return (
                  <TableRow key={e._id}>
                    <TableCell>
                      {editable(e.status) && (
                        <Checkbox checked={selected.has(e._id)} onCheckedChange={() => toggle(e._id)} aria-label="Select entry" />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(e.date)}
                      {e.startTime && e.endTime && <div className="text-xs">{e.startTime}–{e.endTime}</div>}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{e.projectName}</span>
                      {e.taskTitle && <div className="text-xs text-muted-foreground">{e.taskTitle}</div>}
                      {e.description && <div className="text-xs text-muted-foreground/80">{e.description}</div>}
                      {e.status === "rejected" && e.reviewNote && (
                        <div className="mt-0.5 text-xs text-destructive">Rejected: {e.reviewNote}</div>
                      )}
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
                      {editable(e.status) && (
                        <div className="flex items-center gap-1">
                          <TimesheetLogger
                            projects={projects}
                            entry={e}
                            trigger={
                              <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit entry">
                                <Pencil className="size-3.5" />
                              </Button>
                            }
                          />
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button type="button" variant="ghost" size="icon-sm" aria-label="Delete entry" disabled={pending}>
                                  <Trash2 className="size-3.5" />
                                </Button>
                              }
                            />
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                                <AlertDialogDescription>{e.hours}h on {formatDate(e.date)} — {e.projectName}.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove(e._id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
