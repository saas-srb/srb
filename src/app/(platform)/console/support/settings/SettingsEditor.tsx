"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveConfigAction } from "../actions";
import type { OptionDef, RequestTypeDef, StatusDef, StatusState, SupportConfig } from "@/lib/support/types";

const INPUT = "rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

function OptionList({ title, hint, rows, onChange, disabled }: { title: string; hint?: string; rows: OptionDef[]; onChange: (r: OptionDef[]) => void; disabled: boolean }) {
  return (
    <section className="rounded-2xl border border-border/50 bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-2 space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={r.label} disabled={disabled} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label" className={`${INPUT} flex-1`} />
            <code className="hidden w-28 truncate text-[11px] text-muted-foreground sm:block">{r.key}</code>
            <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={r.active} disabled={disabled} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} /> Active</label>
            {!disabled && <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove" className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>}
          </div>
        ))}
      </div>
      {!disabled && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => onChange([...rows, { key: `new-${rows.length + 1}`, label: "", active: true }])}><Plus className="size-3.5" /> Add</Button>}
    </section>
  );
}

/** New rows get their key from the label once, at save time (existing keys never change, so old requests keep their meaning). */
function finalize(cfg: SupportConfig): SupportConfig {
  const uniq = (items: { key: string; label: string }[], make: (label: string, n: number) => string, isNew: (k: string) => boolean) => {
    const used = new Set(items.filter((i) => !isNew(i.key)).map((i) => i.key));
    return items.map((it, n) => {
      if (!isNew(it.key)) return it;
      let key = make(it.label, n) || `item-${n + 1}`;
      for (let k = 2; used.has(key); k++) key = `${make(it.label, n) || "item"}-${k}`;
      used.add(key);
      return { ...it, key };
    });
  };
  const dash = (l: string) => slug(l);
  const camel = (l: string, n: number) => slug(l).replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase()) || `field${n + 1}`;
  const isNew = (k: string) => k.startsWith("new-");
  return {
    ...cfg,
    types: (uniq(cfg.types, dash, isNew) as RequestTypeDef[]).map((t) => ({ ...t, fields: uniq(t.fields, camel, (k) => k.startsWith("field")) as RequestTypeDef["fields"] })),
    categories: uniq(cfg.categories, dash, isNew) as OptionDef[],
    priorities: uniq(cfg.priorities, dash, isNew) as OptionDef[],
    severities: uniq(cfg.severities, dash, isNew) as OptionDef[],
    teams: uniq(cfg.teams, dash, isNew) as OptionDef[],
    statuses: uniq(cfg.statuses, dash, isNew) as StatusDef[],
  };
}

export default function SettingsEditor({ initial, canManage }: { initial: SupportConfig; canManage: boolean }) {
  const [cfg, setCfg] = useState(initial);
  const [pending, start] = useTransition();
  const disabled = !canManage;
  const set = <K extends keyof SupportConfig>(k: K, v: SupportConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const setType = (i: number, patch: Partial<RequestTypeDef>) => set("types", cfg.types.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const setStatus = (i: number, patch: Partial<StatusDef>) => set("statuses", cfg.statuses.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  function save() {
    start(async () => {
      const next = finalize(cfg);
      const res = await saveConfigAction(next);
      if (!res.ok) { toast.error(res.error); return; }
      setCfg(next);
      toast.success("Support settings saved");
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border/50 bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Request types</h2>
        <p className="mb-3 text-xs text-muted-foreground">Each type has its own extra form fields. Bug-type requests also ask for severity and an error message.</p>
        <div className="space-y-3">
          {cfg.types.map((t, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-border/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input value={t.label} disabled={disabled} onChange={(e) => setType(i, { label: e.target.value })} placeholder="Label" className={`${INPUT} flex-1`} />
                <input value={t.description ?? ""} disabled={disabled} onChange={(e) => setType(i, { description: e.target.value })} placeholder="Short description" className={`${INPUT} flex-[2]`} />
                <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={t.kind === "bug"} disabled={disabled} onChange={(e) => setType(i, { kind: e.target.checked ? "bug" : "general" })} /> Bug-like</label>
                <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={t.active} disabled={disabled} onChange={(e) => setType(i, { active: e.target.checked })} /> Active</label>
                {!disabled && <button type="button" onClick={() => set("types", cfg.types.filter((_, j) => j !== i))} aria-label="Remove type" className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>}
              </div>
              <div className="space-y-1.5 pl-1">
                {t.fields.map((f, k) => (
                  <div key={k} className="flex flex-wrap items-center gap-2">
                    <input value={f.label} disabled={disabled} onChange={(e) => setType(i, { fields: t.fields.map((x, m) => (m === k ? { ...x, label: e.target.value } : x)) })} placeholder="Field label" className={`${INPUT} flex-1`} />
                    <select value={f.type} disabled={disabled} onChange={(e) => setType(i, { fields: t.fields.map((x, m) => (m === k ? { ...x, type: e.target.value as typeof f.type } : x)) })} className={INPUT}>
                      <option value="text">Short text</option><option value="textarea">Long text</option><option value="select">Choice</option>
                    </select>
                    {f.type === "select" && <input value={(f.options ?? []).join(", ")} disabled={disabled} onChange={(e) => setType(i, { fields: t.fields.map((x, m) => (m === k ? { ...x, options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) } : x)) })} placeholder="Option 1, Option 2" className={`${INPUT} flex-1`} />}
                    <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={f.required === true} disabled={disabled} onChange={(e) => setType(i, { fields: t.fields.map((x, m) => (m === k ? { ...x, required: e.target.checked } : x)) })} /> Required</label>
                    {!disabled && <button type="button" onClick={() => setType(i, { fields: t.fields.filter((_, m) => m !== k) })} aria-label="Remove field" className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>}
                  </div>
                ))}
                {!disabled && <button type="button" onClick={() => setType(i, { fields: [...t.fields, { key: `field${t.fields.length + 1}`, label: "", type: "text" }] })} className="text-xs font-medium text-primary hover:underline">+ Add form field</button>}
              </div>
            </div>
          ))}
        </div>
        {!disabled && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => set("types", [...cfg.types, { key: `new-${cfg.types.length + 1}`, label: "", kind: "general", active: true, fields: [] }])}><Plus className="size-3.5" /> Add type</Button>}
      </section>

      <section className="rounded-2xl border border-border/50 bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Status workflow</h2>
        <p className="mb-3 text-xs text-muted-foreground">Order is the order shown. “State” tells the system what a status means: a company reply reopens Waiting and Resolved requests, and only Closed blocks replies. Mark one status as the starting status for new requests.</p>
        <div className="space-y-1.5">
          {cfg.statuses.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input value={s.label} disabled={disabled} onChange={(e) => setStatus(i, { label: e.target.value })} placeholder="Label" className={`${INPUT} flex-1`} />
              <select value={s.state} disabled={disabled} onChange={(e) => setStatus(i, { state: e.target.value as StatusState })} className={INPUT}>
                <option value="open">Open</option><option value="waiting">Waiting for user</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="radio" name="initial" checked={s.initial === true} disabled={disabled} onChange={() => set("statuses", cfg.statuses.map((x, j) => ({ ...x, initial: j === i })))} /> Starts here</label>
              {!disabled && (
                <>
                  <button type="button" disabled={i === 0} onClick={() => { const a = [...cfg.statuses]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set("statuses", a); }} className="text-xs text-muted-foreground disabled:opacity-30">↑</button>
                  <button type="button" disabled={i === cfg.statuses.length - 1} onClick={() => { const a = [...cfg.statuses]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; set("statuses", a); }} className="text-xs text-muted-foreground disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => set("statuses", cfg.statuses.filter((_, j) => j !== i))} aria-label="Remove status" className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                </>
              )}
            </div>
          ))}
        </div>
        {!disabled && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => set("statuses", [...cfg.statuses, { key: `new-${cfg.statuses.length + 1}`, label: "", state: "open" }])}><Plus className="size-3.5" /> Add status</Button>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <OptionList title="Priorities" rows={cfg.priorities} onChange={(r) => set("priorities", r)} disabled={disabled} hint="The first active priority is the default for new requests." />
        <OptionList title="Severities" rows={cfg.severities} onChange={(r) => set("severities", r)} disabled={disabled} hint="Asked for on bug-like request types." />
        <OptionList title="Categories" rows={cfg.categories} onChange={(r) => set("categories", r)} disabled={disabled} />
        <OptionList title="Teams" rows={cfg.teams} onChange={(r) => set("teams", r)} disabled={disabled} hint="Internal routing targets." />
      </div>

      {canManage && <Button onClick={save} disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Save settings</Button>}
    </div>
  );
}
