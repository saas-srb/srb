"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Search, X } from "lucide-react";

export interface ExplorerItem { name: string; text: string; group: string; href?: string }
const INITIAL = 12;

/** Every feature of a product as an explorer: search as you type, filter by group, and open any feature's guide. */
export default function FeatureExplorer({ productName, items, groups }: { productName: string; items: ExplorerItem[]; groups: { title: string; count: number }[] }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [all, setAll] = useState(false);
  const query = q.trim().toLowerCase();
  const filtered = useMemo(
    () => items.filter((i) => (group === "all" || i.group === group) && (!query || i.name.toLowerCase().includes(query) || i.text.toLowerCase().includes(query))),
    [items, group, query],
  );
  const limited = !all && group === "all" && !query && filtered.length > INITIAL;
  const shown = limited ? filtered.slice(0, INITIAL) : filtered;

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${productName} features…`}
          aria-label={`Search ${productName} features`}
          className="h-14 w-full rounded-2xl border border-border/70 bg-background pl-12 pr-12 text-base shadow-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary focus:shadow-[0_0_0_4px] focus:shadow-primary/15"
        />
        {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Feature groups">
        {[{ title: "all", label: "All", count: items.length }, ...groups.map((g) => ({ title: g.title, label: g.title, count: g.count }))].map((g) => (
          <button key={g.title} type="button" role="tab" aria-selected={group === g.title} onClick={() => { setGroup(g.title); setAll(false); }} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition-all ${group === g.title ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25" : "border-border/70 bg-background text-foreground hover:border-primary/50 hover:text-primary"}`}>
            {g.label}
          </button>
        ))}
      </div>

      <p className="mt-5 text-sm text-muted-foreground" aria-live="polite">{query ? <>Features matching “{q}”</> : <>All {productName} features</>}</p>

      <motion.div layout className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {shown.map((it) => {
            const body = (
              <>
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-accent text-white shadow-lg shadow-primary/25 transition-transform group-hover:scale-110"><Check className="h-5 w-5" strokeWidth={3} /></span>
                {group === "all" && <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-primary/80">{it.group}</span>}
                <span className="block text-lg font-black leading-snug">{it.name}</span>
                {it.text && <span className="mt-1.5 block text-[15px] leading-relaxed text-muted-foreground">{it.text}</span>}
                {it.href && <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary opacity-70 transition-all group-hover:gap-2 group-hover:opacity-100">Read the guide <ArrowRight className="h-4 w-4" /></span>}
              </>
            );
            const cls = "group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card p-6 transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10";
            return (
              <motion.div key={`${it.group}::${it.name}`} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.2 }}>
                {it.href ? <Link href={it.href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {shown.length === 0 && (
        <div className="mt-6 rounded-3xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <p className="text-lg font-black">No feature matches “{q}”</p>
          <p className="mt-1 text-muted-foreground">Try a shorter word, or pick another group.</p>
          <button type="button" onClick={() => { setQ(""); setGroup("all"); }} className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">Show all features</button>
        </div>
      )}

      {limited && (
        <div className="mt-8 flex justify-center">
          <button type="button" onClick={() => setAll(true)} className="inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-3 text-sm font-bold text-background shadow-lg transition-transform hover:scale-105">Show all features <ArrowRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
