import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DIRECTION_LABEL } from "@/lib/products/agentos/calls/call-display";
import type { CallDirection } from "@/lib/products/agentos/calls/types";

const TONE: Record<CallDirection, string> = {
  outbound: "bg-primary/10 text-primary",
  inbound: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  web: "bg-muted text-muted-foreground",
  web_public: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

/** How a call reached the company: Outbound, Inbound, Web (a signed-in person in the browser) or Website visitor. */
export default function CallDirectionBadge({ direction, className }: { direction: CallDirection; className?: string }) {
  return <Badge variant="ghost" className={cn("font-semibold", TONE[direction], className)}>{DIRECTION_LABEL[direction]}</Badge>;
}
