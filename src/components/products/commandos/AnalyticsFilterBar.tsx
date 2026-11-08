"use client";

import React, { useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Filter, Calendar, RotateCcw, Sparkles, Layers, Search } from "lucide-react";

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterField {
  key: string;
  label: string;
  type?: "select" | "date" | "text";
  options?: FilterOption[];
  placeholder?: string;
}

export interface AnalyticsFilterBarProps {
  fields?: FilterField[];
  showDateRange?: boolean;
  showGranularity?: boolean;
  title?: string;
  /** Namespaces this bar's URL params (`<prefix>_dateFrom`…) so several bars can live on one page, e.g. one per product on the dashboard. */
  prefix?: string;
}

const GRANULARITY_OPTIONS = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Year", value: "year" },
];

export function AnalyticsFilterBar({
  fields = [],
  showDateRange = true,
  showGranularity = true,
  title = "Analytics Filters",
  prefix,
}: AnalyticsFilterBarProps) {
  const K = (key: string) => (prefix ? `${prefix}_${key}` : key);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const currentDateFrom = searchParams.get(K("dateFrom")) ?? "";
  const currentDateTo = searchParams.get(K("dateTo")) ?? "";
  const currentGranularity = searchParams.get(K("granularity")) ?? "month";

  // Calculate active filters count
  let activeCount = 0;
  if (currentDateFrom) activeCount++;
  if (currentDateTo) activeCount++;
  if (searchParams.get(K("granularity")) && searchParams.get(K("granularity")) !== "month") activeCount++;

  fields.forEach((f) => {
    if (searchParams.get(K(f.key))) activeCount++;
  });

  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value.trim() !== "" && value !== "all") {
      params.set(K(key), value);
    } else {
      params.delete(K(key));
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const updateMultipleParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v && v.trim() !== "" && v !== "all") {
        params.set(K(k), v);
      } else {
        params.delete(K(k));
      }
    });
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const clearAllFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (prefix) {
      ["dateFrom", "dateTo", "granularity", ...fields.map((f) => f.key)].forEach((key) => params.delete(K(key)));
    } else {
      params.forEach((_, key) => params.delete(key));
    }
    startTransition(() => {
      router.replace(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
    });
  };

  // Quick Preset Handlers
  const handleQuickPreset = (preset: "today" | "7d" | "30d" | "month" | "year" | "all") => {
    const now = new Date();
    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    if (preset === "all") {
      updateMultipleParams({ dateFrom: null, dateTo: null });
      return;
    }

    let from: Date;
    let to = now;

    if (preset === "today") {
      from = now;
    } else if (preset === "7d") {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (preset === "30d") {
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (preset === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === "year") {
      from = new Date(now.getFullYear(), 0, 1);
    } else {
      from = now;
    }

    updateMultipleParams({
      dateFrom: formatDate(from),
      dateTo: formatDate(to),
    });
  };

  return (
    <div
      className={`mb-6 rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md transition-all ${
        isPending ? "opacity-75 pointer-events-none" : ""
      }`}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Filter className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-foreground">{title}</h3>
              {activeCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/20">
                  <Sparkles className="size-3" />
                  {activeCount} {activeCount === 1 ? "filter active" : "filters active"}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Refine analytical date horizons and parameters in real time</p>
          </div>
        </div>

        {/* Quick Date Presets & Reset */}
        <div className="flex flex-wrap items-center gap-2">
          {showDateRange && (
            <div className="flex items-center gap-1 rounded-xl border border-border/40 bg-muted/30 p-1 text-xs">
              <button
                onClick={() => handleQuickPreset("7d")}
                className="rounded-lg px-2.5 py-1 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors font-medium"
              >
                7 Days
              </button>
              <button
                onClick={() => handleQuickPreset("30d")}
                className="rounded-lg px-2.5 py-1 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors font-medium"
              >
                30 Days
              </button>
              <button
                onClick={() => handleQuickPreset("month")}
                className="rounded-lg px-2.5 py-1 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors font-medium"
              >
                This Month
              </button>
              <button
                onClick={() => handleQuickPreset("year")}
                className="rounded-lg px-2.5 py-1 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors font-medium"
              >
                YTD
              </button>
              <button
                onClick={() => handleQuickPreset("all")}
                className="rounded-lg px-2.5 py-1 text-muted-foreground/70 hover:bg-primary/10 hover:text-primary transition-colors font-medium"
              >
                All Time
              </button>
            </div>
          )}

          {activeCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-all"
            >
              <RotateCcw className="size-3.5" />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Control Inputs Grid */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 items-end">
        {/* Date From */}
        {showDateRange && (
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar className="size-3.5 text-primary" />
              From Date
            </label>
            <input
              type="date"
              value={currentDateFrom}
              onChange={(e) => updateParam("dateFrom", e.target.value)}
              className="w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>
        )}

        {/* Date To */}
        {showDateRange && (
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar className="size-3.5 text-primary" />
              To Date
            </label>
            <input
              type="date"
              value={currentDateTo}
              onChange={(e) => updateParam("dateTo", e.target.value)}
              className="w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>
        )}

        {/* Granularity Selector */}
        {showGranularity && (
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Layers className="size-3.5 text-primary" />
              Granularity
            </label>
            <select
              value={currentGranularity}
              onChange={(e) => updateParam("granularity", e.target.value)}
              className="w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors cursor-pointer"
            >
              {GRANULARITY_OPTIONS.map((g) => (
                <option key={g.value} value={g.value} className="bg-card text-foreground">
                  {g.label} Buckets
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Dynamic Fields */}
        {fields.map((field) => {
          const val = searchParams.get(K(field.key)) ?? "";
          if (field.type === "text") {
            return (
              <div key={field.key}>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Search className="size-3.5 text-primary" />
                  {field.label}
                </label>
                <input
                  type="text"
                  placeholder={field.placeholder ?? `Filter ${field.label}...`}
                  value={val}
                  onChange={(e) => updateParam(field.key, e.target.value)}
                  className="w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                />
              </div>
            );
          }

          return (
            <div key={field.key}>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Filter className="size-3.5 text-primary" />
                {field.label}
              </label>
              <select
                value={val || "all"}
                onChange={(e) => updateParam(field.key, e.target.value)}
                className="w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors cursor-pointer"
              >
                <option value="all" className="bg-card text-muted-foreground">
                  All {field.label}s
                </option>
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-card text-foreground">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
