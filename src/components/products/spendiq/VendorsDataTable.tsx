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
  Pencil,
  Trash2,
  Loader2,
  Building2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { VendorStatusBadge, VendorCategoryBadge } from "@/components/products/spendiq/StatusBadges";
import VendorForm from "@/components/products/spendiq/VendorForm";
import { VENDOR_CATEGORIES, VENDOR_STATUSES } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";
import type { SerializedVendor } from "@/lib/products/spendiq/vendors";
import { deleteVendorAction } from "@/app/(products)/spendiq/(protected)/(staff)/vendors/actions";

interface Props {
  items: SerializedVendor[];
  total: number;
  page: number;
  totalPages: number;
  canManage: boolean;
  initial: { search: string; category: string; status: string; sortBy: string; sortDir: string };
}

export default function VendorsDataTable({ items, total, page, totalPages, canManage, initial }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [pendingDelete, startDelete] = useTransition();
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

  const hasActiveFilters = Boolean(initial.search || initial.category || initial.status);
  const exportQs = searchParams.toString();

  function pageHref(target: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(target));
    return `${pathname}?${params.toString()}`;
  }

  function onDelete(id: string) {
    startDelete(async () => {
      const res = await deleteVendorAction(id);
      if (!res.ok) {
        toast.error(res.error ?? "Could not delete vendor.");
        return;
      }
      toast.success("Vendor deleted");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Building2 className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">Search &amp; Filters</h3>
              <p className="text-xs text-muted-foreground">Search the vendor directory by category and status</p>
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
                <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Company, code, GSTIN, contact" className="h-9 w-64 pl-8 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select value={initial.category || "all"} onValueChange={(v) => updateParams({ category: !v || v === "all" ? undefined : v })}>
                <SelectTrigger className="w-44 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {VENDOR_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={initial.status || "all"} onValueChange={(v) => updateParams({ status: !v || v === "all" ? undefined : v })}>
                <SelectTrigger className="w-36 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {VENDOR_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto flex gap-2">
              <a href={`/api/spendiq/export/vendors?format=csv&${exportQs}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Download className="size-3.5" data-icon="inline-start" />
                CSV
              </a>
              <a href={`/api/spendiq/export/vendors?format=xlsx&${exportQs}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Download className="size-3.5" data-icon="inline-start" />
                Excel
              </a>
            </div>
        </div>
      </div>

      <GlassCard interactive={false}>
        <CardContent className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("vendorCode")} className="flex items-center gap-1 hover:text-foreground">
                    Code {sortIcon("vendorCode")}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("companyName")} className="flex items-center gap-1 hover:text-foreground">
                    Company {sortIcon("companyName")}
                  </button>
                </TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("rating")} className="flex items-center gap-1 hover:text-foreground">
                    Rating {sortIcon("rating")}
                  </button>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 9 : 8} className="text-center text-muted-foreground">No vendors match these filters.</TableCell>
                </TableRow>
              )}
              {items.map((v) => (
                <TableRow key={v._id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{v.vendorCode}</TableCell>
                  <TableCell>
                    <Link href={`/spendiq/vendors/${v._id}`} className="font-medium hover:underline">{v.companyName}</Link>
                    {v.city && <div className="text-xs text-muted-foreground">{v.city}</div>}
                  </TableCell>
                  <TableCell><VendorCategoryBadge category={v.category} /></TableCell>
                  <TableCell className="text-muted-foreground">
                    {v.contactPerson ?? "—"}
                    {v.phone && <div className="text-xs">{v.phone}</div>}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{v.gstin ?? "—"}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{v.rating != null ? v.rating.toFixed(1) : "—"}</TableCell>
                  <TableCell><VendorStatusBadge status={v.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(v.createdAt)}</TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <VendorForm
                          vendor={v}
                          trigger={
                            <Button type="button" variant="ghost" size="icon-xs" aria-label="Edit vendor">
                              <Pencil className="size-3.5" />
                            </Button>
                          }
                        />
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button type="button" variant="ghost" size="icon-xs" aria-label="Delete vendor">
                                <Trash2 className="size-3.5 text-destructive" />
                              </Button>
                            }
                          />
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {v.companyName}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                The vendor is soft-deleted and hidden everywhere. Purchase history is retained.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction disabled={pendingDelete} onClick={() => onDelete(v._id)}>
                                {pendingDelete ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  )}
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
