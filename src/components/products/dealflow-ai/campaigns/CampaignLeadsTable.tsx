"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Search, X, ChevronLeft, ChevronRight, Tag, Filter, UserSearch } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import StatusBadge from "@/components/products/dealflow-ai/StatusBadge";
import { LEAD_STATUSES } from "@/lib/lead-status";
import { getCategoryLabel, type CategorySlug } from "@/lib/categories";
import { getLeadSourceLabel } from "@/lib/lead-sources";
import { CAMPAIGN_PLATFORMS, type CampaignPlatform } from "@/lib/campaign-platforms";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { SerializedLead } from "@/components/products/dealflow-ai/types";
import { assignCampaignAction } from "@/app/(products)/dealflow-ai/(protected)/campaigns/actions";

export default function CampaignLeadsTable({
  items,
  total,
  page,
  totalPages,
  initialSearch,
  initialLeadStatus,
}: {
  items: SerializedLead[];
  total: number;
  page: number;
  totalPages: number;
  initialSearch: string;
  initialLeadStatus: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [searchInput, setSearchInput] = useState(initialSearch);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignPlatform, setAssignPlatform] = useState<CampaignPlatform>("meta");
  const [assignCampaign, setAssignCampaign] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [pending, setPending] = useState(false);

  function updateParams(updates: Record<string, string | undefined>, resetPage = true) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (resetPage) params.delete("page");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== initialSearch) updateParams({ search: searchInput || undefined });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const allSelected = items.length > 0 && items.every((i) => selected.has(i._id));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i._id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const byId = new Map(items.map((i) => [i._id, i]));

  async function runAssign() {
    setPending(true);
    const targets = Array.from(selected)
      .map((id) => byId.get(id))
      .filter((l): l is SerializedLead => Boolean(l))
      .map((l) => ({ category: l.category, id: l._id }));
    const res = await assignCampaignAction(targets, assignPlatform, assignCampaign);
    setPending(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`Updated ${res.updated} lead${res.updated === 1 ? "" : "s"}.`);
    setSelected(new Set());
    setAssignOpen(false);
    setAssignCampaign("");
    router.refresh();
  }

  function pageHref(target: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(target));
    return `${pathname}?${params.toString()}`;
  }

  const hasActiveFilters = Boolean(initialSearch || initialLeadStatus);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3 border-b border-border/40 pb-4">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <UserSearch className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">Lead Search</h3>
            <p className="text-xs text-muted-foreground">Search attributed leads by name, email, phone, or campaign</p>
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
              <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Name, email, phone, campaign" className="h-8 w-64 rounded-xl border-border/50 bg-background pl-8 text-xs placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/50" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Filter className="size-3.5 text-primary" />
              Lead Status
            </label>
            <Select value={initialLeadStatus || "all"} onValueChange={(v) => updateParams({ leadStatus: !v || v === "all" ? undefined : v })}>
              <SelectTrigger className="w-40 rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={() => { setSearchInput(""); updateParams({ search: undefined, leadStatus: undefined }); }}>
              <X className="size-3.5" data-icon="inline-start" /> Reset
            </Button>
          )}
        </div>
      </div>

      <GlassCard interactive={false}>
        <CardContent className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" /></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Deal Value</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No attributed leads match these filters.</TableCell></TableRow>
              )}
              {items.map((lead) => (
                <TableRow key={lead._id} data-state={selected.has(lead._id) ? "selected" : undefined}>
                  <TableCell><Checkbox checked={selected.has(lead._id)} onCheckedChange={() => toggleOne(lead._id)} aria-label={`Select ${lead.name}`} /></TableCell>
                  <TableCell>
                    <Link href={`/dealflow-ai/submissions/${lead.category}/${lead._id}`} className="font-medium hover:underline">{lead.name}</Link>
                    <div className="text-xs text-muted-foreground">{lead.email || lead.phone}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{getCategoryLabel(lead.category as CategorySlug)}</TableCell>
                  <TableCell>{lead.campaign ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-muted-foreground">{getLeadSourceLabel(lead.source)}</TableCell>
                  <TableCell><StatusBadge status={lead.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{typeof lead.dealValue === "number" ? formatCurrency(lead.dealValue) : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(lead.createdAt)}</TableCell>
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
              <ChevronLeft className="size-3.5" data-icon="inline-start" /> Previous
            </Link>
            <Link href={pageHref(Math.min(page + 1, totalPages))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-disabled={page >= totalPages} tabIndex={page >= totalPages ? -1 : undefined}>
              Next <ChevronRight className="size-3.5" data-icon="inline-end" />
            </Link>
          </div>
        </div>
      )}

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
              <Popover open={assignOpen} onOpenChange={setAssignOpen}>
                <PopoverTrigger
                  render={
                    <Button type="button" size="sm">
                      <Tag className="size-3.5" data-icon="inline-start" /> Assign campaign
                    </Button>
                  }
                />
                <PopoverContent align="center" className="w-72">
                  <PopoverHeader><PopoverTitle>Assign to campaign</PopoverTitle></PopoverHeader>
                  <div className="space-y-2">
                    <Select value={assignPlatform} onValueChange={(v) => v && setAssignPlatform(v as CampaignPlatform)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CAMPAIGN_PLATFORMS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>{p.shortLabel}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input value={assignCampaign} onChange={(e) => setAssignCampaign(e.target.value)} placeholder="Campaign name (optional)" />
                    <Button type="button" size="sm" className="w-full" onClick={runAssign} disabled={pending}>
                      Apply to {selected.size} lead{selected.size === 1 ? "" : "s"}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
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
