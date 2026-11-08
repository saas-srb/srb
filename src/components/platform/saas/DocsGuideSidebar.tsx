"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, ChevronDown, Clock, Search, X } from "lucide-react";

export type GuideGroup = { name: string; items: { slug: string; title: string; readMinutes: number }[] };

/** Every general guide, grouped by category: searchable, collapsible, numbered, with the one being read highlighted and in view. */
export default function DocsGuideSidebar({ groups, activeSlug, activeCategory }: { groups: GuideGroup[]; activeSlug: string; activeCategory: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set([activeCategory]));
  const boxRef = useRef<HTMLDivElement>(null);
  const query = q.trim().toLowerCase();

  const shown = useMemo(() => (query ? groups.map((g) => ({ ...g, items: g.items.filter((x) => x.title.toLowerCase().includes(query)) })).filter((g) => g.items.length) : groups), [groups, query]);

  useEffect(() => {
    const box = boxRef.current;
    const el = box?.querySelector<HTMLElement>('[aria-current="page"]');
    if (box && el) box.scrollTop = Math.max(0, el.offsetTop - box.offsetTop - box.clientHeight / 2 + el.clientHeight / 2);
  }, [activeSlug]);

  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
      <div className="border-b border-border/50 bg-gradient-to-br from-primary/[0.10] via-card to-brand-accent/[0.10] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-black"><BookOpen className="h-4 w-4 text-primary" />All guides</p>
          <Link href="/docs" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"><ArrowLeft className="h-3 w-3" />Docs home</Link>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Find a guide" aria-label="Find a guide" className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-8 text-sm outline-none focus:border-primary" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
        </div>
      </div>
      <div ref={boxRef} className="relative max-h-[calc(100vh-17rem)] space-y-1.5 overflow-y-auto p-2.5 [scrollbar-width:thin]">
        {shown.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No guide matches “{q}”.</p>}
        {shown.map((g) => {
          const isOpen = query ? true : open.has(g.name);
          const current = g.name === activeCategory;
          return (
            <div key={g.name} className={`rounded-2xl border ${current ? "border-primary/30 bg-primary/[0.04]" : "border-transparent"}`}>
              <button type="button" onClick={() => toggle(g.name)} aria-expanded={isOpen} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-muted/50">
                <span className="min-w-0 flex-1 truncate text-sm font-black">{g.name}</span>
                <ChevronDown className={`h-4 w-4 flex-none text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <ul className="space-y-0.5 px-2 pb-2">
                  {g.items.map((x, n) => {
                    const active = x.slug === activeSlug;
                    return (
                      <li key={x.slug}>
                        <Link data-product-link href={`/docs/${x.slug}`} aria-current={active ? "page" : undefined} className={`group flex items-start gap-3 rounded-xl px-2.5 py-2 transition-colors ${active ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "hover:bg-muted/60"}`}>
                          <span className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-lg text-[11px] font-black ${active ? "bg-white/20" : "bg-primary/10 text-primary"}`}>{n + 1}</span>
                          <span className="min-w-0 flex-1"><span className="block text-sm font-bold leading-snug">{x.title}</span><span className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}><Clock className="h-3 w-3" />{x.readMinutes} min</span></span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
