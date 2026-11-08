import { Skeleton } from "@/components/ui/skeleton";

export default function HubLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-16 w-full rounded-2xl" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-48 rounded-xl" />
        <Skeleton className="h-9 flex-1 rounded-xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
