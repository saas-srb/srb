"use client";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePanels } from "@/components/platform/PanelsProvider";
import { Badge } from "@/components/ui/badge";
import { ROLE_GROUPS } from "@/lib/products/commandos/role-catalog";
import type { CustomRoleView } from "@/lib/products/commandos/custom-roles-shared";

/** The designation list, grouped by part of the business. The Director is offered only to a Director. Shows which products the choice opens. */
export default function DesignationSelect({ value, onChange, designations, canMakeDirector, id }: { value: string; onChange: (v: string) => void; designations: CustomRoleView[]; canMakeDirector: boolean; id?: string }) {
  const panels = usePanels();
  const departments = [...new Set(designations.map((d) => d.department))].sort((a, b) => (a === "Custom" ? 1 : b === "Custom" ? -1 : a.localeCompare(b)));
  const current = value === "director" ? "Director" : designations.find((d) => d.id === value)?.name;
  const selected = value === "director" ? undefined : designations.find((d) => d.id === value);
  const opens = selected ? ROLE_GROUPS.filter((g) => g.roles.some((r) => selected.baseRoles.includes(r.value))).map((g) => panels[g.panel]?.name ?? g.module) : [];
  return (
    <div className="space-y-2">
      <Select value={value || undefined} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger id={id} className="h-10 w-full rounded-xl text-sm">
          <SelectValue placeholder="Choose a designation">{current}</SelectValue>
        </SelectTrigger>
        <SelectContent align="start" className="max-h-80">
          {canMakeDirector && (
            <SelectGroup>
              <SelectLabel>Leadership</SelectLabel>
              <SelectItem value="director">Director</SelectItem>
            </SelectGroup>
          )}
          {departments.map((dep) => (
            <SelectGroup key={dep}>
              <SelectSeparator />
              <SelectLabel>{dep === "Custom" ? "Your own designations" : dep}</SelectLabel>
              {designations.filter((d) => d.department === dep).sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {value === "director" && <p className="text-xs text-amber-700 dark:text-amber-300">A Director can see and change everything in the company, including other people&apos;s status and designations.</p>}
      {selected && <p className="text-xs text-muted-foreground">{selected.description || "Access follows this designation."}</p>}
      {opens.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Opens</span>
          {opens.map((n) => <Badge key={n} variant="secondary" className="text-[10px] font-normal">{n}</Badge>)}
        </div>
      )}
    </div>
  );
}
