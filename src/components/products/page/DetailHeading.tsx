"use client";

import { motion } from "framer-motion";

/** A section heading exactly as the service detail pages draw it (`ChecklistGrid`, `DeliveryTimeline`): fade-up, h2 + lead paragraph, optional eyebrow. */
export default function DetailHeading({ eyebrow, title, description, center = false }: { eyebrow?: string; title: string; description?: string; center?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6 }}
      className={`mb-14 max-w-2xl ${center ? "mx-auto text-center" : ""}`}
    >
      {eyebrow && <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>}
      <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h2>
      {description && <p className="text-lg leading-8 text-muted-foreground">{description}</p>}
    </motion.div>
  );
}
