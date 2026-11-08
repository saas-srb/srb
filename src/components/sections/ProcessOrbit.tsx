"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LucideIcon } from "lucide-react";

export type OrbitNode = {
  label: string;
  icon: LucideIcon;
  color: string;
  detail?: string;
};

interface ProcessOrbitProps {
  eyebrowIcon: LucideIcon;
  heading: string;
  headingAccent: string;
  description: string;
  centerLabel: string;
  centerSublabel: string;
  nodes: OrbitNode[];
  numbered?: boolean;
  glow?: "primary" | "secondary";
  image?: string;
}

// Hexagon layout starting at the top, going clockwise.
const ANGLES = [-90, -30, 30, 90, 150, 210];
const RADIUS = 42;

export default function ProcessOrbit({
  eyebrowIcon: Eyebrow,
  heading,
  headingAccent,
  description,
  centerLabel,
  centerSublabel,
  nodes,
  numbered = false,
  glow = "secondary",
  image,
}: ProcessOrbitProps) {
  const [hovered, setHovered] = React.useState<number | null>(null);

  return (
    <section className="py-24 sm:py-32 bg-background relative overflow-hidden border-b border-border/50">
      {image && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-[0.05] dark:opacity-[0.15] blur-[2px] scale-110"
          />
        </div>
      )}
      <div
        className={`absolute right-0 top-0 w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none translate-x-1/3 -translate-y-1/3 ${
          glow === "primary" ? "bg-primary/15" : "bg-secondary/15"
        }`}
      />

      <div className="mx-auto max-w-5xl px-6 lg:px-8 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-muted/40 border border-border/50 mb-6 shadow-sm">
            <Eyebrow className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl mb-4">
            {heading}{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              {headingAccent}
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-20">{description}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7 }}
          className="relative mx-auto aspect-square w-full max-w-[280px] sm:max-w-[420px] lg:max-w-[520px] my-10"
        >
          <motion.div
            className="absolute inset-[8%] rounded-full border border-dashed border-primary/20"
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          />

          <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100">
            {ANGLES.map((angle, i) => {
              const rad = (angle * Math.PI) / 180;
              const x = 50 + RADIUS * Math.cos(rad);
              const y = 50 + RADIUS * Math.sin(rad);
              return (
                <line
                  key={i}
                  x1="50"
                  y1="50"
                  x2={x}
                  y2={y}
                  className={hovered === i ? "stroke-primary" : "stroke-border"}
                  strokeWidth="0.5"
                  strokeDasharray="3 3"
                  style={{ transition: "stroke 0.3s ease" }}
                >
                  <animate attributeName="stroke-dashoffset" from="12" to="0" dur="1.4s" repeatCount="indefinite" />
                </line>
              );
            })}
          </svg>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <motion.div
              className="absolute inset-0 rounded-full bg-primary/30 blur-2xl"
              animate={{ scale: [1.2, 1.4, 1.2], opacity: [0.6, 0.9, 0.6] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative w-24 h-24 sm:w-32 sm:h-32 lg:w-40 lg:h-40 rounded-full bg-gradient-to-br from-primary to-secondary flex flex-col items-center justify-center text-center p-3 shadow-2xl ring-4 ring-background">
              <span className="text-white font-bold text-xs sm:text-sm lg:text-base leading-tight">
                {centerLabel}
              </span>
              <span className="text-white/70 text-[9px] sm:text-[10px] lg:text-xs mt-1 leading-tight">
                {centerSublabel}
              </span>
            </div>
          </div>

          {nodes.map((node, i) => {
            const angle = ANGLES[i];
            const rad = (angle * Math.PI) / 180;
            const x = 50 + RADIUS * Math.cos(rad);
            const y = 50 + RADIUS * Math.sin(rad);
            const Icon = node.icon;
            return (
              <motion.div
                key={node.label}
                initial={{ opacity: 0, scale: 0.6 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.1 * i }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 group"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <AnimatePresence>
                  {hovered === i && node.detail && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.9 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-full mb-3 z-20 w-44 rounded-xl bg-foreground text-background text-[11px] leading-snug p-3 shadow-2xl pointer-events-none"
                    >
                      {node.detail}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-foreground rotate-45 -mt-1" />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="relative">
                  <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 opacity-0 group-hover:opacity-100 blur-lg transition-opacity duration-500 pointer-events-none" />
                  <div className="relative w-14 h-14 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-full bg-background border border-border/60 shadow-lg flex items-center justify-center group-hover:border-primary/40 group-hover:shadow-xl group-hover:-translate-y-1 group-hover:scale-105 transition-all duration-300">
                    <Icon className={`w-5 h-5 sm:w-7 sm:h-7 lg:w-8 lg:h-8 ${node.color} group-hover:scale-110 transition-transform duration-300`} />
                    {numbered && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
                        {i + 1}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[11px] sm:text-sm font-semibold text-foreground text-center leading-tight max-w-[80px] sm:max-w-[110px] lg:max-w-[140px]">
                  {node.label}
                </span>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
