"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarRange, MessageSquare, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { DATE_RANGE_PRESETS } from "@/lib/date-ranges";
import { formatDate } from "@/lib/utils";

export default function MessengerDashboardFilters({
  range,
  dateFrom,
  dateTo,
  hasActiveFilters,
}: {
  range: string;
  dateFrom: string;
  dateTo: string;
  hasActiveFilters: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);
  const [pendingFrom, setPendingFrom] = useState(dateFrom);
  const [pendingTo, setPendingTo] = useState(dateTo);

  function updateParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  function openCustom() {
    setPendingFrom(dateFrom);
    setPendingTo(dateTo);
    setCustomOpen(true);
  }

  function applyCustom() {
    updateParams({ range: "custom", dateFrom: pendingFrom || undefined, dateTo: pendingTo || undefined });
    setCustomOpen(false);
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <MessageSquare className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">Search &amp; Filters</h3>
            <p className="text-xs text-muted-foreground">Filter messenger analytics by date range</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-border/40 bg-muted/30 p-1 text-xs">
            <button
              type="button"
              onClick={() => updateParams({ range: "today", dateFrom: undefined, dateTo: undefined })}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${(range || "last30") === "today" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => updateParams({ range: "last7", dateFrom: undefined, dateTo: undefined })}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${(range || "last30") === "last7" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => updateParams({ range: "last30", dateFrom: undefined, dateTo: undefined })}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${(range || "last30") === "last30" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
            >
              Last 30 Days
            </button>
            <button
              type="button"
              onClick={() => updateParams({ range: "thisMonth", dateFrom: undefined, dateTo: undefined })}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${(range || "last30") === "thisMonth" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => updateParams({ range: "thisYear", dateFrom: undefined, dateTo: undefined })}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${(range || "last30") === "thisYear" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
            >
              This Year
            </button>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => router.replace(pathname)}
              className="flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-all"
            >
              <RotateCcw className="size-3.5" />
              Reset Filters
            </button>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Date Range</label>
            <Select
              value={range || "last30"}
              onValueChange={(v) => {
                if (v === "custom") {
                  updateParams({ range: "custom" });
                  openCustom();
                } else {
                  setCustomOpen(false);
                  updateParams({ range: v ?? undefined, dateFrom: undefined, dateTo: undefined });
                }
              }}
            >
              <SelectTrigger className="h-9 w-44 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {range === "custom" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Custom Dates</label>
              <Popover open={customOpen} onOpenChange={(open) => (open ? openCustom() : setCustomOpen(false))}>
                <PopoverTrigger
                  render={
                    <Button type="button" variant="outline" size="sm" className="h-8">
                      <CalendarRange className="size-3.5" data-icon="inline-start" />
                      {formatDate(dateFrom)} – {formatDate(dateTo)}
                    </Button>
                  }
                />
                <PopoverContent align="start" className="w-auto">
                  <div className="flex items-end gap-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">From</label>
                      <Input type="date" value={pendingFrom} max={pendingTo || undefined} onChange={(e) => setPendingFrom(e.target.value)} className="h-9 w-auto rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">To</label>
                      <Input type="date" value={pendingTo} min={pendingFrom || undefined} onChange={(e) => setPendingTo(e.target.value)} className="h-9 w-auto rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
                    </div>
                  </div>
                  <Button type="button" size="sm" onClick={applyCustom} disabled={!pendingFrom || !pendingTo}>
                    Apply
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          )}
      </div>
    </div>
  );
}
