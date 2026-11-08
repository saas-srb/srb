"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getBatchStatusMeta } from "@/lib/products/cohort-ai/constants";

export interface CalendarBatch {
  _id: string;
  batchCode: string;
  name: string;
  programName: string;
  startDate: string; // yyyy-mm-dd
  endDate: string | null;
  status: string;
  enrolled: number;
  capacity: number;
}

export default function BatchCalendar({ batches }: { batches: CalendarBatch[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const byStart = useMemo(() => {
    const map = new Map<string, CalendarBatch[]>();
    for (const b of batches) {
      const arr = map.get(b.startDate) ?? [];
      arr.push(b);
      map.set(b.startDate, arr);
    }
    return map;
  }, [batches]);

  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = now.toISOString().slice(0, 10);
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;

  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${monthPrefix}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);

  function shift(delta: number) {
    const m = month + delta;
    setYear(year + Math.floor(m / 12));
    setMonth(((m % 12) + 12) % 12);
  }

  const monthBatches = batches
    .filter((b) => b.startDate.startsWith(monthPrefix))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          {first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </h2>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="icon-sm" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}>
            Today
          </Button>
          <Button type="button" variant="outline" size="icon-sm" onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 text-sm">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-muted/50 px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
        {cells.map((date, i) => {
          const dayBatches = date ? byStart.get(date) ?? [] : [];
          return (
            <div key={i} className={cn("min-h-24 bg-background p-1.5", !date && "bg-muted/20")}>
              {date && (
                <>
                  <span className={cn("text-xs font-medium", date === todayStr ? "text-primary" : "text-muted-foreground")}>
                    {Number(date.slice(-2))}
                  </span>
                  <div className="mt-1 space-y-1">
                    {dayBatches.slice(0, 3).map((b) => (
                      <Link
                        key={b._id}
                        href={`/cohort-ai/batches/${b._id}`}
                        className="block truncate rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
                        title={`${b.name} · ${b.programName}`}
                      >
                        {b.name}
                      </Link>
                    ))}
                    {dayBatches.length > 3 && (
                      <span className="text-[11px] text-muted-foreground">+{dayBatches.length - 3} more</span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Starting this month</h3>
        {monthBatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No batches start in {first.toLocaleDateString("en-US", { month: "long" })}.</p>
        ) : (
          monthBatches.map((b) => {
            const meta = getBatchStatusMeta(b.status);
            return (
              <Link
                key={b._id}
                href={`/cohort-ai/batches/${b._id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3 text-sm transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <span className="font-medium">{b.name}</span>
                  <p className="text-xs text-muted-foreground">
                    {b.programName} · starts {new Date(b.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tabular-nums text-xs text-muted-foreground">{b.enrolled}/{b.capacity}</span>
                  <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", meta.badgeClass)}>{meta.label}</span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
