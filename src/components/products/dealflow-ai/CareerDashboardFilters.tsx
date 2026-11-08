"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, CalendarRange, Briefcase, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import { CAREER_APPLICATION_STATUSES } from "@/lib/career-application-status";
import { DATE_RANGE_PRESETS } from "@/lib/date-ranges";
import { formatDate } from "@/lib/utils";

export default function CareerDashboardFilters({
  status,
  position,
  positions,
  experience,
  experienceOptions,
  location,
  locationOptions,
  search,
  range,
  dateFrom,
  dateTo,
  hasActiveFilters,
}: {
  status: string;
  position: string;
  positions: { slug: string; title: string }[];
  experience: string;
  experienceOptions: string[];
  location: string;
  locationOptions: string[];
  search: string;
  range: string;
  dateFrom: string;
  dateTo: string;
  hasActiveFilters: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(search);
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

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) updateParams({ search: searchInput || undefined });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function openCustomPicker() {
    setPendingFrom(dateFrom);
    setPendingTo(dateTo);
    setCustomOpen(true);
  }

  function applyCustomRange() {
    updateParams({ range: "custom", dateFrom: pendingFrom || undefined, dateTo: pendingTo || undefined });
    setCustomOpen(false);
  }

  function handlePreset(preset: string) {
    setCustomOpen(false);
    updateParams({ range: preset, dateFrom: undefined, dateTo: undefined });
  }

  const activeRange = range || "last30";

  return (
    <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Briefcase className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">Search &amp; Filters</h3>
            <p className="text-xs text-muted-foreground">Search and filter career applications</p>
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
              onClick={() => { setSearchInput(""); router.replace(pathname); }}
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
          <label className="text-xs font-medium text-muted-foreground">Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Name, email, or phone"
              className="h-9 w-48 pl-8 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <Select value={status || "all"} onValueChange={(v) => updateParams({ status: !v || v === "all" ? undefined : v })}>
            <SelectTrigger className="w-44 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {CAREER_APPLICATION_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Position</label>
          <Select value={position || "all"} onValueChange={(v) => updateParams({ position: !v || v === "all" ? undefined : v })}>
            <SelectTrigger className="w-48 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All positions</SelectItem>
              {positions.map((p) => (
                <SelectItem key={p.slug} value={p.slug}>{p.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Experience</label>
          <Select value={experience || "all"} onValueChange={(v) => updateParams({ experience: !v || v === "all" ? undefined : v })}>
            <SelectTrigger className="w-36 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any experience</SelectItem>
              {experienceOptions.map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Location</label>
          <Select value={location || "all"} onValueChange={(v) => updateParams({ location: !v || v === "all" ? undefined : v })}>
            <SelectTrigger className="w-40 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any location</SelectItem>
              {locationOptions.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Date Range</label>
          <Select
            value={range || "last30"}
            onValueChange={(v) => {
              if (v === "custom") {
                updateParams({ range: "custom" });
                openCustomPicker();
              } else {
                setCustomOpen(false);
                updateParams({ range: v ?? undefined, dateFrom: undefined, dateTo: undefined });
              }
            }}
          >
            <SelectTrigger className="w-40 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {range === "custom" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Custom Dates</label>
            <Popover open={customOpen} onOpenChange={(open) => (open ? openCustomPicker() : setCustomOpen(false))}>
              <PopoverTrigger
                render={
                  <Button type="button" variant="outline" size="sm" className="h-9">
                    <CalendarRange className="size-3.5" data-icon="inline-start" />
                    {formatDate(dateFrom)} – {formatDate(dateTo)}
                  </Button>
                }
              />
              <PopoverContent align="start" className="w-auto">
                <PopoverHeader>
                  <PopoverTitle>Custom Range</PopoverTitle>
                </PopoverHeader>
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">From</label>
                    <Input
                      type="date"
                      value={pendingFrom}
                      max={pendingTo || undefined}
                      onChange={(e) => setPendingFrom(e.target.value)}
                      className="w-auto rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">To</label>
                    <Input
                      type="date"
                      value={pendingTo}
                      min={pendingFrom || undefined}
                      onChange={(e) => setPendingTo(e.target.value)}
                      className="w-auto rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"
                    />
                  </div>
                </div>
                <Button type="button" size="sm" onClick={applyCustomRange} disabled={!pendingFrom || !pendingTo}>
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
