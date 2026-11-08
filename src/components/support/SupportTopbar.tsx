"use client";

import { PanelHeading, ProductLauncherForPanel } from "@/components/platform/PanelsProvider";
import { Sparkles } from "lucide-react";
import { useAskAiOpen } from "@/lib/ai/use-ask-ai-open";
import AskAiDrawer from "@/components/platform/AskAiDrawer";
import SupportMobileSidebar from "@/components/support/SupportMobileSidebar";
import PanelSearch from "@/components/platform/PanelSearch";
import PanelBellLink from "@/components/platform/PanelBellLink";

export default function SupportTopbar({ openRequests, unread }: { openRequests: number; unread: number }) {
  const [aiOpen, setAiOpen] = useAskAiOpen();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <SupportMobileSidebar openRequests={openRequests} />
      <PanelHeading panel="support" fallbackTitle="Help & Support" fallbackDescription="AI help, guides and support requests" />
      <div className="flex min-w-0 shrink-0 justify-end md:flex-1 md:shrink md:justify-center">
        <PanelSearch />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <ProductLauncherForPanel panel="support" />
        <button
          type="button"
          onClick={() => setAiOpen(!aiOpen)}
          title="Ask AI Assistant"
          aria-label="Ask AI Assistant"
          className="flex size-9 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
        >
          <Sparkles className="size-4" />
        </button>
        <PanelBellLink href="/resolveiq/notifications" unread={unread} />
      </div>
      <AskAiDrawer open={aiOpen} onClose={() => setAiOpen(false)} panelId="support" panelTitle="Help & Support" panelDescription="Get help using this product" />
    </header>
  );
}
