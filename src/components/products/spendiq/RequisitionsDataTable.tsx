"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Download,
  ClipboardList,
  RotateCcw,
} from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { RequisitionStatusBadge, PriorityBadge, ExpenseCategoryBadge } from "@/components/products/spendiq/StatusBadges";
import { REQUISITION_STATUSES, PRIORITIES, EXPENSE_CATEGORIES, formatMoney } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";
import type { SerializedRequisition } from "@/lib/products/spendiq/requisitions";

interface Props {
  items: SerializedRequisition[];
  total: number;
  page: number;
  totalPages: number;
  basePath: string;
  showExport?: boolean;
  showRequester?: boolean;
  departments?: { _id: string; name: string }[];
  initial: {
    search: string;
    status: string;
    priority: string;
    category: string;
    departmentId: string;
    sortBy: string;
    sortDir: string;
  };
}

export default function RequisitionsDataTable({
  items,
  total,
  page,
  totalPages,
  basePath,
  showExport = false,
  showRequester = false,
  departments = [],
  initial,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(initial.search);

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
      if (searchInput !== initial.search) updateParams({ search: searchInput || undefined });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function toggleSort(field: string) {
    const nextDir = initial.sortBy === field && initial.sortDir === "asc" ? "desc" : "asc";
    updateParams({ sortBy: field, sortDir: nextDir }, false);
  }
  function sortIcon(field: string) {
    if (initial.sortBy !== field) return <ChevronsUpDown className="size-3.5 text-muted-foreground/50" />;
    return initial.sortDir === "asc" ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />;
  }

  const hasActiveFilters = Boolean(
    initial.search || initial.status || initial.priority || initial.category || initial.departmentId
  );
  const exportQs = searchParams.toString();

  function pageHref(target: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(target));
    return `${pathname}?${params.toString()}`;
  }

  const colCount = showRequester ? 8 : 7;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <ClipboardList className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">Search &amp; Filters</h3>
              <p className="text-xs text-muted-foreground">Find purchase requisitions by status, priority and category</p>
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
                <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="PR code, item, requester" className="h-9 w-60 pl-8 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={initial.status || "all"} onValueChange={(v) => updateParams({ status: !v || v === "all" ? undefined : v })}>
                <SelectTrigger className="w-44 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {REQUISITION_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <Select value={initial.priority || "all"} onValueChange={(v) => updateParams({ priority: !v || v === "all" ? undefined : v })}>
                <SelectTrigger className="w-32 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select value={initial.category || "all"} onValueChange={(v) => updateParams({ category: !v || v === "all" ? undefined : v })}>
                <SelectTrigger className="w-44 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {departments.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Department</label>
                <Select value={initial.departmentId || "all"} onValueChange={(v) => updateParams({ departmentId: !v || v === "all" ? undefined : v })}>
                  <SelectTrigger className="w-44 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {showExport && (
              <div className="ml-auto flex gap-2">
                <a href={`/api/spendiq/export/requisitions?format=csv&${exportQs}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <Download className="size-3.5" data-icon="inline-start" />
                  CSV
                </a>
                <a href={`/api/spendiq/export/requisitions?format=xlsx&${exportQs}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <Download className="size-3.5" data-icon="inline-start" />
                  Excel
                </a>
              </div>
            )}
        </div>
      </div>

      <GlassCard interactive={false}>
        <CardContent className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("prCode")} className="flex items-center gap-1 hover:text-foreground">
                    PR {sortIcon("prCode")}
                  </button>
                </TableHead>
                <TableHead>Item</TableHead>
                {showRequester && <TableHead>Requested By</TableHead>}
                <TableHead>Category</TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("estimatedCost")} className="flex items-center gap-1 hover:text-foreground">
                    Est. Cost {sortIcon("estimatedCost")}
                  </button>
                </TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("requiredDate")} className="flex items-center gap-1 hover:text-foreground">
                    Required {sortIcon("requiredDate")}
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colCount} className="text-center text-muted-foreground">No requisitions match these filters.</TableCell>
                </TableRow>
              )}
              {items.map((r) => (
                <TableRow key={r._id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.prCode}</TableCell>
                  <TableCell>
                    <Link href={`${basePath}/${r._id}`} className="font-medium hover:underline">{r.itemName}</Link>
                    <div className="text-xs text-muted-foreground">
                      {r.quantity} {r.uom}
                      {r.departmentName ? ` · ${r.departmentName}` : ""}
                    </div>
                  </TableCell>
                  {showRequester && <TableCell className="text-muted-foreground">{r.requestedBy?.name ?? "—"}</TableCell>}
                  <TableCell><ExpenseCategoryBadge category={r.category} /></TableCell>
                  <TableCell className="tabular-nums">{formatMoney(r.estimatedCost, r.currency)}</TableCell>
                  <TableCell><PriorityBadge priority={r.priority} /></TableCell>
                  <TableCell><RequisitionStatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{r.requiredDate ? formatDate(r.requiredDate) : "—"}</TableCell>
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
