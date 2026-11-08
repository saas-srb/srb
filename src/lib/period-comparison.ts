/** Given a date range, computes the immediately-preceding range of the same
 * duration — used to compute growth % (current period vs previous period). */
export function previousPeriodRange(dateFrom?: Date, dateTo?: Date): { from: Date; to: Date } | null {
  if (!dateFrom || !dateTo) return null;
  const durationMs = dateTo.getTime() - dateFrom.getTime();
  if (durationMs <= 0) return null;
  const prevTo = new Date(dateFrom.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return { from: prevFrom, to: prevTo };
}

export function computeGrowthPercent(current: number, previous: number | null): number | null {
  if (previous === null) return null;
  return previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
}
