"use client";

import Link from "next/link";
import { productPath } from "@/lib/platform/saas/product-routes";
import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Check } from "lucide-react";
import Icon from "@/components/platform/saas/Icon";
import type { IconKey } from "@/lib/platform/saas/content";

export interface BrandItem {
  key: string;
  title: string;
  text: string;
  icon: IconKey;
  /** The real screen of this setting, already rendered on its device (a server-rendered node). */
  node: ReactNode;
}

/**
 * "Your brand everywhere, not ours": the six places a company's brand shows, as a list on the left; the one you pick opens on the
 * right as the real screen of that setting, tagged with the company's own name. It moves on by itself and pauses on hover.
 */
export default function BrandShowcase({ items, brand }: { items: BrandItem[]; brand: string }) {
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  const t = items[i];
  if (!t) return null;
  const next = () => setI((n) => (n + 1) % items.length);
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)] lg:gap-14" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <ol className="space-y-2" aria-label="Where your brand shows">
        {items.map((x, n) => {
          const on = n === i;
          return (
            <li key={x.key}>
              <button type="button" onClick={() => setI(n)} aria-current={on ? "true" : undefined} className={`group relative w-full overflow-hidden rounded-3xl border p-5 text-left transition-all duration-500 ${on ? "border-primary/40 bg-gradient-to-br from-primary/[0.09] to-brand-accent/[0.10] shadow-xl shadow-primary/10" : "border-transparent hover:bg-muted/50"}`}>
                <span className="flex items-center gap-4">
                  <span className={`flex h-12 w-12 flex-none items-center justify-center rounded-2xl transition-all duration-500 ${on ? "sr-icon scale-105" : "bg-muted text-muted-foreground group-hover:text-primary"}`}><Icon name={x.icon} className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-primary/80">0{n + 1}</span>
                    <span className={`block text-lg font-black leading-tight tracking-tight transition-colors ${on ? "text-foreground" : "text-foreground/80"}`}>{x.title}</span>
                  </span>
                  <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full transition-all duration-500 ${on ? "scale-100 bg-primary text-primary-foreground" : "scale-50 bg-transparent text-transparent"}`}><Check className="h-4 w-4" strokeWidth={3} /></span>
                </span>
                <span className={`grid transition-all duration-500 ${on ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <span className="overflow-hidden"><span className="block pl-16 text-[15px] leading-relaxed text-muted-foreground">{x.text}</span></span>
                </span>
                {on && (
                  <span className="absolute inset-x-5 bottom-0 h-[3px] overflow-hidden rounded-full bg-primary/15" aria-hidden>
                    <span key={`${t.key}-bar`} className="block h-full origin-left rounded-full bg-gradient-to-r from-primary to-brand-accent" style={{ animation: "sr-fill 7s linear forwards", animationPlayState: hover ? "paused" : "running" }} onAnimationEnd={next} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="relative lg:sticky lg:top-28">
        <div className="pointer-events-none absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-br from-primary/20 via-transparent to-brand-accent/25 blur-3xl" aria-hidden />
        <div className="sr-stage p-4 sm:p-7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3.5 py-1.5 text-xs font-bold shadow-sm"><span className="h-2 w-2 rounded-full bg-emerald-500" />Your business name · your colours</span>
            <span className="hidden text-xs font-semibold text-muted-foreground sm:block">{brand} stays in the background</span>
          </div>
          <div key={t.key} style={{ animation: "sr-in .5s ease both" }}>{t.node}</div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">Set once in the Workspace — applied everywhere it shows.</p>
          <Link href={productPath("workspace")} className="group inline-flex items-center gap-2 text-sm font-bold hover:text-primary">Explore branding <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
        </div>
      </div>
    </div>
  );
}
