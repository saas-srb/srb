"use client";

import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { CustomRoleView } from "@/lib/products/commandos/custom-roles-shared";

/** The company's designations as a checklist of extras (hidden when there are none). Server actions re-check what the actor may hand out. */
export default function CustomRolePicker({ roles, selected, onToggle, canManage }: { roles: CustomRoleView[]; selected: string[]; onToggle: (id: string) => void; canManage?: boolean }) {
  if (roles.length === 0) {
    return canManage ? (
      <p className="text-[11px] text-muted-foreground">
        No other designations yet. <Link href="/commandos/roles" className="font-medium text-primary underline">Add one</Link> to hand out a ready-made bundle of products and permissions.
      </p>
    ) : null;
  }
  return (
    <div className="space-y-2 rounded-xl border border-border/70 bg-card p-3">
      <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Additional designations</span>
        {selected.length > 0 && <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-primary">{selected.length} assigned</Badge>}
      </div>
      {roles.map((r) => (
        <label key={r.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 ${selected.includes(r.id) ? "border-primary/40 bg-primary/5" : "border-border/50 hover:bg-muted/30"}`}>
          <Checkbox checked={selected.includes(r.id)} onCheckedChange={() => onToggle(r.id)} className="mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-medium">{r.name}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">{r.description || `${r.baseRoles.length} product role(s), ${Object.keys(r.permissions).length} permission rule(s)`}</p>
          </div>
        </label>
      ))}
    </div>
  );
}
