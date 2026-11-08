"use client";

import { useText } from "@/components/products/sitecraft-ai/TextContext";
import React from "react";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import type { ProductItem } from "@/types/content";
import ProductMockup from "./ProductMockup";
import ProductLogo from "@/components/products/ProductLogo";
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Globe,
  Layers,
} from "lucide-react";

interface ProductCardProps {
  product: ProductItem;
  onSelect: (product: ProductItem) => void;
}

export default function ProductCard({ product, onSelect }: ProductCardProps) {
  const tx = useText();
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const springConfig = { stiffness: 250, damping: 25 };
  const rotateX = useSpring(useTransform(mouseY, [0, 1], [3, -3]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [0, 1], [-3, 3]), springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  };

  const handleMouseLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformPerspective: 1000 }}
      className="group relative flex flex-col justify-between rounded-3xl border border-border/80 bg-card/90 p-6 sm:p-8 transition-all duration-500 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10 overflow-hidden backdrop-blur-xl"
    >
      {/* Background Ambient Glow — subtle brand accents */}
      <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-secondary/10 blur-3xl opacity-0 group-hover:opacity-80 transition-opacity duration-700 pointer-events-none" />

      <div className="space-y-5">
        {/* Top Navigation & Pill Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/15 border border-secondary/25 text-xs font-bold text-secondary-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {product.category}
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-[11px] font-mono text-muted-foreground border border-border/50">
              <Globe className="w-3 h-3 text-primary/70" />
              {product.panelPath}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {product.aiCapabilities && product.aiCapabilities.length > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 border border-primary/25 text-xs font-bold text-primary shadow-xs">
                <Sparkles className="w-3.5 h-3.5" />
                {tx("catalog.productCard.ai-embedded")}</span>
            )}
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/50 border border-border/40 text-[11px] font-semibold text-muted-foreground">
              <Layers className="w-3 h-3" />
              {product.badge}
            </span>
          </div>
        </div>

        {/* Product Identity Header */}
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 via-secondary/15 to-primary/5 border border-primary/25 shadow-md group-hover:scale-105 group-hover:rotate-2 transition-all duration-300">
            <ProductLogo productKey={product.slug} size={40} />
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-black tracking-tight text-foreground group-hover:text-primary transition-colors leading-tight">
              {product.name}
            </h3>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">
              {product.tagline}
            </p>
          </div>
        </div>

        {/* Short Description — Full natural text, NO truncation cutoff */}
        <p className="text-sm leading-relaxed text-muted-foreground font-normal">
          {product.shortDescription}
        </p>

        {/* Problem Solved & Business Outcome Bento Block */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          {product.problemSolved && (
            <div className="rounded-2xl border border-secondary/25 bg-secondary/8 p-4 space-y-2 hover:border-secondary/40 transition-colors">
              <div className="flex items-center gap-1.5 text-xs font-bold text-secondary-foreground uppercase tracking-wider">
                <AlertCircle className="w-4 h-4 text-secondary-foreground shrink-0" />
                <span>{tx("catalog.productCard.problem-solved")}</span>
              </div>
              <p className="text-xs text-foreground/90 font-medium leading-relaxed">
                {product.problemSolved}
              </p>
            </div>
          )}

          {product.businessOutcome && (
            <div className="rounded-2xl border border-primary/25 bg-primary/8 p-4 space-y-2 hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider">
                <TrendingUp className="w-4 h-4 text-primary shrink-0" />
                <span>{tx("catalog.productCard.expected-outcome")}</span>
              </div>
              <p className="text-xs text-foreground/90 font-medium leading-relaxed">
                {product.businessOutcome}
              </p>
            </div>
          )}
        </div>

        {/* Embedded UI Preview Mockup Canvas */}
        <div className="rounded-2xl overflow-hidden shadow-xl border border-border/70 group-hover:border-primary/30 transition-all duration-300">
          <ProductMockup product={product} showTabSelector={false} compact={true} />
        </div>

        {/* Key Features Highlights */}
        <div className="space-y-2 pt-1">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {tx("catalog.productCard.key-capabilities")}</div>
          <div className="grid grid-cols-1 gap-2">
            {product.keyFeatures.slice(0, 3).map((feat, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-xs">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-foreground mr-1">{feat.title}:</span>
                  <span className="text-muted-foreground font-normal">{feat.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Card Footer: Audience tags + CTA button */}
      <div className="mt-6 pt-5 border-t border-border/50 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1.5">
          {product.targetDepartments.map((dept, idx) => (
            <span
              key={idx}
              className="px-2.5 py-1 rounded-lg bg-muted/60 text-[11px] font-medium text-muted-foreground border border-border/50"
            >
              {dept}
            </span>
          ))}
        </div>

        <button
          onClick={() => onSelect(product)}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/30 active:scale-95 shadow-md shadow-primary/20 shrink-0"
        >
          <span>{tx("catalog.productCard.explore-product-details")}</span>
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </motion.div>
  );
}

