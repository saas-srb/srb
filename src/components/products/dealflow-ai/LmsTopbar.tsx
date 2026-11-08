"use client";

import { PanelHeading, ProductLauncherForPanel } from "@/components/platform/PanelsProvider";
import HelpLauncher from "@/components/support/HelpLauncher";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import MobileSidebar from "@/components/products/dealflow-ai/MobileSidebar";
import PanelSearch from "@/components/platform/PanelSearch";
import NotificationsBell from "@/components/products/dealflow-ai/NotificationsBell";
import { useAskAiOpen } from "@/lib/ai/use-ask-ai-open";
import AskAiDrawer from "@/components/platform/AskAiDrawer";

export default function LmsTopbar({ roles, unread = 0 }: { roles: string[]; userEmail: string; unread?: number }) {
  const [aiOpen, setAiOpen] = useAskAiOpen();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <MobileSidebar />
      <PanelHeading panel="lms" fallbackTitle="Lead Management" fallbackDescription="Track leads, pipeline & career applications" />
      <div className="flex min-w-0 shrink-0 justify-end md:flex-1 md:shrink md:justify-center">
        <PanelSearch />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <ProductLauncherForPanel panel="lms" />
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
        <NotificationsBell unread={unread} />
      </div>
      <AskAiDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        panelId="lms"
        panelTitle="Lead Management System"
        panelDescription="Track leads, pipeline & career applications"
        roles={roles}
      />
    </header>
  );
}
