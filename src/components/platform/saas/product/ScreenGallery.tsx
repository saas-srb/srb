"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Shot = { key: string; title: string; src: string };

/** Real product screens in one browser frame: a big preview plus a strip of thumbnails to switch between them. */
export default function ScreenGallery({ shots, name }: { shots: Shot[]; name: string }) {
  const [i, setI] = useState(0);
  const cur = shots[i] ?? shots[0];
  if (!cur) return null;
  const go = (d: number) => setI((i + d + shots.length) % shots.length);

  return (
    <div className="min-w-0">
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/10 via-card to-brand-accent/10 p-3 shadow-xl shadow-primary/10 sm:p-6">
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border/60 bg-muted/60 px-4 py-2.5">
            <span className="flex gap-1.5" aria-hidden><i className="h-2.5 w-2.5 rounded-full bg-rose-400" /><i className="h-2.5 w-2.5 rounded-full bg-amber-400" /><i className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></span>
            <span className="mx-auto min-w-0 max-w-[70%] truncate rounded-full bg-background px-4 py-1 text-xs font-semibold text-muted-foreground">{name} · {cur.title}</span>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={cur.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cur.src} alt={`${name}: ${cur.title}, real screen of the product`} className="block h-auto w-full" loading="lazy" />
            </motion.div>
          </AnimatePresence>
        </div>
        {shots.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous screen" className="absolute left-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 shadow-lg backdrop-blur hover:bg-background sm:left-2"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next screen" className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 shadow-lg backdrop-blur hover:bg-background sm:right-2"><ChevronRight className="h-5 w-5" /></button>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-lg font-black">{cur.title}</p>
      </div>

      {shots.length > 1 && (
        <div role="tablist" aria-label="Screens" className="mt-4 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {shots.map((s, n) => (
            <button key={s.key} type="button" role="tab" aria-selected={n === i} onClick={() => setI(n)} className={`group w-36 flex-none text-left transition-all sm:w-44 ${n === i ? "" : "opacity-70 hover:opacity-100"}`}>
              <span className={`block overflow-hidden rounded-xl border-2 bg-card shadow-sm transition-colors ${n === i ? "border-primary shadow-primary/20" : "border-border/60 group-hover:border-primary/40"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.src} alt="" className="block aspect-[16/10] w-full object-cover object-top" loading="lazy" />
              </span>
              <span className={`mt-1.5 block truncate text-xs font-bold ${n === i ? "text-primary" : "text-muted-foreground"}`}>{s.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
