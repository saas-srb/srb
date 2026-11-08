"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, LoaderCircle, Mic, MicOff, Phone, PhoneOff, RefreshCw, Settings } from "lucide-react";
import { Conversation, type VoiceConversation } from "@elevenlabs/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import { EmptyState, SectionCard } from "@/components/products/agentos/AibotsUi";
import { AGENT_USED_EVENT } from "@/components/products/agentos/AibotsSidebar";
import type { BotSummary } from "@/lib/products/agentos/bots";
import type { VoiceCallView } from "@/lib/products/agentos/voice/calls";
import { finishVoiceCallAction, loadVoiceCallAction, refreshVoiceCallAction, startVoiceCallAction } from "@/app/(products)/agentos/(protected)/voice-actions";

type Phase = "idle" | "mic" | "connecting" | "live" | "ending";
type Line = { id: number; role: "agent" | "user"; text: string };

export interface VoiceWorkspaceProps {
  bot: BotSummary;
  /** Why a call can't start (ElevenLabs missing, agent not synced yet, agent off) - null when ready. */
  blocked: { message: string; settingsHref: string | null } | null;
  voiceName: string | null;
  languageLabel: string | null;
  maxDurationSecs: number | null;
  initialCalls: VoiceCallView[];
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function micError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access is blocked. Allow the microphone for this site in your browser's address bar, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found. Connect one and try again.";
  if (name === "NotReadableError") return "Your microphone is in use by another app. Close it and try again.";
  return "Couldn't access the microphone.";
}

function TranscriptLines({ lines }: { lines: { role: "agent" | "user"; text: string }[] }) {
  return (
    <ul className="space-y-2">
      {lines.map((l, i) => (
        <li key={i} className={cn("flex", l.role === "user" ? "justify-end" : "justify-start")}>
          <span className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm", l.role === "user" ? "bg-primary/12 text-foreground" : "bg-muted/60 text-foreground")}>
            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{l.role === "user" ? "You" : "Agent"}</span>
            {l.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function VoiceWorkspace({ bot, blocked, voiceName, languageLabel, maxDurationSecs, initialCalls }: VoiceWorkspaceProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<"listening" | "speaking">("listening");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [calls, setCalls] = useState<VoiceCallView[]>(initialCalls);
  const [open, setOpen] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const convRef = useRef<VoiceConversation | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const convIdRef = useRef<string | null>(null);
  const finishedRef = useRef(false);
  const lineId = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  // Leaving the page ends the call (the microphone must never stay open in the background).
  useEffect(() => () => void convRef.current?.endSession().catch(() => {}), []);

  const upsertCall = useCallback((c: VoiceCallView) => setCalls((prev) => [c, ...prev.filter((x) => x.chatId !== c.chatId)]), []);

  /** Stores the transcript. ElevenLabs may still be processing the call, so poll a few times. */
  const finish = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase("ending");
    const chatId = chatIdRef.current;
    const convId = convIdRef.current;
    if (chatId && convId) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const r = await finishVoiceCallAction(chatId, convId).catch(() => null);
        if (!r) break;
        if (!r.ok) {
          setError(r.error);
          break;
        }
        upsertCall(r.call);
        if (r.call.status === "done" || r.call.status === "failed") break;
        await new Promise((res) => setTimeout(res, 2500));
      }
    }
    convRef.current = null;
    setMuted(false);
    setPhase("idle");
  }, [upsertCall]);

  const start = async () => {
    setError(null);
    setLines([]);
    setSeconds(0);
    finishedRef.current = false;
    chatIdRef.current = null;
    convIdRef.current = null;
    setPhase("mic");
    try {
      // Ask for the microphone first: a refusal costs nothing, and the real session then reuses the grant.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch (err) {
      setError(micError(err));
      setPhase("idle");
      return;
    }
    setPhase("connecting");
    const started = await startVoiceCallAction(bot._id);
    if (!started.ok) {
      setError(started.error);
      setPhase("idle");
      return;
    }
    chatIdRef.current = started.chatId;
    window.dispatchEvent(new CustomEvent(AGENT_USED_EVENT, { detail: { _id: bot._id, name: bot.name, icon: bot.icon, color: bot.color, avatarUrl: bot.avatarUrl, kind: bot.kind } }));
    try {
      convRef.current = await Conversation.startSession({
        signedUrl: started.signedUrl,
        connectionType: "websocket",
        textOnly: false,
        onConnect: ({ conversationId }) => {
          convIdRef.current = conversationId;
          setPhase("live");
        },
        onDisconnect: (details) => {
          if (details.reason === "error") setError(details.message || "The call was interrupted.");
          void finish();
        },
        onError: (message) => setError(message || "Something went wrong during the call."),
        onModeChange: ({ mode: m }) => setMode(m),
        onMessage: (m) => {
          const text = m.message?.trim();
          if (text) setLines((prev) => [...prev, { id: ++lineId.current, role: m.role === "user" ? "user" : "agent", text }]);
        },
      });
      convIdRef.current ??= convRef.current.getId() || null;
    } catch (err) {
      setError(err instanceof Error && err.message ? `Couldn't connect the call: ${err.message}` : "Couldn't connect the call. Try again.");
      convRef.current = null;
      setPhase("idle");
    }
  };

  const hangUp = async () => {
    setPhase("ending");
    await convRef.current?.endSession().catch(() => {});
    void finish();
  };

  const toggleMute = () => {
    const next = !muted;
    convRef.current?.setMicMuted(next);
    setMuted(next);
  };

  const toggleCall = async (c: VoiceCallView) => {
    if (open === c.chatId) return setOpen(null);
    setOpen(c.chatId);
    if (c.transcript || !c.hasTranscript) return;
    setOpening(c.chatId);
    const r = await loadVoiceCallAction(c.chatId);
    setOpening(null);
    if (r.ok) upsertCall(r.call);
  };

  const refreshCall = async (c: VoiceCallView) => {
    setOpening(c.chatId);
    const r = await refreshVoiceCallAction(c.chatId);
    setOpening(null);
    if (r.ok) setCalls((prev) => prev.map((x) => (x.chatId === c.chatId ? r.call : x)));
  };

  const busy = phase === "mic" || phase === "connecting" || phase === "ending";
  const live = phase === "live";
  const remaining = maxDurationSecs ? Math.max(maxDurationSecs - seconds, 0) : null;
  const statusText = phase === "mic" ? "Waiting for microphone permission…" : phase === "connecting" ? "Connecting…" : phase === "ending" ? "Saving the call…" : live ? (muted ? "Muted" : mode === "speaking" ? "Agent is speaking" : "Listening to you") : "Ready when you are";

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <SectionCard
        title="Talk to the agent"
        description={[voiceName, languageLabel].filter(Boolean).join(" · ") || "Live voice conversation"}
        className="flex min-h-[28rem] flex-col"
      >
        {blocked ? (
          <EmptyState icon={<AlertTriangle className="size-5" />} title="This agent can't take calls yet">
            <p>{blocked.message}</p>
            {blocked.settingsHref && (
              <Button className="mt-3" size="sm" variant="outline" nativeButton={false} render={<Link href={blocked.settingsHref} />}>
                <Settings className="size-3.5" /> Open settings
              </Button>
            )}
          </EmptyState>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="relative">
                {live && !muted && <span className={cn("absolute inset-0 rounded-full bg-primary/20", mode === "speaking" ? "animate-ping" : "animate-pulse")} aria-hidden />}
                <BotAvatar icon={bot.icon} color={bot.color} imageUrl={bot.avatarUrl} size="lg" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold" aria-live="polite">{statusText}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {live || phase === "ending" ? mmss(seconds) : "0:00"}
                  {live && remaining !== null && ` · ${mmss(remaining)} left`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {live ? (
                  <>
                    <Button type="button" variant="outline" size="icon-lg" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? "Unmute microphone" : "Mute microphone"} className={cn(muted && "border-amber-500/50 text-amber-600")}>
                      {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                    </Button>
                    <Button type="button" variant="destructive" size="lg" onClick={hangUp}>
                      <PhoneOff className="size-4" /> End call
                    </Button>
                  </>
                ) : (
                  <Button type="button" size="lg" onClick={start} disabled={busy}>
                    {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Phone className="size-4" />} {phase === "idle" ? (lines.length ? "Call again" : "Start call") : "Please wait"}
                  </Button>
                )}
              </div>
              {error && (
                <div role="alert" className="max-w-md rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-center text-xs text-rose-900 dark:text-rose-200">{error}</div>
              )}
            </div>

            <div ref={scrollRef} className="min-h-40 flex-1 overflow-y-auto rounded-xl border border-border/40 bg-background/50 p-3" aria-label="Live transcript">
              {lines.length ? <TranscriptLines lines={lines} /> : <p className="py-6 text-center text-xs text-muted-foreground">The conversation appears here as you talk.</p>}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Your calls" description="Your recent conversations with this agent." className="min-h-0 overflow-hidden" action={<Link href={`/agentos/calls?bot=${encodeURIComponent(bot._id)}`} className="text-xs font-medium text-primary hover:underline">Full history</Link>}>
        {calls.length === 0 ? (
          <EmptyState icon={<Phone className="size-5" />} title="No calls yet">Your finished calls and their transcripts are listed here.</EmptyState>
        ) : (
          <ul className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {calls.map((c) => (
              <li key={c.chatId} className="rounded-xl border border-border/40 bg-background/60">
                <button type="button" onClick={() => toggleCall(c)} className="flex w-full items-center gap-2 px-3 py-2 text-left" aria-expanded={open === c.chatId}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.title}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {when(c.startedAt)} · {c.durationSecs ? mmss(c.durationSecs) : c.status === "started" ? "not connected" : c.status === "processing" ? "processing" : "—"}
                      {c.status === "failed" && " · failed"}
                    </span>
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open === c.chatId && "rotate-180")} />
                </button>
                {open === c.chatId && (
                  <div className="border-t border-border/40 px-3 py-2">
                    <Link href={`/agentos/calls/${c.chatId}`} className="mb-2 inline-block text-xs font-medium text-primary hover:underline">Open recording and full transcript</Link>
                    {opening === c.chatId ? (
                      <LoaderCircle className="mx-auto size-4 animate-spin text-muted-foreground" />
                    ) : c.transcript?.length ? (
                      <TranscriptLines lines={c.transcript} />
                    ) : (
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        {c.status === "processing" ? "ElevenLabs is still preparing this transcript." : c.status === "started" ? "This call never connected." : "No transcript was recorded."}
                        {c.status === "processing" && (
                          <Button type="button" size="sm" variant="ghost" onClick={() => refreshCall(c)}><RefreshCw className="size-3.5" /> Refresh</Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
