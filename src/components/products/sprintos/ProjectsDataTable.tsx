"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, FolderKanban, RotateCcw } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ProjectStatusBadge, PriorityBadge, ProjectHealthBadge } from "@/components/products/sprintos/StatusBadges";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { PROJECT_STATUSES, PRIORITIES } from "@/lib/products/sprintos/constants";
import { formatDate } from "@/lib/utils";
import type { SerializedProject } from "@/lib/products/sprintos/projects";
import ProjectBillingDownloadButtons from "@/components/products/sprintos/ProjectBillingDownloadButtons";

interface Props {
  items: SerializedProject[];
  total: number;
  page: number;
  totalPages: number;
  clients: { _id: string; companyName: string }[];
  managers: { _id: string; name: string }[];
  categories: string[];
  initial: {
    search: string;
    status: string;
    priority: string;
    clientId: string;
    manager: string;
    category: string;
    sortBy: string;
    sortDir: string;
  };
}

export default function ProjectsDataTable({
  items,
  total,
  page,
  totalPages,
  clients,
  managers,
  categories,
  initial,
}: Props) {
  const clientName = (id: string) => clients.find((c) => c._id === id)?.companyName ?? "—";
  const managerName = (id: string | null) => managers.find((m) => m._id === id)?.name ?? "—";
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
    initial.search || initial.status || initial.priority || initial.clientId || initial.manager || initial.category
  );

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
              <FolderKanban className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">Search &amp; Filters</h3>
              <p className="text-xs text-muted-foreground">Search and filter your active projects</p>
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
              <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Name or code" className="h-9 w-52 pl-8 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={initial.status || "all"} onValueChange={(v) => updateParams({ status: !v || v === "all" ? undefined : v })}>
              <SelectTrigger className="w-36 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {PROJECT_STATUSES.map((s) => (
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
                <SelectItem value="all">Any priority</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Client</label>
            <Select value={initial.clientId || "all"} onValueChange={(v) => updateParams({ clientId: !v || v === "all" ? undefined : v })}>
              <SelectTrigger className="w-44 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c._id} value={c._id}>{c.companyName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Manager</label>
            <Select value={initial.manager || "all"} onValueChange={(v) => updateParams({ manager: !v || v === "all" ? undefined : v })}>
              <SelectTrigger className="w-44 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any manager</SelectItem>
                {managers.map((m) => (
                  <SelectItem key={m._id} value={m._id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {categories.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select value={initial.category || "all"} onValueChange={(v) => updateParams({ category: !v || v === "all" ? undefined : v })}>
                <SelectTrigger className="w-44 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  <button type="button" onClick={() => toggleSort("projectCode")} className="flex items-center gap-1 hover:text-foreground">
                    Code {sortIcon("projectCode")}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-foreground">
                    Project {sortIcon("name")}
                  </button>
                </TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Health</TableHead>
                <TableHead className="w-40">
                  <button type="button" onClick={() => toggleSort("progressPercent")} className="flex items-center gap-1 hover:text-foreground">
                    Progress {sortIcon("progressPercent")}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("endDate")} className="flex items-center gap-1 hover:text-foreground">
                    Due {sortIcon("endDate")}
                  </button>
                </TableHead>
                <TableHead className="text-right">Billing PDFs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">No projects match these filters.</TableCell>
                </TableRow>
              )}
              {items.map((p) => (
                <TableRow key={p._id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.projectCode}</TableCell>
                  <TableCell>
                    <Link href={`/sprintos/projects/${p._id}`} className="font-medium hover:underline">{p.name}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{clientName(p.clientId)}</TableCell>
                  <TableCell className="text-muted-foreground">{managerName(p.projectManagerId)}</TableCell>
                  <TableCell><PriorityBadge priority={p.priority} /></TableCell>
                  <TableCell><ProjectStatusBadge status={p.status} /></TableCell>
                  <TableCell><ProjectHealthBadge health={p.health} /></TableCell>
                  <TableCell><ProgressBar value={p.progressPercent} /></TableCell>
                  <TableCell className="text-muted-foreground">{p.endDate ? formatDate(p.endDate) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <ProjectBillingDownloadButtons projectId={p._id} projectCode={p.projectCode} variant="compact" />
                  </TableCell>
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
