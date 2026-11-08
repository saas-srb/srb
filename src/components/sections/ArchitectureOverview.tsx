"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface ArchitectureLayer {
  name: string;
  description: string;
  tech: string;
  icon: LucideIcon;
}

interface ArchitectureOverviewProps {
  title: string;
  description?: string;
  layers: ArchitectureLayer[];
  tone?: "default" | "muted";
}

export default function ArchitectureOverview({ title, description, layers, tone = "default" }: ArchitectureOverviewProps) {
  return (
    <section id="architecture" className={`py-24 sm:py-32 relative ${tone === "muted" ? "bg-muted/10" : "bg-background"}`}>
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

        <div className="max-w-4xl mx-auto relative">
          <div className="absolute left-7 top-2 bottom-2 w-px bg-gradient-to-b from-primary/60 via-border to-transparent hidden sm:block" aria-hidden="true" />
          <div className="space-y-4">
            {layers.map((layer, i) => (
              <motion.div
                key={layer.name}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="relative sm:pl-20 p-6 rounded-2xl bg-muted/20 border border-border/50 hover:border-primary/30 transition-all duration-300"
              >
                <div className="hidden sm:flex absolute left-0 top-6 w-14 h-14 rounded-2xl bg-background border-2 border-primary/60 items-center justify-center shadow-sm">
                  <layer.icon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex items-center gap-3 mb-2 sm:hidden">
                  <div className="w-9 h-9 flex-none rounded-lg bg-primary/10 flex items-center justify-center">
                    <layer.icon className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="font-bold text-foreground">{layer.name}</h3>
                </div>
                <h3 className="hidden sm:block font-bold text-foreground mb-2">{layer.name}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">{layer.description}</p>
                <span className="inline-flex text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">
                  {layer.tech}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
