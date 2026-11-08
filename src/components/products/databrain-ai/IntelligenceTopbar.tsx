"use client";

import PanelBellLink from "@/components/platform/PanelBellLink";
import { PanelHeading, ProductLauncherForPanel } from "@/components/platform/PanelsProvider";
import HelpLauncher from "@/components/support/HelpLauncher";
import { useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import IntelligenceMobileSidebar from "@/components/products/databrain-ai/IntelligenceMobileSidebar";
import PanelSearch from "@/components/platform/PanelSearch";
import { useAskAiOpen } from "@/lib/ai/use-ask-ai-open";
import AskAiDrawer from "@/components/platform/AskAiDrawer";

export default function IntelligenceTopbar({ roles: _roles, unread = 0 }: { roles: string[]; unread?: number }) {
  const [aiOpen, setAiOpen] = useAskAiOpen();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <IntelligenceMobileSidebar />
      <PanelHeading panel="intelligence" fallbackTitle="AI Intelligence" fallbackDescription="Data analytics, insights & AI reports" />
      <div className="flex min-w-0 shrink-0 justify-end md:flex-1 md:shrink md:justify-center">
        <PanelSearch />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <ProductLauncherForPanel panel="intelligence" />
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
        <PanelBellLink href="/databrain-ai/notifications" unread={unread} panel="intelligence" />
      </div>
      <AskAiDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        panelId="intelligence"
        panelTitle="Business Intelligence"
        panelDescription="Data analytics, insights & AI reports"
        roles={_roles}
      />
    </header>
  );
}
