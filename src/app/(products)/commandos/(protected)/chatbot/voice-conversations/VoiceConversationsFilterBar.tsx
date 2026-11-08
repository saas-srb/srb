"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const DEVICES = ["desktop", "mobile", "tablet"];
const MIN_DURATIONS = [
  { value: "0", label: "Any length" },
  { value: "30", label: "30s+" },
  { value: "60", label: "1 min+" },
  { value: "180", label: "3 min+" },
];

export default function VoiceConversationsFilterBar({
  initialSearch,
  initialDevice,
  initialMinDuration,
  initialDateFrom,
  initialDateTo,
}: {
  initialSearch: string;
  initialDevice: string;
  initialMinDuration: string;
  initialDateFrom: string;
  initialDateTo: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(initialSearch);

  function updateParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== initialSearch) updateParams({ search: searchInput || undefined });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">Search</label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Session, visitor, or text" className="h-9 w-64 pl-8 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">Device</label>
        <Select value={initialDevice || "all"} onValueChange={(v) => updateParams({ device: !v || v === "all" ? undefined : v })}>
          <SelectTrigger className="w-36 h-9 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All devices</SelectItem>
            {DEVICES.map((d) => (
              <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">Duration</label>
        <Select value={initialMinDuration || "0"} onValueChange={(v) => updateParams({ minDuration: !v || v === "0" ? undefined : v })}>
          <SelectTrigger className="h-9 w-36 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MIN_DURATIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">From</label>
        <Input type="date" defaultValue={initialDateFrom} onChange={(e) => updateParams({ dateFrom: e.target.value || undefined })} className="h-9 w-36 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">To</label>
        <Input type="date" defaultValue={initialDateTo} onChange={(e) => updateParams({ dateTo: e.target.value || undefined })} className="h-9 w-36 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
      </div>
    </>
  );
}
