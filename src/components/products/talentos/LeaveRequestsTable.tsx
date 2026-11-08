"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Check, X, Ban, ChevronRight, ChevronLeft, CalendarOff } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
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
import LeaveStatusBadge from "@/components/products/talentos/LeaveStatusBadge";
import { LEAVE_REQUEST_STATUSES } from "@/lib/products/talentos/leave-status";
import { formatDate, formatDateTime } from "@/lib/utils";
import { decideLeaveAction, cancelLeaveAction } from "@/app/(products)/talentos/(protected)/(staff)/leave/actions";

interface Req {
  _id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  leaveTypeCode: string;
  leaveTypeLabel: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export default function LeaveRequestsTable({
  items,
  total,
  page,
  totalPages,
  leaveTypes,
  initial,
  canDecide,
}: {
  items: Req[];
  total: number;
  page: number;
  totalPages: number;
  leaveTypes: { code: string; label: string }[];
  initial: { status: string; leaveType: string; search: string };
  canDecide: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  function setParam(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "requests");
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  function pageHref(target: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "requests");
    params.set("page", String(target));
    return `${pathname}?${params.toString()}`;
  }

  function decide(id: string, decision: "approved" | "rejected") {
    startTransition(async () => {
      const result = await decideLeaveAction(id, decision, decision === "rejected" ? note : "");
      if (!result.ok) {
        toast.error(result.error ?? "Could not update request.");
        return;
      }
      toast.success(decision === "approved" ? "Leave approved" : "Leave rejected");
      setNoteFor(null);
      setNote("");
      router.refresh();
    });
  }

  function cancel(id: string) {
    startTransition(async () => {
      const result = await cancelLeaveAction(id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not cancel request.");
        return;
      }
      toast.success("Leave request cancelled");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <CalendarOff className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">Leave Requests</h3>
              <p className="text-xs text-muted-foreground">Filter requests by approval status and leave type</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={initial.status || "all"} onValueChange={(v) => setParam("status", !v || v === "all" ? undefined : v)}>
              <SelectTrigger className="h-9 w-40 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {LEAVE_REQUEST_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <Select value={initial.leaveType || "all"} onValueChange={(v) => setParam("leaveType", !v || v === "all" ? undefined : v)}>
              <SelectTrigger className="h-9 w-44 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {leaveTypes.map((t) => (
                  <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <GlassCard interactive={false}>
        <CardContent className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Filed</TableHead>
                {canDecide && <TableHead className="w-40" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">No leave requests match these filters.</TableCell>
                </TableRow>
              )}
              {items.map((r) => (
                <Fragment key={r._id}>
                  <TableRow>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setExpanded((prev) => {
                          const n = new Set(prev);
                          if (n.has(r._id)) n.delete(r._id);
                          else n.add(r._id);
                          return n;
                        })}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Expand"
                      >
                        <ChevronRight className={`size-4 transition-transform ${expanded.has(r._id) ? "rotate-90" : ""}`} />
                      </button>
                    </TableCell>
                    <TableCell>
                      <Link href={`/talentos/employees/${r.employeeId}`} className="font-medium hover:underline">{r.employeeName}</Link>
                      <div className="font-mono text-xs text-muted-foreground">{r.employeeCode}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.leaveTypeLabel}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(r.startDate)}{r.startDate !== r.endDate ? ` – ${formatDate(r.endDate)}` : ""}
                    </TableCell>
                    <TableCell>{r.days}</TableCell>
                    <TableCell><LeaveStatusBadge status={r.status} /></TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                    {canDecide && (
                      <TableCell>
                        {r.status === "pending" && (
                          <div className="flex items-center gap-1">
                            <Button type="button" variant="outline" size="icon-sm" disabled={pending} onClick={() => decide(r._id, "approved")} aria-label="Approve">
                              <Check className="size-3.5 text-green-600 dark:text-green-400" />
                            </Button>
                            <AlertDialog open={noteFor === r._id} onOpenChange={(o) => { setNoteFor(o ? r._id : null); if (!o) setNote(""); }}>
                              <AlertDialogTrigger
                                render={
                                  <Button type="button" variant="outline" size="icon-sm" disabled={pending} aria-label="Reject">
                                    <X className="size-3.5 text-destructive" />
                                  </Button>
                                }
                              />
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Reject {r.employeeName}&apos;s leave?</AlertDialogTitle>
                                  <AlertDialogDescription>The reserved balance is released. Add an optional note for the record.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for rejection (optional)" />
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => decide(r._id, "rejected")}>Reject</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                        {(r.status === "approved" || r.status === "pending") && (
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button type="button" variant="ghost" size="icon-sm" disabled={pending} aria-label="Cancel request">
                                  <Ban className="size-3.5" />
                                </Button>
                              }
                            />
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Cancel this leave?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {r.status === "approved"
                                    ? "The used balance is returned and the generated attendance days are removed."
                                    : "The pending balance is released."}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Keep</AlertDialogCancel>
                                <AlertDialogAction onClick={() => cancel(r._id)}>Cancel Leave</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                  {expanded.has(r._id) && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={8} className="text-sm">
                        <div className="grid gap-3 py-1 sm:grid-cols-2">
                          <div>
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason</p>
                            <p className="text-foreground">{r.reason || "—"}</p>
                          </div>
                          <div>
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision</p>
                            <p className="text-foreground">
                              {r.decidedAt ? `${formatDateTime(r.decidedAt)}${r.decisionNote ? ` — ${r.decisionNote}` : ""}` : "Awaiting decision"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {totalPages} · {total} total</span>
          <div className="flex gap-2">
            <Link href={pageHref(Math.max(page - 1, 1))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined}>
              <ChevronLeft className="size-3.5" data-icon="inline-start" />
              Previous
            </Link>
            <Link href={pageHref(Math.min(page + 1, totalPages))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-disabled={page >= totalPages} tabIndex={page >= totalPages ? -1 : undefined}>
              Next
              <ChevronRight className="size-3.5" data-icon="inline-end" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
