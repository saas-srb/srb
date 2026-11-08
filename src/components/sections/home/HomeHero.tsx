"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Play, CheckCircle2, Zap } from "lucide-react";
import { useSiteInfo } from "@/components/products/sitecraft-ai/SiteInfoContext";
import type { BrandName } from "@/lib/brand";

/**
 * Extracted verbatim from the former `src/app/(site)/Content.tsx` hero
 * region (lines 314-506) — only the mouse-tracking state (previously
 * top-level `HomeContent` state) moved in, since nothing else on the
 * homepage reads it. Visual/decorative markup is untouched; only text + CTA
 * links are CMS-editable props.
 */

const fadeIn = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8 } } };
const stagger = { visible: { transition: { staggerChildren: 0.1 } } };

/**
 * Restores the original hero's two-tone brand wordmark inside the
 * CMS-editable description (plain text can't carry that styling, so the
 * word is re-styled at render time). Same markup the hardcoded hero used.
 */
function brandWordmark(text: string, brand: BrandName): React.ReactNode {
  const name = brand.namePrimary + brand.nameAccent;
  if (!name || !text.includes(name)) return text;
  return text
    .split(name)
    .flatMap((part, i) => (i === 0 ? [part] : [name, part]))
    .filter(Boolean)
    .map((part, i) =>
      part === name ? (
        <span key={i} className="font-bold"><span className="text-foreground">{brand.namePrimary}</span><span className="text-primary">{brand.nameAccent}</span></span>
      ) : (
        part
      )
    );
}

export interface HomeHeroProps {
  badge: string;
  titleLine1: string;
  titleHighlight: string;
  description: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  chipOne: string;
  chipTwo: string;
  chipThree: string;
  statusTitle: string;
  statusText: string;
  perfTitle: string;
  perfText: string;
  scrollLabel: string;
  /** Background photo; empty = the built-in one. */
  image?: string;
}

export default function HomeHero({
  badge,
  titleLine1,
  titleHighlight,
  description,
  primaryCtaLabel,
  primaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
  chipOne,
  chipTwo,
  chipThree,
  statusTitle,
  statusText,
  perfTitle,
  perfText,
  scrollLabel,
  image,
}: HomeHeroProps) {
  const { brand } = useSiteInfo();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [absMousePosition, setAbsMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setAbsMousePosition({ x: e.clientX, y: e.clientY });
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <section className="relative bg-background pt-28 pb-20 lg:pt-36 lg:pb-32 min-h-screen flex items-center justify-center overflow-hidden border-b border-border/50">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image || "https://images.unsplash.com/photo-1519389950473-47ba0277781c?q=80&w=1600&auto=format&fit=crop"}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-background/90 lg:hidden"></div>
        <div
          className="absolute inset-0 bg-background hidden lg:block"
          style={{
            maskImage: "linear-gradient(to right, black 0%, black 45%, transparent 92%)",
            WebkitMaskImage: "linear-gradient(to right, black 0%, black 45%, transparent 92%)",
          }}
        ></div>
        <div
          className="absolute inset-0 bg-background hidden lg:block"
          style={{
            maskImage: "linear-gradient(to top, black 0%, transparent 40%)",
            WebkitMaskImage: "linear-gradient(to top, black 0%, transparent 40%)",
          }}
        ></div>
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-primary/15 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob"></div>
        <div className="absolute top-[20%] right-[5%] w-[40vw] h-[40vw] rounded-full bg-secondary/15 blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-[20%] left-[20%] w-[60vw] h-[60vw] rounded-full bg-brand-accent/15 blur-[140px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-4000"></div>
      </div>

      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid-slate-900/[0.02] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent)]"></div>
        <div
          className="absolute inset-0 bg-grid-slate-900/[0.08] dark:bg-grid-slate-400/[0.08]"
          style={{
            WebkitMaskImage: "radial-gradient(500px circle at " + absMousePosition.x + "px " + absMousePosition.y + "px, black, transparent 80%)",
            maskImage: "radial-gradient(500px circle at " + absMousePosition.x + "px " + absMousePosition.y + "px, black, transparent 80%)",
          }}
        />
      </div>

      <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden hidden lg:block">
        <motion.div
          animate={{ x: mousePosition.x * -1.5, y: mousePosition.y * -1.5, rotate: mousePosition.x * 0.5 }}
          transition={{ type: "spring", stiffness: 40, damping: 20 }}
          className="absolute top-[20%] left-[10%] opacity-20"
        >
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 0L24.4903 15.5097L40 20L24.4903 24.4903L20 40L15.5097 24.4903L0 20L15.5097 15.5097L20 0Z" fill="currentColor" className="text-primary" />
          </svg>
        </motion.div>
        <motion.div
          animate={{ x: mousePosition.x * 2, y: mousePosition.y * 2, rotate: mousePosition.y * -0.5 }}
          transition={{ type: "spring", stiffness: 30, damping: 25 }}
          className="absolute bottom-[25%] right-[15%] opacity-20"
        >
          <div className="w-16 h-16 border border-secondary rounded-full"></div>
        </motion.div>
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-2xl">
            <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/40 border border-border/50 text-sm font-medium text-foreground backdrop-blur-md mb-8 shadow-sm">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              <span>{badge}</span>
            </motion.div>

            <motion.h1 variants={fadeIn} className="text-5xl font-black tracking-tighter text-foreground sm:text-7xl leading-[1.1] mb-6">
              {titleLine1} <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-brand-accent to-primary bg-300% animate-gradient">{titleHighlight}</span>
            </motion.h1>

            <motion.p variants={fadeIn} className="text-lg sm:text-xl leading-relaxed text-muted-foreground mb-10 max-w-lg">
              {brandWordmark(description, brand)}
            </motion.p>

            <motion.div variants={fadeIn} className="flex flex-col sm:flex-row items-start gap-4">
              <Link
                href={primaryCtaHref}
                className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-foreground px-8 py-4 text-sm font-bold text-background transition-all hover:scale-105 active:scale-95 shadow-xl shadow-foreground/20"
              >
                <span className="relative z-10 flex items-center gap-2">
                  {primaryCtaLabel} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </Link>
              <Link
                href={secondaryCtaHref}
                className="group inline-flex items-center justify-center gap-2 rounded-full px-8 py-4 text-sm font-bold text-foreground bg-muted/30 border border-border/50 hover:bg-muted/60 backdrop-blur-sm transition-all shadow-sm"
              >
                <Play className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" fill="currentColor" />
                {secondaryCtaLabel}
              </Link>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9, rotateY: -10 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative hidden lg:block perspective-1000"
          >
            <motion.div
              animate={{ rotateX: mousePosition.y * 0.5, rotateY: mousePosition.x * 0.5 }}
              transition={{ type: "spring", stiffness: 100, damping: 30 }}
              className="relative w-full aspect-square max-w-lg mx-auto"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-secondary/20 rounded-[2.5rem] blur-2xl opacity-50 animate-pulse"></div>
              <div className="relative h-full w-full bg-background/40 backdrop-blur-xl border border-border/60 rounded-[2.5rem] shadow-2xl p-6 flex flex-col gap-4 overflow-hidden">
                <div className="flex justify-between items-center border-b border-border/50 pb-4">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400/80"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-400/80"></div>
                    <div className="w-3 h-3 rounded-full bg-green-400/80"></div>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-primary/10 text-primary">{chipOne}</span>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-secondary/20 text-secondary-foreground">{chipTwo}</span>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-brand-accent/15 text-brand-accent">{chipThree}</span>
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <div className="col-span-2 h-32 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-2xl border border-border/30 relative overflow-hidden">
                    <div className="absolute bottom-0 w-full h-1/2 bg-gradient-to-t from-primary/20 to-transparent"></div>
                    <svg className="absolute bottom-0 w-full h-24 text-primary/40" preserveAspectRatio="none" viewBox="0 0 100 100">
                      <path d="M0,100 C20,80 40,100 60,60 C80,20 100,60 100,60 L100,100 Z" fill="currentColor" />
                    </svg>
                  </div>
                  <div className="h-24 bg-muted/30 rounded-2xl border border-border/30 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin" style={{ animationDuration: "3s" }}></div>
                  </div>
                  <div className="h-24 bg-muted/30 rounded-2xl border border-border/30 p-4 flex flex-col gap-2 justify-center">
                    <div className="w-3/4 h-2 bg-foreground/20 rounded-full"></div>
                    <div className="w-1/2 h-2 bg-foreground/20 rounded-full"></div>
                    <div className="w-full h-2 bg-foreground/20 rounded-full"></div>
                  </div>
                </div>
              </div>

              <motion.div
                animate={{ y: [0, -15, 0] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="absolute -right-8 top-16 p-4 bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-xl flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <div className="text-sm font-bold">{statusTitle}</div>
                  <div className="text-xs text-muted-foreground">{statusText}</div>
                </div>
              </motion.div>

              <motion.div
                animate={{ y: [0, 20, 0] }}
                transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
                className="absolute -left-12 bottom-24 p-4 bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-xl flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-bold">{perfTitle}</div>
                  <div className="text-xs text-muted-foreground">{perfText}</div>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-muted-foreground"
      >
        <span className="text-[10px] font-bold tracking-[0.2em] uppercase">{scrollLabel}</span>
        <div className="w-[1px] h-16 bg-gradient-to-b from-muted-foreground/50 to-transparent"></div>
      </motion.div>
    </section>
  );
}
