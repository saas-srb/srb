"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronRight } from "lucide-react";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

/**
 * The plain "service" page layout (breadcrumb hero → overview with capability
 * cards and a sticky contact card → closing CTA), as used by
 * /services/prediction-forecasting. Markup is the page's original, verbatim.
 */

export function SimpleServiceHero({ breadcrumbLabel, title, description }: { breadcrumbLabel: string; title: string; description: string }) {
  const l = useUiLabels();
  return (
    <section className="pt-24 pb-16 px-4 bg-muted border-b border-border">
      <div className="container mx-auto max-w-6xl text-center">
        <div className="flex items-center justify-center gap-2 text-sm font-bold text-secondary uppercase tracking-widest mb-6">
          <Link href="/" className="hover:text-primary transition-colors">{l.breadcrumbHome}</Link>
          <ChevronRight className="h-4 w-4 text-primary" />
          <span>{breadcrumbLabel}</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 text-primary">{title}</h1>
        <p className="text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto font-medium">
          {description}
        </p>
      </div>
    </section>
  );
}

export function SimpleServiceOverview({
  heading, lead, text, capabilitiesHeading, capabilities, cardTitle, cardText, cardCtaLabel, cardCtaHref,
}: {
  heading: string; lead: string; text: string; capabilitiesHeading: string; capabilities: string[];
  cardTitle: string; cardText: string; cardCtaLabel: string; cardCtaHref: string;
}) {
  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex flex-col lg:flex-row gap-16">
          <div className="lg:w-2/3">
            <h2 className="text-4xl font-extrabold text-primary mb-6">{heading}</h2>
            <p className="text-xl text-foreground mb-6 font-medium leading-relaxed">{lead}</p>
            <p className="text-lg text-muted-foreground leading-relaxed">{text}</p>

            <div className="mt-12">
              <h3 className="text-2xl font-bold text-primary mb-6">{capabilitiesHeading}</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {capabilities.map((feature, i) => (
                  <div key={i} className="bg-card p-5 rounded-xl border border-border shadow-sm flex items-start gap-4">
                    <CheckCircle2 className="h-6 w-6 text-secondary shrink-0" />
                    <span className="font-bold text-foreground">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:w-1/3">
            <div className="sticky top-28 bg-primary rounded-2xl p-8 text-white shadow-xl">
              <h3 className="text-2xl font-bold mb-4">{cardTitle}</h3>
              <p className="text-white/80 font-medium mb-8">{cardText}</p>
              <Link href={cardCtaHref} className="flex items-center justify-center w-full py-4 rounded-xl bg-secondary hover:bg-secondary/90 font-bold text-lg transition-colors">
                {cardCtaLabel} <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SimpleServiceCta({ heading, ctaLabel, ctaHref }: { heading: string; ctaLabel: string; ctaHref: string }) {
  return (
    <section className="py-20 bg-secondary/10">
      <div className="container mx-auto max-w-4xl text-center">
        <h2 className="text-4xl font-extrabold text-primary mb-6">{heading}</h2>
        <Link href={ctaHref} className="inline-flex items-center justify-center h-16 px-10 rounded-full bg-secondary text-white font-bold text-lg shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all">
          {ctaLabel} <ArrowRight className="ml-2 h-5 w-5" />
        </Link>
      </div>
    </section>
  );
}
