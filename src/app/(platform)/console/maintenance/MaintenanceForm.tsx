"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Megaphone, Monitor, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCountdown, useCountdown } from "@/components/platform/MaintenanceCountdown";
import { cn } from "@/lib/utils";
import { MAINTENANCE_MAX_HOURS, MAINTENANCE_MAX_MESSAGE, maintenancePhase, type MaintenanceMode, type MaintenanceScope, type MaintenanceState } from "@/lib/platform/maintenance-shared";
import { endMaintenanceAction, saveMaintenanceAction } from "./actions";

const MODES: { value: MaintenanceMode; label: string; text: string; icon: typeof Megaphone }[] = [
  { value: "takeover", label: "Full maintenance screen", text: "Websites and apps show an animated “We’ll be right back” screen with a countdown, in each company's own branding.", icon: Wrench },
  { value: "banner", label: "Banner only", text: "Everything keeps working; a banner with a countdown shows on every site and app.", icon: Megaphone },
];
const SCOPES: { value: MaintenanceScope; label: string }[] = [
  { value: "both", label: "Websites and apps" },
  { value: "sites", label: "Websites only" },
  { value: "apps", label: "Apps (products) only" },
];
const QUICK = [0.5, 1, 2, 4, 8, 24];

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function Status({ m, on, busy, onToggle }: { m: MaintenanceState; on: boolean; busy: boolean; onToggle: (next: boolean) => void }) {
  const phase = maintenancePhase(m);
  const c = useCountdown(phase === "upcoming" ? m.startsAt : m.endsAt);
  const tone = phase === "active" ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200" : phase === "upcoming" ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground";
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3", tone)} role="status">
      <span className={cn("size-2.5 rounded-full", phase === "off" ? "bg-muted-foreground/50" : "mt-banner-dot !bg-current")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{phase === "active" ? "Maintenance is live" : phase === "upcoming" ? "Maintenance is scheduled" : "No maintenance running"}</p>
        {phase !== "off" && (
          <p className="text-xs opacity-80" suppressHydrationWarning>
            {new Date(m.startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} → {new Date(m.endsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </p>
        )}
      </div>
      {phase !== "off" && (
        <p className="text-sm font-semibold tabular-nums" suppressHydrationWarning>
          {phase === "upcoming" ? "Starts in " : "Ends in "}
          {c ? formatCountdown(c) : "--:--:--"}
        </p>
      )}
      <MaintenanceSwitch on={on} busy={busy} onChange={onToggle} />
    </div>
  );
}

/** The master switch: turning it on starts the window with the settings below (it validates them first); turning it off ends it at once. */
function MaintenanceSwitch({ on, busy, onChange }: { on: boolean; busy: boolean; onChange: (next: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label="Maintenance" disabled={busy} onClick={() => onChange(!on)} className={cn("mt-switch", on && "mt-switch-on")}>
      <span className="mt-switch-label">{busy ? "…" : on ? "LIVE" : "OFF"}</span>
      <span className="mt-switch-knob" aria-hidden />
    </button>
  );
}

export default function MaintenanceForm({ initial, companyId, companyName }: { initial: MaintenanceState; companyId?: string; companyName?: string }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [enabled, setEnabled] = useState(initial.enabled && maintenancePhase(initial) !== "off");
  const [message, setMessage] = useState(initial.message);
  const [mode, setMode] = useState<MaintenanceMode>(initial.mode);
  const [appliesTo, setAppliesTo] = useState<MaintenanceScope>(initial.appliesTo);
  const [schedule, setSchedule] = useState(initial.startsAt > Date.now());
  const [startsAt, setStartsAt] = useState(initial.startsAt > Date.now() ? toLocalInput(initial.startsAt) : "");
  const [hours, setHours] = useState<string>(initial.endsAt > initial.startsAt && initial.enabled ? String(Math.round(((initial.endsAt - initial.startsAt) / 3_600_000) * 100) / 100) : "2");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save(forceEnabled?: boolean) {
    setNote(null);
    setErrors({});
    const on = forceEnabled ?? enabled;
    start(async () => {
      const res = await saveMaintenanceAction({
        enabled: on,
        message,
        mode,
        appliesTo,
        startsAt: schedule && startsAt ? new Date(startsAt).toISOString() : "",
        durationHours: Number(hours),
      }, companyId);
      if (!res.ok) return setErrors(res.errors);
      setState(res.state);
      setEnabled(on);
      setNote({ ok: true, text: on ? (companyId ? `Saved. ${companyName ?? "This company"}'s site and app follow this window.` : "Saved. Every company's site and app now follow this window.") : "Saved. Maintenance is off." });
      router.refresh();
    });
  }
  function endNow() {
    setNote(null);
    start(async () => {
      const res = await endMaintenanceAction(companyId);
      setState(res.state);
      setEnabled(false);
      setNote({ ok: true, text: "Maintenance ended. Sites and apps are back within a few seconds." });
      router.refresh();
    });
  }

  const phase = maintenancePhase(state);
  const who = companyId ? (companyName ?? "this company") : "every company";
  return (
    <div className="space-y-5">
      <Status m={state} on={phase !== "off"} busy={pending} onToggle={(next) => (next ? save(true) : endNow())} />
      <GlassCard interactive={false}>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{companyId ? "Maintenance for this company" : "Maintenance window"}</CardTitle>
              <CardDescription>{companyId ? `Only ${who}'s website and app. It adds to the platform-wide window; whichever is live is shown.` : "One window for every company."} Nothing to switch off afterwards: it ends by itself at the end time.</CardDescription>
            </div>

          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="mt-message">Message shown to everyone</Label>
            <textarea
              id="mt-message"
              rows={3}
              maxLength={MAINTENANCE_MAX_MESSAGE}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="We’re upgrading our servers to make everything faster. We’ll be back shortly."
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            <p className="text-xs text-muted-foreground">{message.length}/{MAINTENANCE_MAX_MESSAGE}</p>
            {errors.message && <p className="text-xs text-destructive">{errors.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>What visitors see</Label>
            <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
              {MODES.map((o) => (
                <label key={o.value} className={cn("cursor-pointer rounded-xl border p-3 text-sm transition-colors", mode === o.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                  <input type="radio" name="mt-mode" className="sr-only" checked={mode === o.value} onChange={() => setMode(o.value)} />
                  <span className="flex items-center gap-2 font-semibold"><o.icon className="size-4 text-primary" /> {o.label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{o.text}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Monitor className="size-4" /> Applies to</Label>
              <div role="radiogroup" className="flex flex-wrap gap-2">
                {SCOPES.map((o) => (
                  <label key={o.value} className={cn("cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", appliesTo === o.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                    <input type="radio" name="mt-scope" className="sr-only" checked={appliesTo === o.value} onChange={() => setAppliesTo(o.value)} />
                    {o.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{companyId ? "Does not touch any other company." : "The product's own website and Platform Console are never affected, so you can always end it."}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mt-hours" className="flex items-center gap-2"><CalendarClock className="size-4" /> Duration (hours)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="mt-hours"
                  type="number"
                  min={0.05}
                  max={MAINTENANCE_MAX_HOURS}
                  step={0.25}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="h-9 w-24 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />
                {QUICK.map((q) => (
                  <button key={q} type="button" onClick={() => setHours(String(q))} className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", Number(hours) === q ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                    {q < 1 ? `${q * 60}m` : `${q}h`}
                  </button>
                ))}
              </div>
              {errors.durationHours && <p className="text-xs text-destructive">{errors.durationHours}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Starts</Label>
            <div className="flex flex-wrap items-center gap-2">
              {[{ v: false, t: "As soon as I save" }, { v: true, t: "Schedule for later" }].map((o) => (
                <label key={o.t} className={cn("cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", schedule === o.v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                  <input type="radio" name="mt-start" className="sr-only" checked={schedule === o.v} onChange={() => setSchedule(o.v)} />
                  {o.t}
                </label>
              ))}
              {schedule && (
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="h-9 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">A scheduled window shows an announcement banner with a countdown to the start on every site and app until then.</p>
            {errors.startsAt && <p className="text-xs text-destructive">{errors.startsAt}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Button type="button" onClick={() => save()} disabled={pending}>
              {pending ? "Saving…" : phase !== "off" ? "Save changes" : "Save and start"}
            </Button>
            {note && <p className={cn("text-sm", note.ok ? "text-muted-foreground" : "text-destructive")}>{note.text}</p>}
          </div>
        </CardContent>
      </GlassCard>
    </div>
  );
}
