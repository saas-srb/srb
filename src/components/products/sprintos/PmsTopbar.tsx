"use client";

import { PanelHeading, ProductLauncherForPanel } from "@/components/platform/PanelsProvider";
import HelpLauncher from "@/components/support/HelpLauncher";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import PmsMobileSidebar from "@/components/products/sprintos/PmsMobileSidebar";
import PmsNotificationsBell, { type BellItem } from "@/components/products/sprintos/PmsNotificationsBell";
import PanelSearch from "@/components/platform/PanelSearch";
import { useAskAiOpen } from "@/lib/ai/use-ask-ai-open";
import AskAiDrawer from "@/components/platform/AskAiDrawer";
import type { PmsRole } from "@/lib/pms-roles";

export default function PmsTopbar({
  roles,
  permissionOverrides,
  employeeId,
  notifications,
  unread = 0,
}: {
  roles: PmsRole[];
  allRoles: string[];
  permissionOverrides?: Record<string, boolean>;
  employeeId: string | null;
  notifications: BellItem[];
  unread: number;
}) {
  const [aiOpen, setAiOpen] = useAskAiOpen();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <PmsMobileSidebar roles={roles} permissionOverrides={permissionOverrides} employeeId={employeeId} />
      <PanelHeading panel="pms" fallbackTitle="Project Management" fallbackDescription="Plan projects, tasks & team performance" />
      <div className="flex min-w-0 shrink-0 justify-end md:flex-1 md:shrink md:justify-center">
        <PanelSearch />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <ProductLauncherForPanel panel="pms" />
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
        <PmsNotificationsBell items={notifications} unread={unread} />
      </div>
      <AskAiDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        panelId="pms"
        panelTitle="Project Management System"
        panelDescription="Plan projects, tasks & team performance"
        roles={roles}
      />
    </header>
  );
}
