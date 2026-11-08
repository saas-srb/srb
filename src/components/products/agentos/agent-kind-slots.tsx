"use client";

import type { ComponentType } from "react";
import type { AgentKind, VoiceConfig } from "@/lib/products/agentos/voice/types";
import VoiceSection from "@/components/products/agentos/voice/VoiceSection";

/**
 * Registry for the kind-specific part of the agent form. BotForm renders `AgentKindSlot` and nothing else for a
 * kind's own fields, so the voice module plugs in here without BotForm importing it.
 *
 * TO WIRE THE VOICE SECTION (voice agent owner): create `@/components/products/agentos/voice/VoiceSection` (default
 * export taking `VoiceSlotProps`) and set, below:
 *     import VoiceSection from "@/components/products/agentos/voice/VoiceSection";
 *     const VOICE_SECTION: ComponentType<VoiceSlotProps> | null = VoiceSection;
 */

export interface VoiceSlotProps {
  /** Present when editing an existing agent; null on create (the agent does not exist yet). */
  botId: string | null;
  value: VoiceConfig | null;
  onChange: (next: VoiceConfig | null) => void;
  disabled?: boolean;
}

const VOICE_SECTION = VoiceSection as ComponentType<VoiceSlotProps> | null;

export function AgentKindSlot({ kind, ...props }: VoiceSlotProps & { kind: AgentKind }) {
  if (kind !== "voice") return null;
  if (!VOICE_SECTION) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        The voice settings are not available in this build yet.
      </div>
    );
  }
  const Section = VOICE_SECTION;
  return <Section {...props} />;
}
