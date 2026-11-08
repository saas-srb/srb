"use client";

import * as React from "react";
import { AnimatePresence } from "framer-motion";
import { ChatProvider, useChat } from "@/components/chat/ChatProvider";
import { VoiceProvider, useVoice } from "@/components/chat/VoiceProvider";
import { ChatSidebar, ChatSidebarDrawer } from "@/components/chat/ChatSidebar";
import { ChatConversation } from "@/components/chat/ChatConversation";
import { ChatDock } from "@/components/chat/ChatDock";
import { TextProvider } from "@/components/products/sitecraft-ai/TextContext";
import { defaultUiText } from "@/lib/products/sitecraft-ai/default-ui-text";
import { BrandProvider } from "@/components/platform/BrandProvider";
import { Bot, PanelLeft, Plus } from "lucide-react";

const BRAND = "SelfRun AI";
const SAAS_TEXT = defaultUiText(BRAND);
const SAAS_BRAND_OBJ = {
  name: BRAND,
  namePrimary: "SelfRun",
  nameAccent: "AI",
  logoUrl: null,
  primaryColor: null,
  isPlatformOwner: false,
} as const;

/** ChatGPT-style workspace: left sidebar (history) + right conversation window */
function AskWorkspace() {
  const { newConversation, messages } = useChat();
  const { supported, available, voiceMode } = useVoice();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const voiceActive = supported && available && voiceMode;

  return (
    <div className="relative flex flex-1 min-h-0 w-full overflow-hidden">
      {/* Background gradient subtle wash */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-transparent to-secondary/10" />

      {/* ── Left Sidebar (ChatGPT-style Chat History) ── */}
      <aside className="hidden w-72 sm:w-80 shrink-0 flex-col border-r border-border/60 bg-muted/20 dark:bg-muted/10 lg:flex h-full min-h-0 overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3.5 shrink-0 bg-background/50 backdrop-blur-sm">
          <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-accent text-white shadow-sm">
            <Bot className="size-4" aria-hidden />
          </div>
          <span className="text-sm font-bold text-foreground">
            Ask <span className="text-primary">SelfRun AI</span>
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChatSidebar />
        </div>
      </aside>

      {/* ── Mobile Sidebar Drawer ── */}
      <AnimatePresence>
        {drawerOpen && (
          <ChatSidebarDrawer onClose={() => setDrawerOpen(false)} />
        )}
      </AnimatePresence>

      {/* ── Right Column: Chat Window ── */}
      <div className="flex min-w-0 flex-1 flex-col h-full min-h-0 overflow-hidden">
        {/* Workspace Toolbar Header */}
        <header className="flex items-center justify-between gap-2 border-b border-border/60 bg-background/70 px-4 py-2.5 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2">
            {/* Mobile toggle to open sidebar drawer */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open chat history"
              className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted active:scale-95 lg:hidden"
            >
              <PanelLeft className="size-4 text-primary" aria-hidden />
              <span className="text-[11px]">History</span>
            </button>

            {/* Brand mark on mobile */}
            <div className="flex items-center gap-2 lg:hidden">
              <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-brand-accent text-white">
                <Bot className="size-3.5" aria-hidden />
              </div>
              <span className="text-sm font-bold text-foreground">
                Ask <span className="text-primary">SelfRun AI</span>
              </span>
            </div>

            <span className="hidden text-sm font-semibold text-muted-foreground lg:inline">
              Conversation
            </span>

            {voiceActive && (
              <span className="hidden items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary sm:inline-flex">
                <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden />
                Voice mode
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => void newConversation()}
            disabled={messages.length === 0}
            className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/20 active:scale-95 disabled:opacity-40 disabled:pointer-events-none lg:hidden"
          >
            <Plus className="size-3.5" aria-hidden />
            <span>New</span>
          </button>
        </header>

        {/* Conversation Thread & Bottom Dock */}
        <ChatConversation wide dock={<ChatDock wide />} />
      </div>
    </div>
  );
}

/**
 * Full-page ChatGPT-style Ask AI experience on SelfRun AI.
 * Wrapped in BrandProvider and TextProvider with defaultUiText so all labels,
 * placeholders, and buttons render cleanly and correctly.
 */
export default function SaasAskContent() {
  return (
    <BrandProvider brand={SAAS_BRAND_OBJ}>
      <TextProvider text={SAAS_TEXT}>
        <ChatProvider withHistorySidebar>
          <VoiceProvider>
            {/* Height precisely fills the viewport beneath the 76px sticky header */}
            <div className="flex h-[calc(100dvh-76px)] min-h-[600px] w-full flex-col overflow-hidden bg-background">
              <AskWorkspace />
            </div>
          </VoiceProvider>
        </ChatProvider>
      </TextProvider>
    </BrandProvider>
  );
}
