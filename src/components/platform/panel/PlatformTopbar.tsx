"use client";

import { PanelHeading } from "@/components/platform/PanelsProvider";
import HelpLauncher from "@/components/support/HelpLauncher";
import { useState } from "react";
import Link from "next/link";
import { Menu, Sparkles } from "lucide-react";
import { MobileSidebarProfile } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import SidebarBrand from "@/components/SidebarBrand";
import PlatformSidebar, { type PlatformNavFlags } from "@/components/platform/panel/PlatformSidebar";
import { useAskAiOpen } from "@/lib/ai/use-ask-ai-open";
import PanelBellLink from "@/components/platform/PanelBellLink";
import AskAiDrawer from "@/components/platform/AskAiDrawer";

export default function PlatformTopbar({ flags }: { flags: PlatformNavFlags; email?: string }) {
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useAskAiOpen();
  const [bellOpen, setBellOpen] = useState(false);
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <Button type="button" variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation menu">
        <Menu className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-72 flex-col p-0 sm:max-w-72">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Platform Console navigation menu</SheetDescription>
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-4">
            <SidebarBrand />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <PlatformSidebar flags={flags} onNavigate={() => setOpen(false)} />
          </div>
          <MobileSidebarProfile />
        </SheetContent>
      </Sheet>
      <PanelHeading panel="platform" fallbackTitle="Platform Console" fallbackDescription="Every company, plan and setting of the SaaS platform" />
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
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
        <PanelBellLink href="/console/notifications" unread={flags.unreadNotifications ?? 0} />
      </div>
      <AskAiDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        panelId="platform"
        panelTitle="Platform Administration"
        panelDescription="Every company, plan and setting of the SaaS platform"
      />
    </header>
  );
}
