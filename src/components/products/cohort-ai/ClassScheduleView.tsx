"use client";

import PanelTabs from "@/components/platform/panel/PanelTabs";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays, List, Video, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getClassStatusMeta } from "@/lib/products/cohort-ai/constants";

export interface CalendarClass {
  _id: string;
  topic: string;
  batchName: string;
  batchCode: string;
  programName: string;
  mentorName: string | null;
  date: string; // yyyy-mm-dd
  startTime: string | null;
  durationMinutes: number;
  meetingLink: string | null;
  status: string;
}

function ClassRow({ c, showDate = true, linked = true }: { c: CalendarClass; showDate?: boolean; linked?: boolean }) {
  const meta = getClassStatusMeta(c.status);
  const Wrapper = linked ? Link : "div";
  const wrapperProps = linked ? { href: `/cohort-ai/classes/${c._id}` } : {};
  return (
    <Wrapper
      {...(wrapperProps as { href: string })}
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3 text-sm",
        linked && "transition-colors hover:bg-muted/50"
      )}
    >
      <div className="min-w-0">
        <span className="font-medium">{c.topic}</span>
        <p className="text-xs text-muted-foreground">
          {c.batchName} · {c.programName}
          {c.mentorName ? ` · ${c.mentorName}` : ""}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {showDate && <span>{new Date(c.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>}
          {c.startTime && (
            <>
              {showDate && <span>·</span>}
              <Clock className="size-3" />
              {c.startTime} ({c.durationMinutes}m)
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", meta.badgeClass)}>{meta.label}</span>
        {c.meetingLink && (
          <a href={c.meetingLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Join meeting">
            <Video className="size-3.5 text-primary" />
          </a>
        )}
      </div>
    </Wrapper>
  );
}

export default function ClassScheduleView({ classes, linked = true }: { classes: CalendarClass[]; linked?: boolean }) {
  const now = new Date();
  const [view, setView] = useState<"calendar" | "agenda">("calendar");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarClass[]>();
    for (const c of classes) {
      const arr = map.get(c.date) ?? [];
      arr.push(c);
      map.set(c.date, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    return map;
  }, [classes]);

  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7;
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

  const upcoming = classes
    .filter((c) => c.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  const past = classes
    .filter((c) => c.date < todayStr)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PanelTabs label="Schedule view" active={view} onSelect={(k) => setView(k as typeof view)} tabs={[{ key: "calendar", label: "Calendar", icon: <CalendarDays className="size-3.5" /> }, { key: "agenda", label: "Agenda", icon: <List className="size-3.5" /> }]} />
        {view === "calendar" && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
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
        )}
      </div>

      {view === "calendar" ? (
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 text-sm">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="bg-muted/50 px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">{d}</div>
          ))}
          {cells.map((date, i) => {
            const dayClasses = date ? byDate.get(date) ?? [] : [];
            return (
              <div key={i} className={cn("min-h-24 bg-background p-1.5", !date && "bg-muted/20")}>
                {date && (
                  <>
                    <span className={cn("text-xs font-medium", date === todayStr ? "text-primary" : "text-muted-foreground")}>
                      {Number(date.slice(-2))}
                    </span>
                    <div className="mt-1 space-y-1">
                      {dayClasses.slice(0, 3).map((c) => {
                        const pillClass = cn(
                          "block truncate rounded px-1.5 py-0.5 text-[11px] font-medium",
                          c.status === "cancelled"
                            ? "bg-destructive/10 text-destructive line-through"
                            : "bg-primary/10 text-primary",
                          linked && c.status !== "cancelled" && "hover:bg-primary/20"
                        );
                        const label = `${c.startTime ? `${c.startTime} ` : ""}${c.topic}`;
                        const title = `${c.startTime ?? ""} ${c.topic} · ${c.batchName}`;
                        return linked ? (
                          <Link key={c._id} href={`/cohort-ai/classes/${c._id}`} className={pillClass} title={title}>
                            {label}
                          </Link>
                        ) : (
                          <span key={c._id} className={pillClass} title={title}>
                            {label}
                          </span>
                        );
                      })}
                      {dayClasses.length > 3 && <span className="text-[11px] text-muted-foreground">+{dayClasses.length - 3} more</span>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Upcoming ({upcoming.length})</h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming classes.</p>
            ) : (
              upcoming.map((c) => <ClassRow key={c._id} c={c} linked={linked} />)
            )}
          </div>
          {past.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Past ({past.length})</h3>
              {past.slice(0, 30).map((c) => <ClassRow key={c._id} c={c} linked={linked} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
