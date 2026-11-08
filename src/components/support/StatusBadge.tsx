import { cn } from "@/lib/utils";
import type { StatusState } from "@/lib/support/types";

const TONE: Record<StatusState, string> = {
  open: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  waiting: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  resolved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  closed: "border-border bg-muted text-muted-foreground",
};

export default function StatusBadge({ label, state, className }: { label: string; state: StatusState; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", TONE[state], className)}>{label}</span>;
}

export function PriorityBadge({ label, className }: { label: string; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border border-border/60 bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground", className)}>{label}</span>;
}
