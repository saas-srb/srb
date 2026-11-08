"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, CalendarDays, RotateCcw } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { BatchStatusBadge, TrainingModeBadge } from "@/components/products/cohort-ai/StatusBadges";
import { BATCH_STATUSES, TRAINING_MODES } from "@/lib/products/cohort-ai/constants";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { SerializedBatch } from "@/lib/products/cohort-ai/batches";

export type BatchRow = SerializedBatch & {
  programName: string;
  enrolled: number;
  availableSeats: number;
  mentorName: string | null;
};

interface Props {
  items: BatchRow[];
  total: number;
  page: number;
  totalPages: number;
  programs: { _id: string; name: string }[];
  mentors: { _id: string; name: string }[];
  initial: { search: string; programId: string; mentorId: string; status: string; mode: string; sortBy: string; sortDir: string };
}

export default function BatchesDataTable({ items, total, page, totalPages, programs, mentors, initial }: Props) {
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

  const hasActiveFilters = Boolean(initial.search || initial.programId || initial.mentorId || initial.status || initial.mode);

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
              <CalendarDays className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">Search &amp; Filters</h3>
              <p className="text-xs text-muted-foreground">Find training batches by program, mentor, status and mode</p>
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
                <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Name, code, or timing" className="h-9 w-56 pl-8 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Program</label>
              <Select value={initial.programId || "all"} onValueChange={(v) => updateParams({ programId: !v || v === "all" ? undefined : v })}>
                <SelectTrigger className="w-48 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All programs</SelectItem>
                  {programs.map((p) => (
                    <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mentors.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Mentor</label>
                <Select value={initial.mentorId || "all"} onValueChange={(v) => updateParams({ mentorId: !v || v === "all" ? undefined : v })}>
                  <SelectTrigger className="w-44 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All mentors</SelectItem>
                    {mentors.map((m) => (
                      <SelectItem key={m._id} value={m._id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={initial.status || "all"} onValueChange={(v) => updateParams({ status: !v || v === "all" ? undefined : v })}>
                <SelectTrigger className="w-36 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {BATCH_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Mode</label>
              <Select value={initial.mode || "all"} onValueChange={(v) => updateParams({ mode: !v || v === "all" ? undefined : v })}>
                <SelectTrigger className="w-32 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modes</SelectItem>
                  {TRAINING_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
        </div>
      </div>

      <GlassCard interactive={false}>
        <CardContent className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("batchCode")} className="flex items-center gap-1 hover:text-foreground">
                    Code {sortIcon("batchCode")}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-foreground">
                    Batch {sortIcon("name")}
                  </button>
                </TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Mentor</TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("startDate")} className="flex items-center gap-1 hover:text-foreground">
                    Starts {sortIcon("startDate")}
                  </button>
                </TableHead>
                <TableHead>Seats</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">No batches match these filters.</TableCell>
                </TableRow>
              )}
              {items.map((b) => {
                const full = b.availableSeats <= 0;
                return (
                  <TableRow key={b._id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{b.batchCode}</TableCell>
                    <TableCell>
                      <Link href={`/cohort-ai/batches/${b._id}`} className="font-medium hover:underline">{b.name}</Link>
                      {b.timing && <div className="text-xs text-muted-foreground">{b.timing}</div>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{b.programName}</TableCell>
                    <TableCell className="text-muted-foreground">{b.mentorName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{b.startDate ? formatDate(b.startDate) : "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      <span className={cn(full && "text-destructive")}>{b.enrolled}/{b.capacity}</span>
                      <div className="text-xs text-muted-foreground">{full ? "Full" : `${b.availableSeats} left`}</div>
                    </TableCell>
                    <TableCell><TrainingModeBadge mode={b.mode} /></TableCell>
                    <TableCell><BatchStatusBadge status={b.status} /></TableCell>
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
