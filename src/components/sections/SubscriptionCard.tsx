"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight, Target, LucideIcon } from "lucide-react";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

interface SpecItem {
  icon: LucideIcon;
  label: string;
  value: string;
}

interface SubscriptionCardProps {
  icon: LucideIcon;
  title: string;
  tagline: string;
  price: string;
  billingType?: string;
  specs?: SpecItem[];
  bestFor?: string;
  features: string[];
  featuresLabel?: string;
  href?: string;
  ctaLabel?: string;
  featured?: boolean;
  index?: number;
  compact?: boolean;
}

export default function SubscriptionCard({
  icon: Icon,
  title,
  tagline,
  price,
  billingType,
  specs,
  bestFor,
  features,
  featuresLabel: featuresLabelProp,
  href,
  ctaLabel: ctaLabelProp,
  featured = false,
  index = 0,
  compact = false,
}: SubscriptionCardProps) {
  const l = useUiLabels();
  const ctaLabel = ctaLabelProp ?? l.viewDetails;
  const featuresLabel = featuresLabelProp ?? l.planFeaturesLabel;
  const muted = featured ? "text-background/65" : "text-muted-foreground";

  const body = (
    <div
      className={`relative flex flex-col h-full rounded-3xl transition-all duration-300 ${compact ? "p-6" : "p-8"} ${
        featured
          ? "bg-foreground text-background border-2 border-primary shadow-2xl shadow-primary/20 lg:-translate-y-3"
          : "bg-background/90 dark:bg-muted/20 backdrop-blur-md border border-border/60 shadow-md hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"
      }`}
    >
      {featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-bold uppercase tracking-wider shadow-lg">
          {l.mostPopular}
        </span>
      )}

      <div className={`${compact ? "w-11 h-11" : "w-14 h-14"} rounded-2xl flex items-center justify-center mb-4 ${featured ? "bg-background/10" : "bg-primary/10"}`}>
        <Icon className={compact ? "w-5 h-5 text-primary" : "w-6 h-6 text-primary"} />
      </div>

      <h3 className={compact ? "text-lg font-bold mb-1.5 leading-snug" : "text-2xl font-bold mb-2 leading-snug"}>{title}</h3>
      <p className={`${compact ? "text-xs" : "text-sm"} mb-5 ${muted}`}>{tagline}</p>

      {/* Price */}
      <div className={`flex flex-wrap items-center gap-2.5 mb-6 pb-6 border-b ${featured ? "border-background/15" : "border-border/50"}`}>
        <span className={compact ? "text-2xl font-black" : "text-3xl font-black"}>{price}</span>
        {billingType && (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
              featured ? "bg-background/10 text-background/80" : "bg-background border border-border/60 text-muted-foreground"
            }`}
          >
            {billingType}
          </span>
        )}
      </div>

      {/* Specs — one clear row per fact instead of a cramped grid */}
      {specs && specs.length > 0 && (
        <div className="space-y-3 mb-6">
          {specs.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-3 text-sm">
              <span className={`inline-flex items-center gap-2 ${muted}`}>
                <s.icon className="w-4 h-4 flex-none" />
                {s.label}
              </span>
              <span className="font-bold text-right">{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Best for — pulled out of the spec list since it's a full sentence, not a short value */}
      {bestFor && (
        <div className={`flex items-start gap-2.5 rounded-xl p-4 mb-6 ${featured ? "bg-background/10" : "bg-primary/5"}`}>
          <Target className="w-4 h-4 text-primary flex-none mt-0.5" />
          <p className="text-sm leading-relaxed">
            <span className="font-bold">{l.bestForPlan}</span>
            {bestFor}
          </p>
        </div>
      )}

      {/* Features */}
      <div className="flex-1 mb-6">
        {!compact && <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${muted}`}>{featuresLabel}</p>}
        <ul className="space-y-2.5">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm">
              <CheckCircle2 className="w-4 h-4 text-primary flex-none mt-0.5" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {href && (
        <span
          className={`mt-auto inline-flex items-center justify-center gap-2 w-full rounded-xl px-5 py-3.5 text-sm font-bold transition-all ${
            featured
              ? "bg-primary text-primary-foreground group-hover:bg-primary/90"
              : "border border-border/60 text-foreground group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground"
          }`}
        >
          {ctaLabel} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </span>
      )}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: (index % 4) * 0.1 }}
      className="group h-full"
    >
      {href ? (
        <Link href={href} aria-label={`${title} — ${ctaLabel}`} className="block h-full">
          {body}
        </Link>
      ) : (
        body
      )}
    </motion.div>
  );
}
