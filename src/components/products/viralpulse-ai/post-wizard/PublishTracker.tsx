"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RotateCcw, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformChip } from "@/components/products/viralpulse-ai/SmmsBits";
import { attemptsAction, cancelScheduleAction, retryAttemptAction } from "@/app/(products)/viralpulse-ai/(protected)/posts/wizard-actions";
import type { AttemptView } from "@/lib/products/viralpulse-ai/publishing";
import type { PostPlatform } from "@/lib/products/viralpulse-ai/constants";
import { POLL_GIVE_UP_MS, PHASE_LABEL, pollDelayMs, shouldPoll, trackerActions, trackerPhase, type TrackerPhase } from "@/lib/products/viralpulse-ai/post-wizard/helpers";
import { cn } from "@/lib/utils";

interface Snapshot {
  attempts: AttemptView[];
  status: string;
  scheduledAt: string | null;
  approved: boolean;
  variants: { platform: PostPlatform; state: string; url: string | null; error: string | null }[];
}

const TONE: Record<TrackerPhase, string> = {
  idle: "bg-muted text-muted-foreground", queued: "bg-sky-500/12 text-sky-800 dark:text-sky-300", uploading: "bg-sky-500/12 text-sky-800 dark:text-sky-300", processing: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  published: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300", failed: "bg-rose-500/12 text-rose-800 dark:text-rose-300", ambiguous: "bg-amber-500/15 text-amber-800 dark:text-amber-300", cancelled: "bg-muted text-muted-foreground",
};

/** Per-platform progress of a post's publishing, polled while anything is still running; retry, confirmed retry and cancel included. */
export default function PublishTracker({ postId, platforms, canPublish, canCancel = true, compact = false }: { postId: string; platforms: PostPlatform[]; canPublish: boolean; canCancel?: boolean; compact?: boolean }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [confirm, setConfirm] = useState<PostPlatform | null>(null);
  const [pending, start] = useTransition();
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restart = useRef<() => void>(() => {});

  const load = useCallback(async () => {
    const res = await attemptsAction(postId);
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    setError(null);
    const s: Snapshot = { attempts: res.attempts, status: res.status, scheduledAt: res.scheduledAt, approved: res.approved, variants: res.variants };
    setSnap(s);
    return s;
  }, [postId]);

  const latest = (s: Snapshot | null, p: PostPlatform) => s?.attempts.find((a) => a.platform === p) ?? null;

  // Poll while anything is still running (slower as time passes), stop when every platform is final.
  useEffect(() => {
    let live = true;
    async function poll() {
      if (timer.current) clearTimeout(timer.current);
      const s = await load();
      if (!live) return;
      const waiting = s ? shouldPoll(platforms.map((p) => latest(s, p))) : true;
      const elapsed = Date.now() - started.current;
      if (!waiting) return;
      if (elapsed > POLL_GIVE_UP_MS) return void setGaveUp(true);
      timer.current = setTimeout(() => void poll(), pollDelayMs(elapsed));
    }
    restart.current = () => { started.current = Date.now(); setGaveUp(false); void poll(); };
    started.current = Date.now();
    void poll();
    return () => {
      live = false;
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once per post
  }, [postId]);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "That did not work.");
      else toast.success(okMsg);
      setConfirm(null);
      restart.current();
    });

  if (!snap && !error) return <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Loading the progress…</p>;
  const scheduled = snap?.status === "scheduled" && snap.scheduledAt;

  return (
    <div className="space-y-3" aria-live="polite">
      {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {scheduled && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/8 px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5"><Clock className="size-3.5" aria-hidden />{`Scheduled for ${new Date(snap!.scheduledAt!).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}. ${snap!.approved ? "Approved: it publishes by itself." : "Waiting for approval by someone with Publish."}`}</span>
          {canCancel && <Button type="button" size="xs" variant="outline" disabled={pending} onClick={() => act(() => cancelScheduleAction(postId), "The schedule was cancelled.")}>Cancel schedule</Button>}
        </div>
      )}
      <ul className="divide-y divide-border/50">
        {platforms.map((p) => {
          const a = latest(snap, p);
          const v = snap?.variants.find((x) => x.platform === p);
          const phase: TrackerPhase = v?.state === "published" && !a ? "published" : trackerPhase(a);
          const acts = trackerActions(phase);
          const url = a?.url ?? v?.url ?? null;
          const running = phase === "queued" || phase === "uploading" || phase === "processing";
          return (
            <li key={p} className="space-y-1.5 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <PlatformChip platform={p} full />
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE[phase])}>
                  {running ? <Loader2 className="size-3 animate-spin" aria-hidden /> : phase === "published" ? <CheckCircle2 className="size-3" aria-hidden /> : phase === "failed" ? <XCircle className="size-3" aria-hidden /> : phase === "ambiguous" ? <AlertTriangle className="size-3" aria-hidden /> : null}
                  {PHASE_LABEL[phase]}
                </span>
                {a && a.maxAttempts > 1 && running && a.attempts > 0 && <span className="text-[11px] text-muted-foreground">{`Try ${a.attempts} of ${a.maxAttempts}`}</span>}
                {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline">View live post <ExternalLink className="size-3" /></a>}
                {canPublish && (acts.retry || acts.confirmRetry) && (
                  <Button type="button" size="xs" variant="outline" className="ml-auto" disabled={pending} onClick={() => (acts.confirmRetry ? setConfirm(p) : act(() => retryAttemptAction(postId, p, false), "Trying again."))}>
                    <RotateCcw className="size-3" /> {acts.confirmRetry ? "Check, then publish again" : "Try again"}
                  </Button>
                )}
              </div>
              {a?.nextAttemptAt && phase === "queued" && a.attempts > 0 && <p className="text-[11px] text-muted-foreground">{`Will try again around ${new Date(a.nextAttemptAt).toLocaleTimeString("en-IN", { timeStyle: "short" })}.`}</p>}
              {(phase === "failed" || phase === "ambiguous") && a && (
                <p className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs"><span className="font-medium">{a.message ?? "It did not go through."}</span>{a.hint ? ` ${a.hint}` : ""}</p>
              )}
              {phase === "failed" && !a && v?.error && <p className="text-xs text-rose-600 dark:text-rose-400">{v.error}</p>}
              {a?.warnings.map((w) => <p key={w} className="text-[11px] text-amber-700 dark:text-amber-300">{w}</p>)}
              {!compact && a?.disclosure && a.disclosure.mode !== "none" && phase === "published" && <p className="text-[11px] text-muted-foreground">{`AI disclosure: ${a.disclosure.reason}`}</p>}
              {confirm === p && (
                <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/8 p-3 text-xs" role="alertdialog" aria-label="Confirm publishing again">
                  <p>This platform may already have the post. Open the account and look first. If it is not there, publishing again is safe; if it is, you would create a duplicate.</p>
                  <div className="flex gap-2">
                    <Button type="button" size="xs" disabled={pending} onClick={() => act(() => retryAttemptAction(postId, p, true), "Publishing again.")}>It is not there: publish again</Button>
                    <Button type="button" size="xs" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {gaveUp && <p className="text-xs text-muted-foreground">Live updates stopped after a while. <button type="button" className="font-semibold text-primary underline" onClick={() => restart.current()}>Check again</button></p>}
    </div>
  );
}
