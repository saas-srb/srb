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
import BatchForm from "@/components/products/cohort-ai/BatchForm";
import { deleteBatchAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/batches/actions";
import type { SerializedBatch } from "@/lib/products/cohort-ai/batches";

export default function BatchActions({
  batch,
  programs,
  mentors,
}: {
  batch: SerializedBatch;
  programs: { _id: string; name: string }[];
  mentors: { _id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteBatchAction(batch._id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete batch.");
        return;
      }
      toast.success("Batch deleted");
      router.push("/cohort-ai/batches");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <BatchForm
        batch={batch}
        programs={programs}
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
            <AlertDialogTitle>Delete {batch.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This is blocked while any student is enrolled in this batch. Otherwise it is soft-deleted and kept for audit history.
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
