"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

/**
 * A product sidebar item the person has no access to: same place and order as for a Director, greyed with a lock. It opens the in-shell page that
 * explains it and lets the person ask a Director (`/commandos/locked`), never the product page itself.
 */
export default function LockedNavItem({
  label,
  icon: Icon,
  collapsed = false,
  product,
  onNavigate,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  collapsed?: boolean;
  /** The product's catalogue key (talentos, sprintos ...). */
  product: string;
  onNavigate?: () => void;
}) {
  const node = (
    <Link
      href={`/commandos/locked?product=${encodeURIComponent(product)}&feature=${encodeURIComponent(label)}`}
      onClick={onNavigate}
      aria-label={`${label} (no access)`}
      data-locked="true"
      className={cn("group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/50 transition-colors hover:bg-muted/50", collapsed && "justify-center px-0")}
    >
      <Icon className="relative size-4 shrink-0" />
      {!collapsed && <span className="relative flex-1 truncate">{label}</span>}
      <Lock className="relative size-3 shrink-0" aria-hidden />
    </Link>
  );
  return (
    <Tooltip>
      <TooltipTrigger render={node} />
      <TooltipContent side="right">You don&apos;t have access. Ask your Director.</TooltipContent>
    </Tooltip>
  );
}
