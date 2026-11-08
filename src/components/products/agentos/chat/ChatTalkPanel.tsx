"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Mic, MicOff, Phone, PhoneOff, MessageSquarePlus } from "lucide-react";
import { Conversation, type VoiceConversation } from "@elevenlabs/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import AgentPicker from "@/components/products/agentos/AgentPicker";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import { finishVoiceCallAction, startVoiceCallAction } from "@/app/(products)/agentos/(protected)/voice-actions";
import { postVoiceCallNoteAction } from "@/app/(products)/agentos/(protected)/chat-call-actions";
import type { CallAgentOption } from "@/lib/products/agentos/calls/options";
import type { AgentOption } from "@/lib/products/agentos/picker-types";

type Phase = "idle" | "mic" | "connecting" | "live" | "ending" | "ended";
type Line = { id: number; role: "agent" | "user"; text: string };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function micError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access is blocked. Allow the microphone for this site in your browser's address bar, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found. Connect one and try again.";
  if (name === "NotReadableError") return "Your microphone is in use by another app. Close it and try again.";
  return "Couldn't access the microphone.";
}

/**
 * "Talk here": a browser voice conversation with a voice agent, opened beside the chat. It is a separate conversation with that voice
 * agent (its own record under Call History); it uses the same server actions and ElevenLabs session as the voice agent's own page.
 * The microphone is released whenever the panel closes or the page is left.
 */
export default function ChatTalkPanel({ open, onOpenChange, chatId, agents, onNotePosted }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  agents: CallAgentOption[];
  /** Called with the note text once it was added to the chat's conversation. */
  onNotePosted: (text: string) => void;
}) {
  const ready = agents.filter((a) => a.ready);
  const [agentSel, setAgentSel] = useState("");
  const agentId = ready.some((a) => a.id === agentSel) ? agentSel : ready.length === 1 ? ready[0].id : "";
  const agent = ready.find((a) => a.id === agentId) ?? null;

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<"listening" | "speaking">("listening");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [callChatId, setCallChatId] = useState<string | null>(null);
  const [posting, setPosting] = useState<"idle" | "busy" | "done">("idle");
  const [postError, setPostError] = useState<string | null>(null);

  const convRef = useRef<VoiceConversation | null>(null);
  const callChatRef = useRef<string | null>(null);
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
  useEffect(() => () => void convRef.current?.endSession().catch(() => {}), []);

  const finish = async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase("ending");
    const id = callChatRef.current;
    const convId = convIdRef.current;
    if (id && convId) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const r = await finishVoiceCallAction(id, convId).catch(() => null);
        if (!r) break;
        if (!r.ok) { setError(r.error); break; }
        if (r.call.status === "done" || r.call.status === "failed") break;
        await new Promise((res) => setTimeout(res, 2500));
      }
    }
    convRef.current = null;
    setMuted(false);
    setPhase("ended");
  };

  const start = async () => {
    if (!agentId) return;
    setError(null);
    setLines([]);
    setSeconds(0);
    setPosting("idle");
    setPostError(null);
    setCallChatId(null);
    finishedRef.current = false;
    callChatRef.current = null;
    convIdRef.current = null;
    setPhase("mic");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch (err) {
      setError(micError(err));
      setPhase("idle");
      return;
    }
    setPhase("connecting");
    const started = await startVoiceCallAction(agentId);
    if (!started.ok) {
      setError(started.error);
      setPhase("idle");
      return;
    }
    callChatRef.current = started.chatId;
    setCallChatId(started.chatId);
    try {
      convRef.current = await Conversation.startSession({
        signedUrl: started.signedUrl,
        connectionType: "websocket",
        textOnly: false,
        dynamicVariables: started.dynamicVariables,
        onConnect: ({ conversationId }) => { convIdRef.current = conversationId; setPhase("live"); },
        onDisconnect: (d) => {
          if (d.reason === "error") setError(d.message || "The call was interrupted.");
          void finish();
        },
        onError: (m) => setError(m || "Something went wrong during the call."),
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

  const close = (next: boolean) => {
    if (!next && (phase === "live" || phase === "connecting" || phase === "mic")) void hangUp();
    onOpenChange(next);
  };

  const postNote = async () => {
    if (!callChatId || !agentId) return;
    setPosting("busy");
    setPostError(null);
    const r = await postVoiceCallNoteAction(chatId, { agentId, callId: callChatId, kind: "talk" }).catch(() => null);
    if (!r || !r.ok) {
      setPosting("idle");
      setPostError(r && !r.ok ? r.error : "Couldn't add the note. Try again.");
      return;
    }
    setPosting("done");
    onNotePosted(r.text);
  };

  const pickerAgents: AgentOption[] = ready.map((a) => ({ id: a.id, name: a.name, icon: a.icon, color: a.color, avatarUrl: a.avatarUrl, kind: "voice", category: a.category, description: a.description }));
  const live = phase === "live";
  const busy = phase === "mic" || phase === "connecting" || phase === "ending";
  const status = phase === "mic" ? "Waiting for microphone permission…" : phase === "connecting" ? "Connecting…" : phase === "ending" ? "Saving the call…" : live ? (muted ? "Muted" : mode === "speaking" ? "Agent is speaking" : "Listening to you") : phase === "ended" ? "Call ended" : "Ready when you are";

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="p-4 pb-0">
          <SheetTitle className="flex items-center gap-2"><Phone className="size-4 text-primary" />Talk here</SheetTitle>
          <SheetDescription>Talk out loud with a voice agent without leaving this chat.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
          <p className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            This is a separate voice conversation with the voice agent you choose. It does not continue this chat&apos;s messages, and it is saved on its own under Call History.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="talk-agent" className="text-xs font-medium">Voice agent</label>
            <AgentPicker id="talk-agent" agents={pickerAgents} value={agentId} onChange={setAgentSel} placeholder="Choose a voice agent" disabled={busy || live || ready.length === 0} />
          </div>
          <div className="flex flex-col items-center gap-3 py-2">
            {agent && <BotAvatar icon={agent.icon} color={agent.color} imageUrl={agent.avatarUrl} size="lg" />}
            <div className="text-center">
              <p className="text-sm font-semibold" aria-live="polite">{status}</p>
              <p className="text-xs tabular-nums text-muted-foreground">{live || phase === "ending" || phase === "ended" ? mmss(seconds) : "0:00"}</p>
            </div>
            <div className="flex items-center gap-3">
              {live ? (
                <>
                  <Button type="button" variant="outline" size="icon-lg" aria-pressed={muted} aria-label={muted ? "Unmute microphone" : "Mute microphone"} className={cn(muted && "border-amber-500/50 text-amber-600")} onClick={() => { const n = !muted; convRef.current?.setMicMuted(n); setMuted(n); }}>
                    {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                  </Button>
                  <Button type="button" variant="destructive" size="lg" onClick={hangUp}><PhoneOff className="size-4" /> End call</Button>
                </>
              ) : (
                <Button type="button" size="lg" onClick={start} disabled={busy || !agentId}>
                  {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Phone className="size-4" />}
                  {busy ? "Please wait" : phase === "ended" ? "Talk again" : "Start talking"}
                </Button>
              )}
            </div>
            {error && <div role="alert" className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-center text-xs text-rose-900 dark:text-rose-200">{error}</div>}
          </div>
          <div ref={scrollRef} className="min-h-32 flex-1 overflow-y-auto rounded-xl border border-border/40 bg-background/50 p-3" aria-label="Live transcript">
            {lines.length ? (
              <ul className="space-y-2">
                {lines.map((l) => (
                  <li key={l.id} className={cn("flex", l.role === "user" ? "justify-end" : "justify-start")}>
                    <span className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm", l.role === "user" ? "bg-primary/12" : "bg-muted/60")}>
                      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{l.role === "user" ? "You" : "Agent"}</span>
                      {l.text}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">The conversation appears here as you talk.</p>
            )}
          </div>
          {phase === "ended" && callChatId && (
            <div className="space-y-2 rounded-xl border border-border/50 bg-muted/30 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/agentos/calls/${callChatId}`} target="_blank" className="font-medium text-primary hover:underline">Open the call</Link>
                {posting === "done" ? (
                  <span className="text-emerald-700 dark:text-emerald-400">Note added to this chat.</span>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={postNote} disabled={posting === "busy"}>
                    {posting === "busy" ? <LoaderCircle className="size-3.5 animate-spin" /> : <MessageSquarePlus className="size-3.5" />}
                    Add a note to this chat
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground">The note only says a voice call happened and links to it. The transcript is not copied into the chat.</p>
              {postError && <p role="alert" className="text-destructive">{postError}</p>}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
