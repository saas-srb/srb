"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WEEKDAY_LABELS } from "@/lib/products/talentos/time";

interface Entry {
  requestId: string;
  employeeId: string;
  employeeName: string;
  leaveTypeLabel: string;
  startDate: string;
  endDate: string;
  status: string;
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

export default function LeaveCalendar({ month, entries }: { month: string; entries: Entry[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const firstDow = new Date(`${month}-01T12:00:00Z`).getUTCDay();

  function setMonth(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "calendar");
    params.set("month", next);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function entriesOn(date: string) {
    return entries.filter((e) => e.startDate <= date && e.endDate >= date);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon-sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-40 text-center text-sm font-medium">{monthLabel(month)}</span>
        <Button type="button" variant="outline" size="icon-sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="pb-1 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {cells.map((date) => {
          const list = entriesOn(date);
          return (
            <div key={date} className="min-h-20 rounded-lg border border-border/60 p-1.5 text-xs">
              <span className="font-medium text-foreground">{Number(date.slice(-2))}</span>
              <div className="mt-1 space-y-0.5">
                {list.slice(0, 3).map((e) => (
                  <Link
                    key={e.requestId}
                    href={`/talentos/employees/${e.employeeId}`}
                    className={cn(
                      "block truncate rounded px-1 py-0.5 text-[10px]",
                      e.status === "pending" ? "bg-secondary/60 text-secondary-foreground" : "bg-primary/10 text-primary"
                    )}
                    title={`${e.employeeName} — ${e.leaveTypeLabel}${e.status === "pending" ? " (pending)" : ""}`}
                  >
                    {e.employeeName.split(" ")[0]} · {e.leaveTypeLabel}
                  </Link>
                ))}
                {list.length > 3 && <span className="text-[10px] text-muted-foreground">+{list.length - 3} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
