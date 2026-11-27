"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Search, X } from "lucide-react";
import ProductLogo from "@/components/products/ProductLogo";
import NumberedHead from "@/components/platform/saas/NumberedHead";
import SectionScrollNav from "@/components/platform/saas/SectionScrollNav";

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
};
export type CatalogGroup = { id: string; title: string; lead: string };

/** The last word of a category name, shown in the brand colour, as the other pages' headings do. */
const split = (title: string): [string, string] => { const i = title.lastIndexOf(" "); return i < 0 ? ["", `${title}.`] : [title.slice(0, i), `${title.slice(i + 1)}.`]; };

/** The product range: the same numbered menu and section headings as the other pages, one section per category, with a search box. */
export default function ProductCatalog({ products, groups }: { products: CatalogProduct[]; groups: CatalogGroup[] }) {
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter((p) => !t || `${p.name} ${p.short} ${p.headline} ${p.summary} ${p.replaces ?? ""}`.toLowerCase().includes(t));
  }, [products, q]);
  const visibleGroups = useMemo(() => groups.filter((g) => shown.some((p) => p.group === g.id)), [groups, shown]);
  // The questions section that follows this list is the last item of the menu.
  const nav = useMemo(() => [...visibleGroups.map((g) => ({ id: g.id, label: g.title })), { id: "faq", label: "FAQ" }], [visibleGroups]);

  return (
    <>
      <SectionScrollNav items={nav} label="Product categories" numbered compact />

      <div className="sr-container pt-10">
        <div className="relative mx-auto max-w-xl">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search by job, e.g. invoices, leave, leads" aria-label="Search products" className="h-14 w-full rounded-full border border-border bg-background pl-14 pr-12 text-base shadow-lg shadow-primary/5 outline-none transition-colors focus:border-primary" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
        {shown.length === 0 && (
          <div className="mx-auto my-12 max-w-xl rounded-3xl border border-dashed border-border p-12 text-center">
            <p className="text-lg font-black">Nothing matches “{q}”.</p>
            <button type="button" onClick={() => setQ("")} className="mt-3 text-sm font-bold text-primary hover:underline">Show all products</button>
          </div>
        )}
      </div>

      {visibleGroups.map((g, i) => {
        const [title, accent] = split(g.title);
        return (
          <section key={g.id} id={g.id} className={`relative py-12 lg:py-14 ${i ? "border-t border-border/50" : ""} ${i % 2 ? "bg-muted/10" : ""}`} style={{ scrollMarginTop: 140 }}>
            <div className="sr-container">
              <NumberedHead n={i + 1} eyebrow={g.title} title={title} accent={accent} lead={g.lead} />
              <div className="flex flex-wrap justify-center gap-6">
              {shown.filter((p) => p.group === g.id).map((p) => (
                <article key={p.key} id={p.key} style={{ scrollMarginTop: 150 }} className="group relative flex w-full flex-col md:w-[calc(50%-0.75rem)] xl:w-[calc(33.333%-1rem)] overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10">
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
                      <Link href={p.href} className="relative z-20 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:gap-2.5">Explore <ArrowRight className="h-4 w-4" /></Link>
                    </span>
                  </div>
                </article>
              ))}
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
