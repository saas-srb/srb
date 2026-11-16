"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DRAWER_HEADER_CLASS, DRAWER_SHELL_CLASS } from "@/components/ui/drawer-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { bulkAccessAction, deleteTemplateAction, listTemplatesAction, saveTemplateAction } from "./actions";
import type { AccessTemplate, BulkResult } from "@/lib/products/commandos/access-bundles";

export interface BulkTarget { id: string; name: string }
export interface PersonOption { id: string; name: string; isDirector: boolean }

const select = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

/**
 * Give several people access at once. There are no roles to pick: copy what another person has, or apply a saved template (a plain bundle of features,
 * not a role: applying it writes the features once and later changes to the template change nobody).
 */
export default function BulkAccessDialog({ targets, people, onClose, onDone }: { targets: BulkTarget[] | null; people: PersonOption[]; onClose: () => void; onDone: () => void }) {
  const open = targets !== null && targets.length > 0;
  const [tab, setTab] = useState<"copy" | "template">("copy");
  const [mode, setMode] = useState<"replace" | "add">("add");
  const [from, setFrom] = useState("");
  const [templates, setTemplates] = useState<AccessTemplate[]>([]);
  const [tplId, setTplId] = useState("");
  const [name, setName] = useState("");
  const [result, setResult] = useState<BulkResult | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { if (open) { setResult(null); void listTemplatesAction().then((t) => { setTemplates(t); setTplId(t[0]?.id ?? ""); }).catch(() => {}); } }, [open]);
  const sources = people.filter((p) => !p.isDirector);

  const apply = () => start(async () => {
    const source = tab === "copy" ? ({ kind: "person", userId: from } as const) : ({ kind: "template", templateId: tplId } as const);
    const r = await bulkAccessAction(targets!.map((t) => t.id), source, mode).catch(() => null);
    if (!r) { toast.error("Something went wrong. Please try again."); return; }
    setResult(r);
    if (r.changed > 0) { toast.success(`Access updated for ${r.changed} ${r.changed === 1 ? "person" : "people"}`); onDone(); }
  });
  const nameOf = (id: string) => targets?.find((t) => t.id === id)?.name ?? "";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className={cn(DRAWER_SHELL_CLASS, "overflow-y-auto")} aria-label="Give access to selected people">
        <SheetHeader className={DRAWER_HEADER_CLASS}>
          <SheetTitle className="text-base">Give access to {targets?.length ?? 0} {targets?.length === 1 ? "person" : "people"}</SheetTitle>
          <SheetDescription className="text-xs">Directors and people who cannot sign in are skipped. Each person is saved by the same rules as editing them one by one.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 p-4 sm:p-5">
          <div role="tablist" className="flex gap-2">
            {([["copy", "Copy from a person"], ["template", "Use a template"]] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={cn("h-9 rounded-lg border px-3 text-sm font-medium", tab === k ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>{label}</button>
            ))}
          </div>

          {tab === "copy" ? (
            <div className="space-y-2">
              <Label htmlFor="bulk-from">Copy the access of</Label>
              <select id="bulk-from" className={select} value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">Choose a person…</option>
                {sources.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="bulk-tpl">Template</Label>
              {templates.length === 0 ? <p className="text-sm text-muted-foreground">No templates yet. Save one below from a person who has the access you want.</p> : (
                <ul className="space-y-1.5">
                  {templates.map((t) => (
                    <li key={t.id} className={cn("flex items-center gap-2 rounded-lg border p-2 text-sm", tplId === t.id ? "border-primary bg-primary/5" : "border-border")}>
                      <input type="radio" name="tpl" checked={tplId === t.id} onChange={() => setTplId(t.id)} aria-label={t.name} className="accent-primary" />
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{t.name}</span><span className="block text-xs text-muted-foreground">{t.featureCount} features{t.description ? ` · ${t.description}` : ""}</span></span>
                      <button type="button" aria-label={`Delete ${t.name}`} className="text-muted-foreground hover:text-destructive" onClick={() => start(async () => { const r = await deleteTemplateAction(t.id); if (r.ok) { setTemplates((x) => x.filter((y) => y.id !== t.id)); setTplId((cur) => (cur === t.id ? "" : cur)); toast.success("Template deleted. Nobody lost access."); } else toast.error(r.error ?? "Could not delete."); })}><Trash2 className="size-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                <p className="text-xs font-medium">Save a template from a person</p>
                <select aria-label="Person to take the access from" className={select} value={from} onChange={(e) => setFrom(e.target.value)}><option value="">Choose a person…</option>{sources.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <div className="flex gap-2">
                  <Input aria-label="Template name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" maxLength={60} />
                  <Button type="button" variant="outline" disabled={pending || !from || name.trim().length < 2} onClick={() => start(async () => {
                    const { loadAccessOfPersonAction } = await import("./template-actions");
                    const access = await loadAccessOfPersonAction(from).catch(() => null);
                    if (!access) { toast.error("That person has no access to save."); return; }
                    const r = await saveTemplateAction({ name, access });
                    if (r.ok) { setTemplates((x) => [...x, r.template].sort((a, b) => a.name.localeCompare(b.name))); setTplId(r.template.id); setName(""); toast.success("Template saved"); } else toast.error(r.error);
                  })}><Copy className="size-4" />Save</Button>
                </div>
              </div>
            </div>
          )}

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">What happens to what they already have?</legend>
            {([["add", "Add to it", "Keep their access and add these features."], ["replace", "Replace it", "They end up with exactly this access."]] as const).map(([k, t, d]) => (
              <label key={k} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm", mode === k ? "border-primary bg-primary/5" : "border-border")}>
                <input type="radio" name="bulk-mode" checked={mode === k} onChange={() => setMode(k)} className="mt-1 accent-primary" /><span><span className="block font-medium">{t}</span><span className="text-xs text-muted-foreground">{d}</span></span>
              </label>
            ))}
          </fieldset>

          {result && (
            <div role="status" className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{result.changed} changed, {result.skipped} skipped, {result.failed} could not be saved.</p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">{result.rows.filter((r) => r.error).slice(0, 8).map((r, i) => <li key={i}>{nameOf(r.id) || "Someone"}: {r.error}</li>)}</ul>
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" disabled={pending || (tab === "copy" ? !from : !tplId)} onClick={apply}>{pending && <Loader2 className="size-4 animate-spin" />}Apply</Button>
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
