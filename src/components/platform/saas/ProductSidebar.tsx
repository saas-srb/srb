"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, LayoutGrid, Search, X } from "lucide-react";
import ProductLogo from "@/components/products/ProductLogo";
import { productPath } from "@/lib/platform/saas/product-routes";

export type SidebarGroup = { id: string; title: string; items: { key: string; name: string; short: string; features: number }[] };

/**
 * Every product beside the page being read: grouped by category, searchable, with the full name, one line about it and its feature count.
 * The current product is highlighted and scrolled into view; long lists scroll inside the card.
 */
export default function ProductSidebar({ groups, activeKey }: { groups: SidebarGroup[]; activeKey: string }) {
  const [q, setQ] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return groups;
    return groups.map((g) => ({ ...g, items: g.items.filter((p) => `${p.name} ${p.short}`.toLowerCase().includes(t)) })).filter((g) => g.items.length);
  }, [groups, q]);

  useEffect(() => {
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>('[aria-current="page"]');
    if (box && el) box.scrollTop = Math.max(0, el.offsetTop - box.offsetTop - box.clientHeight / 2 + el.clientHeight / 2);
  }, [activeKey]);

  const card = (
      <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm lg:sticky lg:top-28">
        <div className="border-b border-border/50 bg-gradient-to-br from-primary/[0.10] via-card to-brand-accent/[0.10] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-black"><LayoutGrid className="h-4 w-4 text-primary" />All products</p>
            <Link href="/products" className="text-xs font-bold text-primary hover:underline">Listing</Link>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Find a product" aria-label="Find a product" className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-8 text-sm outline-none focus:border-primary" />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
          </div>
        </div>

        <div ref={listRef} className="relative max-h-[calc(100vh-17rem)] overflow-y-auto px-2.5 pb-2.5 [scrollbar-width:thin]">
          {shown.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No product matches “{q}”.</p>}
          {shown.map((g) => (
            <div key={g.id} className="pb-1">
              <p className="sticky top-0 z-20 -mx-2.5 border-b border-border/40 bg-card px-5 py-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground shadow-[0_6px_8px_-6px_rgba(0,0,0,0.08)]">{g.title}</p>
              <ul className="space-y-0.5 pt-1.5">
                {g.items.map((p) => {
                  const active = p.key === activeKey;
                  return (
                    <li key={p.key}>
                      <Link
                        data-product-link
                        href={productPath(p.key)}
                        aria-current={active ? "page" : undefined}
                        className={`group relative flex items-center gap-3.5 rounded-2xl px-3 py-2.5 transition-all ${active ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "hover:bg-muted/60"}`}
                      >
                        <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl border border-border/60 bg-background shadow-sm transition-transform group-hover:scale-105">
                          <ProductLogo productKey={p.key} size={40} title={p.name} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-black leading-snug">{p.name}</span>
                          <span className={`mt-0.5 block text-xs leading-snug ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{p.short}</span>
                          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${active ? "bg-white/20" : "bg-muted text-muted-foreground"}`}>All included</span>
                        </span>
                        {!active && <ArrowRight className="h-4 w-4 flex-none -translate-x-1 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border/50 bg-muted/30 p-3">
          <Link href="/signup" className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 transition-transform hover:-translate-y-0.5">Start free · every product<ArrowRight className="h-4 w-4" /></Link>
        </div>
      </div>
  );
  return (
    <>
      <details className="group rounded-2xl border border-border/60 bg-card shadow-sm lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-black"><span className="flex items-center gap-2"><LayoutGrid className="h-4 w-4 text-primary" />Browse all products</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
        <div className="border-t border-border/60 p-2">{card}</div>
      </details>
      <aside className="hidden lg:block" aria-label="All products">{card}</aside>
    </>
  );
}
