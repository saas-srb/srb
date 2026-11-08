"use client";

import { motion } from "framer-motion";
import { ExternalLink, Play, Sparkles, Zap } from "lucide-react";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

interface LiveDemoSectionProps {
  demoUrl: string;
  heading?: string;
  description?: string;
  previewImage: string;
  badge: string;
  launchLabel: string;
  newTabNote: string;
  previewAlt: string;
}

export default function LiveDemoSection({
  demoUrl,
  heading: headingProp,
  description: descriptionProp,
  previewImage,
  badge,
  launchLabel,
  newTabNote,
  previewAlt,
}: LiveDemoSectionProps) {
  const l = useUiLabels();
  const description = descriptionProp ?? l.liveDemoDescription;
  const heading = headingProp ?? l.liveDemoHeading;
  const displayUrl = demoUrl.replace(/^https?:\/\//, "");

  return (
    <section className="py-24 sm:py-32 bg-gradient-to-br from-primary/5 via-background to-secondary/10 relative overflow-hidden border-y border-border/50">
      <div className="absolute -top-[10%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-primary/15 blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-[20%] -right-[10%] w-[45vw] h-[45vw] rounded-full bg-secondary/20 blur-[130px] pointer-events-none" />

      <div className="mx-auto max-w-6xl px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm font-bold text-primary mb-6">
              <Sparkles className="w-4 h-4" />
              {badge}
            </span>
            <h2 className="text-4xl font-black tracking-tight text-foreground sm:text-5xl mb-5 leading-[1.1]">
              {heading}
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-lg">
              {description}
            </p>
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <a
                href={demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-bold text-primary-foreground hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/30 w-full sm:w-auto"
              >
                <Zap className="w-4 h-4" />
                {launchLabel}
                <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </a>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              {newTabNote}<span className="font-mono text-foreground/80">{displayUrl}</span>
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative"
          >
            <a
              href={demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group block relative rounded-[2rem] border border-border/60 shadow-2xl overflow-hidden bg-background"
            >
              <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50 bg-muted/30">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400/80"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-400/80"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400/80"></div>
                </div>
                <div className="flex-1 mx-4 rounded-full bg-background border border-border/50 px-3 py-1 text-[11px] text-muted-foreground truncate text-center font-mono">
                  {displayUrl}
                </div>
              </div>
              <div className="relative aspect-[4/3]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewImage}
                  alt={previewAlt}
                  className="absolute inset-0 w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-white/15 backdrop-blur-md border border-white/30 flex items-center justify-center group-hover:scale-110 group-hover:bg-primary transition-all duration-300">
                    <Play className="w-8 h-8 text-white fill-white ml-1" />
                  </div>
                </div>
              </div>
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
