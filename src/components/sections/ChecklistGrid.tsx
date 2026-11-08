"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronRight } from "lucide-react";

interface ChecklistItem {
  title: string;
  description: ReactNode;
  href?: string;
}

interface ChecklistGridProps {
  id: string;
  title: string;
  description?: ReactNode;
  items: ChecklistItem[];
  columns?: 2 | 3;
  tone?: "default" | "muted";
}

export default function ChecklistGrid({ id, title, description, items, columns = 2, tone = "default" }: ChecklistGridProps) {
  return (
    <section id={id} className={`py-24 sm:py-32 relative ${tone === "muted" ? "bg-muted/10" : "bg-background"}`}>
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

        <div className={`grid grid-cols-1 sm:grid-cols-2 ${columns === 3 ? "lg:grid-cols-3" : ""} gap-5`}>
          {items.map((item, i) => {
            const icon = (
              <div className="w-9 h-9 flex-none rounded-lg bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-primary" />
              </div>
            );

            const body = (
              <>
                {icon}
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-foreground mb-1.5 leading-snug">{item.title}</h3>
                    {item.href && (
                      <ChevronRight className="w-4 h-4 flex-none text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              </>
            );

            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: (i % 6) * 0.07 }}
                className="group rounded-2xl bg-muted/20 border border-border/50 hover:border-primary/30 hover:bg-muted/40 transition-all duration-300"
              >
                {item.href ? (
                  <Link href={item.href} className="flex gap-4 p-6">
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-4 p-6">{body}</div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
