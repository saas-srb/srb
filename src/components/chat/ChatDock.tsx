"use client";

import * as React from "react";
import { useChat } from "@/components/chat/ChatProvider";
import { useVoice } from "@/components/chat/VoiceProvider";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { VoiceModeToggle } from "@/components/chat/voice/VoiceModeToggle";
import { VoicePanel } from "@/components/chat/voice/VoicePanel";

/**
 * The bottom dock of the /ask workspace. The Text / Voice switch lives inside
 * the input surface itself — the composer's toolbar row in Text Mode, and the
 * Voice Mode console header — so either mode is one tap away without adding a
 * separate control bar.
 */
export function ChatDock({ wide = false }: { wide?: boolean }) {
  const { send, status, config } = useChat();
  const { supported, available, voiceMode } = useVoice();

  const streaming = status === "streaming";
  const unavailable = config?.available === false;
  const maxChars = config?.maxMessageChars ?? 2000;
  const showVoice = supported && voiceMode && available;

  // On a real mode switch (not first mount), move focus to the new input so
  // keyboard and screen-reader users land on the control they just chose.
  const mounted = React.useRef(false);
  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const sel = showVoice ? "[data-voice-mic]" : "[data-chat-input]";
    (document.querySelector(sel) as HTMLElement | null)?.focus();
  }, [showVoice]);

  return (
    <div className="pb-3 pt-1">
      {showVoice ? (
        <VoicePanel />
      ) : (
        <ChatComposer
          disabled={unavailable}
          streaming={streaming}
          maxChars={maxChars}
          onSend={send}
          wide={wide}
          modeToggle={supported ? <VoiceModeToggle size="sm" /> : undefined}
        />
      )}
    </div>
  );
}
