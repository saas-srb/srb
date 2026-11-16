"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Maximize2, Minimize2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DRAWER_HEADER_CLASS, DRAWER_SHELL_CLASS, DRAWER_WIDE_CLASS } from "@/components/ui/drawer-shell";
import { cn } from "@/lib/utils";

/**
 * The right-hand panel every configuration opens in (Integrations, Product settings). It is the SAME drawer shell as the Notifications drawer
 * (`drawer-shell.ts`): about 416px wide on a desktop, the whole screen on a phone, the same slide-in, header and close button. A panel that holds wide
 * tables (chatbot conversations, the knowledge base) sets `expandable`: an Expand button widens it to about 720px on a desktop, collapsed by default.
 * It is driven by the address (`?open=...`), so it can be linked to and survives a refresh; Esc and the close button return to the list.
 */
export default function SidePanel({
  title,
  description,
  closeHref,
  expandable = false,
  icon,
  badge,
  children,
}: {
  title: string;
  description?: string;
  closeHref: string;
  /** Offers the desktop-only Expand toggle (default collapsed). */
  expandable?: boolean;
  /** The icon tile and the status badge of the card this panel belongs to (rendered by the server, the same as on the card). */
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [wide, setWide] = useState(false);
  return (
    <Sheet open onOpenChange={(o) => { if (!o) router.push(closeHref, { scroll: false }); }}>
      <SheetContent side="right" className={cn(DRAWER_SHELL_CLASS, "overflow-y-auto", wide && DRAWER_WIDE_CLASS)} aria-label={title} data-drawer="panel" data-wide={wide || undefined}>
        <SheetHeader className={cn(DRAWER_HEADER_CLASS, "sticky top-0 z-10 bg-background/95 backdrop-blur")}>
          <div className="flex items-center gap-2.5">
            {icon}
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base font-semibold leading-tight">{title}</SheetTitle>
              {description && <SheetDescription className="line-clamp-2 text-xs text-muted-foreground">{description}</SheetDescription>}
            </div>
            {badge}
            {expandable && (
              <button type="button" onClick={() => setWide((w) => !w)} aria-pressed={wide} aria-label={wide ? "Make the panel narrower" : "Make the panel wider"} className="hidden size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground sm:flex">
                {wide ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
              </button>
            )}
          </div>
        </SheetHeader>
        <div className="space-y-4 p-4 sm:p-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
