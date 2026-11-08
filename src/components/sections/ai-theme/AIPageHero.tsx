"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, ArrowRight, Terminal, LucideIcon } from "lucide-react";

/**
 * The "AI Technology" theme's alternate renderer for the `page-hero` section
 * type — consumes the exact same props as `src/components/sections/PageHero.tsx`
 * (same `toProps` in the registry, no content-shape change), but is a
 * genuinely distinct visual: dark/terminal aesthetic instead of the default
 * theme's warm photo-hero. This is the concrete proof that one CMS content
 * shape can render through two different components depending on the active
 * theme — see `src/lib/sitecraft-ai/theme-components.ts`.
 */

interface AIPageHeroProps {
  category: string;
  categoryLabel: string;
  title: string;
  subtitle: React.ReactNode;
  description: React.ReactNode;
  icon: LucideIcon;
  image: string;
  primaryCta?: { label: string; href: string; external?: boolean };
}

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };
const stagger = { visible: { transition: { staggerChildren: 0.08 } } };

export default function AIPageHero({
  category,
  categoryLabel,
  title,
  subtitle,
  description,
  icon: Icon,
  primaryCta = { label: "Start a Project", href: "/contact", external: false },
}: AIPageHeroProps) {
  return (
    <section className="relative overflow-hidden bg-[#05060a] pt-28 sm:pt-32 lg:pt-36 pb-20 sm:pb-24 border-b border-white/10">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,179,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(99,179,255,0.08)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,black,transparent)]" />
        <div className="absolute -top-[10%] left-1/3 w-[50%] h-[50%] rounded-full bg-primary/25 blur-[140px]" />
        <div className="absolute top-[20%] right-[5%] w-[35%] h-[35%] rounded-full bg-[#6366f1]/25 blur-[120px]" />
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <motion.div initial="hidden" animate="visible" variants={stagger} className="mx-auto max-w-3xl text-center">
          <motion.div variants={fadeIn} className="flex items-center justify-center gap-2 text-xs font-mono text-white/50 mb-6">
            <Link href="/" className="hover:text-primary transition-colors">
              ~
            </Link>
            <ChevronRight className="w-3 h-3" />
            <Link href={`/${category}`} className="hover:text-primary transition-colors lowercase">
              {categoryLabel}
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-white/80 lowercase">{title.toLowerCase().replace(/\s+/g, "-")}</span>
          </motion.div>

          <motion.div
            variants={fadeIn}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-xs font-mono font-medium text-primary mb-8"
          >
            <Terminal className="w-3.5 h-3.5" />
            <Icon className="w-3.5 h-3.5" />
            <span className="lowercase tracking-wide">{categoryLabel}.init()</span>
          </motion.div>

          <motion.h1 variants={fadeIn} className="text-5xl sm:text-6xl font-black tracking-tight text-white mb-6 leading-[1.05]">
            {title}
          </motion.h1>
          <motion.p variants={fadeIn} className="text-xl font-medium text-primary mb-4">
            {subtitle}
          </motion.p>
          <motion.p variants={fadeIn} className="text-lg leading-relaxed text-white/60 max-w-2xl mx-auto mb-10">
            {description}
          </motion.p>

          <motion.div variants={fadeIn} className="flex flex-wrap items-center justify-center gap-4">
            {primaryCta.external ? (
              <a
                href={primaryCta.href}
                className="group inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/30"
              >
                {primaryCta.label} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
            ) : (
              <Link
                href={primaryCta.href}
                className="group inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/30"
              >
                {primaryCta.label} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            )}
            <Link
              href={`/${category}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-mono font-medium text-white/70 bg-white/5 border border-white/15 hover:bg-white/10 transition-all lowercase"
            >
              view --all {categoryLabel}
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
