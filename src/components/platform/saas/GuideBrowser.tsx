"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Clock, Search } from "lucide-react";

export interface GuideItem {
  href: string;
  title: string;
  summary: string;
  category: string;
  minutes: number;
  thumb: string | null;
  kind?: string;
}

/** Search box, topic filter and a grid of guides with a real screen on each card. */
export default function GuideBrowser({ items, categories, searchLabel = "Search guides…", cta = "Read" }: { items: GuideItem[]; categories: string[]; searchLabel?: string; cta?: string }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("All");
  const list = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((i) => (cat === "All" || i.category === cat) && terms.every((t) => `${i.title} ${i.summary} ${i.category}`.toLowerCase().includes(t)));
  }, [q, cat, items]);
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <label className="relative block">
          <span className="sr-only">{searchLabel}</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchLabel} className="sr-input" style={{ height: 56, paddingLeft: 48, borderRadius: 16, fontSize: 16 }} />
        </label>
        <div className="sr-scroll-x flex flex-wrap gap-2" role="tablist" aria-label="Topics">
          {["All", ...categories].map((c) => (
            <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className="sr-tab" style={{ border: "1px solid var(--border)" }}>{c}</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Nothing matches. Try another word or topic, or <Link href="/contact" className="font-bold text-primary">contact us</Link>.</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((g) => (
            <Link key={g.href} href={g.href} className="group flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-background transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
              <div className="relative aspect-[16/10] overflow-hidden bg-muted/40">
                {g.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.thumb} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                ) : null}
                <span className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1 text-[11px] font-bold shadow-sm backdrop-blur">{g.kind ?? g.category}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5">
                <h3 className="text-lg font-black leading-snug">{g.title}</h3>
                <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{g.summary}</p>
                <div className="flex items-center justify-between pt-2 text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-3.5 w-3.5" />{g.minutes} min</span>
                  <span className="flex items-center gap-1 text-primary">{cta} <ArrowUpRight className="h-3.5 w-3.5" /></span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
