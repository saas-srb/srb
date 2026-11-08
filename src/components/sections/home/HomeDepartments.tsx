"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Sparkles, type LucideIcon } from "lucide-react";
import SectionHeader from "@/components/sections/SectionHeader";
import BrandMark from "@/components/BrandMark";
import type { HomeSectionHeaderProps } from "./types";

/**
 * Homepage "Our Specialized Service Departments" — extracted verbatim from
 * the former `src/app/(site)/Content.tsx` (section 3). The first two
 * departments render as large bento cards, the rest as compact cards.
 */

export interface DepartmentCard {
  tag: string;
  title: string;
  description: string;
  services: string[];
  icon: LucideIcon;
  href: string;
  cta: string;
  badge?: string;
  featured?: boolean;
  image: string;
}

export default function HomeDepartments({
  eyebrow,
  headerIcon,
  heading,
  accent,
  description,
  departments,
  footnoteText,
  footnoteLinkLabel,
  footnoteHref,
}: HomeSectionHeaderProps & { departments: DepartmentCard[]; footnoteText: string; footnoteLinkLabel: string; footnoteHref: string }) {
  return (
    <section className="py-24 sm:py-32 bg-muted/10 relative overflow-hidden border-b border-border/50">
      <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[900px] h-[500px] bg-primary/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <SectionHeader
          align="center"
          category={eyebrow}
          icon={headerIcon}
          heading={heading}
          accent={accent}
          description={description}
          className="mx-auto"
        />

        {/* Top 2 Featured Bento Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {departments.slice(0, 2).map((department) => {
            const IconComponent = department.icon;
            const isFeatured = department.featured;
            return (
              <motion.div
                key={department.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5 }}
                className="group relative"
              >
                <div className={`absolute -inset-1 rounded-[2.5rem] bg-gradient-to-br ${
                  isFeatured ? "from-primary/40 via-primary/10 to-secondary/30" : "from-primary/30 via-primary/0 to-secondary/30"
                } opacity-60 group-hover:opacity-100 blur-2xl transition-opacity duration-500 pointer-events-none`} />

                <Link
                  href={department.href}
                  className="relative flex flex-col justify-between h-full rounded-[2.5rem] bg-muted/10 p-8 sm:p-11 border border-border/50 hover:border-primary/40 overflow-hidden shadow-xl group-hover:shadow-2xl group-hover:shadow-primary/10 group-hover:-translate-y-1 transition-all duration-300"
                >
                  {/* Ambient color wash */}
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <Image
                      src={department.image}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 600px, 100vw"
                      className="object-cover scale-125 blur-2xl opacity-[0.09] group-hover:opacity-[0.18] transition-opacity duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/5 to-muted/20" />
                  </div>

                  {/* Ambient glow blobs */}
                  <div className={`absolute -top-32 -right-16 w-80 h-80 ${isFeatured ? "bg-primary/25" : "bg-secondary/20"} rounded-full blur-[100px] pointer-events-none`} />
                  <div className="absolute -bottom-24 -left-16 w-64 h-64 bg-primary/15 rounded-full blur-[90px] pointer-events-none" />

                  <div className="relative z-10 mb-8">
                    <div className="flex items-center justify-between gap-4 mb-6">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest ${
                        isFeatured
                          ? "text-primary-foreground bg-gradient-to-r from-primary to-brand-accent shadow-lg shadow-primary/30"
                          : "text-foreground bg-background border border-border/50"
                      } px-3.5 py-1.5 rounded-full`}>
                        <Sparkles className="w-3.5 h-3.5" />
                        {department.badge}
                      </span>
                      <div className="flex items-center gap-2 bg-background/80 border border-border/50 px-3 py-1 rounded-full backdrop-blur-sm shadow-sm">
                        <BrandMark className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">{department.tag}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mb-6">
                      <div className={`w-14 h-14 rounded-2xl ${
                        isFeatured ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" : "bg-primary/10 text-primary border border-border/50"
                      } flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                        <IconComponent className="w-7 h-7" />
                      </div>
                      <h3 className="text-2xl sm:text-3xl font-extrabold text-foreground leading-tight group-hover:text-primary transition-colors">{department.title}</h3>
                    </div>

                    <p className="text-muted-foreground text-base leading-relaxed mb-6">{department.description}</p>

                    <div className="pt-2">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                        Featured Capabilities ({department.services.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {department.services.map((service) => (
                          <span
                            key={service}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground bg-background border border-border/60 px-3 py-1 rounded-full group-hover:border-primary/40 group-hover:bg-primary/5 transition-colors duration-300"
                          >
                            <CheckCircle2 className="w-3 h-3 text-primary flex-none" />
                            {service}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="relative z-10 pt-4 border-t border-border/50">
                    <span className="inline-flex items-center gap-2 rounded-full bg-foreground group-hover:bg-primary px-6 py-3 text-sm font-bold text-background group-hover:text-primary-foreground transition-all duration-300">
                      {department.cta}
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Remaining Departments — Compact & Clean; a short last row stays centered */}
        <div className="flex flex-wrap justify-center gap-6">
          {departments.slice(2).map((department, idx) => (
            <motion.div
              key={department.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="group relative w-full md:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]"
            >
              <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-br from-primary/25 via-primary/0 to-secondary/25 opacity-0 group-hover:opacity-100 blur-lg transition-opacity duration-500 pointer-events-none" />

              <Link
                href={department.href}
                className="relative flex flex-col h-full p-7 rounded-[1.75rem] bg-muted/10 border border-border/50 overflow-hidden shadow-sm group-hover:shadow-xl group-hover:shadow-primary/10 group-hover:border-primary/40 group-hover:-translate-y-1 transition-all duration-300"
              >
                {/* Ambient color wash, sampled from the item's real image */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <Image
                    src={department.image}
                    alt=""
                    fill
                    sizes="400px"
                    className="object-cover scale-125 blur-2xl opacity-[0.08] group-hover:opacity-[0.16] transition-opacity duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/5 to-muted/20" />
                </div>

                <span className="pointer-events-none absolute -top-4 -right-2 text-6xl font-black leading-none text-muted-foreground/[0.07] group-hover:text-primary/10 transition-colors duration-500 select-none">
                  0{idx + 3}
                </span>

                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:scale-110 transition-all duration-300">
                      <department.icon className="w-5 h-5 text-primary group-hover:text-primary-foreground transition-colors" />
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground bg-background/70 border border-border/50 px-2.5 py-1 rounded-full backdrop-blur-sm group-hover:border-primary/30 group-hover:text-foreground transition-colors duration-300">
                      <BrandMark className="w-3.5 h-3.5" />
                      <span>0{idx + 3}</span>
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-foreground mb-2 leading-snug">{department.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">{department.description}</p>

                  <div className="mb-6 flex-1">
                    <div className="flex flex-wrap gap-1.5">
                      {department.services.slice(0, 4).map((service) => (
                        <span
                          key={service}
                          className="inline-flex items-center text-[11px] font-semibold text-foreground bg-muted/40 border border-border/50 px-2.5 py-1 rounded-full group-hover:border-primary/30 group-hover:bg-primary/5 transition-colors duration-300"
                        >
                          {service}
                        </span>
                      ))}
                      {department.services.length > 4 && (
                        <span className="inline-flex items-center text-[11px] font-semibold text-muted-foreground px-2.5 py-1">
                          +{department.services.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="mt-auto inline-flex w-fit items-center gap-1.5 text-sm font-bold text-foreground group-hover:text-primary group-hover:gap-2.5 transition-all duration-300">
                    {department.cta}
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {footnoteText && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-14 flex justify-center"
          >
            <p className="text-sm text-muted-foreground text-center">
              {footnoteText}{" "}
              <Link href={footnoteHref} className="font-bold text-foreground hover:text-primary transition-colors">
                {`${footnoteLinkLabel} `}<ArrowRight className="inline w-3.5 h-3.5 ml-0.5" />
              </Link>
            </p>
          </motion.div>
        )}
      </div>
    </section>
  );
}
