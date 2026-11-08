"use client";

import { useLmsCan } from "@/components/products/dealflow-ai/LmsAccess";
import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
import { deleteSubmissionAction, deleteSubmissionInPlaceAction } from "./actions";

export default function DeleteButton({
  category,
  id,
  onDeleted,
}: {
  category: string;
  id: string;
  /** When provided (e.g. from the row Sheet), deletes in place instead of redirecting. */
  onDeleted?: () => void;
}) {
  const allowed = useLmsCan("DELETE_LEADS");
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      if (onDeleted) {
        const result = await deleteSubmissionInPlaceAction(category, id);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Submission deleted");
        onDeleted();
      } else {
        await deleteSubmissionAction(category, id);
      }
    });
  }

  if (!allowed) return null;

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button type="button" variant="destructive" size="sm" className="w-full">
            <Trash2 className="size-3.5" data-icon="inline-start" />
            Delete
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this submission?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the submission and its resume file, if any. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
