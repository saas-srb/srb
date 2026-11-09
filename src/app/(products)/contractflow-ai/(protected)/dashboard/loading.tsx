/** Skeleton for the dashboard while the figures are read. */
export default function Loading() {
  const block = (h: string, extra = "") => <div className={`animate-pulse rounded-2xl bg-muted/60 ${h} ${extra}`} />;
  return (
    <div className="space-y-4" role="status" aria-label="Loading the dashboard">
      {block("h-28")}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/60" />)}</div>
      <div className="grid gap-4 lg:grid-cols-3">{block("h-72", "lg:col-span-2")}{block("h-72")}</div>
      <div className="grid gap-4 lg:grid-cols-3">{block("h-64")}{block("h-64")}{block("h-64")}</div>
    </div>
  );
}
