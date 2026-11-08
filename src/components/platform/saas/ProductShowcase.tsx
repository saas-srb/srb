"use client";

import Link from "next/link";
import { productPath } from "@/lib/platform/saas/product-routes";
import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Check, Pause } from "lucide-react";
import type { IconKey } from "@/lib/platform/saas/content";
import ProductLogo from "@/components/products/ProductLogo";

export interface ShowcaseItem {
  key: string;
  name: string;
  icon: IconKey;
  summary: string;
  points: string[];
  href?: string;
  /** The rendered device scene for this product (a server-rendered node). */
  node: ReactNode;
}

/**
 * A product stage on a dark band: product pills on top, the real screen on a tilted, glowing stage and, beside it, what the
 * product does. It moves to the next product by itself every few seconds (a progress line shows when) and pauses on hover.
 */
export default function ProductShowcase({ items }: { items: ShowcaseItem[] }) {
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  const t = items[i];
  if (!t) return null;
  const next = () => setI((n) => (n + 1) % items.length);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="sr-scroll-x -mx-6 mb-10 flex gap-2 px-6 lg:mx-0 lg:flex-wrap lg:justify-center lg:px-0" role="tablist" aria-label="Products">
        {items.map((x, n) => (
          <button key={x.key} role="tab" aria-selected={n === i} onClick={() => setI(n)} className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-all ${n === i ? "border-transparent bg-white text-black shadow-lg shadow-black/30" : "border-white/20 bg-white/10 text-white hover:bg-white/20"}`}>
            <ProductLogo productKey={x.key} size={20} title={x.name} />{x.name}
          </button>
        ))}
      </div>

      <div className="grid items-center gap-10 lg:grid-cols-[1.7fr_1fr] lg:gap-14">
        <div key={t.key} className="relative" style={{ perspective: "1600px", animation: "sr-in .5s ease both" }}>
          <div className="pointer-events-none absolute -inset-8 -z-0 rounded-[3rem] bg-gradient-to-br from-white/25 via-white/5 to-transparent blur-3xl" aria-hidden />
          <div className="relative transition-transform duration-700 [transform:rotateY(-5deg)_rotateX(2deg)] hover:[transform:rotateY(0)_rotateX(0)]">{t.node}</div>
        </div>

        <div key={`${t.key}-i`} style={{ animation: "sr-in .5s ease .08s both" }}>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl"><ProductLogo productKey={t.key} size={56} title={t.name} /></span>
          <h3 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">{t.name}</h3>
          <p className="mt-3 text-[17px] leading-relaxed text-white/80">{t.summary}</p>
          {t.points.length > 0 && (
            <ul className="mt-6 space-y-3">
              {t.points.slice(0, 4).map((p) => <li key={p} className="flex gap-3 text-[15px] leading-snug text-white/90"><span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white text-[var(--primary)]"><Check className="h-3 w-3" strokeWidth={3} /></span>{p}</li>)}
            </ul>
          )}
          <Link href={t.href ?? productPath(t.key)} className="group mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-black shadow-xl transition-transform hover:scale-105">
            Explore {t.name} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <div className="mt-8 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
              <div key={`${t.key}-bar`} className="h-full origin-left rounded-full bg-white" style={{ animation: "sr-fill 8s linear forwards", animationPlayState: hover ? "paused" : "running" }} onAnimationEnd={next} />
            </div>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-white/60">{hover ? <><Pause className="h-3 w-3" />Paused</> : "Playing"}</span>
          </div>
        </div>
      </div>
      <p className="mt-10 text-center text-xs text-white/60">Real, full-resolution screens of the live product, captured in a demo workspace with sample data.</p>
    </div>
  );
}
