"use client";

import React, { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, ArrowRight, ArrowLeft, Loader2, Check, CreditCard,
  User, Briefcase, Building2, Target, Zap, Smile, Palette,
  Phone, Mail, Globe, MapPin, Download, Columns2, RotateCw, FileText,
  CheckCircle2, Compass, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import WizardFrame, { SaveStatus, type SaveState, type FrameStep } from "@/components/products/viralpulse-ai/shared/WizardFrame";
import {
  aiGenerateVCardAction,
  createVCardAction,
} from "@/app/(products)/viralpulse-ai/(protected)/vcards/actions";
import {
  VCARD_LAYOUTS,
  VCARD_COLOR_SCHEMES,
  VCARD_LAYOUT_META,
  VCARD_COLOR_SCHEME_META,
  type VCardLayout,
  type VCardColorScheme,
  type VCardDetail,
} from "@/lib/products/viralpulse-ai/vcard/types";
import VCardPreview, { type CardViewMode } from "./VCardPreview";

const WIZARD_STEPS: readonly FrameStep[] = [
  { key: "identity", n: 1, label: "Identity & Brief" },
  { key: "style", n: 2, label: "Layout & Palette" },
  { key: "generate", n: 3, label: "AI Generation" },
  { key: "review", n: 4, label: "Review & Launch" },
];

const STEP_SUBTITLES = [
  "Provide your company identity and contact details. AI crafts both front and back faces from this.",
  "Pick your card layout architecture and color palette with live double-sided preview.",
  "AI is writing your corporate tagline, elevator pitch, and double-sided card structure.",
  "Review your double-sided visiting card, download printable vector PDF, and launch the editor.",
];

const INDUSTRIES = [
  "Tech & SaaS",
  "Consulting & Advisory",
  "Finance & Banking",
  "Healthcare & Medical",
  "Real Estate & Property",
  "Creative & Agency",
  "Legal & Corporate",
  "Retail & E-Commerce",
  "Education & Coaching",
  "Hospitality & Luxury",
];

const TONES = [
  { label: "Executive & Authoritative", desc: "For C-suite, directors, founders, and managing partners" },
  { label: "Modern & Minimalist", desc: "Clean, tech-forward, high readability, Swiss style" },
  { label: "Warm & Consultative", desc: "Relationship-first, friendly, advisory tone" },
  { label: "Creative & Bold", desc: "High-contrast, artistic, dynamic and memorable" },
  { label: "Luxury & Prestige", desc: "Understated elegance, gold/silver foil finish" },
];

interface FormData {
  name: string;
  jobTitle: string;
  company: string;
  industry: string;
  targetAudience: string;
  coreServices: string;
  achievements: string;
  personality: string;
  email: string;
  phone: string;
  mobile: string;
  website: string;
  city: string;
  country: string;
  linkedin: string;
}

export default function AiVCardWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);
  const [busy, setBusy] = useState<null | "next" | "generate" | "save">(null);
  const [isCreating, startCreating] = useTransition();

  const [selectedLayout, setSelectedLayout] = useState<VCardLayout>("classic");
  const [selectedColorScheme, setSelectedColorScheme] = useState<VCardColorScheme>("professional-blue");
  const [previewMode, setPreviewMode] = useState<CardViewMode>("both");
  const [generated, setGenerated] = useState<Awaited<ReturnType<typeof aiGenerateVCardAction>> | null>(null);
  const [createdCardId, setCreatedCardId] = useState<string | null>(null);
  const [genSteps, setGenSteps] = useState<string[]>([]);
  const [genProgress, setGenProgress] = useState(0);

  const [form, setForm] = useState<FormData>({
    name: "",
    jobTitle: "",
    company: "",
    industry: "Tech & SaaS",
    targetAudience: "",
    coreServices: "",
    achievements: "",
    personality: "Executive & Authoritative",
    email: "",
    phone: "",
    mobile: "",
    website: "",
    city: "",
    country: "",
    linkedin: "",
  });

  const setField = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }));

  const canProceedStep1 = Boolean(form.name.trim() && form.jobTitle.trim() && form.company.trim());

  const handleGoTo = (n: number) => {
    if (n <= step || n <= reached) {
      setStep(n);
    }
  };

  const handleNextFromStep1 = () => {
    if (!canProceedStep1) {
      toast.error("Please fill in your Name, Job Title, and Company to proceed.");
      return;
    }
    setStep(2);
    setReached((prev) => Math.max(prev, 2));
  };

  const runGeneration = async () => {
    setBusy("generate");
    setStep(3);
    setReached((prev) => Math.max(prev, 3));
    setGenSteps([]);
    setGenProgress(10);

    const stepMessages = [
      "Analysing executive profile & company positioning...",
      "Synthesizing personal elevator pitch & value proposition...",
      "Crafting front-side corporate branding & tagline...",
      "Generating back-side direct contact hierarchy & QR mapping...",
      "Optimizing typography & double-sided vector card geometry...",
    ];

    for (let i = 0; i < stepMessages.length; i++) {
      await new Promise((r) => setTimeout(r, 650));
      setGenSteps((p) => [...p, stepMessages[i]]);
      setGenProgress(Math.min(90, Math.round(((i + 1) / stepMessages.length) * 90)));
    }

    try {
      const res = await aiGenerateVCardAction({
        name: form.name,
        jobTitle: form.jobTitle,
        company: form.company,
        industry: form.industry,
        targetAudience: form.targetAudience,
        coreServices: form.coreServices,
        achievements: form.achievements,
        personality: form.personality,
        preferredLayout: selectedLayout,
        preferredColorScheme: selectedColorScheme,
      });

      if (res.ok) {
        setGenProgress(100);
        setGenerated(res);
        setStep(4);
        setReached(4);
      } else {
        toast.error((res as { error?: string }).error || "AI generation failed.");
        setStep(2);
      }
    } catch {
      toast.error("Failed to generate content. Please try again.");
      setStep(2);
    } finally {
      setBusy(null);
    }
  };

  const handleLaunchStudio = () => {
    if (!generated?.ok) return;
    const g = generated;
    startCreating(async () => {
      try {
        const res = await createVCardAction({
          title: g.title || `${form.name}'s Visiting Card`,
          name: form.name,
          jobTitle: form.jobTitle,
          company: form.company,
          bio: g.bio,
          layout: g.layout || selectedLayout,
          colorScheme: g.colorScheme || selectedColorScheme,
          style: g.style,
          sections: g.sections,
          contact: {
            email: form.email,
            phone: form.phone,
            mobile: form.mobile,
            website: form.website,
            city: form.city,
            country: form.country,
            linkedin: form.linkedin,
          },
          branding: { tagline: g.tagline },
          meta: g.meta,
        });

        if (res.ok && res.id) {
          setCreatedCardId(res.id);
          toast.success("Visiting card created! Launching editor...");
          router.push(`/viralpulse-ai/vcards/${res.id}`);
        } else {
          toast.error((res as { error?: string }).error || "Failed to create card.");
        }
      } catch {
        toast.error("Failed to create visiting card.");
      }
    });
  };

  // Live preview card object computed from form state
  const colorMeta = VCARD_COLOR_SCHEME_META[selectedColorScheme] || VCARD_COLOR_SCHEME_META["professional-blue"];
  const previewCard: VCardDetail = useMemo(() => ({
    id: createdCardId || "preview",
    title: `${form.name || "Your Name"}'s Visiting Card`,
    slug: "preview-card",
    name: form.name || "Sarah Mitchell",
    jobTitle: form.jobTitle || "Chief Technology Officer",
    company: form.company || "Apex Global Innovations",
    bio: generated?.ok ? generated.bio : "Visionary technology executive delivering scalable enterprise cloud architectures.",
    layout: selectedLayout,
    colorScheme: selectedColorScheme,
    style: generated?.ok && generated.style
      ? generated.style
      : {
          primaryColor: colorMeta.primary,
          secondaryColor: colorMeta.secondary,
          backgroundColor: colorMeta.bg,
          textColor: colorMeta.text,
          accentColor: colorMeta.accent,
          fontFamily: "Inter",
          borderRadius: "lg",
        },
    contact: {
      email: form.email || "sarah@apexgl.com",
      phone: form.phone || "+1 (555) 234-5678",
      mobile: form.mobile,
      website: form.website || "https://apexgl.com",
      city: form.city || "San Francisco",
      country: form.country || "USA",
      linkedin: form.linkedin || "https://linkedin.com/in/sarahmitchell",
    },
    branding: {
      tagline: generated?.ok ? generated.tagline : "Pioneering Intelligent Cloud & AI Systems",
    },
    sections: generated?.ok ? generated.sections : [],
    status: "draft",
    analytics: { views: 0, ctaClicks: 0, shares: 0, lastViewedAt: null },
    meta: {},
    publishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }), [form, selectedLayout, selectedColorScheme, generated, createdCardId, colorMeta]);

  // Bottom action bar controls
  const renderActions = () => {
    if (step === 1) {
      return (
        <Button
          type="button"
          onClick={handleNextFromStep1}
          disabled={!canProceedStep1}
          className="gap-2 font-bold px-5 shadow-sm"
        >
          Layout & Palette <ArrowRight className="size-4" />
        </Button>
      );
    }
    if (step === 2) {
      return (
        <Button
          type="button"
          onClick={runGeneration}
          disabled={busy !== null}
          className="gap-2 font-bold px-6 shadow-sm"
        >
          {busy === "generate" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Generate with AI
        </Button>
      );
    }
    if (step === 3) {
      return (
        <Button type="button" disabled className="gap-2 font-medium opacity-80">
          <Loader2 className="size-4 animate-spin" /> Generating...
        </Button>
      );
    }
    if (step === 4) {
      return (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep(2)}
            className="gap-1.5"
          >
            <Palette className="size-3.5" /> Change Style
          </Button>
          <Button
            type="button"
            onClick={handleLaunchStudio}
            disabled={isCreating}
            className="gap-2 font-bold px-6 shadow-sm"
          >
            {isCreating ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
            {isCreating ? "Saving Card..." : "Open Studio Editor"}
          </Button>
        </div>
      );
    }
    return null;
  };

  return (
    <WizardFrame
      steps={WIZARD_STEPS}
      step={step}
      reached={reached}
      busy={busy !== null || isCreating}
      onGoTo={handleGoTo}
      navLabel="Visiting card wizard progress"
      title={WIZARD_STEPS[step - 1].label}
      subtitle={STEP_SUBTITLES[step - 1]}
      backDisabled={step === 1 || step === 3}
      onBack={() => setStep((s) => Math.max(1, s - 1))}
      actions={renderActions()}
      status={
        <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1 gap-1">
          <Sparkles className="size-3 text-primary" /> Step {step} of 4
        </Badge>
      }
    >
      {/* ── STEP 1: Identity & Brief (Two Column with Live Card Preview) ── */}
      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Form Side */}
          <div className="lg:col-span-7 space-y-6">
            {/* Company / Front Face */}
            <fieldset className="grid gap-4 rounded-2xl border border-border/50 bg-background/50 p-4 sm:p-5">
              <legend className="px-2 text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="size-3.5" /> Company Identity (Front Face)
              </legend>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Appears prominently on the front branding face of your card.
              </p>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Company / Brand Name *</Label>
                <Input
                  placeholder="e.g. Apex Global Solutions"
                  value={form.company}
                  onChange={setField("company")}
                  className="text-sm font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Industry Sector</Label>
                <div className="flex flex-wrap gap-1.5">
                  {INDUSTRIES.map((ind) => (
                    <button
                      key={ind}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, industry: ind }))}
                      className={cn(
                        "text-[11px] px-2.5 py-1 rounded-full border transition-all font-medium",
                        form.industry === ind
                          ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                          : "border-border/60 text-muted-foreground hover:border-primary/40 hover:bg-muted/30"
                      )}
                    >
                      {ind}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Target Audience / Market</Label>
                <Input
                  placeholder="e.g. Enterprise clients, Startup founders, Investors"
                  value={form.targetAudience}
                  onChange={setField("targetAudience")}
                  className="text-xs"
                />
              </div>
            </fieldset>

            {/* Personal / Back Face */}
            <fieldset className="grid gap-4 rounded-2xl border border-border/50 bg-background/50 p-4 sm:p-5">
              <legend className="px-2 text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                <User className="size-3.5" /> Personal Profile & Contacts (Back Face)
              </legend>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Appears on the back side with contact rows and dynamic QR code.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Cardholder Full Name *</Label>
                  <Input
                    placeholder="e.g. Sarah Mitchell"
                    value={form.name}
                    onChange={setField("name")}
                    className="text-sm font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Designation / Role *</Label>
                  <Input
                    placeholder="e.g. Chief Technology Officer"
                    value={form.jobTitle}
                    onChange={setField("jobTitle")}
                    className="text-sm font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Work Email</Label>
                  <Input
                    type="email"
                    placeholder="sarah@company.com"
                    value={form.email}
                    onChange={setField("email")}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Direct Phone</Label>
                  <Input
                    placeholder="+1 (555) 234-5678"
                    value={form.phone}
                    onChange={setField("phone")}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Official Website</Label>
                  <Input
                    placeholder="https://company.com"
                    value={form.website}
                    onChange={setField("website")}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Office Location (City, Country)</Label>
                  <Input
                    placeholder="e.g. San Francisco, USA"
                    value={form.city}
                    onChange={setField("city")}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs font-semibold">LinkedIn Profile URL</Label>
                  <Input
                    placeholder="https://linkedin.com/in/username"
                    value={form.linkedin}
                    onChange={setField("linkedin")}
                    className="text-xs"
                  />
                </div>
              </div>
            </fieldset>

            {/* Persona / Tone */}
            <fieldset className="grid gap-3 rounded-2xl border border-border/50 bg-background/50 p-4 sm:p-5">
              <legend className="px-2 text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Smile className="size-3.5" /> Brand Persona & Voice
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TONES.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, personality: t.label }))}
                    className={cn(
                      "flex flex-col items-start p-3 rounded-xl border text-left transition-all",
                      form.personality === t.label
                        ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary"
                        : "border-border/60 hover:border-primary/40 hover:bg-muted/20"
                    )}
                  >
                    <span className={cn("text-xs font-bold", form.personality === t.label ? "text-primary" : "text-foreground")}>
                      {t.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">{t.desc}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          {/* Sticky Real-Time Live Preview */}
          <div className="lg:col-span-5 sticky top-24 space-y-4">
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <CreditCard className="size-3.5 text-primary" /> Live Double-Sided Card
                  </h4>
                  <p className="text-[11px] text-muted-foreground">Updates live as you type</p>
                </div>

                <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border/50 bg-muted/40">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("both")}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-semibold transition-colors",
                      previewMode === "both" ? "bg-background text-primary shadow-xs" : "text-muted-foreground"
                    )}
                  >
                    Both Sides
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("flip")}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-semibold transition-colors",
                      previewMode === "flip" ? "bg-background text-primary shadow-xs" : "text-muted-foreground"
                    )}
                  >
                    3D Flip
                  </button>
                </div>
              </div>

              <div className="flex justify-center py-2 overflow-hidden">
                <VCardPreview
                  card={previewCard}
                  mode={previewMode}
                  scale={previewMode === "both" ? 0.72 : 0.88}
                  isEditorPreview
                />
              </div>

              <p className="text-[11px] text-muted-foreground text-center">
                Front Face represents <strong>Company Identity</strong> · Back Face represents <strong>Personal & QR Contact</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Layout & Aesthetics (Gallery & Palettes) ── */}
      {step === 2 && (
        <div className="space-y-8">
          {/* Double-sided card showcase */}
          <div className="flex flex-col items-center justify-center p-6 rounded-2xl border border-border/50 bg-muted/20">
            <VCardPreview card={previewCard} isEditorPreview mode="both" />
            <p className="text-xs text-muted-foreground mt-3 font-medium">
              Click any architecture or palette below to update in real-time
            </p>
          </div>

          {/* 6 Layout Architectures */}
          <div className="space-y-3">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              1. Card Layout Architecture
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {VCARD_LAYOUTS.map((layout) => {
                const meta = VCARD_LAYOUT_META[layout];
                const isSelected = selectedLayout === layout;
                return (
                  <button
                    key={layout}
                    type="button"
                    onClick={() => setSelectedLayout(layout)}
                    className={cn(
                      "flex flex-col items-start rounded-xl border p-4 text-left transition-all relative overflow-hidden",
                      isSelected
                        ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                        : "border-border/60 hover:border-primary/40 hover:bg-muted/20"
                    )}
                  >
                    {isSelected && (
                      <div className="absolute top-2.5 right-2.5 size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
                        <Check className="size-3" />
                      </div>
                    )}
                    <h4 className={cn("text-sm font-bold capitalize", isSelected ? "text-primary" : "text-foreground")}>
                      {meta.label}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {meta.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 9 Color Schemes */}
          <div className="space-y-3">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              2. Brand Color Palette
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
              {VCARD_COLOR_SCHEMES.filter((s) => s !== "custom").map((scheme) => {
                const meta = VCARD_COLOR_SCHEME_META[scheme];
                const isSelected = selectedColorScheme === scheme;
                return (
                  <button
                    key={scheme}
                    type="button"
                    onClick={() => setSelectedColorScheme(scheme)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                      isSelected
                        ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary"
                        : "border-border/60 hover:border-primary/40"
                    )}
                  >
                    <div className="flex gap-1.5 items-center">
                      <div className="size-5 rounded-full shadow-xs" style={{ backgroundColor: meta.primary }} />
                      <div
                        className="size-5 rounded-full shadow-xs border border-border/40"
                        style={{ backgroundColor: meta.bg === "#ffffff" ? "#f1f5f9" : meta.bg }}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-center text-foreground leading-tight">
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3: Animated AI Generation ── */}
      {step === 3 && (
        <div className="flex flex-col items-center justify-center py-16 space-y-8 text-center max-w-md mx-auto">
          <div className="relative size-24 flex items-center justify-center rounded-3xl bg-primary/10 border-2 border-primary/30 shadow-xl">
            <Sparkles className="size-12 text-primary animate-pulse" />
            <div className="absolute -inset-1 rounded-3xl border border-primary/20 animate-ping opacity-30 pointer-events-none" />
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl font-bold tracking-tight text-foreground">AI Is Synthesizing Your Card</h3>
            <p className="text-xs text-muted-foreground">
              Generating custom bio, elevator pitch, corporate tagline, and double-sided card structure for{" "}
              <strong className="text-foreground">{form.name}</strong>.
            </p>
          </div>

          {/* Animated Progress Bar */}
          <div className="w-full space-y-1.5">
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden border border-border/40">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
                style={{ width: `${genProgress}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>Synthesizing...</span>
              <span>{genProgress}%</span>
            </div>
          </div>

          {/* Status checklist */}
          <div className="w-full space-y-2.5 text-left bg-card p-4 rounded-xl border border-border/50 shadow-xs">
            {genSteps.map((s, i) => (
              <div key={i} className="flex items-center gap-2.5 text-xs">
                <Check className="size-3.5 text-emerald-500 shrink-0" />
                <span className="text-foreground font-medium">{s}</span>
              </div>
            ))}
            {busy === "generate" && (
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
                <span>Processing next layer...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 4: Review & Launch Suite ── */}
      {step === 4 && generated?.ok && (
        <div className="space-y-8">
          {/* Dual-sided Card Showcase */}
          <div className="p-6 rounded-2xl border border-border/50 bg-muted/20 flex flex-col items-center">
            <VCardPreview card={previewCard} isEditorPreview mode="both" />
            <div className="text-center mt-4 space-y-0.5">
              <p className="text-sm font-bold text-foreground">{form.name}</p>
              <p className="text-xs text-muted-foreground">{form.jobTitle} · {form.company}</p>
              {generated.tagline && (
                <p className="text-xs italic text-primary font-medium mt-1">"{generated.tagline}"</p>
              )}
            </div>
          </div>

          {/* Generated Bio preview */}
          {generated.bio && (
            <div className="rounded-xl border border-border/50 bg-card p-4 text-xs text-muted-foreground space-y-1 shadow-xs">
              <p className="font-bold text-foreground uppercase tracking-wider text-[10px]">AI-Generated Bio & Positioning</p>
              <p className="leading-relaxed">{generated.bio}</p>
            </div>
          )}

          {/* Review actions summary banner */}
          <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-foreground">Card Generation Complete</h4>
              <p className="text-xs text-muted-foreground">
                Your card is ready with vector print PDF, scannable QR code, and online profile.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setStep(2)} className="gap-1.5">
                <Palette className="size-3.5" /> Change Style
              </Button>
              <Button onClick={handleLaunchStudio} disabled={isCreating} className="gap-2 font-bold px-5">
                {isCreating ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
                {isCreating ? "Saving Card..." : "Open Studio Editor"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </WizardFrame>
  );
}
