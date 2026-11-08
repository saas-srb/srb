"use client";

import { Bot, Plus, X } from "lucide-react";
import { useChat } from "@/components/chat/ChatProvider";
import { ChatConversation } from "@/components/chat/ChatConversation";
import { ChatDock } from "@/components/chat/ChatDock";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

/** Widget chrome (used by the floating ChatWidget). The full-page /ask
 * experience uses ChatWorkspace instead. */
export function ChatPanel({ onClose }: { onClose?: () => void }) {
  const tx = useText();
  const { messages, newConversation } = useChat();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 bg-background/70 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="relative flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-brand-accent text-white shadow-sm">
            <Bot className="size-4" aria-hidden />
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-emerald-500" aria-hidden />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-foreground">{tx("chat.chatPanel.ask-brand")}</p>
            <p className="text-[11px] text-muted-foreground">{tx("chat.chatPanel.ai-assistant-answers-from-our-knowledge-")}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={newConversation}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <Plus className="size-3" aria-hidden />{tx("chat.chatPanel.new-chat")}</button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close chat"
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <ChatConversation dock={<ChatDock />} />
    </div>
  );
}
