import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepperStep {
  key: string;
  label: string;
  hint?: ReactNode;
}

/**
 * Numbered steps for multi-step flows (campaign wizard, UGC wizard, launch review). Server- or client-renderable. Steps before
 * `current` show a check; pass `onSelect` to let people go back to a finished step.
 */
export default function Stepper({ steps, current, onSelect, className, label = "Progress", variant = "default" }: { steps: StepperStep[]; current: string; onSelect?: (key: string) => void; className?: string; label?: string; variant?: "default" | "ugc" }) {
  const at = Math.max(steps.findIndex((s) => s.key === current), 0);
  const ugcStyle = variant === "ugc";
  return (
    <nav aria-label={label} className={cn(ugcStyle && "rounded-2xl border border-primary/15 bg-background/90 p-3 shadow-sm backdrop-blur-xl dark:bg-[#080711]/95", className)}>
      <ol className={cn("flex items-center", ugcStyle ? "gap-1 overflow-x-auto [scrollbar-width:none]" : "flex-wrap gap-x-2 gap-y-2")}>
        {steps.map((s, i) => {
          const done = i < at;
          const active = i === at;
          let circleState = "bg-muted text-muted-foreground";
          if (done) circleState = ugcStyle ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : "bg-primary text-primary-foreground";
          else if (active) circleState = ugcStyle ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary ring-1 ring-primary/40";
          const body = (
            <>
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums", circleState)}>{done ? <Check className="size-3.5" aria-hidden /> : i + 1}</span>
              <span className="min-w-0 text-left">
                <span className={cn("block truncate text-xs font-semibold", active && (ugcStyle ? "text-primary" : "text-foreground"), !active && "text-muted-foreground", ugcStyle && !active && "max-sm:hidden")}>{s.label}</span>
                {s.hint && active && <span className="block truncate text-[11px] text-muted-foreground">{s.hint}</span>}
              </span>
            </>
          );
          return (
            <li key={s.key} className={cn("flex items-center", ugcStyle ? "min-w-0 flex-1 gap-1" : "gap-2")} aria-current={active ? "step" : undefined}>
              {onSelect && done ? (
                <button type="button" onClick={() => onSelect(s.key)} className={cn("flex min-w-0 items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/40", ugcStyle ? "rounded-xl px-2 py-1.5 text-left sm:px-3 hover:bg-muted/60" : "rounded-lg px-1 py-0.5 hover:bg-muted/60")}>{body}</button>
              ) : (
                <span className={cn("flex min-w-0 items-center gap-2", ugcStyle ? "rounded-xl px-2 py-1.5 text-left sm:px-3" : "px-1 py-0.5", ugcStyle && active && "bg-primary/10 dark:bg-violet-500/15")}>{body}</span>
              )}
              {i < steps.length - 1 && <span aria-hidden className={cn("h-px", ugcStyle ? "min-w-3 flex-1 bg-border dark:bg-white/15" : "hidden w-6 sm:block", done && !ugcStyle && "bg-primary/60")} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
