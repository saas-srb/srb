"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DeadlineItem } from "@/lib/products/sprintos/timeline";

const KIND_COLOR: Record<string, string> = {
  task: "bg-primary",
  milestone: "bg-amber-500",
  project: "bg-blue-500",
};

export default function CalendarView({ items }: { items: DeadlineItem[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const byDate = useMemo(() => {
    const map = new Map<string, DeadlineItem[]>();
    for (const it of items) {
      const arr = map.get(it.date) ?? [];
      arr.push(it);
      map.set(it.date, arr);
    }
    return map;
  }, [items]);

  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = now.toISOString().slice(0, 10);

  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  function shift(delta: number) {
    const m = month + delta;
    setYear(year + Math.floor(m / 12));
    setMonth(((m % 12) + 12) % 12);
  }

  const monthItems = items
    .filter((it) => it.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`))
    .sort((a, b) => a.date.localeCompare(b.date));

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
          const dayItems = date ? byDate.get(date) ?? [] : [];
          return (
            <div key={i} className={cn("min-h-24 bg-background p-1.5", !date && "bg-muted/20")}>
              {date && (
                <>
                  <span className={cn("text-xs font-medium", date === todayStr ? "text-primary" : "text-muted-foreground")}>
                    {Number(date.slice(-2))}
                  </span>
                  <div className="mt-1 space-y-1">
                    {dayItems.slice(0, 3).map((it) => (
                      <Link
                        key={`${it.kind}-${it.id}`}
                        href={it.href}
                        className={cn(
                          "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] hover:opacity-80",
                          it.overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"
                        )}
                      >
                        <span className={cn("size-1.5 shrink-0 rounded-full", KIND_COLOR[it.kind])} />
                        <span className="truncate">{it.title}</span>
                      </Link>
                    ))}
                    {dayItems.length > 3 && <p className="px-1 text-[10px] text-muted-foreground">+{dayItems.length - 3} more</p>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold text-foreground">This month</h3>
        {monthItems.length === 0 && <p className="text-sm text-muted-foreground">Nothing scheduled this month.</p>}
        {monthItems.map((it) => (
          <Link
            key={`list-${it.kind}-${it.id}`}
            href={it.href}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-2.5 text-sm transition-colors hover:bg-muted/50"
          >
            <span className="min-w-0 truncate">
              <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{it.kind}</span>
              {it.title}
              <span className="ml-1.5 text-muted-foreground">· {it.projectName}</span>
            </span>
            <span className={cn("shrink-0 text-xs", it.overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
              {new Date(`${it.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
