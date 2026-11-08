import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Marks a call that was placed to the company's test number instead of the person's real one. */
export default function TestBadge({ className, title }: { className?: string; title?: string }) {
  return <Badge variant="ghost" title={title ?? "Test call: placed to the company's test number, not the person's own"} className={cn("bg-amber-500/15 font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300", className)}>Test</Badge>;
}
