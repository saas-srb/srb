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
import type { Department, Designation } from "@/lib/platform/organization";
import {
  createDesignationAction,
  updateDesignationAction,
} from "./actions";

const LEVELS = ["Junior", "Mid", "Senior", "Lead", "Head", "Director"] as const;

interface DesignationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  designation: Designation | null;
  departments: Department[];
  onSuccess?: () => void;
}

export default function DesignationSheet({
  open,
  onOpenChange,
  designation,
  departments,
  onSuccess,
}: DesignationSheetProps) {
  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [level, setLevel] = useState("");
  const [errors, setErrors] = useState<{ title?: string; departmentId?: string }>({});
  const [pending, startTransition] = useTransition();

  const isEdit = Boolean(designation);

  useEffect(() => {
    if (designation) {
      setTitle(designation.title || "");
      setDepartmentId(designation.departmentId || "");
      setLevel(designation.level || "");
    } else {
      setTitle("");
      setDepartmentId(departments[0]?._id || "");
      setLevel("");
    }
    setErrors({});
  }, [designation, departments, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: { title?: string; departmentId?: string } = {};
    if (!title.trim()) {
      newErrors.title = "Designation title is required.";
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
      if (isEdit && designation) {
        const res = await updateDesignationAction(designation._id, {
          title: title.trim(),
          departmentId: departmentId.trim(),
          level: level.trim() || null,
        });
        if (!res.ok) {
          toast.error(res.error || "Failed to update designation.");
          return;
        }
        toast.success("Designation updated successfully.");
      } else {
        const res = await createDesignationAction({
          title: title.trim(),
          departmentId: departmentId.trim(),
          level: level.trim() || null,
        });
        if (!res.ok) {
          toast.error(res.error || "Failed to create designation.");
          return;
        }
        toast.success("Designation created successfully.");
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
              <SheetTitle>{isEdit ? "Edit Designation" : "Add Designation"}</SheetTitle>
              <SheetDescription>
                {isEdit
                  ? "Update job title and seniority level."
                  : "Define a job title and seniority level for your organization."}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="desig-title">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="desig-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Senior Software Engineer"
                  disabled={pending}
                />
                {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="desig-department">
                  Department <span className="text-destructive">*</span>
                </Label>
                <OrgPicker kind="department" options={toOptions("department", departments)} value={departmentId} onChange={setDepartmentId} allowNone={false} placeholder="Select a department" disabled={pending} />
                {errors.departmentId && (
                  <p className="text-xs text-destructive">{errors.departmentId}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="desig-level">Level</Label>
                <Select
                  value={level || "__none__"}
                  onValueChange={(val) => setLevel(val === "__none__" ? "" : (val ?? ""))}
                  disabled={pending}
                >
                  <SelectTrigger id="desig-level" className="w-full">
                    <SelectValue placeholder="Select a seniority level (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None / Unspecified</SelectItem>
                    {LEVELS.map((lvl) => (
                      <SelectItem key={lvl} value={lvl}>
                        {lvl}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                "Create designation"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
