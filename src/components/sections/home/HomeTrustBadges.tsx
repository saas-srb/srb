"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

/**
 * Homepage "Trust Badges" strip — extracted verbatim from the former
 * `src/app/(site)/Content.tsx` (section 2). Only the badge list is a prop.
 */

const fadeIn = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8 } } };
const stagger = { visible: { transition: { staggerChildren: 0.1 } } };

export default function HomeTrustBadges({ badges }: { badges: { label: string; icon: LucideIcon }[] }) {
  return (
    <section className="relative bg-background border-b border-border/50 py-8 sm:py-10">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          variants={stagger}
          className="flex flex-wrap items-center justify-center gap-3 sm:gap-4"
        >
          {badges.map((badge) => (
            <motion.div
              key={badge.label}
              variants={fadeIn}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-muted/40 border border-border/50 text-xs sm:text-sm font-semibold text-foreground backdrop-blur-md shadow-sm"
            >
              <badge.icon className="w-4 h-4 text-primary flex-none" />
              {badge.label}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
