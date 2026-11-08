"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

/** The glossary as an A to Z set of cards with a search box: each card has the term's first letter, its name and its plain meaning. */
export default function GlossaryGrid({ items }: { items: { term: string; meaning: string }[] }) {
  const [q, setQ] = useState("");
  const sorted = useMemo(() => [...items].sort((a, b) => a.term.localeCompare(b.term)), [items]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? sorted.filter((x) => `${x.term} ${x.meaning}`.toLowerCase().includes(t)) : sorted;
  }, [sorted, q]);

  return (
    <div>
      <label className="relative mx-auto mb-8 block max-w-xl">
        <span className="sr-only">Search the glossary</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Find a word, for example “invoice” or “CRM”" className="h-12 w-full rounded-full border border-border bg-background pl-12 pr-10 text-sm shadow-sm outline-none transition-colors focus:border-primary" />
        {q && <button type="button" onClick={() => setQ("")} aria-label="Clear" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
      </label>

      {shown.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-border p-10 text-center text-muted-foreground">No word matches “{q}”. Try another one.</p>
      ) : (
        <dl className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((g) => (
            <div key={g.term} className="group flex h-full gap-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-accent text-xl font-black text-white shadow-md shadow-primary/25 transition-transform group-hover:scale-110" aria-hidden>{g.term.charAt(0).toUpperCase()}</span>
              <div className="min-w-0">
                <dt className="font-black leading-snug">{g.term}</dt>
                <dd className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{g.meaning}</dd>
              </div>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
