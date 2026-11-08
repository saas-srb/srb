import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CALL_STATE_LABEL, type CallState } from "@/lib/products/agentos/voice/call-format";

const TONE: Record<CallState, string> = {
  connected: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  processing: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  failed: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  not_connected: "bg-muted text-muted-foreground",
};

export default function CallStateBadge({ state }: { state: CallState }) {
  return <Badge variant="ghost" className={cn("font-semibold", TONE[state])}>{CALL_STATE_LABEL[state]}</Badge>;
}
