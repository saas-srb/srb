"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useVoice } from "@/components/chat/VoiceProvider";
import { Waveform } from "@/components/chat/voice/Waveform";
import { MicButton } from "@/components/chat/voice/MicButton";
import { VoiceStatusBar } from "@/components/chat/voice/VoiceStatusBar";
import { VoiceModeToggle } from "@/components/chat/voice/VoiceModeToggle";

/**
 * The full Voice Mode surface, shown in place of the text composer while Voice
 * Mode is on: a live visualiser, one large microphone control, and a plain,
 * high-contrast status readout. Designed to be usable at a glance and with a
 * screen reader.
 */
export function VoicePanel({ className }: { className?: string }) {
  const { phase, level } = useVoice();
  const speaking = phase === "speaking";
  const listening = phase === "listening";
  const active = listening || speaking;

  return (
    <motion.section
      aria-label="Voice mode"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative overflow-hidden rounded-3xl border-2 border-border bg-background px-4 py-4 shadow-lg shadow-black/5 sm:py-5",
        className
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 transition-opacity duration-500",
          listening
            ? "bg-gradient-to-br from-primary/10 via-transparent to-brand-accent/10 opacity-100"
            : speaking
              ? "bg-gradient-to-br from-brand-deep/10 via-transparent to-secondary/20 opacity-100"
              : "opacity-0"
        )}
      />

      <div className="mb-3 flex justify-center sm:mb-4">
        <VoiceModeToggle size="sm" />
      </div>

      <div className="flex flex-col items-center gap-3 sm:gap-4">
        <Waveform level={level} active={active} tone={speaking ? "blue" : "coral"} />
        <MicButton />
        <VoiceStatusBar />
      </div>
    </motion.section>
  );
}
