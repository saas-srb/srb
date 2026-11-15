"use client";

import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

/**
 * The right-hand panel every configuration opens in (Integrations, Product settings): wide on a desktop, full screen on a phone, focus kept
 * inside while it is open, Esc and the close button put the person back on the list. It is driven by the address (`?open=...`), so the panel can be
 * linked to, survives a refresh, and the old page addresses can redirect straight into it. The content is rendered by the server.
 */
export default function SidePanel({
  title,
  description,
  closeHref,
  wide = true,
  children,
}: {
  title: string;
  description?: string;
  closeHref: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Sheet open onOpenChange={(o) => { if (!o) router.push(closeHref, { scroll: false }); }}>
      <SheetContent side="right" className={`overflow-y-auto p-0 data-[side=right]:w-full ${wide ? "data-[side=right]:sm:max-w-4xl" : "data-[side=right]:sm:max-w-lg"}`} aria-label={title}>
        <SheetHeader className="sticky top-0 z-10 border-b border-border bg-background/95 p-4 backdrop-blur sm:p-6">
          <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="space-y-4 p-4 sm:p-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
