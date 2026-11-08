"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Save, Globe, Download, Share2, Sparkles,
  Loader2, Trash2, Copy, ExternalLink, Monitor, Smartphone,
  User, Phone, Palette, Layers, Check, X, Building2,
  RotateCw, Columns2, QrCode as QrIcon, Printer, Link2, FileText,
} from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  saveVCardAction,
  publishVCardAction,
  unpublishVCardAction,
  deleteVCardAction,
  aiUpdateFieldAction,
} from "@/app/(products)/viralpulse-ai/(protected)/vcards/actions";
import { VCARD_LAYOUTS, VCARD_COLOR_SCHEMES, VCARD_LAYOUT_META, VCARD_COLOR_SCHEME_META } from "@/lib/products/viralpulse-ai/vcard/types";
import type { VCardDetail, VCardSection } from "@/lib/products/viralpulse-ai/vcard/types";
import VCardPreview, { type CardViewMode } from "./VCardPreview";
import VCardChatSidebar from "./VCardChatSidebar";

interface VCardStudioProps {
  initialCard: VCardDetail;
}

type TabKey = "company" | "personal" | "contact" | "social" | "design" | "sections";

function newSectionId() {
  return "vs_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

export default function VCardStudio({ initialCard }: VCardStudioProps) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isPublishing, startPublishing] = useTransition();
  const [isDeleting, startDeleting] = useTransition();

  const [card, setCard] = useState<VCardDetail>(initialCard);
  const [activeTab, setActiveTab] = useState<TabKey>("company");
  const [deviceView, setDeviceView] = useState<"desktop" | "mobile">("desktop");
  const [cardViewMode, setCardViewMode] = useState<CardViewMode>("both");
  const [isFlipped, setIsFlipped] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [rewritingField, setRewritingField] = useState<string | null>(null);
  const [aiFieldPrompt, setAiFieldPrompt] = useState<Record<string, string>>({});

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/vcard/${card.slug}`
      : `/vcard/${card.slug}`;

  const patch = (p: Partial<VCardDetail>) => {
    setCard((prev) => ({ ...prev, ...p }));
    setHasUnsaved(true);
  };

  const patchContact = (p: Partial<VCardDetail["contact"]>) => {
    setCard((prev) => ({ ...prev, contact: { ...prev.contact, ...p } }));
    setHasUnsaved(true);
  };

  const patchBranding = (p: Partial<VCardDetail["branding"]>) => {
    setCard((prev) => ({ ...prev, branding: { ...prev.branding, ...p } }));
    setHasUnsaved(true);
  };

  const patchStyle = (p: Partial<VCardDetail["style"]>) => {
    setCard((prev) => ({ ...prev, style: { ...prev.style, ...p } }));
    setHasUnsaved(true);
  };

  const handleSave = () => {
    startSaving(async () => {
      try {
        const res = await saveVCardAction(card.id, {
          name: card.name,
          jobTitle: card.jobTitle,
          company: card.company,
          bio: card.bio,
          layout: card.layout,
          colorScheme: card.colorScheme,
          style: card.style,
          contact: card.contact,
          branding: card.branding,
          sections: card.sections,
          meta: card.meta,
        });
        if (res.ok) {
          setHasUnsaved(false);
          toast.success("Visiting card saved successfully!");
        } else {
          toast.error((res as { error?: string }).error || "Save failed.");
        }
      } catch {
        toast.error("Failed to save visiting card.");
      }
    });
  };

  const handlePublishToggle = () => {
    startPublishing(async () => {
      try {
        const res = card.status === "published"
          ? await unpublishVCardAction(card.id)
          : await publishVCardAction(card.id);
        if (res.ok) {
          setCard((prev) => ({ ...prev, status: res.status }));
          toast.success(card.status === "published" ? "Card unpublished." : "Card published live!");
        }
      } catch {
        toast.error("Failed to toggle publish status.");
      }
    });
  };

  const handleDelete = () => {
    startDeleting(async () => {
      try {
        const res = await deleteVCardAction(card.id);
        if (res.ok) {
          toast.success("Visiting card deleted.");
          router.push("/viralpulse-ai/vcards");
        } else {
          toast.error((res as { error?: string }).error || "Delete failed.");
        }
      } catch {
        toast.error("Failed to delete.");
      }
    });
  };

  const handleAiRewriteField = async (field: string, currentValue: string) => {
    const prompt = aiFieldPrompt[field]?.trim();
    if (!prompt) return;
    setRewritingField(field);
    try {
      const res = await aiUpdateFieldAction({
        field,
        currentValue,
        prompt,
        context: { name: card.name, jobTitle: card.jobTitle, company: card.company },
      });
      if (res.ok && res.newValue) {
        if (field === "bio") patch({ bio: res.newValue });
        else if (field === "tagline") patchBranding({ tagline: res.newValue });
        else if (field === "name") patch({ name: res.newValue });
        else if (field === "jobTitle") patch({ jobTitle: res.newValue });
        else if (field === "company") patch({ company: res.newValue });
        setAiFieldPrompt((p) => ({ ...p, [field]: "" }));
        toast.success(`${field} updated with AI!`);
      }
    } catch {
      toast.error("AI rewrite failed.");
    } finally {
      setRewritingField(null);
    }
  };

  const handleColorSchemeChange = (scheme: typeof VCARD_COLOR_SCHEMES[number]) => {
    const meta = VCARD_COLOR_SCHEME_META[scheme];
    if (meta) {
      setCard((prev) => ({
        ...prev,
        colorScheme: scheme,
        style: {
          ...prev.style,
          primaryColor: meta.primary,
          secondaryColor: meta.secondary,
          backgroundColor: meta.bg,
          textColor: meta.text,
          accentColor: meta.accent,
        },
      }));
      setHasUnsaved(true);
    }
  };

  const handleDownloadVcf = () => {
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${card.name}`,
      `TITLE:${card.jobTitle}`,
      `ORG:${card.company}`,
      card.contact.email ? `EMAIL:${card.contact.email}` : "",
      card.contact.phone ? `TEL;TYPE=WORK:${card.contact.phone}` : "",
      card.contact.mobile ? `TEL;TYPE=CELL:${card.contact.mobile}` : "",
      card.contact.website ? `URL:${card.contact.website}` : "",
      card.branding.tagline ? `NOTE:${card.branding.tagline}` : "",
      card.contact.address ? `ADR;TYPE=WORK:;;${card.contact.address};${card.contact.city || ""};;${card.contact.country || ""}` : "",
      "END:VCARD",
    ].filter(Boolean).join("\r\n");

    const blob = new Blob([lines], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${card.name.replace(/\s+/g, "_")}.vcf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Contact file (.vcf) downloaded!");
  };

  // AI Field Input helper
  const AiFieldBar = ({ field, label, currentValue }: { field: string; label: string; currentValue: string }) => (
    <div className="flex gap-1.5 mt-1">
      <Input
        placeholder={`AI prompt to rewrite ${label}...`}
        value={aiFieldPrompt[field] || ""}
        onChange={(e) => setAiFieldPrompt((p) => ({ ...p, [field]: e.target.value }))}
        className="text-[11px] h-7"
        disabled={rewritingField === field}
        onKeyDown={(e) => { if (e.key === "Enter") handleAiRewriteField(field, currentValue); }}
      />
      <Button size="icon-xs" className="size-7 shrink-0" disabled={!aiFieldPrompt[field]?.trim() || rewritingField === field}
        onClick={() => handleAiRewriteField(field, currentValue)}>
        {rewritingField === field ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
      </Button>
    </div>
  );

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "company", label: "Front (Company)", icon: Building2 },
    { key: "personal", label: "Back (Personal)", icon: User },
    { key: "contact", label: "Contact Info", icon: Phone },
    { key: "social", label: "Social Links", icon: Link2 },
    { key: "design", label: "Design & Style", icon: Palette },
    { key: "sections", label: "Sections", icon: Layers },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* ── Top toolbar ── */}
      <header className="shrink-0 flex items-center justify-between border-b border-border/40 bg-background/95 backdrop-blur px-4 py-2.5 flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="sm" render={<Link href="/viralpulse-ai/vcards" />} className="gap-1.5 mr-1">
            <ArrowLeft className="size-3.5" /> All Cards
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-sm font-bold truncate max-w-[180px] sm:max-w-[260px]">{card.name}</span>
            <Badge variant={card.status === "published" ? "default" : "secondary"} className="text-[10px] shrink-0">
              {card.status === "published" ? "Published Live" : "Draft"}
            </Badge>
            {hasUnsaved && <span className="text-[10px] text-amber-600 font-semibold shrink-0">● Unsaved</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Card View Switcher: Both vs 3D Flip */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border/50 p-0.5 bg-muted/40">
            <button
              type="button"
              onClick={() => setCardViewMode("both")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                cardViewMode === "both" ? "bg-background shadow-xs text-primary" : "text-muted-foreground hover:text-foreground"
              )}
              title="View both Front and Back sides"
            >
              <Columns2 className="size-3.5" /> <span className="hidden sm:inline">Both Sides</span>
            </button>
            <button
              type="button"
              onClick={() => setCardViewMode("flip")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                cardViewMode === "flip" ? "bg-background shadow-xs text-primary" : "text-muted-foreground hover:text-foreground"
              )}
              title="Interactive 3D Flip Card"
            >
              <RotateCw className="size-3.5" /> <span className="hidden sm:inline">3D Flip</span>
            </button>
          </div>

          {/* AI Chat Sidebar Toggle */}
          <Button
            variant={isChatOpen ? "secondary" : "outline"}
            size="sm"
            onClick={() => setIsChatOpen((v) => !v)}
            className={cn("gap-1.5 font-semibold text-xs", isChatOpen ? "border-primary/40 bg-primary/10 text-primary" : "")}
          >
            <Sparkles className="size-3.5 text-primary" />
            <span className="hidden sm:inline">AI Copilot</span>
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </Button>

          <Button variant="outline" size="sm" onClick={() => setShowPrintModal(true)} title="Print / Export Card">
            <Printer className="size-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Print / Export</span>
          </Button>

          <a
            href={`/api/viralpulse-ai/vcard/${card.id}/pdf`}
            download={`${card.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_VisitingCard.pdf`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 text-xs font-semibold text-primary hover:text-primary")}
            title={'Download vector 3.5" x 2" double-sided printable PDF'}
          >
            <FileText className="size-3.5 text-primary" />
            <span className="hidden sm:inline">PDF Card</span>
          </a>

          <Button variant="outline" size="sm" onClick={handleDownloadVcf} title="Download .vcf contact">
            <Download className="size-3.5 sm:mr-1.5" /><span className="hidden sm:inline">vCard</span>
          </Button>

          {card.status === "published" && (
            <Button variant="outline" size="sm" onClick={() => setShowShareModal(true)}>
              <Share2 className="size-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Share</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteModal(true)}
            className="text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"
          >
            <Trash2 className="size-3.5" />
          </Button>

          <Button variant={card.status === "published" ? "secondary" : "default"} size="sm" onClick={handlePublishToggle} disabled={isPublishing}>
            {isPublishing ? <Loader2 className="size-3.5 animate-spin" /> : card.status === "published" ? "Unpublish" : <><Globe className="size-3.5 mr-1" />Publish Live</>}
          </Button>

          <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
            {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            <span>Save</span>
          </Button>
        </div>
      </header>

      {/* ── Studio Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-80 sm:w-96 shrink-0 border-r border-border/40 bg-card/60 flex flex-col min-h-0 overflow-hidden">
          {/* Tab Navigation */}
          <div className="flex border-b border-border/40 p-1.5 gap-0.5 bg-muted/20 shrink-0 overflow-x-auto">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={cn(
                  "flex-1 min-w-[70px] flex items-center justify-center gap-1 rounded-md py-1.5 px-2 text-[11px] font-semibold transition-colors truncate",
                  activeTab === key ? "bg-background shadow-xs text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* ── TAB 1: Front Face (Company) ── */}
            {activeTab === "company" && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-primary flex items-center gap-1.5">
                    <Building2 className="size-3.5" /> Front Face Identity
                  </p>
                  <p className="leading-relaxed">
                    This represents the company branding side of your card. It showcases your organization name, logo, corporate tagline, and corporate presence.
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Company / Organization Name *</Label>
                  <Input
                    value={card.company}
                    onChange={(e) => patch({ company: e.target.value })}
                    className="text-sm font-medium"
                    placeholder="e.g. Acme Global Innovations"
                  />
                  <AiFieldBar field="company" label="Company Name" currentValue={card.company} />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Company Tagline / Slogan</Label>
                  <Input
                    value={card.branding.tagline || ""}
                    onChange={(e) => patchBranding({ tagline: e.target.value })}
                    className="text-sm"
                    placeholder="e.g. Pioneering Scalable Cloud Solutions"
                  />
                  <AiFieldBar field="tagline" label="Tagline" currentValue={card.branding.tagline || ""} />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Company Logo Image URL</Label>
                  <Input
                    value={card.branding.logo || ""}
                    onChange={(e) => patchBranding({ logo: e.target.value })}
                    className="text-xs"
                    placeholder="https://.../logo.png (leave blank for stylish monogram)"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Official Website</Label>
                  <Input
                    value={card.contact.website || ""}
                    onChange={(e) => patchContact({ website: e.target.value })}
                    className="text-xs"
                    placeholder="https://company.com"
                  />
                </div>
              </div>
            )}

            {/* ── TAB 2: Back Face (Personal) ── */}
            {activeTab === "personal" && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-primary flex items-center gap-1.5">
                    <User className="size-3.5" /> Back Face Personal Info
                  </p>
                  <p className="leading-relaxed">
                    This represents the personal side of your card, containing your name, designation, direct contact details, and dynamic QR code.
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Cardholder Full Name *</Label>
                  <Input
                    value={card.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    className="text-sm font-medium"
                    placeholder="e.g. Sarah Mitchell"
                  />
                  <AiFieldBar field="name" label="Full Name" currentValue={card.name} />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Job Title / Designation *</Label>
                  <Input
                    value={card.jobTitle}
                    onChange={(e) => patch({ jobTitle: e.target.value })}
                    className="text-sm"
                    placeholder="e.g. VP of Product Engineering"
                  />
                  <AiFieldBar field="jobTitle" label="Job Title" currentValue={card.jobTitle} />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Avatar / Photo URL</Label>
                  <Input
                    value={card.branding.avatar || ""}
                    onChange={(e) => patchBranding({ avatar: e.target.value })}
                    className="text-xs"
                    placeholder="https://.../photo.jpg (leave blank for initials emblem)"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Professional Bio / Elevator Pitch</Label>
                  <Textarea
                    rows={4}
                    value={card.bio || ""}
                    onChange={(e) => patch({ bio: e.target.value })}
                    className="text-xs resize-none leading-relaxed"
                    placeholder="A brief 2-3 sentence overview of your background, experience, and impact..."
                  />
                  <AiFieldBar field="bio" label="Bio" currentValue={card.bio || ""} />
                </div>
              </div>
            )}

            {/* ── TAB 3: Contact Info ── */}
            {activeTab === "contact" && (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-muted/40 border border-border/50 text-xs text-muted-foreground">
                  Direct channels rendered on the back side of your visiting card with quick-action click targets.
                </div>

                {[
                  { field: "email", label: "Email Address", type: "email", placeholder: "you@company.com" },
                  { field: "phone", label: "Direct Phone", type: "tel", placeholder: "+1 (555) 234-5678" },
                  { field: "mobile", label: "Mobile / Cell", type: "tel", placeholder: "+1 (555) 987-6543" },
                  { field: "whatsapp", label: "WhatsApp Number", type: "tel", placeholder: "+1 555 234 5678" },
                  { field: "address", label: "Street Address", type: "text", placeholder: "450 Lexington Avenue, Suite 1200" },
                  { field: "city", label: "City", type: "text", placeholder: "New York" },
                  { field: "country", label: "Country", type: "text", placeholder: "United States" },
                ].map(({ field, label, type, placeholder }) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type={type}
                      placeholder={placeholder}
                      value={(card.contact as unknown as Record<string, string>)[field] || ""}
                      onChange={(e) => patchContact({ [field]: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ── TAB 4: Social Links ── */}
            {activeTab === "social" && (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-muted/40 border border-border/50 text-xs text-muted-foreground">
                  Social links appear as branded icon badges on your card and interactive link buttons on the public card page.
                </div>

                {[
                  { field: "linkedin", label: "LinkedIn Profile URL", placeholder: "https://linkedin.com/in/username" },
                  { field: "twitter", label: "Twitter / X Profile URL", placeholder: "https://x.com/username" },
                  { field: "instagram", label: "Instagram URL", placeholder: "https://instagram.com/username" },
                  { field: "facebook", label: "Facebook Page URL", placeholder: "https://facebook.com/username" },
                  { field: "calendly", label: "Calendly / Meeting Booking URL", placeholder: "https://calendly.com/your-name" },
                ].map(({ field, label, placeholder }) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="url"
                      placeholder={placeholder}
                      value={(card.contact as unknown as Record<string, string>)[field] || ""}
                      onChange={(e) => patchContact({ [field]: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ── TAB 5: Design & Style ── */}
            {activeTab === "design" && (
              <div className="space-y-5">
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                    Card Architecture (6 Layouts)
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {VCARD_LAYOUTS.map((layout) => (
                      <button
                        key={layout}
                        type="button"
                        onClick={() => patch({ layout })}
                        className={cn(
                          "flex flex-col items-start rounded-lg border p-2.5 text-left transition-all text-xs",
                          card.layout === layout
                            ? "border-primary bg-primary/5 text-primary shadow-xs font-bold"
                            : "border-border/60 text-muted-foreground hover:border-primary/40 font-medium"
                        )}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {card.layout === layout && <Check className="size-3 shrink-0" />}
                          <span className="capitalize">{VCARD_LAYOUT_META[layout].label}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-normal line-clamp-1">
                          {VCARD_LAYOUT_META[layout].description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                    Color Schemes (9 Curated Themes)
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {VCARD_COLOR_SCHEMES.filter((s) => s !== "custom").map((scheme) => {
                      const meta = VCARD_COLOR_SCHEME_META[scheme];
                      return (
                        <button
                          key={scheme}
                          type="button"
                          onClick={() => handleColorSchemeChange(scheme)}
                          className={cn(
                            "flex flex-col items-center gap-1 p-2 rounded-xl border transition-all",
                            card.colorScheme === scheme ? "border-primary shadow-xs font-bold" : "border-border/60 hover:border-primary/40"
                          )}
                        >
                          <div className="flex gap-1">
                            <div className="size-3.5 rounded-full" style={{ backgroundColor: meta.primary }} />
                            <div className="size-3.5 rounded-full" style={{ backgroundColor: meta.bg === "#ffffff" ? "#e2e8f0" : meta.bg }} />
                          </div>
                          <span className="text-[9px] text-center text-muted-foreground truncate max-w-full">{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-border/40 pt-4 space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">Custom Palette</Label>
                  {[
                    { field: "primaryColor", label: "Primary Accent" },
                    { field: "secondaryColor", label: "Secondary Gradient" },
                    { field: "backgroundColor", label: "Card Background" },
                    { field: "textColor", label: "Body Text" },
                    { field: "accentColor", label: "Dividers & Borders" },
                  ].map(({ field, label }) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-xs">{label}</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={(card.style as unknown as Record<string, string>)[field]}
                          onChange={(e) => patchStyle({ [field]: e.target.value })}
                          className="size-7 rounded border border-border cursor-pointer p-0.5"
                        />
                        <Input
                          value={(card.style as unknown as Record<string, string>)[field]}
                          onChange={(e) => patchStyle({ [field]: e.target.value })}
                          className="text-xs font-mono"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border/40 pt-4 space-y-2">
                  <Label className="text-xs font-semibold">Card Corner Radius</Label>
                  <div className="flex gap-2">
                    {["md", "lg", "xl"].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => patchStyle({ borderRadius: r })}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg border text-xs font-semibold uppercase",
                          card.style.borderRadius === r ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 6: Enrichment Sections ── */}
            {activeTab === "sections" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">Public Page Sections ({card.sections.length})</Label>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      const newSec: VCardSection = {
                        id: newSectionId(),
                        type: "services",
                        title: "Services Offered",
                        content: { items: [{ label: "Advisory" }, { label: "Consulting" }] },
                        hidden: false,
                      };
                      setCard((prev) => ({ ...prev, sections: [...prev.sections, newSec] }));
                      setHasUnsaved(true);
                    }}
                  >
                    + Add Section
                  </Button>
                </div>

                {card.sections.map((sec, i) => (
                  <div key={sec.id} className="rounded-lg border border-border/60 p-3 space-y-2 bg-background/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px] capitalize">{sec.type}</Badge>
                        <span className="text-xs font-medium">{sec.title || sec.type}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = card.sections.map((s, idx) => idx === i ? { ...s, hidden: !s.hidden } : s);
                            patch({ sections: updated });
                          }}
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          {sec.hidden ? "Show" : "Hide"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            patch({ sections: card.sections.filter((_, idx) => idx !== i) });
                          }}
                          className="text-muted-foreground hover:text-rose-500"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    </div>
                    {sec.title !== undefined && (
                      <Input
                        value={sec.title}
                        onChange={(e) => {
                          const updated = card.sections.map((s, idx) => idx === i ? { ...s, title: e.target.value } : s);
                          patch({ sections: updated });
                        }}
                        className="text-xs"
                        placeholder="Section title"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* ── Center Canvas ── */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-muted/20 flex flex-col items-center p-6 sm:p-10">
          {/* Canvas Sub-Header Controls */}
          <div className="w-full max-w-3xl flex items-center justify-between mb-6 pb-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Preview Mode:</span>
              <div className="flex gap-1">
                {(["both", "flip", "front", "back"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setCardViewMode(m)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-semibold capitalize transition-all",
                      cardViewMode === m ? "bg-primary text-primary-foreground shadow-xs" : "bg-background border border-border/60 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m === "both" ? "Side-by-Side (Both)" : m === "flip" ? "3D Flip" : `${m} Face`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {cardViewMode === "flip" && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setIsFlipped((v) => !v)}
                  className="gap-1.5 text-xs font-semibold"
                >
                  <RotateCw className="size-3 text-primary" /> Flip to {isFlipped ? "Front" : "Back"}
                </Button>
              )}
              <div className="flex items-center gap-0.5 rounded-lg border border-border/50 p-0.5 bg-background">
                {([["desktop", Monitor], ["mobile", Smartphone]] as const).map(([view, Icon]) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setDeviceView(view)}
                    className={cn(
                      "p-1 rounded-md transition-colors",
                      deviceView === view ? "bg-muted text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                    title={`Switch to ${view} view`}
                  >
                    <Icon className="size-3.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Card Render Container */}
          <div className={cn("transition-all duration-300 flex flex-col items-center", deviceView === "mobile" ? "max-w-[380px]" : "w-full max-w-3xl")}>
            <div className="py-2">
              <VCardPreview
                card={card}
                isEditorPreview
                mode={cardViewMode}
                initialFlipped={isFlipped}
                onFlipChange={(f) => setIsFlipped(f)}
                publicUrl={publicUrl}
              />
            </div>

            {/* Quick Summary Pill */}
            <div className="mt-8 flex items-center gap-3 px-4 py-2 rounded-full border border-border/50 bg-background/80 shadow-xs text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Building2 className="size-3.5 text-primary" /> <strong>{card.company || "Company"}</strong>
              </span>
              <span>·</span>
              <span className="flex items-center gap-1.5">
                <User className="size-3.5 text-primary" /> <strong>{card.name}</strong> ({card.jobTitle || "Role"})
              </span>
              <span>·</span>
              <span className="capitalize">{card.layout} Layout</span>
            </div>

            {/* Live Public Page Preview Block */}
            <div className="w-full max-w-xl mt-8 pt-6 border-t border-border/40 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Digital Profile Preview</h4>
                  <p className="text-[11px] text-muted-foreground">What visitors see when they tap or scan your card</p>
                </div>
                {card.status === "published" && (
                  <Link
                    href={`/vcard/${card.slug}`}
                    target="_blank"
                    className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    Open Live Page <ExternalLink className="size-3" />
                  </Link>
                )}
              </div>

              {card.bio && (
                <div className="rounded-xl border border-border/50 bg-background p-4 shadow-xs text-xs text-muted-foreground leading-relaxed">
                  <p className="text-xs font-semibold text-foreground mb-1">About / Bio</p>
                  {card.bio}
                </div>
              )}

              {card.sections.filter((s) => !s.hidden).map((sec) => (
                <div key={sec.id} className="rounded-xl border border-border/50 bg-background p-4 shadow-xs">
                  <p className="text-xs font-bold text-foreground mb-2 capitalize">{sec.title || sec.type}</p>
                  {sec.type === "services" && Array.isArray((sec.content as { items?: { label: string }[] }).items) && (
                    <div className="flex flex-wrap gap-1.5">
                      {((sec.content as { items?: { label: string }[] }).items || []).map((item, i) => (
                        <span key={i} className="text-[11px] px-2.5 py-1 rounded-full border border-border/60 bg-muted/40 font-medium">
                          {item.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {sec.type === "skills" && Array.isArray((sec.content as { items?: { label: string }[] }).items) && (
                    <div className="flex flex-wrap gap-1.5">
                      {((sec.content as { items?: { label: string }[] }).items || []).map((item, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px]">{item.label}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Right: AI Chat Sidebar */}
        {isChatOpen && (
          <VCardChatSidebar
            vcard={card}
            onPatch={(p) => {
              setCard((prev) => ({ ...prev, ...p }));
              setHasUnsaved(true);
            }}
            onClose={() => setIsChatOpen(false)}
          />
        )}
      </div>

      {/* ── Print / Export Modal ── */}
      <Dialog open={showPrintModal} onOpenChange={setShowPrintModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="size-5 text-primary" /> Print & Export Visiting Card
            </DialogTitle>
            <DialogDescription>
              High-resolution print-ready layout for both Front and Back faces (standard 3.5" × 2" format with 300 DPI layout bounds).
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 bg-muted/30 rounded-xl space-y-6">
            <VCardPreview card={card} mode="both" publicUrl={publicUrl} showControls={false} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 flex-wrap">
            <Button variant="outline" onClick={() => setShowPrintModal(false)}>Close</Button>
            <a
              href={`/api/viralpulse-ai/vcard/${card.id}/pdf`}
              download={`${card.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_VisitingCard.pdf`}
              className={cn(buttonVariants({ variant: "default" }), "gap-2 font-bold")}
            >
              <FileText className="size-4" /> Download PDF Card
            </a>
            <Button variant="outline" onClick={() => window.print()} className="gap-2">
              <Printer className="size-4" /> Browser Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Share Modal ── */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader>
            <DialogTitle>Share Your Visiting Card</DialogTitle>
            <DialogDescription>Your digital visiting card is published live and ready to share.</DialogDescription>
          </DialogHeader>
          <div className="p-4 space-y-4">
            <div className="flex justify-center p-3 bg-muted/40 rounded-xl">
              <VCardPreview card={card} mode="back" scale={0.8} publicUrl={publicUrl} showControls={false} />
            </div>
            <div className="flex items-center gap-2">
              <Input value={publicUrl} readOnly className="text-xs font-mono" />
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Link copied!"); }}>
                <Copy className="size-3.5" />
              </Button>
            </div>
            <Button variant="default" size="sm" render={<Link href={`/vcard/${card.slug}`} target="_blank" />} className="gap-1.5 w-full">
              <ExternalLink className="size-3.5" /> Open Public Card Page
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Modal ── */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Visiting Card?</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete <span className="font-semibold text-foreground">"{card.name}"</span>'s visiting card?
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-xs text-muted-foreground">
            This cannot be undone. The public URL will be removed immediately.
          </div>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting} className="gap-1.5">
              {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              {isDeleting ? "Deleting..." : "Delete Card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
