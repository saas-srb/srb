"use client";

import React, { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Globe,
  Download,
  Share2,
  Monitor,
  Tablet,
  Smartphone,
  Plus,
  Layers,
  Palette,
  Settings,
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Sparkles,
  QrCode,
  FileDown,
  Trash2,
  Eye,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BrochureSectionRenderer } from "./BrochureSectionRenderer";
import BrochureSectionEditor from "./BrochureSectionEditor";
import BrochureChatSidebar from "./BrochureChatSidebar";
import { makeSection, newSectionId } from "@/lib/products/viralpulse-ai/brochure/defaults";
import {
  saveBrochureSectionsAction,
  saveBrochureThemeAction,
  saveBrochureMetaAction,
  publishBrochureAction,
  unpublishBrochureAction,
  getBrochureLeadsAction,
  deleteBrochureAction,
  duplicateBrochureAction,
  aiUpdateSectionAction,
  aiGenerateSectionAction,
  aiStyleThemeAction,
} from "@/app/(products)/viralpulse-ai/(protected)/brochures/actions";
import type {
  BrochureDetail,
  BrochureSection,
  BrochureTheme,
  BrochureSectionType,
} from "@/lib/products/viralpulse-ai/brochure/types";
import { BROCHURE_SECTION_TYPES } from "@/lib/products/viralpulse-ai/brochure/types";
import QRCode from "qrcode";

interface BrochureStudioProps {
  initialBrochure: BrochureDetail;
}

export default function BrochureStudio({ initialBrochure }: BrochureStudioProps) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isPublishing, startPublishing] = useTransition();

  // State
  const [brochure, setBrochure] = useState<BrochureDetail>(initialBrochure);
  const [activeTab, setActiveTab] = useState<"sections" | "design" | "settings" | "leads">("sections");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    initialBrochure.sections[0]?.id ?? null
  );
  const [deviceView, setDeviceView] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(true);
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [leadsData, setLeadsData] = useState<Array<{ id: string; fields: Record<string, string>; submittedAt: string }>>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, startDeleting] = useTransition();

  // AI Prompt Copilot State
  const [aiThemePrompt, setAiThemePrompt] = useState("");
  const [isAiThemeWorking, setIsAiThemeWorking] = useState(false);
  const [aiNewSectionPrompt, setAiNewSectionPrompt] = useState("");
  const [isAiGeneratingSection, setIsAiGeneratingSection] = useState(false);
  const [showAiCopilotDialog, setShowAiCopilotDialog] = useState(false);
  const [aiCopilotPrompt, setAiCopilotPrompt] = useState("");
  const [aiCopilotMode, setAiCopilotMode] = useState<"section" | "new_section" | "theme">("section");
  const [isAiCopilotWorking, setIsAiCopilotWorking] = useState(false);

  const handleDeleteBrochure = () => {
    startDeleting(async () => {
      try {
        const res = await deleteBrochureAction(brochure.id);
        if (!res.ok) {
          toast.error(res.error || "Failed to delete brochure.");
          return;
        }
        toast.success("Brochure deleted successfully.");
        router.push("/viralpulse-ai/brochures");
      } catch (err: unknown) {
        toast.error((err as Error)?.message || "Failed to delete.");
      }
    });
  };

  // AI Prompt Theme Styler
  const handleAiThemeStyle = async (presetPrompt?: string) => {
    const promptToUse = presetPrompt || aiThemePrompt.trim();
    if (!promptToUse) return;

    setIsAiThemeWorking(true);
    try {
      const res = await aiStyleThemeAction({
        prompt: promptToUse,
        currentTheme: brochure.theme,
      });

      if (res.ok && res.theme) {
        setBrochure((prev) => ({ ...prev, theme: res.theme }));
        setHasUnsavedChanges(true);
        toast.success("Theme restyled with AI!");
        setAiThemePrompt("");
      } else {
        toast.error((res as { error?: string })?.error || "AI styling failed.");
      }
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to restyle theme.");
    } finally {
      setIsAiThemeWorking(false);
    }
  };

  // AI Prompt Generate Section
  const handleAiGenerateSection = async (customPrompt?: string) => {
    const promptToUse = customPrompt || aiNewSectionPrompt.trim();
    if (!promptToUse) return;

    setIsAiGeneratingSection(true);
    try {
      const res = await aiGenerateSectionAction({
        prompt: promptToUse,
        brochureContext: {
          title: brochure.title,
          brandName: brochure.meta.brandName,
          category: brochure.category,
        },
      });

      if (res.ok && res.section) {
        setBrochure((prev) => ({
          ...prev,
          sections: [...prev.sections, res.section],
        }));
        setSelectedSectionId(res.section.id);
        setHasUnsavedChanges(true);
        setShowAddSectionModal(false);
        setAiNewSectionPrompt("");
        toast.success("Section generated and added with AI!");
      } else {
        toast.error((res as { error?: string })?.error || "Failed to generate section.");
      }
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to generate section.");
    } finally {
      setIsAiGeneratingSection(false);
    }
  };

  // Global AI Copilot Action
  const handleAiCopilotRun = async () => {
    if (!aiCopilotPrompt.trim()) return;

    setIsAiCopilotWorking(true);
    try {
      if (aiCopilotMode === "section") {
        if (!selectedSectionId) {
          toast.error("Please select a section first.");
          return;
        }
        const target = brochure.sections.find((s) => s.id === selectedSectionId);
        if (!target) return;

        const res = await aiUpdateSectionAction({
          section: target,
          prompt: aiCopilotPrompt.trim(),
          brochureContext: {
            title: brochure.title,
            brandName: brochure.meta.brandName,
            category: brochure.category,
          },
        });

        if (res.ok && res.section) {
          handleSectionUpdate(res.section);
          toast.success("Section updated with AI!");
          setShowAiCopilotDialog(false);
          setAiCopilotPrompt("");
        }
      } else if (aiCopilotMode === "new_section") {
        await handleAiGenerateSection(aiCopilotPrompt.trim());
        setShowAiCopilotDialog(false);
        setAiCopilotPrompt("");
      } else if (aiCopilotMode === "theme") {
        await handleAiThemeStyle(aiCopilotPrompt.trim());
        setShowAiCopilotDialog(false);
        setAiCopilotPrompt("");
      }
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Copilot command failed.");
    } finally {
      setIsAiCopilotWorking(false);
    }
  };

  // Generate QR code when brochure publishes or modal opens
  const publicUrl = typeof window !== "undefined"
    ? `${window.location.origin}/brochure/${brochure.slug}`
    : `/brochure/${brochure.slug}`;

  useEffect(() => {
    QRCode.toDataURL(publicUrl, { width: 220, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [publicUrl]);

  // Load leads when analytics/leads tab is clicked
  useEffect(() => {
    if (activeTab === "leads") {
      setIsLoadingLeads(true);
      getBrochureLeadsAction(brochure.id)
        .then((res) => {
          if (res.ok && res.leads) {
            setLeadsData(res.leads);
          }
        })
        .finally(() => setIsLoadingLeads(false));
    }
  }, [activeTab, brochure.id]);

  // Save changes
  const handleSaveAll = () => {
    startSaving(async () => {
      try {
        const [resSec, resTheme, resMeta] = await Promise.all([
          saveBrochureSectionsAction(brochure.id, brochure.sections),
          saveBrochureThemeAction(brochure.id, brochure.theme),
          saveBrochureMetaAction(brochure.id, {
            ...brochure.meta,
            title: brochure.title,
          }),
        ]);

        if (!resSec.ok || !resTheme.ok || !resMeta.ok) {
          toast.error("Failed to save changes.");
          return;
        }

        setHasUnsavedChanges(false);
        toast.success("All changes saved!");
      } catch (err: unknown) {
        toast.error((err as Error)?.message || "Save failed.");
      }
    });
  };

  // Publish / Unpublish
  const handleTogglePublish = () => {
    startPublishing(async () => {
      try {
        if (brochure.status === "published") {
          const res = await unpublishBrochureAction(brochure.id);
          if (!res.ok) throw new Error(res.error);
          setBrochure((prev) => ({ ...prev, status: "draft" }));
          toast.success("Brochure unpublished.");
        } else {
          // Save first then publish
          await saveBrochureSectionsAction(brochure.id, brochure.sections);
          const res = await publishBrochureAction(brochure.id);
          if (!res.ok) throw new Error(res.error);
          setBrochure((prev) => ({ ...prev, status: "published", slug: res.slug }));
          toast.success("Brochure published live!");
          setShowShareModal(true);
        }
      } catch (err: unknown) {
        toast.error((err as Error)?.message || "Action failed.");
      }
    });
  };

  // Section manipulation
  const handleSectionUpdate = (updated: BrochureSection) => {
    setBrochure((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === updated.id ? updated : s)),
    }));
    setHasUnsavedChanges(true);
  };

  const handleSectionMove = (index: number, direction: "up" | "down") => {
    const nextSections = [...brochure.sections];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= nextSections.length) return;

    const temp = nextSections[index];
    nextSections[index] = nextSections[targetIndex];
    nextSections[targetIndex] = temp;

    setBrochure((prev) => ({ ...prev, sections: nextSections }));
    setHasUnsavedChanges(true);
  };

  const handleSectionDelete = (id: string) => {
    const nextSections = brochure.sections.filter((s) => s.id !== id);
    setBrochure((prev) => ({ ...prev, sections: nextSections }));
    if (selectedSectionId === id) {
      setSelectedSectionId(nextSections[0]?.id || null);
    }
    setHasUnsavedChanges(true);
    toast.success("Section removed");
  };

  const handleSectionDuplicate = (section: BrochureSection) => {
    const clone: BrochureSection = {
      id: newSectionId(),
      data: JSON.parse(JSON.stringify(section.data)),
      hidden: section.hidden,
      background: section.background,
    };
    const index = brochure.sections.findIndex((s) => s.id === section.id);
    const nextSections = [...brochure.sections];
    nextSections.splice(index + 1, 0, clone);

    setBrochure((prev) => ({ ...prev, sections: nextSections }));
    setSelectedSectionId(clone.id);
    setHasUnsavedChanges(true);
    toast.success("Section duplicated");
  };

  const handleAddSection = (type: BrochureSectionType) => {
    const newSec = makeSection(type);
    setBrochure((prev) => ({
      ...prev,
      sections: [...prev.sections, newSec],
    }));
    setSelectedSectionId(newSec.id);
    setShowAddSectionModal(false);
    setHasUnsavedChanges(true);
    toast.success(`Added ${type} section`);
  };

  // Theme update
  const handleThemeUpdate = (patch: Partial<BrochureTheme>) => {
    setBrochure((prev) => ({
      ...prev,
      theme: { ...prev.theme, ...patch },
    }));
    setHasUnsavedChanges(true);
  };

  // Meta update
  const handleMetaUpdate = (patch: Partial<BrochureDetail["meta"]>) => {
    setBrochure((prev) => ({
      ...prev,
      meta: { ...prev.meta, ...patch },
    }));
    setHasUnsavedChanges(true);
  };

  // Print PDF
  const handlePrintPdf = () => {
    window.print();
  };

  const selectedSection = brochure.sections.find((s) => s.id === selectedSectionId);
  const selectedIndex = selectedSection ? brochure.sections.indexOf(selectedSection) : -1;

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col -m-3 overflow-hidden bg-background">
      {/* ── Top Bar ── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 bg-card px-4 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon-sm" render={<Link href="/viralpulse-ai/brochures" />}>
            <ArrowLeft className="size-4" />
          </Button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <input
                value={brochure.title}
                onChange={(e) => {
                  setBrochure((prev) => ({ ...prev, title: e.target.value }));
                  setHasUnsavedChanges(true);
                }}
                className="bg-transparent text-sm font-bold truncate hover:border-b border-primary focus:outline-none focus:border-b"
              />
              <Badge variant={brochure.status === "published" ? "default" : "outline"} className="text-[10px] shrink-0">
                {brochure.status === "published" ? "Live" : "Draft"}
              </Badge>
              {hasUnsavedChanges && (
                <span className="size-2 rounded-full bg-amber-500 animate-pulse" title="Unsaved changes" />
              )}
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              Slug: /brochure/{brochure.slug}
            </p>
          </div>
        </div>

        {/* Center: Device Switcher */}
        <div className="hidden sm:flex items-center rounded-lg border border-border/60 bg-muted/40 p-0.5">
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

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant={isChatSidebarOpen ? "secondary" : "outline"}
            size="sm"
            onClick={() => setIsChatSidebarOpen((v) => !v)}
            className={cn(
              "gap-1.5 font-semibold text-xs shadow-xs transition-colors",
              isChatSidebarOpen
                ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                : "border-border text-foreground hover:bg-muted"
            )}
            title="Open or close sidebar chat messaging style AI Copilot"
          >
            <Sparkles className="size-3.5 text-primary" />
            <span>AI Chat Sidebar</span>
            <span className="flex size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </Button>

          <Button variant="outline" size="sm" onClick={handlePrintPdf} title="Download / Export to PDF">
            <Download className="size-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Export PDF</span>
          </Button>

          {brochure.status === "published" && (
            <Button variant="outline" size="sm" onClick={() => setShowShareModal(true)} title="Share link & QR code">
              <Share2 className="size-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Share</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteModal(true)}
            className="text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
            title="Delete Brochure"
          >
            <Trash2 className="size-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Delete</span>
          </Button>

          <Button
            variant={brochure.status === "published" ? "secondary" : "default"}
            size="sm"
            onClick={handleTogglePublish}
            disabled={isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : brochure.status === "published" ? (
              "Unpublish"
            ) : (
              <>
                <Globe className="size-3.5 mr-1" />
                Publish
              </>
            )}
          </Button>

          <Button size="sm" onClick={handleSaveAll} disabled={isSaving} className="gap-1.5">
            {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            <span>Save</span>
          </Button>
        </div>
      </header>

      {/* ── Main Studio Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar Controls */}
        <aside className="w-80 sm:w-96 shrink-0 border-r border-border/40 bg-card/60 flex flex-col min-h-0 overflow-hidden">
          {/* Navigation Tabs */}
          <div className="flex border-b border-border/40 p-2 gap-1 bg-muted/20">
            <button
              type="button"
              onClick={() => setActiveTab("sections")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors",
                activeTab === "sections" ? "bg-background shadow-xs text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Layers className="size-3.5" />
              Sections
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("design")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors",
                activeTab === "design" ? "bg-background shadow-xs text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Palette className="size-3.5" />
              Theme
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors",
                activeTab === "settings" ? "bg-background shadow-xs text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Settings className="size-3.5" />
              SEO
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("leads")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors",
                activeTab === "leads" ? "bg-background shadow-xs text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <BarChart3 className="size-3.5" />
              Leads
            </button>
          </div>

          {/* Tab 1: Sections Manager & Selected Section Field Editor */}
          {activeTab === "sections" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Brochure Outline</span>
                <Button size="xs" onClick={() => setShowAddSectionModal(true)} className="gap-1">
                  <Plus className="size-3" /> Add Section
                </Button>
              </div>

              {/* Sections list pill selectors */}
              <div className="space-y-1.5">
                {brochure.sections.map((sec, idx) => {
                  const isSelected = sec.id === selectedSectionId;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setSelectedSectionId(sec.id)}
                      className={cn(
                        "w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-all",
                        isSelected
                          ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                          : "bg-muted/40 hover:bg-muted text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="tabular-nums opacity-60 text-[10px]">{idx + 1}.</span>
                        <span className="capitalize truncate">{sec.data.type}</span>
                        {sec.hidden && <Badge variant="outline" className="text-[9px] py-0 px-1">Hidden</Badge>}
                      </div>
                      <span className="text-[10px] opacity-75 uppercase">
                        {(sec.data as { title?: string; headline?: string }).headline ||
                          (sec.data as { title?: string }).title ||
                          ""}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Selected Section Editor */}
              {selectedSection && (
                <div className="rounded-xl border border-border/60 bg-background p-4 shadow-xs mt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">
                      Edit {selectedSection.data.type}
                    </span>
                    <span className="text-[10px] text-muted-foreground">ID: {selectedSection.id.slice(0, 8)}</span>
                  </div>

                  <BrochureSectionEditor
                    section={selectedSection}
                    onUpdate={handleSectionUpdate}
                    onDelete={() => handleSectionDelete(selectedSection.id)}
                    onDuplicate={() => handleSectionDuplicate(selectedSection)}
                    onMoveUp={() => handleSectionMove(selectedIndex, "up")}
                    onMoveDown={() => handleSectionMove(selectedIndex, "down")}
                    canMoveUp={selectedIndex > 0}
                    canMoveDown={selectedIndex < brochure.sections.length - 1}
                    brochureContext={{
                      title: brochure.title,
                      brandName: brochure.meta.brandName,
                      category: brochure.category,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Theme & Design Controls */}
          {activeTab === "design" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* AI Theme Styler Box */}
              <div className="rounded-xl border border-primary/20 bg-linear-to-br from-primary/5 via-background to-primary/10 p-3.5 space-y-3 shadow-xs">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                  <Sparkles className="size-3.5" />
                  <span>AI Theme & Palette Stylist</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Describe any visual mood or brand style. AI will generate harmonious primary, accent, canvas colors and font pairings.
                </p>

                <div className="space-y-2">
                  <Input
                    placeholder="e.g. Modern dark cyber-tech with electric cyan and slate..."
                    value={aiThemePrompt}
                    onChange={(e) => setAiThemePrompt(e.target.value)}
                    className="text-xs bg-background"
                    disabled={isAiThemeWorking}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAiThemeStyle();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="w-full gap-1.5 text-xs font-semibold"
                    onClick={() => handleAiThemeStyle()}
                    disabled={isAiThemeWorking || !aiThemePrompt.trim()}
                  >
                    {isAiThemeWorking ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Generating AI Palette...
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5" />
                        Generate & Apply Style
                      </>
                    )}
                  </Button>
                </div>

                {/* Quick style suggestion chips */}
                <div className="pt-1 border-t border-border/40 space-y-1.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Quick AI Presets
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "Dark Cyber Tech", prompt: "Sleek dark tech theme with deep obsidian background, neon cyan primary, and electric violet accent" },
                      { label: "Luxury Gold", prompt: "Prestigious luxury brand style with warm charcoal canvas, champagne gold primary, and ivory accents" },
                      { label: "Modern Minimalist", prompt: "Crisp Swiss minimalist design with clean pure white canvas, pitch black typography, and bold indigo CTA" },
                      { label: "Healthcare Teal", prompt: "Clean clinical healthcare aesthetic with soft aqua background, trust-building deep medical teal, and soothing mint accents" },
                      { label: "Warm Earth Editorial", prompt: "Editorial warm terracotta and sand palette with rich espresso text and earthy olive accents" },
                      { label: "Vibrant Coral Agency", prompt: "Bold creative agency aesthetic with electric coral, warm blush background, and deep plum contrast" },
                    ].map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        disabled={isAiThemeWorking}
                        onClick={() => handleAiThemeStyle(chip.prompt)}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-background border border-border/60 hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-foreground">Manual Color Fine-Tuning</h4>
                <p className="text-[11px] text-muted-foreground">Adjust individual hex values or contrast.</p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Primary Brand Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brochure.theme.primaryColor}
                      onChange={(e) => handleThemeUpdate({ primaryColor: e.target.value })}
                      className="size-8 rounded border border-border cursor-pointer p-0.5"
                    />
                    <Input
                      value={brochure.theme.primaryColor}
                      onChange={(e) => handleThemeUpdate({ primaryColor: e.target.value })}
                      className="text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Accent Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brochure.theme.accentColor}
                      onChange={(e) => handleThemeUpdate({ accentColor: e.target.value })}
                      className="size-8 rounded border border-border cursor-pointer p-0.5"
                    />
                    <Input
                      value={brochure.theme.accentColor}
                      onChange={(e) => handleThemeUpdate({ accentColor: e.target.value })}
                      className="text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Canvas Background</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brochure.theme.backgroundColor}
                      onChange={(e) => handleThemeUpdate({ backgroundColor: e.target.value })}
                      className="size-8 rounded border border-border cursor-pointer p-0.5"
                    />
                    <Input
                      value={brochure.theme.backgroundColor}
                      onChange={(e) => handleThemeUpdate({ backgroundColor: e.target.value })}
                      className="text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Body Text Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brochure.theme.textColor}
                      onChange={(e) => handleThemeUpdate({ textColor: e.target.value })}
                      className="size-8 rounded border border-border cursor-pointer p-0.5"
                    />
                    <Input
                      value={brochure.theme.textColor}
                      onChange={(e) => handleThemeUpdate({ textColor: e.target.value })}
                      className="text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border/40 pt-4 space-y-3">
                <h4 className="text-xs font-bold text-foreground">Typography & Styling</h4>

                <div className="space-y-1.5">
                  <Label className="text-xs">Heading Font Family</Label>
                  <Select
                    value={brochure.theme.headingFont}
                    onValueChange={(val) => {
                      if (val) handleThemeUpdate({ headingFont: val });
                    }}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Inter">Inter (Clean / Modern)</SelectItem>
                      <SelectItem value="Plus Jakarta Sans">Plus Jakarta Sans (Tech / Crisp)</SelectItem>
                      <SelectItem value="Montserrat">Montserrat (Industrial / Bold)</SelectItem>
                      <SelectItem value="Cinzel">Cinzel (Editorial / Luxury)</SelectItem>
                      <SelectItem value="Playfair Display">Playfair Display (Serif / Classical)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Corner Rounding</Label>
                  <Select
                    value={brochure.theme.borderRadius}
                    onValueChange={(val) => {
                      if (val) handleThemeUpdate({ borderRadius: val as BrochureTheme["borderRadius"] });
                    }}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sharp (None)</SelectItem>
                      <SelectItem value="sm">Subtle (Small)</SelectItem>
                      <SelectItem value="md">Rounded (Medium)</SelectItem>
                      <SelectItem value="lg">Curved (Large)</SelectItem>
                      <SelectItem value="xl">Pill / Soft (Extra Large)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Section Density & Padding</Label>
                  <Select
                    value={brochure.theme.density}
                    onValueChange={(val) => {
                      if (val) handleThemeUpdate({ density: val as BrochureTheme["density"] });
                    }}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compact">Compact (Dense / Catalog style)</SelectItem>
                      <SelectItem value="comfortable">Comfortable (Balanced)</SelectItem>
                      <SelectItem value="spacious">Spacious (Showcase / Luxury)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: SEO & Meta */}
          {activeTab === "settings" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <h4 className="text-xs font-bold text-foreground">SEO & Meta Tags</h4>
                <p className="text-[11px] text-muted-foreground">Configures search previews and social link sharing.</p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Brand / Organization Name</Label>
                  <Input
                    value={brochure.meta.brandName}
                    onChange={(e) => handleMetaUpdate({ brandName: e.target.value })}
                    placeholder="e.g. Acme Corp"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">SEO Meta Description</Label>
                  <Textarea
                    rows={3}
                    value={brochure.meta.description}
                    onChange={(e) => handleMetaUpdate({ description: e.target.value })}
                    placeholder="Brief description for search engines and social cards..."
                    className="text-xs resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Keywords (Comma Separated)</Label>
                  <Input
                    value={brochure.meta.keywords}
                    onChange={(e) => handleMetaUpdate({ keywords: e.target.value })}
                    placeholder="industrial, engineering, products..."
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Social Share Image (OG Image URL)</Label>
                  <Input
                    value={brochure.meta.ogImage || ""}
                    onChange={(e) => handleMetaUpdate({ ogImage: e.target.value || null })}
                    placeholder="https://..."
                    className="text-xs"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="qrToggle"
                    checked={brochure.meta.qrEnabled}
                    onChange={(e) => handleMetaUpdate({ qrEnabled: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="qrToggle" className="text-xs font-medium">
                    Display Floating QR Code on Live Brochure
                  </Label>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Leads & Analytics */}
          {activeTab === "leads" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <h4 className="text-xs font-bold text-foreground">Performance & Leads</h4>
                <p className="text-[11px] text-muted-foreground">Inquiries submitted through this brochure's forms.</p>
              </div>

              {/* Metrics overview */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <div className="text-base font-bold tabular-nums">{brochure.analytics.views}</div>
                  <div className="text-[10px] text-muted-foreground">Views</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <div className="text-base font-bold tabular-nums">{brochure.analytics.ctaClicks}</div>
                  <div className="text-[10px] text-muted-foreground">Clicks</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <div className="text-base font-bold tabular-nums">{brochure.analytics.formSubmissions}</div>
                  <div className="text-[10px] text-muted-foreground">Leads</div>
                </div>
              </div>

              {/* Leads List */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">Inquiry Submissions ({leadsData.length})</Label>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => {
                      setIsLoadingLeads(true);
                      getBrochureLeadsAction(brochure.id)
                        .then((res) => {
                          if (res.ok && res.leads) setLeadsData(res.leads);
                        })
                        .finally(() => setIsLoadingLeads(false));
                    }}
                  >
                    <RefreshCw className={cn("size-3", isLoadingLeads && "animate-spin")} />
                  </Button>
                </div>

                {isLoadingLeads ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">Loading leads...</div>
                ) : leadsData.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                    No inquiries received yet. When visitors submit the contact form, their contact details and requirements will appear here.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {leadsData.map((lead) => (
                      <div key={lead.id} className="rounded-lg border bg-card p-3 text-xs space-y-1.5 shadow-xs">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground border-b pb-1">
                          <span>Lead #{lead.id.slice(0, 6)}</span>
                          <span>{new Date(lead.submittedAt).toLocaleDateString()}</span>
                        </div>
                        {Object.entries(lead.fields).map(([k, v]) => (
                          <div key={k} className="flex flex-col text-[11px]">
                            <span className="font-semibold capitalize text-foreground">{k}:</span>
                            <span className="text-muted-foreground">{v}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* Center Live Canvas */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-muted/30 p-4 sm:p-8 flex justify-center">
          <div
            className={cn(
              "transition-all duration-300 shadow-xl border border-border/60 bg-white rounded-2xl overflow-hidden min-h-[800px] h-fit",
              deviceView === "desktop" && "w-full max-w-5xl",
              deviceView === "tablet" && "w-[768px]",
              deviceView === "mobile" && "w-[375px]"
            )}
            style={{
              backgroundColor: brochure.theme.backgroundColor,
              color: brochure.theme.textColor,
              fontFamily: brochure.theme.bodyFont,
            }}
          >
            {/* Header Bar inside brochure */}
            <div className="border-b border-border/40 px-6 py-4 flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider uppercase text-primary">
                {brochure.meta.brandName || brochure.title}
              </span>
              <span className="text-[11px] text-muted-foreground">
                Digital Brochure
              </span>
            </div>

            {/* Sections rendered sequentially */}
            <div className="divide-y divide-border/30">
              {brochure.sections.map((section) => (
                <div
                  key={section.id}
                  onClick={() => {
                    setSelectedSectionId(section.id);
                    setActiveTab("sections");
                  }}
                  className={cn(
                    "cursor-pointer transition-all hover:ring-2 hover:ring-primary/40 relative",
                    section.id === selectedSectionId && "ring-2 ring-primary ring-offset-2"
                  )}
                >
                  <BrochureSectionRenderer
                    section={section}
                    theme={brochure.theme}
                    brochureId={brochure.id}
                    brochureTitle={brochure.title}
                    isEditorPreview={true}
                  />
                </div>
              ))}
            </div>

            {/* Footer inside brochure */}
            <footer className="border-t border-border/40 px-6 py-6 text-center text-xs text-muted-foreground">
              © {new Date().getFullYear()} {brochure.meta.brandName || brochure.title}. All rights reserved.
            </footer>
          </div>
        </main>

        {/* Right Open AI Chat Messaging Sidebar */}
        {isChatSidebarOpen && (
          <BrochureChatSidebar
            brochure={brochure}
            selectedSectionId={selectedSectionId}
            onSectionSelect={(id) => {
              setSelectedSectionId(id);
            }}
            onUpdateSection={(updated) => {
              handleSectionUpdate(updated);
            }}
            onAddSection={(newSection) => {
              setBrochure((prev) => ({
                ...prev,
                sections: [...prev.sections, newSection],
              }));
              setSelectedSectionId(newSection.id);
              setHasUnsavedChanges(true);
            }}
            onUpdateTheme={(newTheme) => {
              setBrochure((prev) => ({
                ...prev,
                theme: newTheme,
              }));
              setHasUnsavedChanges(true);
            }}
            onClose={() => setIsChatSidebarOpen(false)}
          />
        )}
      </div>

      {/* ── Add Section Modal ── */}
      <Dialog open={showAddSectionModal} onOpenChange={setShowAddSectionModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Section</DialogTitle>
            <DialogDescription>
              Prompt AI to generate a custom section or pick from 25 standard models.
            </DialogDescription>
          </DialogHeader>

          {/* AI-Powered Section Creator */}
          <div className="rounded-xl border border-primary/20 bg-linear-to-br from-primary/5 via-background to-primary/10 p-3.5 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <Sparkles className="size-3.5" />
              <span>Prompt AI to Generate Section</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Describe what section you need in plain words. AI will select the ideal layout, write production-ready copy, and insert it seamlessly.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Add an enterprise pricing table with annual discount and ROI metrics..."
                value={aiNewSectionPrompt}
                onChange={(e) => setAiNewSectionPrompt(e.target.value)}
                className="text-xs bg-background"
                disabled={isAiGeneratingSection}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAiGenerateSection();
                  }
                }}
              />
              <Button
                size="sm"
                className="gap-1.5 shrink-0 text-xs font-semibold"
                onClick={() => handleAiGenerateSection()}
                disabled={isAiGeneratingSection || !aiNewSectionPrompt.trim()}
              >
                {isAiGeneratingSection ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    Generate
                  </>
                )}
              </Button>
            </div>

            {/* Quick section inspiration chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                "Enterprise 3-Tier Pricing Table",
                "4-Step Implementation Roadmap",
                "VIP Speaker & Keynote Lineup",
                "Student Curriculum & Syllabus",
                "Project Case Study Portfolio",
                "Client Reviews & Trust Badges",
                "Limited Time Early-Bird Promo Offer",
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  disabled={isAiGeneratingSection}
                  onClick={() => handleAiGenerateSection(chip)}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-background border border-border/60 hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  + {chip}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <div className="h-px bg-border/60 flex-1" />
            <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Or Pick Standard Model Manually
            </span>
            <div className="h-px bg-border/60 flex-1" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[50vh] overflow-y-auto py-2">
            {BROCHURE_SECTION_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleAddSection(type)}
                className="flex flex-col items-start rounded-xl border border-border/60 p-3 text-left hover:border-primary hover:bg-primary/5 transition-all group"
              >
                <div className="text-xs font-bold capitalize text-foreground group-hover:text-primary">
                  {type}
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5">
                  {type === "hero" && "Banner & primary headline"}
                  {type === "overview" && "Executive summary"}
                  {type === "about" && "Heritage, mission, vision"}
                  {type === "features" && "Key feature cards"}
                  {type === "services" && "Service solutions grid"}
                  {type === "gallery" && "Photo & visual showcase"}
                  {type === "team" && "Leadership & specialists"}
                  {type === "testimonials" && "Client quotes & ratings"}
                  {type === "pricing" && "Pricing tiers & packages"}
                  {type === "stats" && "Metrics & numbers bar"}
                  {type === "curriculum" && "Course syllabus & modules"}
                  {type === "process" && "Step-by-step roadmap"}
                  {type === "projects" && "Case studies & portfolio"}
                  {type === "agenda" && "Event schedule timeline"}
                  {type === "speakers" && "Speaker profiles & topics"}
                  {type === "venue" && "Location, map, directions"}
                  {type === "floorplan" && "Architectural layout & specs"}
                  {type === "location" && "Connectivity & proximity"}
                  {type === "highlights" && "Curated feature points"}
                  {type === "itinerary" && "Day-by-day travel breakdown"}
                  {type === "offer" && "Discount & limited promotion"}
                  {type === "faq" && "Questions & answers"}
                  {type === "cta" && "Conversion call to action"}
                  {type === "contact" && "Business info & lead form"}
                  {type === "custom" && "Rich text & custom content"}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Share Modal ── */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader>
            <DialogTitle>Share Digital Brochure</DialogTitle>
            <DialogDescription>
              Your brochure is published live. Anyone with this link can view it and submit inquiries.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center p-4 space-y-4">
            {qrDataUrl && (
              <div className="p-3 border rounded-2xl bg-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="Brochure QR Code" className="size-44" />
                <p className="text-[11px] text-muted-foreground mt-1">Scan to open on smartphone</p>
              </div>
            )}

            <div className="flex w-full items-center gap-2">
              <Input value={publicUrl} readOnly className="text-xs font-mono" />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(publicUrl);
                  toast.success("Link copied to clipboard!");
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>

            <div className="flex w-full justify-center gap-2 pt-2">
              <Button
                variant="default"
                size="sm"
                render={<Link href={`/brochure/${brochure.slug}`} target="_blank" />}
                className="gap-1.5"
              >
                <ExternalLink className="size-3.5" /> Open Public Page
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Modal ── */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Brochure?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold text-foreground">“{brochure.title}”</span>?
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 text-xs text-muted-foreground">
            This action cannot be undone. This will permanently remove the brochure, take down its public URL, and remove it from your workspace dashboard.
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteBrochure}
              disabled={isDeleting}
              className="gap-1.5"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="size-3.5" />
                  Yes, Delete Brochure
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AI Copilot Master Dialog ── */}
      <Dialog open={showAiCopilotDialog} onOpenChange={setShowAiCopilotDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Sparkles className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base">ViralPulse AI Brochure Copilot</DialogTitle>
                <DialogDescription className="text-xs">
                  Prompt-driven AI assistant for automated content rewriting, section creation, and brand restyling.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Mode selection tabs */}
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/40 p-1 border border-border/40 text-xs">
              <button
                type="button"
                onClick={() => setAiCopilotMode("section")}
                className={cn(
                  "py-1.5 px-2 rounded-md font-semibold transition-all text-center",
                  aiCopilotMode === "section"
                    ? "bg-background text-primary shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Update Section
              </button>
              <button
                type="button"
                onClick={() => setAiCopilotMode("new_section")}
                className={cn(
                  "py-1.5 px-2 rounded-md font-semibold transition-all text-center",
                  aiCopilotMode === "new_section"
                    ? "bg-background text-primary shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Add New Section
              </button>
              <button
                type="button"
                onClick={() => setAiCopilotMode("theme")}
                className={cn(
                  "py-1.5 px-2 rounded-md font-semibold transition-all text-center",
                  aiCopilotMode === "theme"
                    ? "bg-background text-primary shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Restyle Theme
              </button>
            </div>

            {/* Context Notice */}
            {aiCopilotMode === "section" && (
              <div className="rounded-lg bg-muted/30 border border-border/60 p-2 text-[11px] text-muted-foreground flex items-center justify-between">
                <span>
                  Active Target:{" "}
                  <strong className="text-foreground capitalize">
                    {selectedSection?.data.type || "None"}
                  </strong>{" "}
                  (
                  {(selectedSection?.data as { title?: string; headline?: string })?.headline ||
                    (selectedSection?.data as { title?: string })?.title ||
                    "Untitled"}
                  )
                </span>
                <span className="text-[10px] text-primary font-medium">Auto-synced</span>
              </div>
            )}

            {/* Prompt input */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Your Prompt / Directive</Label>
              <Textarea
                rows={3}
                placeholder={
                  aiCopilotMode === "section"
                    ? "e.g. Rewrite this section to be more persuasive for enterprise VP buyers, emphasize 99.9% uptime and ROI..."
                    : aiCopilotMode === "new_section"
                    ? "e.g. Add a 3-tier enterprise pricing table with annual discount and SLA guarantees..."
                    : "e.g. Restyle to a luxury minimalist theme with charcoal canvas and champagne gold accents..."
                }
                value={aiCopilotPrompt}
                onChange={(e) => setAiCopilotPrompt(e.target.value)}
                className="text-xs"
                disabled={isAiCopilotWorking}
              />
            </div>

            {/* Quick Suggestion Chips based on mode */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Inspiration Prompts
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(aiCopilotMode === "section"
                  ? [
                      "Make copy punchier & more executive-level",
                      "Add quantifiable metrics and trust statistics",
                      "Enhance CTA urgency for lead generation",
                      "Translate tone to friendly & approachable",
                    ]
                  : aiCopilotMode === "new_section"
                  ? [
                      "Add 4-step onboarding timeline roadmap",
                      "Add 3-tier pricing table with popular badge",
                      "Add client testimonials with verified quotes",
                      "Add key technical feature highlights",
                    ]
                  : [
                      "Modern dark cyber tech with electric cyan",
                      "Prestigious luxury gold & charcoal",
                      "Clean Swiss clinical healthcare teal",
                      "Vibrant coral creative agency",
                    ]
                ).map((promptText) => (
                  <button
                    key={promptText}
                    type="button"
                    disabled={isAiCopilotWorking}
                    onClick={() => setAiCopilotPrompt(promptText)}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-background border border-border/60 hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAiCopilotDialog(false)}
              disabled={isAiCopilotWorking}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAiCopilotRun}
              disabled={isAiCopilotWorking || !aiCopilotPrompt.trim()}
              className="gap-1.5"
            >
              {isAiCopilotWorking ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Processing with AI...
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  Execute with AI
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
