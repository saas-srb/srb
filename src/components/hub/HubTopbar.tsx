"use client";

import { PanelHeading, ProductLauncherForPanel } from "@/components/platform/PanelsProvider";
import HelpLauncher from "@/components/support/HelpLauncher";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { NavSection } from "@/lib/products/commandos/nav";
import HubMobileSidebar from "@/components/hub/HubMobileSidebar";
import PanelSearch from "@/components/platform/PanelSearch";
import NotificationBell from "@/components/platform/hub/NotificationBell";
import { useAskAiOpen } from "@/lib/ai/use-ask-ai-open";
import AskAiDrawer from "@/components/platform/AskAiDrawer";

export default function HubTopbar({ email, nav, unread = 0 }: { email: string; nav: NavSection[]; unread?: number }) {
  const [aiOpen, setAiOpen] = useAskAiOpen();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <HubMobileSidebar nav={nav} />
      <PanelHeading panel="workspace" fallbackTitle="Workspace" fallbackDescription="Your products, analytics & settings" />
      <div className="flex min-w-0 shrink-0 justify-end md:flex-1 md:shrink md:justify-center">
        <PanelSearch />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <ProductLauncherForPanel panel="workspace" />
        <HelpLauncher />
        <button
          type="button"
          onClick={() => setAiOpen(!aiOpen)}
          title="Ask AI Assistant"
          aria-label="Ask AI Assistant"
          className="flex size-9 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
        >
          <Sparkles className="size-4" />
        </button>
        <NotificationBell initial={unread} />
      </div>
      <AskAiDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        panelId="hub"
        panelTitle="Workspace Hub"
        panelDescription="Your products, analytics & settings"
      />
    </header>
  );
}
