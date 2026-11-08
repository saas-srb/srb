import { Skeleton } from "@/components/ui/skeleton";

/** Shown while the usage numbers are gathered (they read several history collections). */
export default function UsageLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading usage">
      <Skeleton className="h-28 rounded-3xl" />
      <Skeleton className="h-10 rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      <Skeleton className="h-64 rounded-2xl" />
      <div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
    </div>
  );
}
