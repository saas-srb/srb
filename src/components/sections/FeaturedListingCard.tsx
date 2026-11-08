"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Sparkles, LucideIcon } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

interface FeaturedListingCardProps {
  icon: LucideIcon;
  badge: string;
  badgeIcon: LucideIcon;
  title: string;
  subtitle: React.ReactNode;
  description: React.ReactNode;
  highlights: string[];
  href: string;
  image: string;
  ctaLabel?: string;
  footnote?: React.ReactNode;
  /**
   * Replaces the card's single "button" with real links (a card that is one big link cannot hold other links).
   * When set, `href` is unused and the card itself is not a link.
   */
  actions?: React.ReactNode;
  /** Overrides the default top-left "Featured" label. */
  featuredLabel?: string;
}

export default function FeaturedListingCard({
  icon: Icon,
  badge,
  badgeIcon: BadgeIcon,
  title,
  subtitle,
  description,
  highlights,
  href,
  image,
  ctaLabel: ctaLabelProp,
  footnote,
  actions,
  featuredLabel,
}: FeaturedListingCardProps) {
  const l = useUiLabels();
  const ctaLabel = ctaLabelProp ?? l.exploreMoreFeatured;
  // The whole card is one link, unless it carries its own action links.
  const Wrapper = (actions ? "div" : Link) as React.ElementType;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6 }}
      className="group/featured relative"
    >
      <div className="absolute -inset-1 rounded-[2.75rem] bg-gradient-to-br from-primary/30 via-primary/0 to-secondary/30 opacity-0 group-hover/featured:opacity-100 blur-2xl transition-opacity duration-500 pointer-events-none" />

      <Wrapper
        {...(actions ? {} : { href, "aria-label": `${title} — ${ctaLabel}` })}
        className="relative grid grid-cols-1 lg:grid-cols-2 overflow-hidden rounded-[2.5rem] bg-background/90 dark:bg-muted/10 backdrop-blur-md border border-border/60 shadow-md hover:border-primary/40 transition-all duration-500 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="relative aspect-[16/10] lg:aspect-auto overflow-hidden">
          <Image
            src={image}
            alt=""
            fill
            sizes="(min-width: 1024px) 700px, 100vw"
            priority
            className="object-cover scale-105 group-hover/featured:scale-110 transition-transform duration-700 ease-out"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent lg:bg-gradient-to-r lg:from-black/20 lg:via-black/0 lg:to-transparent" />
          <span className="absolute top-6 left-6 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/30">
            <Sparkles className="w-3 h-3" />
            {featuredLabel ?? l.featured}
          </span>
          <div className="absolute bottom-6 left-6 w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-xl lg:hidden">
            <Icon className="w-7 h-7 text-white" />
          </div>
        </div>

        <div className="relative z-10 flex flex-col justify-center p-8 sm:p-10 lg:p-12">
          <div className="flex items-center justify-between mb-5">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-primary to-secondary" />
              {subtitle}
            </span>
            <span className="hidden lg:inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground bg-background/70 border border-border/50 px-2.5 py-1 rounded-full backdrop-blur-sm">
              <BrandMark className="w-3.5 h-3.5" />
              <BadgeIcon className="w-3 h-3 text-primary flex-none" />
              {badge}
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-foreground mb-4 leading-[1.15] group-hover/featured:text-primary transition-colors">
            {title}
          </h2>

          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed mb-6">{description}</p>

          <div className="flex flex-wrap gap-2 mb-6">
            {highlights.map((h) => (
              <span
                key={h}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground bg-background border border-border/60 px-2.5 py-1 rounded-full"
              >
                <CheckCircle2 className="w-3 h-3 text-primary flex-none" />
                {h}
              </span>
            ))}
          </div>

          {footnote && (
            <p className="text-sm text-muted-foreground mb-6 -mt-1">
              <span className="font-semibold text-foreground">{l.bestForListing}</span> {footnote}
            </p>
          )}

          {actions ?? (
            <span className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-7 py-3.5 text-sm font-bold text-background w-fit transition-all shadow-lg shadow-foreground/10 group-hover/featured:bg-primary group-hover/featured:text-primary-foreground group-hover/featured:shadow-primary/30 group-hover/featured:scale-105">
              {ctaLabel}
              <ArrowRight className="w-4 h-4 group-hover/featured:translate-x-1 transition-transform" />
            </span>
          )}
        </div>
      </Wrapper>
    </motion.div>
  );
}
