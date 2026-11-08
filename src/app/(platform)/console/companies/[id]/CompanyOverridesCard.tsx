"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatDateTime } from "@/lib/utils";
import { formatLimitValue } from "@/lib/platform/billing/types";
import type { OverridesDetail } from "@/lib/platform/billing/overrides-admin";
import { saveCompanyOverridesAction } from "./overrides-actions";

type Mode = "plan" | "set" | "add" | "unlimited";
interface LimitState { mode: Mode; value: string; until: string }
interface SwitchState { state: "plan" | "on" | "off"; until: string }

const MODE_LABEL: Record<Mode, string> = { plan: "Plan default", set: "Set to", add: "Add extra", unlimited: "Unlimited" };
const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

function Segmented<T extends string>({ value, onChange, items, disabled }: { value: T; onChange: (v: T) => void; items: { v: T; label: string }[]; disabled?: boolean }) {
  return (
    <div role="radiogroup" className="inline-flex shrink-0 rounded-lg border bg-muted/40 p-0.5 text-[11px] font-medium">
      {items.map((it) => (
        <button
          key={it.v}
          type="button"
          role="radio"
          aria-checked={value === it.v}
          disabled={disabled}
          onClick={() => onChange(it.v)}
          className={cn("rounded-md px-2.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50", value === it.v ? (it.v === "on" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : it.v === "off" ? "bg-rose-500/15 text-rose-700 dark:text-rose-300" : "bg-background shadow-sm") : "text-muted-foreground hover:text-foreground")}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Platform admin: change what ONE company may use, beyond its plan: every limit (users, storage, AI tokens, emails, voice minutes,
 * domains …), every capability and every product, for good or until a date. The plan stays as it is; this sits on top of it.
 */
export default function CompanyOverridesCard({ companyId, companyName, detail, canManage }: { companyId: string; companyName: string; detail: OverridesDetail; canManage: boolean }) {
  const router = useRouter();
  const [limits, setLimits] = useState<Record<string, LimitState>>(() => Object.fromEntries(detail.limits.map((l) => [l.key, { mode: (l.override?.mode ?? "plan") as Mode, value: l.override?.value != null ? String(l.override.value) : "", until: dateOnly(l.override?.until ?? null) }])));
  const [flags, setFlags] = useState<Record<string, SwitchState>>(() => Object.fromEntries(detail.flags.map((f) => [f.key, { state: f.override ? (f.override.on ? "on" : "off") : "plan", until: dateOnly(f.override?.until ?? null) } as SwitchState])));
  const [modules, setModules] = useState<Record<string, SwitchState>>(() => Object.fromEntries(detail.modules.map((m) => [m.key, { state: m.override ? (m.override.on ? "on" : "off") : "plan", until: dateOnly(m.override?.until ?? null) } as SwitchState])));
  const [note, setNote] = useState(detail.note);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const changes = useMemo(
    () => Object.values(limits).filter((l) => l.mode !== "plan").length + Object.values(flags).filter((f) => f.state !== "plan").length + Object.values(modules).filter((m) => m.state !== "plan").length,
    [limits, flags, modules],
  );

  function save() {
    setResult(null);
    start(async () => {
      const res = await saveCompanyOverridesAction(companyId, {
        limits: Object.fromEntries(Object.entries(limits).map(([k, l]) => [k, { mode: l.mode, value: l.value, until: l.until || null }])),
        flags: Object.fromEntries(Object.entries(flags).filter(([, f]) => f.state !== "plan").map(([k, f]) => [k, { on: f.state === "on", until: f.until || null }])),
        modules: Object.fromEntries(Object.entries(modules).filter(([, m]) => m.state !== "plan").map(([k, m]) => [k, { on: m.state === "on", until: m.until || null }])),
        note,
      });
      setResult(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  }

  function reset() {
    setLimits(Object.fromEntries(detail.limits.map((l) => [l.key, { mode: "plan" as Mode, value: "", until: "" }])));
    setFlags(Object.fromEntries(detail.flags.map((f) => [f.key, { state: "plan", until: "" } as SwitchState])));
    setModules(Object.fromEntries(detail.modules.map((m) => [m.key, { state: "plan", until: "" } as SwitchState])));
    setNote("");
    setResult(null);
  }

  const disabled = !canManage || detail.unlimitedAnyway || pending;
  const untilInput = (value: string, onChange: (v: string) => void, label: string) => (
    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      until
      <Input type="date" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="h-8 w-36 text-xs" />
    </label>
  );

  return (
    <GlassCard interactive={false} containerClassName="h-auto">
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><SlidersHorizontal className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">Custom limits &amp; access</CardTitle>
              {detail.active && <Badge variant="outline" className="border-primary/30 text-primary">Custom settings on</Badge>}
            </div>
            <CardDescription>
              Give {companyName} more (or less) than its {detail.planName ?? "plan"} plan: users, storage, AI tokens, emails, voice minutes, domains, capabilities and products. The plan itself is unchanged; leave a row on &quot;Plan default&quot; to follow it.
            </CardDescription>
            {detail.updatedAt && <p className="mt-1 text-xs text-muted-foreground" suppressHydrationWarning>Last changed {formatDateTime(detail.updatedAt)}</p>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {detail.unlimitedAnyway && <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">This company has free access, which already has no limits and every product. Take free access away first to set custom limits.</p>}
        {!canManage && <p className="text-xs text-muted-foreground">You need the “manage subscriptions” permission to change this.</p>}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Limits</h3>
          <ul className="divide-y rounded-xl border">
            {detail.limits.map((l) => {
              const s = limits[l.key];
              const num = Number(s.value);
              const seatsBelowUse = l.key === "seats" && s.mode === "set" && Number.isFinite(num) && l.used !== null && num < l.used;
              return (
                <li key={l.key} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-sm font-medium">{l.label}{l.custom && <span className="ml-2 text-[10px] font-normal text-muted-foreground">custom</span>}</p>
                    <p className="text-xs text-muted-foreground">
                      Plan: <b className="text-foreground">{formatLimitValue(l.key, l.plan)}</b>
                      {" · "}Now: <b className="text-foreground">{formatLimitValue(l.key, l.effective)}</b>
                      {l.used !== null && <> {" · "}Used: <b className="text-foreground">{l.used.toLocaleString("en-IN")}{l.unit ? ` ${l.unit}` : ""}</b></>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`${l.label}: change`}
                      value={s.mode}
                      disabled={disabled}
                      onChange={(e) => setLimits((p) => ({ ...p, [l.key]: { ...p[l.key], mode: e.target.value as Mode } }))}
                      className="h-8 rounded-md border bg-background px-2 text-xs disabled:opacity-50"
                    >
                      {(Object.keys(MODE_LABEL) as Mode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                    </select>
                    {(s.mode === "set" || s.mode === "add") && (
                      <Input
                        aria-label={`${l.label}: amount${l.unit ? ` in ${l.unit}` : ""}`}
                        inputMode="numeric"
                        value={s.value}
                        disabled={disabled}
                        onChange={(e) => setLimits((p) => ({ ...p, [l.key]: { ...p[l.key], value: e.target.value } }))}
                        placeholder={l.unit || "amount"}
                        className="h-8 w-36 text-xs"
                      />
                    )}
                    {s.mode !== "plan" && untilInput(s.until, (v) => setLimits((p) => ({ ...p, [l.key]: { ...p[l.key], until: v } })), `${l.label}: ends on`)}
                  </div>
                  {seatsBelowUse && <p className="text-xs text-amber-700 dark:text-amber-300">That is fewer than the {l.used} people using seats now. Accounts beyond the limit will be locked out until it goes up or seats are freed.</p>}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Capabilities</h3>
          <ul className="divide-y rounded-xl border">
            {detail.flags.map((f) => (
              <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <p className="text-sm font-medium">{f.label}</p>
                  <p className="text-xs text-muted-foreground">Plan: <b className="text-foreground">{f.plan ? "included" : "not included"}</b> · Now: <b className="text-foreground">{f.effective ? "on" : "off"}</b></p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented value={flags[f.key].state} disabled={disabled} onChange={(v) => setFlags((p) => ({ ...p, [f.key]: { ...p[f.key], state: v } }))} items={[{ v: "plan", label: "Plan default" }, { v: "on", label: "On" }, { v: "off", label: "Off" }]} />
                  {flags[f.key].state !== "plan" && untilInput(flags[f.key].until, (v) => setFlags((p) => ({ ...p, [f.key]: { ...p[f.key], until: v } })), `${f.label}: ends on`)}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Products</h3>
          <ul className="divide-y rounded-xl border">
            {detail.modules.map((m) => (
              <li key={m.key} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <p className="text-sm font-medium">{m.label}{m.core && <span className="ml-2 text-[10px] font-normal text-muted-foreground">always on</span>}</p>
                  <p className="text-xs text-muted-foreground">Plan: <b className="text-foreground">{m.plan ? "included" : "not included"}</b> · Now: <b className="text-foreground">{m.effective ? "open" : "locked"}</b></p>
                </div>
                {!m.core && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Segmented value={modules[m.key].state} disabled={disabled} onChange={(v) => setModules((p) => ({ ...p, [m.key]: { ...p[m.key], state: v } }))} items={[{ v: "plan", label: "Plan default" }, { v: "on", label: "Unlock" }, { v: "off", label: "Lock" }]} />
                    {modules[m.key].state !== "plan" && untilInput(modules[m.key].until, (v) => setModules((p) => ({ ...p, [m.key]: { ...p[m.key], until: v } })), `${m.label}: ends on`)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-1.5">
          <label htmlFor="ov-note" className="text-sm font-semibold">Why <span className="font-normal text-muted-foreground">(only platform staff see this)</span></label>
          <Textarea id="ov-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} disabled={disabled} placeholder="For example: enterprise pilot, support goodwill, agreed in the contract …" />
        </div>

        {result && <p role={result.ok ? "status" : "alert"} className={cn("rounded-lg px-3 py-2 text-sm", result.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive")}>{result.text}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={save} disabled={disabled}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Save changes"}</Button>
          <Button type="button" variant="outline" onClick={reset} disabled={disabled}>Back to plan default</Button>
          <span className="text-xs text-muted-foreground">{changes === 0 ? "Nothing changed from the plan." : `${changes} item${changes === 1 ? "" : "s"} differ from the plan. Press Save to apply.`}</span>
        </div>
      </CardContent>
    </GlassCard>
  );
}
