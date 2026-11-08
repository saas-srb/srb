"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const FILTERS = [
  { key: "kind", label: "Type", options: [["all", "All types"], ["subdomain", "Subdomains"], ["custom", "Custom domains"]] },
  { key: "status", label: "DNS", options: [["all", "Any DNS status"], ["verified", "Verified"], ["pending", "Pending"]] },
  { key: "ssl", label: "SSL", options: [["all", "Any SSL status"], ["active", "Active"], ["pending", "Pending"], ["error", "Error"], ["manual", "Manual"]] },
  { key: "issues", label: "Show", options: [["all", "All domains"], ["1", "Needs attention"]] },
] as const;

export default function DomainsFilterBar({ initial }: { initial: { q: string; kind: string; status: string; ssl: string; issues: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(initial.q);

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
      if (searchInput !== initial.q) updateParams({ q: searchInput || undefined });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="domains-search" className="text-xs font-medium text-muted-foreground">Search</label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="domains-search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Domain or company"
            className="h-9 w-full rounded-xl border-border/50 bg-background pl-8 sm:w-64"
          />
        </div>
      </div>
      {FILTERS.map((f) => (
        <div key={f.key} className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
          <Select value={initial[f.key] || "all"} onValueChange={(v) => updateParams({ [f.key]: !v || v === "all" ? undefined : String(v) })}>
            <SelectTrigger aria-label={f.label} className="h-9 w-full rounded-xl border-border/50 bg-background sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {f.options.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </>
  );
}
