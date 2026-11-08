import { cn } from "@/lib/utils";

/**
 * Thin brand-gradient progress bar. Server-safe (no client hooks).
 */
export default function ProgressBar({
  value,
  className,
  showLabel = true,
}: {
  value: number;
  className?: string;
  showLabel?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-[color:var(--color-brand-accent)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">{pct}%</span>}
    </div>
  );
}
