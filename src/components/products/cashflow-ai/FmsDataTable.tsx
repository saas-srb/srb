"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Download,
} from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export interface DataColumn {
  key: string;
  header: string;
  sortable?: boolean;
  align?: "left" | "right";
  className?: string;
}

export interface DataRow {
  id: string;
  href?: string;
  cells: Record<string, ReactNode>;
}

export interface DataFilter {
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}

/**
 * Generic filter-bar + sortable table + pagination shell shared across every
 * PRMS module list page. The server page renders the cell content (badges,
 * money, links) and passes it in; this component only manages the URL-driven
 * search / filter / sort / page state.
 */
export default function FmsDataTable({
  columns,
  rows,
  filters = [],
  search = "",
  searchPlaceholder = "Search",
  sortBy,
  sortDir,
  page,
  totalPages,
  total,
  emptyLabel = "Nothing matches these filters.",
  exportBase,
  actions,
}: {
  columns: DataColumn[];
  rows: DataRow[];
  filters?: DataFilter[];
  search?: string;
  searchPlaceholder?: string;
  sortBy?: string;
  sortDir?: string;
  page: number;
  totalPages: number;
  total: number;
  emptyLabel?: string;
  /** e.g. "/api/cashflow-ai/export/expenses" — adds CSV / Excel buttons. */
  exportBase?: string;
  /** Extra buttons rendered on the right of the filter bar. */
  actions?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(search);

  function updateParams(updates: Record<string, string | undefined>, resetPage = true) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    if (resetPage) params.delete("page");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) updateParams({ search: searchInput || undefined });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function toggleSort(field: string) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    updateParams({ sortBy: field, sortDir: nextDir }, false);
  }
  function sortIcon(field: string) {
    if (sortBy !== field) return <ChevronsUpDown className="size-3.5 text-muted-foreground/50" />;
    return sortDir === "asc" ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />;
  }

  const hasActiveFilters = Boolean(search || filters.some((f) => f.value));
  const exportQs = searchParams.toString();

  function pageHref(target: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(target));
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <SlidersHorizontal className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">Search & Filters</h3>
              <p className="text-xs text-muted-foreground">Refine the results below in real time</p>
            </div>
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
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 w-60 rounded-xl border-border/50 bg-background pl-8 focus-visible:border-primary focus-visible:ring-primary/40"
              />
            </div>
          </div>
          {filters.map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
              <Select items={[{ value: "all", label: "All" }, ...f.options]} value={f.value || "all"} onValueChange={(v) => updateParams({ [f.key]: !v || v === "all" ? undefined : v })}>
                <SelectTrigger className="w-44 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {f.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          {(exportBase || actions) && (
            <div className="ml-auto flex gap-2">
              {actions}
              {exportBase && (
                <>
                  <a href={`${exportBase}?format=csv&${exportQs}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <Download className="size-3.5" data-icon="inline-start" />
                    CSV
                  </a>
                  <a href={`${exportBase}?format=xlsx&${exportQs}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <Download className="size-3.5" data-icon="inline-start" />
                    Excel
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <GlassCard interactive={false}>
        <CardContent className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key} className={c.align === "right" ? "text-right" : undefined}>
                    {c.sortable ? (
                      <button type="button" onClick={() => toggleSort(c.key)} className="flex items-center gap-1 hover:text-foreground">
                        {c.header} {sortIcon(c.key)}
                      </button>
                    ) : (
                      c.header
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-muted-foreground">{emptyLabel}</TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  {columns.map((c, ci) => {
                    const content = r.cells[c.key] ?? "—";
                    const cell =
                      ci === 0 && r.href ? (
                        <Link href={r.href} className="font-medium hover:underline">{content}</Link>
                      ) : (
                        content
                      );
                    return (
                      <TableCell key={c.key} className={`${c.align === "right" ? "text-right tabular-nums" : ""} ${c.className ?? ""}`}>
                        {cell}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {totalPages} · {total} total</span>
          <div className="flex gap-2">
            <Link href={pageHref(Math.max(page - 1, 1))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined}>
              <ChevronLeft className="size-3.5" data-icon="inline-start" />
              Previous
            </Link>
            <Link href={pageHref(Math.min(page + 1, totalPages))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-disabled={page >= totalPages} tabIndex={page >= totalPages ? -1 : undefined}>
              Next
              <ChevronRight className="size-3.5" data-icon="inline-end" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
