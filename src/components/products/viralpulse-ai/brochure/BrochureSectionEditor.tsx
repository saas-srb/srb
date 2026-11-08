"use client";

import React, { useState } from "react";
import { Plus, Trash2, MoveUp, MoveDown, Eye, EyeOff, Copy, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { aiUpdateSectionAction } from "@/app/(products)/viralpulse-ai/(protected)/brochures/actions";
import type { BrochureSection, BrochureSectionData } from "@/lib/products/viralpulse-ai/brochure/types";

interface BrochureSectionEditorProps {
  section: BrochureSection;
  onUpdate: (updatedSection: BrochureSection) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  brochureContext?: { title: string; brandName?: string; category: string };
}

export default function BrochureSectionEditor({
  section,
  onUpdate,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  brochureContext = { title: "Digital Brochure", category: "company" },
}: BrochureSectionEditorProps) {
  const data = section.data;
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiWorking, setIsAiWorking] = useState(false);

  const updateData = (patch: Partial<BrochureSectionData>) => {
    onUpdate({
      ...section,
      data: { ...section.data, ...patch } as BrochureSectionData,
    });
  };

  const handleAiRewrite = async (presetPrompt?: string) => {
    const promptToUse = presetPrompt || aiPrompt.trim();
    if (!promptToUse) return;

    setIsAiWorking(true);
    try {
      const res = await aiUpdateSectionAction({
        section,
        prompt: promptToUse,
        brochureContext,
      });

      if (res.ok && res.section) {
        onUpdate(res.section);
        toast.success("Section updated with AI!");
        setAiPrompt("");
      } else {
        toast.error((res as { error?: string })?.error || "AI update failed.");
      }
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to update with AI.");
    } finally {
      setIsAiWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── AI Magic Update Bar ── */}
      <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-bold text-primary">
            <Sparkles className="size-3.5" />
            AI Prompt Update
          </span>
          <span className="text-[10px] text-muted-foreground">Prompt-based rewrite</span>
        </div>

        <div className="flex gap-1.5">
          <Input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAiRewrite();
              }
            }}
            placeholder="e.g. Make headline punchier & emphasize safety standards..."
            className="text-xs bg-background/90"
            disabled={isAiWorking}
          />
          <Button
            size="sm"
            onClick={() => handleAiRewrite()}
            disabled={isAiWorking || !aiPrompt.trim()}
            className="gap-1 shrink-0 text-xs px-2.5"
          >
            {isAiWorking ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            <span>Update</span>
          </Button>
        </div>

        {/* Quick prompt chips */}
        <div className="flex flex-wrap gap-1 pt-0.5">
          {[
            "⚡ Make punchier",
            "✨ More persuasive",
            "🛠️ Technical detail",
            "🏆 Highlight certifications",
            "💼 Executive B2B tone",
            "✂️ Shorten & simplify",
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handleAiRewrite(preset)}
              disabled={isAiWorking}
              className="rounded-md border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>
      {/* Top Action Bar for this section */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-1">
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            title="Move Section Up"
          >
            <MoveUp className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            title="Move Section Down"
          >
            <MoveDown className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => onUpdate({ ...section, hidden: !section.hidden })}
            title={section.hidden ? "Show in brochure" : "Hide from brochure"}
          >
            {section.hidden ? <EyeOff className="size-3.5 text-amber-500" /> : <Eye className="size-3.5" />}
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button size="icon-xs" variant="ghost" onClick={onDuplicate} title="Duplicate section">
            <Copy className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onDelete}
            title="Delete section"
            className="text-rose-500 hover:text-rose-600"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Editor fields based on section type */}
      {data.type === "hero" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Headline</Label>
            <Input
              value={data.headline}
              onChange={(e) => updateData({ headline: e.target.value })}
              placeholder="Primary headline..."
              className="text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category Tagline / Subheadline</Label>
            <Input
              value={data.subheadline}
              onChange={(e) => updateData({ subheadline: e.target.value })}
              placeholder="e.g. Certified Industrial Manufacturing"
              className="text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={3}
              value={data.description}
              onChange={(e) => updateData({ description: e.target.value })}
              placeholder="Brief introductory summary..."
              className="text-xs resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Primary CTA Label</Label>
              <Input
                value={data.ctaLabel}
                onChange={(e) => updateData({ ctaLabel: e.target.value })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Primary CTA Link</Label>
              <Input
                value={data.ctaUrl}
                onChange={(e) => updateData({ ctaUrl: e.target.value })}
                placeholder="#contact or https://..."
                className="text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Secondary CTA Label</Label>
              <Input
                value={data.secondaryCtaLabel}
                onChange={(e) => updateData({ secondaryCtaLabel: e.target.value })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Secondary CTA Link</Label>
              <Input
                value={data.secondaryCtaUrl}
                onChange={(e) => updateData({ secondaryCtaUrl: e.target.value })}
                placeholder="#overview"
                className="text-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hero Layout</Label>
            <Select
              value={data.layout}
              onValueChange={(val) => {
                if (val) updateData({ layout: val as "centered" | "split-left" | "split-right" });
              }}
            >
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="centered">Centered</SelectItem>
                <SelectItem value="split-left">Split Media Left</SelectItem>
                <SelectItem value="split-right">Split Media Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Background Image URL (Optional)</Label>
            <Input
              value={data.backgroundImage || ""}
              onChange={(e) => updateData({ backgroundImage: e.target.value || null })}
              placeholder="https://..."
              className="text-xs"
            />
          </div>
        </div>
      )}

      {data.type === "overview" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Section Title</Label>
            <Input
              value={data.title}
              onChange={(e) => updateData({ title: e.target.value })}
              className="text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Body Overview Text</Label>
            <Textarea
              rows={4}
              value={data.body}
              onChange={(e) => updateData({ body: e.target.value })}
              className="text-xs resize-none"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Illustration / Image URL</Label>
            <Input
              value={data.image || ""}
              onChange={(e) => updateData({ image: e.target.value || null })}
              placeholder="https://..."
              className="text-xs"
            />
          </div>
        </div>
      )}

      {data.type === "about" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input
              value={data.title}
              onChange={(e) => updateData({ title: e.target.value })}
              className="text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Founded / Heritage Line</Label>
            <Input
              value={data.founded}
              onChange={(e) => updateData({ founded: e.target.value })}
              placeholder="e.g. Established 2012"
              className="text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Company Story</Label>
            <Textarea
              rows={3}
              value={data.body}
              onChange={(e) => updateData({ body: e.target.value })}
              className="text-xs resize-none"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mission Statement</Label>
            <Input
              value={data.mission}
              onChange={(e) => updateData({ mission: e.target.value })}
              className="text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vision Statement</Label>
            <Input
              value={data.vision}
              onChange={(e) => updateData({ vision: e.target.value })}
              className="text-xs"
            />
          </div>
        </div>
      )}

      {data.type === "features" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input
              value={data.title}
              onChange={(e) => updateData({ title: e.target.value })}
              className="text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Subtitle</Label>
            <Input
              value={data.subtitle}
              onChange={(e) => updateData({ subtitle: e.target.value })}
              className="text-xs"
            />
          </div>
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Features / Points ({data.items.length})</Label>
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  updateData({
                    items: [...data.items, { icon: "Star", title: "New Feature", description: "" }],
                  })
                }
              >
                <Plus className="size-3 mr-1" /> Add
              </Button>
            </div>
            {data.items.map((item, idx) => (
              <div key={idx} className="rounded-lg border p-2.5 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    value={item.title}
                    onChange={(e) => {
                      const next = [...data.items];
                      next[idx] = { ...next[idx], title: e.target.value };
                      updateData({ items: next });
                    }}
                    placeholder="Feature title"
                    className="text-xs font-semibold"
                  />
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => {
                      const next = data.items.filter((_, i) => i !== idx);
                      updateData({ items: next });
                    }}
                    className="text-rose-500"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
                <Textarea
                  rows={2}
                  value={item.description}
                  onChange={(e) => {
                    const next = [...data.items];
                    next[idx] = { ...next[idx], description: e.target.value };
                    updateData({ items: next });
                  }}
                  placeholder="Feature description"
                  className="text-xs resize-none"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {data.type === "services" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input
              value={data.title}
              onChange={(e) => updateData({ title: e.target.value })}
              className="text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Subtitle</Label>
            <Input
              value={data.subtitle}
              onChange={(e) => updateData({ subtitle: e.target.value })}
              className="text-xs"
            />
          </div>
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Services ({data.items.length})</Label>
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  updateData({
                    items: [...data.items, { title: "New Service", description: "", icon: "Briefcase", price: "" }],
                  })
                }
              >
                <Plus className="size-3 mr-1" /> Add
              </Button>
            </div>
            {data.items.map((item, idx) => (
              <div key={idx} className="rounded-lg border p-2.5 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    value={item.title}
                    onChange={(e) => {
                      const next = [...data.items];
                      next[idx] = { ...next[idx], title: e.target.value };
                      updateData({ items: next });
                    }}
                    placeholder="Service title"
                    className="text-xs font-semibold"
                  />
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => {
                      const next = data.items.filter((_, i) => i !== idx);
                      updateData({ items: next });
                    }}
                    className="text-rose-500"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
                <Textarea
                  rows={2}
                  value={item.description}
                  onChange={(e) => {
                    const next = [...data.items];
                    next[idx] = { ...next[idx], description: e.target.value };
                    updateData({ items: next });
                  }}
                  placeholder="Service description"
                  className="text-xs resize-none"
                />
                <Input
                  value={item.price}
                  onChange={(e) => {
                    const next = [...data.items];
                    next[idx] = { ...next[idx], price: e.target.value };
                    updateData({ items: next });
                  }}
                  placeholder="Pricing tag (e.g. From ₹15,000 / Custom RFP)"
                  className="text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {data.type === "pricing" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input
              value={data.title}
              onChange={(e) => updateData({ title: e.target.value })}
              className="text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Currency Symbol</Label>
            <Input
              value={data.currency}
              onChange={(e) => updateData({ currency: e.target.value })}
              className="text-xs w-20"
            />
          </div>
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Tiers ({data.tiers.length})</Label>
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  updateData({
                    tiers: [
                      ...data.tiers,
                      {
                        name: "Custom Tier",
                        price: "9,999",
                        period: "per unit",
                        description: "",
                        features: ["Feature 1", "Feature 2"],
                        highlighted: false,
                        ctaLabel: "Select Plan",
                        ctaUrl: "#contact",
                      },
                    ],
                  })
                }
              >
                <Plus className="size-3 mr-1" /> Add Tier
              </Button>
            </div>
            {data.tiers.map((tier, idx) => (
              <div key={idx} className="rounded-lg border p-2.5 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    value={tier.name}
                    onChange={(e) => {
                      const next = [...data.tiers];
                      next[idx] = { ...next[idx], name: e.target.value };
                      updateData({ tiers: next });
                    }}
                    placeholder="Tier Name"
                    className="text-xs font-semibold"
                  />
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => {
                      const next = data.tiers.filter((_, i) => i !== idx);
                      updateData({ tiers: next });
                    }}
                    className="text-rose-500"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={tier.price}
                    onChange={(e) => {
                      const next = [...data.tiers];
                      next[idx] = { ...next[idx], price: e.target.value };
                      updateData({ tiers: next });
                    }}
                    placeholder="Price value"
                    className="text-xs"
                  />
                  <Input
                    value={tier.period}
                    onChange={(e) => {
                      const next = [...data.tiers];
                      next[idx] = { ...next[idx], period: e.target.value };
                      updateData({ tiers: next });
                    }}
                    placeholder="Period (/mo, /unit)"
                    className="text-xs"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`hl-${idx}`}
                    checked={tier.highlighted}
                    onChange={(e) => {
                      const next = [...data.tiers];
                      next[idx] = { ...next[idx], highlighted: e.target.checked };
                      updateData({ tiers: next });
                    }}
                    className="rounded"
                  />
                  <label htmlFor={`hl-${idx}`} className="text-xs">
                    Highlight as Recommended
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.type === "contact" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input
              value={data.title}
              onChange={(e) => updateData({ title: e.target.value })}
              className="text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Subtitle</Label>
            <Input
              value={data.subtitle}
              onChange={(e) => updateData({ subtitle: e.target.value })}
              className="text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Official Email</Label>
              <Input
                value={data.email}
                onChange={(e) => updateData({ email: e.target.value })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Official Phone</Label>
              <Input
                value={data.phone}
                onChange={(e) => updateData({ phone: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">WhatsApp Number</Label>
              <Input
                value={data.whatsapp}
                onChange={(e) => updateData({ whatsapp: e.target.value })}
                placeholder="+91..."
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Website URL</Label>
              <Input
                value={data.website}
                onChange={(e) => updateData({ website: e.target.value })}
                placeholder="https://..."
                className="text-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Office / Plant Address</Label>
            <Textarea
              rows={2}
              value={data.address}
              onChange={(e) => updateData({ address: e.target.value })}
              className="text-xs resize-none"
            />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="showForm"
              checked={data.showForm}
              onChange={(e) => updateData({ showForm: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="showForm" className="text-xs font-semibold">
              Enable Interactive Lead / Inquiry Form
            </label>
          </div>
        </div>
      )}

      {data.type === "stats" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Section Header</Label>
            <Input
              value={data.title}
              onChange={(e) => updateData({ title: e.target.value })}
              placeholder="e.g. Our Track Record"
              className="text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Metrics ({data.items.length})</Label>
            {data.items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 rounded-lg border p-2 bg-muted/20">
                <Input
                  value={item.value}
                  onChange={(e) => {
                    const next = [...data.items];
                    next[idx] = { ...next[idx], value: e.target.value };
                    updateData({ items: next });
                  }}
                  placeholder="Value (e.g. 50,000+)"
                  className="text-xs font-bold"
                />
                <Input
                  value={item.label}
                  onChange={(e) => {
                    const next = [...data.items];
                    next[idx] = { ...next[idx], label: e.target.value };
                    updateData({ items: next });
                  }}
                  placeholder="Label (e.g. Clients)"
                  className="text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {data.type === "faq" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input
              value={data.title}
              onChange={(e) => updateData({ title: e.target.value })}
              className="text-xs"
            />
          </div>
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Questions ({data.items.length})</Label>
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  updateData({
                    items: [...data.items, { question: "New Question", answer: "" }],
                  })
                }
              >
                <Plus className="size-3 mr-1" /> Add
              </Button>
            </div>
            {data.items.map((item, idx) => (
              <div key={idx} className="rounded-lg border p-2.5 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    value={item.question}
                    onChange={(e) => {
                      const next = [...data.items];
                      next[idx] = { ...next[idx], question: e.target.value };
                      updateData({ items: next });
                    }}
                    placeholder="Question"
                    className="text-xs font-semibold"
                  />
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => {
                      const next = data.items.filter((_, i) => i !== idx);
                      updateData({ items: next });
                    }}
                    className="text-rose-500"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
                <Textarea
                  rows={2}
                  value={item.answer}
                  onChange={(e) => {
                    const next = [...data.items];
                    next[idx] = { ...next[idx], answer: e.target.value };
                    updateData({ items: next });
                  }}
                  placeholder="Answer"
                  className="text-xs resize-none"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {data.type === "custom" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input
              value={data.title}
              onChange={(e) => updateData({ title: e.target.value })}
              className="text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Custom HTML / Markdown Content</Label>
            <Textarea
              rows={6}
              value={data.content}
              onChange={(e) => updateData({ content: e.target.value })}
              placeholder="<p>Custom content...</p>"
              className="text-xs font-mono"
            />
          </div>
        </div>
      )}
    </div>
  );
}
