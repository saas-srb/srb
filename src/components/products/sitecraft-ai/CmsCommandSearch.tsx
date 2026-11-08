"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, Database, LayoutGrid, Loader2, CornerDownLeft } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ContentStatusBadge } from "@/components/products/sitecraft-ai/ui/StatusBadge";
import { cmsSearchIndexAction, type CmsSearchEntry } from "@/app/(products)/sitecraft-ai/(protected)/actions";
import { cn } from "@/lib/utils";

/** CMS screens, always searchable (no server round-trip). */
const SCREENS: CmsSearchEntry[] = [
  ["Dashboard", "/sitecraft-ai"], ["Pages", "/sitecraft-ai/pages"], ["Services pages", "/sitecraft-ai/pages?area=services"], ["Blog Posts", "/sitecraft-ai/collections/blog"],
  ["Careers (jobs)", "/sitecraft-ai/collections/jobs"], ["Hiring Models", "/sitecraft-ai/collections/engagement"], ["Products", "/sitecraft-ai/collections/products"],
  ["Header & Navigation", "/sitecraft-ai/navigation"], ["Footer", "/sitecraft-ai/footer"], ["Site Identity", "/sitecraft-ai/site-identity"], ["Media Library", "/sitecraft-ai/media"],
  ["Forms", "/sitecraft-ai/forms"], ["Themes", "/sitecraft-ai/theme"], ["SEO Overview", "/sitecraft-ai/seo"], ["Settings", "/sitecraft-ai/settings"],
].map(([title, href]) => ({ kind: "screen" as const, title, subtitle: "CMS screen", href }));

const KIND_ICON = { page: FileText, record: Database, screen: LayoutGrid } as const;

/** ⌘K / Ctrl+K search across pages, collection records and CMS screens. */
export default function CmsCommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<CmsSearchEntry[] | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open && index === null) cmsSearchIndexAction().then(setIndex).catch(() => setIndex([]));
  }, [open, index]);

  const results = useMemo(() => {
    const all = [...SCREENS, ...(index ?? [])];
    const q = query.trim().toLowerCase();
    if (!q) return all.filter((e) => e.kind === "screen").slice(0, 8);
    const words = q.split(/\s+/);
    return all
      .map((e) => {
        const hay = `${e.title} ${e.subtitle}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return null;
        const score = (e.title.toLowerCase().startsWith(q) ? 0 : 1) + (e.kind === "screen" ? 0 : 1);
        return { e, score };
      })
      .filter((x): x is { e: CmsSearchEntry; score: number } => x !== null)
      .sort((a, b) => a.score - b.score || a.e.title.localeCompare(b.e.title))
      .slice(0, 30)
      .map((x) => x.e);
  }, [query, index]);

  const go = (entry: CmsSearchEntry | undefined) => {
    if (!entry) return;
    setOpen(false);
    setQuery("");
    router.push(entry.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(results[active]); }
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search the CMS"
        // Phones: a round icon button like the other header icons. md and up: the wide pill.
        className="flex size-9 shrink-0 items-center justify-center gap-2 rounded-full border border-border/60 bg-muted/30 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary md:h-9 md:w-full md:max-w-sm md:justify-start md:bg-muted/40 md:px-3"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden truncate md:inline">Search pages, posts, jobs…</span>
        <kbd className="ml-auto hidden rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] sm:inline">⌘K</kbd>
      </button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
        <DialogContent className="max-w-xl overflow-hidden" showCloseButton={false}>
          <DialogTitle className="sr-only">Search the CMS</DialogTitle>
          <DialogDescription className="sr-only">Find a page, collection record or CMS screen</DialogDescription>
          <div className="flex items-center gap-2 border-b border-border/60 px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onKeyDown}
              placeholder="Search pages, blog posts, jobs, products, screens…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {open && index === null && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
          </div>
          <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
            {!query && <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Jump to</p>}
            {results.length === 0 && query && index === null ? (
              <p className="flex items-center justify-center gap-2 px-3 py-8 text-center text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading pages and records…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">No matches for “{query}”.</p>
            ) : (
              results.map((r, i) => {
                const Icon = KIND_ICON[r.kind];
                return (
                  <button
                    key={r.href}
                    type="button"
                    data-index={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors", i === active ? "bg-primary/10" : "hover:bg-muted/50")}
                  >
                    <Icon className={cn("size-4 shrink-0", i === active ? "text-primary" : "text-muted-foreground")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{r.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.subtitle}</span>
                    </span>
                    {r.status && <ContentStatusBadge status={r.status} className="shrink-0" />}
                    {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />}
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
