"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import ProductLogo from "@/components/products/ProductLogo";

export type ExplorerStory = {
  slug: string;
  title: string;
  summary: string;
  narrative: string;
  problem: string;
  solution: string[];
  result: string;
  products: { key: string; name: string; href: string }[];
};

/** The product stories as an explorer: pick a story on the left, read the challenge, the connected steps and the products involved on the right. */
export default function StoryExplorer({ stories }: { stories: ExplorerStory[] }) {
  const [i, setI] = useState(0);
  const s = stories[i] ?? stories[0];

  // A link elsewhere on the page that names an example (data-story) opens that example here.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const slug = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-story]")?.dataset.story;
      const n = stories.findIndex((x) => x.slug === slug);
      if (n >= 0) setI(n);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [stories]);
  if (!s) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div role="tablist" aria-label="Stories" aria-orientation="vertical" className="flex gap-2 overflow-x-auto pb-2 lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:flex-col lg:self-start lg:overflow-y-auto lg:overflow-x-visible lg:pb-0 lg:pr-1 [scrollbar-width:thin]">
        {stories.map((x, n) => (
          <button key={x.slug} type="button" role="tab" aria-selected={n === i} onClick={() => setI(n)} className={`group flex w-64 flex-none items-start gap-3 rounded-2xl border p-3.5 text-left transition-all lg:w-auto ${n === i ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25" : "border-border/60 bg-card hover:-translate-y-0.5 hover:border-primary/40"}`}>
            <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl text-sm font-black ${n === i ? "bg-white/20" : "bg-primary/10 text-primary"}`}>{String(n + 1).padStart(2, "0")}</span>
            <span className="min-w-0"><span className="block text-[15px] font-black leading-snug">{x.title}</span><span className={`mt-0.5 line-clamp-2 block text-xs leading-snug ${n === i ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{x.summary}</span></span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.article key={s.slug} role="tabpanel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="min-w-0 overflow-hidden rounded-[2rem] border border-border/60 bg-card shadow-sm">
          <div className="border-b border-border/50 bg-gradient-to-br from-primary/[0.10] via-card to-brand-accent/[0.10] p-6 sm:p-8">
            <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-primary">Worked example · {String(i + 1).padStart(2, "0")}</span>
            <h3 className="mt-3 text-2xl font-black leading-tight tracking-tight sm:text-3xl">{s.title}</h3>
            <p className="mt-2 text-lg leading-relaxed text-muted-foreground">{s.summary}</p>
          </div>
          <div className="space-y-8 p-6 sm:p-8">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-primary">The story</p>
              <p className="text-[17px] leading-relaxed">{s.narrative}</p>
            </div>

            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.05] p-5">
              <p className="text-xs font-black uppercase tracking-widest text-rose-500">The problem</p>
              <p className="mt-1.5 leading-relaxed">{s.problem}</p>
            </div>

            <div>
              <p className="mb-4 text-xs font-black uppercase tracking-widest text-muted-foreground">How the work connects</p>
              <ol className="relative space-y-4">
                <span className="absolute bottom-3 left-[19px] top-3 w-px bg-gradient-to-b from-primary/60 to-border" aria-hidden />
                {s.solution.map((step, n) => (
                  <li key={step} className="relative flex items-start gap-4">
                    <span className="relative z-10 flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-sm font-black text-white shadow-md shadow-primary/25 ring-4 ring-card">{n + 1}</span>
                    <p className="flex-1 rounded-2xl border border-border/60 bg-background px-4 py-3 leading-relaxed shadow-sm">{step}</p>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-5">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-600"><Check className="h-4 w-4" strokeWidth={3.5} />What it can look like</p>
              <p className="mt-1.5 font-bold leading-snug">{s.result}</p>
            </div>

            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Products used in this example</p>
              <div className="flex flex-wrap gap-2.5">
                {s.products.map((p) => (
                  <Link key={p.key} href={p.href} className="group inline-flex items-center gap-2.5 rounded-2xl border border-border/60 bg-background py-1.5 pl-1.5 pr-4 transition-all hover:border-primary/40 hover:shadow-md"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card"><ProductLogo productKey={p.key} size={26} title={p.name} /></span><span className="text-sm font-black group-hover:text-primary">{p.name}</span></Link>
                ))}
              </div>
            </div>

            <div className="grid gap-3 border-t border-border/50 pt-5 sm:grid-cols-2">
              {[{ n: i - 1, label: "Previous example" }, { n: i + 1, label: "Next example" }].map((x, k) => {
                const t = stories[x.n];
                return t ? (
                  <button key={x.label} type="button" onClick={() => { setI(x.n); document.getElementById("library")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className={`group flex items-center gap-3 rounded-2xl border border-border/60 bg-background p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md ${k ? "sm:flex-row-reverse sm:text-right" : ""}`}>
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground">{k ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}</span>
                    <span className="min-w-0"><span className="block text-[11px] font-black uppercase tracking-widest text-primary">{x.label}</span><span className="block truncate font-black leading-snug group-hover:text-primary">{t.title}</span></span>
                  </button>
                ) : <span key={x.label} className="hidden sm:block" aria-hidden />;
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">A worked example built from what the product really does today. It is not the account of a named customer.</p>
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 transition-transform hover:-translate-y-0.5">Try it free <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </motion.article>
      </AnimatePresence>
    </div>
  );
}
