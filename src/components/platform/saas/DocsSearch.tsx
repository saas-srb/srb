"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { productDocsPath } from "@/lib/platform/saas/product-routes";

export interface DocEntry { panelKey: string; panel: string; slug: string; name: string; text: string }

/** Instant search across every feature guide; the best matches open in a list under the box. */
export default function DocsSearch({ entries, large = false }: { entries: DocEntry[]; large?: boolean }) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const hits = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    return entries
      .map((e) => ({ e, hay: `${e.name} ${e.panel} ${e.text}`.toLowerCase(), nm: e.name.toLowerCase() }))
      .filter((x) => terms.every((t) => x.hay.includes(t)))
      .sort((a, b) => Number(terms.every((t) => b.nm.includes(t))) - Number(terms.every((t) => a.nm.includes(t))))
      .slice(0, 8)
      .map((x) => x.e);
  }, [q, entries]);
  return (
    <div className={`relative w-full ${large ? "mx-auto max-w-2xl" : "lg:max-w-md"}`} onFocus={() => setFocus(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocus(false); }}>
      <label className="relative block">
        <span className="sr-only">Search the guides</span>
        <Search className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground ${large ? "left-5 h-5 w-5" : "left-4 h-4 w-4"}`} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the guides…" className="sr-input" style={{ height: large ? 58 : 46, paddingLeft: large ? 52 : 42, borderRadius: 999, boxShadow: large ? "0 10px 30px -12px rgba(67,56,202,.25)" : undefined }} />
      </label>
      {focus && q.trim() !== "" && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-border/70 bg-background p-2 shadow-2xl shadow-primary/15" style={{ animation: "sr-in .2s ease both" }}>
          {hits.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No guide matches. Try another word.</p> : hits.map((h) => (
            <Link key={`${h.panelKey}/${h.slug}`} href={productDocsPath(h.panelKey, h.slug)} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-primary/10">
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold group-hover:text-primary">{h.name}</span><span className="block truncate text-xs text-muted-foreground">{h.panel}</span></span>
              <ArrowUpRight className="h-4 w-4 flex-none text-primary opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
