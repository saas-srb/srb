"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { DepartmentWithCounts } from "@/lib/platform/organization";
import DepartmentSheet from "./DepartmentSheet";
import { deleteDepartmentAction } from "./actions";

interface DepartmentsClientProps {
  departments: DepartmentWithCounts[];
}

export default function DepartmentsClient({ departments }: DepartmentsClientProps) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentWithCounts | null>(null);
  const [deletingDept, setDeletingDept] = useState<DepartmentWithCounts | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    setEditingDept(null);
    setSheetOpen(true);
  }

  function handleEdit(dept: DepartmentWithCounts) {
    setEditingDept(dept);
    setSheetOpen(true);
  }

  function handleDeleteClick(dept: DepartmentWithCounts) {
    if (dept.employeeCount > 0) {
      toast.error(`Cannot delete: ${dept.employeeCount} employee(s) are still assigned to this department.`);
      return;
    }
    if (dept.designationCount > 0) {
      toast.error(`Cannot delete: ${dept.designationCount} designation(s) belong to this department.`);
      return;
    }
    if (dept.teamCount > 0) {
      toast.error(`Cannot delete: ${dept.teamCount} team(s) belong to this department.`);
      return;
    }
    setDeletingDept(dept);
  }

  function handleDeleteConfirm() {
    if (!deletingDept) return;
    startTransition(async () => {
      const res = await deleteDepartmentAction(deletingDept._id);
      if (!res.ok) {
        toast.error(res.error || "Failed to delete department.");
        return;
      }
      toast.success("Department deleted.");
      setDeletingDept(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">All Departments</h2>
          <p className="text-sm text-muted-foreground">
            {departments.length} department{departments.length === 1 ? "" : "s"} configured
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 size-4" />
          Add Department
        </Button>
      </div>

      <GlassCard interactive={false}>
        <CardContent className="p-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Employees</TableHead>
                <TableHead className="text-center">Designations</TableHead>
                <TableHead className="text-center">Teams</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <Building2 className="mx-auto mb-2 size-6 opacity-40" />
                    No departments found. Click &quot;Add Department&quot; to create one.
                  </TableCell>
                </TableRow>
              ) : (
                departments.map((dept) => (
                  <TableRow key={dept._id}>
                    <TableCell className="font-medium text-foreground">{dept.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {dept.code}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {dept.description || "—"}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      <span className="tabular-nums">{dept.employeeCount}</span>
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      <span className="tabular-nums">{dept.designationCount}</span>
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      <span className="tabular-nums">{dept.teamCount}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleEdit(dept)}
                          title={`Edit ${dept.name}`}
                          disabled={pending}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDeleteClick(dept)}
                          title={`Delete ${dept.name}`}
                          disabled={pending}
                          className="hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      <DepartmentSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        department={editingDept}
        onSuccess={() => router.refresh()}
      />

      <AlertDialog open={Boolean(deletingDept)} onOpenChange={(o) => !pending && !o && setDeletingDept(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletingDept?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this department? This action will soft-delete the department if no employees, designations, or teams are associated with it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={pending}
            >
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
