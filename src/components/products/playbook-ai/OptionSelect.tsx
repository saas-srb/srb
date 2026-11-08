"use client";

import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export interface Option {
  value: string;
  label: string;
}

const NONE = "__none__";

/**
 * A Select that always shows the selected option's LABEL (not its raw value,
 * which for ids would be a UUID) — `items` lets the trigger resolve the label
 * before the popup has ever been opened. Empty string maps to the `none` option.
 */
export default function OptionSelect({
  value,
  onChange,
  options,
  noneLabel,
  placeholder,
  disabled,
  className,
  id,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  /** When set, adds a leading "no value" option with this label. */
  noneLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const all: Option[] = noneLabel ? [{ value: NONE, label: noneLabel }, ...options] : options;
  return (
    <Select items={all} value={value === "" && noneLabel ? NONE : value} onValueChange={(v) => onChange(!v || v === NONE ? "" : v)} disabled={disabled}>
      <SelectTrigger id={id} className={className ?? "w-full"} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {all.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
