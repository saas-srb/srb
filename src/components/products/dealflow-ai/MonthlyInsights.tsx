import { TrendingUp, TrendingDown, Minus, CalendarDays } from "lucide-react";

interface MonthlyInsightsProps {
  growthPercent: number | null;
  previousPeriodTotal: number | null;
  totalOverall: number;
  byWeekday: { day: string; count: number }[];
}

export default function MonthlyInsights({ growthPercent, previousPeriodTotal, totalOverall, byWeekday }: MonthlyInsightsProps) {
  const busiest = byWeekday.reduce((best, d) => (d.count > best.count ? d : best), byWeekday[0] ?? { day: "—", count: 0 });
  const hasBusiestData = byWeekday.some((d) => d.count > 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          {growthPercent === null ? (
            <Minus className="size-4 text-muted-foreground" />
          ) : growthPercent >= 0 ? (
            <TrendingUp className="size-4 text-green-600 dark:text-green-400" />
          ) : (
            <TrendingDown className="size-4 text-destructive" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {growthPercent === null
              ? "No prior period to compare"
              : `${growthPercent >= 0 ? "+" : ""}${growthPercent}% vs previous period`}
          </p>
          <p className="text-xs text-muted-foreground">
            {totalOverall} this period{previousPeriodTotal !== null ? ` · ${previousPeriodTotal} previous` : ""}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <CalendarDays className="size-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {hasBusiestData ? `Busiest day: ${busiest.day}` : "Not enough data yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            {hasBusiestData ? `${busiest.count} submissions on average` : "Check back once more data comes in"}
          </p>
        </div>
      </div>
    </div>
  );
}
