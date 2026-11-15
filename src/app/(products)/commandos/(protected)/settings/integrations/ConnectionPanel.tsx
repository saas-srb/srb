"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Loader2, Trash2, ShieldCheck, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { ConnectionField } from "@/lib/platform/connections/catalog";
import { cn } from "@/lib/utils";
import { disconnectConnectionAction, saveConnectionAction, setConnectionModeAction, testConnectionAction } from "./actions";

export interface PanelProvider {
  key: string;
  name: string;
  description: string;
  fields: ConnectionField[];
  docsUrl: string | null;
  note: string | null;
  testable: boolean;
  /** SelfRun can run this service for the company (the "Use SRB" choice is offered). */
  canSrb: boolean;
  /** SelfRun's own account for it is set up. */
  srbReady: boolean;
  mode: "srb" | "own";
  saved: { secrets: Record<string, { set: true; last4: string }>; values: Record<string, string>; lastTest: { ok: boolean; at: string; message: string } | null; updatedAt: string | null } | null;
}

/**
 * Inside the right-hand panel: first the choice "Use SRB (recommended)" or "Use my own account" (saved per connection, SRB by default), then, for
 * the own account only, the keys. Secrets are masked and never shown back. Switching to SRB keeps the saved own keys.
 */
export default function ConnectionPanel({ p, encryptionReady }: { p: PanelProvider; encryptionReady: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"srb" | "own">(p.mode);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(p.fields.filter((f) => f.kind !== "secret").map((f) => [f.key, p.saved?.values[f.key] ?? f.defaultValue ?? ""])));
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(p.saved?.lastTest ?? null);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const hasKeys = Boolean(p.saved && Object.keys(p.saved.secrets).length + Object.keys(p.saved.values).length > 0);

  const choose = (next: "srb" | "own") => {
    if (next === mode) return;
    start(async () => {
      if (next === "srb" || hasKeys) {
        const r = await setConnectionModeAction(p.key, next).catch(() => ({ ok: false, error: "Something went wrong. Please try again." }));
        if (!r.ok) { toast.error(r.error ?? "Could not change this."); return; }
        toast.success(next === "srb" ? "Using SRB's account" : "Using your own account");
        router.refresh();
      }
      setMode(next);
    });
  };

  const save = () =>
    start(async () => {
      setErrors({}); setFormError("");
      const res = await saveConnectionAction(p.key, { ...values, ...secrets }).catch(() => ({ ok: false as const, error: "Something went wrong. Please try again." }));
      if (!res.ok) { setFormError(res.error); setErrors("fieldErrors" in res && res.fieldErrors ? res.fieldErrors : {}); return; }
      toast.success(`${p.name} saved. Your own account is now used.`);
      setSecrets({});
      if (p.testable) { const t = await testConnectionAction(p.key).catch(() => null); if (t) setResult(t); }
      router.refresh();
    });
  const test = () => startTest(async () => { setResult(await testConnectionAction(p.key).catch(() => ({ ok: false, message: "The check could not run." }))); router.refresh(); });
  const disconnect = () => start(async () => { await disconnectConnectionAction(p.key); toast.success("Your own keys were removed."); setMode("srb"); router.refresh(); });

  const option = (value: "srb" | "own", title: string, text: string, disabled = false) => (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm", mode === value ? "border-primary bg-primary/5" : "border-border/60", disabled && "cursor-not-allowed opacity-60")}>
      <input type="radio" name={`mode-${p.key}`} checked={mode === value} disabled={disabled || pending} onChange={() => choose(value)} className="mt-1 accent-primary" />
      <span>
        <span className="flex items-center gap-1.5 font-medium">{value === "srb" ? <ShieldCheck className="size-4 text-primary" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}{title}</span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
    </label>
  );

  return (
    <div className="space-y-4">
      {!encryptionReady && <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">Secure storage is not available right now, so keys cannot be saved. Please try again in a few minutes, or contact support.</p>}
      <fieldset className="space-y-2" aria-label="Which account to use">
        <legend className="mb-1 text-sm font-semibold">Which account should be used?</legend>
        {option("srb", "Use SRB (recommended)", p.canSrb ? (p.srbReady ? "SelfRun's own account. Nothing to set up and nothing to pay separately for this service." : "SelfRun's own account. It is not available on this server right now, so connect your own for now.") : "SelfRun does not provide this service. Connect your own account.", !p.canSrb)}
        {option("own", "Use my own account", "Your company's own keys. Used only by your workspace.")}
        {mode === "srb" && hasKeys && <p className="text-xs text-muted-foreground">Your saved keys are kept. They are used again if you switch back.</p>}
      </fieldset>

      {mode === "own" && (
        <div className="space-y-4 rounded-2xl border border-border/60 p-4">
          {p.fields.map((f) => {
            const id = `conn-${p.key}-${f.key}`;
            const set = p.saved?.secrets[f.key];
            return (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={id}>{f.label}{f.required === false && <span className="font-normal text-muted-foreground"> (optional)</span>}</Label>
                {f.kind === "select" ? (
                  <select id={id} value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30">
                    {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.kind === "textarea" ? (
                  <Textarea id={id} rows={4} value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} placeholder={f.placeholder} />
                ) : f.kind === "secret" ? (
                  f.key === "privateKey" ? (
                    <Textarea id={id} rows={4} value={secrets[f.key] ?? ""} onChange={(e) => setSecrets((s) => ({ ...s, [f.key]: e.target.value }))} placeholder={set ? `Saved ••••${set.last4}. Paste a new key to replace it.` : f.placeholder} autoComplete="off" />
                  ) : (
                    <Input id={id} type="password" value={secrets[f.key] ?? ""} onChange={(e) => setSecrets((s) => ({ ...s, [f.key]: e.target.value }))} placeholder={set ? `Saved ••••${set.last4}. Leave blank to keep it.` : "Paste it here"} autoComplete="new-password" />
                  )
                ) : (
                  <Input id={id} value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} placeholder={f.placeholder} autoComplete="off" />
                )}
                {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
                {errors[f.key] && <p className="text-xs text-destructive" role="alert">{errors[f.key]}</p>}
              </div>
            );
          })}
          {p.note && <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{p.note}</p>}
          {p.docsUrl && <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Where do I get this? <ExternalLink className="size-3" aria-hidden /></a>}
          {formError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>}
          {result && <p role="status" className={cn("rounded-lg px-3 py-2 text-sm", result.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive")}>{result.ok ? "Works: " : "Problem: "}{result.message}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={save} disabled={pending || !encryptionReady}>{pending && <Loader2 className="size-4 animate-spin" />}{p.saved ? "Save changes" : "Save and connect"}</Button>
            {p.testable && p.saved && <Button variant="outline" onClick={test} disabled={testing || pending}>{testing && <Loader2 className="size-4 animate-spin" />}Test connection</Button>}
            {p.saved && <Button variant="ghost" onClick={disconnect} disabled={pending} className="ml-auto text-destructive hover:text-destructive"><Trash2 className="size-4" />Remove my keys</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
