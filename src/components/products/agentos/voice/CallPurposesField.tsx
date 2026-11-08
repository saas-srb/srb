"use client";

import { CALL_PURPOSES } from "@/lib/products/agentos/calls/purposes";
import { cn } from "@/lib/utils";

/** Which kinds of phone call this agent may be used for. Products only offer an agent for a purpose it has ticked. */
export default function CallPurposesField({ value, onChange, disabled }: { value: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const toggle = (key: string) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="sr-only">Call purposes</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {CALL_PURPOSES.map((p) => {
          const on = value.includes(p.key);
          return (
            <label key={p.key} className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 transition-colors", on ? "border-primary/40 bg-primary/5" : "border-border/50 hover:bg-muted/40", disabled && "cursor-not-allowed opacity-60")}>
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={on} onChange={() => toggle(p.key)} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{p.label}</span>
                <span className="block text-[11px] text-muted-foreground">{p.description}</span>
              </span>
            </label>
          );
        })}
      </div>
      {value.length === 0 && <p className="text-[11px] text-muted-foreground">With none ticked, the agent can only be used for a custom call.</p>}
    </fieldset>
  );
}
