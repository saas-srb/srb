import { AudioLines, MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentKind } from "@/lib/products/agentos/voice/types";

/** "Text" / "Voice" pill shown wherever an agent appears (Hub, picker, forms). */
export default function AgentKindBadge({ kind, className }: { kind: AgentKind; className?: string }) {
  const voice = kind === "voice";
  const Icon = voice ? AudioLines : MessageSquareText;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        voice ? "bg-violet-500/12 text-violet-700 dark:text-violet-300" : "bg-sky-500/12 text-sky-700 dark:text-sky-300",
        className
      )}
    >
      <Icon className="size-3" />
      {voice ? "Voice" : "Text"}
    </span>
  );
}
