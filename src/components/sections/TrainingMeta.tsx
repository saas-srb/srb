"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface MetaItem {
  icon: LucideIcon;
  label: string;
  value: string;
}

interface TrainingMetaProps {
  items: MetaItem[];
}

export default function TrainingMeta({ items }: TrainingMetaProps) {
  return (
    <section id="duration" className="py-16 bg-primary/5 border-y border-border/50 relative">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {items.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="flex flex-col items-center text-center gap-3"
            >
              <div className="w-12 h-12 rounded-2xl bg-background border border-border/50 flex items-center justify-center shadow-sm">
                <item.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-bold text-foreground text-sm sm:text-base">{item.value}</div>
                <div className="text-xs sm:text-sm text-muted-foreground">{item.label}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
