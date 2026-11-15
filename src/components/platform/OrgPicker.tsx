"use client";

import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { filterByDepartment, type OrgKind, type OrgOption } from "@/lib/platform/organization/rules";

/**
 * The ONE picker for departments, teams and designations. Options always come from the organization
 * service (`loadOrgOptions` on the server, or `toOptions(kind, rows)` on rows the service returned);
 * a product never builds its own list. Teams and designations can be narrowed to a department.
 */
const NONE = "__none__";

export default function OrgPicker({
  kind,
  options,
  value,
  onChange,
  departmentId,
  allowNone = true,
  noneLabel = "None",
  placeholder,
  disabled,
  id,
  className,
}: {
  kind: OrgKind;
  options: OrgOption[];
  value: string | null | undefined;
  onChange: (value: string) => void;
  departmentId?: string | null;
  allowNone?: boolean;
  noneLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const shown = kind === "department" ? options : filterByDepartment(options, departmentId);
  const current = value && shown.some((o) => o.value === value) ? value : NONE;
  const fallback = placeholder ?? `Select ${kind}`;
  return (
    <Select value={current} onValueChange={(v) => onChange(!v || v === NONE ? "" : v)} disabled={disabled}>
      <SelectTrigger id={id} className={className ?? "w-full"}>
        <SelectValue placeholder={fallback}>{current === NONE ? (allowNone ? noneLabel : fallback) : shown.find((o) => o.value === current)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {shown.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
