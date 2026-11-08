import { daysUntil } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";

export function RenewalHint({ date, autoRenew }: { date: string | null | undefined; autoRenew?: boolean }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const d = daysUntil(date);
  const cls =
    d === null ? "text-muted-foreground" : d < 0 ? "text-destructive font-medium" : d <= 30 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-foreground";
  return (
    <span className={cls}>
      {formatDate(date)}
      {d !== null && (
        <span className="ml-1 text-xs">
          ({d < 0 ? `${-d}d overdue` : d === 0 ? "today" : `${d}d`})
        </span>
      )}
      {autoRenew && <span className="ml-1 text-xs text-muted-foreground">· auto</span>}
    </span>
  );
}
