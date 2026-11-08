"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, CheckCircle2, CircleDashed, Copy, Loader2, RefreshCw, Trash2, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";
import type { SenderResult, SenderView } from "@/lib/platform/email/sender";

interface Actions {
  save: (input: { domain: string; localPart: string; fromName: string; replyTo: string }) => Promise<SenderResult<SenderView>>;
  check: () => Promise<SenderResult<SenderView>>;
  remove: () => Promise<SenderResult>;
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-1">
      <code className="min-w-0 flex-1 break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{value}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked: the value is still selectable */
          }
        }}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </Button>
    </div>
  );
}

const STATE: Record<string, { label: string; cls: string; icon: typeof Check }> = {
  verified: { label: "Verified", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", icon: CheckCircle2 },
  pending: { label: "Waiting for DNS", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400", icon: CircleDashed },
  not_started: { label: "Waiting for DNS", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400", icon: CircleDashed },
  temporary_failure: { label: "Checking again", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400", icon: CircleDashed },
  failed: { label: "Not verified", cls: "bg-destructive/10 text-destructive", icon: XCircle },
};
function Pill({ state }: { state: string }) {
  const s = STATE[state] ?? STATE.pending;
  const Icon = s.icon;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", s.cls)}><Icon className="size-3" /> {s.label}</span>;
}

export default function EmailSenderManager({ initial, defaultName, suggested, platformFrom, actions }: { initial: SenderView | null; defaultName: string; suggested: { domain: string; host: string } | null; platformFrom: string; actions: Actions }) {
  const [sender, setSender] = useState<SenderView | null>(initial);
  const [domain, setDomain] = useState(initial?.domain ?? suggested?.domain ?? "");
  const [localPart, setLocalPart] = useState(initial?.localPart ?? "hello");
  const [fromName, setFromName] = useState(initial?.fromName ?? defaultName);
  const [replyTo, setReplyTo] = useState(initial?.replyTo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<SenderResult<SenderView>>, done?: (s: SenderView) => string | null) =>
    start(async () => {
      setError(null);
      setNote(null);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      setSender(r.value);
      setNote(done?.(r.value) ?? null);
    });

  const save = () => run(() => actions.save({ domain, localPart, fromName, replyTo }), () => "Saved. Now publish the records below at your DNS provider, then press Check.");
  const check = () =>
    run(actions.check, (s) => (s.status === "verified" ? "Verified. Your emails now go out from this address." : "Not verified yet. DNS changes can take from a few minutes to an hour; check again later."));
  const remove = () =>
    start(async () => {
      if (!window.confirm("Stop sending from your own address? Emails go back to our sender.")) return;
      setError(null);
      setNote(null);
      const r = await actions.remove();
      if (!r.ok) return setError(r.error);
      setSender(null);
      setDomain("");
    });

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-background/60 p-4 text-sm">
        <p className="font-medium">Right now your emails are sent from</p>
        <p className="mt-1 font-mono text-xs">{sender?.status === "verified" ? sender.from : platformFrom}</p>
        {sender?.status !== "verified" && <p className="mt-1 text-xs text-muted-foreground">That is our address, with replies going to your reply-to address if you set one. It changes as soon as your own domain is verified.</p>}
      </div>

      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="es-domain">Your domain</Label>
          <Input id="es-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourbusiness.com" autoComplete="off" required />
          {!sender && suggested && domain === suggested.domain ? (
            <p className="text-xs text-muted-foreground">Filled in from your connected domain <strong>{suggested.host}</strong>. Change it if you want to send from a different domain.</p>
          ) : (
            <p className="text-xs text-muted-foreground">A domain your business owns, not Gmail, Outlook or similar. You will need access to its DNS settings.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="es-local">Address before @</Label>
          <div className="flex items-center gap-1.5">
            <Input id="es-local" value={localPart} onChange={(e) => setLocalPart(e.target.value)} placeholder="hello" autoComplete="off" required />
            <span className="whitespace-nowrap text-sm text-muted-foreground">@{domain.trim() || "yourbusiness.com"}</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="es-name">Name people see</Label>
          <Input id="es-name" value={fromName} onChange={(e) => setFromName(e.target.value)} maxLength={80} required />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="es-reply">Reply-to address (optional)</Label>
          <Input id="es-reply" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="support@yourbusiness.com" autoComplete="off" />
          <p className="text-xs text-muted-foreground">Where replies go. Leave empty to receive them at the sender address.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : sender ? "Save changes" : "Connect domain"}</Button>
          {sender && (
            <Button type="button" variant="outline" onClick={remove} disabled={pending}>
              <Trash2 className="size-4" /> Remove
            </Button>
          )}
        </div>
      </form>

      {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}</p>}
      {note && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{note}</p>}

      {sender && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{sender.domain}</h3>
              <Pill state={sender.status} />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={check} disabled={pending}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Check now
            </Button>
          </div>
          {sender.status === "failed" && <p className="text-sm text-muted-foreground">We could not verify these records. Make sure each one is published exactly as shown, then press Check now. Until then your emails go out from our sender.</p>}
          {sender.checkedAt && <p className="text-xs text-muted-foreground" suppressHydrationWarning>Last checked {formatDateTime(sender.checkedAt)}</p>}
          <p className="text-sm font-medium">{sender.status === "verified" ? "Keep these records in place" : "Add these records at your DNS provider"}</p>
          <ul className="space-y-2" aria-label={`DNS records for ${sender.domain}`}>
            {sender.records.map((r) => (
              <li key={`${r.type}:${r.name}:${r.value}`} className="rounded-lg border bg-background/60 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{r.kind === "SPF" ? "Lets our email service send for your domain" : r.kind === "DKIM" ? "Signs your emails so they are trusted" : r.kind}</span>
                  <Pill state={r.status} />
                </div>
                <dl className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="font-medium text-muted-foreground">Type</dt>
                  <dd className="font-mono font-semibold">{r.type}{r.priority != null ? ` (priority ${r.priority})` : ""}</dd>
                  <dt className="font-medium text-muted-foreground">Name</dt>
                  <dd className="min-w-0"><CopyValue value={r.name} label={`${r.type} record name`} /></dd>
                  <dt className="font-medium text-muted-foreground">Value</dt>
                  <dd className="min-w-0"><CopyValue value={r.value} label={`${r.type} record value`} /></dd>
                </dl>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">If your DNS provider adds your domain to names automatically, enter only the part before it.</p>
        </div>
      )}
    </div>
  );
}
