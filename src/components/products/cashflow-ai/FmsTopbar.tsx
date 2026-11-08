"use client";

import PanelBellLink from "@/components/platform/PanelBellLink";
import { PanelHeading, ProductLauncherForPanel } from "@/components/platform/PanelsProvider";
import HelpLauncher from "@/components/support/HelpLauncher";
import { useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import FmsMobileSidebar from "@/components/products/cashflow-ai/FmsMobileSidebar";
import PanelSearch from "@/components/platform/PanelSearch";
import { useAskAiOpen } from "@/lib/ai/use-ask-ai-open";
import AskAiDrawer from "@/components/platform/AskAiDrawer";
import type { FmsRole } from "@/lib/fms-roles";

export default function FmsTopbar({
  roles,
  permissionOverrides,
  unread = 0,
}: {
  roles: FmsRole[];
  permissionOverrides?: Record<string, boolean>;
  unread?: number;
}) {
  const [aiOpen, setAiOpen] = useAskAiOpen();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <FmsMobileSidebar roles={roles} permissionOverrides={permissionOverrides} />
      <PanelHeading panel="fms" fallbackTitle="Finance Management" fallbackDescription="Budgets, invoices, expenses & financial reports" />
      <div className="flex min-w-0 shrink-0 justify-end md:flex-1 md:shrink md:justify-center">
        <PanelSearch />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <ProductLauncherForPanel panel="fms" />
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
        <PanelBellLink href="/cashflow-ai/notifications" unread={unread} panel="fms" />
      </div>
      <AskAiDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        panelId="fms"
        panelTitle="Financial Management System"
        panelDescription="Budgets, invoices, expenses & financial reports"
        roles={roles}
      />
    </header>
  );
}
