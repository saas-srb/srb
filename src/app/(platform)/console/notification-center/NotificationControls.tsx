"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Loader2, Lock, Mail, Search, Smartphone } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { FeatureControls } from "@/lib/platform/feature-controls";
import { CHANNELS, CHANNEL_LABEL, type ChannelKey } from "@/lib/notify/center/shared";
import type { DeliveryTotals, PlatformEvent } from "@/lib/notify/center/platform";
import { setEventChannelAction, setNotificationCenterEnabledAction } from "./actions";

const ICON: Record<ChannelKey, typeof Bell> = { inApp: Bell, push: Smartphone, email: Mail };
const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

function Switch({ on, disabled, label, onChange }: { on: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${on ? "bg-primary" : "bg-muted-foreground/30"}`}>
      <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

export default function NotificationControls({ events, totals, controls, products, canEdit }: { events: PlatformEvent[]; totals: DeliveryTotals[]; controls: FeatureControls; products: Record<string, string>; canEdit: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [product, setProduct] = useState("all");
  const [state, setState] = useState<"all" | "off">("all");
  const [off, setOff] = useState<Record<string, boolean>>({}); // optimistic: `${key}:${channel}` → switched off
  const [section, setSection] = useState(controls.notificationCenter);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [, start] = useTransition();
  const productName = (k: string) => (k === "account" ? "Account & billing" : k === "workspace" ? "Workspace" : (products[k] ?? k));
  const isOff = (key: string, c: ChannelKey) => off[`${key}:${c}`] ?? controls.events[key]?.[c] === false;
  const productKeys = useMemo(() => [...new Set(events.map((e) => e.product))].sort((a, b) => productName(a).localeCompare(productName(b))), [events, products]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = events.filter((e) => (product === "all" || e.product === product) && (state === "all" || CHANNELS.some((c) => isOff(e.key, c))) && (!q.trim() || `${e.name} ${e.description} ${e.key}`.toLowerCase().includes(q.trim().toLowerCase())));
  const groups = [...new Set(shown.map((e) => e.product))].sort((a, b) => productName(a).localeCompare(productName(b)));
  const offCount = events.reduce((n, e) => n + CHANNELS.filter((c) => isOff(e.key, c)).length, 0);

  const toggle = (e: PlatformEvent, c: ChannelKey, enabled: boolean) => {
    if (!enabled && !confirm(`Turn off ${CHANNEL_LABEL[c]} for "${e.name}" for EVERY company? Nobody will get it on that channel, and companies cannot turn it back on.`)) return;
    const k = `${e.key}:${c}`;
    setBusy(k);
    setMessage(null);
    setOff((m) => ({ ...m, [k]: !enabled }));
    start(async () => {
      const res = await setEventChannelAction(e.key, c, enabled).catch((x: unknown) => ({ ok: false as const, error: x instanceof Error ? x.message : "Could not save." }));
      setBusy(null);
      if (res.ok) router.refresh();
      else {
        setOff((m) => ({ ...m, [k]: enabled }));
        setMessage({ ok: false, text: `${e.name}: ${res.error}` });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {totals.map((t) => {
          const Icon = ICON[t.channel];
          return (
            <div key={t.channel} className="rounded-2xl border border-border/60 bg-card/70 p-4">
              <p className="flex items-center gap-2 text-sm font-medium"><Icon className="size-4 text-primary" /> {CHANNEL_LABEL[t.channel]} · all companies, last 24 hours</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{t.sent}<span className="ml-1 text-xs font-normal text-muted-foreground">sent</span></p>
              <p className="text-xs text-muted-foreground">{t.failed} failed · {t.off} held back</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/70 p-4 text-sm">
        <div>
          <p className="font-medium">Show the Notification center to companies</p>
          <p className="text-xs text-muted-foreground">Their Settings → Notification center page. Turning it off only hides the page; notifications keep being delivered with each company&apos;s current settings.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{section ? "Shown" : "Hidden"}</span>
          <Switch on={section} disabled={!canEdit} label="Show the Notification center to companies" onChange={(v) => { setSection(v); start(async () => { const res = await setNotificationCenterEnabledAction(v).catch(() => ({ ok: false as const, error: "Could not save." })); if (res.ok) router.refresh(); else { setSection(!v); setMessage({ ok: false, text: res.error }); } }); }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notifications" className="pl-9" aria-label="Search notifications" /></div>
        <select value={product} onChange={(e) => setProduct(e.target.value)} className={selectClass} aria-label="Product"><option value="all">All products</option>{productKeys.map((k) => <option key={k} value={k}>{productName(k)}</option>)}</select>
        <select value={state} onChange={(e) => setState(e.target.value as typeof state)} className={selectClass} aria-label="Filter"><option value="all">All ({events.length})</option><option value="off">Switched off by the platform ({offCount} channels)</option></select>
      </div>
      {message && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{message.text}</p>}
      {groups.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No notifications match.</p>}

      {groups.map((g) => (
        <section key={g} className="overflow-hidden rounded-2xl border border-border/60 bg-card/70">
          <h3 className="border-b bg-muted/40 px-4 py-2 text-sm font-semibold">{productName(g)} <span className="ml-1 text-xs font-normal text-muted-foreground">{shown.filter((e) => e.product === g).length}</span></h3>
          <ul className="divide-y">
            {shown.filter((e) => e.product === g).map((e) => (
              <li key={e.key} data-event={e.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-48 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{e.name}{e.locked && <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-normal"><Lock className="size-3" /> Always on</span>}</p>
                  <p className="text-xs text-muted-foreground">{e.description}</p>
                </div>
                <div className="flex items-center gap-4">
                  {CHANNELS.map((c) => {
                    const Icon = ICON[c];
                    const available = e.channels.includes(c);
                    const n = e.companiesOff[c];
                    return (
                      <label key={c} className={`flex items-center gap-1.5 text-xs ${available ? "" : "opacity-30"}`} title={!available ? `${CHANNEL_LABEL[c]} isn't used for this` : e.locked ? "Security and billing emails can't be turned off" : `${CHANNEL_LABEL[c]}: ${isOff(e.key, c) ? "off for every company" : "on"}${n ? ` · ${n} ${n === 1 ? "company has" : "companies have"} turned it off` : ""}`}>
                        {busy === `${e.key}:${c}` ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
                        <Switch on={available && !isOff(e.key, c)} disabled={!canEdit || !available || e.locked || busy === `${e.key}:${c}`} label={`${CHANNEL_LABEL[c]} for ${e.name}`} onChange={(v) => toggle(e, c, v)} />
                        {n > 0 && <span className="text-muted-foreground tabular-nums">{n}</span>}
                      </label>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">The small number next to a switch is how many companies have turned that channel off for themselves.</p>
    </div>
  );
}
