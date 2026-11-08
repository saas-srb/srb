"use client";

import { PanelName } from "@/components/platform/PanelsProvider";
import { MobileSidebarProfile } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import DlmsSidebar from "@/components/products/cybervault/DlmsSidebar";
import SidebarBrand from "@/components/SidebarBrand";
import type { DlmsNavFlags } from "@/components/products/cybervault/DlmsSidebar";

export default function DlmsMobileSidebar({ flags }: { flags: DlmsNavFlags }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation menu">
        <Menu className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-72 flex-col p-0 sm:max-w-72">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only"><PanelName panel="dlms" fallback="DLMS" /> navigation menu</SheetDescription>
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-4">
            <SidebarBrand />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <DlmsSidebar flags={flags} onNavigate={() => setOpen(false)} />
          </div>
          <MobileSidebarProfile />
        </SheetContent>
      </Sheet>
    </>
  );
}
