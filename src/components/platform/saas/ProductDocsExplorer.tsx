"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search, X } from "lucide-react";
import ProductLogo from "@/components/products/ProductLogo";
import { productDocsPath, productPath } from "@/lib/platform/saas/product-routes";

export type DocsPanel = { key: string; name: string; summary: string; groups: { name: string; items: { slug: string; name: string; text: string }[] }[] };

/** Every product's guides: pick a product on the left, filter its guides, open any one. The product can also be chosen with a #link. */
export default function ProductDocsExplorer({ panels }: { panels: DocsPanel[] }) {
  const [key, setKey] = useState(panels[0]?.key ?? "");
  const [q, setQ] = useState("");
  const cur = panels.find((p) => p.key === key) ?? panels[0];

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (h && panels.some((p) => p.key === h)) {
        setKey(h);
        setQ("");
        requestAnimationFrame(() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }));
      }
    };
    const id = requestAnimationFrame(fromHash);
    window.addEventListener("hashchange", fromHash);
    return () => { cancelAnimationFrame(id); window.removeEventListener("hashchange", fromHash); };
  }, [panels]);

  const terms = useMemo(() => q.toLowerCase().split(/\s+/).filter(Boolean), [q]);
  const groups = useMemo(() => (cur ? cur.groups.map((g) => ({ ...g, items: g.items.filter((it) => terms.every((t) => `${it.name} ${it.text}`.toLowerCase().includes(t))) })).filter((g) => g.items.length) : []), [cur, terms]);
  if (!cur) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8">
      <aside aria-label="Products" className="lg:sticky lg:top-28 lg:self-start">
        <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
          <div className="border-b border-border/50 bg-gradient-to-br from-primary/[0.10] via-card to-brand-accent/[0.10] p-4"><p className="text-sm font-black">Choose a product</p></div>
          <div className="sr-scroll-x flex gap-2 p-2.5 lg:block lg:max-h-[calc(100vh-14rem)] lg:space-y-1 lg:overflow-y-auto lg:[scrollbar-width:thin]" role="tablist" aria-label="Products">
            {panels.map((p) => {
              const on = p.key === cur.key;
              return (
                <button key={p.key} type="button" role="tab" aria-selected={on} onClick={() => { setKey(p.key); setQ(""); }} className={`flex flex-none items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm font-bold transition-all lg:w-full ${on ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25" : "border-border/60 hover:border-primary/40 hover:bg-muted/60 lg:border-transparent"}`}>
                  <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl border ${on ? "border-white/30 bg-white/20" : "border-border/60 bg-background"}`}><ProductLogo productKey={p.key} size={28} title={p.name} /></span>
                  <span className="min-w-0 flex-1 whitespace-nowrap leading-tight lg:whitespace-normal">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <div className="min-w-0" id={cur.key}>
        <div className="mb-5 overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-4 bg-gradient-to-br from-primary/[0.08] via-card to-brand-accent/[0.08] p-5 sm:p-6">
            <span className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl border border-border/60 bg-background shadow-sm"><ProductLogo productKey={cur.key} size={44} title={cur.name} /></span>
            <div className="min-w-0 flex-1"><h3 className="text-2xl font-black leading-tight">{cur.name}</h3><p className="mt-1 text-sm leading-snug text-muted-foreground">{cur.summary}</p></div>
            <Link href={productPath(cur.key)} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-4 py-2 text-sm font-bold transition-colors hover:border-primary/40 hover:text-primary">Product page <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-border/50 p-3 sm:px-6">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} type="search" aria-label={`Filter ${cur.name} guides`} placeholder={`Filter the ${cur.name} guides`} className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-8 text-sm outline-none focus:border-primary" />
              {q && <button type="button" onClick={() => setQ("")} aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <p className="text-xs font-bold text-muted-foreground" aria-live="polite">{q ? `Guides matching “${q}”` : `All ${cur.name} guides`}</p>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-12 text-center"><p className="font-black">No guide matches “{q}”.</p><button type="button" onClick={() => setQ("")} className="mt-2 text-sm font-bold text-primary hover:underline">Show all {cur.name} guides</button></div>
        ) : (
          <div className="space-y-7">
            {groups.map((g) => (
              <section key={g.name} aria-label={g.name}>
                <h4 className="mb-3 flex items-center gap-3 px-1 text-xs font-black uppercase tracking-widest text-primary">{g.name}</h4>
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {g.items.map((f, i) => (
                    <li key={f.slug}>
                      <Link href={productDocsPath(cur.key, f.slug)} className="group flex h-full gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-primary/10 text-xs font-black text-primary">{String(i + 1).padStart(2, "0")}</span>
                        <span className="min-w-0 flex-1"><span className="block font-black leading-snug group-hover:text-primary">{f.name}</span><span className="mt-1 line-clamp-2 block text-sm leading-snug text-muted-foreground">{f.text}</span></span>
                        <ArrowUpRight className="mt-0.5 h-4 w-4 flex-none text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
