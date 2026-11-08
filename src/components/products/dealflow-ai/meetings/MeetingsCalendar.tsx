"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bot, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import type { MeetingView } from "@/lib/dealflow-ai/meetings/types";
import { formatTime, formatWhen, localDayKey, monthGrid, STATUS_STYLE, weekDays } from "@/lib/dealflow-ai/meetings/ui";
import { cn } from "@/lib/utils";

/** Week / month calendar of the (already filtered) meetings. */
export default function MeetingsCalendar({ view, meetings }: { view: "week" | "month"; meetings: MeetingView[] }) {
  const [anchor, setAnchor] = useState(() => new Date());
  const byDay = useMemo(() => {
    const map = new Map<string, MeetingView[]>();
    for (const m of meetings) {
      const k = localDayKey(new Date(m.scheduledAt));
      map.set(k, [...(map.get(k) ?? []), m].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
    }
    return map;
  }, [meetings]);
  const cells = view === "month" ? monthGrid(anchor.getFullYear(), anchor.getMonth()) : weekDays(anchor).map((date) => ({ date, inMonth: true }));
  const title = view === "month" ? anchor.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : `${cells[0].date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${cells[6].date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
  const step = (dir: number) => setAnchor(view === "month" ? new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1) : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + dir * 7));
  const today = localDayKey(new Date());
  return (
    <GlassCard>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h3 className="text-sm font-bold">{title}</h3>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
            <Button variant="ghost" size="icon" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft className="size-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => step(1)} aria-label="Next"><ChevronRight className="size-4" /></Button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-border/60 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-1.5">{d}</div>)}</div>
        <div className="grid grid-cols-7">
          {cells.map(({ date, inMonth }) => {
            const k = localDayKey(date);
            const list = byDay.get(k) ?? [];
            return (
              <div key={k} className={cn("min-h-24 border-b border-r border-border/40 p-1.5 last:border-r-0", view === "week" && "min-h-64", !inMonth && "bg-muted/30")}>
                <div className={cn("mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs", k === today ? "bg-primary font-semibold text-primary-foreground" : inMonth ? "text-foreground" : "text-muted-foreground")}>{date.getDate()}</div>
                <div className="space-y-1">
                  {list.slice(0, view === "month" ? 3 : 20).map((m) => (
                    <Link key={m.roomId} href={`/dealflow-ai/meetings/${m.roomId}/details`} title={`${m.title} · ${formatWhen(m.scheduledAt, m.timezone)}`} className={cn("block truncate rounded-md px-1.5 py-1 text-[11px] leading-tight ring-1", STATUS_STYLE[m.status].className)}>
                      <span className="font-semibold">{formatTime(m.scheduledAt, m.timezone)}</span> {m.title}{m.participants.some((p) => p.kind === "agent") ? <Bot className="ml-1 inline size-3" /> : null}
                    </Link>
                  ))}
                  {view === "month" && list.length > 3 ? <p className="px-1 text-[11px] text-muted-foreground">+{list.length - 3} more</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </GlassCard>
  );
}
