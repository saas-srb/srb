"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import type { TableDef } from "@/lib/products/clientos/dashboard/types";
import { formatDate, rangeWindow, type RangeId } from "@/components/products/clientos/dashboard/format";

const PAGE_SIZE = 8;

const BADGE: Record<string, string> = {
  paid: "bg-green-500/15 text-green-600 dark:text-green-400",
  completed: "bg-green-500/15 text-green-600 dark:text-green-400",
  reviewed: "bg-green-500/15 text-green-600 dark:text-green-400",
  active: "bg-green-500/15 text-green-600 dark:text-green-400",
  provided: "bg-green-500/15 text-green-600 dark:text-green-400",
  engaged: "bg-green-500/15 text-green-600 dark:text-green-400",
  selected: "bg-green-500/15 text-green-600 dark:text-green-400",
  submitted: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  scheduled: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  sent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  in_progress: "bg-primary/10 text-primary",
  "in progress": "bg-primary/10 text-primary",
  partial: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  partially_paid: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  resubmit: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  overdue: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  closed: "bg-muted text-muted-foreground",
};

function csvCell(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Searchable, sortable, paginated, exportable table. Rows are clickable and open the underlying module/record. */
export default function DataTableCard({ table, range }: { table: TableDef; range: RangeId }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const win = rangeWindow(range);
    let out = table.rows;
    if (table.dateKey && win.from) {
      out = out.filter((r) => {
        const v = r.cells[table.dateKey!];
        if (!v) return true;
        return new Date(String(v)).getTime() >= win.from!;
      });
    }
    const term = q.trim().toLowerCase();
    if (term) out = out.filter((r) => Object.values(r.cells).some((v) => v !== null && String(v).toLowerCase().includes(term)));
    if (sort) {
      const col = table.columns.find((c) => c.key === sort.key);
      const num = col?.type === "number" || col?.type === "currency";
      out = [...out].sort((a, b) => {
        const av = a.cells[sort.key];
        const bv = b.cells[sort.key];
        const cmp = num ? Number(av ?? 0) - Number(bv ?? 0) : String(av ?? "").localeCompare(String(bv ?? ""));
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [table, range, q, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const view = rows.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);

  function exportCsv() {
    const header = table.columns.map((c) => csvCell(c.label)).join(",");
    const body = rows.map((r) => table.columns.map((c) => csvCell(r.cells[c.key])).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`${header}\r\n${body}\r\n`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table.exportName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function cell(c: TableDef["columns"][number], v: string | number | null) {
    if (v === null || v === "") return <span className="text-muted-foreground">—</span>;
    if (c.type === "date") return formatDate(String(v));
    if (c.type === "currency") return `₹${Math.round(Number(v)).toLocaleString("en-IN")}`;
    if (c.type === "number") {
      const n = Number(v);
      return Number.isNaN(n) ? String(v) : <span className={n < 0 ? "text-destructive" : n > 0 && c.key === "amount" ? "text-green-600 dark:text-green-400" : ""}>{n > 0 && c.key === "amount" ? "+" : ""}{n.toLocaleString("en-IN")}</span>;
    }
    if (c.type === "badge") {
      const key = String(v).toLowerCase();
      return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${BADGE[key] ?? "bg-secondary text-secondary-foreground"}`}>{String(v).replace(/_/g, " ")}</span>;
    }
    return String(v);
  }

  return (
    <GlassCard interactive={false}>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{table.title}</h3>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">{rows.length}</span>
            {table.href && (
              <Link href={table.href} className="text-xs font-medium text-primary hover:underline">Open module →</Link>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search…" aria-label={`Search ${table.title}`} className="h-8 w-40 rounded-xl border border-border/50 bg-background pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" />
            </div>
            <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium hover:border-primary disabled:opacity-50">
              <Download className="size-3.5" /> CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                {table.columns.map((c) => (
                  <th key={c.key} className={`py-2 pr-3 font-medium ${c.align === "right" ? "text-right" : ""}`}>
                    <button type="button" onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === "asc" ? { key: c.key, dir: "desc" } : null) : { key: c.key, dir: "asc" }))} className="inline-flex items-center gap-1 hover:text-foreground">
                      {c.label}
                      {sort?.key === c.key && (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.map((r, i) => (
                <tr key={i} onClick={() => r.href && router.push(r.href)} className={`border-b border-border/40 last:border-0 ${r.href ? "cursor-pointer hover:bg-muted/40" : ""}`}>
                  {table.columns.map((c) => (
                    <td key={c.key} className={`py-2 pr-3 ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.key === table.columns[0].key ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {cell(c, r.cells[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
              {view.length === 0 && (
                <tr>
                  <td colSpan={table.columns.length} className="py-8 text-center text-muted-foreground">{q ? "No rows match your search." : table.emptyText ?? "Nothing here yet."}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Page {cur + 1} of {pages}</span>
            <div className="flex gap-1">
              <button type="button" aria-label="Previous page" disabled={cur === 0} onClick={() => setPage(cur - 1)} className="rounded-lg border border-border p-1.5 hover:border-primary disabled:opacity-40"><ChevronLeft className="size-3.5" /></button>
              <button type="button" aria-label="Next page" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="rounded-lg border border-border p-1.5 hover:border-primary disabled:opacity-40"><ChevronRight className="size-3.5" /></button>
            </div>
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
}
