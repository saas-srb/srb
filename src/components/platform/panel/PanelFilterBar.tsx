"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Calendar, Filter, RotateCcw, Search, Sparkles } from "lucide-react";

export type PanelFilterField =
  | { key: string; label: string; type: "search"; placeholder?: string }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; allLabel?: string }
  | { key: string; label: string; type: "date" };

const PRESETS = [
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "month", label: "This Month" },
  { id: "year", label: "YTD" },
  { id: "all", label: "All Time" },
] as const;

const iso = (d: Date) => d.toISOString().split("T")[0];
const INPUT = "w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

/**
 * The Search & Filters card every dashboard shares (the Workspace's "Whole Dashboard Search & Filter" look): title,
 * quick date presets, then one control per field. URL-driven — each field writes its own `key` query param, and the
 * presets write `from` / `to` — so the server page reads the values from `searchParams`.
 */
export default function PanelFilterBar({
  title = "Search & Filters",
  description = "Refine the dashboard by date range and parameters in real time",
  fields,
  presets,
  trailing,
}: {
  title?: string;
  description?: string;
  fields: PanelFilterField[];
  /** Show the quick date presets (needs `from` / `to` fields to be wired on the page). */
  presets?: boolean;
  /** Extra actions in the card's header, next to Reset (e.g. an Export link). */
  trailing?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [text, setText] = useState<Record<string, string>>(() => Object.fromEntries(fields.filter((f) => f.type === "search").map((f) => [f.key, params.get(f.key) ?? ""])));

  const showPresets = presets ?? (fields.some((f) => f.key === "from") && fields.some((f) => f.key === "to"));
  const active = fields.filter((f) => params.get(f.key)).length;

  function set(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    start(() => router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname, { scroll: false }));
  }

  function preset(id: (typeof PRESETS)[number]["id"]) {
    const now = new Date();
    if (id === "all") return set({ from: null, to: null });
    const from = id === "7d" ? new Date(now.getTime() - 7 * 86400000) : id === "30d" ? new Date(now.getTime() - 30 * 86400000) : id === "month" ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), 0, 1);
    set({ from: iso(from), to: iso(now) });
  }

  return (
    <div className={`rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md transition-all ${pending ? "pointer-events-none opacity-75" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Filter className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-foreground">{title}</h3>
              {active > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  <Sparkles className="size-3" />
                  {active} {active === 1 ? "filter active" : "filters active"}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showPresets && (
            <div className="flex items-center gap-1 rounded-xl border border-border/40 bg-muted/30 p-1 text-xs">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" onClick={() => preset(p.id)} className="rounded-lg px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                  {p.label}
                </button>
              ))}
            </div>
          )}
          {trailing}
          {active > 0 && (
            <button
              type="button"
              onClick={() => {
                setText({});
                start(() => router.replace(pathname, { scroll: false }));
              }}
              className="flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-600 transition-all hover:bg-rose-500/20 dark:text-rose-400"
            >
              <RotateCcw className="size-3.5" />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      <form
        className="mt-4 grid grid-cols-1 items-end gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          set(text);
        }}
      >
        {fields.map((f) => {
          const value = params.get(f.key) ?? "";
          const Icon = f.type === "date" ? Calendar : f.type === "search" ? Search : Filter;
          return (
            <div key={f.key}>
              <label htmlFor={`pf-${f.key}`} className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Icon className="size-3.5 text-primary" />
                {f.label}
              </label>
              {f.type === "search" && (
                <input
                  id={`pf-${f.key}`}
                  type="text"
                  autoComplete="off"
                  maxLength={80}
                  placeholder={f.placeholder ?? `Search ${f.label.toLowerCase()}…`}
                  value={text[f.key] ?? ""}
                  onChange={(e) => setText((t) => ({ ...t, [f.key]: e.target.value }))}
                  onBlur={() => set({ [f.key]: text[f.key] ?? "" })}
                  className={INPUT}
                />
              )}
              {f.type === "date" && <input id={`pf-${f.key}`} type="date" value={value} onChange={(e) => set({ [f.key]: e.target.value })} className={INPUT} />}
              {f.type === "select" && (
                <select id={`pf-${f.key}`} value={value} onChange={(e) => set({ [f.key]: e.target.value })} className={`${INPUT} cursor-pointer`}>
                  <option value="">{f.allLabel ?? `All ${f.label}s`}</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
        <button type="submit" className="sr-only">Apply</button>
      </form>
    </div>
  );
}
