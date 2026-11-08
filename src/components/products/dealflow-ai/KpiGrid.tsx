import { cn } from "@/lib/utils";

/**
 * Standard responsive grid for a row/block of `KpiCard`s. Use this everywhere a
 * set of KPI tiles appears so the columns, gap and breakpoints stay identical
 * across the app.
 *
 *   <KpiGrid>            → 2 cols, then 3 (sm), then 4 (lg)   — the default
 *   <KpiGrid cols={6}>   → 2 cols, then 3 (sm), then 6 (lg)   — status breakdowns
 */
export default function KpiGrid({
  children,
  cols = 4,
  className,
}: {
  children: React.ReactNode;
  cols?: 4 | 6;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid w-full grid-cols-2 gap-4",
        cols === 6 ? "sm:grid-cols-3 lg:grid-cols-6" : "sm:grid-cols-3 lg:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}
