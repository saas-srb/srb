"use client";

import { usePanelLabel } from "@/components/platform/PanelsProvider";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { DOCUMENT_MODULES, documentModuleLabel } from "@/lib/products/commandos/documents-shared";

export default function DocumentsFilterBar({
  initialSearch,
  initialModule,
}: {
  initialSearch: string;
  initialModule: string;
}) {
  const panelLabel = usePanelLabel();
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
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Title, filename, or category" className="h-9 w-64 pl-8 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">Module</label>
        <Select value={initialModule || "all"} onValueChange={(v) => updateParams({ module: !v || v === "all" ? undefined : v })}>
          <SelectTrigger className="w-48 h-9 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {DOCUMENT_MODULES.map((m) => (
              <SelectItem key={m} value={m}>{panelLabel(m, documentModuleLabel(m))}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
