"use client";

import { ChatProvider } from "@/components/chat/ChatProvider";
import { VoiceProvider } from "@/components/chat/VoiceProvider";
import { ChatWorkspace } from "@/components/chat/ChatWorkspace";

export default function AskContent() {
  return (
    <ChatProvider withHistorySidebar>
      <VoiceProvider>
        <ChatWorkspace />
      </VoiceProvider>
    </ChatProvider>
  );
}
