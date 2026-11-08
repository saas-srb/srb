import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CALL_STATUS_LABEL, CALL_STATUS_TONE, type StatusTone } from "@/lib/products/agentos/calls/call-ui";
import type { CallStatus } from "@/lib/products/agentos/calls/types";

const TONE: Record<StatusTone, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  bad: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  info: "bg-primary/10 text-primary",
  neutral: "bg-muted text-muted-foreground",
};

export default function CallStatusBadge({ status, className }: { status: CallStatus; className?: string }) {
  return <Badge variant="ghost" className={cn("font-semibold", TONE[CALL_STATUS_TONE[status]], className)}>{CALL_STATUS_LABEL[status]}</Badge>;
}
