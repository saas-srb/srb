"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, LucideIcon } from "lucide-react";

interface TechItem {
  name: string;
  category: string;
  icon: LucideIcon;
}

interface TechStackGridProps {
  title?: string;
  description?: string;
  items: TechItem[];
  tone?: "default" | "muted";
  icon?: LucideIcon;
  category?: string;
  align?: "left" | "center";
  cta?: { label: string; href: string };
}

export default function TechStackGrid({ title, description, items, tone = "default", icon: Icon, category, align = "left", cta }: TechStackGridProps) {
  const enhanced = Boolean(Icon || category);
  const centered = align === "center";

  return (
    <section id="tech-stack" className={`py-24 sm:py-32 relative ${tone === "muted" ? "bg-muted/10" : "bg-background"}`}>
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

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item, i) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: (i % 8) * 0.05 }}
              className="flex items-center gap-3 p-4 rounded-xl bg-muted/20 border border-border/50 hover:border-primary/30 hover:bg-muted/40 transition-all duration-300"
            >
              <div className="w-9 h-9 flex-none rounded-lg bg-primary/10 flex items-center justify-center">
                <item.icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground leading-tight">{item.name}</div>
                <div className="text-xs text-muted-foreground">{item.category}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {cta && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
            className="mt-14 flex justify-center"
          >
            <Link
              href={cta.href}
              className="group inline-flex items-center gap-3 text-sm font-bold text-foreground hover:text-primary transition-colors"
            >
              {cta.label}
              <span className="w-10 h-10 rounded-full bg-muted/50 border border-border/50 flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-all duration-300">
                <ArrowRight className="w-4 h-4 group-hover:text-primary-foreground group-hover:translate-x-0.5 transition-all" />
              </span>
            </Link>
          </motion.div>
        )}
      </div>
    </section>
  );
}
