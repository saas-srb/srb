"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

interface DetailCTAProps {
  heading: string;
  description: string;
  ctaLabel?: string;
  /** Overrides the default /contact link. Set `external: true` for mailto/tel/off-site links. */
  ctaHref?: string;
  external?: boolean;
  /** Overrides the default trio of trust bullets under the button. */
  checklist?: string[];
  /** Category slug (e.g. "software-development") to pre-select on the contact form. Ignored when ctaHref is overridden. */
  category?: string;
  /** Sub-service slug (e.g. "web-app-development") to pre-select on the contact form. Requires `category`; ignored when ctaHref is overridden. */
  subService?: string;
  /** Anchor id of the section (default "contact"); a page that shows the band twice gives the second one its own. */
  id?: string;
}

export default function DetailCTA({
  heading,
  description,
  ctaLabel: ctaLabelProp,
  ctaHref,
  external = false,
  checklist = ["Free consultation", "Dedicated team", "Agile methodology"],
  category,
  subService,
  id = "contact",
}: DetailCTAProps) {
  const l = useUiLabels();
  const ctaLabel = ctaLabelProp ?? l.detailCtaLabel;
  const resolvedHref =
    ctaHref ??
    (category
      ? `/contact?category=${encodeURIComponent(category)}${subService ? `&subService=${encodeURIComponent(subService)}` : ""}`
      : "/contact");
  return (
    <section id={id} data-site-cta className="relative overflow-hidden border-t border-border/50 py-24 sm:py-28 bg-primary/5">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="mx-auto max-w-7xl px-6 lg:px-8 flex flex-col items-center text-center relative z-10">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} className="max-w-2xl">
          <h2 className="text-4xl font-black tracking-tight text-foreground sm:text-5xl mb-6">{heading}</h2>
          <p className="text-lg text-muted-foreground mb-10">{description}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {external ? (
              <a
                href={resolvedHref}
                className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground hover:scale-105 transition-all shadow-lg shadow-primary/20 w-full sm:w-auto"
              >
                {ctaLabel} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
            ) : (
              <Link
                href={resolvedHref}
                className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground hover:scale-105 transition-all shadow-lg shadow-primary/20 w-full sm:w-auto"
              >
                {ctaLabel} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            )}
          </div>
          <div className="pt-10 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-muted-foreground">
            {checklist.map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" /> {item}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
