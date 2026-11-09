"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InputField } from "@/lib/products/playbook-ai/catalogue/types";
import { PARTY_FIELDS } from "@/lib/products/playbook-ai/catalogue/variables";
import { visibleInputs, type RawInputs, type RawInputValue } from "@/lib/products/playbook-ai/tpl/inputs";
import { createFromTemplateAction, searchRecordsAction } from "@/app/(products)/playbook-ai/(protected)/documents/new/actions";

const fieldCls = "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
type Pick = { id: string; label: string; detail: string };

function RecordPicker({ field, value, onPick, error }: { field: InputField; value: string | undefined; onPick: (id: string | undefined, label?: string) => void; error?: string }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Pick[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const kind = field.picker as "employee" | "candidate" | "client" | "vendor" | "project";
    const timer = setTimeout(async () => {
      const r = await searchRecordsAction(kind, q).catch(() => ({ ok: false as const, error: "The search failed." }));
      if (r.ok) { setItems(r.items); setMsg(null); } else { setItems([]); setMsg(r.error); }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, field.picker]);
  return (
    <div className="space-y-1.5">
      {value && <p className="text-sm">Selected: <strong>{chosen ?? value}</strong> <button type="button" className="ml-2 text-xs underline" onClick={() => { onPick(undefined); setChosen(null); }}>change</button></p>}
      {!value && (
        <>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${field.picker}s…`} aria-label={`Search ${field.picker}`} />
          {msg ? <p className="text-xs text-destructive">{msg}</p> : items.length === 0 ? <p className="text-xs text-muted-foreground">No {field.picker} found.</p> : (
            <ul className="max-h-48 overflow-auto rounded-lg border border-border/50">{items.map((i) => <li key={i.id}><button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { setChosen(i.label); onPick(i.id, i.label); }}>{i.label}<span className="block text-xs text-muted-foreground">{i.detail}</span></button></li>)}</ul>
          )}
        </>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** The form of a template's inputs. The server checks everything again; this form only helps people get it right the first time. */
export default function NewDocumentForm({ typeId, templateId, inputs, defaults, templateName }: { typeId: string; templateId?: string; inputs: InputField[]; defaults: RawInputs; templateName: string }) {
  const router = useRouter();
  const [values, setValues] = useState<RawInputs>(defaults);
  const [title, setTitle] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (key: string, v: RawInputValue) => setValues((s) => ({ ...s, [key]: v }));
  const shown = visibleInputs(inputs, values);

  const submit = () => start(async () => {
    setErrors({}); setMessage(null);
    const r = await createFromTemplateAction({ typeId, templateId, title: title.trim() || undefined, inputs: values });
    if (!r.ok) { setErrors(r.errors ?? {}); setMessage(r.message); return; }
    toast.success(r.pendingAi.length ? "Document created. The AI-written sections are waiting to be drafted." : "Document created");
    router.push(`/playbook-ai/documents/${r.documentId}`);
  });

  return (
    <form className="space-y-4 rounded-2xl border border-border/50 bg-card p-5" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      <div className="space-y-1.5"><Label htmlFor="doc-title">Document title (optional)</Label><Input id="doc-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={templateName} /></div>
      {shown.map((f) => {
        const err = errors[f.key];
        const id = `f-${f.key}`;
        const v = values[f.key];
        return (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={id}>{f.label}{f.required ? " *" : ""}</Label>
            {f.type === "text" && <Input id={id} value={(v as string) ?? ""} maxLength={f.maxLength ?? 300} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} aria-invalid={!!err} />}
            {f.type === "longtext" && <textarea id={id} className="min-h-24 w-full rounded-lg border border-input bg-background p-2 text-sm" value={(v as string) ?? ""} maxLength={f.maxLength ?? 5000} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} aria-invalid={!!err} />}
            {(f.type === "number" || f.type === "money") && <Input id={id} type="number" inputMode="decimal" step="any" min={f.min} max={f.max} value={(v as string | number | undefined) ?? ""} placeholder={f.type === "money" ? "Amount in rupees" : f.placeholder} onChange={(e) => set(f.key, e.target.value)} aria-invalid={!!err} />}
            {f.type === "date" && <Input id={id} type="date" value={(v as string) ?? ""} onChange={(e) => set(f.key, e.target.value)} aria-invalid={!!err} />}
            {f.type === "yesno" && <select id={id} className={fieldCls} value={(v as string) ?? ""} onChange={(e) => set(f.key, e.target.value)}><option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option></select>}
            {f.type === "select" && <select id={id} className={fieldCls} value={(v as string) ?? ""} onChange={(e) => set(f.key, e.target.value)}><option value="">Choose…</option>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
            {f.type === "multiselect" && <div className="flex flex-wrap gap-3">{f.options?.map((o) => { const cur = Array.isArray(v) ? (v as string[]) : []; return <label key={o.value} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={cur.includes(o.value)} onChange={(e) => set(f.key, e.target.checked ? [...cur, o.value] : cur.filter((x) => x !== o.value))} />{o.label}</label>; })}</div>}
            {f.type === "person" && f.picker !== "party" && <RecordPicker field={f} value={v as string | undefined} error={err} onPick={(pid) => set(f.key, pid)} />}
            {f.type === "person" && f.picker === "party" && (
              <div className="grid gap-2 md:grid-cols-2">{PARTY_FIELDS.map((pf) => { const o = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, string>; return <Input key={pf} aria-label={`${f.label} ${pf.replace("_", " ")}`} placeholder={pf.replace("_", " ")} value={o[pf] ?? ""} onChange={(e) => set(f.key, { ...o, [pf]: e.target.value })} />; })}</div>
            )}
            {f.type === "rows" && (() => {
              const rows = (Array.isArray(v) ? v : []) as Array<Record<string, string>>;
              const cols = f.columns ?? [];
              return (
                <div className="space-y-2">
                  {rows.map((row, ri) => (
                    <div key={ri} className="flex flex-wrap items-end gap-2">
                      {cols.map((c) => <Input key={c.key} aria-label={`${f.label} row ${ri + 1} ${c.label}`} placeholder={c.label} type={c.type === "date" ? "date" : c.type === "text" ? "text" : "number"} step="any" className="w-40" value={row[c.key] ?? ""} onChange={(e) => set(f.key, rows.map((x, xi) => (xi === ri ? { ...x, [c.key]: e.target.value } : x)))} />)}
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove row ${ri + 1}`} onClick={() => set(f.key, rows.filter((_, xi) => xi !== ri))}><Trash2 className="size-4" /></Button>
                    </div>
                  ))}
                  {rows.length < (f.maxRows ?? 200) && <Button type="button" variant="outline" size="sm" onClick={() => set(f.key, [...rows, {}])}><Plus className="mr-1 size-4" />Add a row</Button>}
                </div>
              );
            })()}
            {f.help && <p className="text-[11px] text-muted-foreground">{f.help}</p>}
            {err && f.type !== "person" && <p role="alert" className="text-xs text-destructive">{err}</p>}
          </div>
        );
      })}
      {message && !Object.keys(errors).length && <p role="alert" className="text-sm text-destructive">{message}</p>}
      {Object.keys(errors).length > 0 && <p role="alert" className="text-sm text-destructive">Check the fields marked above.</p>}
      <Button type="submit" disabled={pending}>{pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}Create document</Button>
    </form>
  );
}
