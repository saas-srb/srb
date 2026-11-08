"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Pencil, CalendarDays } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { getAttendanceStatusMeta, MANUAL_ATTENDANCE_STATUSES } from "@/lib/products/talentos/attendance-status";
import { formatMinutesAsDuration } from "@/lib/products/talentos/time";
import { formatDate } from "@/lib/utils";
import { recordAttendanceAction, bulkMarkAttendanceAction } from "@/app/(products)/talentos/(protected)/(staff)/attendance/actions";

interface Row {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentId: string | null;
  effectiveStatus: string;
  record: {
    status: string;
    checkIn: string | null;
    checkOut: string | null;
    breakMinutes: number;
    workedMinutes: number;
    isLate: boolean;
    lateByMinutes: number;
    isEarlyDeparture: boolean;
    earlyByMinutes: number;
    source: string;
    note: string | null;
  } | null;
}

const STATUS_LABEL: Record<string, string> = { present: "Present", half_day: "Half Day", absent: "Absent" };

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function AttendanceRegister({
  date,
  dayClass,
  rows,
  departments,
  canEdit,
}: {
  date: string;
  dayClass: "working" | "weekly_off" | "holiday";
  rows: Row[];
  departments: { _id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Row | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ status: "present", checkIn: "", checkOut: "", breakMinutes: "0", note: "" });

  function setParam(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function openEdit(row: Row) {
    setEditing(row);
    setErrors({});
    setForm({
      status: row.record && MANUAL_ATTENDANCE_STATUSES.includes(row.record.status as never) ? row.record.status : "present",
      checkIn: row.record?.checkIn ?? "",
      checkOut: row.record?.checkOut ?? "",
      breakMinutes: String(row.record?.breakMinutes ?? 0),
      note: row.record?.note ?? "",
    });
  }

  function submitEdit() {
    if (!editing) return;
    setErrors({});
    startTransition(async () => {
      const result = await recordAttendanceAction(editing.employeeId, date, {
        status: form.status,
        checkIn: form.checkIn || null,
        checkOut: form.checkOut || null,
        breakMinutes: form.breakMinutes,
        note: form.note,
      });
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Attendance saved");
      setEditing(null);
      router.refresh();
    });
  }

  function bulkMark(status: string) {
    const ids = Array.from(selected);
    startTransition(async () => {
      const result = await bulkMarkAttendanceAction(date, ids, status);
      if (!result.ok) {
        toast.error(result.error ?? "Could not mark attendance.");
        return;
      }
      toast.success(`Marked ${result.marked} employee${result.marked === 1 ? "" : "s"} ${STATUS_LABEL[status] ?? status}`);
      setSelected(new Set());
      router.refresh();
    });
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.employeeId));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <CalendarDays className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">Daily Attendance</h3>
              <p className="text-xs text-muted-foreground">Pick a date and department to review check-ins for that day</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="icon-sm" onClick={() => setParam("date", addDays(date, -1))} aria-label="Previous day">
                <ChevronLeft className="size-4" />
              </Button>
              <Input type="date" value={date} onChange={(e) => setParam("date", e.target.value || undefined)} className="h-9 w-auto rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
              <Button type="button" variant="outline" size="icon-sm" onClick={() => setParam("date", addDays(date, 1))} aria-label="Next day">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Department</label>
            <Select
              value={searchParams.get("department") || "all"}
              onValueChange={(v) => setParam("department", !v || v === "all" ? undefined : v)}
            >
              <SelectTrigger className="h-9 w-48 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-4" />
            {formatDate(date)} —{" "}
            {dayClass === "holiday" ? "Holiday" : dayClass === "weekly_off" ? "Weekly off" : "Working day"}
          </div>
        </div>
      </div>

      {canEdit && selected.size > 0 && (
        <GlassCard interactive={false}>
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            {MANUAL_ATTENDANCE_STATUSES.map((s) => (
              <Button key={s} type="button" variant="outline" size="sm" disabled={pending} onClick={() => bulkMark(s)}>
                Mark {STATUS_LABEL[s]}
              </Button>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          </CardContent>
        </GlassCard>
      )}

      <GlassCard interactive={false}>
        <CardContent className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {canEdit && (
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.employeeId)))}
                      aria-label="Select all"
                    />
                  </TableHead>
                )}
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Worked</TableHead>
                <TableHead>Flags</TableHead>
                {canEdit && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">No active employees in scope.</TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const meta = getAttendanceStatusMeta(r.effectiveStatus);
                const isLeave = r.record?.source === "leave";
                return (
                  <TableRow key={r.employeeId}>
                    {canEdit && (
                      <TableCell>
                        <Checkbox
                          checked={selected.has(r.employeeId)}
                          onCheckedChange={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(r.employeeId)) next.delete(r.employeeId);
                              else next.add(r.employeeId);
                              return next;
                            })
                          }
                          aria-label={`Select ${r.employeeName}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="font-medium">{r.employeeName}</div>
                      <div className="font-mono text-xs text-muted-foreground">{r.employeeCode}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={meta.badgeClass}>
                        <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.record?.checkIn ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.record?.checkOut ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.record && r.record.workedMinutes > 0 ? formatMinutesAsDuration(r.record.workedMinutes) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.record?.isLate && (
                          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">Late {r.record.lateByMinutes}m</Badge>
                        )}
                        {r.record?.isEarlyDeparture && (
                          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">Early {r.record.earlyByMinutes}m</Badge>
                        )}
                        {isLeave && <Badge className="bg-primary/10 text-primary">Leave</Badge>}
                      </div>
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(r)}
                          disabled={isLeave}
                          aria-label={`Edit ${r.employeeName}`}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>{editing?.employeeName}</SheetTitle>
            <SheetDescription>Attendance for {formatDate(date)}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => v && setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MANUAL_ATTENDANCE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.status && <p className="text-xs text-destructive">{errors.status}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Check-in</Label>
                <Input type="time" value={form.checkIn} onChange={(e) => setForm((f) => ({ ...f, checkIn: e.target.value }))} aria-invalid={!!errors.checkIn || undefined} />
                {errors.checkIn && <p className="text-xs text-destructive">{errors.checkIn}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Check-out</Label>
                <Input type="time" value={form.checkOut} onChange={(e) => setForm((f) => ({ ...f, checkOut: e.target.value }))} aria-invalid={!!errors.checkOut || undefined} />
                {errors.checkOut && <p className="text-xs text-destructive">{errors.checkOut}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Break (minutes)</Label>
              <Input inputMode="numeric" value={form.breakMinutes} onChange={(e) => setForm((f) => ({ ...f, breakMinutes: e.target.value }))} aria-invalid={!!errors.breakMinutes || undefined} />
              {errors.breakMinutes && <p className="text-xs text-destructive">{errors.breakMinutes}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Optional correction note" />
            </div>
            <Button type="button" onClick={submitEdit} disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Save Attendance"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
