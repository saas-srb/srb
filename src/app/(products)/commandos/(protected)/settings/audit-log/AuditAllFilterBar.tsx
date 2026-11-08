"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

/** Filters of the merged ("All") view: the date range both sources share. Pick a source for the rest. */
export default function AuditAllFilterBar({ initialDateFrom, initialDateTo }: { initialDateFrom: string; initialDateTo: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: "dateFrom" | "dateTo", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">From</label>
        <Input type="date" defaultValue={initialDateFrom} onChange={(e) => update("dateFrom", e.target.value)} className="h-9 w-36 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">To</label>
        <Input type="date" defaultValue={initialDateTo} onChange={(e) => update("dateTo", e.target.value)} className="h-9 w-36 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
      </div>
      <p className="self-end pb-2 text-xs text-muted-foreground">Choose Workspace events or Product activity to filter by event type, person, module or action.</p>
    </>
  );
}
