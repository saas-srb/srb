"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ChevronRight, type LucideIcon } from "lucide-react";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

/**
 * Alternate renderers for the `page-hero` section type (theme variants
 * "minimal" and "banner") — same props as `PageHero`, different structure.
 */
interface Props {
  category: string;
  categoryLabel: string;
  title: string;
  subtitle: React.ReactNode;
  description: React.ReactNode;
  icon: LucideIcon;
  image: string;
  primaryCta?: { label: string; href: string; external?: boolean };
  crumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

const fade = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

function Crumbs({ category, categoryLabel, title, crumbs, tone }: Pick<Props, "category" | "categoryLabel" | "title" | "crumbs"> & { tone: string }) {
  const l = useUiLabels();
  const items = crumbs ?? [{ label: l.breadcrumbHome, href: "/" }, { label: categoryLabel, href: `/${category}` }, { label: title }];
  return (
    <div className={`mb-6 flex flex-wrap items-center gap-1.5 text-sm font-medium ${tone}`}>
      {items.map((c, i) => (
        <React.Fragment key={`${c.label}-${i}`}>
          {i > 0 && <ChevronRight className="size-3.5" />}
          {c.href && i < items.length - 1 ? <Link href={c.href} className="capitalize transition-colors hover:text-primary">{c.label}</Link> : <span className="capitalize">{c.label}</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

function Cta({ cta, className }: { cta: NonNullable<Props["primaryCta"]>; className: string }) {
  const body = <>{cta.label} <ArrowRight className="size-4" /></>;
  return cta.external ? <a href={cta.href} className={className}>{body}</a> : <Link href={cta.href} className={className}>{body}</Link>;
}

/** Left-aligned heading on a soft gradient — no photo. */
export function PageHeroMinimal({ category, categoryLabel, title, subtitle, description, icon: Icon, primaryCta, crumbs, actions, children }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-border/50 bg-background pb-16 pt-24 sm:pb-20 sm:pt-28">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/20" />
      <div className="relative mx-auto max-w-5xl px-6 lg:px-8">
        <Crumbs category={category} categoryLabel={categoryLabel} title={title} crumbs={crumbs} tone="text-muted-foreground" />
        <motion.div initial="hidden" animate="visible" variants={fade}>
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Icon className="size-3.5" /> {categoryLabel}
          </span>
          <h1 className="text-4xl font-black leading-[1.08] tracking-tight text-foreground sm:text-6xl">{title}</h1>
          {subtitle && <p className="mt-4 text-xl font-medium text-primary">{subtitle}</p>}
          {description && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{description}</p>}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            {actions ?? (primaryCta && <Cta cta={primaryCta} className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-bold text-background transition-transform hover:scale-105" />)}
          </div>
        </motion.div>
        {children}
      </div>
    </section>
  );
}

/** Full-width photo banner with the heading over it. */
export function PageHeroBanner({ category, categoryLabel, title, subtitle, description, icon: Icon, image, primaryCta, crumbs, actions, children }: Props) {
  return (
    <section className="relative overflow-hidden bg-slate-950 pb-20 pt-28 text-white sm:pb-28 sm:pt-36">
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- CMS image (any host)
        <img src={image} alt="" className="absolute inset-0 size-full object-cover opacity-50" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-950/30" />
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <Crumbs category={category} categoryLabel={categoryLabel} title={title} crumbs={crumbs} tone="text-white/70" />
        <motion.div initial="hidden" animate="visible" variants={fade} className="max-w-3xl">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider backdrop-blur-sm">
            <Icon className="size-3.5 text-primary" /> {categoryLabel}
          </span>
          <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">{title}</h1>
          {subtitle && <p className="mt-4 text-xl font-medium text-primary">{subtitle}</p>}
          {description && <p className="mt-5 text-lg leading-relaxed text-white/80">{description}</p>}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            {actions ?? (primaryCta && <Cta cta={primaryCta} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-transform hover:scale-105" />)}
          </div>
        </motion.div>
        {children}
      </div>
    </section>
  );
}
