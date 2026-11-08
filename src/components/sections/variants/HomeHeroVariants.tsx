"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Sparkles, Zap } from "lucide-react";
import type { HomeHeroProps } from "@/components/sections/home/HomeHero";

/**
 * Alternate renderers for the `home-hero` section type (theme variants
 * "centered" and "spotlight") — same props as `HomeHero`, different layout.
 */

const rise = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } };

function Buttons({ p, tone }: { p: HomeHeroProps; tone: "solid" | "primary" }) {
  const main = tone === "primary" ? "bg-primary text-primary-foreground" : "bg-foreground text-background";
  return (
    <>
      {p.primaryCtaLabel && p.primaryCtaHref && (
        <Link href={p.primaryCtaHref} className={`group inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-bold shadow-lg transition-transform hover:scale-105 ${main}`}>
          {p.primaryCtaLabel} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
      {p.secondaryCtaLabel && p.secondaryCtaHref && (
        <Link href={p.secondaryCtaHref} className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-7 py-3.5 text-sm font-bold text-foreground backdrop-blur-sm transition-colors hover:bg-muted">
          {p.secondaryCtaLabel}
        </Link>
      )}
    </>
  );
}

/** Large centered headline, buttons and a row of highlights. */
export function HomeHeroCentered(p: HomeHeroProps) {
  const chips = [p.chipOne, p.chipTwo, p.chipThree].filter(Boolean);
  return (
    <section className="relative overflow-hidden border-b border-border/50 bg-background pb-20 pt-28 sm:pb-28 sm:pt-36">
      {p.image && (
        // eslint-disable-next-line @next/next/no-img-element -- CMS image (any host)
        <img src={p.image} alt="" className="absolute inset-0 size-full object-cover opacity-20" />
      )}
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-primary/15 blur-[130px]" />
      <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }} className="relative mx-auto max-w-4xl px-6 text-center lg:px-8">
        {p.badge && (
          <motion.span variants={rise} className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="size-3.5" /> {p.badge}
          </motion.span>
        )}
        <motion.h1 variants={rise} className="mt-6 text-5xl font-black leading-[1.05] tracking-tight text-foreground sm:text-7xl">
          {p.titleLine1}{" "}
          {p.titleHighlight && <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">{p.titleHighlight}</span>}
        </motion.h1>
        <motion.p variants={rise} className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">{p.description}</motion.p>
        <motion.div variants={rise} className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Buttons p={p} tone="solid" />
        </motion.div>
        {chips.length > 0 && (
          <motion.ul variants={rise} className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium text-muted-foreground">
            {chips.map((c) => (
              <li key={c} className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" /> {c}</li>
            ))}
          </motion.ul>
        )}
      </motion.div>
    </section>
  );
}

/** Left-aligned giant headline on a gradient product with status cards. */
export function HomeHeroSpotlight(p: HomeHeroProps) {
  const cards = [
    { title: p.statusTitle, text: p.statusText, icon: CheckCircle2 },
    { title: p.perfTitle, text: p.perfText, icon: Zap },
  ].filter((c) => c.title);
  return (
    <section className="relative overflow-hidden border-b border-border/50 bg-background pb-16 pt-24 sm:pt-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary via-primary/85 to-brand-deep px-8 py-16 text-primary-foreground sm:px-14 sm:py-24">
          {p.image && (
            // eslint-disable-next-line @next/next/no-img-element -- CMS image (any host)
            <img src={p.image} alt="" className="absolute inset-0 size-full object-cover opacity-25 mix-blend-overlay" />
          )}
          <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/15 blur-3xl" />
          <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }} className="relative max-w-3xl">
            {p.badge && <motion.p variants={rise} className="text-xs font-bold uppercase tracking-[0.2em] opacity-80">{p.badge}</motion.p>}
            <motion.h1 variants={rise} className="mt-4 text-5xl font-black leading-[1] tracking-tight sm:text-7xl">
              {p.titleLine1} {p.titleHighlight && <span className="opacity-80">{p.titleHighlight}</span>}
            </motion.h1>
            <motion.p variants={rise} className="mt-6 max-w-xl text-lg opacity-90">{p.description}</motion.p>
            <motion.div variants={rise} className="mt-9 flex flex-wrap items-center gap-4 [&_a:first-child]:bg-white [&_a:first-child]:text-slate-900 [&_a:last-child:not(:first-child)]:border-white/40 [&_a:last-child:not(:first-child)]:bg-white/10 [&_a:last-child:not(:first-child)]:text-white">
              <Buttons p={p} tone="solid" />
            </motion.div>
          </motion.div>
        </div>
        {cards.length > 0 && (
          <div className="relative -mt-10 grid gap-4 px-4 sm:grid-cols-2 sm:px-10 lg:max-w-2xl">
            {cards.map((c) => (
              <div key={c.title} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background p-4 shadow-xl shadow-black/5">
                <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-primary/10 text-primary"><c.icon className="size-5" /></span>
                <div>
                  <p className="text-sm font-bold text-foreground">{c.title}</p>
                  <p className="text-xs text-muted-foreground">{c.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
