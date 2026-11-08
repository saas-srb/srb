"use client";

import { PanelHeading, ProductLauncherForPanel } from "@/components/platform/PanelsProvider";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import PortalMobileSidebar from "@/components/products/clientos/PortalMobileSidebar";
import PortalNotificationsBell, { type BellItem } from "@/components/products/clientos/PortalNotificationsBell";
import LeadSwitcher, { type LeadSummary } from "@/components/products/clientos/LeadSwitcher";
import { useAskAiOpen } from "@/lib/ai/use-ask-ai-open";
import AskAiDrawer from "@/components/platform/AskAiDrawer";
import { PORTAL_ROLE_META, type PortalRole } from "@/lib/portal-roles";

export default function PortalTopbar({
  role,
  displayName,
  notifications,
  unread,
  leads = [],
}: {
  role: PortalRole;
  displayName: string;
  notifications: BellItem[];
  unread: number;
  leads?: LeadSummary[];
}) {
  const [aiOpen, setAiOpen] = useAskAiOpen();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <PortalMobileSidebar role={role} />
      <PanelHeading panel="portal" fallbackTitle={PORTAL_ROLE_META[role].portalName} fallbackDescription={`Welcome, ${displayName}`} />
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <ProductLauncherForPanel panel="portal" />
        <LeadSwitcher leads={leads} />
        <button
          type="button"
          onClick={() => setAiOpen(!aiOpen)}
          title="Ask AI Assistant"
          aria-label="Ask AI Assistant"
          className="flex size-9 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
        >
          <Sparkles className="size-4" />
        </button>
        <PortalNotificationsBell items={notifications} unread={unread} />
      </div>
      <AskAiDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        panelId="portal"
        panelTitle="Client Portal"
        panelDescription={`Welcome, ${displayName}`}
        roles={[role]}
      />
    </header>
  );
}
