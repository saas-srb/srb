"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Clock, Search, X } from "lucide-react";

export type SidebarPost = { slug: string; title: string; tag: string; readMinutes: number };

/** Every guide beside the one being read: searchable, filterable by topic, numbered, with the current one highlighted and in view. */
export default function BlogSidebar({ posts, activeSlug }: { posts: SidebarPost[]; activeSlug: string }) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("all");
  const listRef = useRef<HTMLUListElement>(null);
  const tags = useMemo(() => [...new Set(posts.map((p) => p.tag))], [posts]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return posts.map((p, i) => ({ ...p, n: i + 1 })).filter((p) => (tag === "all" || p.tag === tag) && (!t || `${p.title} ${p.tag}`.toLowerCase().includes(t)));
  }, [posts, q, tag]);

  useEffect(() => {
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>('[aria-current="page"]');
    if (box && el) box.scrollTop = Math.max(0, el.offsetTop - box.offsetTop - box.clientHeight / 2 + el.clientHeight / 2);
  }, [activeSlug]);

  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
      <div className="border-b border-border/50 bg-gradient-to-br from-primary/[0.10] via-card to-brand-accent/[0.10] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-black"><BookOpen className="h-4 w-4 text-primary" />All guides</p>
          <Link href="/blog" className="text-xs font-bold text-primary hover:underline">Listing</Link>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Find a guide" aria-label="Find a guide" className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-8 text-sm outline-none focus:border-primary" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <div className="sr-scroll-x mt-3 flex gap-1.5" role="tablist" aria-label="Topics">
          {["all", ...tags].map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tag === t} onClick={() => setTag(t)} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold capitalize transition-colors ${tag === t ? "border-primary bg-primary text-primary-foreground" : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-primary"}`}>{t === "all" ? "All topics" : t}</button>
          ))}
        </div>
      </div>

      <ul ref={listRef} className="relative max-h-[60vh] space-y-1 overflow-y-auto p-2.5 [scrollbar-width:thin] md:max-h-[calc(100vh-21rem)]">
        {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No guide matches your search.</li>}
        {shown.map((p) => {
          const active = p.slug === activeSlug;
          return (
            <li key={p.slug}>
              <Link data-product-link href={`/blog/${p.slug}`} aria-current={active ? "page" : undefined} className={`group flex items-start gap-3 rounded-2xl px-3 py-3 transition-all ${active ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "hover:bg-muted/60"}`}>
                <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl text-sm font-black ${active ? "bg-white/20" : "bg-primary/10 text-primary"}`}>{String(p.n).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-black leading-snug">{p.title}</span>
                  <span className={`mt-1.5 flex items-center gap-2 text-[11px] font-bold ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    <span className={`rounded-full px-2 py-0.5 uppercase tracking-wider ${active ? "bg-white/20" : "bg-muted"}`}>{p.tag}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{p.readMinutes} min</span>
                  </span>
                </span>
                {!active && <ArrowRight className="mt-2 h-4 w-4 flex-none -translate-x-1 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border/50 bg-muted/30 p-3">
        <Link href="/signup" className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 transition-transform hover:-translate-y-0.5">Start free · every product<ArrowRight className="h-4 w-4" /></Link>
      </div>
    </div>
  );
}
