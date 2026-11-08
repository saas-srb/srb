"use client";

import { useEffect, useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DashboardWidget {
  id: string;
  label: string;
  node: React.ReactNode;
  /** Width on large screens, in a 6-column grid. */
  span: "full" | "wide" | "half" | "narrow";
}

const SPAN: Record<DashboardWidget["span"], string> = { full: "lg:col-span-6", wide: "lg:col-span-4", half: "lg:col-span-3", narrow: "lg:col-span-2" };
const STORAGE_KEY = "cms-dashboard-hidden-widgets";

function readHidden(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The dashboard's widget area with WordPress-style "Screen Options": each
 * widget (and the welcome product) can be shown or hidden, remembered per
 * browser. The widgets themselves are server-rendered and passed in.
 */
export default function DashboardWidgets({ welcome, widgets }: { welcome: React.ReactNode; widgets: DashboardWidget[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists client-side
    setHidden(readHidden());
  }, []);

  const toggle = (id: string, show: boolean) => {
    setHidden((prev) => {
      const next = show ? prev.filter((x) => x !== id) : [...new Set([...prev, id])];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const all = [{ id: "welcome", label: "Welcome" }, ...widgets.map(({ id, label }) => ({ id, label }))];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <SlidersHorizontal className="size-3.5" /> Screen Options <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div className="lms-surface rounded-2xl border border-border/60 bg-card/80 p-4">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Show on screen</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {all.map((w) => (
              <label key={w.id} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={!hidden.includes(w.id)} onChange={(e) => toggle(w.id, e.target.checked)} />
                {w.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {!hidden.includes("welcome") && (
        <div className="relative">
          {welcome}
          <button type="button" onClick={() => toggle("welcome", false)} aria-label="Dismiss the welcome product" className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-3.5" /> Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-6">
        {widgets
          .filter((w) => !hidden.includes(w.id))
          .map((w) => (
            <div key={w.id} className={cn("min-w-0", SPAN[w.span])} data-widget={w.id}>
              {w.node}
            </div>
          ))}
      </div>
    </div>
  );
}
