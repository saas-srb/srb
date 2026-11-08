"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface SectionHeaderProps {
  category?: string;
  icon?: LucideIcon;
  heading: string;
  accent?: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}

export default function SectionHeader({
  category,
  icon: Icon,
  heading,
  accent,
  description,
  align = "left",
  className = "",
}: SectionHeaderProps) {
  const centered = align === "center";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6 }}
      className={`mb-14 sm:mb-16 ${centered ? "text-center mx-auto" : ""} max-w-2xl ${className}`}
    >
      {Icon && (
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-muted/40 border border-border/50 shadow-sm mb-6">
          <Icon className="w-6 h-6 text-primary" />
        </div>
      )}
      {category && (
        <p className="text-sm font-semibold tracking-widest uppercase text-primary mb-3">{category}</p>
      )}
      <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl mb-4 leading-[1.1]">
        {heading}
        {accent && (
          <>
            {" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              {accent}
            </span>
          </>
        )}
      </h2>
      {description && (
        <p className="text-lg leading-relaxed text-muted-foreground">{description}</p>
      )}
    </motion.div>
  );
}
