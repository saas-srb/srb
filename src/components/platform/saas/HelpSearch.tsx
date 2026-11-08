"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";

export interface HelpItem {
  kind: "Guide" | "Tutorial" | "Article" | "FAQ" | "Product";
  title: string;
  summary: string;
  href: string;
}

/** Filters the product's real guides, FAQs and module references as you type. */
export default function HelpSearch({ items }: { items: HelpItem[] }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return items.filter((i) => terms.every((t) => `${i.title} ${i.summary}`.toLowerCase().includes(t))).slice(0, 8);
  }, [q, items]);
  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Search the help center</span>
        <Search className="sr-muted pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} className="sr-input" style={{ height: 56, paddingLeft: 48, borderRadius: 16, fontSize: 16 }} placeholder="Search guides, FAQs and modules…" />
      </label>
      {q.trim() && (
        <div className="sr-card space-y-1" style={{ padding: 8 }} role="region" aria-live="polite">
          {results.length === 0 ? (
            <p className="sr-muted px-3 py-4 text-[14.5px]">Nothing matches “{q}”. Try another word, or <Link href="/contact" className="font-medium underline">contact us</Link>.</p>
          ) : (
            results.map((r) => (
              <Link key={r.href + r.title} href={r.href} className="flex items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-[var(--sr-surface)]">
                <span className="sr-chip mt-0.5">{r.kind}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{r.title}</span>
                  <span className="sr-muted line-clamp-1 block text-[13.5px]">{r.summary}</span>
                </span>
                <ArrowUpRight className="sr-muted mt-1 size-4 shrink-0" aria-hidden />
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
