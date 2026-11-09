"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentConflictError, type DocumentStore } from "@/components/doc-editor/core/store";
import type { VariableDef } from "@/components/doc-editor/core/variables";
import { parseDoc } from "@/lib/products/playbook-ai/doc/validate";
import { PBDOC_SCHEMA_VERSION } from "@/lib/products/playbook-ai/doc/types";
import {
  AI_TONES, AUDIENCES, type AiTone, FOOTER_LAYOUTS, HEADER_LAYOUTS, INPUT_TYPES, PARTY_TYPES, PICKER_NAMESPACES, ROW_COLUMN_TYPES, TEMPLATE_AI_MODES,
  type InputField, type TemplateDef, type TemplateSection,
} from "@/lib/products/playbook-ai/catalogue/types";
import type { TemplateChange } from "@/lib/products/playbook-ai/tpl/diff";
import type { TemplateApproval } from "@/lib/products/playbook-ai/tpl/types";
import {
  archiveTemplateAction, dismissStarterUpdateAction, publishTemplateAction, restoreTemplateAction, reviewTemplateAction, saveTemplateAction, type TemplateActionResult,
} from "@/app/(products)/playbook-ai/(protected)/my-templates/actions";

const DocEditor = dynamic(() => import("@/components/doc-editor/ui/DocEditor"), { ssr: false, loading: () => <p className="p-4 text-sm text-muted-foreground" role="status">Loading the editor…</p> });

export interface TemplateView {
  id: string; typeId: string; name: string; status: "draft" | "published" | "archived"; rev: number; def: TemplateDef; publishedVersion: number | null;
  originKind: "starter" | "scratch"; starterVersion: number | null; numberingPrefix: string | null; approval: TemplateApproval | null;
  review: { by: string; on: string } | null; draftReviewed: boolean; publishedReviewed: boolean; canReview: boolean;
  versions: { number: number; publishedAt: string; note: string | null; reviewed: boolean }[];
  starterUpdate: { fromVersion: number; toVersion: number; stillShipped: boolean; starter: TemplateChange[]; yours: TemplateChange[]; conflicts: string[] } | null;
}

const fieldCls = "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const box = "rounded-2xl border border-border/50 bg-card p-5";
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

type Tab = "details" | "inputs" | "sections" | "versions";

/** A one-document in-memory store: the section body editor saves into the form, and "Save template" persists everything. */
function bodyStore(getDoc: () => ReturnType<typeof parseDoc>, onBody: (body: Record<string, unknown>[]) => void): DocumentStore {
  let version = 1;
  return {
    async load(id) {
      const r = getDoc();
      if (!r.ok) throw new Error("This section cannot be opened.");
      return { id, doc: r.doc, version: String(version) };
    },
    async save(req) {
      if (req.baseVersion !== String(version)) throw new DocumentConflictError();
      version += 1;
      onBody(req.doc.body as unknown as Record<string, unknown>[]);
      return { version: String(version), savedAt: new Date().toISOString() };
    },
  };
}

function SectionBody({ def, section, variables, onBody }: { def: TemplateDef; section: TemplateSection; variables: VariableDef[]; onBody: (body: Record<string, unknown>[]) => void }) {
  // The editor starts from the section as it was when it was opened (the parent remounts this component per section); later edits flow out through `onBody`.
  const [parsed] = useState(() => parseDoc({ schemaVersion: PBDOC_SCHEMA_VERSION, lang: "en", page: def.page, header: [], footer: [], body: section.body }, { assignIds: true }));
  // `onBody` is a stable callback from the parent (it only uses state setters), so the store can keep it.
  const [store] = useState(() => bodyStore(() => parsed, onBody));
  if (!parsed.ok) return <p role="alert" className="text-sm text-destructive">This section&apos;s wording is not valid: {parsed.issues[0]?.message}</p>;
  return (
    <DocEditor
      documentId={`${def.id}:${section.key}`} store={store} initial={{ id: section.key, doc: parsed.doc, version: "1" }} variables={variables}
      autosaveMs={600} className="h-[30rem]"
    />
  );
}

export default function TemplateEditor({ initial, variables }: { initial: TemplateView; variables: VariableDef[] }) {
  const router = useRouter();
  const [def, setDef] = useState<TemplateDef>(initial.def);
  const [prefix, setPrefix] = useState(initial.numberingPrefix ?? "");
  const [approval, setApproval] = useState<TemplateApproval>(initial.approval ?? {});
  const [tab, setTab] = useState<Tab>("sections");
  const [sel, setSel] = useState<string>(initial.def.sections.find((s) => !s.draftOnly)?.key ?? initial.def.sections[0]?.key);
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const scratch = initial.originKind === "scratch";
  const archived = initial.status === "archived";

  const change = (fn: (d: TemplateDef) => TemplateDef) => { setDef((d) => fn(d)); setDirty(true); };
  const setSection = (key: string, patch: Partial<TemplateSection>) => change((d) => ({ ...d, sections: d.sections.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));
  const setInput = (key: string, patch: Partial<InputField>) => change((d) => ({ ...d, inputs: d.inputs.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));

  const sectionBody = useCallback((key: string, body: Record<string, unknown>[]) => { setDef((d) => ({ ...d, sections: d.sections.map((s) => (s.key === key ? { ...s, body } : s)) })); setDirty(true); }, []);

  const vars = useMemo<VariableDef[]>(() => [...variables, ...def.inputs.filter((i) => i.type !== "person" && i.type !== "rows").map((i) => ({ key: `input.${i.key}`, label: i.label, group: "Fill-in fields" }))], [variables, def.inputs]);

  const run = (fn: () => Promise<TemplateActionResult>, ok: (r: Extract<TemplateActionResult, { ok: true }>) => string) => start(async () => {
    setIssues([]);
    const r = await fn();
    if (!r.ok) {
      const e = r.error;
      setIssues(e.code === "invalid" ? e.issues.map((i) => `${i.path ? `${i.path}: ` : ""}${i.message}`).slice(0, 12) : [e.message]);
      if (e.code === "invalid" && e.issues.length === 0) setIssues([e.message]);
      return;
    }
    toast.success(ok(r));
    setDirty(false);
    router.refresh();
  });

  const save = () => run(() => saveTemplateAction({ id: initial.id, rev: initial.rev, def, numberingPrefix: prefix || null, approval: Object.keys(approval).length ? approval : null }), (r) => (r.reviewCleared ? "Saved. The review was cleared because the wording changed." : "Template saved"));
  const section = def.sections.find((s) => s.key === sel);
  const move = (key: string, dir: -1 | 1) => change((d) => {
    const i = d.sections.findIndex((s) => s.key === key), j = i + dir;
    if (j < 0 || j >= d.sections.length) return d;
    const next = [...d.sections];
    [next[i], next[j]] = [next[j], next[i]];
    return { ...d, sections: next };
  });
  const addSection = () => {
    const base = "section"; let n = def.sections.length + 1; let key = `${base}_${n}`;
    while (def.sections.some((s) => s.key === key)) key = `${base}_${++n}`;
    change((d) => ({ ...d, sections: [...d.sections, { key, title: "New section", aiMode: "fixed", locked: false, body: [{ type: "paragraph", content: [] }] }] }));
    setSel(key);
  };

  const needsAdvocate = def.legal.review && !initial.publishedReviewed;
  const tabBtn = (t: Tab, label: string) => <button type="button" onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm ${tab === t ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{label}</button>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-muted px-2 py-1">{initial.status === "published" ? `Published, version ${initial.publishedVersion}` : initial.status === "archived" ? "Archived" : "Draft, not published"}</span>
        <span className="rounded bg-muted px-2 py-1">{initial.originKind === "starter" ? `Copied from the starter (version ${initial.starterVersion})` : "Made from scratch"}</span>
        {initial.draftReviewed ? <span className="rounded bg-green-500/15 px-2 py-1 text-green-700 dark:text-green-400">Reviewed by {initial.review?.by} on {initial.review ? new Date(initial.review.on).toLocaleDateString("en-IN") : ""}</span> : <span className="rounded bg-muted px-2 py-1">Not reviewed</span>}
        {needsAdvocate && <span className="rounded bg-amber-500/15 px-2 py-1 text-amber-700 dark:text-amber-400">Needs review by a qualified advocate</span>}
        {dirty && <span className="rounded bg-blue-500/15 px-2 py-1 text-blue-700 dark:text-blue-400">Unsaved changes</span>}
      </div>

      {initial.starterUpdate && (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm" aria-label="Starter update">
          <h2 className="font-semibold">{initial.starterUpdate.stillShipped ? `The platform updated this starter (version ${initial.starterUpdate.fromVersion} to ${initial.starterUpdate.toVersion})` : "The platform no longer ships the starter this was copied from"}</h2>
          <p className="mt-1 text-muted-foreground">Your copy has not been changed and never will be automatically. Review what changed and copy across what you want.</p>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div><h3 className="text-xs font-semibold uppercase text-muted-foreground">Changed in the starter</h3><ul className="mt-1 list-disc pl-5">{initial.starterUpdate.starter.map((c) => <li key={c.id}>{c.summary}{initial.starterUpdate!.conflicts.includes(c.id) ? " (you changed this too)" : ""}</li>)}{initial.starterUpdate.starter.length === 0 && <li>Nothing visible</li>}</ul></div>
            <div><h3 className="text-xs font-semibold uppercase text-muted-foreground">Changed by your company</h3><ul className="mt-1 list-disc pl-5">{initial.starterUpdate.yours.map((c) => <li key={c.id}>{c.summary}</li>)}{initial.starterUpdate.yours.length === 0 && <li>Nothing</li>}</ul></div>
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-3" disabled={pending} onClick={() => run(() => dismissStarterUpdateAction(initial.id), () => "Update dismissed")}>I have looked at this: dismiss</Button>
        </section>
      )}

      <div className="flex flex-wrap gap-1 rounded-xl border border-border/50 bg-card p-1" role="tablist">
        {tabBtn("sections", "Sections")}{tabBtn("inputs", `Fill-in form (${def.inputs.length})`)}{tabBtn("details", "Details and policy")}{tabBtn("versions", `Versions (${initial.versions.length})`)}
      </div>

      {tab === "details" && (
        <section className={`${box} grid gap-4 md:grid-cols-2`}>
          <div className="space-y-1.5"><Label htmlFor="t-name">Name</Label><Input id="t-name" value={def.name} maxLength={120} disabled={archived} onChange={(e) => change((d) => ({ ...d, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor="t-title">Document title</Label><Input id="t-title" value={def.title} maxLength={200} onChange={(e) => change((d) => ({ ...d, title: e.target.value }))} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="t-purpose">Purpose</Label><Input id="t-purpose" value={def.purpose} maxLength={200} onChange={(e) => change((d) => ({ ...d, purpose: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor="t-prefix">Numbering prefix</Label><Input id="t-prefix" value={prefix} placeholder={def.numberingPrefix} maxLength={20} onChange={(e) => { setPrefix(e.target.value.toUpperCase()); setDirty(true); }} /><p className="text-[11px] text-muted-foreground">Numbers look like {prefix || def.numberingPrefix}/2026-27/0001.</p></div>
          <fieldset className="space-y-1.5"><legend className="text-sm font-medium">Approval for this template</legend>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={approval.requireDifferentApprover === true} onChange={(e) => { setApproval((a) => ({ ...a, requireDifferentApprover: e.target.checked ? true : undefined, ...(e.target.checked ? { autoApproveOwn: undefined } : {}) })); setDirty(true); }} />A different person must approve</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={approval.autoApproveOwn === true} disabled={approval.requireDifferentApprover === true} onChange={(e) => { setApproval((a) => ({ ...a, autoApproveOwn: e.target.checked ? true : undefined })); setDirty(true); }} />The author&apos;s own document is approved automatically</label>
            <p className="text-[11px] text-muted-foreground">Left unticked, the company setting for this document type applies.</p></fieldset>
          <div className="space-y-1.5"><Label htmlFor="t-header">Header</Label><select id="t-header" className={fieldCls} value={def.layout.header} onChange={(e) => change((d) => ({ ...d, layout: { ...d.layout, header: e.target.value as TemplateDef["layout"]["header"] } }))}>{HEADER_LAYOUTS.map((h) => <option key={h} value={h}>{h}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="t-footer">Footer</Label><select id="t-footer" className={fieldCls} value={def.layout.footer} onChange={(e) => change((d) => ({ ...d, layout: { ...d.layout, footer: e.target.value as TemplateDef["layout"]["footer"] } }))}>{FOOTER_LAYOUTS.map((h) => <option key={h} value={h}>{h.replace(/_/g, " ")}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="t-align">Title alignment</Label><select id="t-align" className={fieldCls} value={def.layout.titleAlign} onChange={(e) => change((d) => ({ ...d, layout: { ...d.layout, titleAlign: e.target.value as "left" | "center" } }))}><option value="left">Left</option><option value="center">Centre</option></select></div>
          {scratch && (
            <>
              <div className="space-y-1.5"><Label htmlFor="t-party">Party</Label><select id="t-party" className={fieldCls} value={def.party} onChange={(e) => change((d) => ({ ...d, party: e.target.value as TemplateDef["party"], audience: e.target.value === "none" ? "internal" : d.audience === "internal" ? "external" : d.audience }))}>{PARTY_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
              <div className="space-y-1.5"><Label htmlFor="t-aud">Audience</Label><select id="t-aud" className={fieldCls} value={def.audience} onChange={(e) => change((d) => ({ ...d, audience: e.target.value as TemplateDef["audience"] }))}>{AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
            </>
          )}
          <p className="text-xs text-muted-foreground md:col-span-2">Document type {def.id}. {def.legal.review ? "This is a legal document type: the review notice is shown on every draft. " : ""}{def.needsSignature ? "It is sent to ContractFlow for signature." : ""}</p>
        </section>
      )}

      {tab === "inputs" && (
        <section className={`${box} space-y-4`}>
          <p className="text-sm text-muted-foreground">The form people fill in when they create a document from this template. Values become <code>input.name</code> variables in the wording.</p>
          {def.inputs.map((inp, idx) => (
            <div key={inp.key} className="rounded-xl border border-border/50 p-3 text-sm">
              <div className="flex flex-wrap items-end gap-2">
                <label className="space-y-1"><span className="block text-xs text-muted-foreground">Label</span><Input value={inp.label} maxLength={120} className="w-52" onChange={(e) => setInput(inp.key, { label: e.target.value })} /></label>
                <label className="space-y-1"><span className="block text-xs text-muted-foreground">Key</span><Input value={inp.key} readOnly className="w-40 bg-muted/40" aria-label={`Key of ${inp.label}`} /></label>
                <label className="space-y-1"><span className="block text-xs text-muted-foreground">Type</span><select className={`${fieldCls} w-36`} value={inp.type} onChange={(e) => setInput(inp.key, { type: e.target.value as InputField["type"] })}>{INPUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={inp.required} onChange={(e) => setInput(inp.key, { required: e.target.checked })} />Required</label>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${inp.label}`} onClick={() => change((d) => ({ ...d, inputs: d.inputs.filter((_, i) => i !== idx) }))}><Trash2 className="size-4" /></Button>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <label className="space-y-1"><span className="block text-xs text-muted-foreground">Help text</span><Input value={inp.help ?? ""} maxLength={300} onChange={(e) => setInput(inp.key, { help: e.target.value || undefined })} /></label>
                {(inp.type === "select" || inp.type === "multiselect") && <label className="space-y-1"><span className="block text-xs text-muted-foreground">Options (one per line: value | label)</span><textarea className="min-h-20 w-full rounded-lg border border-input bg-background p-2 text-sm" value={(inp.options ?? []).map((o) => `${o.value} | ${o.label}`).join("\n")} onChange={(e) => setInput(inp.key, { options: lines(e.target.value).map((l) => { const [v, ...r] = l.split("|"); return { value: v.trim(), label: (r.join("|") || v).trim() }; }) })} /></label>}
                {inp.type === "person" && <label className="space-y-1"><span className="block text-xs text-muted-foreground">Picks</span><select className={fieldCls} value={inp.picker ?? ""} onChange={(e) => setInput(inp.key, { picker: e.target.value as InputField["picker"] })}>{PICKER_NAMESPACES.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>}
                {inp.type === "rows" && <label className="space-y-1 md:col-span-2"><span className="block text-xs text-muted-foreground">Columns (one per line: key | label | type, type is {ROW_COLUMN_TYPES.join(", ")})</span><textarea className="min-h-20 w-full rounded-lg border border-input bg-background p-2 text-sm" value={(inp.columns ?? []).map((c) => `${c.key} | ${c.label} | ${c.type}`).join("\n")} onChange={(e) => setInput(inp.key, { columns: lines(e.target.value).map((l) => { const [k, lab, ty] = l.split("|").map((x) => x.trim()); return { key: k, label: lab ?? k, type: (ROW_COLUMN_TYPES as readonly string[]).includes(ty) ? (ty as "text") : "text" }; }) })} /></label>}
                {(inp.type === "number" || inp.type === "money") && <div className="flex gap-2"><label className="space-y-1"><span className="block text-xs text-muted-foreground">Minimum</span><Input type="number" value={inp.min ?? ""} onChange={(e) => setInput(inp.key, { min: e.target.value === "" ? undefined : Number(e.target.value) })} /></label><label className="space-y-1"><span className="block text-xs text-muted-foreground">Maximum</span><Input type="number" value={inp.max ?? ""} onChange={(e) => setInput(inp.key, { max: e.target.value === "" ? undefined : Number(e.target.value) })} /></label></div>}
                {(inp.type === "text" || inp.type === "longtext") && <label className="space-y-1"><span className="block text-xs text-muted-foreground">Longest answer (characters)</span><Input type="number" value={inp.maxLength ?? ""} onChange={(e) => setInput(inp.key, { maxLength: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>}
                {inp.type !== "person" && inp.type !== "rows" && <label className="space-y-1"><span className="block text-xs text-muted-foreground">Fill in automatically from (comma-separated variables, e.g. company.city)</span><Input value={(inp.bindings ?? []).join(", ")} onChange={(e) => setInput(inp.key, { bindings: csv(e.target.value).length ? csv(e.target.value) : undefined })} /></label>}
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => { let n = def.inputs.length + 1; let key = `field_${n}`; while (def.inputs.some((i) => i.key === key)) key = `field_${++n}`; change((d) => ({ ...d, inputs: [...d.inputs, { key, label: "New field", type: "text", required: false }] })); }}><Plus className="mr-1 size-4" />Add a field</Button>
        </section>
      )}

      {tab === "sections" && (
        <section className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div className={`${box} space-y-1`}>
            {def.sections.map((s) => (
              <div key={s.key} className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${s.key === sel ? "bg-primary/10" : "hover:bg-muted"}`}>
                <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setSel(s.key)}>{s.title}{s.draftOnly ? " (draft only)" : ""}<span className="block text-[10px] text-muted-foreground">{s.aiMode === "fixed" ? "Fixed wording" : s.aiMode === "ai" ? "Written by AI" : "Partly written by AI"}{s.locked ? ", locked" : ""}</span></button>
                <button type="button" aria-label={`Move ${s.title} up`} className="p-1 text-muted-foreground hover:text-foreground" onClick={() => move(s.key, -1)}><ArrowUp className="size-3.5" /></button>
                <button type="button" aria-label={`Move ${s.title} down`} className="p-1 text-muted-foreground hover:text-foreground" onClick={() => move(s.key, 1)}><ArrowDown className="size-3.5" /></button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="mt-2 w-full" onClick={addSection}><Plus className="mr-1 size-4" />Add a section</Button>
          </div>
          {section && (
            <div className="space-y-3">
              <div className={`${box} grid gap-3 md:grid-cols-2`}>
                <div className="space-y-1.5"><Label htmlFor="s-title">Section title</Label><Input id="s-title" value={section.title} maxLength={200} onChange={(e) => setSection(section.key, { title: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="s-mode">Who writes it</Label>
                  <select id="s-mode" className={fieldCls} value={section.aiMode} onChange={(e) => { const m = e.target.value as TemplateSection["aiMode"]; setSection(section.key, m === "fixed" ? { aiMode: m, ai: undefined } : { aiMode: m, locked: false, ai: section.ai ?? { tone: "neutral", minWords: 60, maxWords: 300, brief: "Write this section from the facts provided.", allowedFacts: def.inputs.filter((i) => i.type !== "person" && i.type !== "rows").slice(0, 3).map((i) => `input.${i.key}`).concat(def.inputs.length ? [] : ["company.name"]), neverInvent: ["Names, dates, amounts or any fact that was not provided."] } }); }}>
                    {TEMPLATE_AI_MODES.map((m) => <option key={m} value={m}>{m === "fixed" ? "Fixed wording (no AI)" : m === "ai" ? "AI writes it" : "Fixed clauses with AI parts"}</option>)}</select></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={section.locked} disabled={section.aiMode !== "fixed"} onChange={(e) => setSection(section.key, { locked: e.target.checked })} />Locked (reviewed wording; cannot be edited in documents or rewritten by AI)</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={!!section.noHeading} onChange={(e) => setSection(section.key, { noHeading: e.target.checked || undefined })} />Do not print the title as a heading</label>
                {section.ai && (
                  <>
                    <div className="space-y-1.5"><Label htmlFor="a-tone">Tone</Label><select id="a-tone" className={fieldCls} value={section.ai.tone} onChange={(e) => setSection(section.key, { ai: { ...section.ai!, tone: e.target.value as AiTone } })}>{AI_TONES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                    <div className="flex gap-2"><label className="space-y-1"><span className="block text-xs text-muted-foreground">Fewest words</span><Input type="number" min={1} value={section.ai.minWords} onChange={(e) => setSection(section.key, { ai: { ...section.ai!, minWords: Number(e.target.value) } })} /></label><label className="space-y-1"><span className="block text-xs text-muted-foreground">Most words</span><Input type="number" min={1} max={1200} value={section.ai.maxWords} onChange={(e) => setSection(section.key, { ai: { ...section.ai!, maxWords: Number(e.target.value) } })} /></label></div>
                    <label className="space-y-1 md:col-span-2"><span className="block text-xs text-muted-foreground">What the AI should write</span><textarea className="min-h-16 w-full rounded-lg border border-input bg-background p-2 text-sm" maxLength={400} value={section.ai.brief} onChange={(e) => setSection(section.key, { ai: { ...section.ai!, brief: e.target.value } })} /></label>
                    <label className="space-y-1"><span className="block text-xs text-muted-foreground">Facts it may use (comma-separated, e.g. input.reason, company.name)</span><Input value={section.ai.allowedFacts.join(", ")} onChange={(e) => setSection(section.key, { ai: { ...section.ai!, allowedFacts: csv(e.target.value) } })} /></label>
                    <label className="space-y-1"><span className="block text-xs text-muted-foreground">What it must never invent (one per line)</span><textarea className="min-h-16 w-full rounded-lg border border-input bg-background p-2 text-sm" value={section.ai.neverInvent.join("\n")} onChange={(e) => setSection(section.key, { ai: { ...section.ai!, neverInvent: lines(e.target.value) } })} /></label>
                  </>
                )}
              </div>
              <div className={box}>
                <h3 className="mb-2 text-sm font-semibold">Wording and layout of this section</h3>
                <p className="mb-2 text-xs text-muted-foreground">Use the Variables button for company and record values, and add a fill-in field with the placeholder button. For AI sections this is the skeleton the AI works from.</p>
                <SectionBody key={section.key} def={def} section={section} variables={vars} onBody={(body) => sectionBody(section.key, body)} />
              </div>
              <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => { change((d) => ({ ...d, sections: d.sections.filter((s) => s.key !== section.key) })); setSel(def.sections.find((s) => s.key !== section.key)?.key ?? ""); }}><Trash2 className="mr-1 size-4" />Remove this section</Button>
            </div>
          )}
        </section>
      )}

      {tab === "versions" && (
        <section className={box}>
          <p className="text-sm text-muted-foreground">Published versions never change. New documents use the latest one and record which version they used.</p>
          {initial.versions.length === 0 ? <p className="mt-3 text-sm">Nothing published yet.</p> : (
            <ul className="mt-3 space-y-1 text-sm">{initial.versions.map((v) => <li key={v.number}>Version {v.number}, published {new Date(v.publishedAt).toLocaleString("en-IN")}{v.note ? `: ${v.note}` : ""} · {v.reviewed ? "reviewed" : "not reviewed"}</li>)}</ul>
          )}
        </section>
      )}

      {issues.length > 0 && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><p className="font-medium">Not saved:</p><ul className="mt-1 list-disc pl-5">{issues.map((i, k) => <li key={k}>{i}</li>)}</ul></div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!archived && <Button type="button" onClick={save} disabled={pending || !dirty}>{pending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}Save template</Button>}
        {!archived && <Button type="button" variant="outline" disabled={pending || dirty} title={dirty ? "Save your changes first" : undefined} onClick={() => run(() => publishTemplateAction(initial.id, notice ?? undefined), (r) => `Published version ${r.version}`)}>Publish for new documents</Button>}
        {!archived && <Input aria-label="Note for this version" placeholder="Note for this version (optional)" className="w-64" maxLength={500} value={notice ?? ""} onChange={(e) => setNotice(e.target.value)} />}
        {initial.canReview && !archived && (initial.draftReviewed
          ? <Button type="button" variant="outline" disabled={pending || dirty} onClick={() => run(() => reviewTemplateAction(initial.id, false), () => "Review cleared")}>Clear review</Button>
          : <Button type="button" variant="outline" disabled={pending || dirty} title={dirty ? "Save first: the review applies to the saved wording" : undefined} onClick={() => run(() => reviewTemplateAction(initial.id, true), () => "Marked as reviewed")}>Mark as reviewed</Button>)}
        {archived ? <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => restoreTemplateAction(initial.id), () => "Restored as a draft")}>Restore</Button>
          : <Button type="button" variant="ghost" className="text-destructive" disabled={pending} onClick={() => run(() => archiveTemplateAction(initial.id), () => "Archived")}>Archive</Button>}
      </div>
    </div>
  );
}
