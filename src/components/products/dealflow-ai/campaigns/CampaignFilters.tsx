"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X, CalendarRange, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import { CAMPAIGN_PLATFORMS, CAMPAIGN_STATUSES } from "@/lib/campaign-platforms";
import { LEAD_SOURCES } from "@/lib/lead-sources";
import { DATE_RANGE_PRESETS } from "@/lib/date-ranges";
import { formatDate } from "@/lib/utils";

export interface CampaignFilterValues {
  platform: string;
  source: string;
  campaign: string;
  status: string;
  range: string;
  dateFrom: string;
  dateTo: string;
}

export default function CampaignFilters({
  values,
  campaignOptions,
  hasActiveFilters,
}: {
  values: CampaignFilterValues;
  campaignOptions: { key: string; name: string }[];
  hasActiveFilters: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);
  const [pendingFrom, setPendingFrom] = useState(values.dateFrom);
  const [pendingTo, setPendingTo] = useState(values.dateTo);

  function updateParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  function openCustomPicker() {
    setPendingFrom(values.dateFrom);
    setPendingTo(values.dateTo);
    setCustomOpen(true);
  }

  function applyCustomRange() {
    updateParams({ range: "custom", dateFrom: pendingFrom || undefined, dateTo: pendingTo || undefined });
    setCustomOpen(false);
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Megaphone className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">Search &amp; Filters</h3>
            <p className="text-xs text-muted-foreground">Narrow attributed leads by platform, campaign, source, and date</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border/40 bg-muted/30 p-1 text-xs">
          <button
            type="button"
            onClick={() => updateParams({ range: "today", dateFrom: undefined, dateTo: undefined })}
            className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${(values.range || "last30") === "today" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => updateParams({ range: "last7", dateFrom: undefined, dateTo: undefined })}
            className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${(values.range || "last30") === "last7" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => updateParams({ range: "last30", dateFrom: undefined, dateTo: undefined })}
            className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${(values.range || "last30") === "last30" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
          >
            Last 30 Days
          </button>
          <button
            type="button"
            onClick={() => updateParams({ range: "thisMonth", dateFrom: undefined, dateTo: undefined })}
            className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${(values.range || "last30") === "thisMonth" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => updateParams({ range: "thisYear", dateFrom: undefined, dateTo: undefined })}
            className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${(values.range || "last30") === "thisYear" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
          >
            This Year
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Platform">
          <Select value={values.platform || "all"} onValueChange={(v) => updateParams({ platform: !v || v === "all" ? undefined : v })}>
            <SelectTrigger className="w-44 rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All platforms</SelectItem>
              {CAMPAIGN_PLATFORMS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.shortLabel}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Campaign">
          <Select value={values.campaign || "all"} onValueChange={(v) => updateParams({ campaign: !v || v === "all" ? undefined : v })}>
            <SelectTrigger className="w-52 rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              {campaignOptions.map((c) => (
                <SelectItem key={c.key} value={c.name}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Lead Source">
          <Select value={values.source || "all"} onValueChange={(v) => updateParams({ source: !v || v === "all" ? undefined : v })}>
            <SelectTrigger className="w-40 rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any source</SelectItem>
              {LEAD_SOURCES.filter((s) => ["meta", "google", "linkedin"].includes(s.value)).map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Status">
          <Select value={values.status || "all"} onValueChange={(v) => updateParams({ status: !v || v === "all" ? undefined : v })}>
            <SelectTrigger className="w-36 rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {CAMPAIGN_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Date Range">
          <Select
            value={values.range || "last30"}
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
            <SelectTrigger className="w-40 rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DATE_RANGE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {values.range === "custom" && (
          <Field label="Custom Dates">
            <Popover open={customOpen} onOpenChange={(open) => (open ? openCustomPicker() : setCustomOpen(false))}>
              <PopoverTrigger
                render={
                  <Button type="button" variant="outline" size="sm" className="h-8">
                    <CalendarRange className="size-3.5" data-icon="inline-start" />
                    {formatDate(values.dateFrom)} – {formatDate(values.dateTo)}
                  </Button>
                }
              />
              <PopoverContent align="start" className="w-auto">
                <PopoverHeader><PopoverTitle>Custom Range</PopoverTitle></PopoverHeader>
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">From</label>
                    <Input type="date" value={pendingFrom} max={pendingTo || undefined} onChange={(e) => setPendingFrom(e.target.value)} className="w-auto rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">To</label>
                    <Input type="date" value={pendingTo} min={pendingFrom || undefined} onChange={(e) => setPendingTo(e.target.value)} className="w-auto rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50" />
                  </div>
                </div>
                <Button type="button" size="sm" onClick={applyCustomRange} disabled={!pendingFrom || !pendingTo}>Apply</Button>
              </PopoverContent>
            </Popover>
          </Field>
        )}

        {hasActiveFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={() => router.replace(pathname)}>
            <X className="size-3.5" data-icon="inline-start" />
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
