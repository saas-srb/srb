"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, Search, X } from "lucide-react";
import ProductLogo from "@/components/products/ProductLogo";

export type CatalogProduct = {
  key: string;
  name: string;
  short: string;
  headline: string;
  summary: string;
  group: string;
  features: number;
  replaces?: string;
  benefits: string[];
  href: string;
  docsHref: string;
};
export type CatalogGroup = { id: string; title: string; lead: string };

/** The product range as a catalogue of brands: a logo wall, search and category filter, then one card per product. */
export default function ProductCatalog({ products, groups, afterWall }: { products: CatalogProduct[]; groups: CatalogGroup[]; afterWall?: React.ReactNode }) {
  const [group, setGroup] = useState("all");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter((p) => (group === "all" || p.group === group) && (!t || `${p.name} ${p.short} ${p.headline} ${p.summary} ${p.replaces ?? ""}`.toLowerCase().includes(t)));
  }, [products, group, q]);
  const visibleGroups = groups.filter((g) => shown.some((p) => p.group === g.id));

  return (
    <>
      {/* brand wall */}
      <section aria-label="Every product of SelfRun AI" className="border-b border-border/50 bg-gradient-to-b from-muted/30 to-background">
        <div className="sr-container py-10 lg:py-14">
          <p className="mb-6 text-center text-xs font-black uppercase tracking-[0.2em] text-primary">Every product of SelfRun AI</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10">
            {products.map((p) => (
              <li key={p.key}>
                <Link href={p.href} aria-label={`${p.name} details`} className="group flex h-full flex-col items-center gap-2.5 rounded-2xl border border-border/60 bg-card p-4 text-center shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border/60 bg-background shadow-sm transition-transform group-hover:scale-110"><ProductLogo productKey={p.key} size={46} title={p.name} /></span>
                  <span className="text-[13px] font-black leading-tight">{p.name.replace(/^SelfRun\s+/i, "")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {afterWall}

      {/* filter bar */}
      <nav aria-label="Filter products" className="sticky top-[76px] z-40 border-b border-border/50 bg-background/85 backdrop-blur-xl">
        <div className="sr-container flex flex-col gap-3 py-3 lg:flex-row lg:items-center">
          <div className="relative lg:w-72 lg:flex-none">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search by job, e.g. invoices, leave, leads" aria-label="Search products" className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-9 text-sm outline-none transition-colors focus:border-primary" />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
          </div>
          <div className="sr-scroll-x flex gap-2" role="tablist" aria-label="Categories">
            {[{ id: "all", title: "All products", n: products.length }, ...groups.map((g) => ({ id: g.id, title: g.title, n: products.filter((p) => p.group === g.id).length }))].map((g) => (
              <button key={g.id} type="button" role="tab" aria-selected={group === g.id} onClick={() => setGroup(g.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold transition-all ${group === g.id ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25" : "border-border/60 bg-muted/40 text-foreground hover:border-primary/40 hover:text-primary"}`}>
                {g.title}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div className="sr-container py-12 lg:py-16">
        {shown.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border p-12 text-center">
            <p className="text-lg font-black">Nothing matches “{q}”.</p>
            <button type="button" onClick={() => { setQ(""); setGroup("all"); }} className="mt-3 text-sm font-bold text-primary hover:underline">Show all products</button>
          </div>
        )}
        {visibleGroups.map((g) => (
          <section key={g.id} id={g.id} className="mb-16 last:mb-0" style={{ scrollMarginTop: 150 }}>
            <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
              <div className="max-w-2xl"><h2 className="text-2xl font-black tracking-tight sm:text-3xl">{g.title}</h2><p className="mt-1.5 text-muted-foreground">{g.lead}</p></div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-primary">Included in every plan</span>
            </header>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {shown.filter((p) => p.group === g.id).map((p) => (
                <article key={p.key} id={p.key} style={{ scrollMarginTop: 150 }} className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10">
                  <div className="flex items-center gap-4 border-b border-border/50 bg-gradient-to-br from-primary/[0.10] via-card to-brand-accent/[0.10] p-6">
                    <span className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" aria-hidden />
                    <span className="flex h-20 w-20 flex-none items-center justify-center rounded-3xl border border-border/60 bg-background shadow-lg shadow-primary/10 transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3"><ProductLogo productKey={p.key} size={56} title={p.name} /></span>
                    <div className="min-w-0">
                      <h3 className="text-xl font-black leading-tight"><Link href={p.href} className="after:absolute after:inset-0 after:z-10 after:content-['']">{p.name}</Link></h3>
                      <p className="mt-1 text-sm leading-snug text-muted-foreground">{p.short}</p>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-4 p-6">
                    <p className="font-bold leading-snug text-primary">{p.headline}</p>
                    <p className="line-clamp-3 text-[15px] leading-relaxed text-muted-foreground">{p.summary}</p>
                    <ul className="space-y-2">
                      {p.benefits.slice(0, 3).map((b) => (
                        <li key={b} className="flex items-start gap-2.5 text-sm font-medium leading-snug"><span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="h-3 w-3" strokeWidth={3.5} /></span>{b}</li>
                      ))}
                    </ul>
                    {p.replaces && <p className="mt-auto rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground"><b className="font-black uppercase tracking-wider text-foreground">Takes the place of</b> · {p.replaces}</p>}
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border/50 bg-muted/20 px-6 py-4">
                    <span className="text-sm font-bold text-muted-foreground">Every feature included</span>
                    <span className="flex items-center gap-2">
                      <Link href={p.docsHref} aria-label={`${p.name} documentation`} className="relative z-20 flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground transition-colors hover:text-primary"><BookOpen className="h-4 w-4" /></Link>
                      <Link href={p.href} className="relative z-20 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:gap-2.5">Explore <ArrowRight className="h-4 w-4" /></Link>
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
