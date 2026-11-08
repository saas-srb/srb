"use client";

import { useState, type ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ChevronsUpDown, X, Columns3, SlidersHorizontal, RotateCcw, type LucideIcon } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Generic enterprise data grid for the Director product-wise listings
 * (spec: search, filters, sort, pagination, sticky header, column visibility,
 * bulk selection + actions, responsive). Generalizes the proven pattern from
 * `src/components/dealflow-ai/SubmissionsDataTable.tsx` — server-driven pagination via
 * URL search params, a floating bulk-action bar — into a reusable shell so
 * every future module listing (PMS, TMS, PRMS, Careers, Portal…) wires the
 * same component instead of a bespoke table.
 *
 * The grid owns selection, sorting/pagination URL state, and column
 * visibility. It knows nothing about what entity it's showing — `columns`
 * render each cell, `filters` is a fully module-owned slot, and
 * `renderBulkActions`/`rowActions` are render props so each module supplies
 * its own real actions wired to its own server actions.
 */

export interface AdminDataGridColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  /** Defaults to visible; set false to start hidden behind the column toggle. */
  defaultVisible?: boolean;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T) => ReactNode;
}

export interface BulkActionsContext {
  selectedIds: string[];
  clearSelection: () => void;
  refresh: () => void;
}

export interface AdminDataGridProps<T> {
  columns: AdminDataGridColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  total: number;
  page: number;
  totalPages: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  emptyLabel?: string;
  filters?: ReactNode;
  hasActiveFilters?: boolean;
  /** Heading shown above the filters slot. Defaults to a generic "Search & Filters". */
  filterTitle?: string;
  /** Subtitle shown under the filter heading. */
  filterSubtitle?: string;
  /** Icon badge shown next to the filter heading. Defaults to SlidersHorizontal. */
  filterIcon?: LucideIcon;
  renderBulkActions?: (ctx: BulkActionsContext) => ReactNode;
  rowActions?: (row: T) => ReactNode;
  /** Extra control rendered in the table toolbar, next to Columns (e.g. "New account"). */
  toolbarExtra?: ReactNode;
}

export default function AdminDataGrid<T>({
  columns,
  rows,
  getRowId,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  emptyLabel = "No records match these filters.",
  filters,
  hasActiveFilters,
  filterTitle = "Search & Filters",
  filterSubtitle = "Refine the results below in real time",
  filterIcon: FilterIcon = SlidersHorizontal,
  renderBulkActions,
  rowActions,
  toolbarExtra,
}: AdminDataGridProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultVisible !== false).map((c) => c.key))
  );

  const visibleColumns = columns.filter((c) => visibleKeys.has(c.key));

  function toggleSort(field: string) {
    const params = new URLSearchParams(searchParams.toString());
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    params.set("sortBy", field);
    params.set("sortDir", nextDir);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  function sortIcon(field: string) {
    if (sortBy !== field) return <ChevronsUpDown className="size-3.5 text-muted-foreground/50" />;
    return sortDir === "asc" ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />;
  }

  function pageHref(targetPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(targetPage));
    return `${pathname}?${params.toString()}`;
  }

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(getRowId(r)));

  function toggleAll() {
    setSelected(allOnPageSelected ? new Set() : new Set(rows.map(getRowId)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleColumn(key: string) {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {(filters || hasActiveFilters !== undefined) && (
        <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                <FilterIcon className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight text-foreground">{filterTitle}</h3>
                <p className="text-xs text-muted-foreground">{filterSubtitle}</p>
              </div>
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
          <div className="mt-4 flex flex-wrap items-end gap-3">{filters}</div>
        </div>
      )}

      <GlassCard interactive={false}>
        <CardContent className="max-h-[65vh] overflow-auto p-0">
          <div className="flex items-center justify-end gap-2 border-b border-border/60 px-3 py-2">
            {toolbarExtra}
            <Popover>
              <PopoverTrigger
                render={
                  <Button type="button" variant="outline" size="sm">
                    <Columns3 className="size-3.5" data-icon="inline-start" />
                    Columns
                  </Button>
                }
              />
              <PopoverContent align="end" className="w-56 p-0">
                <PopoverHeader className="p-3 pb-1.5">
                  <PopoverTitle>Visible columns</PopoverTitle>
                </PopoverHeader>
                <div className="space-y-1 p-2 pt-1">
                  {columns.map((c) => (
                    <label key={c.key} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60">
                      <Checkbox checked={visibleKeys.has(c.key)} onCheckedChange={() => toggleColumn(c.key)} />
                      {c.label}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                </TableHead>
                {visibleColumns.map((c) => (
                  <TableHead key={c.key} className={c.headerClassName}>
                    {c.sortable ? (
                      <button type="button" onClick={() => toggleSort(c.key)} className="flex items-center gap-1 hover:text-foreground">
                        {c.label} {sortIcon(c.key)}
                      </button>
                    ) : (
                      c.label
                    )}
                  </TableHead>
                ))}
                {rowActions && <TableHead className="w-8" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length + 2} className="text-center text-muted-foreground">
                    {emptyLabel}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => {
                const id = getRowId(row);
                return (
                  <TableRow key={id} data-state={selected.has(id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox checked={selected.has(id)} onCheckedChange={() => toggleOne(id)} aria-label="Select row" />
                    </TableCell>
                    {visibleColumns.map((c) => (
                      <TableCell key={c.key} className={cn("text-muted-foreground", c.cellClassName)}>
                        {c.render(row)}
                      </TableCell>
                    ))}
                    {rowActions && <TableCell>{rowActions(row)}</TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {totalPages} · {total} total</span>
          <div className="flex gap-2">
            <Link
              href={pageHref(Math.max(page - 1, 1))}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              aria-disabled={page <= 1}
              tabIndex={page <= 1 ? -1 : undefined}
            >
              <ChevronLeft className="size-3.5" data-icon="inline-start" />
              Previous
            </Link>
            <Link
              href={pageHref(Math.min(page + 1, totalPages))}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              aria-disabled={page >= totalPages}
              tabIndex={page >= totalPages ? -1 : undefined}
            >
              Next
              <ChevronRight className="size-3.5" data-icon="inline-end" />
            </Link>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selected.size > 0 && renderBulkActions && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
          >
            <div className="flex flex-wrap items-center justify-center gap-3 rounded-full border border-border/60 bg-background px-4 py-2 shadow-xl">
              <span className="text-sm font-medium">{selected.size} selected</span>
              {renderBulkActions({
                selectedIds: Array.from(selected),
                clearSelection: () => setSelected(new Set()),
                refresh: () => router.refresh(),
              })}
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setSelected(new Set())} aria-label="Clear selection">
                <X className="size-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
