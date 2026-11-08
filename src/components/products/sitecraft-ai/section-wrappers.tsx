"use client";

/**
 * Thin, purpose-built wrappers for section components that don't self-wrap in
 * a `<section>` (they're meant to be hand-composed by the page). Each wrapper
 * reproduces the exact markup the page used to hand-write around the
 * component — the underlying leaf component itself is reused untouched.
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import FeatureHighlights from "@/components/sections/FeatureHighlights";
import FeaturedListingCard from "@/components/sections/FeaturedListingCard";
import ListingCard from "@/components/sections/ListingCard";
import SectionHeader from "@/components/sections/SectionHeader";
import LegalSection from "@/components/sections/LegalSection";
import TechShowcase, { type TechCategory } from "@/components/sections/TechShowcase";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

export function FeatureHighlightsSection({
  title,
  features,
  tone = "default",
}: {
  title?: string;
  features: { name: string; desc: string }[];
  tone?: "default" | "muted";
}) {
  return (
    <section className={`py-24 sm:py-32 ${tone === "muted" ? "bg-muted/10" : "bg-background"} relative`}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <FeatureHighlights title={title} features={features} />
      </div>
    </section>
  );
}

export interface PillarCardConfig {
  title: string;
  subtitle: string;
  description: string;
  href: string;
  icon: LucideIcon;
  image: string;
  highlights: string[];
  badge?: string;
  badgeIcon?: LucideIcon;
  ctaLabel?: string;
}

export function ServicePillarsGrid({
  sectionLabel: sectionLabelProp,
  featured,
  items,
}: {
  sectionLabel?: string;
  featured: PillarCardConfig;
  items: PillarCardConfig[];
}) {
  const l = useUiLabels();
  const sectionLabel = sectionLabelProp ?? l.morePillars;
  return (
    <section className="py-24 sm:py-32 bg-background relative">
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-secondary/20 rounded-full blur-3xl pointer-events-none opacity-50" />
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <div className="mb-16 lg:mb-20">
          <FeaturedListingCard
            icon={featured.icon}
            badge={featured.badge ?? "Services Pillar"}
            badgeIcon={featured.badgeIcon ?? featured.icon}
            title={featured.title}
            subtitle={featured.subtitle}
            description={featured.description}
            highlights={featured.highlights}
            href={featured.href}
            image={featured.image}
            ctaLabel={featured.ctaLabel}
          />
        </div>

        {items.length > 0 && (
          <>
            <div className="flex items-center gap-3 mb-10">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{sectionLabel}</h2>
              <div className="h-px flex-1 bg-border/50" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6 lg:gap-8">
              {items.map((item, i) => (
                <ListingCard
                  key={item.href}
                  index={i}
                  icon={<item.icon className="w-7 h-7" />}
                  badge={item.badge ?? "Service Pillar"}
                  badgeIcon={item.badgeIcon ?? item.icon}
                  title={item.title}
                  subtitle={item.subtitle}
                  description={item.description}
                  highlights={item.highlights}
                  href={item.href}
                  image={item.image}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export interface ListingItemConfig {
  title: string;
  subtitle: string;
  description: ReactNode;
  href: string;
  icon: LucideIcon;
  image: string;
  highlights: string[];
}

/**
 * The hub pages' listing grid (Industries, Software Development, Training,
 * About, …): first item as a featured card, the rest as a 3-column grid —
 * the exact markup those pages hand-wrote around the untouched card
 * components.
 */
export function ListingGrid({
  badge,
  badgeIcon,
  sectionLabel,
  ctaLabel,
  items,
}: {
  badge: string;
  badgeIcon: LucideIcon;
  sectionLabel: string;
  ctaLabel?: string;
  items: ListingItemConfig[];
}) {
  const [featured, ...rest] = items;
  if (!featured) return null;
  return (
    <section className="py-24 sm:py-32 bg-background relative">
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-secondary/20 rounded-full blur-3xl pointer-events-none opacity-50"></div>
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <div className="mb-16 lg:mb-20">
          <FeaturedListingCard
            icon={featured.icon}
            badge={badge}
            badgeIcon={badgeIcon}
            title={featured.title}
            subtitle={featured.subtitle}
            description={featured.description}
            highlights={featured.highlights}
            href={featured.href}
            image={featured.image}
            ctaLabel={ctaLabel}
          />
        </div>

        <div className="flex items-center gap-3 mb-10">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{sectionLabel}</h2>
          <div className="h-px flex-1 bg-border/50" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {rest.map((item, i) => (
            <ListingCard
              key={item.href}
              index={i}
              icon={<item.icon className="w-7 h-7" />}
              badge={badge}
              badgeIcon={badgeIcon}
              title={item.title}
              subtitle={item.subtitle}
              description={item.description}
              highlights={item.highlights}
              href={item.href}
              image={item.image}
              ctaLabel={ctaLabel}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/** A titled paragraph on a muted product (e.g. About › Our Mission's "Our vision"). */
export function TextPanel({ title, body }: { title: string; body: ReactNode }) {
  return (
    <section className="pb-24 sm:pb-32 bg-background relative">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="p-8 sm:p-10 rounded-3xl bg-muted/20 border border-border/50">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-6">{title}</h2>
          <p className="text-lg leading-8 text-muted-foreground">{body}</p>
        </div>
      </div>
    </section>
  );
}

/** Section header + the searchable technology catalogue (About › Technologies). */
export function TechShowcaseSection({
  eyebrow,
  headerIcon,
  heading,
  description,
  categories,
  searchPlaceholder,
}: {
  eyebrow: string;
  headerIcon: LucideIcon;
  heading: string;
  description: string;
  categories: TechCategory[];
  searchPlaceholder: string;
}) {
  return (
    <section className="py-24 sm:py-32 bg-background relative">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeader category={eyebrow} icon={headerIcon} heading={heading} description={description} />
        <TechShowcase categories={categories} searchPlaceholder={searchPlaceholder} />
      </div>
    </section>
  );
}

export interface LegalSectionConfig {
  id: string;
  title: string;
  tocLabel: string;
  icon: LucideIcon;
  paragraphs: ReactNode[];
  bullets?: string[];
}

/** A legal document: sticky "on this page" contents + its sections (About › Privacy Policy, Terms, …). */
export function LegalDocument({ sections }: { sections: LegalSectionConfig[] }) {
  const l = useUiLabels();
  return (
    <section className="py-24 sm:py-32 bg-background relative">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-4 hidden lg:block">
            <div className="sticky top-32 p-6 rounded-2xl bg-muted/30 border border-border/50">
              <h3 className="text-lg font-bold text-foreground mb-4">{l.onThisPage}</h3>
              <ul className="space-y-3">
                {sections.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                      {item.tocLabel}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-12">
            {sections.map((s) => (
              <LegalSection key={s.id} id={s.id} title={s.title} icon={s.icon} paragraphs={s.paragraphs} bullets={s.bullets} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** A row of small tag chips under a hero (e.g. the live demo page). */
export function TagStrip({ tags }: { tags: string[] }) {
  return (
    <div className="py-8 bg-background border-b border-border/50">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span key={tag} className="text-xs font-semibold text-foreground bg-muted/40 border border-border/60 px-3 py-1.5 rounded-full">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
