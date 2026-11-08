"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

export interface PickerOption {
  id: string;
  label: string;
  sub?: string;
}

/** A searchable checkbox list for choosing several items (roles, related SOPs, people). */
export default function MultiPicker({
  options,
  value,
  onChange,
  placeholder = "Search…",
  emptyLabel = "Nothing to choose from.",
  maxHeight = "max-h-44",
  disabled,
}: {
  options: PickerOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
  maxHeight?: string;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(s)) : options;
  }, [options, q]);

  return (
    <div className="space-y-1.5">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} disabled={disabled} aria-label={placeholder} className="h-8" />
      <ul className={`${maxHeight} space-y-0.5 overflow-y-auto rounded-xl border border-border/50 p-1`}>
        {filtered.length === 0 && <li className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyLabel}</li>}
        {filtered.map((o) => {
          const checked = value.includes(o.id);
          return (
            <li key={o.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted/60">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onChange(checked ? value.filter((x) => x !== o.id) : [...value, o.id])}
                />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.sub && <span className="shrink-0 text-[11px] text-muted-foreground">{o.sub}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      {value.length > 0 && <p className="text-[11px] text-muted-foreground">{value.length} selected</p>}
    </div>
  );
}
