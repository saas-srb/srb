"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Power, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ActionButton from "@/components/products/viralpulse-ai/ActionButton";
import { saveGuardAction, setKillSwitchAction } from "@/app/(products)/viralpulse-ai/(protected)/campaigns/ads-actions";
import type { GuardSummary } from "@/lib/products/viralpulse-ai/ads-platforms/wizard-data";
import { minorToInput, parseMajorToMinor } from "@/lib/products/viralpulse-ai/ads-platforms/ui";
import { CheckRow, Note, Section } from "./ads-bits";

type Row = { currency: string; maxDailyPerLaunch: string; maxTotalPerLaunch: string; companyDaily: string; companyMonthly: string; approvalThreshold: string };
const FIELDS: { key: keyof Omit<Row, "currency">; cap: keyof GuardSummary["currencies"][string]; label: string; help: string }[] = [
  { key: "maxDailyPerLaunch", cap: "maxDailyPerLaunchMinor", label: "Daily budget per launch", help: "The largest daily budget one launch may have." },
  { key: "maxTotalPerLaunch", cap: "maxTotalPerLaunchMinor", label: "Total per launch", help: "The most one launch may spend over its life. A launch with no end date is refused when this is set." },
  { key: "companyDaily", cap: "companyDailyCapMinor", label: "Company daily limit", help: "All running ads together, counting Meta's 25% daily overshoot." },
  { key: "companyMonthly", cap: "companyMonthlyCapMinor", label: "Company 30-day limit", help: "All running ads together over 30 days." },
  { key: "approvalThreshold", cap: "approvalThresholdMinor", label: "Second approver above", help: "A launch above this must be approved by someone other than its creator. Leave it empty and EVERY launch needs a different approver." },
];

export default function GuardForm({ initial, canManage = true, canKill = true }: { initial: GuardSummary; canManage?: boolean; canKill?: boolean }) {
  const [rows, setRows] = useState<Row[]>(Object.entries(initial.currencies).map(([currency, c]) => ({ currency, maxDailyPerLaunch: minorToInput(c.maxDailyPerLaunchMinor, currency), maxTotalPerLaunch: minorToInput(c.maxTotalPerLaunchMinor, currency), companyDaily: minorToInput(c.companyDailyCapMinor, currency), companyMonthly: minorToInput(c.companyMonthlyCapMinor, currency), approvalThreshold: minorToInput(c.approvalThresholdMinor, currency) })));
  const [second, setSecond] = useState(initial.requireSecondApprover);
  const [uncapped, setUncapped] = useState(initial.allowUncapped);
  const [kill, setKill] = useState(initial.killSwitch);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    const perCurrency: Record<string, Record<string, number | null>> = {};
    for (const r of rows) {
      const cur = r.currency.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(cur)) { setErr("Each row needs a three-letter currency code, for example INR."); return; }
      const caps: Record<string, number | null> = {};
      for (const f of FIELDS) {
        const t = r[f.key].trim();
        if (!t) { caps[f.cap] = null; continue; }
        const m = parseMajorToMinor(t, cur);
        if (m === null) { setErr(`${cur}: "${f.label}" is not a valid amount.`); return; }
        caps[f.cap] = m;
      }
      perCurrency[cur] = caps;
    }
    setBusy(true);
    const res = await saveGuardAction({ perCurrency, requireSecondApprover: second, allowUncapped: uncapped });
    setBusy(false);
    if (!res.ok) setErr(res.error); else toast.success("Spending limits saved");
  }

  return (
    <div className="space-y-4">
      <Section title="Kill switch" description="Turning it on pauses every campaign that is running (or running in Meta without our knowing) and stops anything from being switched on. Turning it off again needs the &quot;Manage ad spending limits&quot; permission.">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${kill ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>{kill ? "On: nothing can start" : "Off"}</span>
          {(kill ? canManage : canKill) && <ActionButton variant={kill ? "outline" : "destructive"} success={kill ? "Kill switch off" : "Kill switch on"} action={async () => { const r = await setKillSwitchAction(!kill); if (!r.ok) return r; setKill(r.guard.killSwitch); return r.failed > 0 ? { ok: false as const, error: `Kill switch is on, but ${r.failed} campaign${r.failed === 1 ? "" : "s"} could not be paused in Meta. Pause ${r.failed === 1 ? "it" : "them"} in Ads Manager; the sync keeps trying.` } : r; }} confirm={{ title: kill ? "Turn the kill switch off?" : "Turn the kill switch on?", description: kill ? "Approved launches can be switched on again." : "Every running campaign is paused in Meta now, and no launch can be switched on until it is turned off. This is recorded under your name.", confirmLabel: kill ? "Turn off" : "Turn on" }}><Power className="size-3.5" /> {kill ? "Turn off" : "Turn on"}</ActionButton>}
        </div>
      </Section>
      <Section title="Spending limits" description="Per currency. A launch cannot be switched on above these. Amounts are in the currency's normal unit (rupees, dollars). Empty means no limit of that kind.">
        {rows.length === 0 && <Note tone="warn">No currency has limits. Until you add one (or allow launches without limits below), nothing can be switched on.</Note>}
        {rows.map((r, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border/50 p-3">
            <div className="flex items-end justify-between gap-2">
              <div className="space-y-1.5"><label htmlFor={`g-cur-${i}`} className="block text-xs font-medium">Currency</label><Input id={`g-cur-${i}`} value={r.currency} maxLength={3} placeholder="INR" onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, currency: e.target.value.toUpperCase() } : y)))} className="w-24" /></div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /> Remove</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5"><label htmlFor={`g-${f.key}-${i}`} className="block text-xs font-medium">{f.label}</label><Input id={`g-${f.key}-${i}`} inputMode="decimal" value={r[f.key]} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, [f.key]: e.target.value } : y)))} /><p className="text-[11px] text-muted-foreground">{f.help}</p></div>
              ))}
            </div>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => setRows((x) => [...x, { currency: "", maxDailyPerLaunch: "", maxTotalPerLaunch: "", companyDaily: "", companyMonthly: "", approvalThreshold: "" }])}><Plus className="size-3.5" /> Add a currency</Button>
        <CheckRow id="g-second" checked={second} onChange={setSecond} label="Require a second approver above the threshold" help="The person who created a launch cannot approve it when its budget is above the threshold." />
        <CheckRow id="g-uncapped" checked={uncapped} onChange={setUncapped} label="Allow launches in a currency that has no limits" help="Not recommended: a currency without limits has no ceiling." />
        {err && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{err}</p>}
        {!canManage && <Note tone="warn">Changing the limits needs the &quot;Manage ad spending limits&quot; permission, which is separate from approving spend. You can look at them here.</Note>}
        <Button type="button" disabled={busy || !canManage} onClick={() => void save()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save limits</Button>
      </Section>
    </div>
  );
}
