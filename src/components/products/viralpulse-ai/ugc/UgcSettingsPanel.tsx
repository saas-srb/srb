"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Minus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/products/viralpulse-ai/SmmsBits";
import { SectionCard } from "@/components/products/viralpulse-ai/SmmsUi";
import { saveUgcSettingsAction } from "@/app/(products)/viralpulse-ai/(protected)/ugc/actions";
import { formatUsd, settingsPatch, validateSettings, type SettingsForm } from "@/lib/products/viralpulse-ai/ugc/ui-helpers";
import type { UgcConnections } from "@/lib/products/viralpulse-ai/ugc/api";
import type { UgcSettings } from "@/lib/products/viralpulse-ai/ugc/store";

function Status({ ok, title, onText, offText, fix }: { ok: boolean; title: string; onText: string; offText: string; fix?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/40 bg-background/60 p-3">
      <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${ok ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"}`}>{ok ? <Check className="size-3.5" /> : <Minus className="size-3.5" />}</span>
      <div className="min-w-0 space-y-0.5 text-xs">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-muted-foreground">{ok ? onText : offText}</p>
        {!ok && fix}
      </div>
    </div>
  );
}

export default function UgcSettingsPanel({ settings, connections, spentTodayUsd, spentMonthUsd }: { settings: UgcSettings; connections: UgcConnections; spentTodayUsd: number; spentMonthUsd: number }) {
  const router = useRouter();
  const [f, setF] = useState<SettingsForm>({
    enabled: settings.enabled,
    dailySpendCapUsd: String(settings.dailySpendCapUsd),
    approvalThresholdUsd: String(settings.approvalThresholdUsd),
    pricePerSecUsd: settings.pricePerSecUsd === null ? "" : String(settings.pricePerSecUsd),
    maxConcurrentJobs: String(settings.maxConcurrentJobs),
    aiLabelDefault: settings.aiLabelDefault,
  });
  const [pending, start] = useTransition();
  const errors = validateSettings(f);
  const set = (patch: Partial<SettingsForm>) => setF((x) => ({ ...x, ...patch }));
  const link = <Link href="/viralpulse-ai/settings?tab=integrations" className="font-semibold text-primary underline">Open Settings → Integrations</Link>;

  return (
    <div className="space-y-4">
      <SectionCard title="Connections" description="What the studio needs. Keys are kept on the server and are never shown here.">
        <div className="grid gap-3 md:grid-cols-3">
          <Status ok={connections.video} title="Google Gemini (video)" onText="Connected. Videos are billed to your own Google account." offText="Not connected. Nobody can generate video until it is, but scripts can still be written and edited." fix={link} />
          <Status ok={connections.scripts} title="OpenAI (scripts)" onText="Connected. Scripts are written with your OpenAI key and count toward your plan's AI allowance." offText="Not connected. Scripts can't be written or rewritten; existing scripts can still be edited." fix={link} />
          <Status ok={connections.assembly} title="Video assembly (ffmpeg)" onText="Available. Scenes are joined into one video with captions and the AI label." offText="Not set up on this server. Scenes are saved as separate clips. Install ffmpeg and set FFMPEG_PATH, or add the ffmpeg-static package, then retry the assembly." />
        </div>
      </SectionCard>

      <SectionCard title="Spend and limits" description={`Spent today ${formatUsd(spentTodayUsd)}, this month ${formatUsd(spentMonthUsd)}. Days run on India time.`}>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (Object.keys(errors).length) { toast.error(Object.values(errors)[0]); return; }
            start(async () => {
              const r = await saveUgcSettingsAction(settingsPatch(f));
              if (!r.ok) toast.error(r.error);
              else { toast.success("Studio settings saved."); router.refresh(); }
            });
          }}
        >
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.enabled} onCheckedChange={(c) => set({ enabled: c === true })} /> AI UGC Studio is switched on for this workspace</label>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Daily spend limit (USD)" htmlFor="ugc-cap" hint={errors.dailySpendCapUsd ?? "Total estimated plus actual video spend per day. 0 stops all generation."}><Input id="ugc-cap" inputMode="decimal" value={f.dailySpendCapUsd} aria-invalid={!!errors.dailySpendCapUsd} onChange={(e) => set({ dailySpendCapUsd: e.target.value })} /></Field>
            <Field label="Manager approval above (USD)" htmlFor="ugc-thr" hint={errors.approvalThresholdUsd ?? "A video that costs more needs someone who can publish to approve it. 0 means every video."}><Input id="ugc-thr" inputMode="decimal" value={f.approvalThresholdUsd} aria-invalid={!!errors.approvalThresholdUsd} onChange={(e) => set({ approvalThresholdUsd: e.target.value })} /></Field>
            <Field label="Your rate per second (USD)" htmlFor="ugc-rate" hint={errors.pricePerSecUsd ?? "Leave empty to use the built-in price. Set it if your Google contract differs."}><Input id="ugc-rate" inputMode="decimal" placeholder="Built-in" value={f.pricePerSecUsd} aria-invalid={!!errors.pricePerSecUsd} onChange={(e) => set({ pricePerSecUsd: e.target.value })} /></Field>
            <Field label="Scenes rendered at once" htmlFor="ugc-conc" hint={errors.maxConcurrentJobs ?? "Between 1 and 20. Lower is gentler on your Google quota."}><Input id="ugc-conc" inputMode="numeric" value={f.maxConcurrentJobs} aria-invalid={!!errors.maxConcurrentJobs} onChange={(e) => set({ maxConcurrentJobs: e.target.value })} /></Field>
          </div>
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={f.aiLabelDefault} onCheckedChange={(c) => set({ aiLabelDefault: c === true })} className="mt-0.5" /><span>Show the “AI generated” label on screen by default<span className="block text-xs text-muted-foreground">People can still move it (top or bottom, left or right) or switch it off per video, and every file stays marked as AI-generated in the media library.</span></span></label>
          <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save settings</Button>
        </form>
      </SectionCard>
    </div>
  );
}
