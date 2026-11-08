"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, ChevronDown, Search, X } from "lucide-react";
import type { IconKey } from "@/lib/platform/saas/content";
import { productDocsPath } from "@/lib/platform/saas/product-routes";
import ProductLogo from "@/components/products/ProductLogo";

export interface DocsNavPanel {
  key: string;
  name: string;
  icon: IconKey;
  groups: { name: string; items: { slug: string; name: string }[] }[];
}

/** Every product and every guide in one collapsible tree, so readers never have to go back to the docs hub. */
export default function DocsNav({ panels, currentPanel, currentSlug }: { panels: DocsNavPanel[]; currentPanel: string; currentSlug: string }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set([currentPanel]));
  const [q, setQ] = useState("");
  const activeRef = useRef<HTMLAnchorElement>(null);
  const query = q.trim().toLowerCase();

  useEffect(() => { activeRef.current?.scrollIntoView({ block: "center" }); }, [currentSlug]);

  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <nav aria-label="All documentation" className="flex max-h-[inherit] flex-col">
      <div className="border-b border-border/50 bg-gradient-to-br from-primary/[0.10] via-background to-brand-accent/[0.10] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-black"><BookOpen className="h-4 w-4 text-primary" />All documentation</p>
          <Link href="/docs" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"><ArrowLeft className="h-3 w-3" />Docs home</Link>
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search the guides" aria-label="Search guides" className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-8 text-sm outline-none focus:border-primary" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
        </label>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5 [scrollbar-width:thin]">
        {panels.map((p) => {
          const groups = query ? p.groups.map((g) => ({ ...g, items: g.items.filter((x) => x.name.toLowerCase().includes(query) || p.name.toLowerCase().includes(query)) })).filter((g) => g.items.length) : p.groups;
          if (query && !groups.length) return null;
          const isOpen = query ? true : open.has(p.key);
          const current = p.key === currentPanel;
          return (
            <div key={p.key} className={`rounded-2xl border transition-colors ${current ? "border-primary/30 bg-primary/[0.04]" : "border-transparent"}`}>
              <button type="button" onClick={() => toggle(p.key)} aria-expanded={isOpen} className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors hover:bg-muted/50">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-border/60 bg-background shadow-sm"><ProductLogo productKey={p.key} size={32} title={p.name} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-black leading-tight">{p.name}</span><span className="text-[11px] font-semibold text-muted-foreground">Guides</span></span>
                <ChevronDown className={`h-4 w-4 flex-none text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="pb-2 pl-3 pr-1">
                  {groups.map((g) => (
                    <div key={g.name} className="mt-2">
                      <p className="px-3 pb-1 text-[10.5px] font-black uppercase tracking-widest text-primary">{g.name}</p>
                      <ul className="space-y-0.5 border-l-2 border-border/60 pl-1.5">
                        {g.items.map((x) => {
                          const active = current && x.slug === currentSlug;
                          return (
                            <li key={x.slug}><Link ref={active ? activeRef : undefined} data-product-link href={productDocsPath(p.key, x.slug)} aria-current={active ? "page" : undefined} className={`-ml-[8px] block rounded-lg border-l-2 py-1.5 pl-4 pr-3 text-sm transition-colors ${active ? "border-primary bg-primary/10 font-bold text-primary" : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}>{x.name}</Link></li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {query && !panels.some((p) => p.groups.some((g) => g.items.some((x) => x.name.toLowerCase().includes(query) || p.name.toLowerCase().includes(query)))) && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No guide matches “{q}”.</p>}
      </div>
    </nav>
  );
}
