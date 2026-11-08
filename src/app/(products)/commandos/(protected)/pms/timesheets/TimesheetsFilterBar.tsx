"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { TIMESHEET_STATUSES } from "@/lib/products/sprintos/constants";

export default function TimesheetsFilterBar({
  initialStatus,
  initialDateFrom,
  initialDateTo,
}: {
  initialStatus: string;
  initialDateFrom: string;
  initialDateTo: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">Status</label>
        <Select value={initialStatus || "all"} onValueChange={(v) => updateParams({ status: !v || v === "all" ? undefined : v })}>
          <SelectTrigger className="w-40 h-9 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TIMESHEET_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">From</label>
        <Input type="date" defaultValue={initialDateFrom} onChange={(e) => updateParams({ dateFrom: e.target.value || undefined })} className="w-auto h-9 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">To</label>
        <Input type="date" defaultValue={initialDateTo} onChange={(e) => updateParams({ dateTo: e.target.value || undefined })} className="w-auto h-9 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
      </div>
    </>
  );
}
