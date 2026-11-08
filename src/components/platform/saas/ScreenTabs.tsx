"use client";

import Link from "next/link";
import { productPath } from "@/lib/platform/saas/product-routes";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import ProductLogo from "@/components/products/ProductLogo";
import type { ReactNode } from "react";
import type { IconKey } from "@/lib/platform/saas/content";

export interface ScreenTab {
  key: string;
  name: string;
  icon: IconKey;
  summary: string;
  /** The rendered devices for this product (a server-rendered scene). */
  node: ReactNode;
  /** Where "Explore" leads; defaults to the product page. */
  href?: string;
}

/** Tabs across the top, the real screen of the chosen product below. */
export default function ScreenTabs({ items, tone }: { items: ScreenTab[]; tone?: "dark" }) {
  const dark = tone === "dark";
  const [i, setI] = useState(0);
  const t = items[i];
  if (!t) return null;
  return (
    <div>
      <div className="sr-scroll-x -mx-6 mb-8 flex gap-2 px-6 lg:mx-0 lg:flex-wrap lg:justify-center lg:px-0" role="tablist" aria-label="Products">
        {items.map((x, n) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={n === i}
            onClick={() => setI(n)}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-all ${n === i ? (dark ? "border-transparent bg-white text-black shadow-lg" : "border-transparent bg-foreground text-background shadow-lg") : dark ? "border-white/20 bg-white/10 text-white hover:bg-white/20" : "border-border/50 bg-muted/30 text-foreground hover:border-primary/40 hover:text-primary"}`}
          >
            <ProductLogo productKey={x.key} size={20} title={x.name} />
            {x.name}
          </button>
        ))}
      </div>
      <div className="relative mx-auto max-w-5xl">
        <AnimatePresence mode="wait">
          <motion.div key={t.key} initial={{ opacity: 0, y: 16, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.99 }} transition={{ duration: 0.3 }}>
            {t.node}
          </motion.div>
        </AnimatePresence>
      </div>
      <p className={`mt-5 text-center text-xs ${dark ? "text-white/60" : "text-muted-foreground"}`}>Real, full-resolution screens of the live product, captured in a demo workspace with sample data.</p>
      <div className="mx-auto mt-5 flex max-w-3xl flex-col items-center gap-4 text-center">
        <p className={`text-lg ${dark ? "text-white/85" : "text-muted-foreground"}`}>{t.summary}</p>
        <Link href={t.href ?? productPath(t.key)} className={`group inline-flex items-center gap-2 text-sm font-bold ${dark ? "text-white hover:text-white/80" : "text-foreground hover:text-primary"}`}>
          Explore {t.name} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}
