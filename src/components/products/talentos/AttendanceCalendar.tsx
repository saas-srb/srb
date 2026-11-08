"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getAttendanceStatusMeta } from "@/lib/products/talentos/attendance-status";
import { formatMinutesAsDuration, WEEKDAY_LABELS } from "@/lib/products/talentos/time";

export interface CalCell {
  date: string;
  dayClass: "working" | "weekly_off" | "holiday";
  status: string | null;
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number;
  isLate: boolean;
  lateByMinutes: number;
}

export interface CalSummary {
  present: number;
  halfDay: number;
  absent: number;
  onLeave: number;
  lateCount: number;
  workingDays: number;
  avgWorkedMinutes: number;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

const CELL_TINT: Record<string, string> = {
  present: "bg-green-500/10 border-green-500/30",
  half_day: "bg-amber-500/10 border-amber-500/30",
  absent: "bg-destructive/10 border-destructive/30",
  on_leave: "bg-primary/10 border-primary/30",
};

export default function AttendanceCalendar({
  month,
  cells,
  summary,
  paramKey = "month",
  readOnly = false,
}: {
  month: string;
  cells: CalCell[];
  summary: CalSummary;
  paramKey?: string;
  /** Hide the month navigation — for embedding a fixed month (e.g. the dashboard). */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setMonth(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramKey, next);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const firstDow = cells.length > 0 ? new Date(`${cells[0].date}T12:00:00Z`).getUTCDay() : 0;
  const pad = Array.from({ length: firstDow });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {readOnly ? (
          <span className="text-sm font-medium">{monthLabel(month)}</span>
        ) : (
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon-sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-40 text-center text-sm font-medium">{monthLabel(month)}</span>
            <Button type="button" variant="outline" size="icon-sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="text-green-600 dark:text-green-400">Present {summary.present}</span>
          <span className="text-amber-600 dark:text-amber-400">Half {summary.halfDay}</span>
          <span className="text-destructive">Absent {summary.absent}</span>
          <span className="text-primary">Leave {summary.onLeave}</span>
          <span>Late {summary.lateCount}</span>
          <span>Avg {formatMinutesAsDuration(summary.avgWorkedMinutes)}</span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="pb-1 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
        {pad.map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {cells.map((c) => {
          const meta = c.status ? getAttendanceStatusMeta(c.status) : null;
          const off = c.dayClass !== "working" && !c.status;
          return (
            <div
              key={c.date}
              className={cn(
                "min-h-16 rounded-lg border p-1.5 text-xs",
                c.status && CELL_TINT[c.status] ? CELL_TINT[c.status] : "border-border/60",
                off && "bg-muted/40 text-muted-foreground"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{Number(c.date.slice(-2))}</span>
                {c.isLate && <span className="text-[10px] text-amber-600 dark:text-amber-400">+{c.lateByMinutes}m</span>}
              </div>
              {meta && <div className="mt-0.5 truncate text-[11px]">{meta.label}</div>}
              {!meta && c.dayClass === "holiday" && <div className="mt-0.5 text-[11px]">Holiday</div>}
              {!meta && c.dayClass === "weekly_off" && <div className="mt-0.5 text-[11px]">Off</div>}
              {c.checkIn && (
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {c.checkIn}{c.checkOut ? `–${c.checkOut}` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
