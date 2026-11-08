"use client";

import TestBadge from "@/components/products/agentos/calls/TestBadge";
import Link from "next/link";
import { AlertTriangle, Ear, Hand, Mic, MicOff, PhoneOff, Redo2, Send, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import LiveTranscript, { type LiveLine } from "@/components/products/agentos/calls/LiveTranscript";
import { useLiveSoftphone, type SoftphoneCredentials } from "@/components/products/agentos/calls/useLiveSoftphone";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addLiveNoteAction, endLiveCallAction, handBackAction, listenAction, pollLiveAction, pumpMonitorAction, takeOverAction } from "@/lib/products/agentos/calls/conference-actions";
import type { LiveView } from "@/lib/products/agentos/calls/live";
import { cn } from "@/lib/utils";

export interface LiveConsoleProps {
  callId: string;
  agent: { name: string; icon: string; color: string; avatarUrl: string | null };
  purpose: string;
  targetLabel: string | null;
  phone: string | null;
  initial: LiveView;
  /** The person placed the call or has the take-over permission: may listen, take over and add notes. */
  canControl: boolean;
  setupBanner: string | null;
}

const POLL_MS = 1000;
const TERMINAL = ["completed", "failed", "no_answer", "busy", "cancelled"];
const mmss = (secs: number) => `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

export default function LiveConsole({ callId, agent, purpose, targetLabel, phone, initial, canControl, setupBanner }: LiveConsoleProps) {
  const [view, setView] = useState<LiveView>(initial);
  const [lines, setLines] = useState<LiveLine[]>(initial.events);
  const [pollFailures, setPollFailures] = useState(0);
  // Server time at the last poll and the browser time then: the call timer follows the server clock, not the browser's.
  const [sync, setSync] = useState(() => ({ server: Date.parse(initial.now), client: Date.parse(initial.now) }));
  const [tick, setTick] = useState<number>(() => Date.parse(initial.now));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [note, setNote] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const seq = useRef(initial.lastSeq);

  const conference = view.mode === "conference";
  const ended = view.conference ? view.conference.phase === "ended" : TERMINAL.includes(view.status);
  const finished = TERMINAL.includes(view.status);

  const credentials = useCallback(async (): Promise<SoftphoneCredentials | string> => {
    const r = await listenAction(callId);
    return r.ok ? r : r.error;
  }, [callId]);
  const phoneLine = useLiveSoftphone(credentials);
  const { leave: leavePhone, state: phoneState, setMuted } = phoneLine;

  // One poll per second (slower while the tab is hidden); direct calls first hold ElevenLabs' monitor open for a few seconds.
  useEffect(() => {
    if (finished && ended) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      if (stopped) return;
      if (view.mode === "direct" && !document.hidden) await pumpMonitorAction(callId).catch(() => null);
      const r = await pollLiveAction(callId, seq.current).catch(() => null);
      if (stopped) return;
      if (r && r.ok) {
        setSync({ server: Date.parse(r.view.now), client: Date.now() });
        setPollFailures(0);
        setView(r.view);
        if (r.view.events.length) {
          seq.current = r.view.lastSeq;
          setLines((prev) => [...prev, ...r.view.events.filter((e) => e.seq > (prev.at(-1)?.seq ?? 0))].slice(-2000));
        }
      } else setPollFailures((n) => n + 1);
      timer = setTimeout(run, document.hidden ? 5000 : POLL_MS);
    };
    timer = setTimeout(run, POLL_MS);
    return () => { stopped = true; clearTimeout(timer); };
  }, [callId, finished, ended, view.mode]);

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Leave the conference when the call is over, and keep the local microphone in step with who is in control.
  useEffect(() => {
    if (ended && phoneState !== "idle") leavePhone();
  }, [ended, phoneState, leavePhone]);
  const iAmInControl = view.control.mode === "human" && view.control.mine;
  useEffect(() => {
    if (phoneState === "listening") setMuted(!iAmInControl);
  }, [iAmInControl, phoneState, setMuted]);

  const act = async (name: string, fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) => {
    if (busy) return;
    setBusy(name);
    setMessage(null);
    const r = await fn().catch(() => ({ ok: false, error: "The request didn't reach the server. Check your connection and try again." }));
    setBusy(null);
    setMessage(r.ok ? (success ? { tone: "ok", text: success } : null) : { tone: "bad", text: r.error ?? "That didn't work." });
    const fresh = await pollLiveAction(callId, seq.current).catch(() => null);
    if (fresh?.ok) {
      setView(fresh.view);
      if (fresh.view.events.length) { seq.current = fresh.view.lastSeq; setLines((prev) => [...prev, ...fresh.view.events.filter((e) => e.seq > (prev.at(-1)?.seq ?? 0))]); }
    }
    return r.ok;
  };

  const startedMs = view.startedAt ? Date.parse(view.startedAt) : null;
  const elapsed = startedMs ? Math.max(0, ((ended ? Date.parse(lines.at(-1)?.at ?? view.now) : sync.server + Math.max(0, tick - sync.client)) - startedMs) / 1000) : 0;
  const stale = pollFailures >= 3;
  const listening = phoneState === "listening";
  const who = useMemo(() => {
    if (ended) return null;
    if (view.speaking) return view.speaking;
    return null;
  }, [view.speaking, ended]);
  const phaseLabel = finished ? (view.status === "completed" ? "Call finished" : "Call ended") : ended ? "Call ended, saving the results" : view.conference?.phase === "connecting" || view.status === "dialing" ? "Ringing the lead" : view.control.mode === "human" ? (iAmInControl ? "You are talking to the lead" : "A team member is talking to the lead") : "AI is handling the call";

  return (
    <div className="space-y-4">
      {setupBanner && !conference && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{setupBanner} <Link href="/commandos/settings/products/agentos/phone" className="font-semibold underline">Open the live-call setup in CommandOS</Link></span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <BotAvatar icon={agent.icon} color={agent.color} imageUrl={agent.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold">{agent.name}{view.testMode && <TestBadge className="ml-2 align-middle" />}</p>
          <p className="truncate text-xs text-muted-foreground">{purpose.replace(/_/g, " ")} · {targetLabel ?? "No record linked"}{phone ? ` · ${phone}` : ""}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-semibold tabular-nums" aria-label="Call duration">{startedMs ? mmss(elapsed) : "--:--"}</p>
          <p className="text-xs font-medium text-muted-foreground">{phaseLabel}</p>
        </div>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium", stale ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")} role="status">
          {stale ? <WifiOff className="size-3.5" /> : <Wifi className="size-3.5" />}{stale ? "Connection problem" : "Live"}
        </span>
      </div>

      {!ended && (
        <div className="grid grid-cols-3 gap-2 text-center text-sm" aria-live="polite">
          {([["lead", "Lead", "border-sky-500 bg-sky-500/10"], ["ai", "AI", "border-violet-500 bg-violet-500/10"], ["human", iAmInControl ? "You" : "Team member", "border-emerald-500 bg-emerald-500/10"]] as const).map(([k, label, on]) => (
            <div key={k} className={cn("rounded-xl border px-3 py-2 font-semibold transition-colors", who === k ? on : "border-border text-muted-foreground")}>
              {label}{who === k ? " is speaking" : ""}
              {k === "ai" && view.conference?.ai === "failed" && <span className="block text-[11px] font-normal text-rose-600">did not join</span>}
              {k === "ai" && view.control.mode === "human" && view.conference?.ai === "joined" && <span className="block text-[11px] font-normal">on hold</span>}
            </div>
          ))}
        </div>
      )}

      {conference && canControl && !ended && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            {!listening ? (
              <Button size="lg" disabled={Boolean(busy) || phoneState === "connecting" || phoneState === "asking-mic" || view.conference?.phase === "connecting"} onClick={() => void phoneLine.join()}>
                <Ear className="size-4" />{phoneState === "asking-mic" ? "Waiting for microphone…" : phoneState === "connecting" ? "Connecting…" : "Listen"}
              </Button>
            ) : (
              <Button size="lg" variant="outline" disabled={iAmInControl || Boolean(busy)} onClick={() => phoneLine.leave()}>Stop listening</Button>
            )}
            <Button size="lg" disabled={!listening || view.control.mode === "human" || Boolean(busy)} onClick={() => void act("take", () => takeOverAction(callId), "You are in control. The AI is on hold; speak to the lead.")}>
              <Hand className="size-4" />{busy === "take" ? "Taking over…" : "Take over"}
            </Button>
            <Button size="lg" variant="secondary" disabled={!iAmInControl || !view.control.canHandBack || Boolean(busy)} onClick={() => void act("back", () => handBackAction(callId), "The AI has the call again.")}>
              <Redo2 className="size-4" />{busy === "back" ? "Handing back…" : "Hand back to AI"}
            </Button>
            <Button size="lg" variant="destructive" className="ml-auto" disabled={Boolean(busy)} onClick={() => setConfirmEnd(true)}>
              <PhoneOff className="size-4" />End call
            </Button>
          </div>

          {listening && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold", phoneLine.micMuted ? "bg-muted" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300")}>
                {phoneLine.micMuted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}{phoneLine.micMuted ? "Your microphone is muted" : "Your microphone is live: the lead can hear you"}
              </span>
              <span className="inline-flex h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden><span className="h-full bg-emerald-500 transition-[width]" style={{ width: `${Math.round(Math.min(1, phoneLine.level * 6) * 100)}%` }} /></span>
              {phoneLine.devices.length > 1 && (
                <label className="inline-flex items-center gap-1">Microphone
                  <select className="h-7 rounded-md border border-border bg-background px-1" value={phoneLine.deviceId} onChange={(e) => void phoneLine.pickDevice(e.target.value)}>
                    {phoneLine.devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
          {phoneLine.error && <p className="text-xs text-rose-600" role="alert">{phoneLine.error}{/set(?:up| up)|checklist/i.test(phoneLine.error) && <> <Link href="/commandos/settings/products/agentos/phone" className="font-semibold underline">Open the live-call setup in CommandOS</Link></>}</p>}
          {!view.control.canHandBack && view.control.mode === "human" && <p className="text-xs text-amber-700 dark:text-amber-300">The AI has left this call, so it can&apos;t take over again. You can keep talking or end the call.</p>}

          <div className="flex gap-2">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="Private note to the AI (the lead does not hear it)" className="min-h-0 text-sm" disabled={view.control.mode === "human"} />
            <Button variant="outline" disabled={!note.trim() || Boolean(busy) || view.control.mode === "human"} onClick={() => void act("note", () => addLiveNoteAction(callId, note), "Note sent to the AI.").then((okd) => { if (okd) setNote(""); })}><Send className="size-4" />Add note</Button>
          </div>
        </div>
      )}

      {!conference && !ended && view.mode !== "web" && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">This call was placed directly by ElevenLabs, so you can read the live transcript (updated every few seconds, if your ElevenLabs plan includes live monitoring) and add notes or end the call. Listening and taking over need the live-call setup.</p>
          {canControl && (
            <div className="flex flex-wrap gap-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="Private note to the AI" className="min-h-0 flex-1 text-sm" />
              <Button variant="outline" disabled={!note.trim() || Boolean(busy)} onClick={() => void act("note", () => addLiveNoteAction(callId, note), "Note sent to the AI.").then((okd) => { if (okd) setNote(""); })}><Send className="size-4" />Add note</Button>
              <Button variant="destructive" disabled={Boolean(busy)} onClick={() => setConfirmEnd(true)}><PhoneOff className="size-4" />End call</Button>
            </div>
          )}
        </div>
      )}

      {view.mode === "web" && <p className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">This is a browser call: the visitor is connected to the AI directly, so a team member can&apos;t join it. Its transcript is shown on the call page.</p>}

      {message && <p role="status" className={cn("rounded-lg px-3 py-2 text-sm", message.tone === "ok" ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "bg-rose-500/10 text-rose-800 dark:text-rose-200")}>{message.text}</p>}

      {ended && (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="font-semibold">{finished ? "This call is over." : "The call has ended. The summary and final transcript are being prepared."}</p>
          <Link href={`/agentos/calls/${callId}`} className="mt-1 inline-block font-semibold text-primary underline">Open the call record</Link>
        </div>
      )}

      <LiveTranscript lines={lines} viewerId={view.viewerId} />

      {confirmEnd && (
        <div role="dialog" aria-modal="true" aria-label="End the call" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-background p-5 shadow-xl">
            <p className="text-base font-bold">End this call for everyone?</p>
            <p className="text-sm text-muted-foreground">The lead is hung up on and the AI leaves. This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmEnd(false)}>Keep going</Button>
              <Button variant="destructive" disabled={Boolean(busy)} onClick={() => { setConfirmEnd(false); void act("end", () => endLiveCallAction(callId), "The call was ended."); }}>End call</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
