"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePublicCallSettingsAction } from "@/app/(products)/commandos/(protected)/settings/products/agentos/phone-actions";
import { validatePublicForm } from "@/lib/products/agentos/calls/call-display";
import type { PublicCallSettings } from "@/lib/products/agentos/calls/settings";

type Limits = { dailyMinutesMax: number; hourlyMax: number; sessionMin: number; sessionMax: number };

function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p role="alert" className="text-[11px] text-destructive">{error}</p> : hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Limits on calls made from a website, and whether callers' numbers are masked in call lists. */
export default function PublicCallSettingsForm({ initial, limits }: { initial: PublicCallSettings; limits: Limits }) {
  const router = useRouter();
  const [kill, setKill] = useState(initial.publicKillSwitch);
  const [daily, setDaily] = useState(String(initial.publicDailyMinutes));
  const [perIp, setPerIp] = useState(String(initial.publicPerIpHourly));
  const [perAgent, setPerAgent] = useState(String(initial.publicPerAgentHourly));
  const [maxSession, setMaxSession] = useState(String(initial.publicMaxSessionSecs));
  const [mask, setMask] = useState(initial.maskInboundNumbers);
  const [pending, run] = useTransition();
  const errors = useMemo(() => validatePublicForm({ dailyMinutes: daily, perIp, perAgent, maxSession }, limits), [daily, perIp, perAgent, maxSession, limits]);
  const invalid = Object.values(errors).some(Boolean);

  const save = () =>
    run(async () => {
      const r = await savePublicCallSettingsAction({
        publicKillSwitch: kill, publicDailyMinutes: Number(daily), publicPerIpHourly: Number(perIp), publicPerAgentHourly: Number(perAgent),
        publicMaxSessionSecs: Number(maxSession), maskInboundNumbers: mask,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Website call settings saved");
      router.refresh();
    });

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (!invalid) save(); }}>
      <label className={`flex cursor-pointer items-start gap-2.5 rounded-2xl border p-4 text-sm ${kill ? "border-rose-500/40 bg-rose-500/10" : "border-border/50 bg-muted/20"}`}>
        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={kill} onChange={(e) => setKill(e.target.checked)} disabled={pending} />
        <span>
          <span className="font-medium">Switch off all website calls</span>
          <span className="block text-xs text-muted-foreground">An emergency stop. While this is on, no visitor can start a call on any website, whatever each agent&apos;s own setting says.</span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Minutes of website calls per day" htmlFor="pc-daily" hint="Across the whole company, counted per day (UTC). When it is used up, new website calls are refused until the next day. 0 stops new website calls." error={errors.dailyMinutes}>
          <Input id="pc-daily" inputMode="numeric" value={daily} onChange={(e) => setDaily(e.target.value)} disabled={pending} />
        </Field>
        <Field label="Longest website call (seconds)" htmlFor="pc-session" hint="An agent's own shorter limit wins." error={errors.maxSession}>
          <Input id="pc-session" inputMode="numeric" value={maxSession} onChange={(e) => setMaxSession(e.target.value)} disabled={pending} />
        </Field>
        <Field label="Calls per visitor per hour" htmlFor="pc-ip" hint="One visitor's address may start this many website calls in an hour." error={errors.perIp}>
          <Input id="pc-ip" inputMode="numeric" value={perIp} onChange={(e) => setPerIp(e.target.value)} disabled={pending} />
        </Field>
        <Field label="Calls per agent per hour" htmlFor="pc-agent" hint="All visitors together, for one agent." error={errors.perAgent}>
          <Input id="pc-agent" inputMode="numeric" value={perAgent} onChange={(e) => setPerAgent(e.target.value)} disabled={pending} />
        </Field>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-border/50 bg-muted/20 p-4 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={mask} onChange={(e) => setMask(e.target.checked)} disabled={pending} />
        <span>
          <span className="font-medium">Hide callers&apos; phone numbers in call lists</span>
          <span className="block text-xs text-muted-foreground">Inbound callers show as +91••••••3210 in Call History. People who manage calls can still open the full number on the call&apos;s own page.</span>
        </span>
      </label>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || invalid}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}Save website call settings</Button>
      </div>
    </form>
  );
}
