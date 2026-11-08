"use client";

import PanelTabs from "@/components/platform/panel/PanelTabs";
import { useState, useTransition, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, ChevronUp, ChevronDown, Trash2, Pencil, Eye, EyeOff, Loader2,
  History, Rocket, Copy, RotateCcw, FileText, ExternalLink, CloudCheck, LayoutTemplate, Undo2, GitCompare, ArrowLeft,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import CmsPageHeader from "@/components/products/sitecraft-ai/ui/CmsPageHeader";
import { ContentStatusBadge, PendingChangesBadge } from "@/components/products/sitecraft-ai/ui/StatusBadge";
import EmptyState from "@/components/products/sitecraft-ai/ui/EmptyState";
import { useConfirm } from "@/components/products/sitecraft-ai/ui/ConfirmProvider";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Panel, PanelContent, PanelBody, PanelHeader, PanelTitle, PanelDescription, PanelFooter, PanelTrigger } from "@/components/products/sitecraft-ai/ui/SidePanel";
import { cn } from "@/lib/utils";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import SectionConfigForm from "@/components/products/sitecraft-ai/SectionConfigForm";
import { SECTION_REGISTRY, type PageSection } from "@/lib/products/sitecraft-ai/section-registry";
import { moveOrderKey } from "@/lib/products/sitecraft-ai/order";
import { diffSections, type SectionChange } from "@/lib/products/sitecraft-ai/section-diff";
import { displayTitle } from "@/lib/products/sitecraft-ai/site-areas";
import {
  saveSectionAction, removeSectionAction, reorderSectionAction, toggleSectionAction,
  publishPageAction, listVersionsAction, restoreVersionAction,
  getThemeVariantSectionsAction, saveThemeVariantSectionAction, removeThemeVariantSectionAction,
  reorderThemeVariantSectionAction, toggleThemeVariantSectionAction,
  copyDefaultIntoThemeVariantAction, deleteThemeVariantAction, discardChangesAction,
} from "@/app/(products)/sitecraft-ai/(protected)/pages/[id]/actions";
import type { CmsPageVersionDoc } from "@/lib/products/sitecraft-ai/pages";

function newSectionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `section-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const DEFAULT_TAB = "default";

/** A one-line hint of what a section says (its heading/title/eyebrow), so cards are easy to tell apart. */
function sectionSummary(config: Record<string, unknown>): string {
  for (const key of ["heading", "title", "titleLine1", "headingLead", "eyebrow", "badge", "sectionLabel", "slug", "panel"]) {
    const v = config[key];
    if (typeof v === "string" && v.trim()) return v.replace(/\[\[[^\]\n]{1,40}\]\]/g, "").trim();
  }
  return "";
}

export default function PageBuilder({
  pageId,
  path,
  title,
  status,
  version,
  hasUnpublishedChanges,
  sections: initialSections,
  themes,
  canEdit,
  canPublish,
  canRestore,
}: {
  pageId: string;
  path: string;
  title: string;
  status: "draft" | "published" | "archived";
  version: string | null;
  hasUnpublishedChanges: boolean;
  sections: PageSection[];
  themes: { key: string; name: string }[];
  canEdit: boolean;
  canPublish: boolean;
  canRestore: boolean;
}) {
  const [activeTab, setActiveTab] = useState<string>(DEFAULT_TAB);
  const [sectionsByTab, setSectionsByTab] = useState<Record<string, PageSection[]>>({ [DEFAULT_TAB]: initialSections });
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set([DEFAULT_TAB]));
  const [editing, setEditing] = useState<PageSection | null>(null);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(hasUnpublishedChanges);
  const [liveStatus, setLiveStatus] = useState(status);
  const [liveVersion, setLiveVersion] = useState(version);
  const confirm = useConfirm();
  const router = useRouter();

  const sections = sectionsByTab[activeTab] ?? [];
  const sorted = useMemo(() => [...sections].sort((a, b) => a.orderKey - b.orderKey), [sections]);
  const isDefaultTab = activeTab === DEFAULT_TAB;
  const otherThemes = themes.filter((t) => t.key !== DEFAULT_TAB);

  useEffect(() => {
    if (loadedTabs.has(activeTab)) return;
    startTransition(async () => {
      const loaded = await getThemeVariantSectionsAction(pageId, activeTab);
      setSectionsByTab((prev) => ({ ...prev, [activeTab]: loaded }));
      setLoadedTabs((prev) => new Set(prev).add(activeTab));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  function setTabSections(updater: (prev: PageSection[]) => PageSection[]) {
    setSectionsByTab((prev) => ({ ...prev, [activeTab]: updater(prev[activeTab] ?? []) }));
  }

  function addSection(type: string) {
    const def = SECTION_REGISTRY[type];
    if (!def) return;
    const orderKey = (sorted[sorted.length - 1]?.orderKey ?? 0) + 1024;
    const section: PageSection = { id: newSectionId(), type, orderKey, enabled: true, config: def.defaultConfig };
    setTabSections((prev) => [...prev, section]);
    setDirty(true);
    startTransition(async () => {
      const res = isDefaultTab ? await saveSectionAction(pageId, section) : await saveThemeVariantSectionAction(pageId, activeTab, section);
      if (!res.ok) toast.error(res.error);
    });
    setEditing(section);
  }

  async function removeSection(id: string) {
    const label = SECTION_REGISTRY[sections.find((x) => x.id === id)?.type ?? ""]?.label ?? "this section";
    const ok = await confirm({
      title: `Remove “${label}”?`,
      description: isDefaultTab ? "It's removed from the draft; the live page keeps it until you publish." : "It's removed from this theme's arrangement for the page.",
      confirmLabel: "Remove section",
      destructive: true,
    });
    if (!ok) return;
    const prev = sections;
    setTabSections((s) => s.filter((x) => x.id !== id));
    setDirty(true);
    startTransition(async () => {
      const res = isDefaultTab ? await removeSectionAction(pageId, id) : await removeThemeVariantSectionAction(pageId, activeTab, id);
      if (!res.ok) {
        toast.error(res.error);
        setTabSections(() => prev);
      }
    });
  }

  function toggleEnabled(section: PageSection) {
    const next = !section.enabled;
    setTabSections((s) => s.map((x) => (x.id === section.id ? { ...x, enabled: next } : x)));
    setDirty(true);
    startTransition(async () => {
      const res = isDefaultTab ? await toggleSectionAction(pageId, section.id, next) : await toggleThemeVariantSectionAction(pageId, activeTab, section.id, next);
      if (!res.ok) {
        toast.error(res.error);
        setTabSections((s) => s.map((x) => (x.id === section.id ? { ...x, enabled: !next } : x)));
      }
    });
  }

  function move(section: PageSection, dir: "up" | "down") {
    const orderKey = moveOrderKey(sorted, sorted.findIndex((s) => s.id === section.id), dir);
    if (orderKey == null) return;
    setTabSections((s) => s.map((x) => (x.id === section.id ? { ...x, orderKey } : x)));
    setDirty(true);
    startTransition(async () => {
      const res = isDefaultTab ? await reorderSectionAction(pageId, section.id, orderKey) : await reorderThemeVariantSectionAction(pageId, activeTab, section.id, orderKey);
      if (!res.ok) toast.error(res.error);
    });
  }

  function saveEditing(next: PageSection) {
    setTabSections((s) => s.map((x) => (x.id === next.id ? next : x)));
    setEditing(null);
    setDirty(true);
    startTransition(async () => {
      const res = isDefaultTab ? await saveSectionAction(pageId, next) : await saveThemeVariantSectionAction(pageId, activeTab, next);
      if (!res.ok) toast.error(res.error);
      else toast.success(isDefaultTab ? "Section saved to draft" : "Saved");
    });
  }

  function copyFromDefault() {
    startTransition(async () => {
      const res = await copyDefaultIntoThemeVariantAction(pageId, activeTab);
      if (!res.ok) { toast.error(res.error); return; }
      const loaded = await getThemeVariantSectionsAction(pageId, activeTab);
      setSectionsByTab((prev) => ({ ...prev, [activeTab]: loaded }));
      toast.success("Copied the default arrangement — edit it freely from here.");
    });
  }

  async function discardChanges() {
    const ok = await confirm({
      title: "Discard unpublished changes?",
      description: "The draft goes back to the live version — every section, SEO and structured-data change since the last publish is lost. The live page isn't affected.",
      confirmLabel: "Discard changes",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await discardChangesAction(pageId);
      if (!res.ok) { toast.error(res.error); return; }
      setSectionsByTab((prev) => ({ ...prev, [DEFAULT_TAB]: res.sections }));
      setDirty(false);
      toast.success("Changes discarded — the draft matches the live page again");
      router.refresh();
    });
  }

  async function resetVariant() {
    const ok = await confirm({ title: "Revert to the default arrangement?", description: "This theme's own section arrangement for this page is discarded.", confirmLabel: "Revert", destructive: true });
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteThemeVariantAction(pageId, activeTab);
      if (!res.ok) { toast.error(res.error); return; }
      setSectionsByTab((prev) => ({ ...prev, [activeTab]: [] }));
      toast.success("Reverted to the default arrangement for this theme.");
    });
  }

  return (
    <div className="space-y-4 pt-4">
      <CmsPageHeader
        breadcrumbs={[{ label: "Pages", href: "/sitecraft-ai/pages" }, { label: displayTitle(title, path) }]}
        icon={FileText}
        title={displayTitle(title, path)}
        description={<span className="font-mono">{path}</span>}
        badges={
          isDefaultTab ? (
            <>
              <ContentStatusBadge status={liveStatus} version={liveVersion} />
              {dirty && liveStatus === "published" && <PendingChangesBadge />}
            </>
          ) : undefined
        }
        actions={
          <>
            <Link href={`/sitecraft-ai/pages/${pageId}/preview`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Eye className="size-3.5" /> Preview
            </Link>
            {liveStatus === "published" && (
              <a href={path} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ExternalLink className="size-3.5" /> View live
              </a>
            )}
          </>
        }
      />

      {otherThemes.length > 0 && (
        <PanelTabs label="Theme arrangements" active={activeTab} onSelect={setActiveTab} tabs={[{ key: DEFAULT_TAB, label: "Default" }, ...otherThemes.map((t) => ({ key: t.key, label: t.name }))]} />
      )}

      {!isDefaultTab && (
        <div className="rounded-xl border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
          Editing this theme&apos;s own section arrangement for this page — the default theme&apos;s content is untouched.{" "}
          {sections.length === 0 ? (
            <Button variant="link" size="sm" className="h-auto p-0 align-baseline" onClick={copyFromDefault} disabled={pending}>
              <Copy className="size-3 mr-1" /> Copy the default arrangement to start from
            </Button>
          ) : (
            <Button variant="link" size="sm" className="h-auto p-0 align-baseline text-destructive" onClick={resetVariant} disabled={pending}>
              <RotateCcw className="size-3 mr-1" /> Revert to the default arrangement
            </Button>
          )}
        </div>
      )}

      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border border-border/50 bg-background/90 px-3 py-2 backdrop-blur-md dark:bg-card/85">
        <span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          {pending ? (
            <><Loader2 className="size-3.5 animate-spin" /> Saving…</>
          ) : (
            <><CloudCheck className="size-3.5 text-emerald-500" /> {isDefaultTab ? (dirty ? "Changes saved to draft" : "Up to date") : "Saved"}</>
          )}
          <span className="hidden sm:inline">· {sorted.length} section{sorted.length === 1 ? "" : "s"}</span>
        </span>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm"><Plus className="size-3.5" /> Add section</Button>} />
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              {Object.values(SECTION_REGISTRY).map((def) => (
                <DropdownMenuItem key={def.type} onClick={() => addSection(def.type)}>
                  {def.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {isDefaultTab && canEdit && dirty && liveStatus === "published" && (
          <Button variant="outline" size="sm" onClick={discardChanges} disabled={pending}>
            <Undo2 className="size-3.5" /> Discard changes
          </Button>
        )}
        {isDefaultTab && canPublish && (
          <PublishDialog
            pageId={pageId}
            disabled={sections.length === 0 || (liveStatus === "published" && !dirty)}
            onPublished={(v) => {
              setLiveStatus("published");
              setLiveVersion(v);
              setDirty(false);
              toast.success(`Published v${v}`);
            }}
          />
        )}
        {isDefaultTab && canRestore && (
          <VersionHistoryDialog pageId={pageId} currentSections={sectionsByTab[DEFAULT_TAB] ?? []} onRestored={(restoredSections) => { setSectionsByTab((prev) => ({ ...prev, [DEFAULT_TAB]: restoredSections })); setDirty(true); }} />
        )}
      </div>

      <div className="space-y-3">
        {sorted.map((section, i) => {
          const def = SECTION_REGISTRY[section.type];
          return (
            <GlassCard key={section.id} interactive={false} className="p-3 transition-colors hover:border-primary/30">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {!section.enabled && <EyeOff className="size-3.5 shrink-0 text-muted-foreground" />}
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0">
                    <span className={cn("block truncate font-medium", section.enabled ? "text-foreground" : "text-muted-foreground line-through decoration-muted-foreground/40")}>{def?.label ?? section.type}</span>
                    {sectionSummary(section.config) && <span className="block truncate text-xs text-muted-foreground">{sectionSummary(section.config)}</span>}
                  </span>
                  {!def && <Badge variant="outline" className="border-destructive/30 text-destructive">Unknown type</Badge>}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(section, "up")} disabled={i === 0} aria-label="Move up">
                      <ChevronUp className="size-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(section, "down")} disabled={i === sorted.length - 1} aria-label="Move down">
                      <ChevronDown className="size-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => toggleEnabled(section)} aria-label={section.enabled ? "Hide" : "Show"}>
                      {section.enabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </Button>
                    {def && (
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => setEditing(section)} aria-label="Edit">
                        <Pencil className="size-3.5" />
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeSection(section.id)} aria-label="Remove">
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            </GlassCard>
          );
        })}
        {sorted.length === 0 && (
          <EmptyState icon={LayoutTemplate} title="No sections yet" description={canEdit ? "Use “Add section” above to start building this page." : "This page has no sections."} />
        )}
      </div>

      {pending && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Saving…</p>}

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          {editing && <SectionEditorSheet section={editing} onSave={saveEditing} onCancel={() => setEditing(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SectionEditorSheet({ section, onSave, onCancel }: { section: PageSection; onSave: (s: PageSection) => void; onCancel: () => void }) {
  const def = SECTION_REGISTRY[section.type];
  const [config, setConfig] = useState<Record<string, unknown>>(section.config);

  return (
    <>
      <SheetHeader className="border-b border-border/60">
        <SheetTitle>{def?.label ?? section.type}</SheetTitle>
        <SheetDescription>Edit this section&apos;s content. Saving updates the draft only — publish to go live.</SheetDescription>
      </SheetHeader>
      <div className="flex-1 space-y-6 overflow-y-auto p-4">{def && <SectionConfigForm def={def} value={config} onChange={setConfig} />}</div>
      <SheetFooter className="border-t border-border/60">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSave({ ...section, config })}>Save</Button>
      </SheetFooter>
    </>
  );
}

function PublishDialog({ pageId, disabled, onPublished }: { pageId: string; disabled: boolean; onPublished: (version: string) => void }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const res = await publishPageAction(pageId, summary);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      setSummary("");
      onPublished(res.version);
    });
  };

  return (
    <Panel open={open} onOpenChange={setOpen}>
      <PanelTrigger render={<Button size="sm" disabled={disabled}><Rocket className="size-3.5" /> Publish</Button>} />
      <PanelContent>
        <PanelHeader>
          <PanelTitle>Publish this page</PanelTitle>
          <PanelDescription>This makes the draft&apos;s sections live on the public site.</PanelDescription>
        </PanelHeader>
        <PanelBody className="space-y-1.5">
          <Label htmlFor="change-summary">What changed?</Label>
          <Textarea id="change-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="Updated hero copy" />
        </PanelBody>
        <PanelFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Publish"}
          </Button>
        </PanelFooter>
      </PanelContent>
    </Panel>
  );
}

function VersionHistoryDialog({ pageId, currentSections, onRestored }: { pageId: string; currentSections: PageSection[]; onRestored: (sections: PageSection[]) => void }) {
  const [open, setOpen] = useState(false);
  const [comparing, setComparing] = useState<CmsPageVersionDoc | null>(null);
  const [versions, setVersions] = useState<CmsPageVersionDoc[] | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    setOpen(true);
    startTransition(async () => setVersions(await listVersionsAction(pageId)));
  };

  const restore = (version: string) => {
    startTransition(async () => {
      const res = await restoreVersionAction(pageId, version);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const v = versions?.find((x) => x.version === version);
      if (v) onRestored(v.sections);
      setOpen(false);
      toast.success(`Version ${version} restored into draft`);
    });
  };

  return (
    <Panel open={open} onOpenChange={(o) => { if (o) load(); else { setOpen(false); setComparing(null); } }}>
      <PanelTrigger render={<Button variant="outline" size="sm"><History className="size-3.5" /> Version history</Button>} />
      <PanelContent size="lg">
        <PanelHeader>
          <PanelTitle>Version history</PanelTitle>
          <PanelDescription>Restoring loads that version&apos;s content into the draft — you still need to publish it.</PanelDescription>
        </PanelHeader>
        <PanelBody className="space-y-2">
          {comparing ? (
            <RevisionCompare version={comparing} current={currentSections} onBack={() => setComparing(null)} onRestore={() => restore(comparing.version)} pending={pending} />
          ) : (
          <>
          {pending && !versions && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          {versions?.length === 0 && <p className="text-sm text-muted-foreground">No published versions yet.</p>}
          {versions?.map((v) => (
            <div key={v._id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  v{v.version} · {new Date(v.publishedAt).toLocaleString()}
                </p>
                <p className="truncate text-xs text-muted-foreground">{v.changeSummary}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setComparing(v)}>
                  <GitCompare className="size-3.5" /> Compare
                </Button>
                <Button size="sm" variant="outline" onClick={() => restore(v.version)} disabled={pending}>
                  Restore
                </Button>
              </div>
            </div>
          ))}
          </>
          )}
        </PanelBody>
      </PanelContent>
    </Panel>
  );
}

const CHANGE_STYLE: Record<SectionChange["kind"], { label: string; className: string }> = {
  added: { label: "Added", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  removed: { label: "Removed", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  edited: { label: "Edited", className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  moved: { label: "Moved", className: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400" },
  shown: { label: "Shown", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  hidden: { label: "Hidden", className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
};

/** WordPress-style revision compare, at section level: published version → current draft. */
function RevisionCompare({ version, current, onBack, onRestore, pending }: { version: CmsPageVersionDoc; current: PageSection[]; onBack: () => void; onRestore: () => void; pending: boolean }) {
  const changes = diffSections(version.sections, current);
  const humanize = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/[-_]/g, " ").toLowerCase();
  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2"><ArrowLeft className="size-3.5" /> All versions</Button>
      <div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-sm">
        Comparing <strong>v{version.version}</strong> <span className="text-muted-foreground">({new Date(version.publishedAt).toLocaleDateString()})</span> with your <strong>current draft</strong>
      </div>
      {changes.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No section differences — the draft&apos;s sections match this version.</p>
      ) : (
        <ul className="space-y-2">
          {changes.map((c, i) => (
            <li key={`${c.id}-${c.kind}-${i}`} className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
              <span className={cn("mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", CHANGE_STYLE[c.kind].className)}>{CHANGE_STYLE[c.kind].label}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{SECTION_REGISTRY[c.type]?.label ?? c.type}</p>
                <p className="truncate text-xs text-muted-foreground">{sectionSummary(c.config)}</p>
                {c.fields && <p className="mt-1 text-xs text-muted-foreground">Changed: {c.fields.map(humanize).join(", ")}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">SEO and structured-data changes aren&apos;t included in this comparison.</p>
      <Button variant="outline" size="sm" onClick={onRestore} disabled={pending}><RotateCcw className="size-3.5" /> Restore v{version.version} into the draft</Button>
    </div>
  );
}
