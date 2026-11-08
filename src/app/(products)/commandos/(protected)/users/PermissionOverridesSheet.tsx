"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PERMISSION_GROUPS } from "@/lib/products/commandos/permission-catalog";
import { updateAdminUserPermissionOverridesAction } from "./actions";

type OverrideState = "default" | "allow" | "deny";

/** Static value→label map so `<Select.Value>` shows the label immediately,
 * instead of the raw state value, before the popup has ever been opened. */
const OVERRIDE_STATE_ITEMS = { default: "Default", allow: "Always Allow", deny: "Always Deny" };

function toState(value: boolean | undefined): OverrideState {
  if (value === true) return "allow";
  if (value === false) return "deny";
  return "default";
}

function toOverrides(state: Record<string, OverrideState>): Record<string, boolean> {
  const overrides: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(state)) {
    if (value === "allow") overrides[key] = true;
    else if (value === "deny") overrides[key] = false;
  }
  return overrides;
}

export default function PermissionOverridesSheet({
  userId,
  userEmail,
  userRoles,
  initialOverrides,
  hasCustomRoles,
  open,
  onOpenChange,
}: {
  userId: string | null;
  userEmail: string | null;
  userRoles: string[];
  /** The rules set by hand — rules that come from custom roles are not repeated here. */
  initialOverrides: Record<string, boolean>;
  hasCustomRoles?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, setState] = useState<Record<string, OverrideState>>(() => {
    const initial: Record<string, OverrideState> = {};
    for (const g of PERMISSION_GROUPS) {
      for (const p of g.permissions) initial[p.key] = toState(initialOverrides[p.key]);
    }
    return initial;
  });
  const [isPending, startTransition] = useTransition();

  const isSuperAdmin = userRoles.includes("super_admin");

  function handleSave() {
    if (!userId) return;
    startTransition(async () => {
      const result = await updateAdminUserPermissionOverridesAction(userId, toOverrides(state));
      if (!result.ok) toast.error(result.error ?? "Could not update permissions.");
      else {
        toast.success("Permissions updated");
        onOpenChange(false);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{userEmail ?? "Permissions"}</SheetTitle>
          <SheetDescription>
            Fine-tune individual capabilities on top of this account&apos;s roles. Only takes effect for
            capabilities within modules the account already has role-based access to.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 overflow-y-auto px-4 pb-4">
          {hasCustomRoles && (
            <p className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs text-muted-foreground">
              This person also holds custom roles that carry permission rules. A rule you set here wins over theirs; anything left on “Default” follows the roles.
            </p>
          )}
          {isSuperAdmin && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p className="text-xs">
                This account is Director — overrides never apply, since Director already bypasses every
                capability check.
              </p>
            </div>
          )}

          {PERMISSION_GROUPS.map((g) => (
            <div key={g.module}>
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.module}</p>
              <div className="space-y-1.5">
                {g.permissions.map((p) => (
                  <div key={p.key} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{p.label}</p>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    </div>
                    <Select
                      items={OVERRIDE_STATE_ITEMS}
                      value={state[p.key] ?? "default"}
                      onValueChange={(v: string | null) => {
                        if (!v) return;
                        setState((prev) => ({ ...prev, [p.key]: v as OverrideState }));
                      }}
                    >
                      <SelectTrigger size="sm" className="w-32 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="allow">Always Allow</SelectItem>
                        <SelectItem value="deny">Always Deny</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save permissions"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
