"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Keyboard, AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoice } from "@/components/chat/VoiceProvider";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

/**
 * Accessible two-option segmented control for switching between Text Mode and
 * Voice Mode. Rendered as a radio group so screen readers announce it as a
 * single control with two choices, and arrow keys move between them.
 *
 * - `size="sm"` sits inside the chat input toolbar / voice product.
 * - `size="md"` is a standalone compact control.
 * - `size="lg"` is the prominent, full-width variant.
 */
export function VoiceModeToggle({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const tx = useText();
  const { voiceMode, setVoiceMode, available, supported } = useVoice();
  const reduceMotion = useReducedMotion();
  const groupRef = React.useRef<HTMLDivElement>(null);

  if (!supported) return null;

  const voiceOn = voiceMode && available;
  const options = [
    { key: "text" as const, label: tx("chat.voiceModeToggle.text"), hint: tx("chat.voiceModeToggle.type-your-questions"), icon: Keyboard, on: !voiceOn, disabled: false },
    {
      key: "voice" as const,
      label: tx("chat.voiceModeToggle.voice"),
      hint: available ? "Speak and listen" : "Voice is unavailable right now",
      icon: AudioLines,
      on: voiceOn,
      disabled: !available,
    },
  ];

  const move = (dir: 1 | -1) => {
    const next = dir === 1;
    const target = options.find((o) => o.key === (next ? "voice" : "text"));
    if (target && !target.disabled) setVoiceMode(target.key === "voice");
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Response mode"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        }
      }}
      className={cn(
        "relative inline-flex items-stretch gap-0.5",
        size === "sm"
          ? "rounded-full border border-border bg-muted/70 p-0.5"
          : "rounded-2xl border-2 border-border bg-background p-1 shadow-sm",
        size === "lg" && "w-full max-w-md",
        className
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          role="radio"
          aria-checked={opt.on}
          aria-label={`${opt.label} mode — ${opt.hint}`}
          tabIndex={opt.on ? 0 : -1}
          disabled={opt.disabled}
          onClick={() => setVoiceMode(opt.key === "voice")}
          className={cn(
            "relative z-10 flex flex-1 items-center justify-center font-semibold transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-45",
            size === "sm" && "gap-1.5 rounded-full px-2.5 py-1 text-xs",
            size === "md" && "gap-2 rounded-xl px-3.5 py-2 text-sm",
            size === "lg" && "gap-2 rounded-xl px-4 py-2 text-base sm:py-2.5",
            opt.on ? "text-primary-foreground" : "text-foreground/75 hover:text-foreground"
          )}
        >
          {opt.on && (
            <motion.span
              layoutId="voice-mode-pill"
              transition={
                reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }
              }
              className={cn(
                "absolute inset-0 -z-10 bg-gradient-to-r from-primary to-brand-accent shadow-sm shadow-primary/30",
                size === "sm" ? "rounded-full" : "rounded-xl"
              )}
            />
          )}
          <opt.icon className={cn(size === "lg" ? "size-5" : "size-3.5")} aria-hidden />
          {opt.label}
        </button>
      ))}
    </div>
  );
}
