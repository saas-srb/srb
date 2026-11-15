"use client";

import { filterByDepartment, type OrgKind, type OrgOption } from "@/lib/platform/organization/rules";

/**
 * Multi-select for departments, teams or designations (checkbox list). Same contract as `OrgPicker`:
 * options come from the organization service. `primaryFirst` marks the first selected item as the main one
 * (used for a person's main designation).
 */
export default function OrgMultiPicker({
  kind,
  options,
  value,
  onChange,
  departmentIds,
  label,
  emptyText,
  primaryFirst,
}: {
  kind: OrgKind;
  options: OrgOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Narrow teams and designations to these departments (none selected = show all). */
  departmentIds?: string[];
  label?: string;
  emptyText?: string;
  primaryFirst?: boolean;
}) {
  const shown =
    kind === "department" || !departmentIds || departmentIds.length === 0
      ? options
      : departmentIds.flatMap((d) => filterByDepartment(options, d)).filter((o, i, a) => a.findIndex((x) => x.value === o.value) === i);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="space-y-1.5" role="group" aria-label={label ?? kind}>
      {label && <p className="text-sm font-medium">{label}</p>}
      <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-xl border border-border/60 p-1">
        {shown.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">{emptyText ?? `No ${kind}s yet.`}</p>}
        {shown.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted">
            <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} className="accent-primary" />
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {primaryFirst && value[0] === o.value && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Main</span>}
          </label>
        ))}
      </div>
    </div>
  );
}
