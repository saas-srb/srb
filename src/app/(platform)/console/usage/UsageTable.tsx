"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronsUpDown, Download, Gauge, Search } from "lucide-react";
import FilterCardShell from "@/components/platform/panel/FilterCardShell";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CompanyUsageRow, UsageLevel, UsageMeter } from "@/lib/platform/billing/usage-report";

type SortKey = "name" | "plan" | "status" | "seats" | "ai" | "storage";
type LevelFilter = "all" | "attention" | "over" | "near";

const num = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
const ratio = (m: UsageMeter) => (m.limit === null ? -1 : m.limit === 0 ? (m.used > 0 ? Infinity : 0) : m.used / m.limit);

const STATUS_LABEL: Record<string, string> = {
  internal: "Platform owner",
  trialing: "Trial",
  active: "Active",
  past_due: "Past due",
  grace: "Grace",
  suspended: "Suspended",
  canceled: "Canceled",
};

const LEVEL_TEXT: Record<UsageLevel, string> = {
  over: "text-rose-600 dark:text-rose-400",
  near: "text-amber-600 dark:text-amber-400",
  ok: "text-foreground",
};
const LEVEL_BAR: Record<UsageLevel, string> = { over: "bg-rose-500", near: "bg-amber-500", ok: "bg-primary" };

function MeterCell({ m, unit }: { m: UsageMeter; unit?: string }) {
  const pct = m.limit === null ? null : m.limit === 0 ? 100 : Math.min(100, (m.used / m.limit) * 100);
  return (
    <div className="min-w-[7rem]" data-level={m.level}>
      <p className={cn("text-sm tabular-nums", LEVEL_TEXT[m.level], m.level !== "ok" && "font-semibold")}>
        {num(m.used)}
        <span className="text-muted-foreground"> / {m.limit === null ? "∞" : `${num(m.limit)}${unit ?? ""}`}</span>
      </p>
      {pct !== null && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", LEVEL_BAR[m.level])} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function LevelBadge({ level }: { level: UsageLevel }) {
  if (level === "over") return <Badge variant="destructive">Over limit</Badge>;
  if (level === "near") return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Near limit</Badge>;
  return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Within limits</Badge>;
}

function csvField(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: CompanyUsageRow[], period: string) {
  const header = ["Company", "Slug", "Plan", "Status", "Seats used", "Seat limit", `AI tokens ${period}`, "AI token limit", "Storage used (MB)", "Storage limit (MB)", "Level"];
  const lines = rows.map((r) =>
    [r.name, r.slug, r.planName ?? (r.isPlatformOwner ? "Internal" : ""), STATUS_LABEL[r.status] ?? r.status, r.seats.used, r.seats.limit ?? "unlimited", r.aiTokens.used, r.aiTokens.limit ?? "unlimited", r.storageMb.used, r.storageMb.limit ?? "unlimited", r.level]
      .map(csvField)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `usage-${period}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function UsageTable({ rows, period }: { rows: CompanyUsageRow[]; period: string }) {
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });

  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => r.status))), [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (needle && !r.name.toLowerCase().includes(needle) && !r.slug.toLowerCase().includes(needle)) return false;
      if (status !== "all" && r.status !== status) return false;
      if (level === "attention") return r.level !== "ok";
      if (level === "over" || level === "near") return r.level === level;
      return true;
    });
    const val = (r: CompanyUsageRow): string | number => {
      switch (sort.key) {
        case "name":
          return r.name.toLowerCase();
        case "plan":
          return (r.planName ?? "").toLowerCase();
        case "status":
          return r.status;
        case "seats":
          return ratio(r.seats);
        case "ai":
          return ratio(r.aiTokens);
        case "storage":
          return ratio(r.storageMb);
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return x < y ? -dir : x > y ? dir : a.name.localeCompare(b.name);
    });
  }, [rows, q, level, status, sort]);

  function toggle(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "plan" || key === "status" ? "asc" : "desc" }));
  }

  const head = (key: SortKey, label: string) => (
    <TableHead>
      <button type="button" id={`usage-sort-${key}`} onClick={() => toggle(key)} className="flex items-center gap-1 hover:text-foreground">
        {label}
        {sort.key !== key ? <ChevronsUpDown className="size-3.5 text-muted-foreground/50" /> : sort.dir === "asc" ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      <FilterCardShell description="Find companies by name, limit status or subscription status">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-none">
            <label htmlFor="usage-search" className="text-xs font-medium text-muted-foreground">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input id="usage-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company or slug" className="h-9 w-full rounded-xl border-border/50 bg-background pl-8 sm:w-64" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Limits</label>
            <Select value={level} onValueChange={(v) => setLevel((v as LevelFilter) || "all")}>
              <SelectTrigger id="usage-level-filter" className="h-9 w-40 rounded-xl border-border/50 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                <SelectItem value="attention">Over or near</SelectItem>
                <SelectItem value="over">Over limit</SelectItem>
                <SelectItem value="near">Near limit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Subscription</label>
            <Select value={status} onValueChange={(v) => setStatus(v || "all")}>
              <SelectTrigger id="usage-status-filter" className="h-9 w-40 rounded-xl border-border/50 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button id="usage-export-csv" type="button" variant="outline" className="h-9 rounded-xl sm:ml-auto" onClick={() => downloadCsv(visible, period)} disabled={visible.length === 0}>
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>
      </FilterCardShell>

      <GlassCard interactive={false}>
        <CardContent>
          <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground" id="usage-count">
            <Gauge className="size-4" />
            {visible.length} of {rows.length} compan{rows.length === 1 ? "y" : "ies"}
          </p>
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No companies match these filters.</p>
          ) : (
            <>
              {/* Phones: one card per company. */}
              <ul className="space-y-3 md:hidden">
                {visible.map((r) => (
                  <li key={r.id} data-company={r.slug} data-level={r.level} className={cn("rounded-2xl border p-3", r.level === "over" ? "border-rose-500/40" : r.level === "near" ? "border-amber-500/40" : "border-border/50")}>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <Link href={`/console/companies/${r.id}`} className="min-w-0 font-medium hover:underline">
                        <span className="block truncate">{r.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.planName ?? (r.isPlatformOwner ? "Internal" : "—")} · {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </Link>
                      <LevelBadge level={r.level} />
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground">
                      <div>
                        Seats <MeterCell m={r.seats} />
                      </div>
                      <div>
                        AI tokens <MeterCell m={r.aiTokens} />
                      </div>
                      <div>
                        Storage <MeterCell m={r.storageMb} unit=" MB" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {/* Tablet and up: sortable table. */}
              <div className="hidden md:block">
                <Table id="usage-table">
                  <TableHeader>
                    <TableRow>
                      {head("name", "Company")}
                      {head("plan", "Plan")}
                      {head("status", "Status")}
                      {head("seats", "Seats")}
                      {head("ai", "AI tokens")}
                      {head("storage", "Storage")}
                      <TableHead>Limits</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((r) => (
                      <TableRow key={r.id} data-company={r.slug} data-level={r.level} className={cn(r.level === "over" && "bg-rose-500/5", r.level === "near" && "bg-amber-500/5")}>
                        <TableCell>
                          <Link href={`/console/companies/${r.id}`} className="block hover:underline">
                            <span className="font-medium text-foreground">{r.name}</span>
                            <span className="block text-xs text-muted-foreground">{r.slug}</span>
                          </Link>
                        </TableCell>
                        <TableCell>{r.planName ?? (r.isPlatformOwner ? "Internal" : "—")}</TableCell>
                        <TableCell>{STATUS_LABEL[r.status] ?? r.status}</TableCell>
                        <TableCell>
                          <MeterCell m={r.seats} />
                        </TableCell>
                        <TableCell>
                          <MeterCell m={r.aiTokens} />
                        </TableCell>
                        <TableCell>
                          <MeterCell m={r.storageMb} unit=" MB" />
                        </TableCell>
                        <TableCell>
                          <LevelBadge level={r.level} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </GlassCard>
    </div>
  );
}
