"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describeValue, type SettingDef, type SettingsDoc, type TaxRateValue, type Values } from "@/lib/platform/defaults/product/model";
import { saveProductDefaultsAction } from "./actions";

const select = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60";

/** A value as the input holds it. */
const draftOf = (s: SettingDef, v: unknown): unknown => {
  if (s.type === "days") return Array.isArray(v) ? v.map(String) : [];
  if (s.type === "list") return Array.isArray(v) ? v.join("\n") : "";
  if (s.type === "rates") return Array.isArray(v) ? (v as TaxRateValue[]).map((r) => `${r.name} | ${r.ratePercent}`).join("\n") : "";
  return String(v ?? "");
};

function Field({ id, s, value, onChange, disabled }: { id: string; s: SettingDef; value: unknown; onChange: (v: unknown) => void; disabled: boolean }) {
  if (s.type === "boolean" || s.type === "select") {
    const options = s.type === "boolean" ? [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] : (s.options ?? []);
    return <select id={id} className={select} value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  }
  if (s.type === "days") {
    const on = value as string[];
    return (
      <div id={id} role="group" aria-label={s.label} className="flex flex-wrap gap-x-3 gap-y-1">
        {s.options?.map((o) => (
          <label key={o.value} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" className="size-4 accent-primary" disabled={disabled} checked={on.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...on, o.value] : on.filter((x) => x !== o.value))} />
            {o.label}
          </label>
        ))}
      </div>
    );
  }
  if (s.type === "list" || s.type === "rates") return <Textarea id={id} rows={4} value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  return <Input id={id} type={s.type === "time" ? "time" : s.type === "text" ? "text" : "number"} step={s.type === "number" ? "any" : undefined} min={s.min} max={s.type === "text" ? undefined : s.max} value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
}

/** One product's platform defaults. A setting that is not ticked has no platform default: companies get the built-in value. */
export default function ProductDefaultsForm({ product, docs, values, usage, canManage }: { product: string; docs: SettingsDoc[]; values: Values; usage: Record<string, { usingDefault: number; usingOwn: number }>; canManage: boolean }) {
  const router = useRouter();
  const all = docs.flatMap((d) => d.settings);
  const [chosen, setChosen] = useState<Record<string, boolean>>(() => Object.fromEntries(all.map((s) => [s.key, s.key in values])));
  const [drafts, setDrafts] = useState<Record<string, unknown>>(() => Object.fromEntries(all.map((s) => [s.key, draftOf(s, s.key in values ? values[s.key] : s.builtIn)])));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setMessage(null);
      const input = Object.fromEntries(all.filter((s) => chosen[s.key]).map((s) => [s.key, drafts[s.key]]));
      const res = await saveProductDefaultsAction(product, input).catch(() => ({ ok: false as const, error: "Something went wrong. Please try again." }));
      setMessage(res.ok ? { ok: true, text: res.changed.length ? "Saved. Companies on the default follow it within a few seconds." : "Nothing changed." } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm"><strong>Before you save:</strong> a change reaches only companies that have not stored their own value. A company&apos;s own value is never changed.</p>
      {docs.map((d) => (
        <fieldset key={d.collection} className="space-y-3">
          <legend className="text-sm font-semibold">{d.title}</legend>
          {d.settings.map((s) => {
            const id = `default-${s.key}`;
            const u = usage[s.key];
            return (
              <div key={s.key} data-default-setting={s.key} className="space-y-1.5 rounded-xl border border-border/60 p-3">
                <label htmlFor={id} className="block text-sm font-medium">{s.label}</label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" className="size-4 accent-primary" disabled={!canManage || pending} checked={chosen[s.key]} onChange={(e) => { setChosen((c) => ({ ...c, [s.key]: e.target.checked })); if (!e.target.checked) setDrafts((x) => ({ ...x, [s.key]: draftOf(s, s.builtIn) })); }} />
                  Set a platform default (otherwise built-in: {describeValue(s, s.builtIn)})
                </label>
                <Field id={id} s={s} value={drafts[s.key]} disabled={!canManage || !chosen[s.key] || pending} onChange={(v) => setDrafts((x) => ({ ...x, [s.key]: v }))} />
                {s.help && <p className="text-xs text-muted-foreground">{s.help}</p>}
                {u && <p className="text-xs text-muted-foreground">{u.usingDefault} {u.usingDefault === 1 ? "company uses" : "companies use"} this default, {u.usingOwn} {u.usingOwn === 1 ? "uses" : "use"} their own</p>}
              </div>
            );
          })}
        </fieldset>
      ))}
      {message && <p role="status" className={message.ok ? "text-sm text-emerald-700 dark:text-emerald-400" : "text-sm text-destructive"}>{message.text}</p>}
      {canManage ? (
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />}Save defaults</Button>
      ) : (
        <p className="text-sm text-muted-foreground">You can see these defaults; changing them needs the &quot;Manage product defaults&quot; permission.</p>
      )}
    </form>
  );
}
