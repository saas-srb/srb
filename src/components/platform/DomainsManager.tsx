"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, CheckCircle2, CircleDashed, Copy, Globe, Loader2, Lock, Plus, RefreshCw, Star, Trash2, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";
import type { CompanyDomainView, DomainActionResult, RecordState } from "@/lib/platform/domains/types";
import DomainsGuide from "@/components/platform/DomainsGuide";

export interface DomainsManagerActions {
  add: (host: string) => Promise<DomainActionResult>;
  verify: (host: string) => Promise<DomainActionResult>;
  makePrimary: (host: string) => Promise<DomainActionResult>;
  remove: (host: string) => Promise<DomainActionResult>;
}

type Op = "verify" | "primary" | "remove";

function Pill({ tone, children }: { tone: "green" | "amber" | "red" | "blue" | "muted"; children: React.ReactNode }) {
  const tones = {
    green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    red: "bg-destructive/10 text-destructive",
    blue: "bg-primary/10 text-primary",
    muted: "bg-muted text-muted-foreground",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone])}>{children}</span>;
}

const RECORD_STATE: Record<RecordState, { label: string; tone: "green" | "amber" | "red" | "muted"; icon: typeof Check }> = {
  ok: { label: "Found", tone: "green", icon: CheckCircle2 },
  missing: { label: "Not found yet", tone: "amber", icon: CircleDashed },
  mismatch: { label: "Wrong value", tone: "red", icon: XCircle },
  unknown: { label: "Not checked yet", tone: "muted", icon: CircleDashed },
};

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
            // Clipboard blocked (insecure origin, permissions) — the value is still selectable.
          }
        }}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </Button>
    </div>
  );
}

function DnsRecords({ domain }: { domain: CompanyDomainView }) {
  if (domain.records.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{domain.status === "pending" ? "Add these records at your DNS provider" : "Finish connecting: add this record at your DNS provider"}</p>
      <ul className="space-y-2" aria-label={`DNS records for ${domain.host}`}>
        {domain.records.map((r) => {
          const state = RECORD_STATE[r.state];
          const Icon = state.icon;
          return (
            <li key={`${r.type}:${r.name}:${r.value}`} className="rounded-lg border bg-background/60 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{r.reason}</span>
                <Pill tone={state.tone}>
                  <Icon className="size-3" /> {state.label}
                </Pill>
              </div>
              <dl className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-1.5 text-xs sm:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-y-0">
                <dt className="font-medium text-muted-foreground sm:order-1">Type</dt>
                <dd className="font-mono font-semibold sm:order-4">{r.type}</dd>
                <dt className="font-medium text-muted-foreground sm:order-2">Name</dt>
                <dd className="min-w-0 sm:order-5">
                  <CopyValue value={r.name} label={`${r.type} record name`} />
                </dd>
                <dt className="font-medium text-muted-foreground sm:order-3">Value</dt>
                <dd className="min-w-0 sm:order-6">
                  <CopyValue value={r.value} label={`${r.type} record value`} />
                </dd>
              </dl>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">If your DNS provider adds your domain to names automatically, enter only the part before it. Changes usually show up within minutes but can take up to an hour.</p>
    </div>
  );
}

/** Every record a custom domain has ever needed, kept after it was published and removed from the provider's list. */
function DnsHistory({ domain }: { domain: CompanyDomainView }) {
  if (domain.history.length === 0) return null;
  return (
    <details className="group rounded-lg border bg-background/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium">
        <span>DNS records for {domain.host} ({domain.history.length})</span>
        <span className="text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
        <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Hide</span>
      </summary>
      <ul className="space-y-2 border-t p-3" aria-label={`All DNS records of ${domain.host}`}>
        {domain.history.map((r) => (
          <li key={`${r.host}:${r.type}:${r.name}:${r.value}`} className="rounded-lg border bg-background p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {r.reason} <span className="font-mono">({r.host})</span>
                {r.seenAt && <span suppressHydrationWarning> · listed {formatDateTime(r.seenAt)}</span>}
              </span>
              {r.state === "connected" ? (
                <Pill tone="green"><CheckCircle2 className="size-3" /> Connected</Pill>
              ) : r.state === "not-connected" ? (
                <Pill tone="amber"><XCircle className="size-3" /> Not connected: add it at your DNS provider</Pill>
              ) : (
                <Pill tone="muted"><CircleDashed className="size-3" /> Not checked</Pill>
              )}
            </div>
            <dl className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="font-medium text-muted-foreground">Type</dt>
              <dd className="font-mono font-semibold">{r.type}</dd>
              <dt className="font-medium text-muted-foreground">Name</dt>
              <dd className="min-w-0"><CopyValue value={r.name} label={`${r.type} record name`} /></dd>
              <dt className="font-medium text-muted-foreground">Value</dt>
              <dd className="min-w-0"><CopyValue value={r.value} label={`${r.type} record value`} /></dd>
            </dl>
          </li>
        ))}
      </ul>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        Connected = your hosting provider has accepted the record. Not connected = it is still missing or hasn't propagated yet (can take up to an hour). Keep records in your DNS provider unless the provider says one is no longer needed.
      </p>
    </details>
  );
}

/** The state of the app address `app.<domain>`, which has its own verification and DNS. */
function AppPill({ app }: { app: NonNullable<CompanyDomainView["app"]> }) {
  if (app.ssl === "active") return <Pill tone="green"><Lock className="size-3" /> Products live at {app.host}</Pill>;
  if (app.ssl === "manual") return <Pill tone="muted"><Lock className="size-3" /> Products: managed by platform</Pill>;
  if (app.ssl === "error") return <Pill tone="red"><AlertTriangle className="size-3" /> <span title={app.error ?? undefined}>Products address: hosting error</span></Pill>;
  return <Pill tone="amber"><CircleDashed className="size-3" /> {app.verified ? `Products (${app.host}): waiting for DNS` : `Products (${app.host}): needs its records`}</Pill>;
}

function SslPill({ domain }: { domain: CompanyDomainView }) {
  const { ssl, error } = domain.hosting;
  if (ssl === "active") return <Pill tone="green"><Lock className="size-3" /> SSL active</Pill>;
  if (ssl === "manual") return <Pill tone="muted"><Lock className="size-3" /> SSL managed by platform</Pill>;
  if (ssl === "error") return <Pill tone="red"><AlertTriangle className="size-3" /> <span title={error ?? undefined}>Hosting error</span></Pill>;
  return <Pill tone="amber"><Lock className="size-3" /> SSL waiting for DNS</Pill>;
}

/** Settings → Domains: the workspace's automatic address plus the company's own domains. */
export default function DomainsManager({ initial, maxCustom, actions }: { initial: CompanyDomainView[]; maxCustom: number; actions: DomainsManagerActions }) {
  const [domains, setDomains] = useState(initial);
  const [host, setHost] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<{ host: string; op: Op } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();
  const [, startRow] = useTransition();
  const customCount = domains.filter((d) => d.kind === "custom").length;
  const atLimit = customCount >= maxCustom;

  function apply(res: DomainActionResult) {
    if (res.ok) {
      setDomains(res.domains);
      setNotice(res.message ? { tone: "ok", text: res.message } : null);
    } else setNotice({ tone: "error", text: res.error });
  }

  function run(target: string, op: Op) {
    setBusy({ host: target, op });
    setNotice(null);
    startRow(async () => {
      try {
        const fn = op === "verify" ? actions.verify : op === "primary" ? actions.makePrimary : actions.remove;
        apply(await fn(target));
        if (op === "remove") setConfirmRemove(null);
      } catch {
        setNotice({ tone: "error", text: "Something went wrong. Please try again." });
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <DomainsGuide domains={domains} />
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          setAddError(null);
          setNotice(null);
          startAdd(async () => {
            try {
              const res = await actions.add(host);
              if (res.ok) {
                setHost("");
                apply(res);
              } else setAddError(res.error);
            } catch {
              setAddError("Something went wrong. Please try again.");
            }
          });
        }}
      >
        <Label htmlFor="domain-host">Add a domain</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="domain-host"
            name="domain"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="www.yourcompany.com"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="url"
            maxLength={253}
            disabled={atLimit}
            aria-invalid={addError ? true : undefined}
            aria-describedby="domain-host-help"
            className="sm:flex-1"
          />
          <Button type="submit" disabled={adding || atLimit || !host.trim()}>
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add domain
          </Button>
        </div>
        <p id="domain-host-help" className="text-xs text-muted-foreground">
          {atLimit ? `You've connected the maximum of ${maxCustom} custom domains. Remove one to add another.` : "A domain you own, such as www.yourcompany.com. Your products are set up for you at app.yourcompany.com. You'll verify the domain with a DNS record next (see the steps above)."}
        </p>
        {addError && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {addError}
          </p>
        )}
      </form>

      <div aria-live="polite">
        {notice && (
          <p role={notice.tone === "error" ? "alert" : "status"} className={cn("rounded-lg px-3 py-2 text-sm", notice.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400")}>
            {notice.text}
          </p>
        )}
      </div>

      <ul className="space-y-3" aria-label="Your domains">
        {domains.map((d) => {
          const rowBusy = busy?.host === d.host ? busy.op : null;
          return (
            <li key={d.host} className="space-y-4 rounded-xl border bg-muted/20 p-4" data-domain={d.host}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <p className="flex items-center gap-2 font-semibold break-all">
                    <Globe className="size-4 shrink-0 text-muted-foreground" /> {d.host}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {d.status === "verified" ? (
                      <Pill tone="green"><CheckCircle2 className="size-3" /> Verified</Pill>
                    ) : (
                      <Pill tone="amber"><CircleDashed className="size-3" /> Pending verification</Pill>
                    )}
                    {d.isPrimary && <Pill tone="blue"><Star className="size-3" /> Primary</Pill>}
                    <Pill tone="muted">{d.kind === "subdomain" ? "Workspace address" : "Custom domain"}</Pill>
                    {d.status === "verified" && <SslPill domain={d} />}
                    {d.app && <AppPill app={d.app} />}
                  </div>
                  {d.lastCheckedAt && (
                    // Shown in the viewer's own time zone, which the server can't know — hence the hydration opt-out.
                    <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                      Last checked {formatDateTime(d.lastCheckedAt)}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(d.status === "pending" || d.hosting.ssl === "pending" || d.hosting.ssl === "error") && (
                    <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => run(d.host, "verify")} aria-label={`Check ${d.host} now`}>
                      {rowBusy === "verify" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Check now
                    </Button>
                  )}
                  {d.status === "verified" && !d.isPrimary && (
                    <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => run(d.host, "primary")} aria-label={`Make ${d.host} primary`}>
                      {rowBusy === "primary" ? <Loader2 className="size-3.5 animate-spin" /> : <Star className="size-3.5" />} Make primary
                    </Button>
                  )}
                  {d.removable && confirmRemove !== d.host && (
                    <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => setConfirmRemove(d.host)} aria-label={`Remove ${d.host}`}>
                      <Trash2 className="size-3.5" /> Remove
                    </Button>
                  )}
                </div>
              </div>

              {confirmRemove === d.host && (
                <div role="group" aria-label={`Confirm removing ${d.host}`} className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm">
                    Remove <strong className="break-all">{d.host}</strong>? {d.status === "verified" ? "Visitors using it will no longer reach your workspace." : "You can add it again later."}
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => setConfirmRemove(null)}>
                      Cancel
                    </Button>
                    <Button type="button" variant="destructive" size="sm" disabled={busy !== null} onClick={() => run(d.host, "remove")}>
                      {rowBusy === "remove" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Yes, remove
                    </Button>
                  </div>
                </div>
              )}

              {d.hosting.ssl === "error" && d.hosting.error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  The hosting provider reported: {d.hosting.error}. Press &ldquo;Check now&rdquo; to retry.
                </p>
              )}
              <DnsRecords domain={d} />
              <DnsHistory domain={d} />
            </li>
          );
        })}
      </ul>

      {customCount === 0 && (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <Globe className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-sm font-medium">No custom domains yet</p>
          <p className="mx-auto max-w-md text-xs text-muted-foreground">Your workspace already works on the address above. Add your own domain so people can reach your workspace and website there too.</p>
        </div>
      )}
    </div>
  );
}
