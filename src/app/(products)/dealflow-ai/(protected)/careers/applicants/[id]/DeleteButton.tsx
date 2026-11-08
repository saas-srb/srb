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
import { deleteApplicationAction, deleteApplicationInPlaceAction } from "../../actions";

export default function DeleteButton({
  id,
  onDeleted,
}: {
  id: string;
  /** When provided (e.g. from the row Sheet), deletes in place instead of redirecting. */
  onDeleted?: () => void;
}) {
  const allowed = useLmsCan("MANAGE_CAREERS");
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      if (onDeleted) {
        const result = await deleteApplicationInPlaceAction(id);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Application deleted");
        onDeleted();
      } else {
        await deleteApplicationAction(id);
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
          <AlertDialogTitle>Delete this application?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the application and its resume file. This cannot be undone.
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
