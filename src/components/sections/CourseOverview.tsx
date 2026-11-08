"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

interface StatItem {
  label: string;
  value: string;
  icon: LucideIcon;
}

interface CourseOverviewProps {
  title: string;
  paragraphs: ReactNode[];
  stats: StatItem[];
  tone?: "default" | "muted";
}

export default function CourseOverview({ title, paragraphs, stats, tone = "default" }: CourseOverviewProps) {
  return (
    <section id="overview" className={`py-24 sm:py-32 relative ${tone === "muted" ? "bg-muted/10" : "bg-background"}`}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="lg:col-span-7"
          >
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-6">{title}</h2>
            <div className="space-y-5">
              {paragraphs.map((p, i) => (
                <p key={i} className="text-lg leading-8 text-muted-foreground">
                  {p}
                </p>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="lg:col-span-5 grid grid-cols-2 gap-4"
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="p-6 rounded-2xl bg-muted/20 border border-border/50 hover:border-primary/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <stat.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="text-xl font-bold text-foreground mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
