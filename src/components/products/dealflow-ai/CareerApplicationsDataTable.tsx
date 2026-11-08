"use client";

import DealflowCallButton from "@/components/products/dealflow-ai/DealflowCallButton";
import { applicantCallSpec } from "@/lib/dealflow-ai/call-targets";
import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Search,
  UserSearch,
  Filter,
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  X,
  Trash2,
  Eye,
  UserRound,
} from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import CareerStatusBadge from "@/components/products/dealflow-ai/CareerStatusBadge";
import CareerApplicationSheet from "@/components/products/dealflow-ai/CareerApplicationSheet";
import CareersExportButton from "@/components/products/dealflow-ai/CareersExportButton";
import { CAREER_APPLICATION_STATUSES } from "@/lib/career-application-status";
import type { SerializedCareerApplication } from "@/components/products/dealflow-ai/types";
import { bulkDeleteApplicationsAction, bulkUpdateApplicationStatusAction } from "@/app/(products)/dealflow-ai/(protected)/careers/actions";
import { formatDate } from "@/lib/utils";

interface CareerApplicationsDataTableProps {
  items: SerializedCareerApplication[];
  total: number;
  page: number;
  totalPages: number;
  positions: { slug: string; title: string }[];
  initialSearch: string;
  initialStatus: string;
  initialPosition: string;
  initialDateFrom: string;
  initialDateTo: string;
  initialSortBy: string;
  initialSortDir: string;
}

export default function CareerApplicationsDataTable({
  items,
  total,
  page,
  totalPages,
  positions,
  initialSearch,
  initialStatus,
  initialPosition,
  initialDateFrom,
  initialDateTo,
  initialSortBy,
  initialSortDir,
}: CareerApplicationsDataTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [searchInput, setSearchInput] = useState(initialSearch);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sheetApplication, setSheetApplication] = useState<SerializedCareerApplication | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);

  function updateParams(updates: Record<string, string | undefined>, resetPage = true) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (resetPage) params.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  // Debounce search-as-you-type into a URL update.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== initialSearch) {
        updateParams({ search: searchInput || undefined });
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function toggleSort(field: string) {
    const nextDir = initialSortBy === field && initialSortDir === "asc" ? "desc" : "asc";
    updateParams({ sortBy: field, sortDir: nextDir }, false);
  }

  function sortIcon(field: string) {
    if (initialSortBy !== field) return <ChevronsUpDown className="size-3.5 text-muted-foreground/50" />;
    return initialSortDir === "asc" ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />;
  }

  const allOnPageSelected = items.length > 0 && items.every((i) => selected.has(i._id));

  function toggleAll() {
    setSelected(allOnPageSelected ? new Set() : new Set(items.map((i) => i._id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openSheet(application: SerializedCareerApplication) {
    setSheetApplication(application);
    setSheetOpen(true);
  }

  async function handleBulkStatus(status: string) {
    setBulkPending(true);
    const ids = Array.from(selected);
    const result = await bulkUpdateApplicationStatusAction(ids, status);
    setBulkPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Updated ${result.updated} application${result.updated === 1 ? "" : "s"}`);
    setSelected(new Set());
    router.refresh();
  }

  async function handleBulkDelete() {
    setBulkPending(true);
    const ids = Array.from(selected);
    const result = await bulkDeleteApplicationsAction(ids);
    setBulkPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Deleted ${result.deleted} application${result.deleted === 1 ? "" : "s"}`);
    setSelected(new Set());
    router.refresh();
  }

  const hasActiveFilters = Boolean(initialSearch || initialStatus || initialPosition || initialDateFrom || initialDateTo);

  function pageHref(targetPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(targetPage));
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3 border-b border-border/40 pb-4">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <UserSearch className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">Search &amp; Filters</h3>
            <p className="text-xs text-muted-foreground">Search and narrow applications by status, position, and date</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Search className="size-3.5 text-primary" />
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Name, email, or phone"
                className="h-8 w-56 rounded-xl border-border/50 bg-background pl-8 text-xs placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/50"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Filter className="size-3.5 text-primary" />
              Status
            </label>
            <Select value={initialStatus || "all"} onValueChange={(v) => updateParams({ status: !v || v === "all" ? undefined : v })}>
              <SelectTrigger className="w-44 rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {CAREER_APPLICATION_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Briefcase className="size-3.5 text-primary" />
              Position
            </label>
            <Select value={initialPosition || "all"} onValueChange={(v) => updateParams({ position: !v || v === "all" ? undefined : v })}>
              <SelectTrigger className="w-48 rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All positions</SelectItem>
                {positions.map((p) => (
                  <SelectItem key={p.slug} value={p.slug}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar className="size-3.5 text-primary" />
              From
            </label>
            <Input
              type="date"
              defaultValue={initialDateFrom}
              onChange={(e) => updateParams({ dateFrom: e.target.value || undefined })}
              className="w-auto rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar className="size-3.5 text-primary" />
              To
            </label>
            <Input
              type="date"
              defaultValue={initialDateTo}
              onChange={(e) => updateParams({ dateTo: e.target.value || undefined })}
              className="w-auto rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50"
            />
          </div>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput("");
                router.replace(pathname);
              }}
            >
              <X className="size-3.5" data-icon="inline-start" />
              Reset
            </Button>
          )}
        </div>
      </div>

      <GlassCard interactive={false}>
        <CardContent className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                </TableHead>
                <TableHead className="w-8" />
                <TableHead>
                  <button type="button" onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-foreground">
                    Name {sortIcon("name")}
                  </button>
                </TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("createdAt")} className="flex items-center gap-1 hover:text-foreground">
                    Applied {sortIcon("createdAt")}
                  </button>
                </TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No applications match these filters.
                  </TableCell>
                </TableRow>
              )}
              {items.map((application) => (
                <Fragment key={application._id}>
                  <TableRow data-state={selected.has(application._id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox checked={selected.has(application._id)} onCheckedChange={() => toggleOne(application._id)} aria-label={`Select ${application.name}`} />
                    </TableCell>
                    <TableCell>
                      <button type="button" onClick={() => toggleExpanded(application._id)} className="text-muted-foreground hover:text-foreground" aria-label="Expand row">
                        <ChevronRight className={`size-4 transition-transform ${expanded.has(application._id) ? "rotate-90" : ""}`} />
                      </button>
                    </TableCell>
                    <TableCell>
                      <Link href={`/dealflow-ai/careers/applicants/${application._id}`} className="font-medium hover:text-primary hover:underline" title="Open full applicant profile">
                        {application.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div>{application.email}</div>
                      <div>{application.phone}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{application.positionTitle}</TableCell>
                    <TableCell><CareerStatusBadge status={application.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(application.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => openSheet(application)} aria-label="Quick view" title="Quick view">
                          <Eye className="size-3.5" />
                        </Button>
                        <DealflowCallButton spec={applicantCallSpec({ _id: application._id, name: application.name, phone: application.phone, positionTitle: application.positionTitle })} compact className="size-7" />
                        <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/dealflow-ai/careers/applicants/${application._id}`} />} aria-label="Open profile" title="Open full profile">
                          <UserRound className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expanded.has(application._id) && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={8} className="text-sm">
                        <div className="grid gap-3 py-1 sm:grid-cols-2">
                          <div>
                            <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Cover Note</p>
                            <p className="text-foreground">{application.coverNote || "—"}</p>
                          </div>
                          <div>
                            <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Internal Notes</p>
                            <p className="text-foreground">{application.notes || "—"}</p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
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

      <CareerApplicationSheet application={sheetApplication} open={sheetOpen} onOpenChange={setSheetOpen} />

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
          >
            <div className="flex items-center gap-3 rounded-full border border-border/60 bg-background px-4 py-2 shadow-xl">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <Select onValueChange={(v: string | null) => { if (v) handleBulkStatus(v); }} disabled={bulkPending}>
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Mark as…" />
                </SelectTrigger>
                <SelectContent>
                  {CAREER_APPLICATION_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CareersExportButton params={{ ids: Array.from(selected) }} label="Export" />
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button type="button" variant="destructive" size="sm" disabled={bulkPending}>
                      <Trash2 className="size-3.5" data-icon="inline-start" />
                      Delete
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selected.size} application{selected.size === 1 ? "" : "s"}?</AlertDialogTitle>
                    <AlertDialogDescription>This permanently removes the selected applications and their resume files. This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleBulkDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
