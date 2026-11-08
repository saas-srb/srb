import { cn } from "@/lib/utils";

/** Thin progress bar used for acknowledgement rates. */
export default function RateBar({ rate, className }: { rate: number | null; className?: string }) {
  if (rate === null) return <span className="text-xs text-muted-foreground">—</span>;
  const tone = rate >= 90 ? "bg-green-500" : rate >= 60 ? "bg-amber-500" : "bg-destructive";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted/70" role="img" aria-label={`${rate}%`}>
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${rate}%` }} />
      </div>
      <span className="w-9 text-xs tabular-nums text-muted-foreground">{rate}%</span>
    </div>
  );
}
