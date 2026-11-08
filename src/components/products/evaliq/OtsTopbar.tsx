"use client";

import { PanelHeading, ProductLauncherForPanel } from "@/components/platform/PanelsProvider";
import HelpLauncher from "@/components/support/HelpLauncher";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import OtsMobileSidebar from "@/components/products/evaliq/OtsMobileSidebar";
import OtsNotificationsBell from "@/components/products/evaliq/OtsNotificationsBell";
import PanelSearch from "@/components/platform/PanelSearch";
import { useAskAiOpen } from "@/lib/ai/use-ask-ai-open";
import AskAiDrawer from "@/components/platform/AskAiDrawer";
import type { OtsNavFlags } from "@/components/products/evaliq/OtsSidebar";
import type { OtsBellItem } from "@/lib/products/evaliq/notifications";

export default function OtsTopbar({
  roles,
  flags,
  notifications,
  unread,
}: {
  roles: string[];
  flags: OtsNavFlags;
  notifications: OtsBellItem[];
  unread: number;
}) {
  const [aiOpen, setAiOpen] = useAskAiOpen();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <OtsMobileSidebar flags={flags} />
      <PanelHeading panel="ots" fallbackTitle="Online Test System" fallbackDescription="Create exams, quizzes & evaluate candidates" />
      <div className="flex min-w-0 shrink-0 justify-end md:flex-1 md:shrink md:justify-center">
        <PanelSearch />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <ProductLauncherForPanel panel="ots" />
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
        <OtsNotificationsBell items={notifications} unread={unread} />
      </div>
      <AskAiDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        panelId="ots"
        panelTitle="Online Test System"
        panelDescription="Create exams, quizzes & evaluate candidates"
        roles={roles}
      />
    </header>
  );
}
