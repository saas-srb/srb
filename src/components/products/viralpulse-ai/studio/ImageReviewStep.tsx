"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Clock, Loader2, Rocket, ShieldAlert, Tags } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import FormatIllustration from "@/components/products/viralpulse-ai/studio/FormatIllustration";
import type { StudioConfig } from "@/components/products/viralpulse-ai/studio/config";
import { goalById, specByKey } from "@/lib/products/viralpulse-ai/images/specs";
import { approvalState, capBar, explainFinding, formatUsd } from "@/lib/products/viralpulse-ai/ugc/ui-helpers";
import { policyOf, ratioLabel, reviewReasons, validateStep, type Confirmations, type EstimateView } from "@/lib/products/viralpulse-ai/images/wizard";
import type { Brief } from "@/lib/products/viralpulse-ai/images/types";
import { formatDateTime } from "@/lib/utils";

export default function ImageReviewStep({ brief, set, config, estimate, estimating, pendingApproval, busy, quick, canGenerate, onApprove }: {
  brief: Brief;
  set: (patch: Partial<Brief>) => void;
  config: StudioConfig;
  estimate: EstimateView | null;
  estimating: boolean;
  pendingApproval: { estimateUsd: number; at: string } | null;
  busy: boolean;
  quick: boolean;
  canGenerate: boolean;
  onApprove: (acknowledge: string[]) => void;
}) {
  const goal = goalById(brief.goalId)!;
  const [ack, setAck] = useState<Record<string, boolean>>({});
  const [conf, setConf] = useState<Confirmations>({ claims: false, rights: false, label: false });
  const policy = useMemo(() => policyOf(brief), [brief]);
  const errors = useMemo(() => validateStep(brief, "review", { maxVariants: config.settings.maxVariants, providers: config.providers }), [brief, config]);
  const usd = estimate?.totalUsd ?? 0;
  const approval = approvalState({ estimateUsd: usd, thresholdUsd: config.settings.approvalThresholdUsd, dailyCapUsd: config.settings.dailySpendCapUsd, spentTodayUsd: config.spentTodayUsd, canApprove: config.canApprove, requested: !!pendingApproval });
  const bar = capBar(config.spentTodayUsd, usd, config.settings.dailySpendCapUsd);
  const hasRefs = brief.referenceIds.length > 0;
  const flags = policy.flagged;
  const r = reviewReasons({ errors, policy, acknowledged: flags.filter((f) => ack[f.code]).map((f) => f.code), confirmations: conf, hasReferences: hasRefs, approvalKind: approval.kind === "needs_manager" ? "needs_manager" : approval.kind, approvalMessage: approval.message, providerOk: config.providers[brief.provider] });
  const reasons = [...r.reasons];
  if (!estimate && !estimating) reasons.push("The cost couldn't be worked out. Go back one step and try again.");
  if (estimating) reasons.push("Working out the cost…");
  if (!canGenerate) reasons.push("You don't have permission to generate images.");
  const ready = reasons.length === 0;
  const specs = brief.specKeys.map((k) => specByKey(k)).filter((s): s is NonNullable<typeof s> => !!s);
  const cta = approval.kind === "needs_manager" ? "Ask a manager to approve" : quick ? "Generate" : "Approve and generate";
  const images = estimate?.images ?? brief.variants;

  return (
    <div className="space-y-6">
      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Format", goal.label],
          ["Sizes", specs.map((s) => `${s.group} ${ratioLabel(s.width, s.height)}`).join(", ")],
          ["Pictures", goal.slides ? `${images} slides` : `${images} option${images === 1 ? "" : "s"}`],
          ["Model", `${brief.provider === "gemini" ? "Gemini" : "OpenAI"} (${estimate?.model ?? config.models[brief.provider]})${brief.provider === "openai" ? `, ${brief.quality}` : ""}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border/40 bg-background/60 px-3 py-2"><p className="text-[11px] text-muted-foreground">{k}</p><p className="text-sm font-semibold break-words">{v}</p></div>
        ))}
      </section>

      {specs.length > 0 && (
        <section aria-label="Layout of each size" className="space-y-2">
          <h3 className="text-sm font-bold">Where your text will land</h3>
          <ul className="flex flex-wrap gap-3">
            {specs.slice(0, 6).map((s) => <li key={s.key} className="w-24 text-center"><FormatIllustration spec={s} textPosition={brief.textPosition} showText={brief.overlayText.some((t) => t.trim()) } className="max-h-28" /><p className="mt-1 truncate text-[10px] text-muted-foreground">{s.label}</p></li>)}
          </ul>
        </section>
      )}

      <section aria-label="Cost estimate" className="space-y-3 rounded-2xl border border-border/40 bg-card/60 p-3 sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h3 className="text-sm font-bold">Estimated cost</h3><p className="text-xs text-muted-foreground">Billed to your own account per picture. The final figure uses what the provider reports.</p></div>
          <p className="text-2xl font-bold tabular-nums">{estimate ? formatUsd(usd) : "–"}</p>
        </div>
        {estimate && (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Item</th><th className="py-1 font-medium">Pictures</th><th className="py-1 text-right font-medium">Cost</th></tr></thead>
            <tbody>
              <tr className="border-t border-border/30"><td className="py-1.5">{`${formatUsd(estimate.perImageUsd)} per picture`}</td><td className="py-1.5 tabular-nums">{images}</td><td className="py-1.5 text-right tabular-nums">{formatUsd(usd)}</td></tr>
              <tr className="border-t border-border/60 font-semibold"><td className="py-1.5">Total</td><td className="py-1.5 tabular-nums">{images}</td><td className="py-1.5 text-right tabular-nums">{formatUsd(usd)}</td></tr>
            </tbody>
          </table>
        )}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-muted-foreground"><span>{`Today: ${formatUsd(config.spentTodayUsd)} used of ${formatUsd(config.settings.dailySpendCapUsd)}`}</span><span>{bar.over ? "Over the daily limit" : `${formatUsd(Math.max(0, config.settings.dailySpendCapUsd - config.spentTodayUsd - usd))} left after this`}</span></div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(bar.spentPct)}% of today's limit used, this adds ${Math.round(bar.addPct)}%`}>
            <div className="bg-muted-foreground/50" style={{ width: `${bar.spentPct}%` }} />
            <div className={bar.over ? "bg-rose-500" : "bg-primary"} style={{ width: `${bar.over ? 100 - bar.spentPct : bar.addPct}%` }} />
          </div>
        </div>
        <div className={`flex items-start gap-2 rounded-xl p-3 text-xs ${approval.kind === "ok" ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200" : approval.kind === "needs_manager" || approval.kind === "pending" ? "bg-amber-500/10 text-amber-900 dark:text-amber-200" : "bg-rose-500/10 text-rose-900 dark:text-rose-200"}`}>
          {approval.kind === "ok" ? <Check className="mt-0.5 size-4 shrink-0" /> : approval.kind === "pending" ? <Clock className="mt-0.5 size-4 shrink-0" /> : <ShieldAlert className="mt-0.5 size-4 shrink-0" />}
          <div>
            <p className="font-semibold">{approval.kind === "ok" ? "Ready to approve" : approval.kind === "needs_manager" ? "Needs a manager" : approval.kind === "pending" ? "Waiting for a manager" : "Can't generate yet"}</p>
            <p>{approval.message.replace(/Video generation/, "Image generation").replace(/This video/g, "This")}</p>
            {pendingApproval && <p className="mt-0.5 opacity-80">{`Requested ${formatDateTime(new Date(pendingApproval.at))} for about ${formatUsd(pendingApproval.estimateUsd)}.`}</p>}
          </div>
        </div>
      </section>

      <section aria-label="AI disclosure" className="space-y-3 rounded-2xl border border-border/40 bg-card/60 p-3 sm:p-4">
        <div className="flex items-start gap-2"><Tags className="mt-0.5 size-4 shrink-0 text-primary" /><div><h3 className="text-sm font-bold">AI disclosure</h3><p className="text-xs text-muted-foreground">Every saved file says inside its metadata that it is AI generated, and that mark can&apos;t be removed. Choose what else to show.</p></div></div>
        <label className="flex items-start gap-2 text-sm"><Checkbox className="mt-0.5" checked={brief.badge ?? policy.suggestAiBadge} disabled={busy} onCheckedChange={(c) => set({ badge: c === true })} /> <span>Show an &ldquo;AI generated&rdquo; badge on the picture{policy.suggestAiBadge ? " (recommended: this may look like a real photo of people)" : ""}</span></label>
        {config.logo && <label className="flex items-start gap-2 text-sm"><Checkbox className="mt-0.5" checked={!!brief.applyLogo && brief.applyKit} disabled={busy || !brief.applyKit} onCheckedChange={(c) => set({ applyLogo: c === true })} /> <span>Place the brand logo on the exports</span></label>}
        {!(brief.badge ?? policy.suggestAiBadge) && <p className="text-xs text-amber-700 dark:text-amber-300">With the badge off, say it is AI generated in your caption and in the platform&apos;s own AI setting when you post.</p>}
      </section>

      <section aria-label="Policy check" className="space-y-2 rounded-2xl border border-border/40 bg-card/60 p-3 sm:p-4">
        <h3 className="text-sm font-bold">Content check</h3>
        {policy.blocked.length === 0 && flags.length === 0 ? <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300"><Check className="size-3.5" /> Nothing in the brief or the text breaks the image rules.</p> : null}
        {policy.blocked.map((f) => <p key={f.code} role="alert" className="flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-300"><ShieldAlert className="mt-0.5 size-3.5 shrink-0" /> <span><strong>{explainFinding(f).title}</strong> {explainFinding(f).fix}</span></p>)}
        {flags.length > 0 && (
          <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-sm font-bold">Please check</p>
            {flags.map((f) => { const e = explainFinding(f); return <label key={f.code} className="flex items-start gap-2 text-xs"><Checkbox className="mt-0.5" checked={!!ack[f.code]} onCheckedChange={(c) => setAck((a) => ({ ...a, [f.code]: c === true }))} /><span><strong>{e.title}</strong> {e.fix} I&apos;ve checked this.</span></label>; })}
          </div>
        )}
      </section>

      <section aria-label="Confirmations" className="space-y-2 rounded-2xl border border-border/40 bg-card/60 p-3 sm:p-4">
        <h3 className="text-sm font-bold">Before you generate</h3>
        <label className={`flex items-start gap-2 text-xs ${hasRefs ? "" : "opacity-60"}`}><Checkbox className="mt-0.5" checked={conf.rights} disabled={!hasRefs} onCheckedChange={(c) => setConf((x) => ({ ...x, rights: c === true }))} /><span>{hasRefs ? "I have the right to use the reference pictures in an advertisement." : "No reference pictures are attached, so there is nothing to confirm here."}</span></label>
        <label className="flex items-start gap-2 text-xs"><Checkbox className="mt-0.5" checked={conf.claims} onCheckedChange={(c) => setConf((x) => ({ ...x, claims: c === true }))} /><span>Every word, price and date I typed for the picture is correct, and I can stand behind it.</span></label>
        <label className="flex items-start gap-2 text-xs"><Checkbox className="mt-0.5" checked={conf.label} onCheckedChange={(c) => setConf((x) => ({ ...x, label: c === true }))} /><span>I will mark this picture as AI generated wherever I publish it.</span></label>
      </section>

      <div className="space-y-2">
        {reasons.length > 0 && <ul className="space-y-0.5 text-xs text-muted-foreground" aria-label="What's left before you can generate">{reasons.map((x) => <li key={x}>• {x}</li>)}</ul>}
        {!config.providers[brief.provider] && <Link href="/viralpulse-ai/settings?tab=integrations" className="text-xs font-semibold text-primary underline">Connect it in Settings, Integrations</Link>}
        <Button type="button" size="lg" disabled={!ready || busy} onClick={() => onApprove(flags.map((f) => f.code))}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} {cta}</Button>
        <p className="text-[11px] text-muted-foreground">{approval.kind === "needs_manager" ? "A manager gets a notification and can approve from this project's page." : "Pictures are drawn in the background. You can leave the page; the project keeps going and shows up in Projects."}</p>
      </div>
    </div>
  );
}
