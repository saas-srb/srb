"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, EyeOff, Image as ImageIcon, SearchX, Braces } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { SearchInput, FilterChips } from "@/components/products/sitecraft-ai/ui/ListToolbar";
import EmptyState from "@/components/products/sitecraft-ai/ui/EmptyState";
import { cn } from "@/lib/utils";
import { seoIssues, SEO_TITLE_LENGTH, SEO_DESCRIPTION_LENGTH } from "@/lib/products/sitecraft-ai/seo-checks";

export interface SeoRow {
  id: string;
  path: string;
  pageTitle: string;
  title: string;
  description: string;
  canonical: string | null;
  noindex: boolean;
  hasImage: boolean;
  jsonLd: number;
  pending: boolean;
}

const TITLE = SEO_TITLE_LENGTH;
const DESC = SEO_DESCRIPTION_LENGTH;
const issuesOf = seoIssues;

function Length({ value, min, max }: { value: string; min: number; max: number }) {
  const n = value.length;
  const ok = n >= min && n <= max;
  return <span className={cn("tabular-nums", !n ? "text-destructive" : ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>{n}</span>;
}

type Filter = "all" | "issues" | "ok" | "noindex";

export default function SeoTable({ rows }: { rows: SeoRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const withIssues = useMemo(() => rows.map((r) => ({ ...r, issues: issuesOf(r) })), [rows]);
  const counts = {
    all: rows.length,
    issues: withIssues.filter((r) => r.issues.length).length,
    ok: withIssues.filter((r) => !r.issues.length).length,
    noindex: rows.filter((r) => r.noindex).length,
  };
  const visible = withIssues.filter((r) => {
    if (filter === "issues" && !r.issues.length) return false;
    if (filter === "ok" && r.issues.length) return false;
    if (filter === "noindex" && !r.noindex) return false;
    const q = query.trim().toLowerCase();
    return !q || r.path.toLowerCase().includes(q) || r.title.toLowerCase().includes(q) || r.pageTitle.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All pages", count: counts.all },
            { value: "issues", label: "Needs attention", count: counts.issues },
            { value: "ok", label: "Looks good", count: counts.ok },
            { value: "noindex", label: "Not indexed", count: counts.noindex },
          ]}
        />
        <SearchInput value={query} onChange={setQuery} placeholder="Search URL or title…" />
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={SearchX} title="Nothing to show" description="No pages match the current filter." />
      ) : (
        <GlassCard interactive={false} className="gap-0 overflow-hidden p-0 py-0">
          <ul className="divide-y divide-border/50">
            {visible.map((r) => (
              <li key={r.id}>
                <Link href={`/sitecraft-ai/pages/${r.id}#seo`} className="group block px-4 py-3 transition-colors hover:bg-primary/[0.03]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-muted-foreground">{r.path}</p>
                      <p className="mt-0.5 truncate text-sm font-medium text-primary group-hover:underline">{r.title || <span className="text-destructive">No SEO title</span>}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.description || <span className="text-destructive">No meta description</span>}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5 text-xs text-muted-foreground">
                      <span>Title <Length value={r.title} {...TITLE} /> · Description <Length value={r.description} {...DESC} /></span>
                      <span className="flex items-center gap-2">
                        {r.noindex && <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><EyeOff className="size-3.5" /> noindex</span>}
                        <span className={cn("flex items-center gap-1", !r.hasImage && "opacity-50")} title={r.hasImage ? "Has a social share image" : "No social share image"}><ImageIcon className="size-3.5" /> {r.hasImage ? "image" : "no image"}</span>
                        <span className="flex items-center gap-1" title="Structured data blocks"><Braces className="size-3.5" /> {r.jsonLd}</span>
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.issues.length === 0 ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="size-3.5" /> Looks good</span>
                    ) : (
                      r.issues.map((i) => (
                        <span key={i} className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400"><AlertTriangle className="size-3" /> {i}</span>
                      ))
                    )}
                    {r.pending && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">draft has unpublished changes</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
    </div>
  );
}
