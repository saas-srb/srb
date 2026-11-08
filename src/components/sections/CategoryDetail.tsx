"use client";

import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Users, Wallet, Clock } from "lucide-react";
import PageHero from "@/components/sections/PageHero";
import TrainingMeta from "@/components/sections/TrainingMeta";
import ChecklistGrid from "@/components/sections/ChecklistGrid";
import SubscriptionCard from "@/components/sections/SubscriptionCard";
import CurriculumTimeline from "@/components/sections/CurriculumTimeline";
import FAQAccordion from "@/components/sections/FAQAccordion";
import DetailCTA from "@/components/sections/DetailCTA";
import type { EngagementCategory } from "@/types/content";
import { useSiteInfo } from "@/components/products/sitecraft-ai/SiteInfoContext";

/** Every fixed string on an engagement-model page (CMS engagement-detail section config). `{title}` / `{title_lower}` = the model's title; `{option}` = a plan's title. */
export interface EngagementDetailCopy {
  heroImage: string;
  categoryLabel: string;
  quoteLabel: string;
  teamLabel: string;
  billingLabel: string;
  durationLabel: string;
  priceLabel: string;
  overviewTitle: string;
  overviewDescription: string;
  featuresTitle: string;
  featuresDescription: string;
  useCaseTitle: string;
  useCaseDescription: string;
  optionsEyebrow: string;
  optionsTitle: string;
  optionCtaLabel: string;
  deliverablesTitle: string;
  deliverablesDescription: string;
  pricingTitle: string;
  processTitle: string;
  processDescription: string;
  ctaHeading: string;
  ctaDescription: string;
  ctaChecklist: string[];
  mailSubject: string;
  mailOptionSubject: string;
  mailBody: string;
}

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

export default function CategoryDetail({ category, copy }: { category: EngagementCategory; copy: EngagementDetailCopy }) {
  const { contact } = useSiteInfo();
  const t = (text: string, option = "") =>
    text.replaceAll("{title_lower}", category.title.toLowerCase()).replaceAll("{title}", category.title).replaceAll("{option}", option);
  const mailto = (subject: string) => `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(copy.mailBody)}`;
  const applyHref = mailto(t(copy.mailSubject));

  return (
    <div className="flex flex-col min-h-screen selection:bg-primary/30 overflow-hidden">
      <PageHero
        category="resource-augmentation"
        categoryLabel={copy.categoryLabel}
        title={category.title}
        subtitle={category.tagline}
        description={category.summary}
        icon={category.icon}
        image={copy.heroImage}
        primaryCta={{ label: copy.quoteLabel, href: applyHref, external: true }}
      />

      <TrainingMeta
        items={[
          { icon: Users, label: copy.teamLabel, value: category.cardHighlight.teamComposition },
          { icon: Wallet, label: copy.billingLabel, value: category.cardHighlight.billingType },
          { icon: Clock, label: copy.durationLabel, value: category.cardHighlight.hiringDuration },
          { icon: category.icon, label: copy.priceLabel, value: category.cardHighlight.pricing },
        ]}
      />

      <ChecklistGrid
        id="overview"
        title={copy.overviewTitle}
        description={t(copy.overviewDescription)}
        items={category.overview}
        columns={2}
      />

      <ChecklistGrid
        id="features"
        tone="muted"
        title={copy.featuresTitle}
        description={t(copy.featuresDescription)}
        items={category.features}
        columns={3}
      />

      <section className="py-24 sm:py-32 bg-background relative">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeIn} className="max-w-2xl mb-10">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-4">{copy.useCaseTitle}</h2>
            <p className="text-lg leading-8 text-muted-foreground">{t(copy.useCaseDescription)}</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {category.idealUseCase.map((item, i) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: (i % 6) * 0.06 }}
                className="flex items-start gap-3 p-5 rounded-xl bg-background border border-border/50"
              >
                <CheckCircle2 className="w-5 h-5 text-primary flex-none mt-0.5" />
                <span className="text-sm text-foreground leading-relaxed">{item}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="options" className="py-24 sm:py-32 bg-muted/10 relative">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[700px] h-[500px] bg-primary/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeIn} className="max-w-2xl mb-12">
            <p className="text-sm font-semibold tracking-widest uppercase text-primary mb-3">{copy.optionsEyebrow}</p>
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-4">{copy.optionsTitle}</h2>
            <p className="text-lg leading-8 text-muted-foreground">{category.subOptionsIntro}</p>
          </motion.div>
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 gap-6 ${
              category.subOptions.length >= 5 ? "lg:grid-cols-4" : category.subOptions.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2 max-w-3xl"
            }`}
          >
            {category.subOptions.map((option, i) => (
              <SubscriptionCard
                key={option.slug}
                index={i}
                compact
                icon={option.icon}
                title={option.title}
                tagline={option.tagline}
                price={option.price}
                features={option.points}
                featured={option.featured}
                href={mailto(t(copy.mailOptionSubject, option.title))}
                ctaLabel={copy.optionCtaLabel}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 sm:py-32 bg-background relative">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeIn} className="max-w-2xl mb-10">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-4">{copy.deliverablesTitle}</h2>
            <p className="text-lg leading-8 text-muted-foreground">{t(copy.deliverablesDescription)}</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {category.deliverables.map((item, i) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: (i % 6) * 0.06 }}
                className="flex items-start gap-3 p-5 rounded-xl bg-background border border-border/50"
              >
                <CheckCircle2 className="w-5 h-5 text-primary flex-none mt-0.5" />
                <span className="text-sm text-foreground leading-relaxed">{item}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 sm:py-32 bg-muted/10 relative">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeIn} className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-4">{copy.pricingTitle}</h2>
            <p className="text-lg leading-8 text-muted-foreground mb-8">{category.pricingIntro}</p>
            <div className="flex flex-wrap items-baseline gap-4 p-8 rounded-2xl bg-muted/20 border border-border/50">
              <span className="text-4xl font-black text-foreground">{category.cardHighlight.pricing}</span>
              <span className="text-sm text-muted-foreground">
                {category.cardHighlight.billingType} · {category.cardHighlight.hiringDuration}
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      <CurriculumTimeline title={copy.processTitle} description={t(copy.processDescription)} modules={category.hiringProcess} />

      <FAQAccordion tone="muted" faqs={category.faqs} />

      <DetailCTA
        heading={t(copy.ctaHeading)}
        description={t(copy.ctaDescription)}
        ctaLabel={copy.quoteLabel}
        ctaHref={applyHref}
        external
        checklist={copy.ctaChecklist}
      />
    </div>
  );
}
