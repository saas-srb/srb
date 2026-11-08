"use client";

import React, { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Check,
  Eye,
  Loader2,
  RefreshCw,
  Layers,
  Palette,
  Globe,
  Monitor,
  Tablet,
  Smartphone,
  ExternalLink,
  Copy,
  Plus,
  Trash2,
  Star,
  Shield,
  Briefcase,
  Building2,
  GraduationCap,
  Package,
  Home,
  CalendarDays,
  HeartPulse,
  Plane,
  Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent } from "@/components/ui/card";
import WizardFrame, { SaveStatus, type FrameStep } from "@/components/products/viralpulse-ai/shared/WizardFrame";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BROCHURE_CATEGORIES,
  BROCHURE_CATEGORY_META,
  type BrochureCategory,
  type BrochureSection,
  type BrochureTheme,
} from "@/lib/products/viralpulse-ai/brochure/types";
import {
  TEMPLATE_PRESETS,
  type BrochureTemplatePreset,
} from "@/lib/products/viralpulse-ai/brochure/templates";
import { BrochureSectionRenderer } from "./BrochureSectionRenderer";
import {
  generateBrochureAiAction,
  createAiBrochureAction,
  publishBrochureAction,
} from "@/app/(products)/viralpulse-ai/(protected)/brochures/actions";
import type { GeneratedBrochureResult } from "@/lib/products/viralpulse-ai/brochure/ai";
import QRCode from "qrcode";

const WIZARD_STEPS: FrameStep[] = [
  { key: "brief", n: 1, label: "1. Brief & Objectives" },
  { key: "template", n: 2, label: "2. Template & Preview" },
  { key: "generation", n: 3, label: "3. AI Content Synthesis" },
  { key: "review", n: 4, label: "4. Review & Launch" },
];

const CATEGORY_ICONS: Record<BrochureCategory, React.ComponentType<{ className?: string }>> = {
  training: GraduationCap,
  product: Package,
  company: Building2,
  service: Briefcase,
  portfolio: Layers,
  "real-estate": Home,
  event: CalendarDays,
  healthcare: HeartPulse,
  travel: Plane,
  marketing: Megaphone,
  custom: Sparkles,
};

export default function AiBrochureWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // ── Step 1 State: Brief ──
  const [title, setTitle] = useState("Industrial Engineering & Infrastructure Catalog");
  const [category, setCategory] = useState<BrochureCategory>("product");
  const [customCategory, setCustomCategory] = useState("");
  const [brandName, setBrandName] = useState("Strongwood Engineering");
  const [aboutBusiness, setAboutBusiness] = useState(
    "Leading manufacturer and EPC contractor specializing in heavy-duty industrial fabrication, pre-engineered building systems, and material handling solutions."
  );
  const [targetAudience, setTargetAudience] = useState(
    "Plant managers, procurement directors, civil construction contractors, and OEM buyers"
  );
  const [coreOfferings, setCoreOfferings] = useState(
    "Heavy-duty industrial structural fabrication, CNC machining components, turnkey warehouse construction, and plant maintenance"
  );
  const [highlights, setHighlights] = useState<string[]>([
    "ISO 9001:2015 Certified Manufacturing Facility",
    "Over 150+ Commissioned Turnkey Projects",
    "100% Quality Batch Tested & Zero-Downtime Guarantee",
  ]);
  const [highlightInput, setHighlightInput] = useState("");
  const [primaryCta, setPrimaryCta] = useState("Request Technical Quotation / RFP");
  const [tone, setTone] = useState("Professional, Authoritative & Technical");
  const [language, setLanguage] = useState("English");

  // ── Step 2 State: Template ──
  const [selectedTemplateId, setSelectedTemplateId] = useState("product-catalog");
  const [previewTemplate, setPreviewTemplate] = useState<BrochureTemplatePreset | null>(null);
  const [templateFilter, setTemplateFilter] = useState<string>("all");

  // ── Step 3 State: AI Generation ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<GeneratedBrochureResult | null>(null);
  const [generationElapsed, setGenerationElapsed] = useState(0);

  // ── Step 4 State: Review & Launch ──
  const [createdBrochureId, setCreatedBrochureId] = useState<string | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [isCreating, startCreating] = useTransition();
  const [isPublishing, startPublishing] = useTransition();
  const [deviceView, setDeviceView] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [showShareDialog, setShowShareDialog] = useState(false);

  // Focus heading on step change
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  // Handle adding highlights
  const handleAddHighlight = () => {
    if (!highlightInput.trim()) return;
    setHighlights((prev) => [...prev, highlightInput.trim()]);
    setHighlightInput("");
  };

  const handleRemoveHighlight = (idx: number) => {
    setHighlights((prev) => prev.filter((_, i) => i !== idx));
  };

  // Step 1 -> Step 2 validation
  const handleGoToTemplates = () => {
    if (!title.trim()) {
      toast.error("Please enter a brochure title.");
      return;
    }
    setStep(2);
    setReached((prev) => Math.max(prev, 2));
  };

  // Step 2 -> Step 3 trigger AI Generation
  const handleTriggerAiGeneration = async () => {
    setStep(3);
    setReached((prev) => Math.max(prev, 3));
    setIsGenerating(true);
    setGenerationElapsed(0);

    const timer = setInterval(() => {
      setGenerationElapsed((t) => t + 1);
    }, 1000);

    try {
      const res = await generateBrochureAiAction({
        title: title.trim(),
        category,
        customCategory: category === "custom" ? customCategory.trim() : null,
        brandName: brandName.trim(),
        aboutBusiness: aboutBusiness.trim(),
        targetAudience: targetAudience.trim(),
        coreOfferings: coreOfferings.trim(),
        keyHighlights: highlights,
        primaryCta: primaryCta.trim(),
        tone: tone.trim(),
        language: language.trim(),
        templateId: selectedTemplateId,
      });

      clearInterval(timer);
      setIsGenerating(false);

      if (res.ok && res.generated) {
        setGeneratedResult(res.generated);
        toast.success("Brochure generated by AI!");
      } else {
        toast.error((res as { error?: string })?.error || "Generation error. Using template defaults.");
      }
    } catch (err: unknown) {
      clearInterval(timer);
      setIsGenerating(false);
      toast.error((err as Error)?.message || "Failed to generate brochure.");
    }
  };

  // Step 3 -> Step 4 review
  const handleGoToReview = () => {
    setStep(4);
    setReached((prev) => Math.max(prev, 4));
  };

  // Create Brochure & Open in Studio
  const handleSaveAndOpenStudio = () => {
    startCreating(async () => {
      try {
        const res = await createAiBrochureAction({
          title: generatedResult?.title || title.trim(),
          category,
          customCategory: category === "custom" ? customCategory.trim() : null,
          brandName: brandName.trim(),
          aboutBusiness: aboutBusiness.trim(),
          targetAudience: targetAudience.trim(),
          coreOfferings: coreOfferings.trim(),
          keyHighlights: highlights,
          primaryCta: primaryCta.trim(),
          tone: tone.trim(),
          language: language.trim(),
          templateId: selectedTemplateId,
        });

        if (!res.ok || !res.brochure) {
          toast.error((res as { error?: string })?.error || "Failed to create brochure.");
          return;
        }

        toast.success("Brochure created successfully!");
        router.push(`/viralpulse-ai/brochures/${res.brochure.id}`);
      } catch (err: unknown) {
        toast.error((err as Error)?.message || "Failed to create brochure.");
      }
    });
  };

  // Publish Directly from Wizard
  const handlePublishDirectly = () => {
    startPublishing(async () => {
      try {
        // 1. Create brochure first
        const createRes = await createAiBrochureAction({
          title: generatedResult?.title || title.trim(),
          category,
          customCategory: category === "custom" ? customCategory.trim() : null,
          brandName: brandName.trim(),
          aboutBusiness: aboutBusiness.trim(),
          targetAudience: targetAudience.trim(),
          coreOfferings: coreOfferings.trim(),
          keyHighlights: highlights,
          primaryCta: primaryCta.trim(),
          tone: tone.trim(),
          language: language.trim(),
          templateId: selectedTemplateId,
        });

        if (!createRes.ok || !createRes.brochure) {
          toast.error("Could not initialize brochure.");
          return;
        }

        const bId = createRes.brochure.id;
        setCreatedBrochureId(bId);

        // 2. Publish it
        const pubRes = await publishBrochureAction(bId);
        if (!pubRes.ok || !pubRes.slug) {
          toast.error("Created as draft, but failed to publish.");
          router.push(`/viralpulse-ai/brochures/${bId}`);
          return;
        }

        setPublishedSlug(pubRes.slug);
        const url = `${window.location.origin}/brochure/${pubRes.slug}`;
        const qr = await QRCode.toDataURL(url, { width: 220, margin: 1 });
        setQrCodeUrl(qr);
        setShowShareDialog(true);
        toast.success("Brochure published live!");
      } catch (err: unknown) {
        toast.error((err as Error)?.message || "Failed to publish.");
      }
    });
  };

  // Filter templates
  const filteredTemplates = TEMPLATE_PRESETS.filter((t) => {
    if (templateFilter === "all") return true;
    return t.category === templateFilter;
  });

  return (
    <WizardFrame
      steps={WIZARD_STEPS}
      step={step}
      reached={reached}
      busy={isGenerating || isCreating || isPublishing}
      onGoTo={(n) => {
        if (n <= reached) setStep(n);
      }}
      title={
        step === 1
          ? "Tell AI About Your Brochure"
          : step === 2
          ? "Select Template & Preview"
          : step === 3
          ? "AI Content Synthesis"
          : "Review & Publish Brochure"
      }
      subtitle={
        step === 1
          ? "Provide your business details, audience, and offerings. Our AI will formulate the complete brochure."
          : step === 2
          ? "Pick a design layout tailored for your vertical. Open live previews before choosing."
          : step === 3
          ? "ViralPulse AI has formulated custom section copy, headlines, features, and specifications."
          : "Interactive live preview of your generated digital brochure. Customize theme or publish immediately."
      }
      headingRef={headingRef}
      backDisabled={step === 1 || isGenerating || isCreating || isPublishing}
      onBack={() => setStep((s) => Math.max(1, s - 1))}
      actions={
        <div className="flex items-center gap-2">
          {step === 1 && (
            <Button onClick={handleGoToTemplates} className="gap-2">
              Next: Choose Template
              <ArrowRight className="size-4" />
            </Button>
          )}

          {step === 2 && (
            <Button onClick={handleTriggerAiGeneration} className="gap-2">
              <Sparkles className="size-4" />
              Generate with AI
              <ArrowRight className="size-4" />
            </Button>
          )}

          {step === 3 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleTriggerAiGeneration}
                disabled={isGenerating}
                className="gap-1.5"
              >
                <RefreshCw className={cn("size-3.5", isGenerating && "animate-spin")} />
                Regenerate
              </Button>
              <Button onClick={handleGoToReview} disabled={isGenerating} className="gap-2">
                Next: Live Review
                <ArrowRight className="size-4" />
              </Button>
            </div>
          )}

          {step === 4 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleSaveAndOpenStudio}
                disabled={isCreating || isPublishing}
                className="gap-2"
              >
                {isCreating ? <Loader2 className="size-4 animate-spin" /> : <Layers className="size-4" />}
                Open in Full Studio
              </Button>
              <Button
                onClick={handlePublishDirectly}
                disabled={isCreating || isPublishing}
                className="gap-2"
              >
                {isPublishing ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
                Publish Live Now
              </Button>
            </div>
          )}
        </div>
      }
    >
      {/* ─────────────────────────────────────────────────────────────
          STEP 1: Brief & AI Questionnaire
      ─────────────────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Category Selector Pills */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-foreground">Industry Category *</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {BROCHURE_CATEGORIES.map((catKey) => {
                const meta = BROCHURE_CATEGORY_META[catKey];
                const Icon = CATEGORY_ICONS[catKey];
                const isSelected = category === catKey;

                return (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => {
                      setCategory(catKey);
                      // Pre-select template for this category
                      const match = TEMPLATE_PRESETS.find((t) => t.category === catKey);
                      if (match) setSelectedTemplateId(match.id);
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all",
                      isSelected
                        ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary font-semibold text-primary"
                        : "border-border/60 bg-card hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4 mb-1" />
                    <span className="text-[11px] leading-tight truncate w-full">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {category === "custom" && (
            <div className="space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <Label htmlFor="customCategory" className="text-xs font-semibold">
                Specify Custom Industry or Purpose *
              </Label>
              <Input
                id="customCategory"
                placeholder="e.g. Solar Energy Installation, Aerospace Engineering, Textile Manufacturing"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                className="text-xs"
              />
            </div>
          )}

          {/* Core Info */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="brochureTitle" className="text-xs font-semibold">
                Brochure Headline / Title *
              </Label>
              <Input
                id="brochureTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Heavy Duty Castor Wheels & Material Handling Catalog"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brandName" className="text-xs font-semibold">
                Brand / Organization Name
              </Label>
              <Input
                id="brandName"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="e.g. Strongwood Engineering, Glowell, Rudraksh Space Design"
                className="text-xs"
              />
            </div>
          </div>

          {/* Business & Offerings */}
          <div className="space-y-1.5">
            <Label htmlFor="aboutBusiness" className="text-xs font-semibold">
              What is your business or this brochure about?
            </Label>
            <Textarea
              id="aboutBusiness"
              rows={3}
              value={aboutBusiness}
              onChange={(e) => setAboutBusiness(e.target.value)}
              placeholder="Describe your company, key offerings, and value proposition..."
              className="text-xs resize-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="targetAudience" className="text-xs font-semibold">
                Target Audience
              </Label>
              <Input
                id="targetAudience"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g. Corporate procurement heads, architects, enterprise clients"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="primaryCta" className="text-xs font-semibold">
                Primary Call to Action (CTA)
              </Label>
              <Input
                id="primaryCta"
                value={primaryCta}
                onChange={(e) => setPrimaryCta(e.target.value)}
                placeholder="e.g. Request Quotation / Book Site Visit"
                className="text-xs"
              />
            </div>
          </div>

          {/* Key Highlights / USPs */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Key Highlights & Advantages (AI will emphasize these)</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {highlights.map((h, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs gap-1 py-1 px-2.5">
                  <Check className="size-3 text-primary" />
                  <span>{h}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveHighlight(idx)}
                    className="ml-1 text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={highlightInput}
                onChange={(e) => setHighlightInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddHighlight();
                  }
                }}
                placeholder="Type a key advantage (e.g. ISO 9001 Certified, 24/7 Support) and press Add"
                className="text-xs"
              />
              <Button type="button" size="sm" variant="outline" onClick={handleAddHighlight}>
                Add
              </Button>
            </div>
          </div>

          {/* Tone & Language */}
          <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border/40">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tone of Voice</Label>
              <Input
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="e.g. Professional & Authoritative, Warm & Welcoming"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Brochure Language</Label>
              <Input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="e.g. English, Hindi, Spanish"
                className="text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          STEP 2: Template Selection with Interactive Live Preview
      ─────────────────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setTemplateFilter("all")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors shrink-0",
                templateFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground"
              )}
            >
              All Templates ({TEMPLATE_PRESETS.length})
            </button>
            {BROCHURE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setTemplateFilter(cat)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors shrink-0 capitalize",
                  templateFilter === cat ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground"
                )}
              >
                {BROCHURE_CATEGORY_META[cat]?.label || cat}
              </button>
            ))}
          </div>

          {/* Template Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((tpl) => {
              const isSelected = selectedTemplateId === tpl.id;
              const meta = BROCHURE_CATEGORY_META[tpl.category];

              return (
                <div
                  key={tpl.id}
                  className={cn(
                    "flex flex-col justify-between rounded-2xl border p-5 transition-all bg-card shadow-xs group",
                    isSelected
                      ? "border-primary bg-primary/5 ring-2 ring-primary shadow-md"
                      : "border-border/60 hover:border-primary/50"
                  )}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary">
                        {meta?.label || tpl.category}
                      </Badge>
                      {isSelected && (
                        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-white">
                          <Check className="size-3 stroke-[3]" />
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                        {tpl.name}
                      </h4>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {tpl.description}
                      </p>
                    </div>

                    {/* Palette Circles */}
                    <div className="flex items-center gap-2 pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                      <span>Palette:</span>
                      <span
                        className="size-3.5 rounded-full border border-black/10"
                        style={{ backgroundColor: tpl.theme.primaryColor }}
                      />
                      <span
                        className="size-3.5 rounded-full border border-black/10"
                        style={{ backgroundColor: tpl.theme.accentColor }}
                      />
                      <span
                        className="size-3.5 rounded-full border border-black/10"
                        style={{ backgroundColor: tpl.theme.textColor }}
                      />
                      <span className="ml-auto font-mono text-[10px]">{tpl.theme.headingFont}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPreviewTemplate(tpl)}
                      className="text-xs gap-1.5 flex-1"
                    >
                      <Eye className="size-3.5" />
                      Preview
                    </Button>
                    <Button
                      size="sm"
                      variant={isSelected ? "default" : "secondary"}
                      onClick={() => setSelectedTemplateId(tpl.id)}
                      className="text-xs flex-1"
                    >
                      {isSelected ? "Selected" : "Select"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Template Preview Sheet (like UGC Style preview) */}
          {previewTemplate && (
            <Sheet open={Boolean(previewTemplate)} onOpenChange={() => setPreviewTemplate(null)}>
              <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
                <SheetHeader className="p-6 border-b border-border/40 sticky top-0 bg-background/95 backdrop-blur-md z-20">
                  <div className="flex items-center justify-between">
                    <div>
                      <SheetTitle className="text-base font-bold">{previewTemplate.name}</SheetTitle>
                      <SheetDescription className="text-xs">{previewTemplate.description}</SheetDescription>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedTemplateId(previewTemplate.id);
                        setPreviewTemplate(null);
                        toast.success(`Selected ${previewTemplate.name}`);
                      }}
                      className="gap-1.5 shrink-0"
                    >
                      <Check className="size-3.5" />
                      Use This Template
                    </Button>
                  </div>
                </SheetHeader>

                <div className="p-6 space-y-6">
                  {/* Theme pill info */}
                  <div className="rounded-xl border bg-muted/30 p-4 space-y-2 text-xs">
                    <div className="font-semibold text-foreground">Template Architecture & Style</div>
                    <div className="flex flex-wrap gap-4 text-muted-foreground">
                      <div>Heading Font: <span className="font-semibold text-foreground">{previewTemplate.theme.headingFont}</span></div>
                      <div>Density: <span className="font-semibold text-foreground capitalize">{previewTemplate.theme.density}</span></div>
                      <div>Corner Style: <span className="font-semibold text-foreground capitalize">{previewTemplate.theme.borderRadius}</span></div>
                    </div>
                  </div>

                  {/* Render sections of this template as live mockup */}
                  <div className="rounded-2xl border shadow-lg overflow-hidden divide-y divide-border/20 bg-white">
                    {previewTemplate.createSections().map((sec) => (
                      <BrochureSectionRenderer
                        key={sec.id}
                        section={sec}
                        theme={previewTemplate.theme}
                        brochureId="preview"
                        brochureTitle={previewTemplate.name}
                        isEditorPreview={true}
                      />
                    ))}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          STEP 3: AI Generation & Review
      ─────────────────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-6">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
              <div className="relative flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="size-8 animate-pulse text-primary" />
                <Loader2 className="absolute size-14 animate-spin text-primary/40" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground">Synthesizing Brochure with AI...</h3>
                <p className="text-xs text-muted-foreground max-w-md">
                  Analyzing your business domain, formatting section structures, and generating tailored copy for {brandName || title}.
                </p>
                <div className="pt-2 text-[11px] font-mono text-primary font-semibold tabular-nums">
                  Elapsed: {generationElapsed}s
                </div>
              </div>
            </div>
          ) : generatedResult ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500 text-white">
                    <Check className="size-4 stroke-[3]" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">AI Generation Complete</h4>
                    <p className="text-[11px] text-muted-foreground">
                      Structured copy generated for {generatedResult.sections.length} brochure sections.
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  Ready to Review
                </Badge>
              </div>

              {/* Generated Section Cards Preview */}
              <div className="space-y-3">
                <Label className="text-xs font-bold">Synthesized Sections Overview</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {generatedResult.sections.map((sec, idx) => {
                    const secData = sec.data as { title?: string; headline?: string; subtitle?: string; description?: string; body?: string };
                    return (
                      <div key={sec.id} className="rounded-xl border bg-card p-4 space-y-1.5 shadow-xs">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-primary capitalize">{sec.data.type}</span>
                          <span className="text-[10px] text-muted-foreground">Section {idx + 1}</span>
                        </div>
                        <h5 className="text-xs font-bold text-foreground truncate">
                          {secData.headline || secData.title || `Section ${idx + 1}`}
                        </h5>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {secData.description || secData.body || secData.subtitle || "Formatted content"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center space-y-3">
              <p className="text-xs text-muted-foreground">Click below to generate content with AI</p>
              <Button onClick={handleTriggerAiGeneration} className="gap-2">
                <Sparkles className="size-4" />
                Start AI Generation
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          STEP 4: Review, Live Preview & Launch
      ─────────────────────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-6">
          {/* Device Switcher */}
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <span className="text-xs font-bold text-foreground">Live Interactive Preview</span>
            <div className="flex items-center rounded-lg border border-border/60 bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setDeviceView("desktop")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  deviceView === "desktop" ? "bg-background shadow-xs text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Monitor className="size-3.5" /> Desktop
              </button>
              <button
                type="button"
                onClick={() => setDeviceView("tablet")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  deviceView === "tablet" ? "bg-background shadow-xs text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Tablet className="size-3.5" /> Tablet
              </button>
              <button
                type="button"
                onClick={() => setDeviceView("mobile")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  deviceView === "mobile" ? "bg-background shadow-xs text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Smartphone className="size-3.5" /> Mobile
              </button>
            </div>
          </div>

          {/* Center Canvas Preview */}
          <div className="flex justify-center bg-muted/20 p-4 sm:p-6 rounded-2xl border">
            <div
              className={cn(
                "transition-all duration-300 shadow-xl border border-border/60 bg-white rounded-2xl overflow-hidden min-h-[600px] h-fit",
                deviceView === "desktop" && "w-full max-w-4xl",
                deviceView === "tablet" && "w-[768px]",
                deviceView === "mobile" && "w-[375px]"
              )}
              style={{
                backgroundColor: generatedResult?.theme?.backgroundColor || "#ffffff",
                color: generatedResult?.theme?.textColor || "#0f172a",
                fontFamily: generatedResult?.theme?.bodyFont || "Inter",
              }}
            >
              {/* Header */}
              <div className="border-b border-border/40 px-6 py-4 flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-primary">
                  {brandName || title}
                </span>
                <span className="text-[11px] text-muted-foreground">Digital Brochure</span>
              </div>

              {/* Sections */}
              <div className="divide-y divide-border/20">
                {(generatedResult?.sections || []).map((sec) => (
                  <BrochureSectionRenderer
                    key={sec.id}
                    section={sec}
                    theme={generatedResult?.theme || TEMPLATE_PRESETS[0].theme}
                    brochureId="preview"
                    brochureTitle={title}
                    isEditorPreview={true}
                  />
                ))}
              </div>

              {/* Footer */}
              <footer className="border-t border-border/40 px-6 py-6 text-center text-xs text-muted-foreground">
                © {new Date().getFullYear()} {brandName || title}. All rights reserved.
              </footer>
            </div>
          </div>
        </div>
      )}

      {/* Share / Success Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader>
            <DialogTitle>Brochure Published Live!</DialogTitle>
            <DialogDescription>
              Your digital brochure is now live and accessible worldwide.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center p-4 space-y-4">
            {qrCodeUrl && (
              <div className="p-3 border rounded-2xl bg-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCodeUrl} alt="QR Code" className="size-48" />
                <p className="text-[11px] text-muted-foreground mt-1">Scan with phone camera</p>
              </div>
            )}

            <div className="flex w-full items-center gap-2">
              <Input
                value={typeof window !== "undefined" ? `${window.location.origin}/brochure/${publishedSlug}` : ""}
                readOnly
                className="text-xs font-mono"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    navigator.clipboard.writeText(`${window.location.origin}/brochure/${publishedSlug}`);
                    toast.success("Link copied!");
                  }
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>

            <div className="flex w-full justify-center gap-2 pt-2">
              <Button
                variant="default"
                size="sm"
                render={<Link href={`/brochure/${publishedSlug}`} target="_blank" />}
                className="gap-1.5"
              >
                <ExternalLink className="size-3.5" /> View Live Brochure
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </WizardFrame>
  );
}
