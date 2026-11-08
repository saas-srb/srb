"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Bookmark, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { saveFilterAction, deleteSavedFilterAction } from "@/app/(products)/dealflow-ai/(protected)/filter-actions";

export interface SerializedSavedFilter {
  id: string;
  name: string;
  params: Record<string, string>;
}

export default function SavedFiltersMenu({
  initialFilters,
  currentParams,
}: {
  initialFilters: SerializedSavedFilter[];
  currentParams: Record<string, string>;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  const hasCurrentFilters = Object.keys(currentParams).length > 0;

  function handleSave() {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await saveFilterAction(name, currentParams);
      if (result.error || !result.id) {
        toast.error(result.error ?? "Could not save filter.");
        return;
      }
      setFilters((prev) => [{ id: result.id!, name: name.trim(), params: currentParams }, ...prev]);
      setName("");
      toast.success("Filter saved");
    });
  }

  function handleApply(params: Record<string, string>) {
    const query = new URLSearchParams(params);
    router.push(`${pathname}?${query.toString()}`);
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteSavedFilterAction(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setFilters((prev) => prev.filter((f) => f.id !== id));
      toast.success("Filter deleted");
    });
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <Bookmark className="size-3.5" data-icon="inline-start" />
            Saved Filters
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Saved Filters</PopoverTitle>
        </PopoverHeader>

        {filters.length === 0 ? (
          <p className="py-1 text-xs text-muted-foreground">No saved filters yet.</p>
        ) : (
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {filters.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60">
                <button
                  type="button"
                  onClick={() => handleApply(f.params)}
                  className="min-w-0 flex-1 truncate text-left text-sm"
                >
                  {f.name}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(f.id)}
                  disabled={isPending}
                  aria-label={`Delete ${f.name}`}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <Separator />

        <div className="flex items-center gap-1.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this filter…"
            disabled={!hasCurrentFilters}
            className="h-8"
          />
          <Button type="button" size="icon-sm" onClick={handleSave} disabled={!hasCurrentFilters || !name.trim() || isPending}>
            <Plus className="size-3.5" />
          </Button>
        </div>
        {!hasCurrentFilters && <p className="text-xs text-muted-foreground">Apply at least one filter to save it.</p>}
      </PopoverContent>
    </Popover>
  );
}
