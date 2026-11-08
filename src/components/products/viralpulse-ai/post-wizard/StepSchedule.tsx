"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import { Field } from "@/components/products/viralpulse-ai/SmmsBits";
import { checkScheduleInput, defaultScheduleLocal, istToZone, type ScheduleMode } from "@/lib/products/viralpulse-ai/post-wizard/helpers";
import { Callout, FieldError, Switch, sectionTitle, type StepProps } from "./shared";
import { cn } from "@/lib/utils";

function zones(current: string): string[] {
  let list: string[] = [];
  try {
    list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    list = [];
  }
  return [...new Set(["Asia/Kolkata", current, ...list])];
}

export default function StepSchedule({ init, s, dispatch, errors, showErrors, locked, ai }: StepProps) {
  const sc = s.schedule;
  const [now, setNow] = useState(() => new Date(init.nowIso));
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const check = useMemo(() => (sc.mode === "schedule" ? checkScheduleInput(sc.local, sc.timezone, now) : null), [sc.mode, sc.local, sc.timezone, now]);
  const tzList = useMemo(() => zones(sc.timezone), [sc.timezone]);
  const set = (patch: Partial<typeof sc>) => dispatch({ type: "schedule", patch });
  const canNow = init.can.publish;
  const native = s.platforms.filter((p) => init.caps[p].nativeScheduling);

  const modes: { key: ScheduleMode; label: string; hint: string; disabled?: string }[] = [
    { key: "now", label: "Publish now", hint: "Sent as soon as you confirm on the last step.", disabled: canNow ? undefined : "Publishing needs the Publish permission. Schedule it instead and ask someone with Publish to approve." },
    { key: "schedule", label: "Schedule", hint: "Goes out at the time you choose.", disabled: init.can.schedule ? undefined : "You don't have permission to schedule posts." },
    { key: "draft", label: "Save as draft", hint: "Keep it for later. Nothing is sent." },
  ];

  return (
    <div className="space-y-6">
      <div role="radiogroup" aria-label="When to publish" className="grid gap-2 sm:grid-cols-3">
        {modes.map((m) => (
          <button key={m.key} type="button" role="radio" aria-checked={sc.mode === m.key} disabled={locked || Boolean(m.disabled)} title={m.disabled} onClick={() => set({ mode: m.key, ...(m.key === "schedule" && !sc.local ? { local: defaultScheduleLocal(now, sc.timezone) } : {}) })}
            className={cn("rounded-xl border p-3 text-left transition focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50", sc.mode === m.key ? "border-primary bg-primary/8" : "border-border/60 hover:border-primary/40")}>
            <span className="block text-sm font-semibold">{m.label}</span>
            <span className="block text-[11px] text-muted-foreground">{m.disabled ?? m.hint}</span>
          </button>
        ))}
      </div>

      {sc.mode === "schedule" && (
        <section className="space-y-4 rounded-2xl border border-border/50 p-4" aria-labelledby="sch-when">
          <h3 id="sch-when" className={sectionTitle}>Date and time</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <AiField {...ai("post.scheduledAt")} label="Publish at" id="sch-local" as="custom" value={sc.local} disabled={locked} onChange={(x) => set({ local: istToZone(String(x), sc.timezone) })}>
              <Input id="sch-local" type="datetime-local" value={sc.local} disabled={locked} aria-invalid={Boolean(check && !check.ok)} aria-describedby="sch-msg" onChange={(e) => set({ local: e.target.value })} />
            </AiField>
            <Field label="Time zone" htmlFor="sch-tz" hint="The time is entered and shown in this zone; it is stored as an exact moment.">
              <select id="sch-tz" value={sc.timezone} disabled={locked} onChange={(e) => set({ timezone: e.target.value })} className="h-9 w-full rounded-xl border border-border/50 bg-background px-3 text-sm">
                {tzList.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </Field>
          </div>
          <div id="sch-msg" aria-live="polite" className="space-y-1.5">
            {check && !check.ok && (showErrors || sc.local) && <Callout tone="bad">{check.error}</Callout>}
            {check?.ok && check.utc && <Callout tone="ok">{`Will go out at ${new Intl.DateTimeFormat("en-IN", { timeZone: sc.timezone, dateStyle: "full", timeStyle: "short" }).format(check.utc)} (${sc.timezone}).`}</Callout>}
            {check?.notes.map((n) => <Callout key={n} tone="warn">{n}</Callout>)}
          </div>
          <p className="text-[11px] text-muted-foreground">The best-time button (sparkle) reads your own published posts with recorded results and suggests the hour that got the most engagement, in India time. With fewer than 10 such posts it says so and suggests nothing.</p>
          {native.length > 0 && <p className="text-[11px] text-muted-foreground">{`Posts go out within about 5 minutes of the chosen time. ${native.map((p) => init.caps[p].label).join(", ")} can also hold the post natively when it is 10 minutes to 29 days ahead.`}</p>}
          <FieldError>{showErrors ? errors.when : undefined}</FieldError>
          <div className="space-y-2 rounded-xl bg-muted/40 p-3">
            <p className="text-xs font-semibold">Approval</p>
            {canNow ? (
              <label className="flex items-center gap-2 text-xs font-medium">
                <Switch checked={sc.approve} disabled={locked} aria-label="Approve for automatic publishing" onCheckedChange={(v) => set({ approve: v })} />
                Approve it now so it publishes by itself at that time
              </label>
            ) : (
              <p className="text-xs text-muted-foreground">You can schedule the post, but it only publishes after someone with the Publish permission approves it. They are notified when you schedule it.</p>
            )}
            {canNow && !sc.approve && <p className="text-[11px] text-muted-foreground">Without approval the post waits; an approver can approve it on the post page.</p>}
          </div>
        </section>
      )}
      {sc.mode === "now" && <Callout tone="info">The post is handed to the publisher as soon as you confirm on the last step. You can watch each platform&apos;s progress there.</Callout>}
      {sc.mode === "draft" && <Callout tone="info">Everything is saved as you go. You can come back to this draft from the posts list and finish it later.</Callout>}
    </div>
  );
}
