"use client";

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
import { Textarea } from "@/components/ui/textarea";
import type { DepartmentWithCounts } from "@/lib/platform/organization";
import {
  createDepartmentAction,
  updateDepartmentAction,
} from "./actions";

interface DepartmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: DepartmentWithCounts | null;
  onSuccess?: () => void;
}

export default function DepartmentSheet({
  open,
  onOpenChange,
  department,
  onSuccess,
}: DepartmentSheetProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ name?: string; code?: string }>({});
  const [pending, startTransition] = useTransition();

  const isEdit = Boolean(department);

  useEffect(() => {
    if (department) {
      setName(department.name || "");
      setCode(department.code || "");
      setDescription(department.description || "");
    } else {
      setName("");
      setCode("");
      setDescription("");
    }
    setErrors({});
  }, [department, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: { name?: string; code?: string } = {};
    if (!name.trim()) {
      newErrors.name = "Department name is required.";
    }
    if (!code.trim()) {
      newErrors.code = "Department code is required.";
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    startTransition(async () => {
      if (isEdit && department) {
        const res = await updateDepartmentAction(department._id, {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          description: description.trim() || null,
        });
        if (!res.ok) {
          toast.error(res.error || "Failed to update department.");
          return;
        }
        toast.success("Department updated successfully.");
      } else {
        const res = await createDepartmentAction({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          description: description.trim() || null,
        });
        if (!res.ok) {
          toast.error(res.error || "Failed to create department.");
          return;
        }
        toast.success("Department created successfully.");
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
              <SheetTitle>{isEdit ? "Edit Department" : "Add Department"}</SheetTitle>
              <SheetDescription>
                {isEdit
                  ? "Update department details and division code."
                  : "Create a new department in your organization structure."}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="dept-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="dept-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Engineering"
                  disabled={pending}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dept-code">
                  Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="dept-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ENG"
                  className="font-mono uppercase"
                  disabled={pending}
                />
                {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dept-description">Description</Label>
                <Textarea
                  id="dept-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional brief overview of this department"
                  rows={3}
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
                "Create department"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
