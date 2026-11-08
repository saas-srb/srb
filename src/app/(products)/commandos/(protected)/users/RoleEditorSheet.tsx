"use client";

import { useState, useTransition, useMemo } from "react";
import { toast } from "sonner";
import { ShieldCheck, Search, Filter, CheckCircle2, ShieldAlert } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ROLE_GROUPS } from "@/lib/products/commandos/role-catalog";
import { usePanels } from "@/components/platform/PanelsProvider";
import type { CustomRoleView } from "@/lib/products/commandos/custom-roles-shared";
import CustomRolePicker from "./CustomRolePicker";
import { updateAdminUserRolesAction } from "./actions";

export default function RoleEditorSheet({
  userId,
  userEmail,
  initialRoles,
  customRoles,
  initialCustomRoleIds,
  currentAdminId,
  open,
  onOpenChange,
}: {
  userId: string | null;
  userEmail: string | null;
  /** The built-in roles set by hand (custom roles' own roles are not repeated here). */
  initialRoles: string[];
  customRoles: CustomRoleView[];
  initialCustomRoleIds: string[];
  currentAdminId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [roles, setRoles] = useState<string[]>(initialRoles);
  const [customIds, setCustomIds] = useState<string[]>(initialCustomRoleIds);
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  // Product names come from the Product Registry, like every other listing.
  const panels = usePanels();
  const [roleSearch, setRoleSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const isSelf = userId === currentAdminId;
  const superAdmin = roles.includes("super_admin");

  function toggle(role: string) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function handleSave() {
    if (!userId) return;
    startTransition(async () => {
      const result = await updateAdminUserRolesAction(userId, roles, customIds);
      if (!result.ok) toast.error(result.error ?? "Could not update roles.");
      else {
        toast.success("Roles updated successfully!");
        onOpenChange(false);
      }
    });
  }

  const filteredGroups = useMemo(() => {
    return ROLE_GROUPS.map((g) => {
      const matchesModule = moduleFilter === "all" || g.panel === moduleFilter;
      if (!matchesModule) return null;

      const filteredRoles = g.roles.filter((r) =>
        r.label.toLowerCase().includes(roleSearch.toLowerCase()) ||
        r.description.toLowerCase().includes(roleSearch.toLowerCase()) ||
        r.value.toLowerCase().includes(roleSearch.toLowerCase())
      );

      if (filteredRoles.length === 0) return null;

      return {
        ...g,
        roles: filteredRoles,
      };
    }).filter(Boolean);
  }, [moduleFilter, roleSearch]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        <SheetHeader className="p-5 border-b border-border bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <SheetTitle className="text-base font-semibold">{userEmail ?? "Manage Roles"}</SheetTitle>
              <SheetDescription className="text-xs">
                Grant or revoke role-based access across all {Object.keys(panels).length || 10} Platform Consoles.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Role Assignments</span>
            <Badge variant="secondary" className="text-[10px]">
              {roles.length} role{roles.length === 1 ? "" : "s"} selected
            </Badge>
          </div>

          <label
            className={`flex items-start gap-3 rounded-xl border p-3.5 transition-all cursor-pointer ${
              superAdmin
                ? "border-amber-500/50 bg-amber-500/10 shadow-sm"
                : "border-border/70 bg-card hover:border-primary/40"
            }`}
          >
            <Checkbox
              checked={superAdmin}
              onCheckedChange={() => toggle("super_admin")}
              disabled={isSelf && superAdmin}
              className="mt-0.5"
            />
            <div>
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ShieldAlert className="size-3.5 text-amber-500" />
                Director
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Full access to every module and Director Command Center.
                {isSelf && " (You cannot remove your own Director role)." }
              </p>
            </div>
          </label>

          {!superAdmin && (
            <CustomRolePicker roles={customRoles} selected={customIds} onToggle={(id) => setCustomIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))} canManage />
          )}

          {!superAdmin && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search roles..."
                    value={roleSearch}
                    onChange={(e) => setRoleSearch(e.target.value)}
                    className="pl-8 text-xs h-8 bg-card"
                  />
                </div>

                <Select value={moduleFilter} onValueChange={(val: string | null) => { if (val) setModuleFilter(val); }}>
                  <SelectTrigger className="w-36 text-xs h-8 bg-card">
                    <Filter className="size-3 mr-1 text-muted-foreground" />
                    <SelectValue placeholder="All Products" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="all">All Products</SelectItem>
                    {ROLE_GROUPS.map((g) => (
                      <SelectItem key={g.panel} value={g.panel}>
                        {panels[g.panel]?.name ?? g.module}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {filteredGroups.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground border rounded-xl bg-muted/10">
                    <p className="text-xs font-medium">No matching roles found</p>
                  </div>
                ) : (
                  filteredGroups.map((g) => {
                    if (!g) return null;
                    const countInGroup = g.roles.filter((r) => roles.includes(r.value)).length;

                    return (
                      <div key={g.module} className="rounded-xl border border-border/70 bg-card p-3 space-y-2">
                        <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                            {panels[g.panel]?.name ?? g.module}
                          </span>
                          {countInGroup > 0 && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-primary border-primary/30">
                              {countInGroup} assigned
                            </Badge>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          {g.roles.map((r) => {
                            const isChecked = roles.includes(r.value);
                            return (
                              <label
                                key={r.value}
                                className={`flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors cursor-pointer ${
                                  isChecked
                                    ? "border-primary/40 bg-primary/5"
                                    : "border-border/50 hover:bg-muted/30"
                                }`}
                              >
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() => toggle(r.value)}
                                  className="mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="text-xs font-medium text-foreground">{r.label}</p>
                                    {isChecked && <CheckCircle2 className="size-3 text-primary shrink-0" />}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground leading-snug">{r.description}</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="p-4 border-t border-border bg-card flex items-center justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending} className="h-8 text-xs">
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={isPending} className="h-8 text-xs">
            {isPending ? "Saving…" : "Save Role Assignments"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
