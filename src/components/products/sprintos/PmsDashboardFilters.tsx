"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarRange, Filter, SlidersHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { DATE_RANGE_PRESETS } from "@/lib/date-ranges";
import { PROJECT_STATUSES, PRIORITIES } from "@/lib/products/sprintos/constants";
import { formatDate } from "@/lib/utils";

interface Props {
  range: string;
  dateFrom: string;
  dateTo: string;
  clientId?: string;
  status?: string;
  priority?: string;
  granularity?: string;
  billingModel?: string;
  overdue?: string;
  clients?: { _id: string; companyName: string }[];
  hasActiveFilters: boolean;
}

export default function PmsDashboardFilters({
  range,
  dateFrom,
  dateTo,
  clientId = "",
  status = "",
  priority = "",
  granularity = "month",
  billingModel = "",
  overdue = "",
  clients = [],
  hasActiveFilters,
}: Props) {
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

  // Count active non-date filters
  const activeCount = [clientId, status, priority, billingModel, overdue].filter(Boolean).length;

  return (
    <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <SlidersHorizontal className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-foreground">Search &amp; Filters</h3>
              {activeCount > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {activeCount}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Filter dashboard analytics by client, status, and date range</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-border/40 bg-muted/30 p-1 text-xs">
            <button
              type="button"
              onClick={() => updateParams({ range: "today", dateFrom: undefined, dateTo: undefined })}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${(range || "thisYear") === "today" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => updateParams({ range: "last7", dateFrom: undefined, dateTo: undefined })}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${(range || "thisYear") === "last7" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => updateParams({ range: "last30", dateFrom: undefined, dateTo: undefined })}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${(range || "thisYear") === "last30" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
            >
              Last 30 Days
            </button>
            <button
              type="button"
              onClick={() => updateParams({ range: "thisMonth", dateFrom: undefined, dateTo: undefined })}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${(range || "thisYear") === "thisMonth" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => updateParams({ range: "thisYear", dateFrom: undefined, dateTo: undefined })}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${(range || "thisYear") === "thisYear" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
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

      {/* Filter controls */}
      <div className="mt-4 flex flex-wrap items-end gap-3">

          {/* ── Date Range ── */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Date Range</label>
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
              <SelectTrigger className="w-40 h-9 text-xs rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Custom Date Picker ── */}
          {range === "custom" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Custom Dates</label>
              <Popover open={customOpen} onOpenChange={(open) => (open ? openCustom() : setCustomOpen(false))}>
                <PopoverTrigger
                  render={
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
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
                        className="w-auto h-9 text-xs rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">To</label>
                      <Input
                        type="date"
                        value={pendingTo}
                        min={pendingFrom || undefined}
                        onChange={(e) => setPendingTo(e.target.value)}
                        className="w-auto h-9 text-xs rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={applyCustom}
                    disabled={!pendingFrom || !pendingTo}
                    className="mt-2 w-full h-8 text-xs"
                  >
                    Apply Custom Dates
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* ── Granularity ── */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Granularity</label>
            <Select
              value={granularity || "month"}
              onValueChange={(v) => updateParams({ granularity: v || undefined })}
            >
              <SelectTrigger className="w-28 h-9 text-xs rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Daily</SelectItem>
                <SelectItem value="week">Weekly</SelectItem>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ── Client ── */}
          {clients.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Client</label>
              <Select
                value={clientId || "all"}
                onValueChange={(v) => updateParams({ clientId: !v || v === "all" ? undefined : v })}
              >
                <SelectTrigger className="w-44 h-9 text-xs rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients ({clients.length})</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c._id} value={c._id}>{c.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Project Status ── */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Status</label>
            <Select
              value={status || "all"}
              onValueChange={(v) => updateParams({ status: !v || v === "all" ? undefined : v })}
            >
              <SelectTrigger className="w-36 h-9 text-xs rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {PROJECT_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Priority ── */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Priority</label>
            <Select
              value={priority || "all"}
              onValueChange={(v) => updateParams({ priority: !v || v === "all" ? undefined : v })}
            >
              <SelectTrigger className="w-32 h-9 text-xs rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
                <SelectValue placeholder="All Priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Billing Model ── */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Billing Model</label>
            <Select
              value={billingModel || "all"}
              onValueChange={(v) => updateParams({ billingModel: !v || v === "all" ? undefined : v })}
            >
              <SelectTrigger className="w-36 h-9 text-xs rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
                <SelectValue placeholder="All Models" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                <SelectItem value="hourly">Hourly Rate</SelectItem>
                <SelectItem value="fixed">Fixed Cost</SelectItem>
                <SelectItem value="milestone">Milestone-Based</SelectItem>
                <SelectItem value="retainer">Retainer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ── Health / Overdue ── */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Health Filter</label>
            <Select
              value={overdue || "all"}
              onValueChange={(v) => updateParams({ overdue: !v || v === "all" ? undefined : v })}
            >
              <SelectTrigger className="w-36 h-9 text-xs rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
                <SelectValue placeholder="All Health" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Health States</SelectItem>
                <SelectItem value="overdue">⚠ Overdue Only</SelectItem>
                <SelectItem value="on_track">✓ On Track</SelectItem>
                <SelectItem value="at_risk">⚡ At Risk</SelectItem>
                <SelectItem value="completed">✅ Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

        </div>

        {/* Active filter pills */}
        {activeCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/40">
            <span className="text-xs text-muted-foreground font-medium">Active:</span>
            {clientId && clients.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {clients.find((c) => c._id === clientId)?.companyName ?? clientId}
                <button onClick={() => updateParams({ clientId: undefined })} className="ml-0.5 hover:text-destructive">×</button>
              </span>
            )}
            {status && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                Status: {PROJECT_STATUSES.find((s) => s.value === status)?.label ?? status}
                <button onClick={() => updateParams({ status: undefined })} className="ml-0.5 hover:text-destructive">×</button>
              </span>
            )}
            {priority && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                Priority: {PRIORITIES.find((p) => p.value === priority)?.label ?? priority}
                <button onClick={() => updateParams({ priority: undefined })} className="ml-0.5 hover:text-destructive">×</button>
              </span>
            )}
            {billingModel && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Billing: {billingModel}
                <button onClick={() => updateParams({ billingModel: undefined })} className="ml-0.5 hover:text-destructive">×</button>
              </span>
            )}
            {overdue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                Health: {overdue}
                <button onClick={() => updateParams({ overdue: undefined })} className="ml-0.5 hover:text-destructive">×</button>
              </span>
            )}
          </div>
        )}

    </div>
  );
}
