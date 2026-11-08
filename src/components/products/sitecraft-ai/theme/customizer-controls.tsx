"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { FONT_OPTIONS, fontStack } from "@/lib/products/sitecraft-ai/theme-shared";

/** Colour swatch + hex field, WordPress-customizer style. */
export function ColorRow({ id, label, hint, value, onChange, disabled }: { id: string; label: string; hint?: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  // <input type="color"> only understands #rrggbb.
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : /^#[0-9a-f]{3}$/i.test(value) ? `#${[...value.slice(1)].map((c) => c + c).join("")}` : "#000000";
  return (
    <div className="flex items-center gap-3 py-1.5">
      <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border shadow-sm" style={{ background: value }}>
        <input type="color" aria-label={`${label} colour picker`} value={hex} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </label>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block truncate text-[13px] font-medium text-foreground">{label}</label>
        {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="h-8 w-[88px] rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      />
    </div>
  );
}

/** Font picker whose options are rendered in their own typeface. */
export function FontPicker({ id, label, value, onChange, disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-foreground">{label}</label>
      <div className="grid max-h-64 gap-1 overflow-y-auto rounded-xl border border-border/60 p-1" id={id} role="radiogroup" aria-label={label}>
        {FONT_OPTIONS.map((f) => {
          const selected = f.key === value;
          return (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(f.key)}
              className={cn("flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors", selected ? "bg-primary/10 text-primary" : "hover:bg-muted")}
            >
              <span className="truncate text-[15px]" style={{ fontFamily: fontStack(f.key) }}>{f.label}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
                {f.kind}
                {selected && <Check className="size-3.5 text-primary" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RangeRow({
  id, label, value, min, max, step, format, onChange, disabled,
}: { id: string; label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[13px] font-medium text-foreground">{label}</label>
        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{format(value)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
    </div>
  );
}

/** A vertical list of selectable option cards (component variants). */
export function OptionCards({ name, options, value, onChange, disabled }: { name: string; options: { key: string; label: string; description: string }[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-2" role="radiogroup" aria-label={name}>
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(o.key)}
            className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition-all", selected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border/60 hover:border-primary/40")}
          >
            <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
              {selected && <Check className="size-3" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-foreground">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function GroupLabel({ children }: { children: React.ReactNode }) {
  return <h4 className="pt-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase first:pt-0">{children}</h4>;
}
