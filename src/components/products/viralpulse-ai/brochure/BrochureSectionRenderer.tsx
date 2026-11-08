"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  MapPin,
  Mail,
  Phone,
  Globe,
  MessageCircle,
  Share2,
  Calendar,
  Clock,
  CheckCircle2,
  Check,
  ChevronDown,
  QrCode,
  Download,
  Star,
  Users,
  Award,
  ChevronRight,
  Maximize2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DynamicIcon } from "./DynamicIcon";
import BrochureContactForm from "./BrochureContactForm";
import type {
  BrochureSection,
  BrochureTheme,
  BrochureDoc,
  HeroSection,
  OverviewSection,
  AboutSection,
  FeaturesSection,
  ServicesSection,
  GallerySection,
  TeamSection,
  TestimonialsSection,
  PricingSection,
  StatsSection,
  CurriculumSection,
  ProcessSection,
  ProjectsSection,
  AgendaSection,
  SpeakersSection,
  VenueSection,
  FloorplanSection,
  LocationSection,
  HighlightsSection,
  ItinerarySection,
  OfferSection,
  FaqSection,
  CtaSection,
  ContactSection,
  CustomSection,
} from "@/lib/products/viralpulse-ai/brochure/types";

interface BrochureSectionRendererProps {
  section: BrochureSection;
  theme: BrochureTheme;
  brochureId: string;
  brochureTitle: string;
  isEditorPreview?: boolean;
  onTrackCta?: (sectionType: string) => void;
}

export function BrochureSectionRenderer({
  section,
  theme,
  brochureId,
  brochureTitle,
  isEditorPreview = false,
  onTrackCta,
}: BrochureSectionRendererProps) {
  if (section.hidden) return null;

  const data = section.data;

  const getBorderRadius = () => {
    switch (theme.borderRadius) {
      case "none":
        return "rounded-none";
      case "sm":
        return "rounded-md";
      case "md":
        return "rounded-xl";
      case "lg":
        return "rounded-2xl";
      case "xl":
        return "rounded-3xl";
      default:
        return "rounded-2xl";
    }
  };

  const getPaddingClass = () => {
    switch (theme.density) {
      case "compact":
        return "py-8 px-4 sm:px-6 md:px-8";
      case "comfortable":
        return "py-14 px-4 sm:px-8 md:px-12";
      case "spacious":
        return "py-20 px-4 sm:px-10 md:px-16";
      default:
        return "py-14 px-4 sm:px-8 md:px-12";
    }
  };

  const handleCtaClick = (type: string) => {
    if (onTrackCta) onTrackCta(type);
  };

  // Render by section type
  switch (data.type) {
    case "hero": {
      const hero = data as HeroSection;
      return (
        <section
          id="hero"
          className={cn("relative overflow-hidden transition-all", getPaddingClass())}
          style={{
            backgroundColor: section.background || "transparent",
            color: theme.textColor,
          }}
        >
          {hero.backgroundImage && (
            <div className="absolute inset-0 z-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hero.backgroundImage} alt="" className="size-full object-cover" />
              <div
                className="absolute inset-0 bg-background"
                style={{ opacity: (hero.backgroundOverlay ?? 40) / 100 }}
              />
            </div>
          )}

          <div
            className={cn(
              "relative z-10 mx-auto max-w-5xl",
              hero.layout === "centered" && "text-center flex flex-col items-center",
              hero.layout === "split-left" && "grid md:grid-cols-2 gap-8 items-center",
              hero.layout === "split-right" && "grid md:grid-cols-2 gap-8 items-center md:flex-row-reverse"
            )}
          >
            <div className={cn("space-y-4", hero.layout === "centered" ? "max-w-3xl" : "")}>
              {hero.subheadline && (
                <div
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase"
                  style={{
                    backgroundColor: `${theme.primaryColor}15`,
                    color: theme.primaryColor,
                  }}
                >
                  <Sparkles className="size-3" />
                  {hero.subheadline}
                </div>
              )}

              <h1
                className="text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl leading-tight"
                style={{ fontFamily: theme.headingFont }}
              >
                {hero.headline || "Transform Your Business with Premium Solutions"}
              </h1>

              {hero.description && (
                <p className="text-sm sm:text-base leading-relaxed opacity-85">
                  {hero.description}
                </p>
              )}

              <div className={cn("flex flex-wrap gap-3 pt-2", hero.layout === "centered" ? "justify-center" : "")}>
                {hero.ctaLabel && (
                  <Button
                    size="lg"
                    onClick={() => handleCtaClick("hero_primary")}
                    style={{
                      backgroundColor: theme.primaryColor,
                      color: "#ffffff",
                    }}
                    className={cn(getBorderRadius(), "font-semibold shadow-md hover:opacity-90")}
                    render={hero.ctaUrl ? <Link href={hero.ctaUrl} /> : undefined}
                  >
                    {hero.ctaLabel}
                  </Button>
                )}
                {hero.secondaryCtaLabel && (
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => handleCtaClick("hero_secondary")}
                    style={{ borderColor: `${theme.primaryColor}40` }}
                    className={cn(getBorderRadius(), "font-semibold hover:bg-primary/5")}
                    render={hero.secondaryCtaUrl ? <Link href={hero.secondaryCtaUrl} /> : undefined}
                  >
                    {hero.secondaryCtaLabel}
                  </Button>
                )}
              </div>
            </div>

            {(hero.layout === "split-left" || hero.layout === "split-right") && (
              <div className="relative aspect-4/3 overflow-hidden rounded-2xl border border-border/60 bg-muted shadow-lg">
                {hero.backgroundImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={hero.backgroundImage} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center p-6 text-center text-muted-foreground">
                    <Sparkles className="size-10 text-primary/40 mb-2" />
                    <span className="text-xs">Featured Hero Media</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      );
    }

    case "overview": {
      const ov = data as OverviewSection;
      return (
        <section
          id="overview"
          className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}
        >
          <div
            className={cn(
              "grid gap-8 items-center",
              ov.layout === "text-only" ? "max-w-3xl mx-auto text-center" : "md:grid-cols-2",
              ov.layout === "text-right" && "md:flex-row-reverse"
            )}
          >
            <div className="space-y-4">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: theme.headingFont }}>
                {ov.title || "Overview"}
              </h2>
              <div className="text-sm leading-relaxed opacity-85 whitespace-pre-line">
                {ov.body || "Detailed overview content describing core operations, scope, and strategic value."}
              </div>
            </div>

            {ov.layout !== "text-only" && (
              <div className={cn("overflow-hidden border border-border/60 bg-muted/40 aspect-video shadow-sm", getBorderRadius())}>
                {ov.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ov.image} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                    Overview Diagram / Photo
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      );
    }

    case "about": {
      const ab = data as AboutSection;
      return (
        <section id="about" className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}>
          <div className="space-y-6">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: theme.headingFont }}>
                {ab.title || "About Us"}
              </h2>
              {ab.founded && <p className="mt-1 text-xs font-semibold text-primary">{ab.founded}</p>}
              <p className="mt-3 text-sm leading-relaxed opacity-85">{ab.body}</p>
            </div>

            {(ab.mission || ab.vision) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {ab.mission && (
                  <div className={cn("border border-border/60 bg-card p-5 shadow-xs", getBorderRadius())}>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Our Mission</h4>
                    <p className="mt-2 text-xs leading-relaxed opacity-90">{ab.mission}</p>
                  </div>
                )}
                {ab.vision && (
                  <div className={cn("border border-border/60 bg-card p-5 shadow-xs", getBorderRadius())}>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Our Vision</h4>
                    <p className="mt-2 text-xs leading-relaxed opacity-90">{ab.vision}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      );
    }

    case "features": {
      const feat = data as FeaturesSection;
      const cols = feat.columns === 2 ? "sm:grid-cols-2" : feat.columns === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3";
      return (
        <section id="features" className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}>
          <div className="text-center space-y-2 mb-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: theme.headingFont }}>
              {feat.title || "Key Features & Capabilities"}
            </h2>
            {feat.subtitle && <p className="text-xs text-muted-foreground max-w-2xl mx-auto">{feat.subtitle}</p>}
          </div>

          <div className={cn("grid gap-4", cols)}>
            {feat.items.map((item, idx) => (
              <div
                key={idx}
                className={cn("border border-border/60 bg-card p-5 shadow-xs transition-all hover:shadow-md", getBorderRadius())}
              >
                <div
                  className="flex size-10 items-center justify-center rounded-xl mb-3.5"
                  style={{
                    backgroundColor: `${theme.primaryColor}15`,
                    color: theme.primaryColor,
                  }}
                >
                  <DynamicIcon name={item.icon} className="size-5" />
                </div>
                <h3 className="text-sm font-bold text-foreground">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "services": {
      const serv = data as ServicesSection;
      return (
        <section id="services" className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}>
          <div className="space-y-2 mb-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: theme.headingFont }}>
              {serv.title || "Services & Solutions"}
            </h2>
            {serv.subtitle && <p className="text-xs text-muted-foreground">{serv.subtitle}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {serv.items.map((item, idx) => (
              <div
                key={idx}
                className={cn("flex flex-col justify-between border border-border/60 bg-card p-5 shadow-xs", getBorderRadius())}
              >
                <div>
                  <div
                    className="flex size-9 items-center justify-center rounded-lg mb-3"
                    style={{
                      backgroundColor: `${theme.primaryColor}15`,
                      color: theme.primaryColor,
                    }}
                  >
                    <DynamicIcon name={item.icon} className="size-4" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
                {item.price && (
                  <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-primary">{item.price}</span>
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "gallery": {
      const gal = data as GallerySection;
      const cols = gal.columns === 2 ? "grid-cols-1 sm:grid-cols-2" : gal.columns === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3";
      return (
        <section id="gallery" className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl mb-6" style={{ fontFamily: theme.headingFont }}>
            {gal.title || "Visual Gallery"}
          </h2>
          <div className={cn("grid gap-4", cols)}>
            {gal.items.map((item, idx) => (
              <div key={idx} className={cn("overflow-hidden border border-border/60 bg-card shadow-xs group", getBorderRadius())}>
                <div className="relative aspect-4/3 overflow-hidden bg-muted">
                  {item.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.src} alt={item.alt} className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                      Gallery Item #{idx + 1}
                    </div>
                  )}
                </div>
                {item.caption && (
                  <div className="p-3 text-xs font-medium text-foreground bg-card">
                    {item.caption}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "stats": {
      const st = data as StatsSection;
      return (
        <section
          id="stats"
          className={cn(
            "mx-auto max-w-5xl my-4 transition-all",
            getBorderRadius(),
            st.style === "dark" ? "bg-slate-900 text-white" : st.style === "branded" ? "bg-primary text-primary-foreground" : "bg-card border border-border/60",
            getPaddingClass()
          )}
        >
          {st.title && (
            <h3 className="text-base font-bold text-center mb-6" style={{ fontFamily: theme.headingFont }}>
              {st.title}
            </h3>
          )}
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 text-center">
            {st.items.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums">
                  {item.value || "0"}
                </div>
                <div className="text-xs opacity-80">{item.label}</div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "pricing": {
      const pr = data as PricingSection;
      return (
        <section id="pricing" className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}>
          <div className="text-center space-y-2 mb-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: theme.headingFont }}>
              {pr.title || "Transparent Pricing & Packages"}
            </h2>
            {pr.subtitle && <p className="text-xs text-muted-foreground max-w-2xl mx-auto">{pr.subtitle}</p>}
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
            {pr.tiers.map((tier, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex flex-col justify-between border p-6 transition-all",
                  getBorderRadius(),
                  tier.highlighted
                    ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary"
                    : "border-border/60 bg-card shadow-xs"
                )}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-foreground">{tier.name}</h3>
                    {tier.highlighted && (
                      <Badge style={{ backgroundColor: theme.primaryColor, color: "#ffffff" }} className="text-[10px]">
                        Recommended
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{tier.description}</p>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-xs font-semibold text-muted-foreground">{pr.currency}</span>
                    <span className="text-3xl font-extrabold text-foreground tracking-tight">{tier.price}</span>
                    {tier.period && <span className="text-xs text-muted-foreground">{tier.period}</span>}
                  </div>

                  <ul className="mt-6 space-y-2.5 text-xs text-foreground/90 border-t border-border/40 pt-4">
                    {tier.features.map((f, fi) => (
                      <li key={fi} className="flex items-start gap-2">
                        <Check className="size-3.5 text-primary shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8 pt-4">
                  <Button
                    onClick={() => handleCtaClick(`pricing_${tier.name}`)}
                    style={
                      tier.highlighted
                        ? { backgroundColor: theme.primaryColor, color: "#ffffff" }
                        : { borderColor: `${theme.primaryColor}50` }
                    }
                    variant={tier.highlighted ? "default" : "outline"}
                    className={cn(getBorderRadius(), "w-full font-semibold")}
                    render={tier.ctaUrl ? <Link href={tier.ctaUrl} /> : undefined}
                  >
                    {tier.ctaLabel || "Get Started"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "curriculum": {
      const cur = data as CurriculumSection;
      return (
        <section id="curriculum" className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}>
          <div className="space-y-2 mb-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: theme.headingFont }}>
              {cur.title || "Curriculum & Course Structure"}
            </h2>
            {cur.subtitle && <p className="text-xs text-muted-foreground">{cur.subtitle}</p>}
          </div>

          <div className="space-y-4">
            {cur.modules.map((mod, idx) => (
              <div key={idx} className={cn("border border-border/60 bg-card p-5 shadow-xs", getBorderRadius())}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
                  <h3 className="text-sm font-bold text-foreground">{mod.title}</h3>
                  {mod.duration && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Clock className="size-3" /> {mod.duration}
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{mod.description}</p>

                {mod.lessons.length > 0 && (
                  <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 text-xs">
                    {mod.lessons.map((l, li) => (
                      <li key={li} className="flex items-center gap-2">
                        <CheckCircle2 className="size-3 text-primary shrink-0" />
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "process": {
      const proc = data as ProcessSection;
      return (
        <section id="process" className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}>
          <div className="text-center space-y-2 mb-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: theme.headingFont }}>
              {proc.title || "Our Methodology"}
            </h2>
            {proc.subtitle && <p className="text-xs text-muted-foreground max-w-2xl mx-auto">{proc.subtitle}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {proc.steps.map((st, idx) => (
              <div key={idx} className={cn("border border-border/60 bg-card p-5 shadow-xs relative", getBorderRadius())}>
                <div
                  className="text-xs font-black tracking-widest uppercase mb-2"
                  style={{ color: theme.primaryColor }}
                >
                  Step {st.number}
                </div>
                <h3 className="text-sm font-bold text-foreground">{st.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{st.description}</p>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "projects": {
      const proj = data as ProjectsSection;
      return (
        <section id="projects" className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}>
          <div className="space-y-2 mb-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: theme.headingFont }}>
              {proj.title || "Featured Projects & Portfolio"}
            </h2>
            {proj.subtitle && <p className="text-xs text-muted-foreground">{proj.subtitle}</p>}
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {proj.items.map((item, idx) => (
              <div key={idx} className={cn("overflow-hidden border border-border/60 bg-card shadow-xs group", getBorderRadius())}>
                <div className="aspect-16/10 bg-muted overflow-hidden">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt={item.title} className="size-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                      Project Showcase Image
                    </div>
                  )}
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((t, ti) => (
                      <Badge key={ti} variant="secondary" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <h3 className="text-sm font-bold text-foreground">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "agenda": {
      const ag = data as AgendaSection;
      return (
        <section id="agenda" className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl mb-6" style={{ fontFamily: theme.headingFont }}>
            {ag.title || "Event Agenda"}
          </h2>
          <div className="space-y-3">
            {ag.items.map((item, idx) => (
              <div key={idx} className={cn("border border-border/60 bg-card p-4 shadow-xs flex flex-col sm:flex-row gap-4 items-start sm:items-center", getBorderRadius())}>
                <div
                  className="rounded-lg px-3 py-1.5 text-xs font-bold shrink-0 tabular-nums"
                  style={{
                    backgroundColor: `${theme.primaryColor}15`,
                    color: theme.primaryColor,
                  }}
                >
                  {item.time}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-foreground">{item.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                {item.speaker && (
                  <Badge variant="outline" className="text-[11px] shrink-0">
                    {item.speaker}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "venue": {
      const ven = data as VenueSection;
      return (
        <section id="venue" className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}>
          <div className={cn("border border-border/60 bg-card p-6 shadow-xs", getBorderRadius())}>
            <h2 className="text-2xl font-bold tracking-tight mb-4" style={{ fontFamily: theme.headingFont }}>
              {ven.title || "Venue & Location"}
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-base font-bold text-foreground">{ven.name}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{ven.address}, {ven.city}</p>
                {ven.directions && (
                  <div className="rounded-xl bg-muted/50 p-3 text-xs text-foreground/80">
                    <span className="font-semibold block mb-1">Transit & Directions:</span>
                    {ven.directions}
                  </div>
                )}
              </div>
              <div className="aspect-video bg-muted rounded-xl flex items-center justify-center text-xs text-muted-foreground border">
                {ven.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ven.image} alt={ven.name} className="size-full object-cover rounded-xl" />
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <MapPin className="size-6 text-primary" />
                    <span>Venue Location Map</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      );
    }

    case "floorplan": {
      const fp = data as FloorplanSection;
      return (
        <section id="floorplan" className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}>
          <div className="space-y-2 mb-6">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: theme.headingFont }}>
              {fp.title || "Floor Plans & Architectural Layouts"}
            </h2>
            {fp.subtitle && <p className="text-xs text-muted-foreground">{fp.subtitle}</p>}
          </div>

          <div className="grid gap-6 md:grid-cols-2 items-center">
            <div className="aspect-4/3 bg-muted rounded-2xl border flex items-center justify-center text-xs text-muted-foreground overflow-hidden">
              {fp.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fp.image} alt="Floor plan" className="size-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Maximize2 className="size-6 text-primary" />
                  <span>Architectural Layout Blueprint</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {fp.specs.map((sp, idx) => (
                <div key={idx} className="flex items-center justify-between border-b border-border/40 pb-2.5 text-xs">
                  <span className="text-muted-foreground">{sp.label}</span>
                  <span className="font-bold text-foreground">{sp.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    case "location": {
      const loc = data as LocationSection;
      return (
        <section id="location" className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}>
          <h2 className="text-2xl font-bold tracking-tight mb-4" style={{ fontFamily: theme.headingFont }}>
            {loc.title || "Location & Accessibility"}
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">{loc.address}, {loc.city}</p>
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-foreground">Proximity Highlights:</h4>
                {loc.nearbyPlaces.map((pl, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg bg-card border px-3 py-2 text-xs">
                    <span>{pl.name}</span>
                    <Badge variant="outline" className="text-[10px]">{pl.distance}</Badge>
                  </div>
                ))}
              </div>
            </div>
            <div className="aspect-video bg-muted rounded-xl flex items-center justify-center text-xs text-muted-foreground border">
              <MapPin className="size-6 text-primary mr-2" /> Interactive Map Area
            </div>
          </div>
        </section>
      );
    }

    case "itinerary": {
      const itin = data as ItinerarySection;
      return (
        <section id="itinerary" className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}>
          <div className="space-y-2 mb-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: theme.headingFont }}>
              {itin.title || "Tour Itinerary"}
            </h2>
            {itin.subtitle && <p className="text-xs text-muted-foreground">{itin.subtitle}</p>}
          </div>

          <div className="space-y-4">
            {itin.days.map((d, idx) => (
              <div key={idx} className={cn("border border-border/60 bg-card p-5 shadow-xs", getBorderRadius())}>
                <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Badge style={{ backgroundColor: theme.primaryColor, color: "#ffffff" }} className="text-[10px]">
                      {d.day}
                    </Badge>
                    <h3 className="text-sm font-bold text-foreground">{d.title}</h3>
                  </div>
                  {d.accommodation && (
                    <span className="text-[11px] text-muted-foreground">{d.accommodation}</span>
                  )}
                </div>
                <ul className="space-y-1.5 text-xs text-foreground/80 pl-2">
                  {d.activities.map((act, ai) => (
                    <li key={ai} className="flex items-start gap-2">
                      <ChevronRight className="size-3 text-primary shrink-0 mt-0.5" />
                      <span>{act}</span>
                    </li>
                  ))}
                </ul>
                {d.meals && (
                  <p className="mt-3 text-[11px] font-medium text-primary">Meals: {d.meals}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "offer": {
      const off = data as OfferSection;
      return (
        <section id="offer" className={cn("mx-auto max-w-5xl my-4 transition-all", getPaddingClass())}>
          <div
            className={cn("border p-8 relative overflow-hidden shadow-md", getBorderRadius())}
            style={{
              borderColor: `${theme.primaryColor}50`,
              backgroundColor: `${theme.primaryColor}08`,
            }}
          >
            <div className="max-w-2xl space-y-3">
              <Badge style={{ backgroundColor: theme.primaryColor, color: "#ffffff" }} className="text-xs uppercase tracking-wide">
                {off.discount || "Special Offer"}
              </Badge>
              <h2 className="text-2xl font-extrabold sm:text-3xl text-foreground" style={{ fontFamily: theme.headingFont }}>
                {off.title}
              </h2>
              <p className="text-xs text-muted-foreground">{off.subtitle}</p>

              <div className="flex items-baseline gap-3 py-2">
                <span className="text-3xl font-black text-foreground">{off.offerPrice}</span>
                {off.originalPrice && (
                  <span className="text-sm text-muted-foreground line-through">{off.originalPrice}</span>
                )}
                {off.validUntil && (
                  <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold ml-2">
                    {off.validUntil}
                  </span>
                )}
              </div>

              {off.features.length > 0 && (
                <ul className="space-y-1.5 text-xs text-foreground/90 py-2">
                  {off.features.map((f, fi) => (
                    <li key={fi} className="flex items-center gap-2">
                      <Check className="size-3.5 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}

              {off.terms && <p className="text-[11px] text-muted-foreground italic pt-2">{off.terms}</p>}

              <div className="pt-4">
                <Button
                  size="lg"
                  onClick={() => handleCtaClick("offer_claim")}
                  style={{ backgroundColor: theme.primaryColor, color: "#ffffff" }}
                  className={cn(getBorderRadius(), "font-bold shadow-md hover:opacity-90")}
                  render={off.ctaUrl ? <Link href={off.ctaUrl} /> : undefined}
                >
                  {off.ctaLabel || "Claim Offer"}
                </Button>
              </div>
            </div>
          </div>
        </section>
      );
    }

    case "faq": {
      const fq = data as FaqSection;
      return (
        <section id="faq" className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}>
          <div className="text-center space-y-2 mb-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: theme.headingFont }}>
              {fq.title || "Frequently Asked Questions"}
            </h2>
            {fq.subtitle && <p className="text-xs text-muted-foreground">{fq.subtitle}</p>}
          </div>

          <div className={cn("grid gap-3", fq.columns === 2 ? "sm:grid-cols-2" : "max-w-3xl mx-auto")}>
            {fq.items.map((item, idx) => (
              <div key={idx} className={cn("border border-border/60 bg-card p-4 shadow-xs", getBorderRadius())}>
                <h3 className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>{item.question}</span>
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "cta": {
      const ct = data as CtaSection;
      return (
        <section
          id="cta"
          className={cn(
            "mx-auto max-w-5xl my-6 text-center transition-all",
            getBorderRadius(),
            ct.style === "dark" ? "bg-slate-900 text-white" : ct.style === "branded" ? "bg-primary text-primary-foreground" : "bg-card border border-border/60",
            getPaddingClass()
          )}
        >
          <div className="max-w-2xl mx-auto space-y-4">
            <h2 className="text-2xl font-extrabold sm:text-3xl tracking-tight" style={{ fontFamily: theme.headingFont }}>
              {ct.headline || "Ready to Take the Next Step?"}
            </h2>
            {ct.subheadline && <p className="text-xs sm:text-sm opacity-85 leading-relaxed">{ct.subheadline}</p>}
            <div className="flex flex-wrap gap-3 justify-center pt-2">
              {ct.ctaLabel && (
                <Button
                  size="lg"
                  onClick={() => handleCtaClick("cta_primary")}
                  className={cn(getBorderRadius(), "font-bold shadow-md")}
                  style={
                    ct.style === "dark"
                      ? { backgroundColor: theme.primaryColor, color: "#ffffff" }
                      : ct.style === "branded"
                      ? { backgroundColor: "#ffffff", color: theme.primaryColor }
                      : { backgroundColor: theme.primaryColor, color: "#ffffff" }
                  }
                  render={ct.ctaUrl ? <Link href={ct.ctaUrl} /> : undefined}
                >
                  {ct.ctaLabel}
                </Button>
              )}
            </div>
          </div>
        </section>
      );
    }

    case "contact": {
      const con = data as ContactSection;
      return (
        <section id="contact" className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}>
          <div className="grid gap-8 lg:grid-cols-5">
            {/* Left Column: Business Details & Contact Coordinates */}
            <div className="lg:col-span-2 space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: theme.headingFont }}>
                  {con.title || "Get In Touch"}
                </h2>
                {con.subtitle && <p className="mt-1 text-xs text-muted-foreground">{con.subtitle}</p>}
              </div>

              <div className="space-y-3 text-xs">
                {con.email && (
                  <div className="flex items-center gap-2.5">
                    <Mail className="size-4 text-primary shrink-0" />
                    <a href={`mailto:${con.email}`} className="hover:underline">
                      {con.email}
                    </a>
                  </div>
                )}
                {con.phone && (
                  <div className="flex items-center gap-2.5">
                    <Phone className="size-4 text-primary shrink-0" />
                    <a href={`tel:${con.phone}`} className="hover:underline">
                      {con.phone}
                    </a>
                  </div>
                )}
                {con.whatsapp && (
                  <div className="flex items-center gap-2.5">
                    <MessageCircle className="size-4 text-emerald-500 shrink-0" />
                    <a
                      href={`https://wa.me/${con.whatsapp.replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline text-emerald-600 dark:text-emerald-400 font-medium"
                    >
                      Chat on WhatsApp
                    </a>
                  </div>
                )}
                {con.website && (
                  <div className="flex items-center gap-2.5">
                    <Globe className="size-4 text-primary shrink-0" />
                    <a href={con.website} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
                      {con.website}
                    </a>
                  </div>
                )}
                {con.address && (
                  <div className="flex items-start gap-2.5 pt-1">
                    <MapPin className="size-4 text-primary shrink-0 mt-0.5" />
                    <span className="leading-relaxed opacity-85">{con.address}</span>
                  </div>
                )}
              </div>

              {/* Social Channels */}
              {(con.linkedin || con.instagram || con.facebook || con.twitter || con.youtube) && (
                <div className="pt-2 border-t border-border/40">
                  <span className="text-[11px] font-semibold text-muted-foreground block mb-2">Connect with us:</span>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {con.linkedin && (
                      <a href={con.linkedin} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-2.5 py-1 hover:bg-muted">
                        LinkedIn
                      </a>
                    )}
                    {con.instagram && (
                      <a href={con.instagram} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-2.5 py-1 hover:bg-muted">
                        Instagram
                      </a>
                    )}
                    {con.facebook && (
                      <a href={con.facebook} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-2.5 py-1 hover:bg-muted">
                        Facebook
                      </a>
                    )}
                    {con.twitter && (
                      <a href={con.twitter} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-2.5 py-1 hover:bg-muted">
                        X / Twitter
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Lead Form */}
            {con.showForm && (
              <div className={cn("lg:col-span-3 border border-border/60 bg-card p-6 shadow-sm", getBorderRadius())}>
                <h3 className="text-sm font-bold text-foreground mb-4">Send an Inquiry / RFP</h3>
                <BrochureContactForm
                  brochureId={brochureId}
                  brochureTitle={brochureTitle}
                  fields={con.formFields}
                  theme={theme}
                  isEditorPreview={isEditorPreview}
                />
              </div>
            )}
          </div>
        </section>
      );
    }

    case "custom": {
      const cust = data as CustomSection;
      return (
        <section id="custom" className={cn("mx-auto max-w-5xl transition-all", getPaddingClass())}>
          <div className={cn("border border-border/60 bg-card p-6 shadow-xs", getBorderRadius())}>
            {cust.title && (
              <h2 className="text-2xl font-bold tracking-tight mb-4" style={{ fontFamily: theme.headingFont }}>
                {cust.title}
              </h2>
            )}
            <div className="prose dark:prose-invert max-w-none text-xs leading-relaxed">
              {cust.content ? (
                <div dangerouslySetInnerHTML={{ __html: cust.content }} />
              ) : (
                <p className="text-muted-foreground italic">Custom section content area.</p>
              )}
            </div>
          </div>
        </section>
      );
    }

    default:
      return null;
  }
}
