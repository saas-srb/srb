"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CornerDownLeft, Database, LayoutGrid, Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { usePanelMeta } from "@/components/platform/PanelsProvider";
import { hubSearchAction } from "@/app/(products)/commandos/hub-actions";
import { cn } from "@/lib/utils";

interface Entry {
  kind: "screen" | "record";
  title: string;
  subtitle: string;
  href: string;
}

/**
 * ⌘K / Ctrl+K search for the product you are in: every page in its sidebar (so exactly what this person may open) plus
 * the records that live in this product (leads, clients, projects, tasks, people, invoices) when the Workspace can find them.
 */
export default function PanelSearch({ variant = "pill" }: { variant?: "pill" | "field" }) {
  const router = useRouter();
  const pathname = usePathname();
  const panel = pathname.split("/")[1] ?? "";
  const name = usePanelMeta(panel)?.name ?? "this product";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [screens, setScreens] = useState<Entry[]>([]);
  const [records, setRecords] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // The product's own sidebar is the list of screens this person can open.
  useEffect(() => {
    if (!open) return;
    const seen = new Set<string>();
    const found: Entry[] = [];
    document.querySelectorAll<HTMLAnchorElement>(panel === "workspace" ? `aside a[href^="/"]` : `aside a[href^="/${panel}"]`).forEach((a) => {
      const href = a.getAttribute("href") ?? "";
      const title = a.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (!title || seen.has(href)) return;
      seen.add(href);
      found.push({ kind: "screen", title, subtitle: `${name} page`, href });
    });
    setScreens(found);
  }, [open, panel, name]);

  function onQuery(value: string) {
    setQuery(value);
    setActive(0);
    if (timer.current) clearTimeout(timer.current);
    const q = value.trim();
    const ticket = ++latest.current;
    if (q.length < 2) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const hits = await hubSearchAction(q);
        if (ticket !== latest.current) return;
        setRecords(
          hits
            .filter((h) => panel === "workspace" || h.url.startsWith(`/${panel}`))
            .map((h) => ({ kind: "record" as const, title: h.title, subtitle: `${h.type[0].toUpperCase()}${h.type.slice(1)}${h.subtitle ? ` · ${h.subtitle}` : ""}`, href: h.url })),
        );
      } catch {
        if (ticket === latest.current) setRecords([]);
      } finally {
        if (ticket === latest.current) setLoading(false);
      }
    }, 250);
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return screens.slice(0, 10);
    const words = q.split(/\s+/);
    const matched = screens.filter((s) => words.every((w) => s.title.toLowerCase().includes(w)));
    return [...matched, ...records].slice(0, 30);
  }, [query, screens, records]);

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    setOpen(false);
    setQuery("");
    setRecords([]);
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
        aria-label={`Search ${name}`}
        className={cn(
          "flex items-center gap-2 border border-border/60 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground",
          // Phones: a round icon button like the other header icons. md and up: the wide pill (or field).
          "size-9 shrink-0 justify-center rounded-full bg-muted/30 hover:bg-primary/10 hover:text-primary",
          variant === "pill" ? "md:h-9 md:w-full md:max-w-sm md:justify-start md:bg-muted/40 md:px-3" : "md:h-10 md:w-80 md:max-w-full md:justify-start md:rounded-xl md:bg-background md:px-3",
        )}
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden truncate md:inline">Search {name} pages, records…</span>
        <kbd className="ml-auto hidden rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] sm:inline">⌘K</kbd>
      </button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setQuery(""); setRecords([]); } }}>
        <DialogContent className="top-[12%] max-w-xl translate-y-0 overflow-hidden" showCloseButton={false}>
          <DialogTitle className="sr-only">Search {name}</DialogTitle>
          <DialogDescription className="sr-only">Find a page or record in {name}</DialogDescription>
          <div className="flex items-center gap-2 border-b border-border/60 px-4">
            {loading ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" /> : <Search className="size-4 shrink-0 text-muted-foreground" />}
            <input
              autoFocus
              autoComplete="off"
              spellCheck={false}
              maxLength={80}
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Search ${name} pages and records…`}
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
            {!query && <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Jump to</p>}
            {results.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">{loading ? "Searching…" : query ? `No matches for “${query}”.` : "Nothing to show."}</p>
            ) : (
              results.map((r, i) => {
                const Icon = r.kind === "screen" ? LayoutGrid : Database;
                return (
                  <button
                    key={`${r.kind}:${r.href}`}
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
