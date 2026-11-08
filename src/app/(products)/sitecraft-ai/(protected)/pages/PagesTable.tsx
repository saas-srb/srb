"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Eye, FileText, Pencil, SearchX, Rocket, Loader2, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/products/sitecraft-ai/ui/ConfirmProvider";
import { bulkPublishPagesAction } from "./actions";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { SearchInput, FilterChips, ToolbarSelect } from "@/components/products/sitecraft-ai/ui/ListToolbar";
import { ContentStatusBadge, PendingChangesBadge } from "@/components/products/sitecraft-ai/ui/StatusBadge";
import EmptyState from "@/components/products/sitecraft-ai/ui/EmptyState";
import { SITE_AREAS, areaOf, areaLabel, timeAgo } from "@/lib/products/sitecraft-ai/site-areas";
import { cn } from "@/lib/utils";

export interface PageRow {
  id: string;
  title: string;
  path: string;
  status: "draft" | "published" | "archived";
  version: string | null;
  pending: boolean;
  updatedAt: string;
}

type StatusFilter = "all" | "published" | "draft" | "pending" | "archived";
const SORTS = [
  { value: "updated", label: "Recently edited" },
  { value: "title", label: "Title A–Z" },
  { value: "path", label: "URL path" },
];

const PAGE_SIZE = 25;

export default function PagesTable({ rows, canPublish = false }: { rows: PageRow[]; canPublish?: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pageNo, setPageNo] = useState(1);
  const [publishing, startPublish] = useTransition();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>((params.get("status") as StatusFilter) || "all");
  const [sort, setSort] = useState("updated");
  const area = params.get("area") ?? "all";

  const setArea = (value: string) => {
    setPageNo(1);
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete("area"); else next.set("area", value);
    router.replace(`/sitecraft-ai/pages${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  const inArea = useMemo(() => (area === "all" ? rows : rows.filter((r) => areaOf(r.path) === area)), [rows, area]);
  const counts = {
    all: inArea.length,
    published: inArea.filter((r) => r.status === "published").length,
    draft: inArea.filter((r) => r.status === "draft").length,
    pending: inArea.filter((r) => r.pending).length,
    archived: inArea.filter((r) => r.status === "archived").length,
  };
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inArea
      .filter((r) => (status === "all" ? true : status === "pending" ? r.pending : r.status === status))
      .filter((r) => !q || r.title.toLowerCase().includes(q) || r.path.toLowerCase().includes(q))
      .sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title) : sort === "path" ? a.path.localeCompare(b.path) : +new Date(b.updatedAt) - +new Date(a.updatedAt)));
  }, [inArea, status, query, sort]);
  const areas = SITE_AREAS.filter((a) => rows.some((r) => areaOf(r.path) === a.key));
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(pageNo, pageCount);
  const paged = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const allOnPage = paged.length > 0 && paged.every((r) => selected.has(r.id));
  const toggle = (id: string, on: boolean) => setSelected((prev) => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; });
  const togglePage = (on: boolean) => setSelected((prev) => { const next = new Set(prev); for (const r of paged) { if (on) next.add(r.id); else next.delete(r.id); } return next; });
  const cols = canPublish ? "md:grid-cols-[20px_minmax(0,1fr)_170px_120px_112px]" : "md:grid-cols-[minmax(0,1fr)_170px_120px_112px]";

  const bulkPublish = async () => {
    const chosen = rows.filter((r) => selected.has(r.id));
    const publishable = chosen.filter((r) => r.pending || r.status === "draft").length;
    if (publishable === 0) { toast.info("The selected pages are already up to date."); return; }
    if (!(await confirm({ title: `Publish ${publishable} page${publishable === 1 ? "" : "s"}?`, description: `Their current drafts go live on the website straight away.${chosen.length > publishable ? ` ${chosen.length - publishable} selected page${chosen.length - publishable === 1 ? " is" : "s are"} already up to date and will be skipped.` : ""}`, confirmLabel: "Publish" }))) return;
    startPublish(async () => {
      const res = await bulkPublishPagesAction([...selected]);
      if (!res.ok) { toast.error(res.error); return; }
      if (res.published) toast.success(`${res.published} page${res.published === 1 ? "" : "s"} published`);
      for (const f of res.failed) toast.error(`${f.title}: ${f.error}`);
      setSelected(new Set());
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          value={status}
          onChange={(v) => { setStatus(v); setPageNo(1); }}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "published", label: "Published", count: counts.published },
            { value: "draft", label: "Draft", count: counts.draft },
            { value: "pending", label: "Unpublished changes", count: counts.pending },
            ...(counts.archived ? [{ value: "archived" as const, label: "Archived", count: counts.archived }] : []),
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={(v) => { setQuery(v); setPageNo(1); }} placeholder="Search title or URL…" />
          <ToolbarSelect label="Site area" icon={false} value={area} onChange={setArea} options={[{ value: "all", label: "All site areas" }, ...areas.map((a) => ({ value: a.key, label: a.label }))]} />
          <ToolbarSelect label="Sort by" value={sort} onChange={setSort} options={SORTS} />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={query ? SearchX : FileText}
          title={query ? "No pages match your search" : "No pages here"}
          description={query ? `Nothing matches “${query}” with the current filters.` : "Try a different status or site area."}
        />
      ) : (
        <>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
            <span className="font-medium text-foreground">{selected.size} selected</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">Bulk actions:</span>
            <Button size="sm" onClick={bulkPublish} disabled={publishing}>
              {publishing ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />} Publish
            </Button>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(new Set())}><X className="size-3.5" /> Clear selection</Button>
          </div>
        )}
        <GlassCard interactive={false} className="gap-0 overflow-hidden p-0 py-0">
          <div className={cn("hidden gap-4 border-b border-border/60 bg-muted/30 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid", cols)}>
            {canPublish && <input type="checkbox" aria-label="Select all pages on this screen" className="size-4 accent-[var(--primary)]" checked={allOnPage} onChange={(e) => togglePage(e.target.checked)} />}
            <span>Page</span>
            <span>Status</span>
            <span>Last edited</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-border/50">
            {paged.map((r) => (
              <li key={r.id} className={cn("group grid grid-cols-1 gap-2 px-4 py-3 transition-colors hover:bg-primary/[0.03] md:items-center md:gap-4", cols, selected.has(r.id) && "bg-primary/[0.04]")}>
                {canPublish && <input type="checkbox" aria-label={`Select ${r.title}`} className="hidden size-4 accent-[var(--primary)] md:block" checked={selected.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} />}
                <Link href={`/sitecraft-ai/pages/${r.id}`} className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="size-4" /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">{r.title}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">{r.path} · {areaLabel(areaOf(r.path))}</span>
                  </span>
                </Link>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ContentStatusBadge status={r.status} version={r.version} />
                  {r.pending && r.status === "published" && <PendingChangesBadge />}
                </div>
                <span className="text-xs text-muted-foreground" title={new Date(r.updatedAt).toLocaleString()} suppressHydrationWarning>{timeAgo(r.updatedAt)}</span>
                <div className="flex items-center gap-1 md:justify-end">
                  <IconAction href={`/sitecraft-ai/pages/${r.id}`} label="Edit"><Pencil className="size-3.5" /></IconAction>
                  <IconAction href={`/sitecraft-ai/pages/${r.id}/preview`} label="Preview draft" external><Eye className="size-3.5" /></IconAction>
                  {r.status === "published" && <IconAction href={r.path} label="View live page" external><ExternalLink className="size-3.5" /></IconAction>}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
            <span>
              Showing {(current - 1) * PAGE_SIZE + 1}–{(current - 1) * PAGE_SIZE + paged.length} of {visible.length}
              {visible.length !== rows.length ? ` (filtered from ${rows.length})` : ""} pages
            </span>
            {pageCount > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-xs" onClick={() => setPageNo(current - 1)} disabled={current === 1} aria-label="Previous page"><ChevronLeft className="size-3.5" /></Button>
                <span className="px-1 tabular-nums">Page {current} of {pageCount}</span>
                <Button variant="ghost" size="icon-xs" onClick={() => setPageNo(current + 1)} disabled={current === pageCount} aria-label="Next page"><ChevronRight className="size-3.5" /></Button>
              </div>
            )}
          </div>
        </GlassCard>
        </>
      )}
    </div>
  );
}

function IconAction({ href, label, external, children }: { href: string; label: string; external?: boolean; children: React.ReactNode }) {
  const className = cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground hover:text-primary");
  const link = external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={className}>{children}</a>
  ) : (
    <Link href={href} aria-label={label} className={className}>{children}</Link>
  );
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
