"use client";

import { motion } from "framer-motion";
import { TrendingUp, Quote } from "lucide-react";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

interface CaseStudy {
  segment: string;
  title: string;
  challenge: string;
  solution: string;
  metric: string;
  metricLabel: string;
}

interface CaseStudyShowcaseProps {
  title: string;
  description?: string;
  caseStudies: CaseStudy[];
  tone?: "default" | "muted";
}

export default function CaseStudyShowcase({ title, description, caseStudies, tone = "default" }: CaseStudyShowcaseProps) {
  const l = useUiLabels();
  return (
    <section id="case-studies" className={`py-24 sm:py-32 relative ${tone === "muted" ? "bg-muted/10" : "bg-background"}`}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl mb-14"
        >
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-4">{title}</h2>
          {description && <p className="text-lg leading-8 text-muted-foreground">{description}</p>}
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {caseStudies.map((study, i) => (
            <motion.div
              key={study.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="p-8 rounded-3xl bg-muted/20 border border-border/50 hover:border-primary/30 transition-all duration-300 flex flex-col"
            >
              <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full w-fit mb-5">
                {study.segment}
              </span>

              <h3 className="text-xl font-bold text-foreground mb-4 leading-snug">{study.title}</h3>

              <div className="space-y-3 mb-6 flex-1">
                <div className="flex gap-3">
                  <Quote className="w-4 h-4 flex-none text-muted-foreground/60 mt-1" />
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-foreground">{l.caseChallenge}</span>
                    {study.challenge}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Quote className="w-4 h-4 flex-none text-muted-foreground/60 mt-1" />
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-foreground">{l.caseSolution}</span>
                    {study.solution}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-5 border-t border-border/50">
                <div className="w-10 h-10 flex-none rounded-xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-lg font-black text-foreground leading-tight">{study.metric}</div>
                  <div className="text-xs text-muted-foreground">{study.metricLabel}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
