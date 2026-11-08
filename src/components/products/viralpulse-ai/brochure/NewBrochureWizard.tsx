"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  Package,
  Building2,
  Briefcase,
  LayoutGrid,
  Home,
  CalendarDays,
  HeartPulse,
  Plane,
  Megaphone,
  Sparkles,
  ArrowRight,
  Check,
  Palette,
  Loader2,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  BROCHURE_CATEGORIES,
  BROCHURE_CATEGORY_META,
  type BrochureCategory,
} from "@/lib/products/viralpulse-ai/brochure/types";
import { TEMPLATE_PRESETS, type BrochureTemplatePreset } from "@/lib/products/viralpulse-ai/brochure/templates";
import { createBrochureAction } from "@/app/(products)/viralpulse-ai/(protected)/brochures/actions";

const CATEGORY_ICONS: Record<BrochureCategory, React.ComponentType<{ className?: string }>> = {
  training: GraduationCap,
  product: Package,
  company: Building2,
  service: Briefcase,
  portfolio: LayoutGrid,
  "real-estate": Home,
  event: CalendarDays,
  healthcare: HeartPulse,
  travel: Plane,
  marketing: Megaphone,
  custom: Sparkles,
};

export default function NewBrochureWizard() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedCategory, setSelectedCategory] = useState<BrochureCategory>("training");
  const [customCategoryName, setCustomCategoryName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("training-executive");
  const [title, setTitle] = useState("Professional Certification & Course Overview");
  const [brandName, setBrandName] = useState("");

  const availableTemplates = TEMPLATE_PRESETS.filter(
    (t) => t.category === selectedCategory || (selectedCategory === "custom" && t.id === "custom-blank")
  );

  const handleCategorySelect = (cat: BrochureCategory) => {
    setSelectedCategory(cat);
    const presets = TEMPLATE_PRESETS.filter((t) => t.category === cat);
    if (presets.length > 0) {
      setSelectedTemplateId(presets[0].id);
      setTitle(presets[0].name);
    } else {
      setSelectedTemplateId("custom-blank");
      setTitle("Custom Business Brochure");
    }
  };

  const handleTemplateSelect = (tpl: BrochureTemplatePreset) => {
    setSelectedTemplateId(tpl.id);
    setTitle(tpl.name);
  };

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error("Please enter a brochure title.");
      return;
    }
    if (selectedCategory === "custom" && !customCategoryName.trim()) {
      toast.error("Please specify your custom category or industry name.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await createBrochureAction({
          title: title.trim(),
          category: selectedCategory,
          customCategory: selectedCategory === "custom" ? customCategoryName.trim() : null,
        });

        if (!res.ok) {
          toast.error(res.error || "Failed to create brochure.");
          return;
        }

        toast.success("Brochure created successfully!");
        router.push(`/viralpulse-ai/brochures/${res.brochure.id}`);
      } catch (err: unknown) {
        toast.error((err as Error)?.message || "Something went wrong.");
      }
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      {/* Step 1: Select Category */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">1. Select Brochure Category</h2>
          <p className="text-xs text-muted-foreground">
            Choose the industry or purpose. Each category comes with tailored layouts, industry-standard sections, and customizable styles.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {BROCHURE_CATEGORIES.map((catKey) => {
            const meta = BROCHURE_CATEGORY_META[catKey];
            const Icon = CATEGORY_ICONS[catKey];
            const isSelected = selectedCategory === catKey;

            return (
              <button
                key={catKey}
                type="button"
                onClick={() => handleCategorySelect(catKey)}
                className={cn(
                  "relative flex flex-col items-start rounded-xl border p-3.5 text-left transition-all hover:border-primary/50",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                    : "border-border/60 bg-background/50 hover:bg-muted/40"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <div
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg",
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  {isSelected && (
                    <div className="flex size-5 items-center justify-center rounded-full bg-primary text-white">
                      <Check className="size-3 stroke-[3]" />
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <div className="text-xs font-semibold text-foreground">{meta.label}</div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                    {meta.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Category Input if selected */}
      {selectedCategory === "custom" && (
        <GlassCard>
          <CardContent className="space-y-3 p-4">
            <Label htmlFor="customCategory" className="text-xs font-semibold">
              Specify Custom Industry or Purpose *
            </Label>
            <Input
              id="customCategory"
              placeholder="e.g. Renewable Solar Energy, Textile Manufacturing, Automotive Engineering..."
              value={customCategoryName}
              onChange={(e) => setCustomCategoryName(e.target.value)}
              className="max-w-md"
            />
            <p className="text-[11px] text-muted-foreground">
              Define your unique vertical. The editor will configure custom section templates for your specific requirements.
            </p>
          </CardContent>
        </GlassCard>
      )}

      {/* Step 2: Choose Template Preset */}
      {availableTemplates.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">2. Select Starting Structure & Style</h2>
            <p className="text-xs text-muted-foreground">
              Pre-configured with industry-standard sections and design palettes. All elements are fully editable in the studio.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {availableTemplates.map((tpl) => {
              const isSelected = selectedTemplateId === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleTemplateSelect(tpl)}
                  className={cn(
                    "flex flex-col rounded-xl border p-4 text-left transition-all",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                      : "border-border/60 bg-background/50 hover:border-primary/40 hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">{tpl.name}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">{tpl.description}</p>
                    </div>
                    {isSelected && (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                        <Check className="size-3 stroke-[3]" />
                      </span>
                    )}
                  </div>

                  {/* Palette Preview */}
                  <div className="mt-4 flex items-center gap-2 border-t border-border/40 pt-3">
                    <span className="text-[11px] text-muted-foreground">Color Palette:</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="size-4 rounded-full border border-black/10"
                        style={{ backgroundColor: tpl.theme.primaryColor }}
                        title="Primary Color"
                      />
                      <span
                        className="size-4 rounded-full border border-black/10"
                        style={{ backgroundColor: tpl.theme.accentColor }}
                        title="Accent Color"
                      />
                      <span
                        className="size-4 rounded-full border border-black/10"
                        style={{ backgroundColor: tpl.theme.textColor }}
                        title="Text Color"
                      />
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      {tpl.theme.headingFont}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: Brochure Details */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">3. Brochure Details</h2>
          <p className="text-xs text-muted-foreground">
            Set your brochure's primary title and optional brand or company name.
          </p>
        </div>

        <GlassCard>
          <CardContent className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="brochureTitle" className="text-xs font-semibold">
                Brochure Title *
              </Label>
              <Input
                id="brochureTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Heavy Duty Castor Wheels & Material Handling Catalog"
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                This will appear as the main title and will generate your public shareable URL.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brandName" className="text-xs font-semibold">
                Brand / Organization Name (Optional)
              </Label>
              <Input
                id="brandName"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="e.g. Strongwood Engineering, Rudraksh Space Design, Glowell Thermoware"
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Used in header logos, footer copyright, and contact cards across the brochure.
              </p>
            </div>
          </CardContent>
        </GlassCard>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between border-t border-border/40 pt-5">
        <Button variant="ghost" onClick={() => router.back()} disabled={isPending}>
          Cancel
        </Button>

        <Button onClick={handleCreate} disabled={isPending} className="gap-2 px-6">
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Initializing Studio...
            </>
          ) : (
            <>
              Open in Brochure Studio
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
