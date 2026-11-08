"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, Mic, MicOff, Phone, PhoneOff, Volume2 } from "lucide-react";
import { Conversation, type VoiceConversation } from "@elevenlabs/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/products/agentos/AibotsUi";
import { cn } from "@/lib/utils";
import type { VoiceConfig } from "@/lib/products/agentos/voice/types";
import { describeOpening, SAMPLE_TEXT_MAX } from "@/lib/products/agentos/preview-shared";
import { previewVoiceAgentAction, speakVoiceSampleAction } from "@/app/(products)/agentos/(protected)/preview-actions";

type SessionOverrides = NonNullable<Parameters<typeof Conversation.startSession>[0]["overrides"]>;
type Phase = "idle" | "mic" | "connecting" | "live" | "ending";
type Line = { id: number; role: "agent" | "user"; text: string };

/**
 * Hear and test the voice agent with the UNSAVED form values. Three parts:
 *  1. what the agent will say first (the opening, as configured);
 *  2. a tone test: any sentence read aloud in the chosen voice (the first message by default);
 *  3. a live test call that sends the draft prompt / first message / voice / language as ElevenLabs conversation overrides.
 *     It needs the agent to exist on ElevenLabs once (saved + synced). Test calls are not stored.
 */
export default function VoiceTryIt({ botId, voice, instructions, disabled }: { botId: string | null; voice: VoiceConfig; instructions: string; disabled?: boolean }) {
  const opening = describeOpening(voice);
  const [sample, setSample] = useState("");
  const [sampling, setSampling] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [muted, setMuted] = useState(false);
  const [mode, setMode] = useState<"listening" | "speaking">("listening");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const convRef = useRef<VoiceConversation | null>(null);
  const lineId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { audioRef.current?.pause(); void convRef.current?.endSession().catch(() => {}); }, []);
  useEffect(() => endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), [lines]);

  const sampleText = (sample || opening.spoken || "").slice(0, SAMPLE_TEXT_MAX);
  const draftReady = Boolean(voice.voiceId && voice.language);

  async function hear() {
    if (!sampleText.trim() || sampling) return;
    setSampling(true);
    setSampleError(null);
    const r = await speakVoiceSampleAction(voice.voiceId, voice.language, sampleText).catch(() => null);
    setSampling(false);
    if (!r) return setSampleError("Couldn't reach the server. Try again.");
    if (!r.ok) return setSampleError(r.error);
    audioRef.current?.pause();
    const a = new Audio(r.audio);
    audioRef.current = a;
    a.play().catch(() => setSampleError("Your browser blocked playback. Press the button again."));
  }

  async function startCall() {
    setError(null);
    setLines([]);
    setPhase("mic");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      setError("Microphone access is blocked or unavailable. Allow the microphone for this site, then try again.");
      setPhase("idle");
      return;
    }
    setPhase("connecting");
    const r = await previewVoiceAgentAction(botId, { ...voice, instructions }).catch(() => null);
    if (!r || !r.ok) {
      setError(r ? r.error : "Couldn't reach the server. Try again.");
      setPhase("idle");
      return;
    }
    try {
      convRef.current = await Conversation.startSession({
        signedUrl: r.signedUrl,
        connectionType: "websocket",
        textOnly: false,
        // The language is validated server-side against ElevenLabs' own list; the SDK types it as a closed union.
        overrides: r.overrides as SessionOverrides,
        onConnect: () => setPhase("live"),
        onDisconnect: (d) => {
          if (d.reason === "error") setError(d.message || "The test call was interrupted.");
          convRef.current = null;
          setMuted(false);
          setPhase("idle");
        },
        onError: (m) => setError(m || "Something went wrong during the test call."),
        onModeChange: ({ mode: m }) => setMode(m),
        onMessage: (m) => {
          const t = m.message?.trim();
          if (t) setLines((p) => [...p, { id: ++lineId.current, role: m.role === "user" ? "user" : "agent", text: t }]);
        },
      });
    } catch (err) {
      setError(err instanceof Error && err.message ? `Couldn't connect the test call: ${err.message}` : "Couldn't connect the test call. Try again.");
      convRef.current = null;
      setPhase("idle");
    }
  }

  async function hangUp() {
    setPhase("ending");
    await convRef.current?.endSession().catch(() => {});
    convRef.current = null;
    setPhase("idle");
  }

  const live = phase === "live";
  const busy = phase === "mic" || phase === "connecting" || phase === "ending";
  const blockedReason = !botId
    ? "Save the agent once to enable live test calls. After that you can test every change here before saving it."
    : !voice.elevenAgentId
      ? voice.syncError
        ? `Save & sync first: the agent isn't set up on ElevenLabs yet (${voice.syncError}).`
        : "Save & sync first: the agent isn't set up on ElevenLabs yet. Use Sync now above, then test."
      : !draftReady
        ? "Pick a voice and a language above to test."
        : !instructions.trim()
          ? "Write the system instructions below first - the test call speaks them."
          : null;

  return (
    <SectionCard title="Try it" description="Hear the agent as configured above, before you save. Test calls are not stored." action={<span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">Preview</span>}>
      <div className="space-y-4">
        <div className="rounded-xl border border-border/50 bg-background/50 p-3">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">What the agent will say first</p>
          {opening.spoken ? (
            <p className="mt-1 text-sm">&ldquo;{opening.spoken}&rdquo;</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Nothing. The caller speaks first (no first message is set).</p>
          )}
          {opening.who && <p className="mt-1 text-[11px] text-muted-foreground">Known as {opening.who}.</p>}
          {opening.disclosure && <p className="mt-1 text-[11px] text-muted-foreground">Early in the call it also says, in its own words: &ldquo;{opening.disclosure}&rdquo;</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="v-tone-test">Hear the tone</Label>
          <div className="flex gap-2">
            <Input id="v-tone-test" value={sample} maxLength={SAMPLE_TEXT_MAX} disabled={disabled} placeholder={opening.spoken ?? "Type a sentence for the agent to say"} onChange={(e) => setSample(e.target.value)} />
            <Button type="button" variant="outline" onClick={hear} disabled={disabled || sampling || !voice.voiceId || !sampleText.trim()}>
              {sampling ? <LoaderCircle className="size-4 animate-spin" /> : <Volume2 className="size-4" />} Play
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Reads the sentence (the first message when left empty) in the selected voice and language. Uses your ElevenLabs credits.</p>
          {sampleError && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{sampleError}</p>}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {live || phase === "ending" ? (
              <Button type="button" variant="destructive" onClick={hangUp} disabled={phase === "ending"}><PhoneOff className="size-4" /> End test call</Button>
            ) : (
              <Button type="button" onClick={startCall} disabled={disabled || busy || Boolean(blockedReason)}>
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Phone className="size-4" />} Test call with these settings
              </Button>
            )}
            {live && (
              <Button type="button" variant="outline" size="icon" aria-label={muted ? "Unmute" : "Mute"} onClick={() => { convRef.current?.setMicMuted(!muted); setMuted(!muted); }}>
                {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>
            )}
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {phase === "mic" ? "Waiting for microphone permission…" : phase === "connecting" ? "Connecting…" : live ? (muted ? "Muted" : mode === "speaking" ? "Agent is speaking" : "Listening to you") : ""}
            </span>
          </div>
          {blockedReason && !live && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" /> {blockedReason}</p>
          )}
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-900 dark:text-rose-200">{error}</p>}
          {lines.length > 0 && (
            <ul className="max-h-60 space-y-2 overflow-y-auto rounded-xl border border-border/50 bg-background/50 p-3">
              {lines.map((l) => (
                <li key={l.id} className={cn("flex", l.role === "user" ? "justify-end" : "justify-start")}>
                  <span className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm", l.role === "user" ? "bg-primary/12" : "bg-muted/60")}>{l.text}</span>
                </li>
              ))}
              <div ref={endRef} />
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground">The test call uses the draft prompt, first message, voice and language. Knowledge files and call length are those from the last sync.</p>
        </div>
      </div>
    </SectionCard>
  );
}
