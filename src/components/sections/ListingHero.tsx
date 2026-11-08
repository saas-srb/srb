"use client";

import React from "react";
import { motion } from "framer-motion";
import { Sparkles, LucideIcon } from "lucide-react";
import { useSiteInfo } from "@/components/products/sitecraft-ai/SiteInfoContext";
import type { BrandName } from "@/lib/brand";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = { visible: { transition: { staggerChildren: 0.1 } } };

interface ListingHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  image: string;
  /** Optional extra content under the description (e.g. call-to-action buttons). Omitted, the hero is unchanged. */
  children?: React.ReactNode;
}

// Renders the hero title as-is, except any brand-name mention gets the same
// two-tone brand treatment used in Header/Footer (the first part in the page colour, the second in the accent colour).
function renderTitle(title: string, brand: BrandName) {
  const name = brand.namePrimary + brand.nameAccent;
  const idx = name ? title.indexOf(name) : -1;
  if (idx === -1) return title;
  return (
    <>
      {title.slice(0, idx)}
      <span className="text-foreground">{brand.namePrimary}</span>
      <span className="text-primary">{brand.nameAccent}</span>
      {title.slice(idx + name.length)}
    </>
  );
}

export default function ListingHero({ eyebrow, title, description, icon: Icon, image, children }: ListingHeroProps) {
  const { brand } = useSiteInfo();
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => setMousePosition({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <section className="relative overflow-hidden bg-background pt-28 pb-20 lg:pt-36 lg:pb-32 border-b border-border/50">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        <div
          className="absolute inset-0 bg-background"
          style={{
            maskImage: "linear-gradient(to bottom, transparent 0%, black 65%, black 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 65%, black 100%)",
          }}
        ></div>
        <div
          className="absolute inset-0 bg-background"
          style={{
            maskImage: "linear-gradient(to right, black 0%, transparent 30%, transparent 70%, black 100%)",
            WebkitMaskImage: "linear-gradient(to right, black 0%, transparent 30%, transparent 70%, black 100%)",
          }}
        ></div>
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-primary/15 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob"></div>
        <div className="absolute top-[10%] right-[5%] w-[50%] h-[50%] rounded-full bg-secondary/15 blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-[20%] left-[20%] w-[70%] h-[70%] rounded-full bg-brand-accent/15 blur-[140px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-4000"></div>
      </div>

      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid-slate-900/[0.02] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent)]"></div>
        <div
          className="absolute inset-0 bg-grid-slate-900/[0.08] dark:bg-grid-slate-400/[0.08]"
          style={{
            WebkitMaskImage: `radial-gradient(400px circle at ${mousePosition.x}px ${mousePosition.y}px, black, transparent 80%)`,
            maskImage: `radial-gradient(400px circle at ${mousePosition.x}px ${mousePosition.y}px, black, transparent 80%)`,
          }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center relative z-10">
        <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-2xl mx-auto space-y-6">
          <motion.div
            variants={fadeIn}
            className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-xl shadow-primary/20"
          >
            <Icon className="w-8 h-8 text-white" />
          </motion.div>
          <motion.div
            variants={fadeIn}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 border border-border/50 text-sm font-medium text-foreground backdrop-blur-sm mx-auto shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            <span className="capitalize">{eyebrow}</span>
          </motion.div>
          <motion.h1 variants={fadeIn} className="text-5xl font-black tracking-tight text-foreground sm:text-7xl mb-6">
            {renderTitle(title, brand)}
          </motion.h1>
          <motion.p variants={fadeIn} className="mx-auto max-w-2xl text-xl leading-relaxed text-muted-foreground">
            {description}
          </motion.p>
          {children && (
            <motion.div variants={fadeIn} className="flex flex-wrap items-center justify-center gap-4 pt-2">
              {children}
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
