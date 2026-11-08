"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface LegalSectionProps {
  id: string;
  title: string;
  icon: LucideIcon;
  paragraphs: ReactNode[];
  bullets?: string[];
}

export default function LegalSection({ id, title, icon: Icon, paragraphs, bullets }: LegalSectionProps) {
  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5 }}
      className="scroll-mt-32 pb-12 border-b border-border/50 last:border-b-0 last:pb-0"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 flex-none rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
      </div>

      <div className="space-y-4 pl-14">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-base leading-relaxed text-muted-foreground">
            {p}
          </p>
        ))}
        {bullets && (
          <ul className="space-y-2 pt-1">
            {bullets.map((b) => (
              <li key={b} className="flex gap-3 text-base leading-relaxed text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-none mt-2.5" />
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}
