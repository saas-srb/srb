"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, type LucideIcon } from "lucide-react";
import SectionHeader from "@/components/sections/SectionHeader";
import BrandMark from "@/components/BrandMark";
import type { HomeSectionHeaderProps } from "./types";

/**
 * The homepage's five numbered-card sections, extracted verbatim from the
 * former `src/app/(site)/Content.tsx` (sections 4, 5, 6, 7 and 12). They
 * look alike but differ in small, deliberate details (padding, number
 * format, connector arrows, stagger timing), so each keeps its own exact
 * markup rather than being folded into one parameterised grid.
 */

function Header({ eyebrow, headerIcon, heading, accent, description }: HomeSectionHeaderProps) {
  return (
    <SectionHeader
      align="center"
      category={eyebrow}
      icon={headerIcon}
      heading={heading}
      accent={accent}
      description={description}
      className="mx-auto"
    />
  );
}

function FooterLink({ label, href, circleClass }: { label: string; href: string; circleClass: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="mt-14 flex justify-center"
    >
      <Link
        href={href}
        className="group inline-flex items-center gap-3 text-sm font-bold text-foreground hover:text-primary transition-colors"
      >
        {label}
        <span className={`w-10 h-10 rounded-full ${circleClass} border border-border/50 flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-all duration-300`}>
          <ArrowRight className="w-4 h-4 group-hover:text-primary-foreground group-hover:translate-x-0.5 transition-all" />
        </span>
      </Link>
    </motion.div>
  );
}

export { FooterLink as HomeFooterLink };

// ── 4. Why Choose Us ─────────────────────────────────────────────────────

export function HomeWhyChooseUs({ reasons, ...header }: HomeSectionHeaderProps & { reasons: { name: string; desc: string; icon: LucideIcon }[] }) {
  return (
    <section className="py-24 sm:py-32 bg-muted/10 relative overflow-hidden">
      <div className="absolute right-0 top-1/3 -translate-y-1/2 translate-x-1/2 w-[700px] h-[700px] bg-secondary/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <Header {...header} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {reasons.map((reason, i) => (
            <motion.div
              key={reason.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: (i % 4) * 0.08 }}
              className="group relative"
            >
              <div className="absolute -inset-1 rounded-[1.75rem] bg-gradient-to-br from-primary/25 via-primary/0 to-secondary/25 opacity-0 group-hover:opacity-100 blur-lg transition-opacity duration-500 pointer-events-none" />

              <div className="relative h-full p-6 rounded-3xl bg-background/90 dark:bg-muted/10 backdrop-blur-md border border-border/60 shadow-md group-hover:shadow-xl group-hover:shadow-primary/10 group-hover:border-primary/40 group-hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                {/* Ambient color wash matching department card background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/15 opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/5 to-muted/20" />
                </div>

                <span className="pointer-events-none absolute -top-3 -right-1 text-5xl font-black leading-none text-muted-foreground/[0.06] group-hover:text-primary/10 transition-colors duration-500 select-none">
                  0{i + 1}
                </span>

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-brand-accent flex items-center justify-center shadow-md shadow-primary/20 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                      <reason.icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground bg-background/70 border border-border/50 px-2.5 py-1 rounded-full backdrop-blur-sm group-hover:border-primary/30 group-hover:text-foreground transition-colors duration-300">
                      <BrandMark className="w-3.5 h-3.5" />
                      <span>0{i + 1}</span>
                    </span>
                  </div>
                  <h3 className="font-bold text-foreground mb-2 leading-snug">{reason.name}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{reason.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 5. How We Work ───────────────────────────────────────────────────────

export function HomeHowWeWork({
  steps,
  linkLabel,
  linkHref,
  ...header
}: HomeSectionHeaderProps & { steps: { title: string; description: string; icon: LucideIcon }[]; linkLabel?: string; linkHref?: string }) {
  return (
    <section className="py-24 sm:py-32 bg-background relative overflow-hidden border-b border-border/50">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <Header {...header} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group relative"
            >
              <div className="absolute -inset-1 rounded-[1.75rem] bg-gradient-to-br from-primary/25 via-primary/0 to-secondary/25 opacity-0 group-hover:opacity-100 blur-lg transition-opacity duration-500 pointer-events-none" />

              <div className="relative h-full p-7 rounded-3xl bg-background/90 dark:bg-muted/10 backdrop-blur-md border border-border/60 shadow-md group-hover:shadow-xl group-hover:shadow-primary/10 group-hover:border-primary/40 group-hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                {/* Ambient color wash matching department card background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute inset-0 bg-gradient-to-br from-secondary/15 via-transparent to-primary/10 opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/5 to-muted/20" />
                </div>

                <span className="pointer-events-none absolute -top-4 -right-2 text-6xl font-black leading-none text-muted-foreground/[0.06] group-hover:text-primary/10 transition-colors duration-500 select-none">
                  {String(i + 1).padStart(2, "0")}
                </span>

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-brand-accent flex items-center justify-center shadow-md shadow-primary/20 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                      <step.icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground bg-background/70 border border-border/50 px-2.5 py-1 rounded-full backdrop-blur-sm group-hover:border-primary/30 group-hover:text-foreground transition-colors duration-300">
                      <BrandMark className="w-3.5 h-3.5" />
                      <span>Step {i + 1}</span>
                    </span>
                  </div>
                  <h3 className="font-bold text-foreground mb-2 leading-snug">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
              </div>

              {i < steps.length - 1 && (
                <div className="hidden lg:flex absolute top-1/2 -right-[calc(0.75rem+1px)] -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-background border border-border/50 items-center justify-center group-hover:border-primary/40 transition-colors duration-300">
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {linkLabel && linkHref && <FooterLink label={linkLabel} href={linkHref} circleClass="bg-muted/50" />}
      </div>
    </section>
  );
}

// ── 6. Our Delivery Process ──────────────────────────────────────────────

export function HomeDeliveryProcess({
  phases,
  ...header
}: HomeSectionHeaderProps & { phases: { title: string; duration: string; topics: string[]; icon: LucideIcon }[] }) {
  return (
    <section className="py-24 sm:py-32 bg-muted/10 relative overflow-hidden">
      <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[900px] h-[500px] bg-primary/10 rounded-full blur-[160px] pointer-events-none"></div>
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <Header {...header} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {phases.map((phase, i) => (
            <motion.div
              key={phase.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: (i % 4) * 0.08 }}
              className="group relative"
            >
              <div className="absolute -inset-1 rounded-[1.75rem] bg-gradient-to-br from-primary/25 via-primary/0 to-secondary/25 opacity-0 group-hover:opacity-100 blur-lg transition-opacity duration-500 pointer-events-none" />

              <div className="relative h-full flex flex-col p-6 rounded-3xl bg-background/90 dark:bg-muted/10 backdrop-blur-md border border-border/60 shadow-md group-hover:shadow-xl group-hover:shadow-primary/10 group-hover:border-primary/40 group-hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                {/* Ambient color wash matching department card background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/15 opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/5 to-muted/20" />
                </div>

                <span className="pointer-events-none absolute -top-4 -right-2 text-6xl font-black leading-none text-muted-foreground/[0.06] group-hover:text-primary/10 transition-colors duration-500 select-none">
                  {String(i + 1).padStart(2, "0")}
                </span>

                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-brand-accent flex items-center justify-center shadow-md shadow-primary/20 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                      <phase.icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
                      <BrandMark className="w-3.5 h-3.5" />
                      {phase.duration}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-foreground mb-3 leading-snug">{phase.title}</h3>

                  <ul className="space-y-1.5 mt-auto">
                    {phase.topics.map((topic) => (
                      <li key={topic} className="text-sm text-muted-foreground flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-none" />
                        {topic}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {i < phases.length - 1 && (i + 1) % 4 !== 0 && (
                <div className="hidden lg:flex absolute top-1/2 -right-[calc(1.25rem+1px)] -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-background border border-border/50 items-center justify-center group-hover:border-primary/40 transition-colors duration-300">
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 7. Client Commitment ─────────────────────────────────────────────────

export function HomeCommitments({ items, ...header }: HomeSectionHeaderProps & { items: { title: string; description: string; icon: LucideIcon }[] }) {
  return (
    <section className="py-24 sm:py-32 bg-background relative overflow-hidden">
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/3 w-[500px] h-[500px] bg-secondary/10 rounded-full blur-[120px] pointer-events-none opacity-50"></div>
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <Header {...header} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group relative"
            >
              <div className="absolute -inset-1 rounded-[1.75rem] bg-gradient-to-br from-primary/25 via-primary/0 to-secondary/25 opacity-0 group-hover:opacity-100 blur-lg transition-opacity duration-500 pointer-events-none" />

              <div className="relative h-full p-7 rounded-3xl bg-background/90 dark:bg-muted/10 backdrop-blur-md border border-border/60 shadow-md group-hover:shadow-xl group-hover:shadow-primary/10 group-hover:border-primary/40 group-hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                {/* Ambient color wash matching department card background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/15 opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/5 to-muted/20" />
                </div>

                <span className="pointer-events-none absolute -top-4 -right-2 text-6xl font-black leading-none text-muted-foreground/[0.06] group-hover:text-primary/10 transition-colors duration-500 select-none">
                  {String(i + 1).padStart(2, "0")}
                </span>

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-brand-accent flex items-center justify-center shadow-md shadow-primary/20 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                      <item.icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground bg-background/70 border border-border/50 px-2.5 py-1 rounded-full backdrop-blur-sm group-hover:border-primary/30 group-hover:text-foreground transition-colors duration-300">
                      <BrandMark className="w-3.5 h-3.5" />
                      <span>0{i + 1}</span>
                    </span>
                  </div>
                  <h3 className="font-bold text-foreground mb-2 leading-snug">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 12. Transparency & Trust ─────────────────────────────────────────────

export function HomeAssurances({ items, ...header }: HomeSectionHeaderProps & { items: { title: string; desc: string; icon: LucideIcon }[] }) {
  return (
    <section className="py-24 sm:py-32 bg-muted/10 relative overflow-hidden">
      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/3 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none opacity-50"></div>
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <Header {...header} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {items.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group relative"
            >
              <div className="absolute -inset-1 rounded-[1.75rem] bg-gradient-to-br from-primary/25 via-primary/0 to-secondary/25 opacity-0 group-hover:opacity-100 blur-lg transition-opacity duration-500 pointer-events-none" />

              <div className="relative h-full flex flex-col items-center text-center gap-3 p-6 rounded-3xl bg-background/90 dark:bg-muted/10 backdrop-blur-md border border-border/60 shadow-md group-hover:shadow-xl group-hover:shadow-primary/10 group-hover:border-primary/40 group-hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                {/* Ambient color wash matching department card background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/15 opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/5 to-muted/20" />
                </div>
                <div className="w-full flex items-center justify-between">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-brand-accent flex items-center justify-center shadow-md shadow-primary/20 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                    <item.icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground bg-background/70 border border-border/50 px-2 py-0.5 rounded-full backdrop-blur-sm">
                    <BrandMark className="w-3 h-3" />
                  </span>
                </div>
                <div className="text-sm font-bold text-foreground mt-1">{item.title}</div>
                <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{item.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
