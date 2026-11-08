"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Circle, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { skipProblem } from "@/lib/products/cashflow-ai/work/engine";
import { markDoneAction, reopenWorkAction, setStepAction, skipWorkAction } from "@/app/(products)/cashflow-ai/(protected)/work/actions";

export interface StepView {
  text: string;
  hint?: string;
  href?: string;
  built: boolean;
  /** The books proved this step themselves. */
  auto: boolean;
}

export default function StepChecklist({
  taskId,
  period,
  steps,
  ticked,
  status,
  canWrite,
  skipReason,
  finishedBy,
}: {
  taskId: string;
  period: string;
  steps: StepView[];
  /** The steps a person has ticked, as stored. */
  ticked: boolean[];
  status: "open" | "done" | "skipped";
  canWrite: boolean;
  skipReason: string | null;
  /** "Name on 12-03-2026", for a done or skipped item. */
  finishedBy: string | null;
}) {
  const router = useRouter();
  const [manual, setManual] = useState<boolean[]>(ticked);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  // the last value the person asked for each step, so a slow reply to an earlier tap cannot undo a later one
  const latest = useRef<Map<number, boolean>>(new Map());

  const open = status === "open";
  const isTicked = (i: number) => status === "done" || manual[i] === true || steps[i].auto;
  const allTicked = steps.every((_, i) => isTicked(i));
  const count = steps.filter((_, i) => isTicked(i)).length;

  async function toggle(i: number) {
    if (!open || !canWrite || steps[i].auto) return;
    const next = !manual[i];
    latest.current.set(i, next);
    setManual((m) => m.map((v, k) => (k === i ? next : v)));
    setBusy((b) => new Set(b).add(i));
    let error: string | null = null;
    try {
      const res = await setStepAction(taskId, period, i, next);
      if (!res.ok) error = res.error;
    } catch {
      error = "Could not save. Check your connection and try again.";
    }
    setBusy((b) => {
      const n = new Set(b);
      n.delete(i);
      return n;
    });
    if (error && latest.current.get(i) === next) {
      setManual((m) => m.map((v, k) => (k === i ? !next : v)));
      toast.error(error);
    }
  }

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(success);
        setSkipping(false);
        router.refresh();
      } catch {
        toast.error("Something went wrong. Please try again.");
      }
    });
  }

  function submitSkip() {
    const problem = skipProblem(reason);
    setReasonError(problem);
    if (problem) return;
    run(() => skipWorkAction(taskId, period, reason), "Skipped, and kept on record.");
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={count} aria-valuemin={0} aria-valuemax={steps.length}>
          <div className={cn("h-full", status === "done" ? "bg-green-600" : "bg-primary")} style={{ width: `${(count / steps.length) * 100}%` }} />
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{count} of {steps.length} steps done</div>
      </div>

      <ol className="space-y-3">
        {steps.map((s, i) => {
          const on = isTicked(i);
          return (
            <li key={i} className={cn("rounded-xl border p-3 sm:p-4", on ? "border-green-600/30 bg-green-500/5" : "border-border/50")}>
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`${on ? "Untick" : "Tick"} step ${i + 1}`}
                  disabled={!open || !canWrite || s.auto}
                  onClick={() => toggle(i)}
                  className="mt-0.5 shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
                >
                  {busy.has(i) ? <Loader2 className="size-7 animate-spin text-muted-foreground" /> : on ? <CheckCircle2 className="size-7 text-green-600" /> : <Circle className="size-7 text-muted-foreground hover:text-primary" />}
                </button>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="text-sm font-medium"><span className="text-muted-foreground">{i + 1}.</span> {s.text}</div>
                  {s.hint && <div className="text-xs text-muted-foreground">{s.hint}</div>}
                  <div className="flex flex-wrap items-center gap-2">
                    {s.auto && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400">
                        <ShieldCheck className="size-3.5" /> Done by CashFlow
                      </span>
                    )}
                    {s.built && s.href ? (
                      <Link href={s.href} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80">
                        Open <ExternalLink className="size-3.5" />
                      </Link>
                    ) : !s.built ? (
                      <span className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-800 dark:text-amber-300">
                        Done outside CashFlow (the portal / your auditor): do it, then tick.
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {open && canWrite && allTicked && (
        <div className="rounded-xl border border-green-600/40 bg-green-500/10 p-4">
          <p className="mb-3 text-sm font-medium">Every step is ticked. Finish this piece of work.</p>
          <Button type="button" size="lg" className="h-11 px-6 text-base" disabled={pending || busy.size > 0} onClick={() => run(() => markDoneAction(taskId, period), "Marked done.")}>
            {pending && <Loader2 className="size-4 animate-spin" />} Mark this done
          </Button>
        </div>
      )}

      {open && canWrite && (
        <div className="border-t border-border/50 pt-4">
          {!skipping ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setSkipping(true)}>Skip this</Button>
          ) : (
            <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-sm font-medium">Why are you skipping this?</p>
              <p className="text-xs text-muted-foreground">A skipped piece of work stays on record with your name and the reason. It does not count as done.</p>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} placeholder="For example: no sales this week, nothing to check." aria-label="Reason for skipping" />
              {reasonError && <p className="text-xs text-destructive">{reasonError}</p>}
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={pending} onClick={submitSkip}>{pending && <Loader2 className="size-3.5 animate-spin" />} Skip and keep on record</Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setSkipping(false); setReasonError(null); }}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {!open && (
        <div className="space-y-2 rounded-xl border border-border/50 p-4 text-sm">
          <div className="font-medium">{status === "done" ? "Marked done" : "Skipped"}{finishedBy ? ` by ${finishedBy}` : ""}</div>
          {status === "skipped" && skipReason && <div className="text-muted-foreground">Reason: {skipReason}</div>}
          {canWrite && (
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => reopenWorkAction(taskId, period), "Reopened.")}>
              {pending && <Loader2 className="size-3.5 animate-spin" />} Reopen
            </Button>
          )}
        </div>
      )}
      {!canWrite && open && <p className="text-xs text-muted-foreground">Your role can view this work but not tick it off.</p>}
    </div>
  );
}
