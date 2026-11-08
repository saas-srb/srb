import Link from "next/link";
import { Flag } from "lucide-react";
import { getTaskStatusMeta, getMilestoneStatusMeta } from "@/lib/products/sprintos/constants";
import { cn, formatDate } from "@/lib/utils";
import type { ProjectTimeline } from "@/lib/products/sprintos/timeline";

const DAY_MS = 86400000;

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / DAY_MS);
}

export default function GanttChart({ timeline }: { timeline: ProjectTimeline }) {
  const { from, to, bars } = timeline;
  if (bars.length === 0) {
    return <p className="text-sm text-muted-foreground">Add start / due dates to tasks and milestones to see the timeline.</p>;
  }

  const totalDays = Math.max(daysBetween(from, to) + 1, 1);
  const pxPerDay = 26;
  const width = totalDays * pxPerDay;
  const today = new Date().toISOString().slice(0, 10);
  const todayOffset = daysBetween(from, today);

  // Month gridlines.
  const months: { label: string; offsetDays: number }[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  cursor.setDate(1);
  while (cursor.toISOString().slice(0, 10) <= to) {
    const off = daysBetween(from, cursor.toISOString().slice(0, 10));
    months.push({ label: cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), offsetDays: off });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <div className="overflow-x-auto">
      <div className="relative" style={{ width: `${width}px`, minWidth: "100%" }}>
        {/* Month header */}
        <div className="relative h-6 border-b border-border/60">
          {months.map((m) => (
            <span
              key={m.label + m.offsetDays}
              className="absolute top-0 text-[11px] font-medium text-muted-foreground"
              style={{ left: `${Math.max(m.offsetDays, 0) * pxPerDay}px` }}
            >
              {m.label}
            </span>
          ))}
        </div>

        {/* Rows */}
        <div className="relative">
          {/* month gridlines */}
          {months.map((m) => (
            <span
              key={`line-${m.offsetDays}`}
              className="absolute top-0 bottom-0 w-px bg-border/50"
              style={{ left: `${Math.max(m.offsetDays, 0) * pxPerDay}px` }}
            />
          ))}
          {/* today marker */}
          {todayOffset >= 0 && todayOffset <= totalDays && (
            <span
              className="absolute top-0 bottom-0 z-10 w-px bg-primary/60"
              style={{ left: `${todayOffset * pxPerDay}px` }}
              title={`Today · ${formatDate(today)}`}
            />
          )}

          {bars.map((b) => {
            const left = Math.max(daysBetween(from, b.start), 0) * pxPerDay;
            const span = Math.max(daysBetween(b.start, b.end) + 1, 1) * pxPerDay;
            if (b.kind === "milestone") {
              const meta = getMilestoneStatusMeta(b.status);
              return (
                <div key={b.id} className="relative h-9">
                  <Link
                    href={b.href}
                    className="absolute top-1.5 flex items-center gap-1 text-xs"
                    style={{ left: `${left}px` }}
                    title={`${b.title} · ${formatDate(b.start)}`}
                  >
                    <Flag className={cn("size-4", meta.dotClass.replace("bg-", "text-"))} />
                    <span className="max-w-40 truncate font-medium text-foreground">{b.title}</span>
                  </Link>
                </div>
              );
            }
            const meta = getTaskStatusMeta(b.status);
            return (
              <div key={b.id} className="relative h-9">
                <Link
                  href={b.href}
                  className={cn(
                    "absolute top-1.5 flex h-6 items-center overflow-hidden rounded-md px-2 text-[11px] font-medium text-foreground transition-opacity hover:opacity-90",
                    meta.badgeClass
                  )}
                  style={{ left: `${left}px`, width: `${Math.max(span, 40)}px` }}
                  title={`${b.title} · ${formatDate(b.start)} → ${formatDate(b.end)}`}
                >
                  <span className="truncate">{b.title}</span>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
