"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, BadgeCheck, ExternalLink, Loader2, Plug, Search, ShieldCheck, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { GROUP_LABELS, type ConnectionField, type ConnectionGroup } from "@/lib/platform/connections/catalog";
import { cn } from "@/lib/utils";
import { disconnectConnectionAction, saveConnectionAction, testConnectionAction } from "./actions";

export interface HubProvider {
  key: string;
  name: string;
  group: ConnectionGroup;
  description: string;
  usedBy: string[];
  fields: ConnectionField[];
  docsUrl: string | null;
  note: string | null;
  testable: boolean;
  managedElsewhere: { href: string; label: string } | null;
  connected: boolean;
  /** Working through the deployment's own configuration (the platform owner's workspace only). */
  environment: boolean;
  statusNote: string | null;
  saved: { values: Record<string, string>; secrets: Record<string, { set: true; last4: string }>; lastTest: { ok: boolean; at: string; message: string } | null; updatedAt: string | null } | null;
}

const GROUP_ORDER: ConnectionGroup[] = ["email", "messaging", "push", "ai", "social", "search", "realtime", "payments", "other"];

export default function ConnectionsHub({ providers, encryptionReady }: { providers: HubProvider[]; encryptionReady: boolean }) {
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (q ? providers.filter((p) => `${p.name} ${p.description} ${p.usedBy.join(" ")}`.toLowerCase().includes(q)) : providers), [providers, q]);
  const open = providers.find((p) => p.key === openKey) ?? null;
  const connectedCount = providers.filter((p) => p.connected || p.environment).length;

  return (
    <div className="space-y-8">
      {!encryptionReady && (
        <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          Secure storage isn&apos;t set up on this server yet, so keys can&apos;t be saved. Ask your platform administrator to set <code>PLATFORM_ENCRYPTION_KEY</code>.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search integrations" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search — SMTP, Twilio, OpenAI, Instagram…" className="pl-9" />
        </div>
        <span className="text-sm text-muted-foreground">{connectedCount} of {providers.length} connected</span>
      </div>

      {GROUP_ORDER.map((group) => {
        const items = shown.filter((p) => p.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group} className="space-y-3 rounded-3xl border border-border/50 bg-muted/70 p-5 sm:p-6 dark:border-border/40 dark:bg-transparent">
            <div>
              <h2 className="text-base font-semibold">{GROUP_LABELS[group].title}</h2>
              <p className="text-sm text-muted-foreground">{GROUP_LABELS[group].description}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((p) => (
                <article key={p.key} data-integration={p.key} className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <Plug className="size-4 shrink-0 text-primary" /> <span className="truncate">{p.name}</span>
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                    </div>
                    <StatusChip p={p} />
                  </div>
                  {p.usedBy.length > 0 && <p className="text-xs text-muted-foreground">Used by: {p.usedBy.join(" · ")}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    {p.managedElsewhere ? (
                      <Link href={p.managedElsewhere.href} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                        {p.connected ? "Manage" : "Set up"} in {p.managedElsewhere.label} <ArrowRight className="size-3.5" />
                      </Link>
                    ) : (
                      <Button size="sm" variant={p.connected ? "outline" : "default"} onClick={() => setOpenKey(p.key)}>
                        {p.connected ? "Manage" : p.environment ? "Use my own" : "Connect"}
                      </Button>
                    )}
                    {p.statusNote && <span className="text-xs text-muted-foreground">{p.statusNote}</span>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
      {shown.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No integration matches “{query}”.</p>}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenKey(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {open && <ConnectionForm key={open.key} p={open} encryptionReady={encryptionReady} onClose={() => setOpenKey(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatusChip({ p }: { p: HubProvider }) {
  if (p.connected) return <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><BadgeCheck className="size-3" /> Connected</span>;
  if (p.environment) return <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"><ShieldCheck className="size-3" /> Platform keys</span>;
  return <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Not connected</span>;
}

function ConnectionForm({ p, encryptionReady, onClose }: { p: HubProvider; encryptionReady: boolean; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(p.fields.filter((f) => f.kind !== "secret").map((f) => [f.key, p.saved?.values[f.key] ?? f.defaultValue ?? ""])));
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(p.saved?.lastTest ?? null);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();

  const payload = () => ({ ...values, ...secrets });

  const save = () =>
    start(async () => {
      setErrors({});
      setFormError("");
      const res = await saveConnectionAction(p.key, payload()).catch(() => ({ ok: false as const, error: "Something went wrong. Please try again." }));
      if (!res.ok) {
        setFormError(res.error);
        setErrors("fieldErrors" in res && res.fieldErrors ? res.fieldErrors : {});
        return;
      }
      toast.success(`${p.name} saved`);
      setSecrets({});
      if (p.testable) {
        const t = await testConnectionAction(p.key).catch(() => null);
        if (t) setResult(t);
        else onClose();
      } else onClose();
    });

  const test = () => startTest(async () => setResult(await testConnectionAction(p.key).catch(() => ({ ok: false, message: "The check couldn't run." }))));

  const disconnect = () =>
    start(async () => {
      await disconnectConnectionAction(p.key);
      toast.success(`${p.name} disconnected`);
      onClose();
    });

  return (
    <>
      <SheetHeader>
        <SheetTitle>{p.name}</SheetTitle>
        <SheetDescription>{p.description}</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-6">
        {p.environment && !p.connected && <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">This workspace is currently running on the platform&apos;s own keys. Save yours below to use your own account instead.</p>}
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
                  <Textarea id={id} rows={4} value={secrets[f.key] ?? ""} onChange={(e) => setSecrets((s) => ({ ...s, [f.key]: e.target.value }))} placeholder={set ? `Saved ••••${set.last4} — paste a new key to replace it` : "-----BEGIN PRIVATE KEY-----"} autoComplete="off" spellCheck={false} className="font-mono text-xs" />
                ) : (
                  <Input id={id} type="password" value={secrets[f.key] ?? ""} onChange={(e) => setSecrets((s) => ({ ...s, [f.key]: e.target.value }))} placeholder={set ? `Saved ••••${set.last4} — leave blank to keep` : "Paste it here"} autoComplete="new-password" />
                )
              ) : (
                <Input id={id} value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} placeholder={f.placeholder} autoComplete="off" />
              )}
              {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
              {errors[f.key] && <p className="text-xs text-destructive">{errors[f.key]}</p>}
            </div>
          );
        })}
        {p.note && <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{p.note}</p>}
        {p.docsUrl && (
          <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Where do I find these? <ExternalLink className="size-3" />
          </a>
        )}
        {formError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>}
        {result && (
          <p role="status" className={cn("rounded-lg px-3 py-2 text-sm", result.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive")}>
            {result.ok ? "✓ " : "✕ "}{result.message}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button onClick={save} disabled={pending || !encryptionReady}>{pending && <Loader2 className="size-4 animate-spin" />} {p.saved ? "Save changes" : "Save & connect"}</Button>
          {p.testable && p.saved && (
            <Button variant="outline" onClick={test} disabled={testing || pending}>{testing && <Loader2 className="size-4 animate-spin" />} Test connection</Button>
          )}
          {p.saved && (
            <Button variant="ghost" onClick={disconnect} disabled={pending} className="ml-auto text-destructive hover:text-destructive"><Trash2 className="size-4" /> Disconnect</Button>
          )}
        </div>
      </div>
    </>
  );
}
