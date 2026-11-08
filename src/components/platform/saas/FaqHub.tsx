"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronDown, Layers, Search, Sparkles, X } from "lucide-react";
import ProductLogo from "@/components/products/ProductLogo";
import type { FaqHubGroup } from "@/lib/platform/saas/faqs";

function Logo({ id, title, size }: { id: string; title: string; size: number }) {
  return id === "general" ? <Layers className="text-primary" style={{ width: size * 0.6, height: size * 0.6 }} aria-hidden /> : <ProductLogo productKey={id} size={size} title={title} />;
}

/** Wraps the searched words in a highlight so readers see why an answer matched. */
function Mark({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return <>{text.split(re).map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-primary/15 px-0.5 text-foreground">{p}</mark> : <span key={i}>{p}</span>))}</>;
}

export default function FaqHub({ groups }: { groups: FaqHubGroup[] }) {
  const [activeId, setActiveId] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  const visible = useMemo(() => {
    const pool = activeId === "all" ? groups : groups.filter((g) => g.id === activeId);
    if (terms.length === 0) return pool;
    return pool
      .map((g) => ({ ...g, items: g.items.filter((it) => terms.every((t) => `${it.q} ${it.a}`.toLowerCase().includes(t))) }))
      .filter((g) => g.items.length > 0);
  }, [activeId, groups, terms]);

  const results = visible.reduce((n, g) => n + g.items.length, 0);
  const selected = groups.find((g) => g.id === activeId);
  const directory = activeId === "all" && terms.length === 0;
  const keyOf = (gid: string, q: string) => `${gid}::${q}`;
  const allKeys = visible.flatMap((g) => g.items.map((it) => keyOf(g.id, it.q)));
  const allOpen = allKeys.length > 0 && allKeys.every((k) => open.has(k));
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const pick = (id: string) => { setActiveId(id); setOpen(new Set()); };

  return (
    <section id="browse" className="relative overflow-hidden bg-gradient-to-b from-muted/30 via-background to-background py-16 sm:py-20" style={{ scrollMarginTop: 140 }}>
      <div className="pointer-events-none absolute -right-32 top-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -left-32 top-64 h-96 w-96 rounded-full bg-brand-accent/10 blur-3xl" aria-hidden />
      <div className="sr-container relative">
        {/* heading + search */}
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-lg font-black text-white shadow-lg shadow-primary/30">01</span>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-primary">Browse verified answers</p>
          <h2 className="text-4xl font-black leading-[1.1] tracking-tight sm:text-5xl">Find answers for <span className="bg-gradient-to-r from-primary to-brand-accent bg-clip-text text-transparent">your product.</span></h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">Search every answer at once, or pick a product to see only its questions. Answers describe what the product does today.</p>
          <div className="relative mt-8">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(new Set()); }} type="search" aria-label="Search questions and answers" placeholder="Search the answers, for example “invoice” or “leave”" className="h-14 w-full rounded-full border border-border bg-background pl-14 pr-12 text-base shadow-lg shadow-primary/5 outline-none transition-shadow focus:border-primary focus:shadow-xl focus:shadow-primary/10" />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-bold text-muted-foreground">
            <span><b className="text-2xl font-black text-foreground">Clear</b> answers</span>
            <span><b className="text-2xl font-black text-foreground">Every</b> product</span>
            <span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" />Written from how the product works</span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8">
          {/* sidebar */}
          <aside aria-label="FAQ topics" className="lg:sticky lg:top-28 lg:self-start">
            <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
              <div className="border-b border-border/50 bg-gradient-to-br from-primary/[0.10] via-card to-brand-accent/[0.10] p-4">
                <p className="flex items-center gap-2 text-sm font-black"><Layers className="h-4 w-4 text-primary" />Topics</p>
              </div>
              <nav className="sr-scroll-x flex gap-2 p-2.5 lg:block lg:max-h-[calc(100vh-14rem)] lg:space-y-1 lg:overflow-y-auto lg:[scrollbar-width:thin]">
                {[{ id: "all", title: "All FAQs", n: total }, ...groups.map((g) => ({ id: g.id, title: g.title, n: g.items.length }))].map((t) => {
                  const on = activeId === t.id;
                  return (
                    <button key={t.id} type="button" onClick={() => pick(t.id)} aria-pressed={on} className={`flex flex-none items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm font-bold transition-all lg:w-full ${on ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25" : "border-border/60 hover:border-primary/40 hover:bg-muted/60 lg:border-transparent"}`}>
                      <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl border ${on ? "border-white/30 bg-white/20" : "border-border/60 bg-background"}`}>{t.id === "all" ? <Layers className="h-4 w-4" /> : <Logo id={t.id} title={t.title} size={26} />}</span>
                      <span className="min-w-0 flex-1 whitespace-nowrap leading-tight lg:whitespace-normal">{t.title}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* content */}
          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                {selected && <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-border/60 bg-background"><Logo id={selected.id} title={selected.title} size={28} /></span>}
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-black leading-tight">{selected ? selected.title : terms.length ? "Search results" : "All FAQs"}</h3>
                  <p className="text-xs font-semibold text-muted-foreground" aria-live="polite">{directory ? "Answers for every product" : `Answers${terms.length ? ` matching “${query.trim()}”` : ""}`}</p>
                </div>
                {selected?.href && <Link href={selected.href} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary hover:bg-primary hover:text-primary-foreground">Product details <ArrowUpRight className="h-3.5 w-3.5" /></Link>}
              </div>
              {!directory && allKeys.length > 0 && (
                <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(allKeys))} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-4 py-2 text-xs font-bold transition-colors hover:border-primary/40 hover:text-primary">{allOpen ? "Collapse all" : "Expand all"}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${allOpen ? "rotate-180" : ""}`} /></button>
              )}
            </div>

            {directory && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {groups.map((g) => (
                  <button key={g.id} type="button" onClick={() => pick(g.id)} className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                    <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-brand-accent opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    <span className="flex items-center gap-3">
                      <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl border border-border/60 bg-background shadow-sm transition-transform group-hover:scale-105"><Logo id={g.id} title={g.title} size={40} /></span>
                      <span className="min-w-0"><span className="block font-black leading-tight">{g.title}</span><span className="mt-1 inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-black text-primary">Answers</span></span>
                    </span>
                    <span className="mt-4 line-clamp-2 flex-1 text-sm leading-snug text-muted-foreground">“{g.items[0]?.q}”</span>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary">Browse answers<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                  </button>
                ))}
              </div>
            )}

            {!directory && results === 0 && (
              <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-14 text-center">
                <span className="sr-icon mx-auto mb-4"><Search className="h-5 w-5" /></span>
                <p className="text-lg font-black">No matching answers</p>
                <p className="mt-1 text-sm text-muted-foreground">Try fewer words, or choose a different topic.</p>
                <button type="button" onClick={() => { setQuery(""); pick("all"); }} className="mt-4 text-sm font-bold text-primary hover:underline">Show all topics</button>
              </div>
            )}

            {!directory && results > 0 && (
              <div className="space-y-6">
                {visible.map((g) => (
                  <section key={g.id} aria-label={g.title}>
                    {(activeId === "all" || terms.length > 0) && activeId === "all" && (
                      <div className="mb-3 flex items-center gap-3 px-1">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background"><Logo id={g.id} title={g.title} size={22} /></span>
                        <h4 className="font-black">{g.title}</h4>
                        {g.href && <Link href={g.href} className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">Product details <ArrowUpRight className="h-3.5 w-3.5" /></Link>}
                      </div>
                    )}
                    <ul className="space-y-3">
                      {g.items.map((it, i) => {
                        const k = keyOf(g.id, it.q);
                        const on = open.has(k);
                        return (
                          <li key={k} className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition-all ${on ? "border-primary/40 shadow-md shadow-primary/5" : "border-border/60 hover:border-primary/30"}`}>
                            <button type="button" onClick={() => toggle(k)} aria-expanded={on} className="flex w-full items-start gap-4 px-5 py-4 text-left">
                              <span className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-black transition-colors ${on ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>{String(i + 1).padStart(2, "0")}</span>
                              <span className="flex-1 pt-1 font-bold leading-snug"><Mark text={it.q} terms={terms} /></span>
                              <ChevronDown className={`mt-1.5 h-5 w-5 flex-none text-muted-foreground transition-transform duration-300 ${on ? "rotate-180 text-primary" : ""}`} />
                            </button>
                            <div className={`grid transition-all duration-300 ease-out ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                              <div className="overflow-hidden">
                                <p className="border-t border-border/50 bg-muted/20 px-5 py-4 pl-[68px] text-[15px] leading-relaxed text-muted-foreground"><Mark text={it.a} terms={terms} /></p>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
