"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { cn, formatCurrency } from "@/lib/utils";
import { formatMinutesAsDuration } from "@/lib/products/talentos/time";

const FORMATTERS = {
  currency: formatCurrency,
  duration: formatMinutesAsDuration,
} as const;

function useCountUp(target: number, durationMs = 600) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = null;
    let frame: number;

    function tick(timestamp: number) {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      setValue(Math.round(eased * target));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}

function TrendBadge({ value }: { value: number }) {
  const isUp = value > 0;
  const isFlat = value === 0;
  return (
    <Badge
      className={cn(
        "h-5 px-1.5 text-[11px] font-semibold",
        isFlat
          ? "bg-muted text-muted-foreground"
          : isUp
            ? "bg-green-500/15 text-green-600 dark:text-green-400"
            : "bg-destructive/15 text-destructive"
      )}
    >
      {isFlat ? <Minus className="size-3" /> : isUp ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {isUp ? "+" : ""}
      {value}%
    </Badge>
  );
}

export default function KpiCard({
  label,
  value,
  accent = false,
  icon,
  trend,
  suffix,
  tone,
  format,
}: {
  label: string;
  /** A pre-formatted string or element (e.g. `"₹12,340"`, `"3/10"`, a `<span>`)
   * skips the count-up animation and renders as-is — for values that can't be
   * a plain counted integer (ratios, "no data" placeholders). Prefer passing a
   * number + `format` so the metric still counts up. */
  value: number | ReactNode;
  accent?: boolean;
  /** A rendered icon element (e.g. `<Code className="size-4" />`) — pass an element, not a component reference, so this can be sent from a Server Component. */
  icon?: ReactNode;
  /** Growth % vs the previous period; null means "no prior period to compare" (badge is hidden). */
  trend?: number | null;
  /** Appended after the animated number, e.g. `"%"`. Ignored for string values — format those into the string itself. */
  suffix?: string;
  /** Colors the value green/red directly — for metrics where the sign itself is the signal (e.g. ROI), distinct from `trend`'s period-over-period badge. */
  tone?: "up" | "down";
  /** Formats the animated number each frame so currency / duration KPIs still count up and read consistently across the app. */
  format?: keyof typeof FORMATTERS;
}) {
  const animated = useCountUp(typeof value === "number" ? value : 0);
  const displayValue =
    typeof value === "number" ? (
      <>
        {format ? FORMATTERS[format](animated) : animated}
        {suffix}
      </>
    ) : (
      value
    );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="h-full w-full">
      <GlassCard>
        <CardContent className="flex h-full items-center gap-3 py-3.5 px-4">
          {icon && (
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-brand-accent text-white">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-[11px] font-medium text-muted-foreground truncate leading-snug">{label}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p
                className={cn(
                  "text-[17px] font-bold tracking-tight tabular-nums text-foreground whitespace-nowrap shrink-0",
                  accent && "bg-gradient-to-r from-primary to-[color:var(--color-brand-accent)] bg-clip-text text-transparent",
                  tone === "up" && "text-emerald-600 dark:text-emerald-400",
                  tone === "down" && "text-rose-600 dark:text-rose-400"
                )}
              >
                {displayValue}
              </p>
              {typeof trend === "number" && <TrendBadge value={trend} />}
            </div>
          </div>
        </CardContent>
      </GlassCard>
    </motion.div>
  );
}
