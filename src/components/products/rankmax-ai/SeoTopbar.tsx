"use client";

import { PanelHeading, ProductLauncherForPanel } from "@/components/platform/PanelsProvider";
import HelpLauncher from "@/components/support/HelpLauncher";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import SeoMobileSidebar from "@/components/products/rankmax-ai/SeoMobileSidebar";
import SeoNotificationsBell from "@/components/products/rankmax-ai/SeoNotificationsBell";
import PanelSearch from "@/components/platform/PanelSearch";
import { useAskAiOpen } from "@/lib/ai/use-ask-ai-open";
import AskAiDrawer from "@/components/platform/AskAiDrawer";
import type { SeoNavFlags } from "@/components/products/rankmax-ai/SeoSidebar";
import type { SeoBellItem } from "@/lib/products/rankmax-ai/notifications";

export default function SeoTopbar({
  roles,
  flags,
  notifications,
  unread,
}: {
  roles: string[];
  flags: SeoNavFlags;
  notifications: SeoBellItem[];
  unread: number;
}) {
  const [aiOpen, setAiOpen] = useAskAiOpen();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <SeoMobileSidebar flags={flags} />
      <PanelHeading panel="seo" fallbackTitle="Search Engine Optimization" fallbackDescription="Keywords, rankings & website visibility" />
      <div className="flex min-w-0 shrink-0 justify-end md:flex-1 md:shrink md:justify-center">
        <PanelSearch />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <ProductLauncherForPanel panel="seo" />
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
        <SeoNotificationsBell items={notifications} unread={unread} />
      </div>
      <AskAiDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        panelId="seo"
        panelTitle="Search Engine Optimization"
        panelDescription="Keywords, rankings & website visibility"
        roles={roles}
      />
    </header>
  );
}
