"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Sparkles, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/products/viralpulse-ai/ugc/UgcBits";
import { mediaSrc } from "@/components/products/viralpulse-ai/SmmsBits";
import { deleteStyleSampleAction, requestStyleSampleAction, styleSampleQuoteAction } from "@/app/(products)/viralpulse-ai/(protected)/ugc/actions";
import { SAMPLE_BADGE, type SampleQuote, type SampleView } from "@/lib/products/viralpulse-ai/ugc/sample";
import { previewSeed } from "@/lib/products/viralpulse-ai/ugc/styles/preview";
import type { UgcStyle } from "@/lib/products/viralpulse-ai/ugc/styles";

/** The real sample clip of a style: shown when it exists, otherwise an explicit, confirmed, paid way to make one. Never starts by itself. */
export function SampleVideo({ sample, className }: { sample: SampleView; className?: string }) {
  if (!sample.mediaId) return null;
  return (
    <div className={className}>
      <div className="relative mx-auto w-full max-w-[15rem] overflow-hidden rounded-[1.75rem] border-[6px] border-foreground/80 bg-black shadow-xl">
        <div className="relative aspect-[9/16]">
          <video src={mediaSrc(sample.mediaId)} poster={sample.thumbnailId ? mediaSrc(sample.thumbnailId) : undefined} controls playsInline preload="metadata" className="absolute inset-0 size-full bg-black object-contain" aria-label="AI-generated sample clip of this style" />
          <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-bold text-white">{SAMPLE_BADGE}</span>
        </div>
      </div>
    </div>
  );
}

export default function UgcStyleSample({ style, seedN, sample, onChanged, canGenerate = true }: { style: UgcStyle; seedN: number; sample: SampleView | null; onChanged: () => void; canGenerate?: boolean }) {
  const seed = previewSeed(seedN);
  const [quote, setQuote] = useState<SampleQuote | null>(null);
  const [replace, setReplace] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [acks, setAcks] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const open = (isReplace: boolean) => {
    setError(null); setConfirmed(false); setAcks([]); setReplace(isReplace);
    start(async () => {
      const r = await styleSampleQuoteAction(style.id, seed);
      if (r.ok) setQuote(r.quote); else setError(r.error);
    });
  };
  const submit = () => {
    if (!quote) return;
    setError(null);
    start(async () => {
      const r = await requestStyleSampleAction(style.id, seed, { confirmUsd: quote.estimateUsd, replace, acknowledgeFlags: acks });
      if (!r.ok) { setError(r.error); return; }
      const o = r.result.outcome;
      if (o === "needs_manager") toast.info(`Sent to a manager: about $${r.result.estimateUsd.toFixed(2)} is over the $${r.result.thresholdUsd.toFixed(2)} limit.`);
      else if (o === "started") toast.success("Sample started. It usually takes a few minutes.");
      else toast.info(o === "exists" ? "This look already has a sample." : "A sample is already being made.");
      setQuote(null);
      onChanged();
    });
  };
  const remove = () => {
    if (!sample || !window.confirm("Delete this sample clip? It is also removed from the media library.")) return;
    start(async () => {
      const r = await deleteStyleSampleAction(sample.key);
      if (!r.ok) { setError(r.error); return; }
      toast.success("Sample deleted");
      onChanged();
    });
  };

  const cost = quote ? `$${quote.estimateUsd.toFixed(2)}` : "";
  const canSubmit = !!quote && !quote.blocker && confirmed && !busy && quote.policyFlagged.every((f) => acks.includes(f.code));

  return (
    <div className="space-y-3" aria-live="polite">
      {error && <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}

      {sample?.status === "ready" && sample.mediaId && (
        <div className="space-y-2">
          <SampleVideo sample={sample} />
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="info">{SAMPLE_BADGE}</Chip>
            {sample.durationSecs ? <Chip>{`${Math.round(sample.durationSecs)}s`}</Chip> : null}
            {canGenerate && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => open(true)}><RefreshCw className="size-3.5" /> Replace</Button>}
            {canGenerate && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={remove}><Trash2 className="size-3.5" /> Delete</Button>}
          </div>
          <p className="text-[11px] text-muted-foreground">Made once for this look and reused for everyone in your company. It shows the style, not your product.</p>
        </div>
      )}

      {sample?.status === "generating" && <p className="flex items-center gap-2 rounded-xl bg-muted/50 p-3 text-xs"><Loader2 className="size-4 animate-spin" /> The sample clip is being made. You can close this; it appears here when ready.</p>}
      {sample?.status === "pending_approval" && <p className="rounded-xl bg-amber-500/10 p-3 text-xs">Waiting for a manager to approve the spend. {canGenerate && <button type="button" className="font-semibold underline" onClick={() => open(false)}>Approve if you are a manager</button>}</p>}
      {sample?.status === "failed" && <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-xs">{`The last attempt failed: ${sample.error ?? "unknown error"}`}</p>}

      {(!sample || sample.status === "failed") && !quote && (
        canGenerate ? (
          <div className="space-y-1.5">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => open(false)}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Generate a real sample clip</Button>
            <p className="text-[11px] text-muted-foreground">Optional and paid. Nothing is made until you confirm the price.</p>
          </div>
        ) : <p className="text-[11px] text-muted-foreground">You don&apos;t have permission to generate sample clips.</p>
      )}

      {quote && (
        <div className="space-y-2 rounded-xl border border-border/60 bg-card p-3 text-xs">
          <p className="font-semibold">{replace ? "Replace this sample clip" : "Generate a real sample clip"}</p>
          <p>{`One ${quote.secs}-second scene, made by ${quote.model} with your own Gemini account. Estimated cost: `}<strong>{cost}</strong>.</p>
          <p className="text-muted-foreground">{`Today: $${quote.spentTodayUsd.toFixed(2)} used of your $${quote.dailyCapUsd.toFixed(2)} limit. Spend above $${quote.thresholdUsd.toFixed(2)} needs a manager's approval.`}</p>
          {quote.needsManager && !quote.blocker && <p className="text-amber-700 dark:text-amber-300">This is over that limit, so it will be sent to a manager to approve first.</p>}
          {quote.blocker ? (
            <p role="alert" className="font-medium text-rose-600 dark:text-rose-400">
              {quote.blocker} {!quote.connected && <Link href="/viralpulse-ai/settings?tab=integrations" className="underline">Open Settings → Integrations</Link>}
            </p>
          ) : (
            <>
              {quote.policyFlagged.map((f) => (
                <label key={f.code} className="flex items-start gap-2"><Checkbox checked={acks.includes(f.code)} onCheckedChange={(c) => setAcks((a) => (c === true ? [...a, f.code] : a.filter((x) => x !== f.code)))} className="mt-0.5" /><span>{f.message}</span></label>
              ))}
              <label className="flex items-start gap-2"><Checkbox checked={confirmed} onCheckedChange={(c) => setConfirmed(c === true)} className="mt-0.5" /><span>{`I confirm this will cost about ${cost}. The clip is AI-generated, uses neutral content with no claims or prices, and is labelled as an AI sample.`}</span></label>
            </>
          )}
          <div className="flex gap-2">
            {!quote.blocker && <Button type="button" size="sm" disabled={!canSubmit} onClick={submit}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : null} {`Generate for ${cost}`}</Button>}
            <Button type="button" size="sm" variant="ghost" onClick={() => setQuote(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
