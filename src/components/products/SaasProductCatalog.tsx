"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ProductItem } from "@/types/content";
import { TextProvider } from "@/components/products/sitecraft-ai/TextContext";
import { useProducts } from "@/components/products/sitecraft-ai/useProducts";
import ProductCard from "@/components/products/ProductCard";
import ProductDetailModal from "@/components/products/ProductDetailModal";
import ProductLogo from "@/components/products/ProductLogo";
import ProductMockup from "@/components/products/ProductMockup";
import EcosystemVisualizer from "@/components/products/EcosystemVisualizer";
import Link from "next/link";
import {
  Search,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Bot,
  Lock,
  Database,
  ChevronDown,
  X,
  Zap,
  TrendingUp,
  DollarSign,
  Cpu,
  Layers,
  Box,
  CheckCircle2,
  Users,
  Mail,
  Phone,
  Clock3,
  Loader2,
} from "lucide-react";
import { SUCCESS_AUTO_HIDE_MS, useLeadSubmit } from "@/lib/useLeadSubmit";
import { useStableCardHeight } from "@/lib/useStableCardHeight";
import LeadSuccessState from "@/components/sections/LeadSuccessState";
import { useText } from "@/components/products/sitecraft-ai/TextContext";
import { useSiteInfo } from "@/components/products/sitecraft-ai/SiteInfoContext";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

/**
 * The Our SaaS Product catalogue — extracted verbatim from the former
 * `services/our-saas-product/Content.tsx`. Products now come from the CMS
 * products collection (Collections → SaaS Products; built-in catalogue as the
 * fallback) instead of the static PRODUCTS_DATA import, so product edits reach
 * the grid, the detail modal, the flagship showcases and the demo form.
 */
/** The catalogue as a CMS section: its text dictionary + filter tabs come from the section config. */
export function SaasProductCatalogSection({ text, categories }: { text: Record<string, string>; categories: string[] }) {
  return (
    <TextProvider text={text}>
      <SaasProductCatalog categories={categories} />
    </TextProvider>
  );
}

export default function SaasProductCatalog({ categories }: { categories: string[] }) {
  /** The first filter tab shows every product. */
  const allLabel = categories[0] ?? "";
  const tx = useText();
  const { brand: siteBrand, contact: siteContact } = useSiteInfo();
  const brandName = siteBrand.namePrimary + siteBrand.nameAccent;
  const PRODUCTS = useProducts();
  const [selectedCategory, setSelectedCategory] = useState<string>(allLabel);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeModalProduct, setActiveModalProduct] = useState<ProductItem | null>(null);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Mouse tracking state for 3D parallax tilt & spotlight effect
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [absMousePosition, setAbsMousePosition] = useState({ x: 0, y: 0 });
  const [activeHeroPillarId, setActiveHeroPillarId] = useState<string>("ai");

  // Lead Submission for CTA section
  const ctaLead = useLeadSubmit();
  const { ref: ctaCardBodyRef, minHeight: ctaCardMinHeight } = useStableCardHeight(ctaLead.status === "success");
  const [ctaSelectedProduct, setCtaSelectedProduct] = useState<string>("All SaaS Products");
  const [ctaName, setCtaName] = useState<string>("");
  const [ctaEmail, setCtaEmail] = useState<string>("");
  const [ctaPhone, setCtaPhone] = useState<string>("");
  const [ctaMessage, setCtaMessage] = useState<string>("");

  async function handleCtaSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await ctaLead.submit("software-development", {
      name: ctaName,
      email: ctaEmail,
      phone: ctaPhone,
      message: ctaMessage,
      subService: ctaSelectedProduct,
      source: "saas-product-cta",
    });
    if (ok) {
      setCtaName("");
      setCtaEmail("");
      setCtaPhone("");
      setCtaMessage("");
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setAbsMousePosition({ x: e.clientX, y: e.clientY });
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const heroPillars = useMemo(() => {
    return [
      {
        id: "ai",
        name: tx("catalog.saasProductCatalog.ai-autonomous-fleet"),
        badge: tx("catalog.saasProductCatalog.openai-rag-voice-ai"),
        icon: Bot,
        metric1: { label: tx("catalog.saasProductCatalog.active-enterprise-bots"), val: "12 Bots", sub: "OpenAI GPT-4o RAG" },
        metric2: { label: tx("catalog.saasProductCatalog.automated-resolution"), val: "99.4%", sub: "0s Response Lag" },
        stream: [
          { text: tx("catalog.saasProductCatalog.ai-bot-studio-executed-proposalgpt-for-e"), time: "Just now", icon: Bot, color: "text-primary" },
          { text: tx("catalog.saasProductCatalog.24-7-voice-ai-qualified-prospect-alex-al"), time: "12s ago", icon: Sparkles, color: "text-secondary-foreground" },
          { text: tx("catalog.saasProductCatalog.smms-reels-generator-outputted-3-instagr"), time: "45s ago", icon: CheckCircle2, color: "text-primary" },
        ],
      },
      {
        id: "hr",
        name: tx("catalog.saasProductCatalog.workforce-biometric-hr"),
        badge: tx("catalog.saasProductCatalog.payroll-ots-exam-engine"),
        icon: Users,
        metric1: { label: tx("catalog.saasProductCatalog.biometric-payroll"), val: "142 Staff", sub: "Calculated in 1-Click" },
        metric2: { label: tx("catalog.saasProductCatalog.ai-candidate-match"), val: "98.2%", sub: "Resume Vector Match" },
        stream: [
          { text: tx("catalog.saasProductCatalog.hrms-attendance-linked-payroll-processed"), time: "Just now", icon: CheckCircle2, color: "text-primary" },
          { text: tx("catalog.saasProductCatalog.ots-exam-engine-proctored-34-full-stack-"), time: "28s ago", icon: ShieldCheck, color: "text-secondary-foreground" },
          { text: tx("catalog.saasProductCatalog.ai-resume-matcher-shortlisted-3-senior-g"), time: "1m ago", icon: Sparkles, color: "text-primary" },
        ],
      },
      {
        id: "sales",
        name: tx("catalog.saasProductCatalog.sales-delivery-crm"),
        badge: tx("catalog.saasProductCatalog.lms-crm-pms-billing"),
        icon: TrendingUp,
        metric1: { label: tx("catalog.saasProductCatalog.pipeline-revenue"), val: "$1.42M", sub: "High Intent Leads" },
        metric2: { label: tx("catalog.saasProductCatalog.pms-project-delivery"), val: "34 Live", sub: "100% Billing Ready" },
        stream: [
          { text: tx("catalog.saasProductCatalog.lms-lead-capture-auto-synced-with-sales-"), time: "Just now", icon: TrendingUp, color: "text-primary" },
          { text: tx("catalog.saasProductCatalog.pms-timesheets-generated-invoice-for-ent"), time: "18s ago", icon: CheckCircle2, color: "text-secondary-foreground" },
          { text: tx("catalog.saasProductCatalog.project-command-center-flagged-milestone"), time: "52s ago", icon: Zap, color: "text-primary" },
        ],
      },
      {
        id: "vault",
        name: tx("catalog.saasProductCatalog.governance-key-vault"),
        badge: tx("catalog.saasProductCatalog.central-rbac-dlms-vault"),
        icon: Lock,
        metric1: { label: tx("catalog.saasProductCatalog.company-secrets"), val: "84 Keys", sub: "100% Encrypted" },
        metric2: { label: tx("catalog.saasProductCatalog.security-audit"), val: "0 Breaches", sub: "Immutable Reveal Logs" },
        stream: [
          { text: tx("catalog.saasProductCatalog.dlms-secret-vault-rotated-aws-production"), time: "Just now", icon: Lock, color: "text-primary" },
          { text: tx("catalog.saasProductCatalog.super-admin-rbac-granted-developer-scope"), time: "30s ago", icon: ShieldCheck, color: "text-secondary-foreground" },
          { text: tx("catalog.saasProductCatalog.central-permission-matrix-executed-daily"), time: "2m ago", icon: CheckCircle2, color: "text-primary" },
        ],
      },
    ];
  }, [tx]);

  const activePillar = useMemo(() => {
    return heroPillars.find((p) => p.id === activeHeroPillarId) || heroPillars[0];
  }, [heroPillars, activeHeroPillarId]);

  // Filter products by search query & category
  const filteredProducts = useMemo(() => {
    return PRODUCTS.filter((product) => {
      const matchesCategory =
        selectedCategory === allLabel || product.category === selectedCategory;

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        product.name.toLowerCase().includes(q) ||
        product.shortDescription.toLowerCase().includes(q) ||
        product.tagline.toLowerCase().includes(q) ||
        product.primaryPurpose.toLowerCase().includes(q) ||
        product.problemSolved.toLowerCase().includes(q) ||
        product.businessOutcome.toLowerCase().includes(q) ||
        product.keyFeatures.some(
          (f) => f.title.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)
        ) ||
        product.targetDepartments.some((d) => d.toLowerCase().includes(q));

      return matchesCategory && matchesSearch;
    });
  }, [PRODUCTS, selectedCategory, searchQuery]);

  const featuredSuites = useMemo(() => {
    return [
      {
        id: "ai-suite",
        title: tx("catalog.saasProductCatalog.autonomous-enterprise-ai-intelligence-su"),
        subtitle: tx("catalog.saasProductCatalog.private-rag-assistants-24-7-voice-agents"),
        description: tx("catalog.saasProductCatalog.empower-every-department-with-purpose-bu"),
        products: PRODUCTS.filter((p) => p.id === "aibots-studio" || p.id === "smms-social-engine"),
        accent: "from-secondary/20 via-primary/10 to-primary/5",
      },
      {
        id: "talent-suite",
        title: tx("catalog.saasProductCatalog.workforce-hr-skill-assessment-engine"),
        subtitle: tx("catalog.saasProductCatalog.end-to-end-hr-biometric-payroll-17-type-"),
        description: tx("catalog.saasProductCatalog.transform-human-capital-management-with-"),
        products: PRODUCTS.filter((p) => p.id === "hrms-suite" || p.id === "ots-exam-engine"),
        accent: "from-primary/10 via-secondary/15 to-secondary/5",
      },
      {
        id: "exec-suite",
        title: tx("catalog.saasProductCatalog.executive-governance-operational-control"),
        subtitle: tx("catalog.saasProductCatalog.real-time-15-module-command-center-spend"),
        description: tx("catalog.saasProductCatalog.gain-complete-executive-visibility-over-"),
        products: PRODUCTS.filter((p) => p.id === "admin-command-center" || p.id === "prms-procurement"),
        accent: "from-secondary/20 via-secondary/10 to-primary/10",
      },
    ];
  }, [PRODUCTS, tx]);

  const faqs = [
    {
      q: `Are all 15 applications included in the ${brandName} ecosystem?`,
      a: "Yes. All 15 applications are built around a shared single sign-on (SSO) identity store, a unified design system, and a central permission matrix. You can deploy the complete platform or license specific application modules based on your business requirements.",
    },
    {
      q: "How does Single Sign-On (SSO) work across the products?",
      a: "Logging into the Staff Hub or any individual product automatically provisions authorized sessions across all other modules where your account has a designated role. No second passwords or URL juggling required.",
    },
    {
      q: "Can we train custom AI bots on our own company documents?",
      a: "Absolutely. The AI Assistant Studio allows you to upload proprietary PDFs, Word documents, and text files into isolated OpenAI vector stores. Each bot operates under strict role-level access rules with per-token spend ledger oversight.",
    },
    {
      q: "Can the products be customized to fit our business workflows?",
      a: `Yes. Because every application in the ecosystem was engineered in-house by ${brandName}, we offer custom feature extensions, API integrations, and workflow adaptations tailored to your enterprise needs.`,
    },
    {
      q: "How is security and data isolation handled for external users?",
      a: "External stakeholders (clients, job candidates, trainees) interact strictly through the Stakeholder Portal (`/clientos`), which operates on a structurally isolated identity database. External accounts can never reach internal staff tooling by design.",
    },
  ];

  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      {/* Hyper-Advanced Dual-Column Interactive SaaS Enterprise Hero Banner */}
      <section className="relative bg-background pt-28 pb-20 lg:pt-36 lg:pb-32 min-h-[90vh] flex items-center justify-center overflow-hidden border-b border-border/50 z-10">
        {/* Background Image & Multi-Layer Gradient Masks */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1600&auto=format&fit=crop"
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-35 dark:opacity-25"
          />
          <div className="absolute inset-0 bg-background/90 lg:hidden" />
          <div
            className="absolute inset-0 bg-background hidden lg:block"
            style={{
              maskImage: "linear-gradient(to right, black 0%, black 55%, transparent 95%)",
              WebkitMaskImage: "linear-gradient(to right, black 0%, black 55%, transparent 95%)",
            }}
          />
          <div
            className="absolute inset-0 bg-background hidden lg:block"
            style={{
              maskImage: "linear-gradient(to top, black 0%, transparent 40%)",
              WebkitMaskImage: "linear-gradient(to top, black 0%, transparent 40%)",
            }}
          />
        </div>

        {/* Ambient Animated Aurora Glowing Blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[15%] -left-[10%] w-[55vw] h-[55vw] rounded-full bg-primary/15 blur-[140px] mix-blend-multiply dark:mix-blend-screen animate-blob" />
          <div className="absolute top-[20%] right-[5%] w-[45vw] h-[45vw] rounded-full bg-secondary/15 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000" />
          <div className="absolute -bottom-[20%] left-[25%] w-[65vw] h-[65vw] rounded-full bg-brand-accent/15 blur-[150px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-4000" />
        </div>

        {/* Interactive Mouse Spotlight Reveal Grid */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0 bg-grid-slate-900/[0.02] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
          <div
            className="absolute inset-0 bg-grid-slate-900/[0.08] dark:bg-grid-slate-400/[0.08]"
            style={{
              WebkitMaskImage: `radial-gradient(500px circle at ${absMousePosition.x}px ${absMousePosition.y}px, black, transparent 80%)`,
              maskImage: `radial-gradient(500px circle at ${absMousePosition.x}px ${absMousePosition.y}px, black, transparent 80%)`,
            }}
          />
        </div>

        <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Column: Headline, Copy, Pillar Switcher & CTAs */}
            <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-2xl space-y-6">
              <motion.div
                variants={fadeIn}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/40 border border-border/50 text-xs sm:text-sm font-medium text-foreground backdrop-blur-md shadow-sm"
              >
                <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                <span>{tx("catalog.saasProductCatalog.enterprise-saas-platform-100-company-aut")}</span>
              </motion.div>

              <motion.h1
                variants={fadeIn}
                className="text-4xl sm:text-6xl font-black tracking-tight text-foreground leading-[1.1]"
              >
                {tx("catalog.saasProductCatalog.automate-your-entire-business-with")}<br className="hidden sm:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-brand-accent to-secondary bg-300% animate-gradient">
                  {tx("catalog.saasProductCatalog.one-ai-saas-platform")}</span>
              </motion.h1>

              <motion.p
                variants={fadeIn}
                className="text-base sm:text-lg text-muted-foreground leading-relaxed font-normal"
              >
                {tx("catalog.saasProductCatalog.replace-10-expensive-fragmented-software")}</motion.p>

              {/* Interactive SaaS Pillar Tabs Selector */}
              <motion.div variants={fadeIn} className="pt-2">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  <Box className="w-3.5 h-3.5 text-primary" />
                  <span>{tx("catalog.saasProductCatalog.click-to-explore-saas-ecosystem-pillars")}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {heroPillars.map((p) => {
                    const isSelected = activeHeroPillarId === p.id;
                    const IconComp = p.icon;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setActiveHeroPillarId(p.id)}
                        className={`flex flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25 scale-105"
                            : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/80"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <IconComp className={`w-3.5 h-3.5 ${isSelected ? "text-primary-foreground" : "text-primary"}`} />
                          <span className="truncate">{p.name.split(" ")[0]}</span>
                        </div>
                        <span className={`text-[10px] font-medium line-clamp-1 opacity-80 ${isSelected ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
                          {p.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>

              {/* Action Buttons */}
              <motion.div variants={fadeIn} className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  href="/contact"
                  className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-primary px-8 py-4 text-sm font-bold text-primary-foreground transition-all hover:scale-105 active:scale-95 shadow-xl shadow-primary/30"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {tx("catalog.saasProductCatalog.schedule-saas-demo")}<ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Link>
                <a
                  href="#products-grid"
                  className="group inline-flex items-center justify-center gap-2 rounded-full px-7 py-4 text-sm font-bold text-foreground bg-muted/40 border border-border/60 hover:bg-muted/70 backdrop-blur-md transition-all shadow-sm"
                >
                  <Layers className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
                  {tx("catalog.saasProductCatalog.explore-15-saas-modules")}</a>
              </motion.div>

              {/* Trust & ROI Metrics Strip */}
              <motion.div
                variants={fadeIn}
                className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 border-t border-border/50"
              >
                <div className="space-y-0.5">
                  <div className="text-xl font-black text-foreground">{tx("catalog.saasProductCatalog.15-modules")}</div>
                  <div className="text-[11px] font-medium text-muted-foreground">{tx("catalog.saasProductCatalog.100-automated")}</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xl font-black text-primary">{tx("catalog.saasProductCatalog.90-cost-cut")}</div>
                  <div className="text-[11px] font-medium text-muted-foreground">{tx("catalog.saasProductCatalog.vs-separate-saas")}</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xl font-black text-secondary-foreground">{tx("catalog.saasProductCatalog.1-identity")}</div>
                  <div className="text-[11px] font-medium text-muted-foreground">{tx("catalog.saasProductCatalog.single-sign-on")}</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xl font-black text-primary">99.99%</div>
                  <div className="text-[11px] font-medium text-muted-foreground">{tx("catalog.saasProductCatalog.cloud-uptime-sla")}</div>
                </div>
              </motion.div>
            </motion.div>

            {/* Right Column: Live Interactive Pillar Dashboard Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92, rotateY: -8 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              transition={{ duration: 1, delay: 0.2 }}
              style={{
                transform: `perspective(1200px) rotateX(${mousePosition.y * 0.3}deg) rotateY(${mousePosition.x * 0.3}deg)`,
              }}
              className="hidden lg:block relative"
            >
              <div className="relative rounded-3xl border border-border/60 bg-card/90 backdrop-blur-2xl shadow-2xl overflow-hidden">
                {/* Card Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
                    <div className="w-3 h-3 rounded-full bg-green-400/80" />
                  </div>
                  <div className="flex items-center gap-2 bg-background/70 border border-border/50 px-3 py-1 rounded-full">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[11px] font-bold text-foreground">{tx("catalog.saasProductCatalog.brand-enterprise-live")}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                    <Cpu className="w-3 h-3 text-primary" />{tx("catalog.saasProductCatalog.ai-active")}</div>
                </div>

                {/* Active Pillar Content */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activePillar.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3 }}
                    className="p-5 space-y-4"
                  >
                    {/* Pillar Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold border border-primary/20">
                          <activePillar.icon className="w-4.5 h-4.5" />
                        </div>
                        <div>
                          <div className="font-extrabold text-foreground text-sm">{activePillar.name}</div>
                          <div className="text-[10px] text-muted-foreground">{activePillar.badge}</div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-[10px] font-bold text-primary border border-primary/20 animate-pulse">
                        {tx("catalog.saasProductCatalog.live")}</span>
                    </div>

                    {/* Metrics Row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-muted/30 border border-border/50 p-3.5 space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{activePillar.metric1.label}</div>
                        <div className="text-xl font-black text-foreground">{activePillar.metric1.val}</div>
                        <div className="text-[10px] text-primary font-medium">{activePillar.metric1.sub}</div>
                      </div>
                      <div className="rounded-2xl bg-muted/30 border border-border/50 p-3.5 space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{activePillar.metric2.label}</div>
                        <div className="text-xl font-black text-foreground">{activePillar.metric2.val}</div>
                        <div className="text-[10px] text-primary font-medium">{activePillar.metric2.sub}</div>
                      </div>
                    </div>

                    {/* Live Activity Stream */}
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{tx("catalog.saasProductCatalog.live-activity-stream")}</div>
                      {activePillar.stream.map((item, i) => {
                        const StreamIcon = item.icon;
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.08 }}
                            className="flex items-start gap-2.5 rounded-xl bg-muted/20 border border-border/40 p-2.5"
                          >
                            <StreamIcon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${item.color}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-foreground font-medium leading-snug line-clamp-1">{item.text}</p>
                              <span className="text-[10px] text-muted-foreground">{item.time}</span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* Bottom Nav Pillar Pills */}
                <div className="px-5 pb-5 flex gap-1.5 flex-wrap">
                  {heroPillars.map((p) => {
                    const IconComp = p.icon;
                    const isActive = p.id === activeHeroPillarId;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setActiveHeroPillarId(p.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted/40 text-muted-foreground border border-border/50 hover:bg-muted/80 hover:text-foreground"
                        }`}
                      >
                        <IconComp className="w-3 h-3" />
                        {p.name.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Floating glow behind card */}
              <div className="absolute -inset-4 -z-10 rounded-3xl bg-primary/10 blur-2xl" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* High-Impact Enterprise SaaS ROI & Automation Value Grid */}
      <section className="py-16 border-b border-border/50 bg-card/40 backdrop-blur-md z-10 relative">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-muted/40 border border-border/50 text-xs font-semibold text-foreground mb-3 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-primary" />{tx("catalog.saasProductCatalog.high-impact-saas-benefits")}</span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
              {tx("catalog.saasProductCatalog.why-adopting-brand-saas-automates-yo")}</h2>
            <p className="text-sm text-muted-foreground mt-3">
              {tx("catalog.saasProductCatalog.eliminate-manual-tasks-cut-software-subs")}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="rounded-3xl border border-primary/25 bg-primary/8 p-6 space-y-3 hover:border-primary/50 transition-all shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-md">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-foreground text-lg">{tx("catalog.saasProductCatalog.100-automated-operations")}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {tx("catalog.saasProductCatalog.connect-hr-payroll-lead-qualification-ca")}</p>
            </div>

            <div className="rounded-3xl border border-secondary/25 bg-secondary/8 p-6 space-y-3 hover:border-secondary/50 transition-all shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-secondary text-secondary-foreground flex items-center justify-center font-bold shadow-md">
                <DollarSign className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-foreground text-lg">{tx("catalog.saasProductCatalog.90-saas-cost-savings")}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {tx("catalog.saasProductCatalog.replace-expensive-separate-tools-like-ji")}</p>
            </div>

            <div className="rounded-3xl border border-border/60 bg-card/60 p-6 space-y-3 hover:border-primary/40 transition-all shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-muted text-foreground flex items-center justify-center font-bold shadow-md border border-border/60">
                <ShieldCheck className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-extrabold text-foreground text-lg">{tx("catalog.saasProductCatalog.zero-security-risk")}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {tx("catalog.saasProductCatalog.centralized-rbac-access-immutable-secret")}</p>
            </div>

            <div className="rounded-3xl border border-border/60 bg-card/60 p-6 space-y-3 hover:border-primary/40 transition-all shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-muted text-foreground flex items-center justify-center font-bold shadow-md border border-border/60">
                <Bot className="w-6 h-6 text-secondary-foreground" />
              </div>
              <h3 className="font-extrabold text-foreground text-lg">{tx("catalog.saasProductCatalog.embedded-ai-intelligence")}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {tx("catalog.saasProductCatalog.native-gpt-4o-rag-bots-24-7-voice-lead-a")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Ecosystem Visualizer */}
      <section className="py-20 border-b border-border/50 z-10 relative">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-muted/40 border border-border/50 text-xs font-semibold text-foreground mb-3 shadow-sm">
              <Database className="w-3.5 h-3.5 text-primary" />{tx("catalog.saasProductCatalog.ecosystem-map")}</span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
              {tx("catalog.saasProductCatalog.15-application-unified-saas-ecosystem")}</h2>
            <p className="text-sm text-muted-foreground mt-3">
              {tx("catalog.saasProductCatalog.every-application-shares-a-single-identi")}</p>
          </div>
          <EcosystemVisualizer />
        </div>
      </section>

      {/* Deployment Options */}
      <section className="py-20 border-b border-border/50 bg-card/30 z-10 relative">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-muted/40 border border-border/50 text-xs font-semibold text-foreground mb-3 shadow-sm">
              <Cpu className="w-3.5 h-3.5 text-primary" />{tx("catalog.saasProductCatalog.deployment-models")}</span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
              {tx("catalog.saasProductCatalog.choose-your-deployment-model")}</h2>
            <p className="text-sm text-muted-foreground mt-3">
              {tx("catalog.saasProductCatalog.from-instant-multi-tenant-cloud-to-air-g")}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="rounded-3xl border border-border/80 bg-card p-7 space-y-4 hover:border-primary/40 transition-all shadow-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/40 border border-border/50 text-xs font-semibold text-foreground">
                {tx("catalog.saasProductCatalog.multi-tenant-cloud")}</div>
              <h3 className="text-xl font-bold text-foreground">{tx("catalog.saasProductCatalog.standard-saas-cloud")}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {tx("catalog.saasProductCatalog.instant-provisioning-for-all-15-applicat")}</p>
              <ul className="space-y-2 pt-2 text-xs text-muted-foreground font-medium">
                <li className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-primary" />{tx("catalog.saasProductCatalog.instant-1-click-setup")}</li>
                <li className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-primary" />{tx("catalog.saasProductCatalog.global-cdn-low-latency")}</li>
                <li className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-primary" />{tx("catalog.saasProductCatalog.per-user-modular-billing")}</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-primary/40 bg-gradient-to-b from-primary/10 via-card to-card p-7 space-y-4 shadow-2xl relative">
              <div className="absolute -top-3 right-6 px-3 py-1 rounded-full bg-primary text-[10px] font-extrabold uppercase tracking-wider text-primary-foreground shadow-md">
                {tx("catalog.saasProductCatalog.most-popular")}</div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/15 text-xs font-semibold text-secondary-foreground border border-secondary/25">
                {tx("catalog.saasProductCatalog.dedicated-enterprise-vpc")}</div>
              <h3 className="text-xl font-bold text-foreground">{tx("catalog.saasProductCatalog.private-cloud-instance")}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {tx("catalog.saasProductCatalog.isolated-database-infrastructure-deploye")}</p>
              <ul className="space-y-2 pt-2 text-xs text-muted-foreground font-medium">
                <li className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-primary" />{tx("catalog.saasProductCatalog.air-gapped-data-isolation")}</li>
                <li className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-primary" />{tx("catalog.saasProductCatalog.saml-2-0-okta-azure-ad")}</li>
                <li className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-primary" />{tx("catalog.saasProductCatalog.custom-domain-ssl")}</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-border/80 bg-card p-7 space-y-4 hover:border-primary/40 transition-all shadow-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/40 border border-border/50 text-xs font-semibold text-foreground">
                {tx("catalog.saasProductCatalog.custom-hybrid-saas")}</div>
              <h3 className="text-xl font-bold text-foreground">{tx("catalog.saasProductCatalog.modular-licensing")}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {tx("catalog.saasProductCatalog.select-only-the-saas-applications-your-b")}</p>
              <ul className="space-y-2 pt-2 text-xs text-muted-foreground font-medium">
                <li className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-primary" />{tx("catalog.saasProductCatalog.custom-app-combination")}</li>
                <li className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-primary" />{tx("catalog.saasProductCatalog.dedicated-solutions-architect")}</li>
                <li className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-primary" />{tx("catalog.saasProductCatalog.custom-rest-api-adapters")}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Main Products Directory Section */}
      <section id="products-grid" className="py-20 z-10 relative">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 space-y-12">
          {/* Header & Category Filters */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-muted/40 border border-border/50 text-xs font-semibold text-foreground mb-3 shadow-sm">
                <Layers className="w-3.5 h-3.5 text-primary" />{tx("catalog.saasProductCatalog.browse-all-applications")}</span>
              <h2 className="text-3xl font-black tracking-tight text-foreground mt-1">
                {tx("catalog.saasProductCatalog.product-ecosystem-directory").replace(/\s*\($/, "")}
              </h2>
            </div>

            {/* Search Bar */}
            <div className="relative flex items-center rounded-2xl border border-border/80 bg-card/90 shadow-xl backdrop-blur-xl p-1.5 transition-all focus-within:border-primary/60 max-w-sm w-full">
              <Search className="w-4 h-4 text-muted-foreground ml-3 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tx("catalog.saasProductCatalog.search-products")}
                className="w-full bg-transparent px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="p-1 text-muted-foreground hover:text-foreground mr-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105"
                    : "bg-muted/40 border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/80"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Grid of Product Cards */}
          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onSelect={(p) => setActiveModalProduct(p)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-border/60 bg-card/60 p-12 text-center max-w-lg mx-auto space-y-4">
              <Search className="w-12 h-12 text-muted-foreground mx-auto" />
              <h3 className="text-xl font-bold text-foreground">{tx("catalog.saasProductCatalog.no-products-found")}</h3>
              <p className="text-xs text-muted-foreground">
                {tx("catalog.saasProductCatalog.no-application-matches")}{searchQuery}{tx("catalog.saasProductCatalog.under")}{selectedCategory}{tx("catalog.saasProductCatalog.try-adjusting-your-search-query-or-reset")}</p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory(allLabel);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground"
              >
                {tx("catalog.saasProductCatalog.reset-all-filters")}</button>
            </div>
          )}
        </div>
      </section>

      {/* Featured Flagship Product Showcases */}
      <section className="py-20 border-t border-border/50 bg-muted/10 z-10 relative">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 space-y-24">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-muted/40 border border-border/50 text-xs font-semibold text-foreground mb-3 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-primary" />{tx("catalog.saasProductCatalog.flagship-deep-dive")}</span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mt-2">
              {tx("catalog.saasProductCatalog.featured-enterprise-product-showcases")}</h2>
            <p className="text-sm text-muted-foreground mt-3">
              {tx("catalog.saasProductCatalog.explore-highlighted-product-suites-with-")}</p>
          </div>

          {featuredSuites.map((suite, suiteIdx) => (
            <div key={suite.id} className="space-y-12">
              <div className="border-l-4 border-primary pl-6 space-y-1">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">{tx("catalog.saasProductCatalog.suite")}{suiteIdx + 1}</span>
                <h3 className="text-2xl font-black text-foreground">{suite.title}</h3>
                <p className="text-sm text-muted-foreground max-w-3xl">{suite.description}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                {suite.products.map((prod, pIdx) => (
                  <div
                    key={prod.id}
                    className={`space-y-6 ${(suiteIdx + pIdx) % 2 === 1 ? "lg:order-last" : ""}`}
                  >
                    <div className="rounded-3xl border border-border/80 bg-card p-6 shadow-2xl space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl">
                            <ProductLogo productKey={prod.slug} size={40} title={prod.name} />
                          </div>
                          <div>
                            <h4 className="font-bold text-foreground text-lg">{prod.name}</h4>
                            <span className="text-xs text-primary font-medium">{prod.tagline}</span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-muted/40 border border-border/50 text-[10px] font-bold text-foreground animate-pulse">
                          {prod.badge}
                        </span>
                      </div>

                      <ProductMockup product={prod} showTabSelector={true} compact={false} />

                      <div className="flex items-center justify-between pt-2">
                        <p className="text-xs text-muted-foreground max-w-md line-clamp-2">
                          {prod.shortDescription}
                        </p>
                        <button
                          onClick={() => setActiveModalProduct(prod)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-4 py-2 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-all shrink-0"
                        >
                          {tx("catalog.saasProductCatalog.explore-details")}<ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section className="py-20 border-t border-border/50 bg-background z-10 relative">
        <div className="mx-auto max-w-4xl px-6 lg:px-8 space-y-12">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-muted/40 border border-border/50 text-xs font-semibold text-foreground mb-3 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-primary" />{tx("catalog.saasProductCatalog.got-questions")}</span>
            <h2 className="text-3xl font-black tracking-tight text-foreground mt-2">
              {tx("catalog.saasProductCatalog.frequently-asked-questions")}</h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl overflow-hidden transition-all"
                >
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="flex w-full items-center justify-between p-6 text-left"
                  >
                    <span className="font-bold text-foreground text-base">{faq.q}</span>
                    <ChevronDown
                      className={`w-5 h-5 text-primary transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="px-6 pb-6 text-sm leading-relaxed text-muted-foreground border-t border-border/30 pt-4">
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Enterprise CTA Banner — Modern Full-Width Ambient Section */}
      <section className="relative overflow-hidden border-t border-border/50 py-24 sm:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-primary/5 to-transparent pointer-events-none"></div>
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[750px] h-[500px] bg-primary/10 rounded-full blur-[130px] pointer-events-none"></div>
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background pointer-events-none"></div>

        <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left Column */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="space-y-8"
            >
              <span className="inline-flex items-center gap-2 rounded-full bg-muted/40 border border-border/50 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-foreground shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-primary" />{tx("catalog.saasProductCatalog.ready-for-next-gen-tech")}</span>

              <h2 className="text-4xl font-black tracking-tight text-foreground sm:text-6xl leading-[1.1]">
                {tx("catalog.saasProductCatalog.transform-your-enterprise-with-brand")}</h2>

              <p className="text-xl leading-8 text-muted-foreground max-w-lg">
                {tx("catalog.saasProductCatalog.schedule-a-live-demonstration-of-our-15-")}</p>

              <div className="flex flex-col sm:flex-row items-start gap-6 pt-2 text-sm text-muted-foreground font-medium">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />{tx("catalog.saasProductCatalog.live-demo-interactive-sandbox")}</div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />{tx("catalog.saasProductCatalog.custom-ai-integrations")}</div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />{tx("catalog.saasProductCatalog.dedicated-team")}</div>
              </div>

              <div className="flex flex-col sm:flex-row gap-6 pt-4 border-t border-border/40">
                {siteContact.email && (
                  <a href={`mailto:${siteContact.email}`} className="flex items-center gap-3 group">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary transition-colors">
                      <Mail className="w-4 h-4 text-primary group-hover:text-primary-foreground transition-colors" />
                    </div>
                    <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{siteContact.email}</span>
                  </a>
                )}
                {siteContact.phoneHref && siteContact.phoneDisplay && (
                  <a href={siteContact.phoneHref} className="flex items-center gap-3 group">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary transition-colors">
                      <Phone className="w-4 h-4 text-primary group-hover:text-primary-foreground transition-colors" />
                    </div>
                    <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{siteContact.phoneDisplay}</span>
                  </a>
                )}
              </div>
            </motion.div>

            {/* Right Column: Interactive Form */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="relative"
            >
              <div className="absolute -top-6 -right-6 z-10 p-3 bg-background/90 backdrop-blur-xl border border-border/50 rounded-2xl shadow-xl hidden sm:flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Clock3 className="w-4 h-4 text-green-500" />
                </div>
                <div>
                  <div className="text-xs font-bold">{tx("catalog.saasProductCatalog.24hr-response")}</div>
                  <div className="text-[11px] text-muted-foreground">{tx("catalog.saasProductCatalog.guaranteed")}</div>
                </div>
              </div>

              <div className="p-8 sm:p-10 rounded-[2rem] bg-muted/20 border border-border/50 shadow-2xl relative overflow-hidden backdrop-blur-xl">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none"></div>
                <div ref={ctaCardBodyRef} style={{ minHeight: ctaCardMinHeight }} className="relative flex flex-col justify-center">
                  {ctaLead.status !== "success" && (
                    <p className="relative z-10 text-sm text-muted-foreground mb-6 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-primary flex-none" />
                      {tx("catalog.saasProductCatalog.we-reply-to-every-consultation-request-w")}</p>
                  )}
                  <AnimatePresence mode="wait">
                    {ctaLead.status === "success" ? (
                      <LeadSuccessState
                        key="success"
                        title={tx("catalog.saasProductCatalog.demo-request-sent")}
                        description={tx("catalog.saasProductCatalog.thanks-our-solutions-architect-will-reac")}
                        onDismiss={ctaLead.reset}
                        autoHideMs={SUCCESS_AUTO_HIDE_MS}
                        compact
                      />
                    ) : (
                      <form key="form" className="relative z-10 space-y-5" onSubmit={handleCtaSubmit} noValidate>
                        <select
                          value={ctaSelectedProduct}
                          onChange={(e) => setCtaSelectedProduct(e.target.value)}
                          aria-label="Interested Product"
                          className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                        >
                          <option value="All SaaS Products">{tx("catalog.saasProductCatalog.all-saas-products-ecosystem")}</option>
                          {PRODUCTS.map((p) => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                          ))}
                        </select>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <input
                              type="text"
                              placeholder={tx("catalog.saasProductCatalog.your-name")}
                              value={ctaName}
                              onChange={(e) => setCtaName(e.target.value)}
                              required
                              className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                            />
                            {ctaLead.fieldErrors.name && <p className="text-xs text-red-500 mt-1">{ctaLead.fieldErrors.name}</p>}
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder={tx("catalog.saasProductCatalog.phone-number")}
                              value={ctaPhone}
                              onChange={(e) => setCtaPhone(e.target.value)}
                              required
                              className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                            />
                            {ctaLead.fieldErrors.phone && <p className="text-xs text-red-500 mt-1">{ctaLead.fieldErrors.phone}</p>}
                          </div>
                        </div>
                        <div>
                          <input
                            type="email"
                            placeholder={tx("catalog.saasProductCatalog.email-address")}
                            value={ctaEmail}
                            onChange={(e) => setCtaEmail(e.target.value)}
                            required
                            autoComplete="email"
                            className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                          />
                          {ctaLead.fieldErrors.email && <p className="text-xs text-red-500 mt-1">{ctaLead.fieldErrors.email}</p>}
                        </div>

                        <textarea
                          rows={3}
                          placeholder={tx("catalog.saasProductCatalog.tell-us-about-your-requirements-or-desir")}
                          value={ctaMessage}
                          onChange={(e) => setCtaMessage(e.target.value)}
                          className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors resize-none"
                        ></textarea>

                        {ctaLead.error && <p className="text-xs text-red-500 text-center">{ctaLead.error}</p>}

                        <button
                          type="submit"
                          disabled={ctaLead.status === "submitting"}
                          className="group w-full rounded-xl bg-primary px-8 py-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {ctaLead.status === "submitting" ? (
                            <>{tx("catalog.saasProductCatalog.sending-request")}<Loader2 className="w-4 h-4 animate-spin" /></>
                          ) : (
                            <>{tx("catalog.saasProductCatalog.schedule-product-demo")}<ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>
                          )}
                        </button>
                      </form>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={activeModalProduct}
        onClose={() => setActiveModalProduct(null)}
      />
    </div>
  );
}
