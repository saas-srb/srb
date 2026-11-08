"use client";

import { PanelName } from "@/components/platform/PanelsProvider";
import { MobileSidebarProfile } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import SmmsSidebar from "@/components/products/viralpulse-ai/SmmsSidebar";
import SidebarBrand from "@/components/SidebarBrand";
import type { SmmsNavFlags } from "@/components/products/viralpulse-ai/SmmsSidebar";
import type { NavBadges } from "@/lib/products/viralpulse-ai/nav";

export default function SmmsMobileSidebar({ flags, badges }: { flags: SmmsNavFlags; badges: NavBadges }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation menu">
        <Menu className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-72 flex-col p-0 sm:max-w-72">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only"><PanelName panel="smms" fallback="Social Media" /> navigation menu</SheetDescription>
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-4">
            <SidebarBrand />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SmmsSidebar flags={flags} badges={badges} onNavigate={() => setOpen(false)} />
          </div>
          <MobileSidebarProfile />
        </SheetContent>
      </Sheet>
    </>
  );
}
