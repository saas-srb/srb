"use client";

import { PanelHeading, ProductLauncherForPanel } from "@/components/platform/PanelsProvider";
import HelpLauncher from "@/components/support/HelpLauncher";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import DlmsMobileSidebar from "@/components/products/cybervault/DlmsMobileSidebar";
import DlmsNotificationsBell from "@/components/products/cybervault/DlmsNotificationsBell";
import PanelSearch from "@/components/platform/PanelSearch";
import { useAskAiOpen } from "@/lib/ai/use-ask-ai-open";
import AskAiDrawer from "@/components/platform/AskAiDrawer";
import type { DlmsNavFlags } from "@/components/products/cybervault/DlmsSidebar";
import type { DlmsBellItem } from "@/lib/products/cybervault/notifications";

export default function DlmsTopbar({
  roles,
  flags,
  notifications,
  unread,
}: {
  roles: string[];
  flags: DlmsNavFlags;
  notifications: DlmsBellItem[];
  unread: number;
}) {
  const [aiOpen, setAiOpen] = useAskAiOpen();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <DlmsMobileSidebar flags={flags} />
      <PanelHeading panel="dlms" fallbackTitle="Digi Locker" fallbackDescription="Securely store & manage digital documents" />
      <div className="flex min-w-0 shrink-0 justify-end md:flex-1 md:shrink md:justify-center">
        <PanelSearch />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <ProductLauncherForPanel panel="dlms" />
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
        <DlmsNotificationsBell items={notifications} unread={unread} />
      </div>
      <AskAiDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        panelId="dlms"
        panelTitle="Document Lifecycle Management"
        panelDescription="Securely store & manage digital documents"
        roles={roles}
      />
    </header>
  );
}
