"use client";

import { useText } from "@/components/products/sitecraft-ai/TextContext";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ProductItem } from "@/types/content";
import ProductMockup from "./ProductMockup";
import ProductLogo from "@/components/products/ProductLogo";
import Link from "next/link";
import {
  X,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Zap,
  Users,
  Building2,
  Layers,
  AlertCircle,
  TrendingUp,
  Target,
} from "lucide-react";

interface ProductDetailModalProps {
  product: ProductItem | null;
  onClose: () => void;
}

export default function ProductDetailModal({ product, onClose }: ProductDetailModalProps) {
  const tx = useText();
  const [activeTab, setActiveTab] = useState<"preview" | "outcomes" | "features">("preview");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (product) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [product, onClose]);

  if (!product) return null;


  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:p-8 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-background/80 backdrop-blur-xl"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="relative w-full max-w-5xl rounded-3xl border border-border/80 bg-card shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col z-10"
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-6 py-5 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-secondary/20 border border-primary/30 shadow-md">
                <ProductLogo productKey={product.slug} size={36} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-black text-foreground tracking-tight">{product.name}</h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
                    {product.badge}
                  </span>
                </div>
                <p className="text-xs font-medium text-primary mt-0.5">{product.tagline}</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-full p-2 text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
              aria-label="Close modal"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Modal Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-6 py-2 shrink-0">
            <button
              onClick={() => setActiveTab("preview")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "preview"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />{tx("catalog.productDetailModal.live-ui-showcase-hotspots")}</button>

            <button
              onClick={() => setActiveTab("outcomes")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "outcomes"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Target className="w-3.5 h-3.5" />{tx("catalog.productDetailModal.problem-solved-business-roi")}</button>

            <button
              onClick={() => setActiveTab("features")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "features"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />{tx("catalog.productDetailModal.capabilities-ai-engine")}</button>
          </div>

          {/* Modal Body */}
          <div className="overflow-y-auto p-6 md:p-8 space-y-8">
            {/* Tab 1: Live UI Showcase */}
            {activeTab === "preview" && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary" />
                      {tx("catalog.productDetailModal.live-application-interface-interactive-h")}</h3>
                    <span className="text-xs text-primary font-mono">{tx("catalog.productDetailModal.hover-pulsing-callout-pins")}</span>
                  </div>
                  <ProductMockup product={product} showTabSelector={true} compact={false} />
                </div>

                {/* Metrics Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {product.metrics.map((metric, idx) => (
                    <div key={idx} className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-center">
                      <div className="text-2xl font-black tracking-tight text-primary">{metric.value}</div>
                      <div className="text-xs font-medium text-muted-foreground mt-1">{metric.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 2: Business ROI & Outcomes */}
            {activeTab === "outcomes" && (
              <div className="space-y-6">
                {/* Problem Solved & Outcome Highlights */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="rounded-3xl border border-secondary/25 bg-secondary/8 p-6 space-y-3">
                    <div className="flex items-center gap-2 text-secondary-foreground font-bold text-sm uppercase tracking-wider">
                      <AlertCircle className="w-5 h-5 text-secondary-foreground" />{tx("catalog.productDetailModal.what-problem-does-this-solve")}</div>
                    <p className="text-sm text-foreground/90 font-medium leading-relaxed">
                      {product.problemSolved}
                    </p>
                  </div>

                  <div className="rounded-3xl border border-primary/25 bg-primary/8 p-6 space-y-3">
                    <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider">
                      <TrendingUp className="w-5 h-5 text-primary" />{tx("catalog.productDetailModal.primary-business-outcome")}</div>
                    <p className="text-sm text-foreground/90 font-semibold leading-relaxed">
                      {product.businessOutcome}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                  <div className="md:col-span-7 space-y-4">
                    <h3 className="text-lg font-bold text-foreground">{tx("catalog.productDetailModal.detailed-product-overview")}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{product.fullDescription}</p>

                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider">{tx("catalog.productDetailModal.primary-purpose")}</h4>
                      <p className="text-sm text-foreground/90 font-medium">{product.primaryPurpose}</p>
                    </div>
                  </div>

                  <div className="md:col-span-5 space-y-6">
                    {/* Target Departments */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-primary" />{tx("catalog.productDetailModal.target-departments")}</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {product.targetDepartments.map((dept, idx) => (
                          <span key={idx} className="px-3 py-1 rounded-full bg-muted border border-border/60 text-xs font-medium text-foreground">
                            {dept}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Target Users */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-primary" />{tx("catalog.productDetailModal.key-user-roles")}</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {product.targetUsers.map((user, idx) => (
                          <span key={idx} className="px-3 py-1 rounded-full bg-secondary/15 border border-secondary/20 text-xs font-medium text-secondary-foreground">
                            {user}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Features & AI Capabilities */}
            {activeTab === "features" && (
              <div className="space-y-6">
                {/* Key Features Breakdown */}
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-primary" />{tx("catalog.productDetailModal.major-capabilities-features")}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {product.keyFeatures.map((feat, idx) => (
                      <div key={idx} className="rounded-2xl border border-border/60 bg-muted/20 p-4 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-foreground">{feat.title}</span>
                          {feat.aiPowered && (
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold border border-primary/20 flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />{tx("catalog.productDetailModal.ai-feature")}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{feat.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI Capabilities Section */}
                {product.aiCapabilities && product.aiCapabilities.length > 0 && (
                  <div className="rounded-3xl border border-primary/25 bg-primary/8 p-6 space-y-4">
                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" />{tx("catalog.productDetailModal.embedded-ai-intelligence-capabilities")}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {product.aiCapabilities.map((aiCap, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-xs text-foreground/90">
                          <Zap className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <span>{aiCap}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/40 px-6 py-4 backdrop-blur-md shrink-0">
            <div className="text-xs text-muted-foreground hidden sm:block font-medium">
              {tx("catalog.productDetailModal.panel-path")}<span className="font-mono text-foreground">{product.panelPath}</span>
            </div>

            <div className="flex items-center gap-3 ml-auto">
              <Link
                href={`/products/${product.slug}`}
                onClick={onClose}
                className="hidden sm:inline-flex px-5 py-2.5 rounded-full border border-border/60 text-xs font-bold text-foreground hover:bg-muted transition-colors"
              >
                {tx("catalog.productDetailModal.full-page") || "Full product page"}
              </Link>
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-full border border-border/60 text-xs font-bold text-foreground hover:bg-muted transition-colors"
              >
                {tx("catalog.productDetailModal.close-preview")}</button>
              <Link
                href={`/contact?product=${product.slug}`}
                onClick={onClose}
                className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/25"
              >
                {tx("catalog.productDetailModal.schedule-demo-for")}{product.name.split(" ")[0]}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
