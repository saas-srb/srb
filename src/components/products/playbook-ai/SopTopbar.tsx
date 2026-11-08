"use client";

import { PanelHeading, ProductLauncherForPanel } from "@/components/platform/PanelsProvider";
import HelpLauncher from "@/components/support/HelpLauncher";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import SopMobileSidebar from "@/components/products/playbook-ai/SopMobileSidebar";
import SopNotificationsBell from "@/components/products/playbook-ai/SopNotificationsBell";
import PanelSearch from "@/components/platform/PanelSearch";
import { useAskAiOpen } from "@/lib/ai/use-ask-ai-open";
import AskAiDrawer from "@/components/platform/AskAiDrawer";
import type { SopNavFlags } from "@/components/products/playbook-ai/SopSidebar";
import type { SopBellItem } from "@/lib/products/playbook-ai/notifications";

export default function SopTopbar({
  roles: _roles,
  flags,
  notifications,
  unread = 0,
}: {
  roles: string[];
  flags: SopNavFlags;
  notifications: SopBellItem[];
  unread: number;
}) {
  const [aiOpen, setAiOpen] = useAskAiOpen();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <SopMobileSidebar flags={flags} />
      <PanelHeading panel="sop" fallbackTitle="Standard Operating Procedures" fallbackDescription="Create, review & publish SOPs and workflows" />
      <div className="flex min-w-0 shrink-0 justify-end md:flex-1 md:shrink md:justify-center">
        <PanelSearch />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <ProductLauncherForPanel panel="sop" />
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
        <SopNotificationsBell items={notifications} unread={unread} />
      </div>
      <AskAiDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        panelId="sop"
        panelTitle="Standard Operating Procedures"
        panelDescription="Create, review & publish SOPs and workflows"
        roles={_roles}
      />
    </header>
  );
}
