"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ATTENDANCE_STATUSES } from "@/lib/products/cohort-ai/constants";
import { markAttendanceAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/classes/actions";

export interface RosterRow {
  studentId: string;
  studentCode: string | null;
  fullName: string;
  status: string | null;
}

export default function AttendanceMarker({
  classId,
  roster,
  canEdit,
}: {
  classId: string;
  roster: RosterRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [marks, setMarks] = useState<Record<string, string>>(
    () => Object.fromEntries(roster.filter((r) => r.status).map((r) => [r.studentId, r.status as string]))
  );

  function setAll(status: string) {
    setMarks(Object.fromEntries(roster.map((r) => [r.studentId, status])));
  }

  function save() {
    const entries = Object.entries(marks).map(([studentId, status]) => ({ studentId, status }));
    if (entries.length === 0) {
      toast.error("Mark at least one student.");
      return;
    }
    startTransition(async () => {
      const result = await markAttendanceAction(classId, entries);
      if (!result.ok) {
        toast.error(result.error ?? "Could not save attendance.");
        return;
      }
      toast.success("Attendance saved");
      router.refresh();
    });
  }

  if (roster.length === 0) {
    return (
      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Attendance</CardTitle></CardHeader>
        <CardContent>
          <p className="py-4 text-center text-sm text-muted-foreground">No students enrolled in this batch yet.</p>
        </CardContent>
      </GlassCard>
    );
  }

  return (
    <GlassCard interactive={false}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Attendance ({roster.length})</CardTitle>
        {canEdit && (
          <div className="flex gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAll("present")}>All present</Button>
            <Button type="button" size="sm" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Check className="size-3.5" data-icon="inline-start" />}
              Save
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-1.5">
        {roster.map((r) => (
          <div key={r.studentId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
            <div className="min-w-0">
              <span className="font-medium">{r.fullName}</span>
              {r.studentCode && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{r.studentCode}</span>}
            </div>
            <div className="flex gap-1">
              {ATTENDANCE_STATUSES.map((s) => {
                const active = marks[r.studentId] === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    disabled={!canEdit || pending}
                    onClick={() => setMarks((m) => ({ ...m, [r.studentId]: s.value }))}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                      active ? s.badgeClass : "bg-muted/60 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </GlassCard>
  );
}
