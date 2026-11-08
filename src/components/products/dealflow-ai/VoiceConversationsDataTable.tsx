"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, ChevronsUpDown, Eye, Filter, Calendar, Mic, Monitor, Search, Trash2, X } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatDateTime } from "@/lib/utils";
import VoiceExportButton from "@/components/products/dealflow-ai/VoiceExportButton";
import { bulkDeleteVoiceConversationsAction } from "@/app/(products)/sitecraft-ai/(protected)/chatbot/actions";
import type { VoiceConversationRow } from "@/lib/voice-conversations";

const DEVICE_OPTIONS = ["mobile", "tablet", "desktop", "bot", "unknown"];
const DURATION_OPTIONS = [
  { value: "0", label: "Any length" },
  { value: "30", label: "30s+" },
  { value: "60", label: "1 min+" },
  { value: "180", label: "3 min+" },
];

function secs(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

export default function VoiceConversationsDataTable({
  items,
  total,
  page,
  totalPages,
  initialSearch,
  initialDevice,
  initialMinDuration,
  initialDateFrom,
  initialDateTo,
  initialSortBy,
  initialSortDir,
}: {
  items: VoiceConversationRow[];
  total: number;
  page: number;
  totalPages: number;
  initialSearch: string;
  initialDevice: string;
  initialMinDuration: string;
  initialDateFrom: string;
  initialDateTo: string;
  initialSortBy: string;
  initialSortDir: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = React.useTransition();
  const [searchInput, setSearchInput] = React.useState(initialSearch);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const updateParams = React.useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      params.delete("page");
      startTransition(() => router.replace(`${pathname}?${params.toString()}`));
    },
    [pathname, router, searchParams]
  );

  React.useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== initialSearch) updateParams({ search: searchInput || undefined });
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput, initialSearch, updateParams]);

  function toggleSort(field: string) {
    const dir = initialSortBy === field && initialSortDir === "desc" ? "asc" : "desc";
    updateParams({ sortBy: field, sortDir: dir });
  }
  function sortIcon(field: string) {
    if (initialSortBy !== field) return <ChevronsUpDown className="size-3 opacity-50" />;
    return initialSortDir === "desc" ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />;
  }

  const allSelected = items.length > 0 && items.every((i) => selected.has(i._id));
  function toggleOne(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function handleBulkDelete() {
    const res = await bulkDeleteVoiceConversationsAction([...selected]);
    toast.success(`Deleted ${res.deleted} conversation${res.deleted === 1 ? "" : "s"}`);
    setSelected(new Set());
    router.refresh();
  }

  const hasActiveFilters = Boolean(initialSearch || initialDevice || initialMinDuration || initialDateFrom || initialDateTo);

  function pageParams(target: number): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(target));
    return params.toString();
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3 border-b border-border/40 pb-4">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Mic className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">Search &amp; Filters</h3>
            <p className="text-xs text-muted-foreground">Search and narrow voice sessions by device, duration, and date</p>
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
                placeholder="Session ID or spoken text"
                className="h-8 w-64 rounded-xl border-border/50 bg-background pl-8 text-xs placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/50"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Monitor className="size-3.5 text-primary" />
              Device
            </label>
            <Select value={initialDevice || "all"} onValueChange={(v) => updateParams({ device: !v || v === "all" ? undefined : v })}>
              <SelectTrigger className="w-32 rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All devices</SelectItem>
                {DEVICE_OPTIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d[0].toUpperCase() + d.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Filter className="size-3.5 text-primary" />
              Duration
            </label>
            <Select value={initialMinDuration || "0"} onValueChange={(v) => updateParams({ minDuration: !v || v === "0" ? undefined : v })}>
              <SelectTrigger className="w-32 rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar className="size-3.5 text-primary" />
              From
            </label>
            <Input type="date" value={initialDateFrom} onChange={(e) => updateParams({ dateFrom: e.target.value || undefined })} className="w-auto rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar className="size-3.5 text-primary" />
              To
            </label>
            <Input type="date" value={initialDateTo} onChange={(e) => updateParams({ dateTo: e.target.value || undefined })} className="w-auto rounded-xl border-border/50 bg-background text-xs focus-visible:border-primary focus-visible:ring-primary/50" />
          </div>
          {hasActiveFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={() => { setSearchInput(""); router.replace(pathname); }}>
              <X className="size-3.5" data-icon="inline-start" />
              Reset
            </Button>
          )}
          <div className="ml-auto">
            <VoiceExportButton
              params={{
                search: initialSearch,
                device: initialDevice,
                minDuration: initialMinDuration,
                dateFrom: initialDateFrom,
                dateTo: initialDateTo,
              }}
            />
          </div>
        </div>
      </div>

      <GlassCard interactive={false}>
        <CardContent className="max-h-[65vh] overflow-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i._id)))}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Conversation</TableHead>
                <TableHead>Visitor</TableHead>
                <TableHead>
                  <button className="inline-flex items-center gap-1" onClick={() => toggleSort("durationMs")}>
                    Duration {sortIcon("durationMs")}
                  </button>
                </TableHead>
                <TableHead>
                  <button className="inline-flex items-center gap-1" onClick={() => toggleSort("voiceMessageCount")}>
                    Voice / Text {sortIcon("voiceMessageCount")}
                  </button>
                </TableHead>
                <TableHead>Device</TableHead>
                <TableHead>
                  <button className="inline-flex items-center gap-1" onClick={() => toggleSort("startedAt")}>
                    Started {sortIcon("startedAt")}
                  </button>
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    No voice conversations match these filters.
                  </TableCell>
                </TableRow>
              )}
              {items.map((row) => (
                <TableRow
                  key={row._id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/commandos/chatbot/voice-conversations/${row.sessionId}`)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(row._id)} onCheckedChange={() => toggleOne(row._id)} aria-label="Select" />
                  </TableCell>
                  <TableCell className="max-w-[260px]">
                    <p className="truncate text-sm">{row.preview}</p>
                    <span className="text-[11px] text-muted-foreground">{row.sessionId.slice(0, 8)}…</span>
                  </TableCell>
                  <TableCell className="max-w-[160px]">
                    {row.visitorName || row.visitorEmail ? (
                      <>
                        <p className="truncate text-sm font-medium">{row.visitorName ?? "—"}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{row.visitorEmail ?? ""}</p>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground/70">Anonymous</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{secs(row.durationMs)}</TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">
                    {row.voiceMessageCount} / {row.textMessageCount}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.device}
                    <span className="block text-[11px]">{row.browser}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDateTime(row.startedAt)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Link
                      href={`/commandos/chatbot/voice-conversations/${row.sessionId}`}
                      className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                      aria-label="Open"
                    >
                      <Eye className="size-3.5" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} conversation{total === 1 ? "" : "s"}</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Link href={`${pathname}?${pageParams(Math.max(1, page - 1))}`} className={buttonVariants({ variant: "outline", size: "sm" })} aria-disabled={page <= 1}>
              Previous
            </Link>
            <span>Page {page} of {totalPages}</span>
            <Link href={`${pathname}?${pageParams(Math.min(totalPages, page + 1))}`} className={buttonVariants({ variant: "outline", size: "sm" })} aria-disabled={page >= totalPages}>
              Next
            </Link>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-3 rounded-full border border-border/60 bg-card/95 px-4 py-2 shadow-xl backdrop-blur-xl"
          >
            <span className="text-sm font-medium">{selected.size} selected</span>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="destructive" size="sm">
                    <Trash2 className="size-3.5" data-icon="inline-start" />
                    Delete
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selected.size} voice conversations?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the sessions, their voice messages and every stored audio file.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground" aria-label="Clear">
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
