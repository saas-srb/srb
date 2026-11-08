"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import { ArrowRight, CheckCircle2, LucideIcon } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

interface ListingCardProps {
  icon: React.ReactNode;
  index: number;
  badge: string;
  badgeIcon: LucideIcon;
  title: string;
  subtitle: React.ReactNode;
  description: React.ReactNode;
  highlights: string[];
  href: string;
  image: string;
  ctaLabel?: string;
  /** Optional short line rendered under the highlight tags, e.g. "Best for: ...". */
  footnote?: React.ReactNode;
  /** Highlights the card as the recommended pick with a "Most Popular" ribbon. */
  featured?: boolean;
}

export default function ListingCard({
  icon: ProductMark,
  index,
  badgeIcon: BadgeIcon,
  title,
  subtitle,
  description,
  highlights,
  href,
  image,
  ctaLabel: ctaLabelProp,
  footnote,
  featured = false,
}: ListingCardProps) {
  const l = useUiLabels();
  const ctaLabel = ctaLabelProp ?? l.exploreMore;
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const springConfig = { stiffness: 200, damping: 20, mass: 0.5 };
  const rotateX = useSpring(useTransform(mouseY, [0, 1], [3, -3]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [0, 1], [-3, 3]), springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  };
  const handleMouseLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: (index % 6) * 0.08 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformPerspective: 1000 }}
      className="group/card relative h-full"
    >
      {featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-brand-accent text-primary-foreground px-4 py-1.5 text-xs font-bold uppercase tracking-wider shadow-lg shadow-primary/30">
          {l.mostPopular}
        </span>
      )}

      <div
        className={`absolute -inset-1 rounded-[2rem] bg-gradient-to-br from-primary/30 via-primary/0 to-secondary/30 opacity-0 group-hover/card:opacity-100 blur-xl transition-opacity duration-500 pointer-events-none ${
          featured ? "opacity-40" : ""
        }`}
      />

      <Link
        href={href}
        aria-label={`${title} — ${ctaLabel}`}
        className={`relative flex flex-col h-full overflow-hidden rounded-3xl bg-background/90 dark:bg-muted/10 backdrop-blur-md p-8 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          featured ? "border-2 border-primary shadow-lg shadow-primary/10" : "border border-border/60 shadow-md hover:border-primary/40"
        }`}
      >
        {/* Ambient color wash, sampled from the item's real image, kept abstract and soft */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <Image
            src={image}
            alt=""
            fill
            sizes="400px"
            className="object-cover scale-125 blur-2xl opacity-[0.07] group-hover/card:opacity-[0.14] transition-opacity duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/5 to-muted/20" />
        </div>

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/15 to-secondary/15 border border-primary/20 flex items-center justify-center group-hover/card:from-primary group-hover/card:to-brand-accent group-hover/card:border-primary group-hover/card:shadow-lg group-hover/card:shadow-primary/20 group-hover/card:scale-110 group-hover/card:rotate-3 transition-all duration-300">
              {ProductMark}
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground bg-background/70 border border-border/50 px-2.5 py-1 rounded-full backdrop-blur-sm group-hover/card:border-primary/30 group-hover/card:text-foreground transition-colors duration-300">
              <BrandMark className="w-3.5 h-3.5" />
              <BadgeIcon className="w-3 h-3 text-primary flex-none" />
              {String(index + 1).padStart(2, "0")}
            </span>
          </div>

          <h3 className="text-xl font-bold text-foreground mb-1.5 leading-snug group-hover/card:text-primary transition-colors">
            {title}
          </h3>
          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-4">{subtitle}</p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6 line-clamp-3 flex-1">{description}</p>

          <div className="flex flex-wrap gap-2 mb-6">
            {highlights.map((h) => (
              <span
                key={h}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground bg-background border border-border/60 px-2.5 py-1 rounded-full group-hover/card:border-primary/30 group-hover/card:bg-primary/5 transition-colors duration-300"
              >
                <CheckCircle2 className="w-3 h-3 text-primary flex-none" />
                {h}
              </span>
            ))}
          </div>

          {footnote && (
            <p className="text-sm text-muted-foreground mb-6 -mt-2">
              <span className="font-semibold text-foreground">{l.bestForListing}</span> {footnote}
            </p>
          )}

          <div className="pt-6 border-t border-border/50 mt-auto">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-foreground group-hover/card:text-primary group-hover/card:gap-3 transition-all">
              {ctaLabel} <ArrowRight className="w-4 h-4 group-hover/card:translate-x-1 transition-transform" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
