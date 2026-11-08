"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ExternalLink, FileText, Loader2, Lock, Sparkles, UserRound, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import CallStatusBadge from "@/components/products/agentos/calls/CallStatusBadge";
import CallDirectionBadge from "@/components/products/agentos/calls/CallDirectionBadge";
import CallRecording from "@/components/products/agentos/calls/CallRecording";
import CallTranscript from "@/components/products/agentos/calls/CallTranscript";
import TestBadge from "@/components/products/agentos/calls/TestBadge";
import { loadCallDetailAction } from "@/app/(products)/dealflow-ai/(protected)/voice-calls/actions";
import { formatDuration, formatIst, type PanelCall, type PanelCallDetail } from "@/lib/dealflow-ai/call-panel-types";
import { describeControlStep } from "@/lib/products/agentos/calls/call-ui";
import type { CallDirection } from "@/lib/products/agentos/calls/types";

const OUTCOME = { success: "Goal reached", failure: "Goal not reached", unknown: "Unclear" } as const;

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">{icon}{title}</h4>
      {children}
    </section>
  );
}

/** The detail of one call: summary, answers, recording, transcript and control history (what AgentOS lets this person see), and a link to the AgentOS call. */
export default function CallDetailPanel({ call: preview, onBack }: { call: PanelCall; onBack: () => void }) {
  const [detail, setDetail] = useState<PanelCallDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadCallDetailAction(preview.id).then(
      (d) => { if (cancelled) return; if (d) { setDetail(d); setError(""); } else setError("This call isn't available to you."); },
      () => { if (!cancelled) setError("Couldn't load this call. Check your connection and try again."); },
    );
    return () => { cancelled = true; };
  }, [preview.id, attempt]);

  const call = detail?.call ?? preview;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/20 p-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-4" />All calls</Button>
        <BotAvatar icon={call.agent.icon} color={call.agent.color} imageUrl={call.agent.avatarUrl} size="sm" />
        <span className="text-sm font-bold">{call.agent.name}</span>
        <CallStatusBadge status={call.status} />
        <CallDirectionBadge direction={call.direction as CallDirection} />
        {call.testMode && <TestBadge />}
        <Link href={call.agentosHref} target="_blank" className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><ExternalLink className="size-3" />Open in AgentOS</Link>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <p className="text-xs text-muted-foreground">{formatIst(call.at)} · {call.purposeLabel} · {formatDuration(call.durationSecs)}{call.phoneMasked ? ` · ${call.phoneMasked}` : ""}{call.calledBy ? ` · placed by ${call.calledBy}` : ""}</p>
        {error ? (
          <div className="flex flex-col items-center gap-2 py-8 text-xs text-destructive"><AlertCircle className="size-6" />{error}<Button size="sm" variant="outline" onClick={() => { setError(""); setDetail(null); setAttempt((n) => n + 1); }}>Try again</Button></div>
        ) : !detail ? (
          <div className="flex items-center justify-center py-10 text-xs text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Loading the call…</div>
        ) : (
          <>
            {detail.accessNote && <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs"><Lock className="mt-0.5 size-3.5 shrink-0" />{detail.accessNote}</p>}
            {detail.failure && <p className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300">What went wrong: {detail.failure}</p>}
            <Section icon={<Sparkles className="size-4 text-primary" />} title={detail.summaryTitle || "Summary and outcome"}>
              {call.summary ? <p className="whitespace-pre-wrap text-sm">{call.summary}</p> : <p className="text-sm text-muted-foreground">{call.live ? "The summary appears when the call has ended." : "No summary was produced for this call."}</p>}
              {call.outcome && <p className="mt-2 text-xs text-muted-foreground">Outcome: <span className="font-semibold text-foreground">{OUTCOME[call.outcome]}</span>{detail.terminationReason ? ` · Ended because: ${detail.terminationReason}` : ""}</p>}
            </Section>
            <Section icon={<FileText className="size-4 text-primary" />} title="Collected from the call">
              {call.collected.length === 0 ? (
                <p className="text-sm text-muted-foreground">{call.status === "completed" ? "The agent didn't collect any answers on this call." : "No answers were collected."}</p>
              ) : (
                <dl className="divide-y divide-border/40 text-sm">
                  {call.collected.map((f) => (<div key={f.key} className="grid gap-0.5 py-1.5 sm:grid-cols-[11rem_1fr] sm:gap-3"><dt className="text-xs font-medium text-muted-foreground">{f.label}</dt><dd>{f.value || <span className="text-muted-foreground">No answer</span>}</dd></div>))}
                </dl>
              )}
            </Section>
            <Section icon={<Volume2 className="size-4 text-primary" />} title="Recording">
              {detail.recording.url ? <CallRecording url={detail.recording.url} note={detail.recording.note} /> : (
                <p className="text-sm text-muted-foreground">{detail.access !== "full" ? "The recording isn't available to you (see the note above)." : (detail.recording.note ?? "There is no recording for this call.")}</p>
              )}
            </Section>
            <Section icon={<FileText className="size-4 text-primary" />} title="Transcript">
              {detail.transcript ? <CallTranscript lines={detail.transcript} /> : (
                <p className="text-sm text-muted-foreground">{detail.access !== "full" ? "The transcript isn't available to you (see the note above)." : call.live ? "The transcript appears when the call has ended. Use the live view to follow it now." : "No transcript was stored for this call."}</p>
              )}
            </Section>
            {detail.access === "full" && (
              <Section icon={<UserRound className="size-4 text-primary" />} title="Who was in control">
                {detail.controlHistory.length === 0 ? <p className="text-sm text-muted-foreground">No one took over. The AI agent spoke for the company throughout.</p> : (
                  <ol className="space-y-1.5 text-sm">{detail.controlHistory.map((h, i) => <li key={`${h.at}-${i}`}><span className="text-muted-foreground">{formatIst(h.at)}</span> · {describeControlStep(h)} <span className="text-muted-foreground">({h.by})</span></li>)}</ol>
                )}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
