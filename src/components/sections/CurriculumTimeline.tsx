"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface Module {
  title: ReactNode;
  duration: string;
  topics: string[];
}

interface CurriculumTimelineProps {
  title?: string;
  description?: string;
  modules: Module[];
  tone?: "default" | "muted";
  icon?: LucideIcon;
  category?: string;
  align?: "left" | "center";
}

export default function CurriculumTimeline({ title, description, modules, tone = "default", icon: Icon, category, align = "left" }: CurriculumTimelineProps) {
  const enhanced = Boolean(Icon || category);
  const centered = align === "center";

  return (
    <section id="curriculum" className={`py-24 sm:py-32 relative ${tone === "muted" ? "bg-muted/10" : "bg-background"}`}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {title && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className={`max-w-2xl mb-14 ${centered ? "text-center mx-auto" : ""}`}
          >
            {Icon && (
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-muted/40 border border-border/50 shadow-sm mb-6">
                <Icon className="w-6 h-6 text-primary" />
              </div>
            )}
            {category && (
              <p className="text-sm font-semibold tracking-widest uppercase text-primary mb-3">{category}</p>
            )}
            <h2 className={`font-bold tracking-tight text-foreground mb-4 ${enhanced ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"}`}>{title}</h2>
            {description && <p className="text-lg leading-8 text-muted-foreground">{description}</p>}
          </motion.div>
        )}

        <div className="relative space-y-6">
          <div className="absolute left-6 top-2 bottom-2 w-px bg-border/70 hidden sm:block" aria-hidden="true" />
          {modules.map((module, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: (i % 8) * 0.06 }}
              className="relative sm:pl-16 p-6 sm:p-7 rounded-2xl bg-muted/20 border border-border/50 hover:border-primary/30 transition-all duration-300"
            >
              <div className="hidden sm:flex absolute left-0 top-6 w-12 h-12 rounded-full bg-background border-2 border-primary items-center justify-center text-sm font-black text-primary">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h3 className="text-lg font-bold text-foreground">
                  <span className="sm:hidden text-primary">{String(i + 1).padStart(2, "0")}. </span>
                  {module.title}
                </h3>
                <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full">
                  {module.duration}
                </span>
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {module.topics.map((topic) => (
                  <li key={topic} className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-none" />
                    {topic}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
