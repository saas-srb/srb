"use client";

import { usePanelLabel } from "@/components/platform/PanelsProvider";
import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarRange, SlidersHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { DATE_RANGE_PRESETS } from "@/lib/date-ranges";
import { formatDate } from "@/lib/utils";

export default function FmsDashboardFilters({
  range,
  dateFrom,
  dateTo,
  sourceModule = "",
  type = "",
  hasActiveFilters,
}: {
  range: string;
  dateFrom: string;
  dateTo: string;
  sourceModule?: string;
  type?: string;
  hasActiveFilters: boolean;
}) {
  const panelLabel = usePanelLabel();
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

  function handlePreset(preset: string) {
    setCustomOpen(false);
    updateParams({ range: preset, dateFrom: undefined, dateTo: undefined });
  }

  const activeRange = range || "thisYear";

  return (
    <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <SlidersHorizontal className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">Search &amp; Filters</h3>
            <p className="text-xs text-muted-foreground">Slice financial activity by date, source product, and flow type</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-border/40 bg-muted/30 p-1 text-xs">
            <button type="button" onClick={() => handlePreset("today")} className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${activeRange === "today" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}>
              Today
            </button>
            <button type="button" onClick={() => handlePreset("last7")} className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${activeRange === "last7" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}>
              Last 7 Days
            </button>
            <button type="button" onClick={() => handlePreset("last30")} className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${activeRange === "last30" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}>
              Last 30 Days
            </button>
            <button type="button" onClick={() => handlePreset("thisMonth")} className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${activeRange === "thisMonth" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}>
              This Month
            </button>
            <button type="button" onClick={() => handlePreset("thisYear")} className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${activeRange === "thisYear" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}>
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

      {/* Filter controls */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        {/* Date Range Preset */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Date Period</label>
          <Select
            value={range || "thisYear"}
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
            <SelectTrigger className="h-9 w-36 sm:w-40 rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/40">
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value} className="text-xs">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom Date Range Popover */}
        {range === "custom" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Custom Dates</label>
            <Popover open={customOpen} onOpenChange={(open) => (open ? openCustom() : setCustomOpen(false))}>
              <PopoverTrigger
                render={
                  <Button type="button" variant="outline" size="sm" className="h-9 text-xs">
                    <CalendarRange className="size-3.5 mr-1" />
                    {formatDate(dateFrom)} – {formatDate(dateTo)}
                  </Button>
                }
              />
              <PopoverContent align="start" className="w-auto p-3">
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">From</label>
                    <Input
                      type="date"
                      value={pendingFrom}
                      max={pendingTo || undefined}
                      onChange={(e) => setPendingFrom(e.target.value)}
                      className="h-9 w-auto rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/40"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">To</label>
                    <Input
                      type="date"
                      value={pendingTo}
                      min={pendingFrom || undefined}
                      onChange={(e) => setPendingTo(e.target.value)}
                      className="h-9 w-auto rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/40"
                    />
                  </div>
                </div>
                <Button type="button" size="sm" onClick={applyCustom} disabled={!pendingFrom || !pendingTo} className="mt-2.5 w-full h-9 text-xs">
                  Apply Custom Range
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Source Product Filter */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Module Product</label>
          <Select
            value={sourceModule || "all"}
            onValueChange={(v) => updateParams({ sourceModule: !v || v === "all" ? undefined : v })}
          >
            <SelectTrigger className="h-9 w-36 sm:w-40 rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/40">
              <SelectValue placeholder="All Products" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Products</SelectItem>
              <SelectItem value="prms" className="text-xs">{panelLabel("prms", "SpendIQ Procurement")}</SelectItem>
              <SelectItem value="pms" className="text-xs">{panelLabel("pms", "SprintOS Projects")}</SelectItem>
              <SelectItem value="hrms" className="text-xs">{panelLabel("hrms", "TalentOS Payroll")}</SelectItem>
              <SelectItem value="tms" className="text-xs">{panelLabel("tms", "Cohort AI Training")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Transaction Type Filter */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Flow Type</label>
          <Select
            value={type || "all"}
            onValueChange={(v) => updateParams({ type: !v || v === "all" ? undefined : v })}
          >
            <SelectTrigger className="h-9 w-32 sm:w-36 rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/40">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Types</SelectItem>
              <SelectItem value="income" className="text-xs">Money In (Income)</SelectItem>
              <SelectItem value="expense" className="text-xs">Money Out (Expense)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
