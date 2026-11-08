"use client";

import PanelBellLink from "@/components/platform/PanelBellLink";
import { PanelHeading, ProductLauncherForPanel } from "@/components/platform/PanelsProvider";
import HelpLauncher from "@/components/support/HelpLauncher";
import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Sparkles } from "lucide-react";
import CmsMobileSidebar from "@/components/products/sitecraft-ai/CmsMobileSidebar";
import CmsCommandSearch from "@/components/products/sitecraft-ai/CmsCommandSearch";
import { useAskAiOpen } from "@/lib/ai/use-ask-ai-open";
import AskAiDrawer from "@/components/platform/AskAiDrawer";
import type { CmsNavFlags } from "@/components/products/sitecraft-ai/CmsSidebar";

/** Ask AI is the shared agent (attachments, approvals); in the CMS it edits the real website. `aiAgent` is kept for the layout and no longer changes the drawer. */
export default function CmsTopbar({ roles: _roles, flags, unread = 0 }: { roles: string[]; flags: CmsNavFlags; aiAgent?: boolean; unread?: number }) {
  const [aiOpen, setAiOpen] = useAskAiOpen();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <CmsMobileSidebar flags={flags} />
      <PanelHeading panel="cms" fallbackTitle="Website" fallbackDescription="Your public website, pages and content" />
      <div className="flex min-w-0 shrink-0 justify-end md:flex-1 md:shrink md:justify-center">
        <CmsCommandSearch />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <ProductLauncherForPanel panel="cms" />
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
        <PanelBellLink href="/sitecraft-ai/notifications" unread={unread} panel="cms" />
      </div>
      <AskAiDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        panelId="cms"
        panelTitle="Content Management System"
        panelDescription="Pages, blogs & website content"
        roles={_roles}
      />
    </header>
  );
}
