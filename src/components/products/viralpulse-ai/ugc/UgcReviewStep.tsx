"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Clock, Copy, Loader2, Rocket, ShieldAlert, Tags } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { estimatePlan } from "@/lib/products/viralpulse-ai/ugc/pricing";
import { approvalState, capBar, checkScript, costRows, explainFinding, formatUsd, PLATFORM_CHOICES } from "@/lib/products/viralpulse-ai/ugc/ui-helpers";
import type { ProjectView } from "@/lib/products/viralpulse-ai/ugc/api";
import { postGuidance, PLATFORMS } from "@/lib/products/viralpulse-ai/ugc/styles";
import type { Platform, UgcStyle } from "@/lib/products/viralpulse-ai/ugc/styles";
import type { UgcOptions } from "@/lib/products/viralpulse-ai/ugc/types";
import type { UgcSettings } from "@/lib/products/viralpulse-ai/ugc/store";
import { formatDateTime } from "@/lib/utils";

const POSITIONS: { value: UgcOptions["aiLabel"]["position"]; label: string }[] = [
  { value: "top-right", label: "Top right" },
  { value: "top-left", label: "Top left" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
];

export default function UgcReviewStep({
  project, style, settings, spentTodayUsd, videoConnected, canManageIntegrations, canApprove, platform, busy, onOptions, onApprove, blockedReason,
}: {
  project: ProjectView;
  style: UgcStyle | null;
  settings: UgcSettings;
  spentTodayUsd: number;
  videoConnected: boolean;
  canManageIntegrations: boolean;
  canApprove: boolean;
  platform: string;
  busy: boolean;
  onOptions: (patch: Partial<Pick<UgcOptions, "burnCaptions"> & { aiLabel: UgcOptions["aiLabel"] }>) => void;
  onApprove: (acknowledge: string[]) => void;
  /** A reason the script isn't ready (unsaved edits, stale script, ...), or null. */
  blockedReason: string | null;
}) {
  const plan = project.plan;
  const [ack, setAck] = useState<Record<string, boolean>>({});
  const [conf, setConf] = useState({ images: false, claims: false, label: false });
  const [suffixPlatform, setSuffixPlatform] = useState(platform);

  const est = useMemo(() => (plan ? estimatePlan(plan, project.options.provider, project.options.model, settings.pricePerSecUsd, project.planVersion) : null), [plan, project.options.provider, project.options.model, settings.pricePerSecUsd, project.planVersion]);
  const check = useMemo(() => (plan ? checkScript(plan, style, project.options.provider, project.providedFacts) : null), [plan, style, project.options.provider, project.providedFacts]);
  if (!plan || !est || !check) return <p className="text-sm text-muted-foreground">Write and save the script first.</p>;

  const hasImages = project.references.length > 0;
  const approval = approvalState({ estimateUsd: est.usd, thresholdUsd: settings.approvalThresholdUsd, dailyCapUsd: settings.dailySpendCapUsd, spentTodayUsd, canApprove, requested: !!project.pendingApproval });
  const bar = capBar(spentTodayUsd, est.usd, settings.dailySpendCapUsd);
  const rows = costRows(est.perScene);
  const flags = check.policy.flagged;
  const allAck = flags.every((f) => ack[f.code]);
  const confirmed = (!hasImages || conf.images) && conf.claims && conf.label;
  const suffix = project.disclosure.platforms.find((p) => p.platform === suffixPlatform) ?? project.disclosure.platforms[0];
  const reasons: string[] = [];
  if (blockedReason) reasons.push(blockedReason);
  if (!check.ok) reasons.push("Fix the script problems marked in red on the previous step.");
  if (check.policy.blocked.length) reasons.push("Resolve the blocked content points on the previous step.");
  if (!videoConnected) reasons.push("Google Gemini isn't connected, so video can't be generated.");
  if (approval.kind === "off" || approval.kind === "over_cap" || approval.kind === "pending") reasons.push(approval.message);
  if (!allAck) reasons.push("Tick each point under “Please check”.");
  if (!confirmed) reasons.push("Tick the confirmations below.");
  const ready = reasons.length === 0;
  const cta = approval.kind === "needs_manager" ? "Ask a manager to approve" : "Approve and generate";

  const guide = style ? postGuidance(style.id, (PLATFORMS as string[]).includes(suffixPlatform) ? (suffixPlatform as Platform) : "instagram", project.options.language ?? "en") : null;
  return (
    <div className="space-y-6">
      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Style", style?.label ?? project.styleId],
          ["Length", `${est.totalSecs} s · ${plan.scenes.length} scenes · ${project.options.aspect}`],
          ["Language", project.options.language],
          ["Video model", `${project.capabilities.label} (${project.options.model})`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border/40 bg-background/60 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{k}</p>
            <p className="text-sm font-semibold break-words">{v}</p>
          </div>
        ))}
      </section>

      <section aria-label="Cost estimate" className="space-y-3 rounded-2xl border border-border/40 bg-card/60 p-3 sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold">Estimated cost</h3>
            <p className="text-xs text-muted-foreground">{`${project.capabilities.label}, billed to your own Google account per second of video${settings.pricePerSecUsd ? ` at your rate of ${formatUsd(settings.pricePerSecUsd)}/s` : ""}. The final figure uses each clip's real length.`}</p>
          </div>
          <p className="text-2xl font-bold tabular-nums">{formatUsd(est.usd)}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Scene</th><th className="py-1 font-medium">Length</th><th className="py-1 text-right font-medium">Cost</th></tr></thead>
            <tbody>
              {rows.map((r) => <tr key={r.label} className="border-t border-border/30"><td className="py-1.5">{r.label}</td><td className="py-1.5 tabular-nums">{r.secs} s</td><td className="py-1.5 text-right tabular-nums">{formatUsd(r.usd)}</td></tr>)}
              <tr className="border-t border-border/60 font-semibold"><td className="py-1.5">Total</td><td className="py-1.5 tabular-nums">{est.totalSecs} s</td><td className="py-1.5 text-right tabular-nums">{formatUsd(est.usd)}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-muted-foreground"><span>{`Today: ${formatUsd(spentTodayUsd)} used of ${formatUsd(settings.dailySpendCapUsd)}`}</span><span>{bar.over ? "Over the daily limit" : `${formatUsd(Math.max(0, settings.dailySpendCapUsd - spentTodayUsd - est.usd))} left after this`}</span></div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(bar.spentPct)}% of today's limit used, this video adds ${Math.round(bar.addPct)}%`}>
            <div className="bg-muted-foreground/50" style={{ width: `${bar.spentPct}%` }} />
            <div className={bar.over ? "bg-rose-500" : "bg-primary"} style={{ width: `${bar.over ? 100 - bar.spentPct : bar.addPct}%` }} />
          </div>
        </div>
        <div className={`flex items-start gap-2 rounded-xl p-3 text-xs ${approval.kind === "ok" ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200" : approval.kind === "needs_manager" || approval.kind === "pending" ? "bg-amber-500/10 text-amber-900 dark:text-amber-200" : "bg-rose-500/10 text-rose-900 dark:text-rose-200"}`}>
          {approval.kind === "ok" ? <Check className="mt-0.5 size-4 shrink-0" /> : approval.kind === "pending" ? <Clock className="mt-0.5 size-4 shrink-0" /> : <ShieldAlert className="mt-0.5 size-4 shrink-0" />}
          <div>
            <p className="font-semibold">{approval.kind === "ok" ? "Ready to approve" : approval.kind === "needs_manager" ? "Needs a manager" : approval.kind === "pending" ? "Waiting for a manager" : "Can't generate yet"}</p>
            <p>{approval.message}</p>
            {project.pendingApproval && <p className="mt-0.5 opacity-80">{`Requested ${formatDateTime(new Date(project.pendingApproval.at))} for about ${formatUsd(project.pendingApproval.estimateUsd)}.`}</p>}
            {approval.kind === "off" && canManageIntegrations && <Link href="/viralpulse-ai/ugc/settings" className="font-semibold underline">Open Studio settings</Link>}
          </div>
        </div>
      </section>

      {guide && (
        <section aria-label="Posting guidance" className="space-y-2 rounded-2xl border border-border/40 bg-card/60 p-3 sm:p-4">
          <h3 className="text-sm font-bold">{`Posting on ${guide.platformLabel}`}</h3>
          <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
            <div><dt className="font-semibold">Aspect</dt><dd className="text-muted-foreground">{`${guide.aspect}. ${guide.aspectNote}`}</dd></div>
            <div><dt className="font-semibold">Length</dt><dd className="text-muted-foreground">{guide.lengthNote}</dd></div>
            <div><dt className="font-semibold">Subtitles</dt><dd className="text-muted-foreground">{guide.subtitlesNote}</dd></div>
            <div><dt className="font-semibold">Pacing</dt><dd className="text-muted-foreground">{guide.pacing}</dd></div>
            <div><dt className="font-semibold">Hook</dt><dd className="text-muted-foreground">{guide.hookFormula}</dd></div>
            <div><dt className="font-semibold">Hashtags</dt><dd className="text-muted-foreground">{`${guide.hashtagCount.max === 0 ? "None needed" : `${guide.hashtagCount.min}-${guide.hashtagCount.max}`}. ${guide.hashtagNote}`}</dd></div>
            <div className="sm:col-span-2"><dt className="font-semibold">Call to action</dt><dd className="text-muted-foreground">{guide.ctaGuideline}</dd></div>
          </dl>
          <div className="space-y-1">
            <p className="text-xs font-semibold">Caption skeleton (fill the blanks from your brief)</p>
            <pre className="whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-xs">{`${guide.captionSkeleton}\n\n${guide.aiLabel.captionSuffix}`}</pre>
            <p className="text-[11px] text-muted-foreground">{`${guide.aiLabel.action} ${guide.limitsNote}`}</p>
          </div>
        </section>
      )}

      <section aria-label="AI disclosure" className="space-y-3 rounded-2xl border border-border/40 bg-card/60 p-3 sm:p-4">
        <div className="flex items-start gap-2"><Tags className="mt-0.5 size-4 shrink-0 text-primary" /><div><h3 className="text-sm font-bold">AI disclosure</h3><p className="text-xs text-muted-foreground">Realistic AI video should be labelled. Every file is marked as AI-generated inside your media library, and that mark can&apos;t be removed.</p></div></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={project.options.aiLabel.enabled} disabled={busy} onCheckedChange={(c) => onOptions({ aiLabel: { ...project.options.aiLabel, enabled: c === true } })} /> Show “AI generated” on screen</label>
          <OptionSelect value={project.options.aiLabel.position} disabled={busy || !project.options.aiLabel.enabled} onChange={(v) => onOptions({ aiLabel: { ...project.options.aiLabel, position: v as UgcOptions["aiLabel"]["position"] } })} options={POSITIONS} aria-label="Label position" />
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={project.options.burnCaptions} disabled={busy} onCheckedChange={(c) => onOptions({ burnCaptions: c === true })} /> Burn captions into the video</label>
        </div>
        {!project.options.aiLabel.enabled && <p className="text-xs text-amber-700 dark:text-amber-300">With the on-screen label off, you must add the label in your caption and the platform&apos;s own AI setting when you post.</p>}
        {project.illustrative && <p className="text-xs text-muted-foreground">{`This script reads like a customer review, so the video also carries the notice “${project.disclosure.illustrativeNotice}”.`}</p>}
        <div className="space-y-2">
          <p className="text-xs font-medium">Caption line to add when you post</p>
          <OptionSelect value={suffix?.platform ?? ""} onChange={setSuffixPlatform} options={PLATFORM_CHOICES.map((p) => ({ value: p.value, label: p.label }))} aria-label="Platform for the caption line" />
          {suffix && (
            <div className="space-y-1 rounded-xl bg-muted/40 p-3 text-xs">
              <div className="flex items-start justify-between gap-2"><code className="break-words">{suffix.captionSuffix}</code>
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Copy caption line" onClick={() => { void navigator.clipboard.writeText(suffix.captionSuffix).then(() => toast.success("Copied")).catch(() => toast.error("Couldn't copy")); }}><Copy className="size-3" /></Button>
              </div>
              <p className="text-muted-foreground">{suffix.action}</p>
            </div>
          )}
        </div>
      </section>

      {flags.length > 0 && (
        <section aria-label="Please check" className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3 sm:p-4">
          <h3 className="text-sm font-bold">Please check</h3>
          {flags.map((f) => {
            const e = explainFinding(f);
            return (
              <label key={f.code} className="flex items-start gap-2 text-xs">
                <Checkbox checked={!!ack[f.code]} onCheckedChange={(c) => setAck((a) => ({ ...a, [f.code]: c === true }))} className="mt-0.5" />
                <span><strong>{e.title}</strong> {e.fix} I&apos;ve checked this.</span>
              </label>
            );
          })}
        </section>
      )}

      <section aria-label="Confirmations" className="space-y-2 rounded-2xl border border-border/40 bg-card/60 p-3 sm:p-4">
        <h3 className="text-sm font-bold">Before you generate</h3>
        <label className={`flex items-start gap-2 text-xs ${hasImages ? "" : "opacity-60"}`}><Checkbox checked={conf.images} disabled={!hasImages} onCheckedChange={(c) => setConf((x) => ({ ...x, images: c === true }))} className="mt-0.5" /><span>{hasImages ? "I have the right to use the attached photos and images in an advertisement." : "No photos or images are attached, so there is nothing to confirm here."}</span></label>
        <label className="flex items-start gap-2 text-xs"><Checkbox checked={conf.claims} onCheckedChange={(c) => setConf((x) => ({ ...x, claims: c === true }))} className="mt-0.5" /><span>The claims in this video come from my brief, and I can stand behind each of them.</span></label>
        <label className="flex items-start gap-2 text-xs"><Checkbox checked={conf.label} onCheckedChange={(c) => setConf((x) => ({ ...x, label: c === true }))} className="mt-0.5" /><span>This video will be labelled as AI-generated wherever I publish it.</span></label>
      </section>

      <div className="space-y-2">
        {reasons.length > 0 && (
          <ul className="space-y-0.5 text-xs text-muted-foreground" aria-label="What's left before you can generate">{reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
        )}
        {!videoConnected && canManageIntegrations && <Link href="/viralpulse-ai/settings?tab=integrations" className="text-xs font-semibold text-primary underline">Connect Google Gemini in Settings → Integrations</Link>}
        <Button type="button" size="lg" disabled={!ready || busy} onClick={() => onApprove(flags.map((f) => f.code))}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} {cta}
        </Button>
        <p className="text-[11px] text-muted-foreground">{approval.kind === "needs_manager" ? "A manager will get a notification and can approve from this video's page." : "Generation runs in the background. You can leave this page; the video appears in your list when it's done."}</p>
      </div>
    </div>
  );
}
