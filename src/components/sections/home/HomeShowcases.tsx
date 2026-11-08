"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, type LucideIcon } from "lucide-react";
import SectionHeader from "@/components/sections/SectionHeader";
import SubscriptionCard from "@/components/sections/SubscriptionCard";
import { useEngagementModels } from "@/components/products/sitecraft-ai/CollectionsContext";
import { HomeFooterLink } from "./HomeCardGrids";
import type { HomeSectionHeaderProps } from "./types";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

/**
 * The homepage's three interactive/data-linked sections, extracted verbatim
 * from the former `src/app/(site)/Content.tsx` (sections 8, 9, 10). Hover
 * state that used to live on `HomeContent` moved into each section — nothing
 * else on the page read it.
 */

function Header({ eyebrow, headerIcon, heading, accent, description }: HomeSectionHeaderProps) {
  return (
    <SectionHeader align="center" category={eyebrow} icon={headerIcon} heading={heading} accent={accent} description={description} className="mx-auto" />
  );
}

function ViewAllLink({ label, href, circleClass }: { label: string; href: string; circleClass: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5 }}
      className="mt-14 flex justify-center"
    >
      <Link href={href} className="group inline-flex items-center gap-3 text-sm font-bold text-foreground hover:text-primary transition-colors">
        {label}
        <span className={`w-10 h-10 rounded-full ${circleClass} border border-border/50 flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-all duration-300`}>
          <ArrowRight className="w-4 h-4 group-hover:text-primary-foreground group-hover:translate-x-0.5 transition-all" />
        </span>
      </Link>
    </motion.div>
  );
}

// ── 8. Resource Augmentation preview ─────────────────────────────────────
// The cards themselves come from the resource-augmentation pages' own data
// (`resources-data.ts`, their source of truth) — the CMS picks WHICH
// engagement models to feature, it doesn't hold a second copy of them.

export function HomeResourcePreview({
  categorySlugs,
  featuredSlug,
  featuresLabel,
  ctaLabel,
  linkLabel,
  linkHref,
  ...header
}: HomeSectionHeaderProps & { categorySlugs: string[]; featuredSlug: string; featuresLabel: string; ctaLabel: string; linkLabel?: string; linkHref?: string }) {
  const engagementCategories = useEngagementModels();
  return (
    <section className="py-24 sm:py-32 bg-muted/10 relative overflow-hidden border-b border-border/50">
      <div className="absolute right-0 top-1/3 translate-x-1/3 w-[600px] h-[600px] bg-secondary/20 rounded-full blur-[120px] pointer-events-none opacity-50"></div>
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <Header {...header} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {engagementCategories
            .filter((category) => categorySlugs.includes(category.slug))
            .map((category, idx) => (
              <SubscriptionCard
                key={category.slug}
                index={idx}
                icon={category.icon}
                title={category.title}
                tagline={category.tagline}
                price={category.cardHighlight.pricing}
                billingType={category.cardHighlight.billingType}
                bestFor={category.cardHighlight.idealUseCase}
                features={category.keyBenefits}
                featuresLabel={featuresLabel}
                href={`/resource-augmentation/${category.slug}`}
                ctaLabel={ctaLabel}
                featured={category.slug === featuredSlug}
              />
            ))}
        </div>

        {linkLabel && linkHref && <HomeFooterLink label={linkLabel} href={linkHref} circleClass="bg-background" />}
      </div>
    </section>
  );
}

// ── 9. Industries We Serve ───────────────────────────────────────────────

export interface IndustryPanel {
  title: string;
  subtitle: string;
  desc: string;
  icon: LucideIcon;
  image: string;
  href: string;
  related: string[];
}

export function HomeIndustries({
  industries,
  linkLabel,
  linkHref,
  ...header
}: HomeSectionHeaderProps & { industries: IndustryPanel[]; linkLabel?: string; linkHref?: string }) {
  const [activeIndustry, setActiveIndustry] = useState(0);

  return (
    <section className="py-24 sm:py-32 bg-background relative overflow-hidden">
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/3 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none opacity-50"></div>
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <Header {...header} />

        {/* Horizontal Expanding Accordion Container */}
        <div className="flex flex-col lg:flex-row h-auto lg:h-[600px] gap-4 w-full">
          {industries.map((ind, idx) => (
            <div
              key={idx}
              onMouseEnter={() => setActiveIndustry(idx)}
              className={`relative rounded-[2.5rem] overflow-hidden transition-all duration-700 ease-out border border-border/50 flex flex-col justify-end p-8 cursor-pointer group ${activeIndustry === idx
                ? "lg:flex-[3] shadow-2xl h-[450px] lg:h-auto"
                : "lg:flex-[1] h-[150px] lg:h-auto"
                }`}
            >
              {/* Background Photo */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ind.image}
                alt={ind.title}
                className="absolute inset-0 w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700 ease-out"
              />
              <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/10 transition-opacity duration-700 ${activeIndustry === idx ? "opacity-100" : "opacity-90 group-hover:opacity-80"
                }`}></div>
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/25 mix-blend-overlay"></div>

              <div className="relative z-10 flex flex-col h-full justify-between">
                {/* Top Area: Icon and Collapsed Title (Desktop Only) */}
                <div className="flex flex-col gap-6">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 ${activeIndustry === idx ? "bg-primary text-primary-foreground" : "bg-white/10 backdrop-blur-md text-white group-hover:bg-primary/80"
                    }`}>
                    <ind.icon className="w-5 h-5" />
                  </div>
                  {/* Collapsed rotated text for inactive products on desktop */}
                  <div className={`hidden lg:block transition-all duration-500 origin-left ${activeIndustry === idx ? "opacity-0 max-h-0" : "opacity-100 -rotate-90 translate-y-32 translate-x-4"
                    }`}>
                    <h3 className="text-3xl font-bold text-white/80 whitespace-nowrap">
                      {ind.title}
                    </h3>
                  </div>
                </div>

                {/* Expanded Content Area */}
                <div className={`flex flex-col justify-end overflow-hidden transition-all duration-700 ease-out ${activeIndustry === idx ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                  }`}>
                  <h3 className="text-4xl sm:text-5xl font-bold text-white mb-4">{ind.title}</h3>
                  <p className="text-primary text-sm font-bold uppercase tracking-widest mb-6">{ind.subtitle}</p>
                  <p className="text-white/70 text-lg leading-relaxed mb-6 max-w-lg">
                    {ind.desc}
                  </p>
                  <div className="flex flex-wrap gap-2 mb-8">
                    {ind.related.map((service) => (
                      <span key={service} className="text-xs font-semibold text-white/90 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/20">
                        {service}
                      </span>
                    ))}
                  </div>
                  <Link href={ind.href} className="inline-flex items-center gap-2 text-white font-bold hover:text-primary transition-all w-fit">
                    Explore {ind.title} <ArrowRight className="w-5 h-5" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {linkLabel && linkHref && <ViewAllLink label={linkLabel} href={linkHref} circleClass="bg-muted/50" />}
      </div>
    </section>
  );
}

// ── 10. What We Build ────────────────────────────────────────────────────

export interface BuildService {
  title: string;
  subtitle: string;
  desc: string;
  icon: LucideIcon;
  image: string;
  href: string;
}

export function HomeWhatWeBuild({
  services,
  linkLabel,
  linkHref,
  ...header
}: HomeSectionHeaderProps & { services: BuildService[]; linkLabel?: string; linkHref?: string }) {
  const l = useUiLabels();
  const [activeService, setActiveService] = useState(0);
  const active = services[activeService] ?? services[0];

  return (
    <section className="py-24 sm:py-32 bg-muted/10 relative overflow-hidden border-b border-border/50">
      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/3 w-[600px] h-[600px] bg-secondary/20 rounded-full blur-[120px] pointer-events-none opacity-50"></div>
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <Header {...header} />

        <div className="flex flex-col lg:flex-row gap-12 lg:gap-8 items-start">
          {/* Interactive Left Sidebar List */}
          <div className="w-full lg:w-[45%] flex flex-col gap-4">
            {services.map((service, idx) => (
              <div
                key={idx}
                onMouseEnter={() => setActiveService(idx)}
                className={`group relative p-6 sm:p-8 rounded-[2rem] cursor-pointer transition-all duration-500 border ${activeService === idx
                  ? "bg-background border-primary/20 shadow-xl"
                  : "bg-transparent border-transparent hover:bg-background/60"
                  }`}
              >
                <div className="flex items-center gap-6">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${activeService === idx
                    ? "bg-primary text-primary-foreground scale-110 shadow-lg shadow-primary/30"
                    : "bg-muted text-muted-foreground"
                    }`}>
                    <service.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className={`text-2xl font-bold transition-colors duration-500 ${activeService === idx ? "text-foreground" : "text-muted-foreground group-hover:text-foreground/80"
                      }`}>
                      {service.title}
                    </h3>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Dynamic Interactive Display Area */}
          {active && (
            <div className="w-full lg:w-[55%] h-[550px] relative rounded-[3rem] border border-border/50 overflow-hidden shadow-2xl flex items-center justify-center p-8 sm:p-12">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeService}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="absolute inset-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={active.image}
                    alt={active.title}
                    className="absolute inset-0 w-full h-full object-cover scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/20"></div>
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-secondary/30 mix-blend-overlay"></div>
                </motion.div>
              </AnimatePresence>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeService}
                  initial={{ y: 40, scale: 0.95 }}
                  animate={{ y: 0, scale: 1 }}
                  exit={{ y: -40, scale: 1.05 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="relative z-10 w-full h-full flex flex-col justify-center"
                >
                  <div className="w-24 h-24 rounded-[2rem] bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center mb-8">
                    <active.icon className="w-10 h-10 text-white" />
                  </div>
                  <p className="text-primary text-sm font-bold uppercase tracking-widest mb-6">
                    {active.subtitle}
                  </p>
                  <p className="text-white text-xl sm:text-2xl leading-relaxed mb-10 max-w-lg font-medium">
                    {active.desc}
                  </p>
                  <Link
                    href={active.href}
                    className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white text-black font-bold hover:scale-105 transition-all w-fit shadow-xl shadow-black/20"
                  >
                    {l.learnMore}<span className="sr-only"> about {active.title}</span> <ArrowRight className="w-4 h-4" />
                  </Link>
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </div>

        {linkLabel && linkHref && <ViewAllLink label={linkLabel} href={linkHref} circleClass="bg-background" />}
      </div>
    </section>
  );
}
