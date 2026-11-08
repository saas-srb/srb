"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, LucideIcon } from "lucide-react";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

interface RelatedService {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

interface RelatedServicesProps {
  title?: string;
  services: RelatedService[];
  tone?: "default" | "muted";
}

export default function RelatedServices({ title: titleProp, services, tone = "default" }: RelatedServicesProps) {
  const l = useUiLabels();
  const title = titleProp ?? l.relatedServicesTitle;
  return (
    <section id="related-services" className={`py-24 sm:py-32 relative ${tone === "muted" ? "bg-muted/10" : "bg-background"}`}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-14"
        >
          {title}
        </motion.h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {services.map((service, i) => (
            <motion.div
              key={service.href}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group rounded-2xl bg-muted/20 border border-border/50 hover:border-primary/30 hover:-translate-y-1 transition-all duration-300"
            >
              <Link href={service.href} className="flex flex-col h-full p-6">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <service.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-bold text-foreground mb-2 leading-snug">{service.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">{service.description}</p>
                <span className="inline-flex items-center text-sm font-semibold text-foreground group-hover:text-primary group-hover:gap-3 gap-2 transition-all">
                  {l.exploreService} <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
