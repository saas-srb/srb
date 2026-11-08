"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { minorToInput, parseMajorToMinor, formatMinor, fieldId } from "@/lib/products/viralpulse-ai/ads-platforms/ui";
import { cn } from "@/lib/utils";
import type { FieldError } from "@/lib/products/viralpulse-ai/ads-platforms/types";

/** Validation results shared with every field below the wizard, so a field shows the message that belongs to its path. */
export const ErrorsContext = createContext<FieldError[]>([]);
export const useErrors = (path: string | undefined, exact = true): FieldError[] => {
  const all = useContext(ErrorsContext);
  if (!path) return [];
  return all.filter((e) => (exact ? e.path === path : e.path === path || e.path.startsWith(`${path}.`) || e.path.startsWith(`${path}[`)));
};

export function Section({ title, description, children, className, actions }: { title: string; description?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <GlassCard interactive={false} className={className}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </div>
        {actions}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </GlassCard>
  );
}

/** Label, plain explanation, control and the validator's messages for this field. The control must use `fieldId(path)` as its id so errors can focus it. */
export function FieldBox({ path, label, help, children, className, required, htmlFor }: { path?: string; label: string; help?: ReactNode; children: ReactNode; className?: string; required?: boolean; htmlFor?: string }) {
  const items = useErrors(path);
  const id = htmlFor ?? (path ? fieldId(path) : undefined);
  const hid = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-rose-600 dark:text-rose-400" aria-hidden> *</span>}
      </label>
      {children}
      {help && <p id={hid} className="text-[11px] leading-snug text-muted-foreground">{help}</p>}
      <Messages items={items} />
    </div>
  );
}

export function Messages({ items }: { items: FieldError[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-0.5" aria-live="polite">
      {items.map((e, i) => (
        <li key={`${e.code}-${i}`} role={e.severity === "error" ? "alert" : undefined} className={cn("flex items-start gap-1 text-[11px]", e.severity === "error" ? "text-rose-700 dark:text-rose-300" : "text-amber-800 dark:text-amber-300")}>
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span>{e.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function ErrorsFor({ path }: { path: string }) {
  return <Messages items={useErrors(path)} />;
}

export function Note({ children, tone = "info", className }: { children: ReactNode; tone?: "info" | "warn" | "bad" | "ok"; className?: string }) {
  const cls = { info: "border-sky-500/30 bg-sky-500/5", warn: "border-amber-500/40 bg-amber-500/5", bad: "border-rose-500/40 bg-rose-500/5", ok: "border-emerald-500/30 bg-emerald-500/5" }[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-xs", cls, className)}>
      {tone === "info" || tone === "ok" ? <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
    </div>
  );
}

/** An amount typed in the currency's major unit, stored as an integer minor amount. The raw text is kept while typing so "1." and "1.5" are not rewritten under the cursor. */
export function MoneyField({ path, label, help, currency, valueMinor, onChange, disabled, required, placeholder }: { path: string; label: string; help?: ReactNode; currency: string; valueMinor: number | null; onChange: (minor: number | null) => void; disabled?: boolean; required?: boolean; placeholder?: string }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? minorToInput(valueMinor, currency);
  const bad = text !== null && text.trim() !== "" && parseMajorToMinor(text, currency) === null;
  return (
    <FieldBox path={path} label={label} help={help} required={required}>
      <div className="flex items-center gap-2">
        <Input id={fieldId(path)} inputMode="decimal" value={shown} disabled={disabled || !currency} aria-invalid={bad} placeholder={placeholder ?? (currency ? "0" : "Choose an ad account first")} onChange={(e) => { setText(e.target.value); const m = parseMajorToMinor(e.target.value, currency); if (e.target.value.trim() === "") onChange(null); else if (m !== null) onChange(m); }} onBlur={() => setText(null)} className="max-w-48" />
        <span className="text-xs text-muted-foreground">{currency || ""}</span>
        {valueMinor !== null && currency && <span className="text-[11px] text-muted-foreground">{formatMinor(valueMinor, currency)}</span>}
      </div>
      {bad && <p className="text-[11px] text-rose-700 dark:text-rose-300">Use digits with at most the currency&apos;s decimals, for example 1500 or 1500.50.</p>}
    </FieldBox>
  );
}

/** ISO string <-> `datetime-local` text, in the browser's time zone. The account's time zone governs delivery; this is only how the person types it. */
export const isoToLocal = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const localToIso = (v: string): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export function DateTimeField({ path, label, help, value, onChange, disabled, required }: { path: string; label: string; help?: ReactNode; value: string | null; onChange: (iso: string | null) => void; disabled?: boolean; required?: boolean }) {
  return (
    <FieldBox path={path} label={label} help={help} required={required}>
      <Input id={fieldId(path)} type="datetime-local" value={isoToLocal(value)} disabled={disabled} onChange={(e) => onChange(localToIso(e.target.value))} className="max-w-60" />
    </FieldBox>
  );
}

export function CheckRow({ id, checked, onChange, label, help, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: ReactNode; help?: ReactNode; disabled?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <label htmlFor={id} className={cn("min-w-0 flex-1 text-xs", disabled && "opacity-60")}>
        <span className="font-medium text-foreground">{label}</span>
        {help && <span className="block text-[11px] text-muted-foreground">{help}</span>}
      </label>
    </div>
  );
}

export function Pill({ children, onRemove, label, tone = "muted" }: { children: ReactNode; onRemove?: () => void; label?: string; tone?: "muted" | "bad" }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", tone === "bad" ? "border-rose-500/40 bg-rose-500/10" : "border-border/60 bg-muted/50")}>
      <span className="truncate">{children}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={label ?? "Remove"} className="rounded-full text-muted-foreground hover:text-foreground">
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

/** Radio-style card group (objective, conversion location...). Keyboard: arrow keys move between native radios. */
export function ChoiceCards<T extends string>({ name, value, onChange, options, disabled, cols = "sm:grid-cols-2 lg:grid-cols-3" }: { name: string; value: T | null; onChange: (v: T) => void; options: { value: T; label: string; description?: string; disabled?: boolean; reason?: string }[]; disabled?: boolean; cols?: string }) {
  return (
    <div role="radiogroup" className={cn("grid gap-2", cols)}>
      {options.map((o) => {
        const on = o.value === value;
        const off = disabled || o.disabled;
        return (
          <label key={o.value} className={cn("flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-xs transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring", on ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40", off && "cursor-not-allowed opacity-55")}>
            <input type="radio" name={name} value={o.value} checked={on} disabled={off} onChange={() => onChange(o.value)} className="mt-0.5 accent-[var(--primary)]" />
            <span className="min-w-0">
              <span className="block font-semibold text-foreground">{o.label}</span>
              {o.description && <span className="block text-[11px] text-muted-foreground">{o.description}</span>}
              {o.disabled && o.reason && <span className="block text-[11px] text-amber-800 dark:text-amber-300">{o.reason}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}
