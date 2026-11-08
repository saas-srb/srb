"use client";

import { motion } from "framer-motion";
import { Clock } from "lucide-react";

interface DeliveryBand {
  scope: string;
  duration: string;
  fill: number;
  description: string;
}

interface DeliveryTimelineProps {
  title: string;
  description?: string;
  bands: DeliveryBand[];
  tone?: "default" | "muted";
}

export default function DeliveryTimeline({ title, description, bands, tone = "default" }: DeliveryTimelineProps) {
  return (
    <section id="delivery-timeline" className={`py-24 sm:py-32 relative ${tone === "muted" ? "bg-muted/10" : "bg-background"}`}>
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

        <div className="max-w-3xl mx-auto space-y-6">
          {bands.map((band, i) => (
            <motion.div
              key={band.scope}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="p-6 rounded-2xl bg-muted/20 border border-border/50 hover:border-primary/30 transition-all duration-300"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="font-bold text-foreground">{band.scope}</h3>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full">
                  <Clock className="w-3.5 h-3.5" />
                  {band.duration}
                </span>
              </div>
              <div className="h-2 rounded-full bg-background border border-border/50 overflow-hidden mb-3">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${band.fill}%` }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.8, delay: i * 0.1 + 0.1, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-primary to-brand-accent"
                />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{band.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
