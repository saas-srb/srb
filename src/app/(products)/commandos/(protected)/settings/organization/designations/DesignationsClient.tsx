"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, Award } from "lucide-react";
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
import type { Department, Designation } from "@/lib/platform/organization";
import DesignationSheet from "./DesignationSheet";
import { deleteDesignationAction } from "./actions";

export interface DesignationWithDetails extends Designation {
  departmentName: string;
}

interface DesignationsClientProps {
  designations: DesignationWithDetails[];
  departments: Department[];
}

export default function DesignationsClient({
  designations,
  departments,
}: DesignationsClientProps) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingDesig, setEditingDesig] = useState<DesignationWithDetails | null>(null);
  const [deletingDesig, setDeletingDesig] = useState<DesignationWithDetails | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    setEditingDesig(null);
    setSheetOpen(true);
  }

  function handleEdit(desig: DesignationWithDetails) {
    setEditingDesig(desig);
    setSheetOpen(true);
  }

  function handleDeleteClick(desig: DesignationWithDetails) {
    setDeletingDesig(desig);
  }

  function handleDeleteConfirm() {
    if (!deletingDesig) return;
    startTransition(async () => {
      const res = await deleteDesignationAction(deletingDesig._id);
      if (!res.ok) {
        toast.error(res.error || "Failed to delete designation.");
        return;
      }
      toast.success("Designation deleted.");
      setDeletingDesig(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            All Designations
          </h2>
          <p className="text-sm text-muted-foreground">
            {designations.length} designation{designations.length === 1 ? "" : "s"} configured
            across {departments.length} department{departments.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 size-4" />
          Add Designation
        </Button>
      </div>

      <GlassCard interactive={false}>
        <CardContent className="p-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Level</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {designations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                    <Award className="mx-auto mb-2 size-6 opacity-40" />
                    No designations found. Click &quot;Add Designation&quot; to create one.
                  </TableCell>
                </TableRow>
              ) : (
                designations.map((desig) => (
                  <TableRow key={desig._id}>
                    <TableCell className="font-medium text-foreground">
                      {desig.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {desig.departmentName}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {desig.level ? (
                        <Badge variant="secondary" className="text-xs font-normal">
                          {desig.level}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleEdit(desig)}
                          title={`Edit ${desig.title}`}
                          disabled={pending}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDeleteClick(desig)}
                          title={`Delete ${desig.title}`}
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

      <DesignationSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        designation={editingDesig}
        departments={departments}
        onSuccess={() => router.refresh()}
      />

      <AlertDialog
        open={Boolean(deletingDesig)}
        onOpenChange={(o) => !pending && !o && setDeletingDesig(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletingDesig?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this designation? This action will soft-delete the
              designation if no employees currently hold it.
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
