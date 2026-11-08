"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, Users, RotateCcw, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import EmployeeStatusBadge from "@/components/products/talentos/EmployeeStatusBadge";
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, getEmploymentTypeLabel } from "@/lib/products/talentos/employee-status";
import { formatDate } from "@/lib/utils";
import type { SerializedEmployee } from "@/lib/products/talentos/employees";

interface Props {
  items: SerializedEmployee[];
  total: number;
  page: number;
  totalPages: number;
  departments: { _id: string; name: string }[];
  designations: { _id: string; title: string }[];
  initial: {
    search: string;
    status: string;
    department: string;
    type: string;
    sortBy: string;
    sortDir: string;
  };
}

export default function EmployeesDataTable({ items, total, page, totalPages, departments, designations, initial }: Props) {
  const departmentName = (id: string | null) => departments.find((d) => d._id === id)?.name ?? "—";
  const designationTitle = (id: string | null) => designations.find((d) => d._id === id)?.title ?? "—";
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

  const hasActiveFilters = Boolean(initial.search || initial.status || initial.department || initial.type);

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
              <Users className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">Employee Directory</h3>
              <p className="text-xs text-muted-foreground">Search and filter your workforce by status, department, and type</p>
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
              <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Name, email, or code" className="h-9 w-56 rounded-xl border-border/50 bg-background pl-8 focus-visible:border-primary focus-visible:ring-primary/40" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={initial.status || "all"} onValueChange={(v) => updateParams({ status: !v || v === "all" ? undefined : v })}>
              <SelectTrigger className="h-9 w-40 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {EMPLOYEE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Department</label>
            <Select value={initial.department || "all"} onValueChange={(v) => updateParams({ department: !v || v === "all" ? undefined : v })}>
              <SelectTrigger className="h-9 w-48 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <Select value={initial.type || "all"} onValueChange={(v) => updateParams({ type: !v || v === "all" ? undefined : v })}>
              <SelectTrigger className="h-9 w-36 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any type</SelectItem>
                {EMPLOYMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
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
                  <button type="button" onClick={() => toggleSort("employeeCode")} className="flex items-center gap-1 hover:text-foreground">
                    Code {sortIcon("employeeCode")}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("firstName")} className="flex items-center gap-1 hover:text-foreground">
                    Name {sortIcon("firstName")}
                  </button>
                </TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("joiningDate")} className="flex items-center gap-1 hover:text-foreground">
                    Joined {sortIcon("joiningDate")}
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">No employees match these filters.</TableCell>
                </TableRow>
              )}
              {items.map((e) => (
                <TableRow key={e._id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{e.employeeCode}</TableCell>
                  <TableCell>
                    <Link href={`/talentos/employees/${e._id}`} className="font-medium hover:underline">
                      {e.firstName} {e.lastName}
                    </Link>
                    <div className="text-xs text-muted-foreground">{e.workEmail}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{departmentName(e.professional.departmentId)}</TableCell>
                  <TableCell className="text-muted-foreground">{designationTitle(e.professional.designationId)}</TableCell>
                  <TableCell className="text-muted-foreground">{getEmploymentTypeLabel(e.professional.employmentType ?? undefined)}</TableCell>
                  <TableCell><EmployeeStatusBadge status={e.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{e.professional.joiningDate ? formatDate(e.professional.joiningDate) : "—"}</TableCell>
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
