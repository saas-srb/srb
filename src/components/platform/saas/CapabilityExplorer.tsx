"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import Icon from "@/components/platform/saas/Icon";
import type { IconKey } from "@/lib/platform/saas/content";

/** A list of areas on the left; the chosen area opens large on the right with everything it includes beside a real product screen. */
export default function CapabilityExplorer({ items }: { items: { title: string; icon: IconKey; items: string[]; media?: ReactNode }[] }) {
  const [i, setI] = useState(0);
  const t = items[i];
  if (!t) return null;
  return (
    <div className="grid gap-8 lg:grid-cols-[270px_1fr] lg:gap-12">
      <div className="sr-scroll-x -mx-6 flex gap-2 px-6 lg:mx-0 lg:flex-col lg:gap-1 lg:px-0" role="tablist" aria-label="Capabilities">
        {items.map((x, n) => (
          <button key={x.title} role="tab" aria-selected={n === i} onClick={() => setI(n)} className={`group relative flex shrink-0 items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left transition-all lg:rounded-none lg:border-l-2 lg:py-4 ${n === i ? "bg-primary/10 text-primary lg:border-primary lg:bg-gradient-to-r lg:from-primary/10 lg:to-transparent" : "text-muted-foreground hover:text-foreground lg:border-border/60"}`}>
            <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl transition-colors ${n === i ? "bg-primary text-white shadow-lg shadow-primary/30" : "bg-muted text-muted-foreground group-hover:text-primary"}`}><Icon name={x.icon} className="h-5 w-5" /></span>
            <span className="flex-1 text-base font-bold lg:text-lg">{x.title}</span>
          </button>
        ))}
      </div>
      <div key={t.title} className="relative overflow-hidden rounded-[2.25rem] border border-primary/15 bg-gradient-to-br from-primary/[0.10] via-background to-brand-accent/[0.12] p-6 shadow-xl shadow-primary/10 sm:p-10" style={{ animation: "sr-in .45s ease both" }}>
        <Icon name={t.icon} className="pointer-events-none absolute -bottom-12 -left-10 h-72 w-72 text-primary/[0.06]" />
        <div className={`relative grid items-center gap-10 ${t.media ? "xl:grid-cols-[1fr_1.05fr]" : ""}`}>
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-primary"><Icon name={t.icon} className="h-3.5 w-3.5" />Included in every plan</p>
            <h3 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">{t.title}</h3>
            <ul className="mt-7 space-y-3.5">
              {t.items.map((it, n) => (
                <li key={it} className="flex gap-3.5 text-[17px] leading-snug" style={{ animation: `sr-in .4s ease ${n * 45}ms both` }}><span className="sr-circle mt-0.5 h-6 w-6"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>{it}</li>
              ))}
            </ul>
          </div>
          {t.media && <div className="relative">{t.media}</div>}
        </div>
      </div>
    </div>
  );
}
