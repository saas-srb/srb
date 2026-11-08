"use client";

import { Check } from "lucide-react";
import ThemeThumbnail from "@/components/products/sitecraft-ai/theme/ThemeThumbnail";
import type { ThemeTokens } from "@/lib/products/sitecraft-ai/theme-shared";
import type { ThemeComponentSelections } from "@/lib/products/sitecraft-ai/component-variants";
import { cn } from "@/lib/utils";

export interface PickerTheme {
  key: string;
  name: string;
  category: string;
  tokens: ThemeTokens;
  components: ThemeComponentSelections;
}

/**
 * Every theme as a small preview card — pick one and it becomes the look of the
 * website and every product. Compact: a scrollable grid, no wizard-sized products.
 */
export default function ThemePicker({ themes, value, onChange }: { themes: PickerTheme[]; value: string; onChange: (key: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Theme" className="grid max-h-[19rem] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
      {themes.map((t) => {
        const selected = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(t.key)}
            className={cn(
              "group relative flex flex-col gap-1.5 rounded-xl border p-1.5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              selected ? "border-primary bg-primary/5 ring-2 ring-primary/40" : "border-border/60 hover:border-primary/40 hover:bg-muted/40"
            )}
          >
            <ThemeThumbnail tokens={t.tokens} components={t.components} className="w-full rounded-lg border border-border/50" />
            <span className="flex items-center justify-between gap-1 px-1 pb-0.5">
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-foreground">{t.name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{t.category}</span>
              </span>
              <span
                className={cn("flex size-4 flex-none items-center justify-center rounded-full border", selected ? "border-primary bg-primary text-primary-foreground" : "border-border/70")}
                aria-hidden="true"
              >
                {selected && <Check className="size-3" />}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
