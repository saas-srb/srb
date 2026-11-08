"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Layers, Users, Clock, LayoutGrid, type LucideIcon } from "lucide-react";
import ListingCard from "@/components/sections/ListingCard";
import FeaturedListingCard from "@/components/sections/FeaturedListingCard";
import SubscriptionCard from "@/components/sections/SubscriptionCard";
import FeaturedBlogCard from "@/components/sections/FeaturedBlogCard";
import BlogCard from "@/components/sections/BlogCard";
import { useBlogPosts, useEngagementModels, useJobs } from "@/components/products/sitecraft-ai/CollectionsContext";

/**
 * The listing sections of the four index pages (/careers, /resource-augmentation,
 * /blog, /live-demos), extracted verbatim from their former `Content.tsx`.
 * The records themselves (jobs, engagement models, posts) still come from
 * the CMS collections (built-in data as the fallback) — see CollectionsContext.
 */

const fadeIn = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } };

// ── /careers: filterable job board ───────────────────────────────────────

export function JobBoard({ badge, badgeIcon: BadgeIcon, allLabel, ctaLabel, image, categories }: { badge: string; badgeIcon: LucideIcon; allLabel: string; ctaLabel: string; image: string; categories: { name: string; icon: LucideIcon }[] }) {
  const jobs = useJobs();
  const [activeFilter, setActiveFilter] = useState(allLabel);

  const filteredJobs = useMemo(
    () => (activeFilter === allLabel ? jobs : jobs.filter((job) => job.category === activeFilter)),
    [jobs, activeFilter, allLabel]
  );

  return (
    <section className="py-24 sm:py-32 bg-muted/10 relative">
      <div className="absolute left-0 top-1/3 -translate-x-1/2 w-[600px] h-[600px] bg-secondary/20 rounded-full blur-3xl pointer-events-none opacity-50"></div>
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          variants={fadeIn}
          className="flex flex-wrap gap-3 mb-12"
        >
          <button
            onClick={() => setActiveFilter(allLabel)}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all duration-300 ${
              activeFilter === allLabel
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                : "bg-background border border-border/50 text-foreground hover:border-primary/40"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            {allLabel}
            <span className={`text-xs font-bold ${activeFilter === allLabel ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
              {jobs.length}
            </span>
          </button>
          {categories.map((category) => {
            const count = jobs.filter((job) => job.category === category.name).length;
            if (count === 0) return null;
            return (
              <button
                key={category.name}
                onClick={() => setActiveFilter(category.name)}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all duration-300 ${
                  activeFilter === category.name
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "bg-background border border-border/50 text-foreground hover:border-primary/40"
                }`}
              >
                <category.icon className="w-4 h-4" />
                {category.name}
                <span className={`text-xs font-bold ${activeFilter === category.name ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </motion.div>

        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {filteredJobs.map((job) => (
            <ListingCard
              key={job.slug}
              index={jobs.findIndex((j) => j.slug === job.slug)}
              icon={<job.icon className="w-7 h-7" />}
              badge={badge}
              badgeIcon={BadgeIcon}
              title={job.title}
              subtitle={job.employmentType}
              description={job.summary}
              highlights={[job.location, job.experience]}
              href={`/careers/${job.slug}`}
              image={image}
              ctaLabel={ctaLabel}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ── /resource-augmentation: engagement model cards ───────────────────────

export function EngagementModelsGrid({
  eyebrow,
  heading,
  description,
  featuredSlug,
  featuresLabel,
  ctaLabel,
}: {
  eyebrow: string;
  heading: string;
  description: string;
  featuredSlug: string;
  featuresLabel: string;
  ctaLabel: string;
}) {
  const engagementCategories = useEngagementModels();
  return (
    <section className="py-24 sm:py-32 bg-background relative">
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-secondary/20 rounded-full blur-3xl pointer-events-none opacity-50"></div>
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeIn} className="max-w-2xl mb-14">
          <p className="text-sm font-semibold tracking-widest uppercase text-primary mb-3">{eyebrow}</p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-4">{heading}</h2>
          <p className="text-lg leading-8 text-muted-foreground">{description}</p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {engagementCategories.map((category, i) => (
            <SubscriptionCard
              key={category.slug}
              index={i}
              icon={category.icon}
              title={category.title}
              tagline={category.tagline}
              price={category.cardHighlight.pricing}
              billingType={category.cardHighlight.billingType}
              specs={[
                { icon: Layers, label: "Engagement", value: category.cardHighlight.engagementModel },
                { icon: Users, label: "Team Size", value: category.cardHighlight.teamComposition },
                { icon: Clock, label: "Duration", value: category.cardHighlight.hiringDuration },
              ]}
              bestFor={category.cardHighlight.idealUseCase}
              featuresLabel={featuresLabel}
              features={category.keyBenefits}
              href={`/resource-augmentation/${category.slug}`}
              ctaLabel={ctaLabel}
              featured={category.slug === featuredSlug}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── /blog: featured post + grid ──────────────────────────────────────────

export function BlogListing({ sectionLabel }: { sectionLabel: string }) {
  const [featured, ...rest] = useBlogPosts();
  if (!featured) return null;
  return (
    <section className="py-24 sm:py-32 bg-background relative">
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-secondary/20 rounded-full blur-3xl pointer-events-none opacity-50"></div>
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <div className="mb-16 lg:mb-20">
          <FeaturedBlogCard post={featured} />
        </div>

        <div className="flex items-center gap-3 mb-10">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{sectionLabel}</h2>
          <div className="h-px flex-1 bg-border/50" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {rest.map((post, i) => (
            <BlogCard key={post.slug} post={post} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── /live-demos: a stack of large featured cards ─────────────────────────

export interface FeaturedCardItem {
  title: string;
  subtitle: string;
  description: string;
  href: string;
  icon: LucideIcon;
  image: string;
  highlights: string[];
}

export function FeaturedCardStack({ badge, badgeIcon, ctaLabel, items }: { badge: string; badgeIcon: LucideIcon; ctaLabel?: string; items: FeaturedCardItem[] }) {
  return (
    <section className="py-24 sm:py-32 bg-background relative">
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-secondary/20 rounded-full blur-3xl pointer-events-none opacity-50"></div>
      <div className="mx-auto max-w-5xl px-6 lg:px-8 relative z-10">
        {items.map((item) => (
          <FeaturedListingCard
            key={item.href}
            icon={item.icon}
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
    </section>
  );
}
