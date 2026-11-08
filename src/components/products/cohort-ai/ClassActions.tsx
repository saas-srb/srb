"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import ClassForm from "@/components/products/cohort-ai/ClassForm";
import { deleteClassAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/classes/actions";
import type { SerializedClassSchedule } from "@/lib/products/cohort-ai/classes";

export default function ClassActions({
  classItem,
  batches,
  mentors,
}: {
  classItem: SerializedClassSchedule;
  batches: { _id: string; name: string; programName?: string }[];
  mentors: { _id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteClassAction(classItem._id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete class.");
        return;
      }
      toast.success("Class deleted");
      router.push("/cohort-ai/classes");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <ClassForm
        classItem={classItem}
        batches={batches}
        mentors={mentors}
        trigger={
          <Button type="button" variant="outline" size="sm">
            <Pencil className="size-3.5" data-icon="inline-start" />
            Edit
          </Button>
        }
      />
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button type="button" variant="outline" size="sm" disabled={pending}>
              {pending ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Trash2 className="size-3.5" data-icon="inline-start" />}
              Delete
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this class?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{classItem.topic}&rdquo; and its attendance records are soft-deleted and kept for audit history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
