"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { getPlatformMeta } from "@/lib/campaign-platforms";
import { formatCurrency } from "@/lib/utils";
import type { CampaignRow } from "@/lib/campaigns";

type SortKey = "name" | "spend" | "leadsAttributed" | "cpl" | "completed" | "revenue" | "roiPercent";

function SortHead({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <TableHead className={className}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {!active ? (
          <ChevronsUpDown className="size-3.5 text-muted-foreground/50" />
        ) : dir === "asc" ? (
          <ChevronUp className="size-3.5" />
        ) : (
          <ChevronDown className="size-3.5" />
        )}
      </button>
    </TableHead>
  );
}

const NUM = (v: number | null, suffix = "") => (v == null ? "—" : `${v.toLocaleString("en-IN")}${suffix}`);

export default function CampaignPerformanceTable({ rows, currency }: { rows: CampaignRow[]; currency: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
    const av = a[sortKey] ?? -Infinity;
    const bv = b[sortKey] ?? -Infinity;
    return (Number(av) - Number(bv)) * dir;
  });

  const headProps = { activeKey: sortKey, dir: sortDir, onSort: toggleSort };

  return (
    <GlassCard interactive={false}>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead label="Campaign" sortKey="name" {...headProps} />
              <TableHead>Platform</TableHead>
              <SortHead label="Spend" sortKey="spend" className="text-right" {...headProps} />
              <TableHead className="text-right">Impr.</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <SortHead label="Leads" sortKey="leadsAttributed" className="text-right" {...headProps} />
              <SortHead label="Cost / Lead" sortKey="cpl" className="text-right" {...headProps} />
              <SortHead label="Won" sortKey="completed" className="text-right" {...headProps} />
              <SortHead label="Revenue" sortKey="revenue" className="text-right" {...headProps} />
              <SortHead label="ROI" sortKey="roiPercent" className="text-right" {...headProps} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground">
                  No campaign data for these filters. Import a report to get started.
                </TableCell>
              </TableRow>
            )}
            {sorted.map((r) => (
              <TableRow key={`${r.platform}:${r.key}`}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{getPlatformMeta(r.platform).shortLabel}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(r.spend, currency)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{r.impressions.toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{r.clicks.toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{NUM(r.ctr, "%")}</TableCell>
                <TableCell className="text-right tabular-nums">{r.leadsAttributed}</TableCell>
                <TableCell className="text-right tabular-nums">{r.cpl == null ? "—" : formatCurrency(r.cpl, currency)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.completed}</TableCell>
                <TableCell className="text-right tabular-nums">{r.revenue > 0 ? formatCurrency(r.revenue, currency) : "—"}</TableCell>
                <TableCell
                  className={`text-right font-medium tabular-nums ${
                    r.roiPercent == null ? "text-muted-foreground" : r.roiPercent >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"
                  }`}
                >
                  {r.roiPercent == null ? "—" : `${r.roiPercent > 0 ? "+" : ""}${r.roiPercent}%`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </GlassCard>
  );
}
