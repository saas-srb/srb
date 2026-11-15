"use client";

import OrgPicker from "@/components/platform/OrgPicker";
import { toOptions } from "@/lib/platform/organization/rules";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Department, Team } from "@/lib/platform/organization";
import { createTeamAction, updateTeamAction } from "./actions";

interface TeamSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: (Team & { memberCount?: number }) | null;
  departments: Department[];
  onSuccess?: () => void;
}

export default function TeamSheet({
  open,
  onOpenChange,
  team,
  departments,
  onSuccess,
}: TeamSheetProps) {
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [leadEmployeeId, setLeadEmployeeId] = useState("");
  const [errors, setErrors] = useState<{ name?: string; departmentId?: string }>({});
  const [pending, startTransition] = useTransition();

  const isEdit = Boolean(team);

  useEffect(() => {
    if (team) {
      setName(team.name || "");
      setDepartmentId(team.departmentId || "");
      setLeadEmployeeId(team.leadEmployeeId || "");
    } else {
      setName("");
      setDepartmentId(departments[0]?._id || "");
      setLeadEmployeeId("");
    }
    setErrors({});
  }, [team, departments, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: { name?: string; departmentId?: string } = {};
    if (!name.trim()) {
      newErrors.name = "Team name is required.";
    }
    if (!departmentId.trim()) {
      newErrors.departmentId = "Department is required.";
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    startTransition(async () => {
      if (isEdit && team) {
        const res = await updateTeamAction(team._id, {
          name: name.trim(),
          departmentId: departmentId.trim(),
          leadEmployeeId: leadEmployeeId.trim() || null,
        });
        if (!res.ok) {
          toast.error(res.error || "Failed to update team.");
          return;
        }
        toast.success("Team updated successfully.");
      } else {
        const res = await createTeamAction({
          name: name.trim(),
          departmentId: departmentId.trim(),
          leadEmployeeId: leadEmployeeId.trim() || null,
        });
        if (!res.ok) {
          toast.error(res.error || "Failed to create team.");
          return;
        }
        toast.success("Team created successfully.");
      }
      onOpenChange(false);
      onSuccess?.();
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <SheetContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex h-full flex-col justify-between">
          <div>
            <SheetHeader className="border-b border-border/60 pb-4">
              <SheetTitle>{isEdit ? "Edit Team" : "Add Team"}</SheetTitle>
              <SheetDescription>
                {isEdit
                  ? "Update team details and department assignment."
                  : "Create a new team within a department."}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="team-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="team-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Frontend Core"
                  disabled={pending}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="team-department">
                  Department <span className="text-destructive">*</span>
                </Label>
                <OrgPicker kind="department" options={toOptions("department", departments)} value={departmentId} onChange={setDepartmentId} allowNone={false} placeholder="Select a department" disabled={pending} />
                {errors.departmentId && (
                  <p className="text-xs text-destructive">{errors.departmentId}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="team-lead">Lead Employee</Label>
                <Input
                  id="team-lead"
                  value={leadEmployeeId}
                  onChange={(e) => setLeadEmployeeId(e.target.value)}
                  placeholder="Lead name or identifier"
                  disabled={pending}
                />
              </div>
            </div>
          </div>

          <SheetFooter className="border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving...
                </>
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Create team"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
