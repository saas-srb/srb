"use client";

import PanelBellLink from "@/components/platform/PanelBellLink";
import { PanelHeading, ProductLauncherForPanel } from "@/components/platform/PanelsProvider";
import HelpLauncher from "@/components/support/HelpLauncher";
import { useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import PanelSearch from "@/components/platform/PanelSearch";
import { useAskAiOpen } from "@/lib/ai/use-ask-ai-open";
import AskAiDrawer from "@/components/platform/AskAiDrawer";
import type { LpmsNavFlags } from "@/components/products/contractflow-ai/LpmsSidebar";
import LpmsMobileSidebar from "@/components/products/contractflow-ai/LpmsMobileSidebar";

export default function LpmsTopbar({
  roles: _roles,
  flags,
  unread = 0,
}: {
  roles: string[];
  flags: LpmsNavFlags;
  unread?: number;
}) {
  const [aiOpen, setAiOpen] = useAskAiOpen();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <LpmsMobileSidebar flags={flags} />
      <PanelHeading panel="lpms" fallbackTitle="Legal & Document Automation" fallbackDescription="Policies, agreements & document workflows" />
      <div className="flex min-w-0 shrink-0 justify-end md:flex-1 md:shrink md:justify-center">
        <PanelSearch />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <ProductLauncherForPanel panel="lpms" />
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
        <PanelBellLink href="/contractflow-ai/notifications" unread={unread} panel="lpms" />
      </div>
      <AskAiDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        panelId="lpms"
        panelTitle="Legal & Process Management"
        panelDescription="Policies, agreements & document workflows"
        roles={_roles}
      />
    </header>
  );
}
