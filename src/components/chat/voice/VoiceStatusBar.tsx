"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Ear, Loader2, RotateCcw, Volume2, VolumeX, Square, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoice, type VoicePhase } from "@/components/chat/VoiceProvider";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

const PHASE = (tx: (key: string) => string): Record<
  VoicePhase,
  { label: string; description: string; Icon: typeof Ear; tone: string }
> => ({
  ready: {
    label: tx("chat.voiceStatusBar.ready"),
    description: tx("chat.voiceStatusBar.press-the-microphone-button-to-ask-a-que"),
    Icon: CircleDot,
    tone: "text-foreground",
  },
  listening: {
    label: tx("chat.voiceStatusBar.listening"),
    description: tx("chat.voiceStatusBar.go-ahead-i-m-listening-i-ll-stop-automat"),
    Icon: Ear,
    tone: "text-primary",
  },
  processing: {
    label: tx("chat.voiceStatusBar.processing"),
    description: tx("chat.voiceStatusBar.working-on-your-answer"),
    Icon: Loader2,
    tone: "text-primary",
  },
  speaking: {
    label: tx("chat.voiceStatusBar.speaking"),
    description: tx("chat.voiceStatusBar.playing-the-answer-aloud-press-stop-to-i"),
    Icon: Volume2,
    tone: "text-brand-deep dark:text-secondary-foreground",
  },
});

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function VoiceStatusBar() {
  const tx = useText();
  const { phase, recordingMs, muted, canReplay, hint, error, toggleMute, replayLast, interrupt } =
    useVoice();

  const meta = PHASE(tx)[phase];
  const showTimer = phase === "listening";
  const canStop = phase === "speaking" || phase === "processing" || phase === "listening";

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {/* Large, high-contrast status indicator — announced to screen readers */}
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-0.5 text-center"
      >
        <span className={cn("inline-flex items-center gap-2 text-xl font-bold", meta.tone)}>
          <span className="relative flex size-3">
            {(phase === "listening" || phase === "speaking") && (
              <span
                className={cn(
                  "absolute inline-flex size-full rounded-full opacity-75 motion-safe:animate-ping",
                  phase === "listening" ? "bg-primary" : "bg-brand-deep dark:bg-secondary-foreground"
                )}
              />
            )}
            <meta.Icon
              className={cn("relative size-3.5 -translate-x-px", phase === "processing" && "animate-spin")}
              aria-hidden
            />
          </span>
          {meta.label}
          {showTimer && (
            <span className="text-base font-medium tabular-nums text-muted-foreground">
              {fmt(recordingMs)}
            </span>
          )}
        </span>
        {meta.description && (
          <p className="max-w-xs text-sm text-muted-foreground">{meta.description}</p>
        )}
      </div>

      {/* Secondary controls — 44px targets, icon + text label */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-border px-3.5 text-sm font-medium text-foreground/80 transition-colors",
            "hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/50",
            muted && "border-primary/50 bg-primary/10 text-primary"
          )}
        >
          {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
          {muted ? "Muted" : "Sound on"}
        </button>

        <button
          type="button"
          onClick={replayLast}
          disabled={!canReplay || phase === "speaking"}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-border px-3.5 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/50 disabled:opacity-40"
        >
          <RotateCcw className="size-4" aria-hidden />
          {tx("chat.voiceStatusBar.replay")}</button>

        <button
          type="button"
          onClick={interrupt}
          disabled={!canStop}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-destructive/50 px-3.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-destructive/40 disabled:opacity-40"
        >
          <Square className="size-4" fill="currentColor" aria-hidden />
          {tx("chat.voiceStatusBar.stop")}</button>
      </div>

      {/* Transient hint / error — announced politely / assertively */}
      <div className="min-h-0" aria-live="polite">
        <AnimatePresence>
          {(hint || error) && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              role={error ? "alert" : "status"}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium",
                error ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
              )}
            >
              {error || hint}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
