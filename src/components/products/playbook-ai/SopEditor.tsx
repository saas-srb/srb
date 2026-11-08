"use client";

import PanelTabs from "@/components/platform/panel/PanelTabs";
import { usePanelLabel } from "@/components/platform/PanelsProvider";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent } from "@/components/ui/card";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import MultiPicker from "@/components/products/playbook-ai/MultiPicker";
import BlockEditor, { newBlock, type EditorFile, type UploadFn } from "@/components/products/playbook-ai/BlockEditor";
import PublishDialog from "@/components/products/playbook-ai/PublishDialog";
import { saveSopAction } from "@/app/(products)/playbook-ai/(protected)/actions";
import {
  BLOCK_TYPES,
  CONFIDENTIALITY_LEVELS,
  DEFAULT_SECTIONS,
  SOP_MODULES,
  SOP_PRIORITIES,
  type Confidentiality,
  type SopBlock,
  type SopContent,
  type SopPriority,
  type SopSection,
} from "@/lib/products/playbook-ai/constants";
import { cn } from "@/lib/utils";
import type { SopMetaInput } from "@/lib/products/playbook-ai/sops";

export interface EditorTaxonomy {
  departments: { id: string; name: string; active: boolean }[];
  functions: { id: string; departmentId: string; name: string }[];
  processes: { id: string; functionId: string; parentId: string | null; name: string }[];
  categories: { id: string; name: string }[];
}

export interface SopEditorProps {
  sopId: string;
  code: string;
  version: string | null;
  updatedAt: string;
  initialMeta: SopMetaInput;
  initialContent: SopContent;
  initialFiles: EditorFile[];
  taxonomy: EditorTaxonomy;
  /** Departments this user may move the SOP into (`null` = any). */
  creatableDepartmentIds: string[] | null;
  users: { id: string; label: string; email: string }[];
  designations: { id: string; title: string; department: string }[];
  relatedOptions: { id: string; code: string; title: string }[];
  canPublish: boolean;
  canGrantAccess: boolean;
  reackDefault: boolean;
  assignedCount: number;
}

type Tab = "content" | "details" | "audience" | "files";
const TABS: { key: Tab; label: string }[] = [
  { key: "content", label: "Content" },
  { key: "details", label: "Details" },
  { key: "audience", label: "Audience & access" },
  { key: "files", label: "Files" },
];

const newId = () => globalThis.crypto.randomUUID();
const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function SopEditor(props: SopEditorProps) {
  const panelLabel = usePanelLabel();
  const { sopId, taxonomy } = props;
  const [meta, setMeta] = useState<SopMetaInput>(props.initialMeta);
  const [content, setContent] = useState<SopContent>(props.initialContent);
  const [files, setFiles] = useState<EditorFile[]>(props.initialFiles);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(props.updatedAt);
  const [tags, setTags] = useState(props.initialMeta.tags.join(", "));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("content");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const editContent = useCallback((fn: (c: SopContent) => SopContent) => {
    setContent(fn);
    setDirty(true);
  }, []);
  const editMeta = useCallback((patch: Partial<SopMetaInput>) => {
    setMeta((m) => ({ ...m, ...patch }));
    setDirty(true);
  }, []);

  // --- saving ------------------------------------------------------------
  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    const res = await saveSopAction(sopId, { baseUpdatedAt, meta, content });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      toast.error(res.error);
      return false;
    }
    setBaseUpdatedAt(res.updatedAt);
    setDirty(false);
    toast.success("Draft saved");
    return true;
  }, [sopId, baseUpdatedAt, meta, content]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, saving, save]);

  // --- uploads -----------------------------------------------------------
  const upload: UploadFn = useCallback(
    async (file) => {
      const fd = new FormData();
      fd.set("sopId", sopId);
      fd.set("file", file);
      try {
        const res = await fetch("/api/playbook-ai/files", { method: "POST", body: fd });
        const json = (await res.json()) as { ok: boolean; error?: string; file?: EditorFile };
        if (!json.ok || !json.file) {
          toast.error(json.error ?? "Upload failed.");
          return null;
        }
        const uploaded = json.file;
        setFiles((f) => [uploaded, ...f]);
        toast.success(`Uploaded ${uploaded.filename}`);
        return uploaded;
      } catch {
        toast.error("Upload failed — check your connection.");
        return null;
      }
    },
    [sopId]
  );

  // --- section / block operations ----------------------------------------
  const setSection = (id: string, fn: (s: SopSection) => SopSection) => editContent((c) => ({ ...c, sections: c.sections.map((s) => (s.id === id ? fn(s) : s)) }));
  const moveSection = (i: number, d: number) =>
    editContent((c) => {
      const j = i + d;
      if (j < 0 || j >= c.sections.length) return c;
      const next = [...c.sections];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...c, sections: next };
    });
  const addBlock = (sectionId: string, type: SopBlock["type"]) => setSection(sectionId, (s) => ({ ...s, blocks: [...s.blocks, newBlock(type)] }));
  const moveBlock = (sectionId: string, i: number, d: number) =>
    setSection(sectionId, (s) => {
      const j = i + d;
      if (j < 0 || j >= s.blocks.length) return s;
      const blocks = [...s.blocks];
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      return { ...s, blocks };
    });

  const usedKeys = new Set(content.sections.map((s) => s.key));
  const addableSections = [
    ...DEFAULT_SECTIONS.filter((d) => !usedKeys.has(d.key)).map((d) => ({ value: d.key, label: d.title })),
    { value: "__custom", label: "Custom section…" },
  ];
  function addSection(key: string) {
    if (!key) return;
    const preset = DEFAULT_SECTIONS.find((d) => d.key === key);
    editContent((c) => ({
      ...c,
      sections: [...c.sections, { id: newId(), key: preset?.key ?? `custom_${newId().slice(0, 8)}`, title: preset?.title ?? "New section", blocks: [newBlock("paragraph")] }],
    }));
  }

  // --- taxonomy cascade ---------------------------------------------------
  const deptOptions = taxonomy.departments
    .filter((d) => (d.active && (props.creatableDepartmentIds === null || props.creatableDepartmentIds.includes(d.id))) || d.id === meta.departmentId)
    .map((d) => ({ value: d.id, label: d.name }));
  const fnOptions = taxonomy.functions.filter((f) => f.departmentId === meta.departmentId).map((f) => ({ value: f.id, label: f.name }));
  const procOptions = taxonomy.processes.filter((p) => !p.parentId && p.functionId === meta.functionId).map((p) => ({ value: p.id, label: p.name }));
  const subOptions = taxonomy.processes.filter((p) => p.parentId === meta.processId).map((p) => ({ value: p.id, label: p.name }));

  const relatedPicker = useMemo(() => props.relatedOptions.map((r) => ({ id: r.id, label: r.title, sub: r.code })), [props.relatedOptions]);
  const userOptions = useMemo(() => props.users.map((u) => ({ value: u.id, label: `${u.label}${u.label !== u.email ? ` (${u.email})` : ""}` })), [props.users]);

  const confidentialityHint = CONFIDENTIALITY_LEVELS.find((c) => c.value === meta.confidentiality)?.description;

  return (
    <div className="space-y-4">
      {/* Sticky action bar */}
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border border-border/40 bg-background/90 px-3 py-2 backdrop-blur-md">
        <Link href={`/playbook-ai/library/${sopId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="size-3.5" data-icon="inline-start" />
          Back
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{content.title || "Untitled SOP"}</p>
          <p className="text-[11px] text-muted-foreground">
            <span className="font-mono">{props.code}</span> · {props.version ? `editing draft of v${props.version}` : "unpublished draft"} ·{" "}
            <span className={dirty ? "font-medium text-amber-600 dark:text-amber-400" : undefined}>{dirty ? "Unsaved changes" : "All changes saved"}</span>
          </p>
        </div>
        <Link href={`/playbook-ai/library/${sopId}?view=draft`} className={buttonVariants({ variant: "outline", size: "sm" })} aria-disabled={dirty} onClick={(e) => dirty && (e.preventDefault(), toast.info("Save your changes first to preview them."))}>
          <Eye className="size-3.5" data-icon="inline-start" />
          Preview
        </Link>
        <Button type="button" size="sm" variant={dirty ? "default" : "outline"} onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Save className="size-3.5" data-icon="inline-start" />}
          Save draft
        </Button>
        {props.canPublish && (
          <PublishDialog sopId={sopId} currentVersion={props.version} reackDefault={props.reackDefault} assignedCount={props.assignedCount} beforePublish={async () => (dirty ? save() : true)} />
        )}
      </div>

      {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <PanelTabs label="Editor sections" active={tab} onSelect={(k) => setTab(k as Tab)} tabs={TABS.map((t) => ({ key: t.key, label: t.label }))} />

      {/* ------------------------------------------------------------ CONTENT */}
      {tab === "content" && (
        <div className="space-y-4">
          <GlassCard interactive={false}>
            <CardContent className="space-y-4 p-5">
              <Field label="Title" htmlFor="sop-title">
                <Input id="sop-title" value={content.title} maxLength={200} onChange={(e) => editContent((c) => ({ ...c, title: e.target.value }))} className="text-base font-semibold" />
              </Field>
              <Field label="Short description" htmlFor="sop-desc" hint="One or two lines shown in lists and search results.">
                <Textarea id="sop-desc" rows={2} maxLength={1000} value={content.description} onChange={(e) => editContent((c) => ({ ...c, description: e.target.value }))} />
              </Field>
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Purpose" htmlFor="sop-purpose" hint="Why this SOP exists. Required to publish.">
                  <Textarea id="sop-purpose" rows={4} value={content.purpose} onChange={(e) => editContent((c) => ({ ...c, purpose: e.target.value }))} />
                </Field>
                <Field label="Scope" htmlFor="sop-scope" hint="Who and what it covers — and what it doesn't. Required to publish.">
                  <Textarea id="sop-scope" rows={4} value={content.scope} onChange={(e) => editContent((c) => ({ ...c, scope: e.target.value }))} />
                </Field>
              </div>
            </CardContent>
          </GlassCard>

          {content.sections.map((s, si) => (
            <GlassCard key={s.id} interactive={false}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [s.id]: !c[s.id] }))}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                    aria-label={collapsed[s.id] ? "Expand section" : "Collapse section"}
                    aria-expanded={!collapsed[s.id]}
                  >
                    <ArrowDown className={cn("size-4 transition-transform", collapsed[s.id] && "-rotate-90")} />
                  </button>
                  <Input value={s.title} maxLength={120} onChange={(e) => setSection(s.id, (x) => ({ ...x, title: e.target.value }))} className="h-8 flex-1 font-semibold" aria-label="Section title" />
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">{s.blocks.length} block{s.blocks.length === 1 ? "" : "s"}</span>
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => moveSection(si, -1)} disabled={si === 0} aria-label="Move section up"><ArrowUp /></Button>
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => moveSection(si, 1)} disabled={si === content.sections.length - 1} aria-label="Move section down"><ArrowDown /></Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Delete section"
                    onClick={() => {
                      if (s.blocks.some((b) => JSON.stringify(b) !== JSON.stringify({ ...newBlock(b.type), id: b.id })) && !window.confirm(`Delete the "${s.title}" section and everything in it?`)) return;
                      editContent((c) => ({ ...c, sections: c.sections.filter((x) => x.id !== s.id) }));
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>

                {!collapsed[s.id] && (
                  <>
                    {DEFAULT_SECTIONS.find((d) => d.key === s.key)?.guidance && (
                      <p className="pl-8 text-[11px] text-muted-foreground">{DEFAULT_SECTIONS.find((d) => d.key === s.key)?.guidance}</p>
                    )}
                    <div className="space-y-2 sm:pl-8">
                      {s.blocks.map((b, bi) => (
                        <BlockEditor
                          key={b.id}
                          block={b}
                          files={files}
                          onUpload={upload}
                          onChange={(nb) => setSection(s.id, (x) => ({ ...x, blocks: x.blocks.map((y) => (y.id === b.id ? nb : y)) }))}
                          onMove={(d) => moveBlock(s.id, bi, d)}
                          onRemove={() => setSection(s.id, (x) => ({ ...x, blocks: x.blocks.filter((y) => y.id !== b.id) }))}
                          canMoveUp={bi > 0}
                          canMoveDown={bi < s.blocks.length - 1}
                        />
                      ))}
                      <div className="w-56">
                        <OptionSelect
                          value=""
                          onChange={(v) => v && addBlock(s.id, v as SopBlock["type"])}
                          options={BLOCK_TYPES.map((t) => ({ value: t.value, label: `${t.label} — ${t.hint}` }))}
                          placeholder="+ Add block…"
                          aria-label={`Add block to ${s.title}`}
                        />
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </GlassCard>
          ))}

          <div className="w-64">
            <OptionSelect
              value=""
              onChange={(v) => {
                if (v === "__custom") addSection(`custom`);
                else addSection(v);
              }}
              options={addableSections}
              placeholder="+ Add section…"
              aria-label="Add section"
            />
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ DETAILS */}
      {tab === "details" && (
        <div className="space-y-4">
          <GlassCard interactive={false}>
            <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <h2 className="text-sm font-bold sm:col-span-2 lg:col-span-3">Where it belongs</h2>
              <Field label="Department">
                <OptionSelect value={meta.departmentId} onChange={(v) => editMeta({ departmentId: v, functionId: null, processId: null, subProcessId: null })} options={deptOptions} aria-label="Department" />
              </Field>
              <Field label="Function">
                <OptionSelect value={meta.functionId ?? ""} onChange={(v) => editMeta({ functionId: v || null, processId: null, subProcessId: null })} options={fnOptions} noneLabel="None" aria-label="Function" />
              </Field>
              <Field label="Process">
                <OptionSelect value={meta.processId ?? ""} onChange={(v) => editMeta({ processId: v || null, subProcessId: null })} options={procOptions} noneLabel="None" disabled={!meta.functionId} aria-label="Process" />
              </Field>
              <Field label="Sub-process">
                <OptionSelect value={meta.subProcessId ?? ""} onChange={(v) => editMeta({ subProcessId: v || null })} options={subOptions} noneLabel="None" disabled={!meta.processId || subOptions.length === 0} aria-label="Sub-process" />
              </Field>
              <Field label="Category">
                <OptionSelect value={meta.categoryId ?? ""} onChange={(v) => editMeta({ categoryId: v || null })} options={taxonomy.categories.map((c) => ({ value: c.id, label: c.name }))} noneLabel="Uncategorised" aria-label="Category" />
              </Field>
              <Field label="Owner" hint="Accountable for keeping this SOP current; gets review and expiry reminders.">
                <OptionSelect value={meta.ownerId} onChange={(v) => v && editMeta({ ownerId: v })} options={userOptions} aria-label="Owner" />
              </Field>
            </CardContent>
          </GlassCard>

          <GlassCard interactive={false}>
            <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <h2 className="text-sm font-bold sm:col-span-2 lg:col-span-3">Classification & lifecycle</h2>
              <Field label="Priority">
                <OptionSelect value={meta.priority} onChange={(v) => editMeta({ priority: v as SopPriority })} options={SOP_PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} aria-label="Priority" />
              </Field>
              <Field label="Confidentiality" hint={confidentialityHint}>
                <OptionSelect value={meta.confidentiality} onChange={(v) => editMeta({ confidentiality: v as Confidentiality })} options={CONFIDENTIALITY_LEVELS.map((c) => ({ value: c.value, label: c.label }))} aria-label="Confidentiality" />
              </Field>
              <div className="space-y-2 pt-6">
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={meta.mandatory} onChange={(e) => editMeta({ mandatory: e.target.checked })} />
                  <span><span className="font-medium">Mandatory</span><span className="block text-xs text-muted-foreground">Auto-assigned to the department on publish; acknowledgement tracked.</span></span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={meta.allowDownload} onChange={(e) => editMeta({ allowDownload: e.target.checked })} />
                  <span><span className="font-medium">Allow download & print</span><span className="block text-xs text-muted-foreground">Attachments and print/PDF, for people with the Download permission.</span></span>
                </label>
              </div>
              <Field label="Effective date" htmlFor="eff" hint="Blank = effective when published. A future date keeps it 'Published' until then.">
                <Input id="eff" type="date" value={meta.effectiveDate ?? ""} onChange={(e) => editMeta({ effectiveDate: e.target.value || null })} />
              </Field>
              <Field label="Review date" htmlFor="rev" hint="Blank = set from your default review period on publish.">
                <Input id="rev" type="date" value={meta.reviewDate ?? ""} onChange={(e) => editMeta({ reviewDate: e.target.value || null })} />
              </Field>
              <Field label="Expiry date" htmlFor="exp" hint="After this date the SOP shows as Expired.">
                <Input id="exp" type="date" value={meta.expiryDate ?? ""} onChange={(e) => editMeta({ expiryDate: e.target.value || null })} />
              </Field>
              <Field label="Tags" htmlFor="tags" hint="Comma-separated. Searchable." className="sm:col-span-2 lg:col-span-3">
                <Input
                  id="tags"
                  value={tags}
                  onChange={(e) => {
                    setTags(e.target.value);
                    editMeta({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) });
                  }}
                  placeholder="onboarding, payroll, quarterly"
                />
              </Field>
            </CardContent>
          </GlassCard>

          <GlassCard interactive={false}>
            <CardContent className="space-y-5 p-5">
              <h2 className="text-sm font-bold">Related material & integrations</h2>
              <Field label="Related SOPs" hint="Only SOPs you can read are listed.">
                <MultiPicker options={relatedPicker} value={content.relatedSopIds} onChange={(ids) => editContent((c) => ({ ...c, relatedSopIds: ids }))} placeholder="Search SOPs…" emptyLabel="No other SOPs yet." />
              </Field>

              <div className="space-y-2">
                <Label>Related policies</Label>
                {content.relatedPolicies.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={p.title} placeholder="Policy title" aria-label="Policy title" onChange={(e) => editContent((c) => ({ ...c, relatedPolicies: c.relatedPolicies.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }))} />
                    <Input value={p.url} placeholder="https://… (optional)" aria-label="Policy URL" onChange={(e) => editContent((c) => ({ ...c, relatedPolicies: c.relatedPolicies.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) }))} />
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove policy" onClick={() => editContent((c) => ({ ...c, relatedPolicies: c.relatedPolicies.filter((_, j) => j !== i) }))}><X /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="xs" onClick={() => editContent((c) => ({ ...c, relatedPolicies: [...c.relatedPolicies, { title: "", url: "" }] }))}><Plus data-icon="inline-start" />Add policy</Button>
              </div>

              <div className="space-y-2">
                <Label>Linked products</Label>
                <p className="text-[11px] text-muted-foreground">Tag the product(s) this SOP serves (e.g. a procurement SOP → SpendIQ) with a deep link, so it can be filtered by product and found from there.</p>
                {content.moduleLinks.map((m, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[11rem_1fr_1fr_auto]">
                    <OptionSelect value={m.module} onChange={(v) => editContent((c) => ({ ...c, moduleLinks: c.moduleLinks.map((x, j) => (j === i ? { ...x, module: v as typeof m.module } : x)) }))} options={SOP_MODULES.map((x) => ({ value: x.value, label: panelLabel(x.value, x.label) }))} aria-label="Product" />
                    <Input value={m.label} placeholder="Label" aria-label="Link label" onChange={(e) => editContent((c) => ({ ...c, moduleLinks: c.moduleLinks.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))} />
                    <Input value={m.url} placeholder="/spendiq/vendors or https://…" aria-label="Link URL" onChange={(e) => editContent((c) => ({ ...c, moduleLinks: c.moduleLinks.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) }))} />
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove product link" onClick={() => editContent((c) => ({ ...c, moduleLinks: c.moduleLinks.filter((_, j) => j !== i) }))}><X /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="xs" onClick={() => editContent((c) => ({ ...c, moduleLinks: [...c.moduleLinks, { module: "hrms", label: "", url: "/talentos" }] }))}><Plus data-icon="inline-start" />Add product link</Button>
              </div>
            </CardContent>
          </GlassCard>
        </div>
      )}

      {/* ---------------------------------------------------------- AUDIENCE */}
      {tab === "audience" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard interactive={false}>
            <CardContent className="space-y-3 p-5">
              <div>
                <h2 className="text-sm font-bold">Applicable roles</h2>
                <p className="text-xs text-muted-foreground">Job roles (from TalentOS designations) this SOP applies to. Leave empty for everyone in scope. Used to target mandatory assignment.</p>
              </div>
              <MultiPicker
                options={props.designations.map((d) => ({ id: d.id, label: d.title, sub: d.department }))}
                value={meta.applicableRoleIds}
                onChange={(ids) => editMeta({ applicableRoleIds: ids })}
                placeholder="Search roles…"
                emptyLabel="No designations found in TalentOS."
                maxHeight="max-h-72"
              />
            </CardContent>
          </GlassCard>
          <GlassCard interactive={false}>
            <CardContent className="space-y-3 p-5">
              <div>
                <h2 className="text-sm font-bold">Explicit access</h2>
                <p className="text-xs text-muted-foreground">
                  People granted here can read the published SOP even if its confidentiality level (<strong>{CONFIDENTIALITY_LEVELS.find((c) => c.value === meta.confidentiality)?.label}</strong>) would otherwise exclude them.
                  {!props.canGrantAccess && " You can't change this list — it needs the Manage Permissions capability, or being the SOP owner."}
                </p>
              </div>
              <MultiPicker
                options={props.users.map((u) => ({ id: u.id, label: u.label, sub: u.email }))}
                value={meta.accessUserIds}
                onChange={(ids) => editMeta({ accessUserIds: ids })}
                placeholder="Search people…"
                maxHeight="max-h-72"
                disabled={!props.canGrantAccess}
              />
            </CardContent>
          </GlassCard>
        </div>
      )}

      {/* -------------------------------------------------------------- FILES */}
      {tab === "files" && (
        <GlassCard interactive={false}>
          <CardContent className="space-y-3 p-5">
            <div>
              <h2 className="text-sm font-bold">Files on this SOP</h2>
              <p className="text-xs text-muted-foreground">Upload from inside an image, video or attachment block. Files are private and only served to people who can read this SOP.</p>
            </div>
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
            ) : (
              <ul className="divide-y divide-border/40 text-sm">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">{f.filename}</span>
                    <span className="shrink-0 text-xs text-muted-foreground capitalize">{f.kind} · {fmtSize(f.size)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </GlassCard>
      )}
    </div>
  );
}
