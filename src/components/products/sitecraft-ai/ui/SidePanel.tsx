"use client";

import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";

/**
 * Right-hand slide-over product used for every CMS form/detail "popup" — the same
 * Sheet surface the LMS and other products use. Layout: fixed header, scrolling
 * body, fixed footer.
 */
export const Panel = Sheet;
export const PanelTrigger = SheetTrigger;

const WIDTHS = { md: "sm:max-w-md", lg: "sm:max-w-lg", xl: "sm:max-w-xl", "2xl": "sm:max-w-2xl" } as const;

export function PanelContent({
  className,
  size = "md",
  ...props
}: React.ComponentProps<typeof SheetContent> & { size?: keyof typeof WIDTHS }) {
  return <SheetContent side="right" className={cn("w-full gap-0", WIDTHS[size], className)} {...props} />;
}

export function PanelHeader({ className, ...props }: React.ComponentProps<typeof SheetHeader>) {
  return <SheetHeader className={cn("border-b border-border/60 pr-12", className)} {...props} />;
}

export function PanelTitle({ className, ...props }: React.ComponentProps<typeof SheetTitle>) {
  return <SheetTitle className={cn("text-lg font-semibold", className)} {...props} />;
}

export const PanelDescription = SheetDescription;

export function PanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto p-4", className)} {...props} />;
}

export function PanelFooter({ className, ...props }: React.ComponentProps<typeof SheetFooter>) {
  return <SheetFooter className={cn("flex-row justify-end border-t border-border/60", className)} {...props} />;
}
