"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Database, ExternalLink, Pencil, SearchX } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { buttonVariants } from "@/components/ui/button";
import { SearchInput, FilterChips, ToolbarSelect } from "@/components/products/sitecraft-ai/ui/ListToolbar";
import { ContentStatusBadge, PendingChangesBadge } from "@/components/products/sitecraft-ai/ui/StatusBadge";
import EmptyState from "@/components/products/sitecraft-ai/ui/EmptyState";
import { timeAgo } from "@/lib/products/sitecraft-ai/site-areas";
import { cn } from "@/lib/utils";

export interface RecordRow {
  slug: string;
  title: string;
  path: string | null;
  state: "published" | "draft" | "archived";
  pending: boolean;
  updatedAt: string | null;
}

type Filter = "all" | "published" | "draft" | "pending" | "archived";

export default function RecordsTable({ collection, rows, singular }: { collection: string; rows: RecordRow[]; singular: string }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState("order");
  const counts = {
    all: rows.length,
    published: rows.filter((r) => r.state === "published").length,
    draft: rows.filter((r) => r.state === "draft").length,
    pending: rows.filter((r) => r.pending).length,
    archived: rows.filter((r) => r.state === "archived").length,
  };
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows
      .filter((r) => (filter === "all" ? true : filter === "pending" ? r.pending : r.state === filter))
      .filter((r) => !q || r.title.toLowerCase().includes(q) || r.slug.includes(q));
    if (sort === "title") return [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "updated") return [...list].sort((a, b) => +new Date(b.updatedAt ?? 0) - +new Date(a.updatedAt ?? 0));
    return list; // "order" — the order the website lists them in
  }, [rows, filter, query, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "published", label: "Published", count: counts.published },
            { value: "draft", label: "Draft", count: counts.draft },
            { value: "pending", label: "Unpublished changes", count: counts.pending },
            ...(counts.archived ? [{ value: "archived" as const, label: "Archived", count: counts.archived }] : []),
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder={`Search ${singular.toLowerCase()}s…`} />
          <ToolbarSelect label="Sort by" value={sort} onChange={setSort} options={[{ value: "order", label: "Website order" }, { value: "title", label: "Title A–Z" }, { value: "updated", label: "Recently edited" }]} />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={query ? SearchX : Database}
          title={query ? "No matches" : rows.length === 0 ? `No ${singular.toLowerCase()}s yet` : "Nothing with this status"}
          description={query ? `Nothing matches “${query}”.` : rows.length === 0 ? `Create the first ${singular.toLowerCase()} with “New ${singular}”.` : "Try another status."}
        />
      ) : (
        <GlassCard interactive={false} className="gap-0 overflow-hidden p-0 py-0">
          <div className="hidden grid-cols-[minmax(0,1fr)_190px_120px_80px] gap-4 border-b border-border/60 bg-muted/30 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span>{singular}</span>
            <span>Status</span>
            <span>Last edited</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-border/50">
            {visible.map((r) => (
              <li key={r.slug} className="group grid grid-cols-1 gap-2 px-4 py-3 transition-colors hover:bg-primary/[0.03] md:grid-cols-[minmax(0,1fr)_190px_120px_80px] md:items-center md:gap-4">
                <Link href={`/sitecraft-ai/collections/${collection}/${r.slug}`} className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">{r.title || r.slug}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{r.path ?? r.slug}</span>
                </Link>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ContentStatusBadge status={r.state} />
                  {r.pending && r.state === "published" && <PendingChangesBadge />}
                </div>
                <span className="text-xs text-muted-foreground" suppressHydrationWarning>{r.updatedAt ? timeAgo(r.updatedAt) : "—"}</span>
                <div className="flex items-center gap-1 md:justify-end">
                  <Link href={`/sitecraft-ai/collections/${collection}/${r.slug}`} aria-label="Edit" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground hover:text-primary")}>
                    <Pencil className="size-3.5" />
                  </Link>
                  {r.path && r.state === "published" && (
                    <a href={r.path} target="_blank" rel="noopener noreferrer" aria-label="View on the website" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground hover:text-primary")}>
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">Showing {visible.length} of {rows.length}</div>
        </GlassCard>
      )}
    </div>
  );
}
