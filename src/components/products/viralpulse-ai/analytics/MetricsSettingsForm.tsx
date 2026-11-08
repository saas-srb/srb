"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveMetricsSettingsAction } from "@/app/(products)/viralpulse-ai/(protected)/analytics/actions";
import type { MetricsSettings } from "@/lib/products/viralpulse-ai/metrics/types";

const INPUT = "w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export default function MetricsSettingsForm({ initial, canEdit }: { initial: MetricsSettings; canEdit: boolean }) {
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  const num = (k: "retentionDays" | "recentPostDays" | "olderPostDays" | "youtubeDailyUnitCap", label: string, hint: string) => (
    <label className="space-y-1 text-xs"><span className="font-medium">{label}</span>
      <input type="number" className={INPUT} disabled={!canEdit} value={s[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
      <span className="block text-[11px] text-muted-foreground">{hint}</span></label>
  );
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveMetricsSettingsAction({ retentionDays: s.retentionDays, recentPostDays: s.recentPostDays, olderPostDays: s.olderPostDays, youtubeDailyUnitCap: s.youtubeDailyUnitCap, xEnabled: s.x.enabled, xMaxPostsPerRun: s.x.maxPostsPerRun, xMinHoursBetween: s.x.minHoursBetween }); if (r.ok) toast.success("Saved."); else toast.error(r.error); }); }}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {num("retentionDays", "Keep daily history (days)", "Older snapshots are deleted once a day. 90 to 3650.")}
        {num("recentPostDays", "Recent posts (days)", "Posts this new are re-read on every run (every 3 hours).")}
        {num("olderPostDays", "Older posts (days)", "Posts up to this age are re-read once a day.")}
        {num("youtubeDailyUnitCap", "YouTube quota we may use per day", "Of the project's 10,000 default units. Each read costs 1 unit.")}
      </div>
      <fieldset className="space-y-2 rounded-xl border border-border/40 p-3" disabled={!canEdit}>
        <legend className="px-1 text-xs font-semibold">X (billed per post read)</legend>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={s.x.enabled} onChange={(e) => setS({ ...s, x: { ...s.x, enabled: e.target.checked } })} /> Read X post metrics (X charges for every post read; off until you switch it on)</label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs"><span className="font-medium">Most posts per run</span><input type="number" className={INPUT} value={s.x.maxPostsPerRun} onChange={(e) => setS({ ...s, x: { ...s.x, maxPostsPerRun: Number(e.target.value) } })} /></label>
          <label className="space-y-1 text-xs"><span className="font-medium">Hours between reads</span><input type="number" className={INPUT} value={s.x.minHoursBetween} onChange={(e) => setS({ ...s, x: { ...s.x, minHoursBetween: Number(e.target.value) } })} /></label>
        </div>
      </fieldset>
      {canEdit ? <Button type="submit" size="sm" disabled={pending}>Save settings</Button> : <p className="text-[11px] text-muted-foreground">Only people who manage integrations can change these.</p>}
    </form>
  );
}
