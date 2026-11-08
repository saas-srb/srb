"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoice } from "@/components/chat/VoiceProvider";

/**
 * The primary voice control: a large (96px) circular button that starts and
 * stops recording, or stops playback while the assistant is speaking. The
 * label and pressed state are announced to assistive tech; the pulsing rings
 * are decorative and disabled under `prefers-reduced-motion`.
 */
export function MicButton() {
  const { status, level, toggleListening, available, interrupt } = useVoice();
  const reduceMotion = useReducedMotion();

  const listening = status === "listening";
  const busy = status === "transcribing" || status === "thinking";
  const speaking = status === "speaking";

  const onClick = () => {
    if (speaking) interrupt();
    else if (status === "idle" || listening) toggleListening();
  };

  const label = listening
    ? "Stop recording"
    : speaking
      ? "Stop the assistant"
      : busy
        ? "Processing, please wait"
        : "Start speaking";

  return (
    <div className="relative flex items-center justify-center">
      {/* pulsing rings while listening (decorative) */}
      <AnimatePresence>
        {listening && !reduceMotion && (
          <>
            {[0, 1].map((i) => (
              <motion.span
                key={i}
                aria-hidden
                initial={{ scale: 1, opacity: 0.35 }}
                animate={{ scale: 2 + level * 1.2, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.5, ease: "easeOut" }}
                className="absolute size-20 rounded-full bg-primary/30 sm:size-24"
              />
            ))}
          </>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        data-voice-mic
        onClick={onClick}
        disabled={busy || (!available && status === "idle")}
        aria-label={label}
        aria-pressed={listening}
        animate={listening && !reduceMotion ? { scale: 1 + level * 0.12 } : { scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className={cn(
          "relative flex size-20 items-center justify-center rounded-full text-white shadow-xl transition-colors sm:size-24",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          listening
            ? "bg-gradient-to-br from-primary to-brand-accent shadow-primary/40 ring-4 ring-primary/25"
            : speaking
              ? "bg-gradient-to-br from-brand-deep to-secondary-foreground shadow-brand-deep/40 ring-4 ring-brand-deep/25"
              : "bg-gradient-to-br from-primary to-brand-accent shadow-primary/30 motion-safe:hover:scale-105 active:scale-95"
        )}
      >
        {busy ? (
          <Loader2 className="size-9 animate-spin" aria-hidden />
        ) : listening || speaking ? (
          <Square className="size-8" fill="currentColor" aria-hidden />
        ) : (
          <Mic className="size-9" aria-hidden />
        )}
      </motion.button>
    </div>
  );
}
