"use client";

import { PanelHeading, ProductLauncherForPanel } from "@/components/platform/PanelsProvider";
import HelpLauncher from "@/components/support/HelpLauncher";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import SmmsMobileSidebar from "@/components/products/viralpulse-ai/SmmsMobileSidebar";
import SmmsNotificationsBell from "@/components/products/viralpulse-ai/SmmsNotificationsBell";
import PanelSearch from "@/components/platform/PanelSearch";
import { useAskAiOpen } from "@/lib/ai/use-ask-ai-open";
import AskAiDrawer from "@/components/platform/AskAiDrawer";
import type { SmmsNavFlags } from "@/components/products/viralpulse-ai/SmmsSidebar";
import type { NavBadges } from "@/lib/products/viralpulse-ai/nav";
import type { SmmsBellItem } from "@/lib/products/viralpulse-ai/notifications";

export default function SmmsTopbar({
  roles,
  flags,
  badges,
  notifications,
  unread,
}: {
  roles: string[];
  flags: SmmsNavFlags;
  badges: NavBadges;
  notifications: SmmsBellItem[];
  unread: number;
}) {
  const [aiOpen, setAiOpen] = useAskAiOpen();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <SmmsMobileSidebar flags={flags} badges={badges} />
      <PanelHeading panel="smms" fallbackTitle="Social Media Marketing" fallbackDescription="Schedule posts, analytics & campaign management" />
      <div className="flex min-w-0 shrink-0 justify-end md:flex-1 md:shrink md:justify-center">
        <PanelSearch />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <ProductLauncherForPanel panel="smms" />
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
        <SmmsNotificationsBell items={notifications} unread={unread} />
      </div>
      <AskAiDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        panelId="smms"
        panelTitle="Social Media Management"
        panelDescription="Schedule posts, analytics & campaign management"
        roles={roles}
      />
    </header>
  );
}
