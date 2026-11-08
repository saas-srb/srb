"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import MultiPicker from "@/components/products/playbook-ai/MultiPicker";
import { saveTemplateAction } from "@/app/(products)/playbook-ai/(protected)/actions";

interface Section {
  key: string;
  title: string;
  guidance: string;
}

/** Edit a template's name, suggested departments and section layout. Changes apply to SOPs created from it AFTER the save; existing SOPs are never rewritten. */
export default function TemplateEditor({
  templateId,
  initial,
  departmentOptions,
  canEdit,
}: {
  templateId: string;
  initial: { name: string; description: string; departmentCodes: string[]; sections: Section[]; active: boolean; isSystem: boolean };
  departmentOptions: { id: string; label: string; sub: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [codes, setCodes] = useState(initial.departmentCodes);
  const [sections, setSections] = useState<Section[]>(initial.sections);
  const [active, setActive] = useState(initial.active);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const move = (i: number, d: number) =>
    setSections((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const n = [...s];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveTemplateAction({ id: templateId, name, description, departmentCodes: codes, sections, active });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Template saved");
      router.refresh();
    });
  }

  const ro = !canEdit;
  return (
    <div className="space-y-4">
      {ro && <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">You can view this template. Editing needs the Manage Templates capability.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-name">Name</Label>
            <Input id="t-name" value={name} maxLength={100} disabled={ro} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea id="t-desc" rows={2} value={description} disabled={ro} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={active} disabled={ro} onChange={(e) => setActive(e.target.checked)} />
            Active (offered when creating SOPs)
          </label>
          {initial.isSystem && <p className="text-[11px] text-muted-foreground">System template — you can edit or deactivate it, but not delete it.</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Suggested for departments</Label>
          <MultiPicker options={departmentOptions} value={codes} onChange={setCodes} placeholder="Search departments…" maxHeight="max-h-40" disabled={ro} />
          <p className="text-[11px] text-muted-foreground">New-SOP form pre-selects this template for these departments.</p>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold">Sections ({sections.length})</h2>
        {sections.map((s, i) => (
          <div key={`${s.key}-${i}`} className="flex flex-wrap items-start gap-2 rounded-xl border border-border/50 p-3">
            <span className="mt-1.5 w-5 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[14rem_1fr]">
              <Input value={s.title} maxLength={120} disabled={ro} aria-label="Section title" placeholder="Section title" onChange={(e) => setSections((all) => all.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <Input value={s.guidance} maxLength={500} disabled={ro} aria-label="Guidance for authors" placeholder="Guidance shown to authors (optional)" onChange={(e) => setSections((all) => all.map((x, j) => (j === i ? { ...x, guidance: e.target.value } : x)))} />
            </div>
            {!ro && (
              <span className="flex items-center gap-0.5">
                <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(i, 1)} disabled={i === sections.length - 1} aria-label="Move down"><ArrowDown /></Button>
                <Button type="button" variant="ghost" size="icon-xs" onClick={() => setSections((all) => all.filter((_, j) => j !== i))} disabled={sections.length === 1} aria-label="Delete section"><Trash2 /></Button>
              </span>
            )}
          </div>
        ))}
        {!ro && (
          <Button type="button" variant="outline" size="sm" onClick={() => setSections((s) => [...s, { key: "", title: "", guidance: "" }])}>
            <Plus className="size-3.5" data-icon="inline-start" />
            Add section
          </Button>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {!ro && (
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" data-icon="inline-start" />}
          Save template
        </Button>
      )}
    </div>
  );
}
